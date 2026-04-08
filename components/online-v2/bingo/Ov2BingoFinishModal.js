"use client";

import { BINGO_PRIZE_KEYS } from "../../../lib/online-v2/bingo/ov2BingoEngine";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_FINISH_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/**
 * @param {{
 *   open: boolean,
 *   onDismiss: () => void,
 *   prizeLabels: Record<string, string>,
 *   claims: Array<{ prizeKey: string, claimedByName: string, amount: number, seatIndex?: number }>,
 *   winner: { participantKey: string|null, name: string|null } | null,
 *   walkoverPayoutAmount: number|null,
 *   vaultClaimBusy?: boolean,
 *   selfKey: string,
 *   isHost: boolean,
 *   canRequestRematch: boolean,
 *   canCancelRematch: boolean,
 *   canStartNextMatch: boolean,
 *   rematchBusy: boolean,
 *   startNextBusy: boolean,
 *   exitBusy: boolean,
 *   exitErr: string,
 *   onRequestRematch: () => void | Promise<void>,
 *   onCancelRematch: () => void | Promise<void>,
 *   onStartNext: () => void | Promise<void>,
 *   onLeaveTable: () => void | Promise<void>,
 * }} props
 */
export default function Ov2BingoFinishModal({
  open,
  onDismiss,
  prizeLabels,
  claims,
  winner,
  walkoverPayoutAmount,
  vaultClaimBusy = false,
  selfKey,
  isHost,
  canRequestRematch,
  canCancelRematch,
  canStartNextMatch,
  rematchBusy,
  startNextBusy,
  exitBusy,
  exitErr,
  onRequestRematch,
  onCancelRematch,
  onStartNext,
  onLeaveTable,
}) {
  if (!open) return null;

  const byKey = Object.fromEntries((claims || []).map(c => [String(c.prizeKey || "").trim(), c]));
  const walkoverAmt =
    walkoverPayoutAmount != null && Number.isFinite(Number(walkoverPayoutAmount)) && Number(walkoverPayoutAmount) > 0
      ? Math.floor(Number(walkoverPayoutAmount))
      : 0;
  const isWalkover = walkoverAmt > 0;

  const claimsTotal = (claims || []).reduce((s, c) => s + Math.floor(Number(c.amount) || 0), 0);

  const finishTitle = isWalkover ? "Victory" : winner?.participantKey ? "Round complete" : "Match finished";
  const finishMultiplier = 1;

  const settlementText = () => {
    if (isWalkover) return `+${walkoverAmt} MLEO`;
    if (claimsTotal > 0) return `+${claimsTotal.toLocaleString()} MLEO (prizes)`;
    return "—";
  };

  const reasonLine = isWalkover
    ? `Last player standing — ${winner?.name || winner?.participantKey || "Winner"}`
    : winner?.participantKey
      ? `Winner: ${winner.name || winner.participantKey}`
      : "Match finished";

  const finishLocked = vaultClaimBusy;

  return (
    <Ov2SharedFinishModalFrame titleId="ov2-bingo-finish-title">
      <div
        className={[
          "border-b px-4 pb-3 pt-4",
          isWalkover
            ? "border-emerald-500/20 bg-gradient-to-br from-emerald-950/45 to-zinc-950/80"
            : "border-white/[0.07] bg-zinc-950/60",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <span
            className={[
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl shadow-inner",
              isWalkover && "border-emerald-500/45 bg-emerald-950/60 text-emerald-200",
              !isWalkover && "border-white/10 bg-zinc-900/80 text-zinc-200",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden
          >
            {isWalkover ? "🏆" : "⎔"}
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Round result</p>
            <h2
              id="ov2-bingo-finish-title"
              className={[
                "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                isWalkover && "text-emerald-400",
                !isWalkover && "text-zinc-100",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {finishTitle}
            </h2>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{finishMultiplier}</p>
            <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
              <p
                className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${
                  isWalkover || claimsTotal > 0 ? "font-semibold tabular-nums text-amber-200/95" : "text-zinc-500"
                }`}
              >
                {settlementText()}
              </p>
            </div>
            <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{reasonLine}</p>
            <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
              {finishLocked ? "Sending results to your balance…" : "Round complete — rematch, then host starts next."}
            </p>
          </div>
        </div>
      </div>
      <div className="max-h-[min(50dvh,320px)] min-h-0 overflow-y-auto border-b border-white/[0.06] px-4 py-3">
        <div className="font-semibold text-[10px] uppercase tracking-wide text-zinc-500">Prizes claimed</div>
        <ul className="mt-2 space-y-1 text-[11px] leading-snug text-zinc-300 sm:text-xs">
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
                  <span className="ml-1 font-mono text-amber-200/90">{amt} MLEO</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-col gap-2 px-4 py-4">
        <button
          type="button"
          className={BTN_PRIMARY + " w-full"}
          disabled={rematchBusy || !canRequestRematch || finishLocked}
          onClick={() => void onRequestRematch()}
        >
          {rematchBusy ? "Requesting…" : "Request rematch"}
        </button>
        <button
          type="button"
          className={BTN_SECONDARY + " w-full"}
          disabled={rematchBusy || !canCancelRematch}
          onClick={() => void onCancelRematch()}
        >
          Cancel rematch
        </button>
        <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
          <button
            type="button"
            className={BTN_PRIMARY + " w-full rounded-none"}
            disabled={startNextBusy || !canStartNextMatch || finishLocked}
            title={!isHost ? "Only the host can start the next match" : undefined}
            onClick={() => void onStartNext()}
          >
            {startNextBusy ? "Starting…" : "Start next (host)"}
          </button>
          <p className="px-2 py-1.5 text-center text-[11px] text-zinc-500">
            Host starts the next match when all seated players rematch.
          </p>
        </div>
        <button type="button" className={BTN_SECONDARY + " w-full"} onClick={onDismiss}>
          Dismiss
        </button>
        <button
          type="button"
          className={BTN_FINISH_DANGER + " w-full"}
          disabled={exitBusy || !selfKey}
          onClick={() => void onLeaveTable()}
        >
          {exitBusy ? "Leaving…" : "Leave table"}
        </button>
        {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
      </div>
    </Ov2SharedFinishModalFrame>
  );
}
