import { useState } from "react";

/**
 * Board Path — fixed flex-column layout inside `OnlineV2GamePageShell` (no internal vertical scroll).
 *
 * DEMO_PHASE_SCAFFOLD: temporary phase picker; remove block + constant when wiring real match state.
 */

const DEMO_PHASE_SCAFFOLD = true;

const PATH_SLOTS = 6;

const PHASES = [
  { id: "disconnected", label: "Not connected" },
  { id: "waiting_opponent", label: "Waiting" },
  { id: "lobby_ready", label: "Lobby ready" },
  { id: "pending_start", label: "Pending start" },
  { id: "active_your_turn", label: "Your turn" },
  { id: "active_their_turn", label: "Their turn" },
  { id: "winner", label: "Winner" },
];

const PHASE_COPY = {
  disconnected: "Room not connected — open multiplayer from the hub when ready.",
  waiting_opponent: "Waiting for opponent to join.",
  lobby_ready: "Lobby ready — confirm when all players are set.",
  pending_start: "Match pending start — host will begin the round.",
  active_your_turn: "Match active — your move.",
  active_their_turn: "Match active — opponent is moving.",
  winner: "Match finished — board locked.",
};

/** Mock token positions on path slots 0..PATH_SLOTS-1; null = off-track / not seated yet */
const TOKEN_MOCK = {
  disconnected: { you: null, opp: null },
  waiting_opponent: { you: 0, opp: null },
  lobby_ready: { you: 0, opp: 0 },
  pending_start: { you: 1, opp: 1 },
  active_your_turn: { you: 3, opp: 2 },
  active_their_turn: { you: 2, opp: 4 },
  winner: { you: 5, opp: 5 },
};

const PLAYER_BADGES = {
  disconnected: { you: "Offline", opp: "—" },
  waiting_opponent: { you: "Seated", opp: "Waiting…" },
  lobby_ready: { you: "Ready", opp: "Ready" },
  pending_start: { you: "Ready", opp: "Ready" },
  active_your_turn: { you: "In play", opp: "In play" },
  active_their_turn: { you: "In play", opp: "In play" },
  winner: { you: "Finished", opp: "Finished" },
};

function controlConfig(phase) {
  switch (phase) {
    case "disconnected":
      return { primary: "Connect to room", secondary: "Refresh", primaryMuted: true };
    case "waiting_opponent":
      return { primary: "Waiting…", secondary: "Leave table", primaryMuted: true };
    case "lobby_ready":
      return { primary: "Ready", secondary: "Stand by", primaryMuted: true };
    case "pending_start":
      return { primary: "Roll", secondary: "Waiting…", primaryMuted: true };
    case "active_your_turn":
      return { primary: "Roll", secondary: "Choose token", primaryMuted: true };
    case "active_their_turn":
      return { primary: "Waiting…", secondary: "End turn", primaryMuted: true };
    case "winner":
      return { primary: "New match", secondary: "Rematch", primaryMuted: true };
    default:
      return { primary: "Action", secondary: "Other", primaryMuted: true };
  }
}

function connectionDot(phase) {
  const on = phase !== "disconnected";
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full sm:h-2 sm:w-2 ${on ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-zinc-600"}`}
      aria-hidden
    />
  );
}

function turnShort(phase) {
  if (phase === "winner") return "Final";
  if (phase === "active_your_turn") return "Your move";
  if (phase === "active_their_turn") return "Their move";
  return null;
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

function PathToken({ who }) {
  const isYou = who === "you";
  return (
    <div
      className={`absolute left-1/2 top-1/2 z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-black shadow-md md:h-7 md:w-7 md:text-[11px] ${
        isYou ? "bg-emerald-500/90 text-emerald-950 ring-2 ring-emerald-200/50" : "bg-sky-500/90 text-sky-950 ring-2 ring-sky-200/50"
      }`}
      aria-label={isYou ? "Your token" : "Opponent token"}
    >
      {isYou ? "Y" : "O"}
    </div>
  );
}

function BoardPathPlayfield({ phase, youTurn, theyTurn }) {
  const { you: youSlot, opp: oppSlot } = TOKEN_MOCK[phase] ?? TOKEN_MOCK.disconnected;

  const edgeTone =
    phase === "winner"
      ? "ring-1 ring-violet-400/35 shadow-[0_0_24px_-4px_rgba(139,92,246,0.35)]"
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
                      {hasYou ? <PathToken who="you" /> : null}
                      {hasOpp && !hasYou ? <PathToken who="opp" /> : null}
                      {hasOpp && hasYou ? (
                        <div className="absolute left-1/2 top-[calc(50%+10px)] z-10 -translate-x-1/2 md:top-[calc(50%+12px)]">
                          <PathToken who="opp" />
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
              phase === "winner"
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

export default function Ov2BoardPathScreen() {
  const [demoPhase, setDemoPhase] = useState("disconnected");

  const statusText = PHASE_COPY[demoPhase] ?? "";
  const youTurn = demoPhase === "active_your_turn";
  const theyTurn = demoPhase === "active_their_turn";
  const badges = PLAYER_BADGES[demoPhase] ?? PLAYER_BADGES.disconnected;
  const ctrls = controlConfig(demoPhase);

  const oppConnected = demoPhase !== "disconnected" && demoPhase !== "waiting_opponent";
  const youConnected = demoPhase !== "disconnected";
  const turnBit = turnShort(demoPhase);
  const combinedStatus = [turnBit, statusText].filter(Boolean).join(" · ");

  return (
    <div className="ov2-board-path-screen flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden text-white sm:gap-1 md:gap-1 lg:gap-1.5">
      {/* Compact match line: connection + table meta + stake */}
      <div className="flex shrink-0 items-center gap-2 rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 sm:px-2 sm:py-1 lg:rounded-lg lg:px-2.5">
        {connectionDot(demoPhase)}
        <div className="min-w-0 flex-1 truncate text-[9px] tabular-nums text-zinc-300 sm:text-[10px] lg:text-[11px]">
          <span className="font-semibold text-zinc-400">Rnd —</span>
          <span className="text-zinc-600"> · </span>
          <span className="text-zinc-400">Tbl —</span>
        </div>
        <div className="shrink-0 text-[9px] tabular-nums text-emerald-100/80 sm:text-[10px]">
          <span className="text-zinc-500">Stk</span> —
        </div>
      </div>

      {/* Status + phase (single line; full text in title for accessibility) */}
      <div
        title={combinedStatus}
        className={`shrink-0 truncate rounded-md border px-1.5 py-0.5 text-center text-[9px] leading-tight sm:px-2 sm:text-[10px] lg:py-1 lg:text-[11px] ${
          demoPhase === "pending_start"
            ? "border-amber-400/30 bg-amber-950/25 text-amber-100/95"
            : demoPhase === "winner"
              ? "border-violet-400/30 bg-violet-950/25 text-violet-100/95"
              : youTurn
                ? "border-emerald-500/20 bg-emerald-950/15 text-zinc-200"
                : theyTurn
                  ? "border-sky-500/20 bg-sky-950/15 text-zinc-200"
                  : "border-white/10 bg-white/[0.04] text-zinc-300"
        }`}
      >
        {combinedStatus}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-1 sm:gap-1.5 lg:gap-2">
        <PlayerPanel title="You" initial="Y" highlight={youTurn} badge={badges.you} connectionOk={youConnected} />
        <PlayerPanel title="Opp" initial="O" highlight={theyTurn} badge={badges.opp} connectionOk={oppConnected} />
      </div>

      {/* Main board surface — largest flex zone */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/15 bg-gradient-to-b from-zinc-900/80 to-black/50 md:rounded-xl lg:rounded-2xl lg:border-white/20">
        <div className="flex h-full min-h-0 flex-col p-0.5 sm:p-1 md:p-1.5 lg:p-3">
          <BoardPathPlayfield phase={demoPhase} youTurn={youTurn} theyTurn={theyTurn} />
        </div>
      </div>

      {/* Controls — above shell reserved ad slot */}
      <div className="flex shrink-0 flex-col gap-1 md:gap-1.5 lg:flex-row lg:items-stretch lg:gap-2">
        <button
          type="button"
          disabled
          className={`min-h-[40px] flex-1 rounded-lg border py-2 text-[11px] font-bold md:min-h-[44px] md:text-xs lg:rounded-xl lg:py-2.5 lg:text-sm ${
            ctrls.primaryMuted
              ? "border-white/12 bg-white/[0.06] text-zinc-400"
              : "border-emerald-500/40 bg-emerald-900/30 text-emerald-100"
          }`}
        >
          {ctrls.primary}
        </button>
        <button
          type="button"
          disabled
          className="min-h-[40px] flex-1 rounded-lg border border-white/12 bg-black/35 py-2 text-[11px] font-semibold text-zinc-400 md:min-h-[44px] md:text-xs lg:rounded-xl lg:py-2.5 lg:text-sm"
        >
          {ctrls.secondary}
        </button>
      </div>

      {DEMO_PHASE_SCAFFOLD ? (
        /* DEMO_PHASE_SCAFFOLD – remove when real match state exists */
        <div className="demo-phase-scaffold flex shrink-0 items-center justify-end gap-1.5 border-t border-white/[0.04] pt-0.5 opacity-50">
          <label className="sr-only" htmlFor="ov2-bp-demo-phase">
            Demo phase (temporary)
          </label>
          <span className="hidden text-[7px] font-medium uppercase tracking-wide text-zinc-600 sm:inline">Dev</span>
          <select
            id="ov2-bp-demo-phase"
            value={demoPhase}
            onChange={e => setDemoPhase(e.target.value)}
            className="max-w-[9.5rem] rounded border border-white/[0.08] bg-black/40 py-px pl-1 pr-4 text-[8px] text-zinc-500 sm:max-w-[11rem] sm:text-[9px]"
          >
            {PHASES.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
