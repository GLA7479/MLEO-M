"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import {
  createInitialOtState,
  otActiveRoster,
  otCanApplyLock,
  otListLegalMoveDestinations,
  otListLegalRotateRings,
} from "../../../lib/online-v2/orbit-trap/ov2OrbitTrapEngine.js";
import { ov2OrbitTrapCellKey } from "../../../lib/online-v2/orbit-trap/ov2OrbitTrapBoardSpec.js";
import { orbitTrapGameStateFromRpc } from "../../../lib/online-v2/orbit-trap/ov2OrbitTrapSessionApi";
import Ov2OrbitTrapBoardView from "./Ov2OrbitTrapBoardView";
import Ov2OrbitTrapHelpPanel from "./Ov2OrbitTrapHelpPanel";

const finishDismissStorageKey = sid => `ov2_orbit_trap_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_FINISH_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** Same shape as Snakes `readOv2MemberRematchRequested` — includes Orbit Trap buckets for future parity. */
function readOv2MemberRematchRequested(meta) {
  const raw = meta && typeof meta === "object" ? meta : null;
  if (!raw) return false;
  for (const key of ["ludo", "snakes", "ov2_snakes", "orbit_trap", "ov2_orbit_trap"]) {
    const bucket = raw[key];
    if (!bucket || typeof bucket !== "object") continue;
    if (bucket.rematch_requested === true || bucket.rematch_requested === "true" || bucket.rematch_requested === 1) return true;
  }
  return false;
}

const SEAT_RING = ["ring-sky-400/80", "ring-amber-400/80", "ring-emerald-400/80", "ring-fuchsia-400/80"];

/** Status tags: mobile 7px compact pad; desktop 8px one line, no scroll. */
const OT_SEAT_MOB_TAG =
  "shrink-0 rounded border px-0.5 py-px text-[7px] font-bold uppercase leading-none tracking-wide";
const OT_SEAT_DESK_TAG =
  "shrink-0 rounded border px-1 py-px text-[8px] font-bold uppercase leading-none tracking-wide";

function boardViewPropsFromEngineState(st) {
  return {
    players: st.players,
    looseOrbs: st.looseOrbs,
    fixedOrbKeys: [...st.fixedOrbKeys],
    turnSeat: st.turnSeat,
    ringLock: st.ringLock,
    phase: st.phase,
    activeSeats: st.activeSeats?.length >= 2 ? st.activeSeats : [0, 1, 2, 3],
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
  const router = useRouter();
  const [previewState] = useState(() => createInitialOtState());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState("");
  /** @type {'move' | 'rotate' | 'lock' | null} */
  const [actionPanel, setActionPanel] = useState(null);
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [rematchIntentBusy, setRematchIntentBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);

  const engineState = useMemo(() => {
    if (liveSessionId && authoritativeSnapshot?.state && typeof authoritativeSnapshot.state === "object") {
      const raw = { .../** @type {Record<string, unknown>} */ (authoritativeSnapshot.state) };
      const innerAct = raw.activeSeats;
      if (!Array.isArray(innerAct) || innerAct.length < 2) {
        const top = authoritativeSnapshot.activeSeats;
        if (Array.isArray(top) && top.length >= 2) raw.activeSeats = top;
      }
      const g = orbitTrapGameStateFromRpc(raw);
      return g || previewState;
    }
    return previewState;
  }, [liveSessionId, authoritativeSnapshot, previewState]);

  const roster = useMemo(() => otActiveRoster(engineState), [engineState]);
  const rosterSet = useMemo(() => new Set(roster), [roster]);
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
  /** Require embedded game state so we never show preview legals as "Live". */
  const isAuthoritative = Boolean(
    liveSessionId &&
      authoritativeSnapshot &&
      authoritativeSnapshot.state &&
      typeof authoritativeSnapshot.state === "object"
  );

  const room = contextInput?.room;
  const roomId = room && typeof room === "object" && room.id != null ? String(room.id).trim() : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const selfKey = pk;
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const roomMembers = members;
  const roomHostKey = String(room?.host_participant_key || "").trim();
  const isHost = Boolean(selfKey && roomHostKey && selfKey === roomHostKey);
  const myMemberRow = useMemo(
    () => roomMembers.find(m => m && typeof m === "object" && String(m.participant_key || "").trim() === selfKey),
    [roomMembers, selfKey]
  );
  const seatedCommitted = useMemo(
    () => roomMembers.filter(m => m?.seat_index != null && String(m?.wallet_state || "").trim() === "committed"),
    [roomMembers]
  );
  const eligibleRematch = seatedCommitted.length;
  const readyRematch = useMemo(
    () => seatedCommitted.filter(m => readOv2MemberRematchRequested(m?.meta)).length,
    [seatedCommitted]
  );
  const myRematchRequested = (() => readOv2MemberRematchRequested(myMemberRow?.meta))();

  const snapPhase = String(authoritativeSnapshot?.phase || "").toLowerCase();
  const finished =
    isAuthoritative && (engineState.phase === "finished" || snapPhase === "finished");
  const winnerSeatSnap =
    authoritativeSnapshot?.winnerSeat != null && authoritativeSnapshot.winnerSeat !== ""
      ? Number(authoritativeSnapshot.winnerSeat)
      : null;
  const winnerFromResult =
    winnerSeatSnap != null && Number.isInteger(winnerSeatSnap) && winnerSeatSnap >= 0 && winnerSeatSnap <= 3
      ? winnerSeatSnap
      : engineState.winnerSeat != null
        ? engineState.winnerSeat
        : null;
  /** Snapshot does not yet expose `result` (prize / loss); parity with Snakes layout when unset. */
  const prizeTotal = null;
  const lossPerSeat = null;
  const didIWin = finished && mySeat != null && winnerFromResult != null && Number(mySeat) === Number(winnerFromResult);
  const winnerNet =
    prizeTotal != null && lossPerSeat != null ? Math.max(0, Math.floor(prizeTotal - lossPerSeat)) : null;

  const isFinished = finished;
  const baseRematchEligible =
    isFinished &&
    mySeat != null &&
    String(myMemberRow?.wallet_state || "").trim() === "committed" &&
    eligibleRematch >= 2 &&
    eligibleRematch <= 4;
  const finishActionsLocked = false;
  const canHostStartNextMatch =
    isFinished && isHost && eligibleRematch >= 2 && readyRematch >= eligibleRematch && !startNextBusy;

  const finishSessionId = isFinished
    ? String(authoritativeSnapshot?.sessionId || "").trim() ||
      String(room && typeof room === "object" && room.active_session_id != null ? room.active_session_id : "").trim() ||
      (roomId ? `room:${roomId}` : "")
    : "";
  const finishModalDismissed =
    finishSessionId.length > 0 &&
    (finishModalDismissedSessionId === finishSessionId ||
      (typeof window !== "undefined" &&
        (() => {
          try {
            return window.sessionStorage.getItem(finishDismissStorageKey(finishSessionId)) === "1";
          } catch {
            return false;
          }
        })()));
  const showResultModal = Boolean(contextInput && isFinished && !finishModalDismissed);

  const dismissFinishModal = useCallback(() => {
    if (!finishSessionId) return;
    setFinishModalDismissedSessionId(finishSessionId);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
      }
    } catch {
      /* ignore */
    }
  }, [finishSessionId]);

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false, error: "missing" };
    return { ok: false, error: "Orbit Trap rematch RPC not wired yet" };
  }, [roomId, selfKey]);
  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false, error: "missing" };
    return { ok: false, error: "Orbit Trap rematch RPC not wired yet" };
  }, [roomId, selfKey]);
  const startNextMatch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false, error: "missing" };
    return { ok: false, error: "Orbit Trap start-next RPC not wired yet" };
  }, [roomId, selfKey]);

  const finishOutcome = useMemo(() => {
    if (!isFinished) return "unknown";
    if (winnerFromResult == null) return "unknown";
    if (mySeat == null) return "unknown";
    if (Number(mySeat) === Number(winnerFromResult)) return "win";
    return "loss";
  }, [isFinished, winnerFromResult, mySeat]);

  const finishTitle = useMemo(() => {
    if (!isFinished) return "";
    if (finishOutcome === "unknown") return "Match finished";
    if (finishOutcome === "win") return "Victory";
    return "Defeat";
  }, [isFinished, finishOutcome]);

  const finishReasonLine = useMemo(() => {
    if (!isFinished) return "";
    if (winnerFromResult != null) return `Winner: Seat ${winnerFromResult + 1}`;
    return "Match complete";
  }, [isFinished, winnerFromResult]);

  const finishAmountLine = useMemo(() => {
    if (!isFinished) return { text: "—", className: "text-zinc-500" };
    if (didIWin && winnerNet != null && prizeTotal != null) {
      return {
        text: `+${winnerNet.toLocaleString()} MLEO (pot ${prizeTotal.toLocaleString()})`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (didIWin && prizeTotal != null) {
      return {
        text: `Pot ${prizeTotal.toLocaleString()}`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (!didIWin && mySeat != null && winnerFromResult != null && lossPerSeat != null) {
      return {
        text: `−${lossPerSeat.toLocaleString()} MLEO`,
        className: "font-semibold tabular-nums text-rose-300/95",
      };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [isFinished, didIWin, winnerNet, prizeTotal, mySeat, winnerFromResult, lossPerSeat]);

  const currentMultiplier = 1;

  const isMyTurn =
    isAuthoritative &&
    mySeat != null &&
    engineState.phase === "playing" &&
    engineState.turnSeat === mySeat;

  /** Same keys as board highlights — client hints only; server validates. */
  const legalMoveCellKeys = useMemo(() => {
    if (!isMyTurn || actionPanel !== "move") return null;
    return new Set(legalMoves.map(d => ov2OrbitTrapCellKey(d.ring, d.slot)));
  }, [isMyTurn, actionPanel, legalMoves]);

  const legalRotateRingSet = useMemo(() => {
    if (!isMyTurn || actionPanel !== "rotate") return null;
    return new Set(legalRotates.map(String));
  }, [isMyTurn, actionPanel, legalRotates]);

  const legalLockRingSet = useMemo(() => {
    if (!isMyTurn || actionPanel !== "lock") return null;
    return new Set(legalLockRings.map(String));
  }, [isMyTurn, actionPanel, legalLockRings]);

  /** Context for assistive tech only (no visible row — avoids layout jump / removed HUD line). */
  const chooserStatusLine = useMemo(() => {
    if (isAuthoritative && engineState.phase === "finished") return "Match finished.";
    if (!isMyTurn) return "Waiting for your turn.";
    if (!actionPanel) return "Pick a mode, then play on the board.";
    if (actionPanel === "move") return "Move: tap highlighted cells or Core on the board.";
    if (actionPanel === "rotate") return "Rotate: tap the ring controls on the board.";
    if (actionPanel === "lock") return "Lock: tap a highlighted lock cell on the board.";
    return "";
  }, [isAuthoritative, engineState.phase, isMyTurn, actionPanel]);

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
    <Ov2OrbitTrapHelpPanel
      roomSnippet={
        contextInput?.room?.id ? (
          <p>
            Room <span className="font-mono text-zinc-400">{roomShortId}…</span>
          </p>
        ) : null
      }
    />
  );

  const boardInteractive = Boolean(
    isMyTurn && !actionBusy && onAuthoritativeAction && engineState.phase === "playing"
  );

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
      {contextInput && !liveSessionId ? (
        <div className="flex h-[1.625rem] min-h-[1.625rem] max-h-[1.625rem] shrink-0 items-center overflow-hidden rounded-lg border border-amber-500/30 bg-amber-950/25 px-2 text-[10px] leading-tight text-amber-100/95">
          <span className="min-w-0 truncate">
            Waiting for <span className="font-semibold">active_session_id</span>. Host can use{" "}
            <span className="font-semibold">Open match</span> in the live shell (or start from the room lobby).
          </span>
        </div>
      ) : null}
      {liveSessionId && authorityLoading && !authoritativeSnapshot ? (
        <div className="flex h-[1.625rem] min-h-[1.625rem] max-h-[1.625rem] shrink-0 items-center overflow-hidden rounded-lg border border-sky-500/25 bg-sky-950/20 px-2 text-[10px] text-sky-100/90">
          <span className="truncate">Syncing authoritative board…</span>
        </div>
      ) : null}
      {contextInput ? (
        <div
          className="flex min-h-[1rem] max-h-[1.125rem] shrink-0 items-center overflow-hidden rounded-lg border border-transparent px-0.5"
          aria-live="polite"
        >
          {actionErr ? (
            <div className="w-full truncate rounded-lg border border-red-500/30 bg-red-950/25 px-2 py-0.5 text-[10px] leading-tight text-red-200">
              {actionErr}
            </div>
          ) : (
            <span className="block h-px w-full shrink-0 select-none opacity-0" aria-hidden>
              .
            </span>
          )}
        </div>
      ) : actionErr ? (
        <div className="shrink-0 rounded-lg border border-red-500/30 bg-red-950/25 px-2 py-1 text-[10px] text-red-200">
          {actionErr}
        </div>
      ) : null}

      <div className="-mt-2.5 shrink-0 rounded-lg border border-white/[0.08] bg-zinc-950/75 px-1 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:-mt-3">
        <div className="grid min-h-0 grid-cols-4 gap-1 sm:gap-1.5">
          {[0, 1, 2, 3].map(i => {
            const inMatch = rosterSet.has(i);
            const p = engineState.players[i];
            const active = inMatch && engineState.turnSeat === i;
            const heavy = inMatch && p.orbsHeld >= 2;
            const mine = inMatch && mySeat != null && mySeat === i;
            const shellTone = !inMatch
              ? "border-dashed border-white/[0.08] bg-zinc-950/30 opacity-50 grayscale"
              : active
                ? `border-amber-400/40 bg-gradient-to-b from-amber-950/45 to-zinc-950/55 ring-2 ${SEAT_RING[i]}`
                : "border-white/[0.06] bg-zinc-900/40 opacity-[0.78]";
            const statusDefs = [
              {
                key: "lock",
                show: Boolean(p.lockToken),
                skin: "border-violet-500/30 bg-violet-950/45 text-violet-100",
                label: "lock",
              },
              {
                key: "stun",
                show: Boolean(p.stunActive),
                skin: "border-rose-500/30 bg-rose-950/40 text-rose-100",
                label: "stun",
              },
              {
                key: "slow",
                show: Boolean(p.trapSlowPending),
                skin: "border-rose-400/25 bg-rose-950/35 text-rose-100/95",
                label: "slow",
              },
              {
                key: "boost",
                show: Boolean(p.boostPending),
                skin: "border-emerald-500/28 bg-emerald-950/40 text-emerald-100",
                label: "boost",
              },
              {
                key: "heavy",
                show: Boolean(heavy),
                skin: "border-amber-500/35 bg-amber-950/45 text-amber-100",
                label: "heavy",
              },
            ];
            const tagsMobile = statusDefs
              .filter(d => d.show)
              .map(d => (
                <span key={d.key} className={`${OT_SEAT_MOB_TAG} ${d.skin}`}>
                  {d.label}
                </span>
              ));
            const tagsDesktop = statusDefs
              .filter(d => d.show)
              .map(d => (
                <span key={d.key} className={`${OT_SEAT_DESK_TAG} ${d.skin}`}>
                  {d.label}
                </span>
              ));
            const orbTone = !inMatch
              ? "border-white/[0.08] bg-zinc-900/80 text-zinc-500"
              : p.orbsHeld > 0
                ? "border-amber-400/50 bg-gradient-to-b from-amber-900/55 to-amber-950/80 text-amber-50"
                : "border-white/14 bg-zinc-900/75 text-zinc-400";
            return (
              <div
                key={i}
                className={`box-border flex min-w-0 flex-col rounded-md border px-1 py-0 sm:px-1.5 sm:py-0.5 ${shellTone} h-[5rem] min-h-[5rem] max-h-[5rem] sm:h-[4.75rem] sm:min-h-[4.75rem] sm:max-h-[4.75rem]`}
              >
                {/* Mobile: h-[5rem] card; row1 h-5; row2 h-7; orb w-[1.7rem] text-[11px]; tags scroll */}
                <div className="flex h-full min-h-0 flex-col sm:hidden">
                  <div className="flex h-5 min-h-5 max-h-5 flex-none flex-nowrap items-center gap-1 overflow-hidden">
                    <span
                      className={`min-w-0 flex-1 truncate whitespace-nowrap text-left text-[10px] font-extrabold tabular-nums leading-none ${mine ? "text-sky-200" : inMatch ? "text-zinc-100" : "text-zinc-500"}`}
                    >
                      P{i + 1}
                    </span>
                    <div className="flex h-5 w-[2.05rem] shrink-0 items-center justify-center">
                      {inMatch && mine ? (
                        <span className="shrink-0 rounded-sm bg-sky-500/30 px-1 py-px text-[7px] font-black uppercase leading-none text-sky-100">
                          You
                        </span>
                      ) : (
                        <span
                          className="pointer-events-none select-none rounded-sm bg-sky-500/30 px-1 py-px text-[7px] font-black uppercase leading-none text-sky-100 opacity-0"
                          aria-hidden
                        >
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-0.5 flex h-7 min-h-7 max-h-7 flex-none flex-nowrap items-center gap-1 overflow-hidden">
                    <div className="flex h-7 w-[1.7rem] shrink-0 items-center justify-center">
                      <span
                        className={`flex h-7 w-full max-w-[1.7rem] items-center justify-center rounded-md border text-[11px] font-black tabular-nums leading-none shadow-inner ${orbTone}`}
                        title={inMatch ? `Orbs held: ${p.orbsHeld}` : "Bench"}
                      >
                        {inMatch ? p.orbsHeld : "–"}
                      </span>
                    </div>
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-hidden [-webkit-overflow-scrolling:touch]">
                      <div className="flex h-7 min-h-7 max-h-7 flex-nowrap items-center gap-0.5 overflow-x-auto overflow-y-hidden pr-px">
                        {inMatch ? (
                          tagsMobile.length > 0 ? (
                            tagsMobile
                          ) : null
                        ) : (
                          <span className="shrink-0 text-[7px] font-semibold text-zinc-600">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Desktop: row1 h-5 P# text-[13px]; row2 h-7 orb w-[2rem] text-[12px]; tags 8px one line */}
                <div className="hidden h-full min-h-0 flex-col sm:flex">
                  <div className="flex h-5 min-h-5 max-h-5 flex-none flex-nowrap items-center gap-1.5 overflow-hidden">
                    <span
                      className={`min-w-0 flex-1 truncate whitespace-nowrap text-left text-[13px] font-extrabold tabular-nums leading-none ${mine ? "text-sky-200" : inMatch ? "text-zinc-100" : "text-zinc-500"}`}
                    >
                      P{i + 1}
                    </span>
                    <div className="flex h-5 w-[2.25rem] shrink-0 items-center justify-center">
                      {inMatch && mine ? (
                        <span className="shrink-0 rounded-sm bg-sky-500/30 px-1.5 py-px text-[8px] font-black uppercase leading-none text-sky-100">
                          You
                        </span>
                      ) : (
                        <span
                          className="pointer-events-none select-none rounded-sm bg-sky-500/30 px-1.5 py-px text-[8px] font-black uppercase leading-none text-sky-100 opacity-0"
                          aria-hidden
                        >
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-0.5 flex h-7 min-h-7 max-h-7 flex-none flex-nowrap items-center gap-1.5 overflow-hidden">
                    <div className="flex h-7 w-[2rem] shrink-0 items-center justify-center">
                      <span
                        className={`flex h-7 w-full max-w-[2rem] items-center justify-center rounded-md border text-[12px] font-black tabular-nums leading-none shadow-inner ${orbTone}`}
                        title={inMatch ? `Orbs held: ${p.orbsHeld}` : "Bench"}
                      >
                        {inMatch ? p.orbsHeld : "–"}
                      </span>
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-hidden overflow-y-hidden">
                      {inMatch ? (
                        tagsDesktop.length > 0 ? (
                          tagsDesktop
                        ) : null
                      ) : (
                        <span className="shrink-0 text-[8px] font-semibold text-zinc-600">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/[0.1] bg-gradient-to-b from-zinc-950/80 to-zinc-950/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:mt-2.5">
        <div className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden lg:items-center lg:justify-center">
          <Ov2OrbitTrapBoardView
            state={boardProps}
            mySeat={isAuthoritative ? mySeat : null}
            rosterSeatIndices={roster}
            highlightLegalMoveKeys={legalMoveCellKeys}
            highlightRotateRings={legalRotateRingSet}
            highlightLockRings={legalLockRingSet}
            actionMode={actionPanel}
            boardInteractive={boardInteractive}
            onMovePick={(ring, slot) => void runAction({ type: "move", toRing: ring, toSlot: slot })}
            onRotatePick={(ring, dir) => void runAction({ type: "rotate", ring, dir })}
            onLockPick={ring => void runAction({ type: "lock", ring })}
          />
        </div>
      </div>

      {(contextInput?.onLeaveToLobby || !finished) && !(finished && showResultModal) ? (
        <div className="flex w-full shrink-0 flex-col rounded-lg border border-white/[0.08] bg-zinc-950/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex min-h-[2.75rem] max-w-full flex-nowrap items-center justify-center gap-1 overflow-hidden border-t border-white/[0.06] px-1 py-1">
            <button
              type="button"
              disabled={finished || !isMyTurn || actionBusy || legalMoves.length === 0 || !onAuthoritativeAction}
              onClick={() => togglePanel("move")}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] disabled:opacity-45 ${
                actionPanel === "move"
                  ? "border-emerald-400/55 bg-emerald-900/55 text-emerald-50"
                  : "border-emerald-500/20 bg-emerald-950/30 text-emerald-100/90 hover:bg-emerald-900/40"
              }`}
            >
              Move
            </button>
            <button
              type="button"
              disabled={finished || !isMyTurn || actionBusy || legalRotates.length === 0 || !onAuthoritativeAction}
              onClick={() => togglePanel("rotate")}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] disabled:opacity-45 ${
                actionPanel === "rotate"
                  ? "border-sky-400/55 bg-sky-900/50 text-sky-50"
                  : "border-sky-500/20 bg-sky-950/30 text-sky-100/90 hover:bg-sky-900/40"
              }`}
            >
              Rotate
            </button>
            <button
              type="button"
              disabled={
                finished || !isMyTurn || actionBusy || !canLock || legalLockRings.length === 0 || !onAuthoritativeAction
              }
              onClick={() => togglePanel("lock")}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98] disabled:opacity-45 ${
                actionPanel === "lock"
                  ? "border-violet-400/55 bg-violet-900/50 text-violet-50"
                  : "border-violet-500/20 bg-violet-950/30 text-violet-100/90 hover:bg-violet-900/40"
              }`}
            >
              Lock
            </button>
          </div>
          <p className="sr-only">{chooserStatusLine}</p>

          {contextInput?.onLeaveToLobby ? (
            <div className="flex shrink-0 justify-center border-t border-white/[0.06] py-1">
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
      ) : !contextInput ? (
        <div className="flex w-full shrink-0 flex-col rounded-lg border border-white/[0.08] bg-zinc-950/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="mt-1 shrink-0 border-t border-white/[0.06] px-1 py-1.5 text-center text-[10px] text-zinc-600">
            Join an Orbit Trap room from{" "}
            <Link href="/online-v2/rooms" className="text-sky-400/90 underline underline-offset-2">
              OV2 rooms
            </Link>
            .
          </p>
        </div>
      ) : null}
    </div>
  );

  const finishModal =
    showResultModal ? (
      <Ov2SharedFinishModalFrame titleId="ov2-orbit-trap-finish-title">
        <div
          className={[
            "border-b px-4 pb-3 pt-4",
            finishOutcome === "win"
              ? "border-emerald-500/20 bg-gradient-to-br from-emerald-950/45 to-zinc-950/80"
              : finishOutcome === "loss"
                ? "border-rose-500/20 bg-gradient-to-br from-rose-950/40 to-zinc-950/80"
                : "border-white/[0.07] bg-zinc-950/60",
          ].join(" ")}
        >
          <div className="flex items-start gap-3">
            <span
              className={[
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl shadow-inner",
                finishOutcome === "win" && "border-emerald-500/45 bg-emerald-950/60 text-emerald-200",
                finishOutcome === "loss" && "border-rose-500/45 bg-rose-950/55 text-rose-200",
                finishOutcome === "unknown" && "border-white/10 bg-zinc-900/80 text-zinc-200",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-hidden
            >
              {finishOutcome === "win" ? "🏆" : finishOutcome === "loss" ? "✕" : "⎔"}
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Round result</p>
              <h2
                id="ov2-orbit-trap-finish-title"
                className={[
                  "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                  finishOutcome === "win" && "text-emerald-400",
                  finishOutcome === "loss" && "text-rose-400",
                  finishOutcome === "unknown" && "text-zinc-100",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {finishTitle}
              </h2>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{currentMultiplier}</p>
              <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                <p className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}>
                  {finishAmountLine.text}
                </p>
              </div>
              <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{finishReasonLine}</p>
              {mySeat == null && prizeTotal != null && winnerFromResult != null ? (
                <p className="mt-2 text-center text-[10px] text-zinc-500">
                  Spectator · winner S{winnerFromResult + 1} · pot {prizeTotal.toLocaleString()}
                </p>
              ) : null}
              <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                {finishActionsLocked
                  ? "Sending results to your balance…"
                  : eligibleRematch >= 2
                    ? `Rematch ready: ${readyRematch}/${eligibleRematch} seated players — then host starts next.`
                    : "Round complete — rematch, then host starts next."}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-4 py-4">
          <button
            type="button"
            disabled={rematchIntentBusy || myRematchRequested || !baseRematchEligible || finishActionsLocked}
            onClick={async () => {
              if (!baseRematchEligible || finishActionsLocked) return;
              setRematchIntentBusy(true);
              try {
                const r = await requestRematch();
                if (!r?.ok && r?.error) console.warn("[Orbit Trap rematch intent]", r.error);
              } finally {
                setRematchIntentBusy(false);
              }
            }}
            className={BTN_PRIMARY + " w-full"}
          >
            {rematchIntentBusy && !myRematchRequested ? "Requesting…" : "Request rematch"}
          </button>
          <button
            type="button"
            disabled={rematchIntentBusy || !myRematchRequested || !baseRematchEligible}
            onClick={async () => {
              if (!baseRematchEligible) return;
              setRematchIntentBusy(true);
              try {
                const r = await cancelRematch();
                if (!r?.ok && r?.error) console.warn("[Orbit Trap rematch cancel]", r.error);
              } finally {
                setRematchIntentBusy(false);
              }
            }}
            className={BTN_SECONDARY + " w-full"}
          >
            Cancel rematch
          </button>
          <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
            <button
              type="button"
              className={BTN_PRIMARY + " w-full rounded-none"}
              disabled={!isHost || startNextBusy || finishActionsLocked || !canHostStartNextMatch}
              title={!isHost ? "Only the host can start the next match" : undefined}
              onClick={async () => {
                if (!canHostStartNextMatch || finishActionsLocked) return;
                const prevSessionId =
                  contextInput?.room?.active_session_id != null ? String(contextInput.room.active_session_id) : "";
                setStartNextBusy(true);
                try {
                  const r = await startNextMatch();
                  if (r?.ok) {
                    try {
                      window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
                    } catch {
                      /* ignore */
                    }
                    if (onSessionRefresh) {
                      await onSessionRefresh(prevSessionId, "", { expectClearedSession: true });
                    }
                    await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
                  } else if (r?.error) {
                    console.warn("[Orbit Trap start next match]", r.error);
                  }
                } finally {
                  setStartNextBusy(false);
                }
              }}
            >
              {startNextBusy ? "Starting…" : "Start next (host)"}
            </button>
            <p className="px-2 py-1.5 text-center text-[11px] text-zinc-500">
              Host starts the next match when all seated players rematch.
            </p>
          </div>
          <button type="button" className={BTN_SECONDARY + " w-full"} onClick={dismissFinishModal}>
            Dismiss
          </button>
          <button
            type="button"
            disabled={exitBusy || !selfKey}
            className={BTN_FINISH_DANGER + " w-full"}
            onClick={async () => {
              if (!selfKey) return;
              setExitErr("");
              setExitBusy(true);
              try {
                await leaveOv2RoomWithForfeitRetry({
                  room: contextInput?.room,
                  room_id: roomId,
                  participant_key: selfKey,
                });
                try {
                  window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
                } catch {
                  /* ignore */
                }
                await router.replace("/online-v2/rooms");
              } catch (e) {
                setExitErr(e?.message || "Could not leave room.");
              } finally {
                setExitBusy(false);
              }
            }}
          >
            {exitBusy ? "Leaving…" : "Leave table"}
          </button>
          {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
        </div>
      </Ov2SharedFinishModalFrame>
    ) : null;

  if (contextInput) {
    return (
      <>
        {body}
        {finishModal}
      </>
    );
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
