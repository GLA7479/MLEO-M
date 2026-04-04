export function getLegacyVaultDeviceId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("vault_device_id");
  } catch {
    return null;
  }
}

let csrfTokenCache = null;
/** Single in-flight CSRF fetch so Set-Cookie and cached header value stay aligned (parallel GET /api/csrf-token races caused 403 on POST). */
let csrfFetchPromise = null;
let deviceInitCache = { initialized: false, timestamp: 0 };
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 דקות
let ensureDevicePromise = null; // Promise lock למניעת קריאות מקבילות

/** Never reject — callers (vaultAdapter) must not hit unhandledrejection → Next dev overlay. */
function settleDeviceInitResult(p) {
  return Promise.resolve(p).then(
    r =>
      r && typeof r === "object" && "success" in r
        ? r
        : { success: Boolean(r), status: 0, message: "Unexpected device init result" },
    e => ({
      success: false,
      status: 0,
      message: e?.message || String(e || "Arcade device init failed"),
    }),
  );
}

export function clearCsrfTokenCache() {
  csrfTokenCache = null;
}

export async function ensureCsrfToken(forceRefresh = false) {
  if (typeof window === "undefined") return null;
  if (!forceRefresh && csrfTokenCache) return csrfTokenCache;

  while (csrfFetchPromise) {
    await csrfFetchPromise;
    if (!forceRefresh && csrfTokenCache) return csrfTokenCache;
  }

  if (!forceRefresh && csrfTokenCache) return csrfTokenCache;

  csrfFetchPromise = (async () => {
    try {
      const response = await fetch("/api/csrf-token", {
        method: "GET",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (payload?.success && payload?.token) {
        csrfTokenCache = payload.token;
        return csrfTokenCache;
      }
      return null;
    } catch (error) {
      console.warn("Failed to get CSRF token:", error);
      return null;
    } finally {
      csrfFetchPromise = null;
    }
  })();

  return csrfFetchPromise;
}

export async function ensureArcadeDeviceCookie() {
  if (typeof window === "undefined") {
    return { success: true, skipped: true };
  }

  // אם יש init בתהליך, החזר את אותו promise
  if (ensureDevicePromise) {
    return settleDeviceInitResult(ensureDevicePromise);
  }

  // בדיקה אם כבר יש device cookie תקף (cache)
  const now = Date.now();
  if (deviceInitCache.initialized && (now - deviceInitCache.timestamp) < CACHE_DURATION_MS) {
    return { success: true };
  }

  // יצירת promise משותף למניעת קריאות מקבילות
  ensureDevicePromise = (async () => {
    try {
      // נסה קודם GET לבדוק אם כבר יש device
      try {
        const checkResponse = await fetch("/api/arcade/device", {
          method: "GET",
          credentials: "include",
        });
        if (checkResponse.ok) {
          deviceInitCache = { initialized: true, timestamp: now };
          return { success: true };
        }
      } catch {
        // אם GET נכשל, נמשיך ל-POST
      }

      // אם אין device, נסה ליצור אחד
      const legacyDeviceId = getLegacyVaultDeviceId();
      let csrfToken = await ensureCsrfToken();

      let response = await fetch("/api/arcade/device", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          legacyDeviceId: legacyDeviceId || null,
        }),
      });

      // אם יש 403, נסה לרענן CSRF ולנסות שוב
      if (response.status === 403) {
        clearCsrfTokenCache();
        csrfToken = await ensureCsrfToken(true);
        
        response = await fetch("/api/arcade/device", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          body: JSON.stringify({
            legacyDeviceId: legacyDeviceId || null,
          }),
        });
      }

      if (!response.ok) {
        const isRetryable = response.status >= 500 && response.status <= 504;
        if (isRetryable) {
          await new Promise(r => setTimeout(r, 250));
          clearCsrfTokenCache();
          const csrf2 = await ensureCsrfToken(true);
          response = await fetch("/api/arcade/device", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(csrf2 ? { "x-csrf-token": csrf2 } : {}),
            },
            body: JSON.stringify({
              legacyDeviceId: legacyDeviceId || null,
            }),
          });
        }
        if (!response.ok) {
          const failPayload = await response.json().catch(() => ({}));
          console.warn("[arcadeDeviceClient] Device init failed", {
            status: response.status,
            payload: failPayload,
          });
          return {
            success: false,
            status: response.status,
            message: failPayload?.message || "Failed to initialize arcade device",
            ...failPayload,
          };
        }
      }

      deviceInitCache = { initialized: true, timestamp: now };
      const payload = await response.json().catch(() => ({}));
      return {
        success: true,
        hasDevice: payload?.hasDevice !== false && payload?.success !== false,
      };
    } catch (error) {
      return {
        success: false,
        status: 0,
        message: error?.message || "Failed to initialize arcade device",
      };
    } finally {
      // נקה את ה-promise בסיום
      ensureDevicePromise = null;
    }
  })();

  return settleDeviceInitResult(ensureDevicePromise);
}
