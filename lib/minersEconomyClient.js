import { ensureArcadeDeviceCookie } from "./arcadeDeviceClient";

let flushTimer = null;
let stageCounts = Object.create(null);
let offlineSeen = false;
let inflightFlush = null;
let onStateSync = null;

async function apiFetch(path, body) {
  await ensureArcadeDeviceCookie();
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
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
    flushMinerBreakAccrual().catch(() => {});
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
  const payloadCounts = stageCounts;
  const hasAny = Object.keys(payloadCounts).length > 0;
  if (!hasAny) return null;

  stageCounts = Object.create(null);
  const payloadOffline = offlineSeen;
  offlineSeen = false;

  inflightFlush = (async () => {
    try {
      const payload = await apiFetch("/api/miners/accrue", {
        stageCounts: payloadCounts,
        offline: payloadOffline,
      });
      if (payload?.success && onStateSync) {
        try {
          onStateSync({
            balance: Number(payload.balance || 0),
            minedToday: Number(payload.minedToday || 0),
            dailyCap: Number(payload.dailyCap || 0),
            softcutFactor: Number(payload.softcutFactor || 1),
          });
        } catch {
          // ignore listener failures
        }
      }
      return payload;
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
