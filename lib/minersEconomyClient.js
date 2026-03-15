import { ensureArcadeDeviceCookie, ensureCsrfToken } from "./arcadeDeviceClient";

let flushTimer = null;
let stageCounts = Object.create(null);
let offlineSeen = false;
let inflightFlush = null;
let onStateSync = null;
let csrfTokenCache = null;
const MAX_RETRY_ATTEMPTS = 3; // מקסימום ניסיונות retry

// Multi-tab guard
const TAB_LOCK_KEY = "mleo_miners_tab_lock";
const TAB_ID = typeof window !== "undefined" ? `${Date.now()}_${Math.random().toString(36).slice(2)}` : null;
let tabLockInterval = null;
let isLeadingTab = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function acquireTabLock() {
  if (typeof window === "undefined" || !TAB_ID) return false;
  try {
    const currentLock = localStorage.getItem(TAB_LOCK_KEY);
    const lockData = currentLock ? JSON.parse(currentLock) : null;
    const now = Date.now();
    
    // If no lock exists or lock expired (2 seconds), acquire it
    if (!lockData || now - lockData.timestamp > 2000) {
      localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({
        tabId: TAB_ID,
        timestamp: now,
      }));
      return true;
    }
    
    // If lock belongs to this tab, refresh it
    if (lockData.tabId === TAB_ID) {
      localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({
        tabId: TAB_ID,
        timestamp: now,
      }));
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

function startTabLockHeartbeat() {
  if (typeof window === "undefined" || tabLockInterval) return;
  
  tabLockInterval = setInterval(() => {
    const acquired = acquireTabLock();
    if (acquired && !isLeadingTab) {
      isLeadingTab = true;
    } else if (!acquired && isLeadingTab) {
      isLeadingTab = false;
    }
  }, 2000);
  
  // Initial check
  isLeadingTab = acquireTabLock();
}

function stopTabLockHeartbeat() {
  if (tabLockInterval) {
    clearInterval(tabLockInterval);
    tabLockInterval = null;
  }
  isLeadingTab = false;
}

// Start heartbeat when module loads (if in browser)
if (typeof window !== "undefined") {
  startTabLockHeartbeat();
  
  // Cleanup on page unload
  if (typeof window.addEventListener !== "undefined") {
    window.addEventListener("beforeunload", stopTabLockHeartbeat);
  }
}

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
  // Only schedule flush if this is the leading tab
  if (!isLeadingTab) return;
  
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    // Double-check we're still the leading tab before flushing
    if (isLeadingTab) {
      flushMinerBreakAccrual().catch((err) => {
        console.error("[minersEconomyClient] Scheduled flush failed", err);
      });
    }
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
  // Only flush if this is the leading tab
  if (!isLeadingTab) return null;
  
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
    let lastError = null;
    
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Double-check we're still the leading tab
        if (!isLeadingTab) {
          // Restore counts if we lost the lock
          for (const [stage, count] of Object.entries(finalPayloadCounts)) {
            stageCounts[String(stage)] = (stageCounts[String(stage)] || 0) + count;
          }
          if (payloadOffline) {
            offlineSeen = true;
          }
          return null;
        }
        
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
        lastError = error;
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await delay(300 * attempt);
          continue;
        }
        // אם הקריאה נכשלה אחרי כל הניסיונות - החזר את הערכים שנשלחו ל-stageCounts
        for (const [stage, count] of Object.entries(finalPayloadCounts)) {
          stageCounts[String(stage)] = (stageCounts[String(stage)] || 0) + count;
        }
        if (payloadOffline) {
          offlineSeen = true;
        }
        console.error("[minersEconomyClient] flushMinerBreakAccrual failed after retries", error);
        throw error; // זרוק את השגיאה כדי שהקוראים יוכלו לטפל בה
      }
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
