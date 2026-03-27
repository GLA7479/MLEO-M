import { useCallback, useEffect, useMemo, useState } from "react";

/** Locked product rules (Solo V2 gifts) — display accrual only until server gift rounds ship. */
export const SOLO_V2_GIFT_MAX = 5;
export const SOLO_V2_GIFT_REGEN_MS = 60 * 60 * 1000; // 1 hour
/** Free round stake when gift gameplay is implemented (not wired to sessions in this pass). */
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

/**
 * Client-side gift badge + hourly accrual preview (max 5). Does not affect vault or game sessions.
 * Replace with server-backed state when free-round API exists.
 */
export function useSoloV2GiftShellState() {
  const [giftCount, setGiftCount] = useState(0);
  const [nextGiftAt, setNextGiftAt] = useState(null);
  const [tick, setTick] = useState(0);

  const syncFromClock = useCallback(() => {
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
    setGiftCount(count);
    setNextGiftAt(count >= SOLO_V2_GIFT_MAX ? null : next);
  }, []);

  useEffect(() => {
    syncFromClock();
  }, [syncFromClock, tick]);

  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const onGiftClick = useCallback(() => {
    syncFromClock();
    // Placeholder: no spend / no session until free-round backend exists
  }, [syncFromClock]);

  return useMemo(
    () => ({
      giftCount,
      giftMax: SOLO_V2_GIFT_MAX,
      giftEnabled: true,
      giftLoading: false,
      giftTitle: "Gifts — free rounds coming soon",
      giftNextGiftAt: nextGiftAt,
      giftRegenMs: SOLO_V2_GIFT_REGEN_MS,
      onGiftClick,
    }),
    [giftCount, nextGiftAt, onGiftClick],
  );
}
