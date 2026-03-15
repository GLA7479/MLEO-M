export function getLegacyVaultDeviceId() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("vault_device_id");
  } catch {
    return null;
  }
}

let csrfTokenCache = null;

export async function ensureCsrfToken() {
  if (csrfTokenCache) return csrfTokenCache;
  if (typeof window === "undefined") return null;
  
  try {
    const response = await fetch("/api/csrf-token", {
      method: "GET",
      credentials: "include",
    });
    const payload = await response.json().catch(() => ({}));
    if (payload?.success && payload?.token) {
      csrfTokenCache = payload.token;
      return payload.token;
    }
  } catch (error) {
    console.warn("Failed to get CSRF token:", error);
  }
  return null;
}

export async function ensureArcadeDeviceCookie() {
  const legacyDeviceId = getLegacyVaultDeviceId();
  const response = await fetch("/api/arcade/device", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      legacyDeviceId: legacyDeviceId || null,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to initialize arcade device");
  }

  return response.json().catch(() => ({ success: true }));
}
