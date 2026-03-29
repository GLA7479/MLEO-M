import { formatCardShort, handTotal, upCardShowValue } from "../../lib/solo-v2/challenge21HandMath";

/** Mobile-first: large default; `sm:` desktop; `compact` when split (slightly smaller). */
function MiniCard({ code, hidden, variant, dealAnimate, compact }) {
  const dealer = variant === "dealer";
  const anim = Boolean(dealAnimate);
  const c = Boolean(compact);

  const dealerHidden =
    c
      ? "h-[4.6rem] w-[3.05rem] rounded-lg text-[13px] sm:h-[3.85rem] sm:w-[2.75rem] sm:rounded-md sm:text-[11px]"
      : "h-[5.5rem] w-[3.65rem] rounded-xl text-base sm:h-[4.4rem] sm:w-[3.1rem] sm:rounded-lg sm:text-sm";
  const playerHidden =
    c
      ? "h-[5.85rem] w-[3.75rem] rounded-lg text-base sm:h-[4.85rem] sm:w-[3.35rem] sm:rounded-lg sm:text-sm"
      : "h-[7rem] w-[4.35rem] rounded-xl text-lg sm:h-[5.25rem] sm:w-[3.75rem] sm:rounded-lg sm:text-base";

  const dealerFace =
    c
      ? "h-[4.6rem] w-[3.05rem] rounded-lg px-0.5 text-[14px] leading-tight sm:h-[3.85rem] sm:w-[2.75rem] sm:rounded-md sm:text-[12px]"
      : "h-[5.5rem] w-[3.65rem] rounded-xl px-0.5 text-[17px] leading-tight sm:h-[4.4rem] sm:w-[3.1rem] sm:rounded-lg sm:text-[14px]";
  const playerFace =
    c
      ? "h-[5.85rem] w-[3.75rem] rounded-lg px-1 text-lg leading-tight sm:h-[4.85rem] sm:w-[3.35rem] sm:rounded-lg sm:text-base"
      : "h-[7rem] w-[4.35rem] rounded-xl px-1.5 text-[1.35rem] leading-tight sm:h-[5.25rem] sm:w-[3.75rem] sm:rounded-lg sm:text-lg";

  if (hidden) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border border-white/25 bg-gradient-to-br from-slate-800 to-slate-950 font-black text-white/50 shadow-inner ${
          dealer ? dealerHidden : playerHidden
        } ${anim ? "animate-c21-card-reveal" : ""}`}
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
      className={`flex shrink-0 flex-col items-center justify-center border border-white/20 bg-white/[0.07] font-bold tabular-nums shadow-sm ${
        dealer ? dealerFace : playerFace
      } ${isRed ? "text-rose-200" : "text-slate-100"} ${anim ? "animate-c21-card-reveal" : ""}`}
    >
      <span className="max-w-full truncate">{label}</span>
    </div>
  );
}

const ACTION_MIN_H = "min-h-[3.35rem]";

function pulseSet(pulseKeys) {
  const arr = Array.isArray(pulseKeys) ? pulseKeys : [];
  return new Set(arr.map(String));
}

function opponentLabelFromSlots(slots) {
  const list = Array.isArray(slots) ? slots : [];
  const hasHidden = list.some(s => s?.hidden);
  const faceUpCodes = list.filter(s => s && !s.hidden && s.code).map(s => String(s.code));
  if (faceUpCodes.length === 0) return "—";
  if (hasHidden) {
    const show = upCardShowValue([faceUpCodes[0]]);
    return `Shows ${show}`;
  }
  return `Total ${handTotal(faceUpCodes)}`;
}

/**
 * @param {Array<{ code: string | null; hidden: boolean }>} slots
 */
function slotsToOpponentRow(slots, pulses) {
  const list = Array.isArray(slots) ? slots : [];
  return list.map((s, i) => ({
    key: `os-${i}`,
    code: s.hidden ? null : s.code,
    hidden: Boolean(s.hidden),
    pulse: pulses.has(`o-${i}`) || (s.hidden && pulses.has("o-hole")),
  }));
}

export default function TwentyOneChallengeBoard({
  sessionNotice,
  hideSessionBanner = false,
  /** When true, status lines are omitted (shown by ladder shell above the inner table). */
  suppressShellStatus = false,
  statusTop,
  statusSub,
  playerHands,
  activeHandIndex = 0,
  playerHand,
  opponentVisibleHand,
  opponentHandResolved,
  holeHidden,
  presentation,
  allowedDecisions = [],
  insurancePending,
  entryAmount,
  onAction,
  actionsHidden,
}) {
  const pulses = pulseSet(presentation?.pulseKeys);
  const usePres = presentation && Array.isArray(presentation.dealerSlots) && Array.isArray(presentation.playerHands);

  const hands =
    usePres && presentation.playerHands.length > 0
      ? presentation.playerHands
      : Array.isArray(playerHands) && playerHands.length > 0
        ? playerHands
        : Array.isArray(playerHand) && playerHand.length
          ? [playerHand]
          : [];
  const ai =
    usePres && presentation.activeHandIndex != null
      ? Math.max(0, Math.min(hands.length - 1, Math.floor(Number(presentation.activeHandIndex) || 0)))
      : Math.max(0, Math.min(hands.length - 1, Math.floor(Number(activeHandIndex) || 0)));
  const splitLayout = hands.length > 1;
  const ov = Array.isArray(opponentVisibleHand) ? opponentVisibleHand : [];
  const oppResolved = Array.isArray(opponentHandResolved) ? opponentHandResolved : null;

  let opponentRow = [];
  let opponentTotalLine = "";

  if (usePres) {
    opponentRow = slotsToOpponentRow(presentation.dealerSlots, pulses);
    opponentTotalLine = opponentLabelFromSlots(presentation.dealerSlots);
  } else if (oppResolved != null && oppResolved.length > 0) {
    opponentRow = oppResolved.map((c, i) => ({
      key: `or-${i}`,
      code: c,
      hidden: false,
      pulse: false,
    }));
    opponentTotalLine = `Total ${handTotal(oppResolved)}`;
  } else {
    const upCard = ov[0];
    const oppUpVal = upCard ? upCardShowValue(ov) : 0;
    if (holeHidden && upCard) {
      opponentRow = [
        { key: "o-up", code: upCard, hidden: false, pulse: false },
        { key: "o-hole", code: null, hidden: true, pulse: false },
      ];
      opponentTotalLine = `Shows ${oppUpVal || "—"}`;
    } else {
      opponentRow = ov.map((c, i) => ({ key: `o-${i}`, code: c, hidden: false, pulse: false }));
      opponentTotalLine = ov.length ? `Total ${handTotal(ov)}` : "—";
    }
  }

  const allow = new Set((Array.isArray(allowedDecisions) ? allowedDecisions : []).map(String));
  const insHalf =
    entryAmount != null && Number.isFinite(Number(entryAmount))
      ? Math.max(0, Math.floor(Number(entryAmount) / 2))
      : null;

  function Btn({ decision, label }) {
    const disabled = !allow.has(decision) || actionsHidden;
    return (
      <button
        type="button"
        onClick={() => onAction?.(decision)}
        disabled={disabled}
        className="w-full rounded-lg border border-white/15 bg-white/[0.08] py-2 text-[11px] font-bold leading-tight text-white transition enabled:hover:bg-white/[0.12] enabled:active:bg-white/[0.15] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/25 disabled:cursor-not-allowed disabled:opacity-35 sm:text-xs"
      >
        {label}
      </button>
    );
  }

  const showSessionBanner = Boolean(sessionNotice) && !hideSessionBanner;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0 text-center sm:gap-0.5">
      {!suppressShellStatus ? (
        <div className="min-h-[2rem] shrink-0 px-0.5 sm:min-h-[2.15rem] sm:px-1">
          {showSessionBanner ? (
            <div className="text-[10px] font-semibold text-amber-200/90 sm:text-[11px]">{sessionNotice}</div>
          ) : null}
          <div className="text-[11px] font-semibold leading-snug text-white/90 sm:text-[13px]">{statusTop}</div>
          <div className="mt-0.5 min-h-[0.9rem] text-[9px] font-medium text-white/55 sm:min-h-[1rem] sm:text-[10px]">
            {statusSub}
          </div>
        </div>
      ) : null}

      {hands.length > 1 ? (
        <div className="min-h-[0.85rem] shrink-0 text-[9px] font-semibold tabular-nums text-white/60 sm:text-[10px]">
          Hand {ai + 1} of {hands.length}
        </div>
      ) : suppressShellStatus ? null : (
        <div className="min-h-[0.85rem] shrink-0" aria-hidden />
      )}

      {suppressShellStatus && hands.length <= 1 ? <div className="min-h-[0.85rem] shrink-0" aria-hidden /> : null}

      <div className="flex min-h-0 flex-1 flex-col justify-start gap-1 sm:gap-2">
        <div className="shrink-0">
          <div className="mb-0 text-[8px] font-bold uppercase tracking-wider text-white/40 sm:text-[9px]">
            Opponent
          </div>
          <div
            className={`flex min-h-0 flex-wrap items-center justify-center gap-1 sm:gap-1.5 ${splitLayout ? "h-[4.85rem] py-0.5 sm:h-[4.1rem]" : "h-[5.75rem] py-0.5 sm:h-[4.65rem]"}`}
          >
            {opponentRow.length === 0 ? (
              <div className="text-xs text-white/35">—</div>
            ) : (
              opponentRow.map(({ key, code, hidden, pulse }) => (
                <MiniCard
                  key={key}
                  code={code}
                  hidden={hidden}
                  variant="dealer"
                  dealAnimate={pulse}
                  compact={splitLayout}
                />
              ))
            )}
          </div>
          <div className="mt-0 min-h-[1.05rem] text-[11px] font-bold tabular-nums leading-tight text-white/85 sm:text-xs">
            {opponentTotalLine}
          </div>
        </div>

        <div className="shrink-0">
          <div className="mb-0 text-[8px] font-bold uppercase tracking-wider text-amber-200/50 sm:text-[9px]">
            You
          </div>
          <div className={`flex flex-col ${splitLayout ? "gap-0.5 sm:gap-1" : "gap-0 sm:gap-0.5"}`}>
            {hands.length === 0 ? (
              <div
                className={`flex items-center justify-center text-xs text-white/35 ${splitLayout ? "h-[6.1rem] sm:h-[5.1rem]" : "h-[7.35rem] sm:h-[5.6rem]"}`}
              >
                —
              </div>
            ) : (
              hands.map((h, hi) => {
                const arr = Array.isArray(h) ? h : [];
                const active = hi === ai;
                const t = arr.length ? handTotal(arr) : null;
                return (
                  <div
                    key={`ph-${hi}`}
                    className={`rounded-lg px-0.5 py-0 sm:px-1 sm:py-0.5 ${
                      hands.length > 1 && active
                        ? "ring-1 ring-amber-400/50 ring-offset-1 ring-offset-transparent"
                        : hands.length > 1
                          ? "opacity-80"
                          : ""
                    }`}
                  >
                    {hands.length > 1 ? (
                      <div className="mb-0 text-[8px] font-semibold uppercase tracking-wide text-white/45">
                        Hand {hi + 1}
                      </div>
                    ) : null}
                    <div
                      className={`flex min-h-0 flex-wrap items-center justify-center gap-1 sm:gap-1.5 ${splitLayout ? "h-[6rem] sm:h-[5.1rem]" : "h-[7.2rem] sm:h-[5.45rem]"}`}
                    >
                      {arr.length === 0 ? (
                        <span className="text-xs text-white/35">—</span>
                      ) : (
                        arr.map((c, i) => (
                          <MiniCard
                            key={`p-${hi}-${i}-${c}`}
                            code={c}
                            hidden={false}
                            variant="player"
                            dealAnimate={pulses.has(`p-${hi}-${i}`)}
                            compact={splitLayout}
                          />
                        ))
                      )}
                    </div>
                    <div className="mt-0 min-h-[1.05rem] text-[11px] font-bold tabular-nums leading-tight text-amber-100/90 sm:text-xs">
                      {t != null ? `Total ${t}` : "—"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className={`${ACTION_MIN_H} mt-auto shrink-0 border-t border-zinc-700/40 pb-0.5 pt-2`}>
        {actionsHidden ? (
          <div className={ACTION_MIN_H} aria-hidden />
        ) : (
          <div className="mx-auto grid min-h-[3.35rem] w-full max-w-md grid-cols-5 gap-1.5 sm:gap-2">
            {insurancePending ? (
              <>
                <div className="col-span-2">
                  <Btn decision="insurance_accept" label={insHalf != null ? `INSURE ${insHalf}` : "INSURE"} />
                </div>
                <div className="col-span-2">
                  <Btn decision="insurance_decline" label="DECLINE" />
                </div>
                <div className="col-span-1" aria-hidden />
              </>
            ) : (
              <>
                <Btn decision="hit" label="HIT" />
                <Btn decision="stand" label="STAND" />
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
