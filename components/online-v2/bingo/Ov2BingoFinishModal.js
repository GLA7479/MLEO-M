"use client";

import { BINGO_PRIZE_KEYS } from "../../../lib/online-v2/bingo/ov2BingoEngine";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   prizeLabels: Record<string, string>,
 *   claims: Array<{ prizeKey: string, claimedByName: string, amount: number, seatIndex?: number }>,
 *   winner: { participantKey: string|null, name: string|null } | null,
 *   walkoverPayoutAmount: number|null,
 * }} props
 */
export default function Ov2BingoFinishModal({
  open,
  onClose,
  prizeLabels,
  claims,
  winner,
  walkoverPayoutAmount,
}) {
  if (!open) return null;

  const byKey = Object.fromEntries((claims || []).map(c => [String(c.prizeKey || "").trim(), c]));
  const walkoverAmt =
    walkoverPayoutAmount != null && Number.isFinite(Number(walkoverPayoutAmount)) && Number(walkoverPayoutAmount) > 0
      ? Math.floor(Number(walkoverPayoutAmount))
      : 0;
  const isWalkover = walkoverAmt > 0;

  return (
    <Ov2SharedFinishModalFrame titleId="ov2-bingo-finish-title">
      <div className="flex max-h-[min(85dvh,520px)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <h2 id="ov2-bingo-finish-title" className="text-sm font-extrabold text-white">
            Match finished
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-snug text-zinc-300 sm:text-xs">
          {isWalkover ? (
            <div className="mb-3 rounded-lg border border-emerald-500/35 bg-emerald-950/25 px-2 py-1.5">
              <div className="font-semibold text-emerald-100">Last player standing</div>
              <div className="mt-0.5 text-zinc-200">
                Winner: <span className="font-semibold text-white">{winner?.name || winner?.participantKey || "—"}</span>
              </div>
              <div className="mt-0.5 text-zinc-200">
                Walkover payout: <span className="font-mono font-semibold text-emerald-200">{walkoverAmt}</span>
              </div>
            </div>
          ) : winner?.participantKey ? (
            <p className="mb-2 text-zinc-200">
              Winner: <span className="font-semibold text-white">{winner.name || winner.participantKey}</span>
            </p>
          ) : null}

          <div className="font-semibold text-zinc-400">Prizes claimed</div>
          <ul className="mt-1 space-y-1">
            {BINGO_PRIZE_KEYS.map(pk => {
              const c = byKey[pk];
              const label = prizeLabels[pk] || pk;
              if (!c) {
                return (
                  <li key={pk} className="flex justify-between gap-2 border-b border-white/[0.06] py-0.5">
                    <span>{label}</span>
                    <span className="text-zinc-500">Not claimed</span>
                  </li>
                );
              }
              const amt = Math.floor(Number(c.amount) || 0);
              return (
                <li key={pk} className="flex justify-between gap-2 border-b border-white/[0.06] py-0.5">
                  <span>{label}</span>
                  <span className="text-right">
                    <span className="text-zinc-100">{c.claimedByName || "Player"}</span>
                    <span className="ml-1 font-mono text-amber-200/90">{amt}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Ov2SharedFinishModalFrame>
  );
}
