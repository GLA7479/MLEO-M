/**
 * Solo V2 gift balance (client-held until server ledger exists).
 * v2: correct cap pause, 1h accrual only below cap, fresh 1h timer when opening a slot at max (5→4).
 */

export const SOLO_V2_GIFT_MAX = 5;
export const SOLO_V2_GIFT_REGEN_MS = 60 * 60 * 1000;
export const SOLO_V2_GIFT_ROUND_STAKE = 25;

export const SOLO_V2_GIFT_STORAGE_KEY = "solo_v2_gift_shell_v2";
export const SOLO_V2_GIFT_STORAGE_LEGACY_KEY = "solo_v2_gift_shell_v1";
export const SOLO_V2_GIFT_STORAGE_EVENT = "solo_v2_gift_storage_updated";

function notifyGiftStorageChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(SOLO_V2_GIFT_STORAGE_EVENT));
  } catch {
    // ignore
  }
}

function loadRaw() {
  if (typeof window === "undefined") return null;
  try {
    const v2 = window.localStorage.getItem(SOLO_V2_GIFT_STORAGE_KEY);
    if (v2) {
      try {
        const o = JSON.parse(v2);
        if (o && typeof o === "object") return o;
      } catch {
        // corrupt v2 — try legacy or re-seed via sync
      }
    }
    const legacy = window.localStorage.getItem(SOLO_V2_GIFT_STORAGE_LEGACY_KEY);
    if (legacy) {
      const o = JSON.parse(legacy);
      if (!o || typeof o !== "object") return null;
      const now = Date.now();
      let count = Math.max(0, Math.min(SOLO_V2_GIFT_MAX, Math.floor(Number(o.count) || 0)));
      let nextGiftAt = null;
      if (count >= SOLO_V2_GIFT_MAX) {
        nextGiftAt = null;
      } else {
        const n = o.nextGiftAt != null ? Number(o.nextGiftAt) : NaN;
        nextGiftAt = Number.isFinite(n) ? n : now + SOLO_V2_GIFT_REGEN_MS;
      }
      const migrated = { count, nextGiftAt };
      saveRawInternal(migrated);
      try {
        window.localStorage.removeItem(SOLO_V2_GIFT_STORAGE_LEGACY_KEY);
      } catch {
        // ignore
      }
      notifyGiftStorageChanged();
      return migrated;
    }
  } catch {
    return null;
  }
  return null;
}

function saveRawInternal(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOLO_V2_GIFT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function saveRaw(data) {
  saveRawInternal(data);
  notifyGiftStorageChanged();
}

function normalizeStoredNext(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Apply hourly accrual only while below cap. At cap, accrual is paused (no banking past 5). */
export function soloV2GiftSyncAndRead() {
  if (typeof window === "undefined") {
    return { count: 0, nextGiftAt: null };
  }
  const now = Date.now();
  let raw = loadRaw();
  if (!raw || typeof raw.count !== "number") {
    raw = { count: 0, nextGiftAt: now + SOLO_V2_GIFT_REGEN_MS };
    saveRaw(raw);
    return { count: raw.count, nextGiftAt: raw.nextGiftAt };
  }

  let count = Math.max(0, Math.min(SOLO_V2_GIFT_MAX, Math.floor(raw.count)));
  let next = normalizeStoredNext(raw.nextGiftAt);
  if (next == null && count < SOLO_V2_GIFT_MAX) {
    next = now + SOLO_V2_GIFT_REGEN_MS;
  }

  while (count < SOLO_V2_GIFT_MAX && next != null && now >= next) {
    count += 1;
    next += SOLO_V2_GIFT_REGEN_MS;
  }

  const persistNext = count >= SOLO_V2_GIFT_MAX ? null : next;
  const prevNext = normalizeStoredNext(raw.nextGiftAt);
  if (count !== raw.count || persistNext !== prevNext) {
    saveRaw({ count, nextGiftAt: persistNext });
  }

  return {
    count,
    nextGiftAt: count >= SOLO_V2_GIFT_MAX ? null : persistNext,
  };
}

/**
 * Spend one gift after server accepted a new freeplay session.
 * Opening a slot from full (5→4) starts a new 1-hour accrual window (no instant refill).
 */
export function soloV2GiftConsumeOne() {
  if (typeof window === "undefined") return false;
  soloV2GiftSyncAndRead();
  const raw = loadRaw();
  if (!raw) return false;
  const count = Math.max(0, Math.min(SOLO_V2_GIFT_MAX, Math.floor(raw.count)));
  if (count < 1) return false;

  const prevCount = count;
  const newCount = count - 1;
  const now = Date.now();
  let nextGiftAt;
  if (prevCount === SOLO_V2_GIFT_MAX) {
    nextGiftAt = now + SOLO_V2_GIFT_REGEN_MS;
  } else {
    const n = raw.nextGiftAt != null ? Number(raw.nextGiftAt) : NaN;
    nextGiftAt = Number.isFinite(n) ? n : now + SOLO_V2_GIFT_REGEN_MS;
  }

  saveRaw({ count: newCount, nextGiftAt });
  return true;
}
