import { formatCardShort, handTotal, upCardShowValue } from "../../lib/solo-v2/challenge21HandMath";

function MiniCard({ code, hidden, variant }) {
  const dealer = variant === "dealer";
  if (hidden) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-gradient-to-br from-slate-800 to-slate-950 font-black text-white/50 shadow-inner ${
          dealer
            ? "h-[4.25rem] w-[3.1rem] text-sm sm:h-[3.65rem] sm:w-[2.75rem] sm:text-xs"
            : "h-[5.25rem] w-[3.65rem] text-base sm:h-[4.5rem] sm:w-[3.2rem] sm:text-sm"
        }`}
        aria-hidden
      >
        ●
      </div>
    );
  }
  const label = formatCardShort(code);
  const isRed = /♥|♦/.test(label);
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-lg border border-white/20 bg-white/[0.07] font-bold tabular-nums shadow-sm ${
        dealer
          ? "h-[4.25rem] w-[3.1rem] px-0.5 text-[15px] leading-tight sm:h-[3.65rem] sm:w-[2.75rem] sm:text-[13px]"
          : "h-[5.25rem] w-[3.65rem] px-1 text-lg leading-tight sm:h-[4.5rem] sm:w-[3.2rem] sm:text-base"
      } ${isRed ? "text-rose-200" : "text-slate-100"}`}
    >
      <span className="max-w-full truncate">{label}</span>
    </div>
  );
}

const ACTION_MIN_H = "min-h-[3.35rem]";

export default function TwentyOneChallengeBoard({
  sessionNotice,
  statusTop,
  statusSub,
  playerHands,
  activeHandIndex = 0,
  playerHand,
  opponentVisibleHand,
  opponentHandResolved,
  holeHidden,
  allowedDecisions = [],
  insurancePending,
  entryAmount,
  onAction,
  actionsHidden,
}) {
  const hands =
    Array.isArray(playerHands) && playerHands.length > 0
      ? playerHands
      : Array.isArray(playerHand) && playerHand.length
        ? [playerHand]
        : [];
  const ai = Math.max(0, Math.min(hands.length - 1, Math.floor(Number(activeHandIndex) || 0)));
  const ov = Array.isArray(opponentVisibleHand) ? opponentVisibleHand : [];
  const oppResolved = Array.isArray(opponentHandResolved) ? opponentHandResolved : null;

  const upCard = ov[0];
  const oppUpVal = upCard ? upCardShowValue(ov) : 0;
  const oppTotalResolved =
    oppResolved != null && oppResolved.length ? handTotal(oppResolved) : null;

  let opponentRow = [];
  if (oppResolved != null && oppResolved.length > 0) {
    opponentRow = oppResolved.map((c, i) => ({ key: `or-${i}`, code: c, hidden: false }));
  } else if (holeHidden && upCard) {
    opponentRow = [
      { key: "o-up", code: upCard, hidden: false },
      { key: "o-hole", code: null, hidden: true },
    ];
  } else {
    opponentRow = ov.map((c, i) => ({ key: `o-${i}`, code: c, hidden: false }));
  }

  const allow = new Set((Array.isArray(allowedDecisions) ? allowedDecisions : []).map(String));
  const insHalf =
    entryAmount != null && Number.isFinite(Number(entryAmount))
      ? Math.max(0, Math.floor(Number(entryAmount) / 2))
      : null;

  function Btn({ decision, label, accent }) {
    const disabled = !allow.has(decision) || actionsHidden;
    return (
      <button
        type="button"
        onClick={() => onAction?.(decision)}
        disabled={disabled}
        className={`w-full rounded-lg border py-2 text-[11px] font-bold leading-tight transition enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-35 sm:text-xs ${
          accent
            ? "border-amber-400/40 bg-amber-500/25 text-amber-50"
            : "border-white/15 bg-white/[0.08] text-white"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 text-center sm:gap-1">
      <div className="min-h-[2.2rem] shrink-0 px-0.5 sm:min-h-[2.35rem] sm:px-1">
        {sessionNotice ? (
          <div className="text-[10px] font-semibold text-amber-200/90 sm:text-[11px]">{sessionNotice}</div>
        ) : null}
        <div className="text-[11px] font-semibold leading-snug text-white/90 sm:text-[13px]">{statusTop}</div>
        <div className="mt-0.5 min-h-[0.9rem] text-[9px] font-medium text-white/55 sm:min-h-[1rem] sm:text-[10px]">
          {statusSub}
        </div>
      </div>

      <div className="min-h-[1rem] shrink-0 text-[9px] font-semibold tabular-nums text-white/70 sm:text-[10px]">
        {hands.length > 1 ? (
          <>
            Hand {ai + 1} of {hands.length}
            <span className="mx-1 text-white/30" aria-hidden>
              ·
            </span>
          </>
        ) : null}
        Opponent {holeHidden ? `shows ${oppUpVal || "—"}` : oppTotalResolved != null ? oppTotalResolved : "—"}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 sm:gap-1.5">
        <div>
          <div className="mb-0.5 text-[8px] font-bold uppercase tracking-wider text-white/40 sm:mb-0.5 sm:text-[9px]">
            Opponent
          </div>
          <div className="flex min-h-[4.5rem] flex-wrap items-center justify-center gap-1 sm:min-h-[4rem] sm:gap-1.5">
            {opponentRow.length === 0 ? (
              <div className="text-xs text-white/35">—</div>
            ) : (
              opponentRow.map(({ key, code, hidden }) => (
                <MiniCard key={key} code={code} hidden={hidden} variant="dealer" />
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-200/50 sm:mb-0.5 sm:text-[9px]">
            You
          </div>
          <div className="flex flex-col gap-1.5 sm:gap-2">
            {hands.length === 0 ? (
              <div className="flex min-h-[5.5rem] items-center justify-center text-xs text-white/35">—</div>
            ) : (
              hands.map((h, hi) => {
                const arr = Array.isArray(h) ? h : [];
                const active = hi === ai;
                const t = arr.length ? handTotal(arr) : null;
                return (
                  <div
                    key={`ph-${hi}`}
                    className={`rounded-lg px-1 py-0.5 sm:px-1.5 sm:py-1 ${
                      hands.length > 1 && active
                        ? "ring-1 ring-amber-400/50 ring-offset-1 ring-offset-transparent"
                        : hands.length > 1
                          ? "opacity-80"
                          : ""
                    }`}
                  >
                    {hands.length > 1 ? (
                      <div className="mb-0.5 text-[9px] font-semibold tabular-nums text-white/55">
                        Hand {hi + 1}
                        {t != null ? ` · ${t}` : ""}
                      </div>
                    ) : null}
                    <div className="flex min-h-[5.5rem] flex-wrap items-center justify-center gap-1.5 sm:min-h-[4.75rem] sm:gap-2">
                      {arr.length === 0 ? (
                        <span className="text-xs text-white/35">—</span>
                      ) : (
                        arr.map((c, i) => (
                          <MiniCard key={`p-${hi}-${i}-${c}`} code={c} hidden={false} variant="player" />
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className={`${ACTION_MIN_H} shrink-0 pb-0.5 pt-0.5`}>
        {actionsHidden ? (
          <div className={ACTION_MIN_H} aria-hidden />
        ) : (
          <div className="mx-auto grid min-h-[3.35rem] w-full max-w-md grid-cols-5 gap-1.5 sm:gap-2">
            {insurancePending ? (
              <>
                <div className="col-span-2">
                  <Btn decision="insurance_accept" label={insHalf != null ? `INSURE ${insHalf}` : "INSURE"} accent />
                </div>
                <div className="col-span-2">
                  <Btn decision="insurance_decline" label="DECLINE" />
                </div>
                <div className="col-span-1" aria-hidden />
              </>
            ) : (
              <>
                <Btn decision="hit" label="HIT" />
                <Btn decision="stand" label="STAND" accent />
                <Btn decision="double" label="DOUBLE" />
                <Btn decision="split" label="SPLIT" />
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[9px] font-bold leading-tight text-white/20 sm:text-[10px]"
                  aria-hidden
                >
                  —
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
