import { ensureArcadeDeviceCookie, ensureCsrfToken } from "./arcadeDeviceClient";

let flushTimer = null;
let stageCounts = Object.create(null);
let offlineSeen = false;
let inflightFlush = null;
let onStateSync = null;
let csrfTokenCache = null;
const MAX_RETRY_ATTEMPTS = 3; // מקסימום ניסיונות retry

async function apiFetch(path, body) {
  await ensureArcadeDeviceCookie();
  let csrfToken = csrfTokenCache || await ensureCsrfToken();
  if (!csrfToken) {
    csrfToken = await ensureCsrfToken();
  }
  csrfTokenCache = csrfToken;
  
  const headers = { "Content-Type": "application/json" };
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }
  const response = await fetch(path, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  
  // If CSRF token is invalid, refresh it and retry once
  if (response.status === 403 && payload?.message?.includes("CSRF")) {
    csrfTokenCache = null;
    const newToken = await ensureCsrfToken();
    if (newToken && newToken !== csrfToken) {
      csrfTokenCache = newToken;
      headers["x-csrf-token"] = newToken;
      const retryResponse = await fetch(path, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(body || {}),
      });
      const retryPayload = await retryResponse.json().catch(() => ({}));
      if (!retryResponse.ok) {
        const error = new Error(retryPayload?.message || "Miners API request failed");
        error.status = retryResponse.status;
        throw error;
      }
      return retryPayload;
    }
  }
  
  if (!response.ok) {
    const error = new Error(payload?.message || "Miners API request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function fetchMinersState() {
  await ensureArcadeDeviceCookie();
  const response = await fetch("/api/miners/state", {
    method: "GET",
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Failed to fetch miners state");
  }
  return payload;
}

function scheduleFlush(delayMs = 700) {
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushMinerBreakAccrual().catch((err) => {
      console.error("[minersEconomyClient] Scheduled flush failed", err);
    });
  }, delayMs);
}

export function registerMinersStateSync(listener) {
  onStateSync = typeof listener === "function" ? listener : null;
}

export function queueMinerBreakAccrual(stage, count = 1, offline = false) {
  const s = Math.max(1, Math.floor(Number(stage) || 1));
  const c = Math.max(1, Math.floor(Number(count) || 1));
  stageCounts[String(s)] = (stageCounts[String(s)] || 0) + c;
  if (offline) offlineSeen = true;
  if (typeof window !== "undefined") {
    scheduleFlush();
  }
}

export async function flushMinerBreakAccrual() {
  if (inflightFlush) return inflightFlush;
  
  // צור העתק של stageCounts כדי למנוע race conditions
  const payloadCounts = { ...stageCounts };
  const hasAny = Object.keys(payloadCounts).length > 0;
  if (!hasAny) return null;

  // אל תמחק את stageCounts עד שהקריאה מצליחה!
  const payloadOffline = offlineSeen;

  // בדיקה נוספת לפני השליחה - וודא שיש נתונים תקינים
  // וודא שכל הערכים הם מספרים תקינים (ללא מגבלת stage עליונה)
  const finalPayloadCounts = {};
  for (const [stage, count] of Object.entries(payloadCounts)) {
    const stageNum = Math.floor(Number(stage) || 0);
    const countNum = Math.floor(Number(count) || 0);
    // הסרת מגבלת stage עליונה - רק sanity check בסיסי
    if (stageNum >= 1 && countNum > 0) {
      finalPayloadCounts[String(stageNum)] = countNum;
    }
  }
  
  const finalHasAny = Object.keys(finalPayloadCounts).length > 0;
  if (!finalHasAny) {
    // אם אין נתונים תקינים, אין צורך לשלוח
    // נקה את stageCounts כי הנתונים לא היו תקינים
    for (const stage of Object.keys(payloadCounts)) {
      delete stageCounts[stage];
    }
    return null;
  }

  // הסר את הערכים שנשלחו מ-stageCounts לפני הקריאה
  // אם הקריאה תצליח - הם כבר לא יהיו שם
  // אם הקריאה תכשל - נחזיר אותם
  for (const stage of Object.keys(finalPayloadCounts)) {
    const sentCount = finalPayloadCounts[stage] || 0;
    if (stageCounts[stage] !== undefined) {
      const remaining = stageCounts[stage] - sentCount;
      if (remaining > 0) {
        stageCounts[stage] = remaining;
      } else {
        delete stageCounts[stage];
      }
    }
  }

  inflightFlush = (async () => {
    try {
      const payload = await apiFetch("/api/miners/accrue", {
        stageCounts: finalPayloadCounts,
        offline: payloadOffline,
      });
      
      // אם הקריאה הצליחה - הערכים כבר הוסרו, אז אין צורך לעשות כלום
      // אם הקריאה לא הצליחה - נחזיר את הערכים
      if (payload?.success && payloadOffline) {
        offlineSeen = false;
      }
      
      if (payload?.success && onStateSync) {
        try {
          onStateSync({
            balance: Number(payload.balance || 0),
            minedToday: Number(payload.minedToday || 0),
            dailyCap: Number(payload.dailyCap || 0),
            softcutFactor: Number(payload.softcutFactor || 1),
          });
        } catch (err) {
          console.error("[minersEconomyClient] onStateSync callback failed", err);
        }
      } else if (!payload?.success) {
        console.warn("[minersEconomyClient] Accrue API returned success=false", payload);
        // אם הקריאה לא הצליחה - החזר את הערכים שנשלחו ל-stageCounts
        for (const [stage, count] of Object.entries(finalPayloadCounts)) {
          stageCounts[String(stage)] = (stageCounts[String(stage)] || 0) + count;
        }
        if (payloadOffline) {
          offlineSeen = true;
        }
      }
      return payload;
    } catch (error) {
      // אם הקריאה נכשלה - החזר את הערכים שנשלחו ל-stageCounts
      // אבל רק אם stageCounts לא מכיל ערכים חדשים שנוספו במהלך הקריאה
      for (const [stage, count] of Object.entries(finalPayloadCounts)) {
        stageCounts[String(stage)] = (stageCounts[String(stage)] || 0) + count;
      }
      if (payloadOffline) {
        offlineSeen = true;
      }
      console.error("[minersEconomyClient] flushMinerBreakAccrual failed", error);
      throw error; // זרוק את השגיאה כדי שהקוראים יוכלו לטפל בה
    } finally {
      inflightFlush = null;
    }
  })();

  return inflightFlush;
}

export async function claimMinerBalanceToVault(amount = null) {
  return apiFetch("/api/miners/claim/to-vault", {
    amount: amount == null ? null : Math.max(0, Math.floor(Number(amount) || 0)),
  });
}

export async function claimMinerToWallet(amount) {
  return apiFetch("/api/miners/claim/to-wallet", {
    amount: Math.max(0, Math.floor(Number(amount) || 0)),
  });
}

export async function claimMinerHourlyGift() {
  return apiFetch("/api/miners/gift/claim", {});
}
