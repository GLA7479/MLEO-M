/**
 * Solo V2 gift balance (client-held until server ledger exists).
 * Independent of legacy arcade session/helpers.
 */

export const SOLO_V2_GIFT_MAX = 5;
export const SOLO_V2_GIFT_REGEN_MS = 60 * 60 * 1000;
export const SOLO_V2_GIFT_ROUND_STAKE = 25;

const STORAGE_KEY = "solo_v2_gift_shell_v1";

function loadRaw() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

function saveRaw(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/** Apply hourly accrual (max SOLO_V2_GIFT_MAX). Returns { count, nextGiftAt }. */
export function soloV2GiftSyncAndRead() {
  if (typeof window === "undefined") {
    return { count: 0, nextGiftAt: null };
  }
  const now = Date.now();
  let raw = loadRaw();
  if (!raw || typeof raw.count !== "number") {
    raw = { count: 0, nextGiftAt: now + SOLO_V2_GIFT_REGEN_MS };
    saveRaw(raw);
  }
  let count = Math.max(0, Math.min(SOLO_V2_GIFT_MAX, Math.floor(raw.count)));
  let next = Number(raw.nextGiftAt) || now + SOLO_V2_GIFT_REGEN_MS;

  while (count < SOLO_V2_GIFT_MAX && now >= next) {
    count += 1;
    next += SOLO_V2_GIFT_REGEN_MS;
  }

  if (count !== raw.count || next !== raw.nextGiftAt) {
    saveRaw({ count, nextGiftAt: next });
  }
  return { count, nextGiftAt: count >= SOLO_V2_GIFT_MAX ? null : next };
}

/** Spend one gift after server accepted a new freeplay session. Returns false if none available. */
export function soloV2GiftConsumeOne() {
  if (typeof window === "undefined") return false;
  soloV2GiftSyncAndRead();
  const raw = loadRaw();
  if (!raw) return false;
  const count = Math.max(0, Math.min(SOLO_V2_GIFT_MAX, Math.floor(raw.count)));
  if (count < 1) return false;
  saveRaw({ count: count - 1, nextGiftAt: raw.nextGiftAt });
  return true;
}
