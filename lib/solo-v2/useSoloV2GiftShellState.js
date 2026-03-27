import { useCallback, useEffect, useMemo, useState } from "react";
import { buildSoloV2GiftStatus } from "./soloV2GiftStatus";
import {
  SOLO_V2_GIFT_MAX,
  SOLO_V2_GIFT_REGEN_MS,
  SOLO_V2_GIFT_ROUND_STAKE,
  soloV2GiftSyncAndRead,
} from "./soloV2GiftStorage";

export { SOLO_V2_GIFT_MAX, SOLO_V2_GIFT_REGEN_MS, SOLO_V2_GIFT_ROUND_STAKE } from "./soloV2GiftStorage";

/**
 * Solo V2 gift badge + accrual (client). Server ledger can replace storage later.
 * Does not import legacy arcade helpers.
 */
const GIFT_SSR_SYNC = { count: 0, nextGiftAt: null };

export function useSoloV2GiftShellState() {
  const [tick, setTick] = useState(0);
  /** Avoid hydration mismatch: server and first client paint match; then read localStorage. */
  const [clientReady, setClientReady] = useState(false);

  const refresh = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  const synced = useMemo(() => {
    if (!clientReady) return GIFT_SSR_SYNC;
    return soloV2GiftSyncAndRead();
  }, [tick, clientReady]);

  const status = useMemo(() => buildSoloV2GiftStatus(synced), [synced]);

  useEffect(() => {
    setClientReady(true);
    const id = window.setInterval(() => setTick(t => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(
    () => ({
      giftCount: status.tokens,
      giftMax: status.maxTokens,
      giftEnabled: true,
      giftLoading: false,
      giftTitle: `Gifts — ${SOLO_V2_GIFT_ROUND_STAKE} free play (${status.tokens}/${status.maxTokens})`,
      giftNextGiftAt: status.nextGiftAt,
      giftRegenMs: status.regenMs,
      /** Re-sync badge after server accepts a new gift session */
      refresh,
      /** Solo V2 contract shape (tokens, maxTokens, regenMs, …) */
      giftStatus: status,
      onGiftClick: () => {},
    }),
    [status, refresh],
  );
}
