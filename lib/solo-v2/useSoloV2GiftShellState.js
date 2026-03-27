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
export function useSoloV2GiftShellState() {
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  const synced = useMemo(() => soloV2GiftSyncAndRead(), [tick]);

  const status = useMemo(() => buildSoloV2GiftStatus(synced), [synced]);

  useEffect(() => {
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
