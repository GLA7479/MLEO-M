"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import {
  createInitialOtState,
  otCanApplyLock,
  otListLegalMoveDestinations,
  otListLegalRotateRings,
} from "../../../lib/online-v2/orbit-trap/ov2OrbitTrapEngine.js";
import { orbitTrapGameStateFromRpc } from "../../../lib/online-v2/orbit-trap/ov2OrbitTrapSessionApi";
import Ov2OrbitTrapBoardView from "./Ov2OrbitTrapBoardView";

const SEAT_RING = ["ring-sky-400/80", "ring-amber-400/80", "ring-emerald-400/80", "ring-fuchsia-400/80"];

/** @param {{ ring: string; slot: number }} d */
function formatMoveDestination(d) {
  if (d.ring === "core") return "Core";
  const letter = d.ring === "outer" ? "O" : d.ring === "mid" ? "M" : "I";
  return `${letter}${d.slot + 1}`;
}

/** @param {string} ring */
function shortRingName(ring) {
  if (ring === "outer") return "Outer";
  if (ring === "mid") return "Mid";
  if (ring === "inner") return "Inner";
  return ring;
}

function boardViewPropsFromEngineState(st) {
  return {
    players: st.players,
    looseOrbs: st.looseOrbs,
    fixedOrbKeys: [...st.fixedOrbKeys],
    turnSeat: st.turnSeat,
    ringLock: st.ringLock,
  };
}

/**
 * @typedef {{
 *   room: object;
 *   members: unknown[];
 *   self: { participant_key?: string; display_name?: string };
 *   onLeaveToLobby?: () => void | Promise<void>;
 *   leaveToLobbyBusy?: boolean;
 * } | null} Ov2OrbitTrapContextInput
 */

/**
 * @param {{
 *   contextInput?: Ov2OrbitTrapContextInput;
 *   liveSessionId?: string | null;
 *   onSessionRefresh?: (previousSessionId: string | null, rpcNewSessionId: string | null, options?: unknown) => void | Promise<void>;
 *   authoritativeSnapshot?: object | null;
 *   authorityLoading?: boolean;
 *   onAuthoritativeAction?: (action: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; snapshot?: unknown }>;
 * }} props
 */
export default function Ov2OrbitTrapScreen({
  contextInput = null,
  liveSessionId = null,
  onSessionRefresh,
  authoritativeSnapshot = null,
  authorityLoading = false,
  onAuthoritativeAction,
}) {
  const [previewState] = useState(() => createInitialOtState());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");
  /** @type {'move' | 'rotate' | 'lock' | null} */
  const [actionPanel, setActionPanel] = useState(null);

  const engineState = useMemo(() => {
    if (liveSessionId && authoritativeSnapshot?.state && typeof authoritativeSnapshot.state === "object") {
      const g = orbitTrapGameStateFromRpc(/** @type {Record<string, unknown>} */ (authoritativeSnapshot.state));
      return g || previewState;
    }
    return previewState;
  }, [liveSessionId, authoritativeSnapshot, previewState]);

  const boardProps = useMemo(() => boardViewPropsFromEngineState(engineState), [engineState]);
  const legalMoves = useMemo(
    () => otListLegalMoveDestinations(engineState, engineState.turnSeat),
    [engineState]
  );
  const legalRotates = useMemo(() => otListLegalRotateRings(engineState, engineState.turnSeat), [engineState]);
  const canLock = useMemo(() => otCanApplyLock(engineState, engineState.turnSeat), [engineState]);

  const legalLockRings = useMemo(() => {
    if (!canLock) return [];
    const rings = ["outer", "mid", "inner"];
    return rings.filter(r => {
      if (engineState.ringLock && engineState.ringLock.ring === r) return false;
      return true;
    });
  }, [engineState, canLock]);

  const mySeat = authoritativeSnapshot?.mySeat ?? null;
  const isAuthoritative = Boolean(liveSessionId && authoritativeSnapshot);
  const isMyTurn =
    isAuthoritative &&
    mySeat != null &&
    engineState.phase === "playing" &&
    engineState.turnSeat === mySeat;

  const authRevision = isAuthoritative ? Number(authoritativeSnapshot?.revision) || 0 : null;

  useEffect(() => {
    setActionPanel(null);
  }, [authRevision, engineState.turnSeat, liveSessionId]);

  const subtitle = contextInput
    ? isAuthoritative
      ? "Shared room · authoritative session"
      : liveSessionId
        ? "Shared room · loading session state…"
        : "Shared room · local rules preview (no session yet)"
    : "Dev preview · add ?room=… or open from OV2 rooms";

  const roomShortId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.id != null
      ? String(contextInput.room.id).slice(0, 8)
      : "";

  const runAction = useCallback(
    async action => {
      if (!onAuthoritativeAction) return;
      setActionErr("");
      setActionBusy(true);
      try {
        const out = await onAuthoritativeAction(action);
        if (!out?.ok) {
          setActionErr(out?.error || "Action rejected.");
          return;
        }
        setActionPanel(null);
        await onSessionRefresh?.(liveSessionId, liveSessionId, {});
      } catch (e) {
        setActionErr(e?.message || String(e));
      } finally {
        setActionBusy(false);
      }
    },
    [onAuthoritativeAction, onSessionRefresh, liveSessionId]
  );

  const togglePanel = useCallback(
    /** @param {'move' | 'rotate' | 'lock'} id */ id => {
      if (!isMyTurn || actionBusy) return;
      setActionPanel(p => (p === id ? null : id));
    },
    [isMyTurn, actionBusy]
  );

  const infoPanel = (
    <div className="space-y-2 text-xs text-zinc-400">
      <ul className="list-inside list-disc space-y-1">
        <li>Collect 2 orbs, start a turn on the inner ring, then enter the Core to win.</li>
        <li>Tap Move / Rotate / Lock, pick a legal option; the server validates every action.</li>
      </ul>
      {contextInput?.room?.id ? (
        <p className="text-[10px] text-zinc-500">
          Room <span className="font-mono text-zinc-400">{roomShortId}…</span>
        </p>
      ) : null}
    </div>
  );

  const chipBase =
    "min-h-[2.75rem] min-w-[2.75rem] shrink-0 rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold leading-tight transition active:scale-[0.98] disabled:opacity-40 sm:min-h-[2.5rem] sm:text-xs";

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      {contextInput && !liveSessionId ? (
        <div className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-950/25 px-2 py-1.5 text-[10px] text-amber-100/95">
          Waiting for <span className="font-semibold">active_session_id</span>. Host can use{" "}
          <span className="font-semibold">Open match</span> in the live shell (or start from the room lobby).
        </div>
      ) : null}
      {liveSessionId && authorityLoading && !authoritativeSnapshot ? (
        <div className="shrink-0 rounded-lg border border-sky-500/25 bg-sky-950/20 px-2 py-1.5 text-[10px] text-sky-100/90">
          Syncing authoritative board…
        </div>
      ) : null}
      {actionErr ? (
        <div className="shrink-0 rounded-lg border border-red-500/30 bg-red-950/25 px-2 py-1 text-[10px] text-red-200">
          {actionErr}
        </div>
      ) : null}

      <div className="shrink-0 rounded-lg border border-white/[0.08] bg-zinc-950/55 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex flex-1 gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {engineState.players.map((p, i) => {
              const active = engineState.turnSeat === i;
              const heavy = p.orbsHeld >= 2;
              const mine = mySeat != null && mySeat === i;
              return (
                <div
                  key={i}
                  className={`flex min-w-[5.5rem] shrink-0 flex-col rounded-md border border-white/[0.06] bg-zinc-900/40 px-1.5 py-1 ${
                    active ? `ring-2 ${SEAT_RING[i]}` : "ring-2 ring-transparent"
                  }`}
                >
                  <div className="truncate text-[10px] font-semibold text-zinc-200">
                    P{i + 1}
                    {mine ? <span className="text-sky-300/90"> · you</span> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-0.5 text-[9px] text-zinc-500">
                    <span>Orbs {p.orbsHeld}</span>
                    {p.lockToken ? <span className="text-violet-300">Lock</span> : null}
                    {p.stunActive ? <span className="text-rose-300">Stun</span> : null}
                    {heavy ? <span className="text-amber-200">Heavy</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">Turn</div>
            <div className="font-mono text-xs tabular-nums text-zinc-200">P{engineState.turnSeat + 1}</div>
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-500">
              r{isAuthoritative ? authoritativeSnapshot.revision : engineState.revision}
            </div>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-white/[0.05] pt-1 text-[10px] text-zinc-500">
          <span>
            {isAuthoritative ? "Live" : "Preview"} · legal moves: {legalMoves.length}
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="text-zinc-600">No page scroll</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.07] bg-zinc-950/35">
        <Ov2OrbitTrapBoardView state={boardProps} />
      </div>

      <div className="flex min-h-0 max-h-[46%] shrink-0 flex-col gap-1 overflow-hidden rounded-lg border border-white/[0.08] bg-zinc-950/55 px-2 py-2 sm:max-h-[40%]">
        <div className="mb-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500">Actions</div>
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={!isMyTurn || actionBusy || legalMoves.length === 0 || !onAuthoritativeAction}
            onClick={() => togglePanel("move")}
            className={`rounded-lg border px-4 py-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-45 ${
              actionPanel === "move"
                ? "border-emerald-400/50 bg-emerald-900/50 text-emerald-50"
                : "border-emerald-500/25 bg-emerald-950/40 text-emerald-100/90 hover:bg-emerald-900/45"
            }`}
          >
            Move
          </button>
          <button
            type="button"
            disabled={!isMyTurn || actionBusy || legalRotates.length === 0 || !onAuthoritativeAction}
            onClick={() => togglePanel("rotate")}
            className={`rounded-lg border px-4 py-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-45 ${
              actionPanel === "rotate"
                ? "border-sky-400/50 bg-sky-900/45 text-sky-50"
                : "border-sky-500/25 bg-sky-950/35 text-sky-100/90 hover:bg-sky-900/40"
            }`}
          >
            Rotate
          </button>
          <button
            type="button"
            disabled={!isMyTurn || actionBusy || !canLock || legalLockRings.length === 0 || !onAuthoritativeAction}
            onClick={() => togglePanel("lock")}
            className={`rounded-lg border px-4 py-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-45 ${
              actionPanel === "lock"
                ? "border-violet-400/50 bg-violet-900/45 text-violet-50"
                : "border-violet-500/25 bg-violet-950/35 text-violet-100/90 hover:bg-violet-900/40"
            }`}
          >
            Lock
          </button>
        </div>

        {actionPanel === "move" && isMyTurn ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1 border-t border-white/[0.06] pt-1.5">
            <p className="shrink-0 text-[10px] font-medium text-zinc-400">Pick destination (server validates path)</p>
            <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto overscroll-contain py-0.5 [-webkit-overflow-scrolling:touch]">
              {legalMoves.map((d, idx) => (
                <button
                  key={`${d.ring}:${d.slot}:${idx}`}
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void runAction({ type: "move", toRing: d.ring, toSlot: d.slot })}
                  className={`${chipBase} border-emerald-500/35 bg-emerald-950/55 text-emerald-100 hover:border-emerald-400/55 hover:bg-emerald-900/40`}
                >
                  {formatMoveDestination(d)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {actionPanel === "rotate" && isMyTurn ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 border-t border-white/[0.06] pt-1.5">
            <p className="shrink-0 text-[10px] font-medium text-zinc-400">Ring + direction (1 slot)</p>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              {legalRotates.map(r => (
                <div
                  key={r}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-zinc-900/35 px-1.5 py-1"
                >
                  <span className="text-[11px] font-semibold text-zinc-200 sm:text-xs">{shortRingName(r)}</span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void runAction({ type: "rotate", ring: r, dir: 1 })}
                      className={`${chipBase} border-sky-500/35 bg-sky-950/50 text-sky-100 hover:border-sky-400/50`}
                      title="Clockwise"
                    >
                      CW
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void runAction({ type: "rotate", ring: r, dir: -1 })}
                      className={`${chipBase} border-sky-500/35 bg-sky-950/50 text-sky-100 hover:border-sky-400/50`}
                      title="Counter-clockwise"
                    >
                      CCW
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {actionPanel === "lock" && isMyTurn ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1 border-t border-white/[0.06] pt-1.5">
            <p className="shrink-0 text-[10px] font-medium text-zinc-400">Pick ring to lock</p>
            <div className="flex flex-wrap gap-1.5 overflow-y-auto overscroll-contain py-0.5 [-webkit-overflow-scrolling:touch]">
              {legalLockRings.map(r => (
                <button
                  key={r}
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void runAction({ type: "lock", ring: r })}
                  className={`${chipBase} border-violet-500/35 bg-violet-950/50 text-violet-100 hover:border-violet-400/55 hover:bg-violet-900/40`}
                >
                  {shortRingName(r)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {contextInput?.onLeaveToLobby ? (
          <div className="mt-1 flex shrink-0 justify-center border-t border-white/[0.06] pt-1.5">
            <button
              type="button"
              disabled={contextInput.leaveToLobbyBusy}
              onClick={() => void contextInput.onLeaveToLobby?.()}
              className="text-[10px] font-medium text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200 disabled:opacity-45"
            >
              {contextInput.leaveToLobbyBusy ? "Leaving…" : "Leave table (shell)"}
            </button>
          </div>
        ) : !contextInput ? (
          <p className="mt-1 shrink-0 border-t border-white/[0.06] pt-1.5 text-center text-[10px] text-zinc-600">
            Join an Orbit Trap room from{" "}
            <Link href="/online-v2/rooms" className="text-sky-400/90 underline underline-offset-2">
              OV2 rooms
            </Link>
            .
          </p>
        ) : null}
      </div>
    </div>
  );

  if (contextInput) {
    return body;
  }

  return (
    <OnlineV2GamePageShell
      title="Orbit Trap"
      subtitle={subtitle}
      chromePreset="ov2_board"
      useAppViewportHeight
      infoPanel={infoPanel}
    >
      {body}
    </OnlineV2GamePageShell>
  );
}
