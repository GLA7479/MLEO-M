import { useEffect, useMemo, useState } from "react";
import { useOv2BoardPathSession } from "../../hooks/useOv2BoardPathSession";
import {
  BOARD_PATH_ACTIVE_DETAIL,
  BOARD_PATH_COARSE,
  BOARD_PATH_MATCH_DETAIL,
  BOARD_PATH_SESSION_PHASE,
  BOARD_PATH_STAKE_FLOW,
  OV2_BOARD_PATH_MOCK_SCENARIO_KEYS,
  OV2_BOARD_PATH_MOCK_SCENARIO_LABELS,
  OV2_BOARD_PATH_MOCK_SCENARIOS,
} from "../../lib/online-v2/ov2BoardPathAdapter";

const PATH_SLOTS = 6;

/**
 * Board Path — fixed flex-column layout inside `OnlineV2GamePageShell` (no internal vertical scroll).
 *
 * @param {{ contextInput?: import("../../lib/online-v2/ov2BoardPathAdapter").Ov2BoardPathContext | null }} props
 * When `contextInput` is null/undefined, a build-first mock scenario picker feeds OV2-shaped room data.
 */
export default function Ov2BoardPathScreen({ contextInput = null }) {
  const [mockScenarioKey, setMockScenarioKey] = useState(/** @type {string} */ ("disconnected"));

  const showDevPicker =
    contextInput == null &&
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_OV2_BP_DEV_SCENARIOS !== "false";

  const effectiveContext = useMemo(() => {
    if (contextInput != null) return contextInput;
    const factory = OV2_BOARD_PATH_MOCK_SCENARIOS[mockScenarioKey] || OV2_BOARD_PATH_MOCK_SCENARIOS.disconnected;
    return factory();
  }, [contextInput, mockScenarioKey]);

  const bp = useOv2BoardPathSession(effectiveContext);
  const { vm } = bp;

  useEffect(() => {
    if (typeof window === "undefined" || !bp.debugAdvanceTurn) return undefined;
    if (!window.location.search.includes("dev=1")) return undefined;
    window.__bpNextTurn = bp.debugAdvanceTurn;
    return () => {
      delete window.__bpNextTurn;
    };
  }, [bp.debugAdvanceTurn]);

  const hasSession = Boolean(bp.session?.id);
  const hasSeatRows = Boolean(bp.seats?.length);
  const useSeatOnlyPlayerUi = hasSession && hasSeatRows;
  const sessionMissingSeats = hasSession && !hasSeatRows;

  const oppSeatForUi = useSeatOnlyPlayerUi ? bp.seats?.find(s => !s.isSelf) ?? null : null;

  const youHighlight = useSeatOnlyPlayerUi
    ? Boolean(bp.activeSeat && bp.selfSeat && bp.activeSeat.seatIndex === bp.selfSeat.seatIndex)
    : sessionMissingSeats
      ? false
      : vm.matchDetail === BOARD_PATH_MATCH_DETAIL.YOUR_TURN;
  const oppHighlight = useSeatOnlyPlayerUi
    ? Boolean(bp.activeSeat && oppSeatForUi && bp.activeSeat.seatIndex === oppSeatForUi.seatIndex)
    : sessionMissingSeats
      ? false
      : vm.matchDetail === BOARD_PATH_MATCH_DETAIL.THEIR_TURN;

  const youBadge = useSeatOnlyPlayerUi
    ? bp.selfSeat
      ? `${bp.selfSeat.displayName}${bp.selfSeat.isSelf ? " · self" : ""}`
      : "—"
    : sessionMissingSeats
      ? "Seats loading…"
      : vm.playerBadges.you;
  const oppBadge = useSeatOnlyPlayerUi ? (oppSeatForUi?.displayName ?? "—") : sessionMissingSeats ? "—" : vm.playerBadges.opp;

  const youConn = useSeatOnlyPlayerUi ? Boolean(bp.selfSeat?.connected) : sessionMissingSeats ? false : vm.youConnected;
  const oppConn = useSeatOnlyPlayerUi ? Boolean(oppSeatForUi?.connected) : sessionMissingSeats ? false : vm.oppConnected;

  const primaryMuted = hasSession ? vm.primary.muted || !bp.canSelfAct : vm.primary.muted;
  const secondaryMuted = hasSession ? vm.secondary.muted || !bp.canSelfAct : vm.secondary.muted;

  const localTransientLine = bp.isStuckWaitingForHost
    ? "Waiting for host session..."
    : vm.coarse === BOARD_PATH_COARSE.ACTIVE && bp.localBundle == null
      ? bp.isOpeningSession
        ? "Local: host opening session…"
        : bp.isHydratingSession
          ? "Local: waiting for host session…"
          : null
      : null;

  const eventStatusLine =
    bp.lastEvent && typeof bp.lastEvent === "object" && "type" in bp.lastEvent && bp.lastEvent.type != null
      ? `Event: ${String(bp.lastEvent.type)}`
      : null;

  const faultLine = bp.sessionSyncFault?.message || null;
  const activeMissingLine = bp.roomActiveMissingSessionHint || null;
  const combinedStatus = [vm.turnLine, vm.statusLine, localTransientLine, eventStatusLine, faultLine, activeMissingLine]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="ov2-board-path-screen flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden text-white sm:gap-1 md:gap-1 lg:gap-1.5">
      <div className="flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 sm:px-2 sm:py-1 lg:rounded-lg lg:px-2.5">
        <ConnectionDot live={vm.coarse !== BOARD_PATH_COARSE.DISCONNECTED} />
        <div className="min-w-0 flex-1 truncate text-[9px] tabular-nums text-zinc-300 sm:text-[10px] lg:text-[11px]">
          <span className="font-semibold text-zinc-400">Rnd {vm.meta.round}</span>
          <span className="text-zinc-600"> · </span>
          <span className="text-zinc-400">Tbl {vm.meta.table}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[9px] tabular-nums sm:text-[10px]">
          <div className="text-emerald-100/80">
            <span className="text-zinc-500">Stk</span> {vm.meta.stake}
          </div>
          {vm.coarse !== BOARD_PATH_COARSE.DISCONNECTED ? (
            <div className="text-[8px] text-zinc-500 sm:text-[9px]" title="Session lifecycle phase (derived)">
              <span className="text-zinc-600">Sess</span>{" "}
              <span className="font-medium text-zinc-400">{vm.sessionPhase}</span>
              <span className="text-zinc-700"> · </span>
              <span className="text-zinc-600">H{vm.contextHydrationTier}</span>
            </div>
          ) : null}
        </div>
      </div>

      {vm.coarse !== BOARD_PATH_COARSE.DISCONNECTED ? (
        <div
          className="shrink-0 truncate rounded-md border border-white/[0.06] bg-black/25 px-1.5 py-0.5 text-[8px] leading-tight text-zinc-400 sm:text-[9px]"
          title={
            vm.membersStakeUi.length
              ? vm.membersStakeUi.map(m => `${m.displayLabel}: ${m.committed ? "committed" : "not committed"}`).join(" · ")
              : vm.stakeSummaryLine
          }
        >
          <span className="font-semibold text-zinc-500">Stakes</span>{" "}
          <span className="tabular-nums text-zinc-300">
            {vm.stakeCounts.committed}/{vm.stakeCounts.total} locked
            {vm.stakeCounts.selfCommitted ? " · you OK" : vm.stakeFlow === BOARD_PATH_STAKE_FLOW.SELF_MUST_COMMIT ? " · you owe" : ""}
          </span>
          <span className="text-zinc-600"> · </span>
          <span className="text-zinc-500">{vm.stakeSummaryLine}</span>
          {vm.seatsComplete === false ? <span className="text-amber-200/90"> · seats incomplete</span> : null}
          {vm.seatsComplete === true ? <span className="text-emerald-400/85"> · seats OK</span> : null}
          {vm.turnDataPartial ? <span className="text-amber-200/85"> · turn partial</span> : null}
          {bp.localBundle ? (
            <span className="text-zinc-500">
              {" "}
              · local sess {bp.localSession?.id?.slice(0, 8) || "—"}
              {bp.didSelfInitiateOpen ? " · you opened" : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        title={combinedStatus}
        className={`shrink-0 truncate rounded-md border px-1.5 py-0.5 text-center text-[9px] leading-tight sm:px-2 sm:text-[10px] lg:py-1 lg:text-[11px] ${statusBannerClass(vm)}`}
      >
        {combinedStatus}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-1 sm:gap-1.5 lg:gap-2">
        <PlayerPanel
          title="You"
          initial="Y"
          highlight={youHighlight}
          badge={youBadge}
          connectionOk={youConn}
        />
        <PlayerPanel
          title="Opp"
          initial="O"
          highlight={oppHighlight}
          badge={oppBadge}
          connectionOk={oppConn}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/15 bg-gradient-to-b from-zinc-900/80 to-black/50 md:rounded-xl lg:rounded-2xl lg:border-white/20">
        <div className="flex h-full min-h-0 flex-col p-0.5 sm:p-1 md:p-1.5 lg:p-3">
          <BoardPathPlayfield
            vm={vm}
            youTokenTone={useSeatOnlyPlayerUi ? bp.selfSeat?.tokenColor : undefined}
            oppTokenTone={useSeatOnlyPlayerUi ? oppSeatForUi?.tokenColor : undefined}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1 md:gap-1.5 lg:flex-row lg:items-stretch lg:gap-2">
        <button
          type="button"
          disabled
          data-ov2-bp-control={vm.primary.intent}
          data-ov2-bp-can-self-act={hasSession ? String(bp.canSelfAct) : undefined}
          className={`min-h-[40px] flex-1 rounded-lg border py-2 text-[11px] font-bold md:min-h-[44px] md:text-xs lg:rounded-xl lg:py-2.5 lg:text-sm ${
            primaryMuted
              ? "border-white/12 bg-white/[0.06] text-zinc-400"
              : "border-emerald-500/40 bg-emerald-900/30 text-emerald-100"
          }`}
        >
          {vm.primary.label}
        </button>
        <button
          type="button"
          disabled
          data-ov2-bp-control={vm.secondary.intent}
          data-ov2-bp-can-self-act={hasSession ? String(bp.canSelfAct) : undefined}
          className={`min-h-[40px] flex-1 rounded-lg border py-2 text-[11px] font-semibold md:min-h-[44px] md:text-xs lg:rounded-xl lg:py-2.5 lg:text-sm ${
            secondaryMuted
              ? "border-white/12 bg-black/35 text-zinc-500"
              : "border-white/12 bg-black/35 text-zinc-400"
          }`}
        >
          {vm.secondary.label}
        </button>
      </div>

      {showDevPicker ? (
        <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-white/[0.04] pt-0.5 opacity-70">
          <label className="sr-only" htmlFor="ov2-bp-mock-scenario">
            Mock OV2 context (build-first)
          </label>
          <span className="hidden text-[7px] font-medium uppercase tracking-wide text-zinc-600 sm:inline">Mock</span>
          <select
            id="ov2-bp-mock-scenario"
            value={mockScenarioKey}
            onChange={e => setMockScenarioKey(e.target.value)}
            className="max-w-[11rem] rounded border border-white/[0.08] bg-black/40 py-px pl-1 pr-4 text-[8px] text-zinc-500 sm:max-w-[13rem] sm:text-[9px]"
          >
            {OV2_BOARD_PATH_MOCK_SCENARIO_KEYS.map(key => (
              <option key={key} value={key}>
                {OV2_BOARD_PATH_MOCK_SCENARIO_LABELS[key] || key}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

/** @param {{ live: boolean }} props */
function ConnectionDot({ live }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${live ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-zinc-600"}`}
      aria-hidden
    />
  );
}

/** @param {import("../../lib/online-v2/ov2BoardPathAdapter").BoardPathViewModel} vm */
function statusBannerClass(vm) {
  if (vm.coarse === BOARD_PATH_COARSE.FINISHED) {
    return "border-violet-400/30 bg-violet-950/25 text-violet-100/95";
  }
  if (vm.coarse === BOARD_PATH_COARSE.PENDING_START || vm.coarse === BOARD_PATH_COARSE.PENDING_STAKES) {
    return "border-amber-400/30 bg-amber-950/25 text-amber-100/95";
  }
  if (
    vm.coarse === BOARD_PATH_COARSE.ACTIVE &&
    (vm.activeDetail === BOARD_PATH_ACTIVE_DETAIL.BOOTSTRAPPING_SESSION ||
      vm.activeDetail === BOARD_PATH_ACTIVE_DETAIL.SESSION_HYDRATING ||
      vm.sessionPhase === BOARD_PATH_SESSION_PHASE.READY)
  ) {
    return "border-amber-400/30 bg-amber-950/25 text-amber-100/95";
  }
  if (vm.matchDetail === BOARD_PATH_MATCH_DETAIL.YOUR_TURN) {
    return "border-emerald-500/20 bg-emerald-950/15 text-zinc-200";
  }
  if (vm.matchDetail === BOARD_PATH_MATCH_DETAIL.THEIR_TURN) {
    return "border-sky-500/20 bg-sky-950/15 text-zinc-200";
  }
  return "border-white/10 bg-white/[0.04] text-zinc-300";
}

function PlayerPanel({ title, initial, highlight, badge, connectionOk }) {
  return (
    <div
      className={`relative flex min-h-0 items-center gap-1.5 rounded-lg border px-1.5 py-1 sm:gap-2 sm:px-2 sm:py-1.5 lg:rounded-xl lg:px-2.5 ${
        highlight
          ? "border-emerald-400/55 bg-emerald-950/40 shadow-[0_0_0_1px_rgba(52,211,153,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-white/12 bg-black/35"
      }`}
    >
      {highlight ? (
        <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-emerald-500/10 to-transparent lg:rounded-xl" aria-hidden />
      ) : null}
      <div
        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-black sm:h-8 sm:w-8 sm:rounded-lg sm:text-xs lg:h-9 lg:w-9 lg:text-sm ${
          highlight ? "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40" : "bg-white/10 text-zinc-200 ring-1 ring-white/10"
        }`}
      >
        {initial}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-extrabold uppercase tracking-wide text-zinc-500 sm:text-[10px]">{title}</span>
          <span
            className={`h-1 w-1 shrink-0 rounded-full sm:h-1.5 sm:w-1.5 ${connectionOk ? "bg-emerald-400" : "bg-zinc-600"}`}
            title={connectionOk ? "Connected" : "Not connected"}
            aria-hidden
          />
        </div>
        <div className="truncate text-[10px] font-semibold text-white sm:text-[11px] lg:text-xs">{badge}</div>
      </div>
    </div>
  );
}

const PATH_TOKEN_TONE = Object.freeze({
  emerald: "bg-emerald-500/90 text-emerald-950 ring-2 ring-emerald-200/50",
  sky: "bg-sky-500/90 text-sky-950 ring-2 ring-sky-200/50",
  amber: "bg-amber-500/90 text-amber-950 ring-2 ring-amber-200/50",
  violet: "bg-violet-500/90 text-violet-950 ring-2 ring-violet-200/50",
});

/** @param {{ who: "you"|"opp", tone?: keyof typeof PATH_TOKEN_TONE }} props */
function PathToken({ who, tone }) {
  const isYou = who === "you";
  const t = tone && PATH_TOKEN_TONE[tone] ? tone : isYou ? "emerald" : "sky";
  return (
    <div
      className={`absolute left-1/2 top-1/2 z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-black shadow-md md:h-7 md:w-7 md:text-[11px] ${PATH_TOKEN_TONE[t]}`}
      aria-label={isYou ? "Your token" : "Opponent token"}
    >
      {isYou ? "Y" : "O"}
    </div>
  );
}

/** @param {{ vm: import("../../lib/online-v2/ov2BoardPathAdapter").BoardPathViewModel, youTokenTone?: keyof typeof PATH_TOKEN_TONE, oppTokenTone?: keyof typeof PATH_TOKEN_TONE }} props */
function BoardPathPlayfield({ vm, youTokenTone, oppTokenTone }) {
  const youSlot = vm.tokenSlots.you;
  const oppSlot = vm.tokenSlots.opp;
  const youTurn = vm.matchDetail === BOARD_PATH_MATCH_DETAIL.YOUR_TURN;
  const theyTurn = vm.matchDetail === BOARD_PATH_MATCH_DETAIL.THEIR_TURN;

  const sessionPending =
    vm.coarse === BOARD_PATH_COARSE.ACTIVE &&
    (vm.sessionPhase === BOARD_PATH_SESSION_PHASE.OPENING ||
      vm.sessionPhase === BOARD_PATH_SESSION_PHASE.HYDRATING ||
      vm.sessionPhase === BOARD_PATH_SESSION_PHASE.READY ||
      vm.activeDetail === BOARD_PATH_ACTIVE_DETAIL.BOOTSTRAPPING_SESSION ||
      vm.activeDetail === BOARD_PATH_ACTIVE_DETAIL.SESSION_HYDRATING);

  const edgeTone =
    vm.coarse === BOARD_PATH_COARSE.FINISHED
      ? "ring-1 ring-violet-400/35 shadow-[0_0_24px_-4px_rgba(139,92,246,0.35)]"
      : sessionPending
        ? "ring-1 ring-amber-500/25 shadow-[0_0_18px_-6px_rgba(245,158,11,0.25)]"
        : youTurn
          ? "ring-1 ring-emerald-500/25 shadow-[0_0_20px_-6px_rgba(16,185,129,0.35)]"
          : theyTurn
            ? "ring-1 ring-sky-500/25 shadow-[0_0_20px_-6px_rgba(14,165,233,0.3)]"
            : "ring-1 ring-white/10";

  return (
    <div
      className={`relative flex h-full min-h-0 w-full max-w-full flex-col justify-center rounded-lg bg-gradient-to-b from-zinc-900/90 via-zinc-950/95 to-black/80 px-1 py-1 sm:rounded-xl sm:px-1.5 sm:py-1.5 md:rounded-2xl md:px-2 md:py-2 lg:flex-1 lg:px-4 lg:py-3 ${edgeTone}`}
    >
      <div className="mb-0.5 shrink-0 text-center text-[8px] font-bold uppercase tracking-[0.14em] text-teal-200/80 sm:text-[9px] md:text-[10px]">
        Playfield
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="relative flex items-center gap-0.5 sm:gap-1 md:gap-1.5 lg:gap-2">
          <div className="shrink-0 rounded-md border border-teal-500/35 bg-teal-950/40 px-1.5 py-1 text-[8px] font-bold uppercase leading-none text-teal-100 md:px-2 md:py-1.5 md:text-[9px] lg:text-[10px]">
            Start
          </div>

          <div className="relative min-w-0 flex-1 py-2 md:py-2.5 lg:py-4">
            <div
              className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-teal-600/35 via-white/12 to-amber-600/35 md:h-1"
              aria-hidden
            />
            <div className="relative flex items-center justify-between px-0.5">
              {Array.from({ length: PATH_SLOTS }).map((_, i) => {
                const hasYou = youSlot === i;
                const hasOpp = oppSlot === i;
                const milestone = i === 0 || i === PATH_SLOTS - 1;
                return (
                  <div key={`slot-${i}`} className="relative flex w-0 flex-1 justify-center">
                    <div
                      className={`relative flex h-7 w-7 items-center justify-center md:h-8 md:w-8 lg:h-9 lg:w-9 ${
                        milestone ? "scale-105" : ""
                      }`}
                    >
                      <div
                        className={`rounded-full border-2 md:border-[2.5px] ${
                          milestone
                            ? "h-3.5 w-3.5 border-amber-400/50 bg-amber-500/15 md:h-4 md:w-4"
                            : "h-2.5 w-2.5 border-white/20 bg-zinc-900/80 md:h-3 md:w-3"
                        }`}
                      />
                      {hasYou ? <PathToken who="you" tone={youTokenTone} /> : null}
                      {hasOpp && !hasYou ? <PathToken who="opp" tone={oppTokenTone} /> : null}
                      {hasOpp && hasYou ? (
                        <div className="absolute left-1/2 top-[calc(50%+10px)] z-10 -translate-x-1/2 md:top-[calc(50%+12px)]">
                          <PathToken who="opp" tone={oppTokenTone} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className={`shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-bold uppercase leading-none md:px-2 md:py-1.5 md:text-[9px] lg:text-[10px] ${
              vm.coarse === BOARD_PATH_COARSE.FINISHED
                ? "border-violet-400/45 bg-violet-950/50 text-violet-100"
                : "border-amber-500/40 bg-amber-950/45 text-amber-100"
            }`}
          >
            Finish
          </div>
        </div>
      </div>
    </div>
  );
}
