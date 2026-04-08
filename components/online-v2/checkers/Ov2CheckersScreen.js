"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  normalizeOv2CheckersCells,
  ov2CheckersForcedMenCaptureFromIndices,
  ov2CheckersLegalTosForFrom,
  ov2CheckersServerToViewIdx,
  ov2CheckersSideHasMenCapture,
  ov2CheckersViewToServerIdx,
} from "../../../lib/online-v2/checkers/ov2CheckersClientLegality";
import { useOv2CheckersSession } from "../../../hooks/useOv2CheckersSession";
import { useOv2MatchSnapshotWait } from "../../../hooks/useOv2MatchSnapshotWait";
import Ov2BoardDuelPlayerHeader from "../shared/Ov2BoardDuelPlayerHeader";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import Ov2SharedStakeDoubleModal from "../Ov2SharedStakeDoubleModal";

const finishDismissStorageKey = sid => `ov2_ck_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
/** Same tokens as `Ov2FourLineScreen` / dominoes finish modal */
const BTN_FINISH_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2CheckersScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2CheckersSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
    err,
    setErr,
    applyStep,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;
  const [selViewIdx, setSelViewIdx] = useState(/** @type {number|null} */ (null));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const roomHasActiveSession =
    room?.active_session_id != null && String(room.active_session_id).trim() !== "";
  const { matchSnapshotTimedOut } = useOv2MatchSnapshotWait(roomHasActiveSession, Boolean(snapshot));

  const seatDisplayName = useMemo(() => {
    /** @type {{ 0: string, 1: string }} */
    const out = { 0: "", 1: "" };
    for (const m of members) {
      const si = m?.seat_index;
      if (si !== 0 && si !== 1) continue;
      out[si] = String(m?.display_name ?? "").trim();
    }
    return out;
  }, [members]);
  const seat0Label = seatDisplayName[0] ? seatDisplayName[0] : "Guest";
  const seat1Label = seatDisplayName[1] ? seatDisplayName[1] : "Guest";

  const indicatorSeat = useMemo(() => {
    if (String(vm.phase || "").toLowerCase() !== "playing") return null;
    if (vm.mustRespondDouble && vm.pendingDouble?.responder_seat != null) {
      const rs = Number(vm.pendingDouble.responder_seat);
      if (rs === 0 || rs === 1) return rs;
    }
    const t = vm.turnSeat;
    return t === 0 || t === 1 ? t : null;
  }, [vm.phase, vm.mustRespondDouble, vm.pendingDouble, vm.turnSeat]);

  const canOfferDoubleNow =
    vm.phase === "playing" &&
    vm.mySeat === vm.turnSeat &&
    vm.mustRespondDouble !== true &&
    vm.canOfferDouble === true;

  useEffect(() => {
    setSelViewIdx(null);
  }, [vm.sessionId, vm.revision]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  const cells = useMemo(() => normalizeOv2CheckersCells(vm.cells), [vm.cells]);
  const chainAt = vm.jumpChainAt;
  const turn = vm.turnSeat != null ? Number(vm.turnSeat) : null;
  const mySeat = vm.mySeat;

  const legalTosServer = useMemo(() => {
    if (turn == null || mySeat == null) return [];
    const fromServer =
      chainAt != null ? chainAt : selViewIdx != null ? ov2CheckersViewToServerIdx(selViewIdx, mySeat) : null;
    if (fromServer == null) return [];
    return ov2CheckersLegalTosForFrom(cells, turn, chainAt, fromServer);
  }, [cells, turn, chainAt, mySeat, selViewIdx]);

  const legalTosViewSet = useMemo(() => {
    const s = new Set();
    if (mySeat == null) return s;
    for (const t of legalTosServer) {
      s.add(ov2CheckersServerToViewIdx(t, mySeat));
    }
    return s;
  }, [legalTosServer, mySeat]);

  const forcedMenCapture = useMemo(() => {
    if (turn == null) return false;
    return ov2CheckersSideHasMenCapture(cells, turn);
  }, [cells, turn]);

  const forcedMenCaptureHintViewSet = useMemo(() => {
    const s = new Set();
    if (mySeat == null || turn == null || chainAt != null) return s;
    if (!vm.canClientMove || turn !== mySeat) return s;
    if (!forcedMenCapture) return s;
    for (const i of ov2CheckersForcedMenCaptureFromIndices(cells, turn)) {
      s.add(ov2CheckersServerToViewIdx(i, mySeat));
    }
    return s;
  }, [cells, turn, mySeat, chainAt, vm.canClientMove, forcedMenCapture]);

  const onCellClick = useCallback(
    async viewIdx => {
      if (vm.readOnly || !vm.canClientMove || busy || vaultClaimBusy || vm.mustRespondDouble) return;
      if (turn == null || mySeat == null) return;
      const serverIdx = ov2CheckersViewToServerIdx(viewIdx, mySeat);
      const occupant = cells[serverIdx];
      const owner = occupant === 1 || occupant === 2 ? 0 : occupant === 3 || occupant === 4 ? 1 : -1;

      if (chainAt != null) {
        const legalContinuation = ov2CheckersLegalTosForFrom(cells, turn, chainAt, chainAt);
        if (legalContinuation.includes(serverIdx)) {
          setErr("");
          const r = await applyStep(chainAt, serverIdx);
          setSelViewIdx(null);
          if (!r.ok) {
            /* err already set */
          }
          return;
        }
        if (serverIdx === chainAt) {
          setSelViewIdx(viewIdx);
          setErr("");
          return;
        }
        if (owner === turn) {
          setErr("Continue the jump chain with the marked piece.");
          return;
        }
        setErr("Illegal move.");
        return;
      }

      if (selViewIdx == null) {
        if (owner !== turn) {
          setErr("Select your piece.");
          return;
        }
        const fromLegals = ov2CheckersLegalTosForFrom(cells, turn, chainAt, serverIdx);
        if (fromLegals.length === 0) {
          setErr("No legal moves from that piece.");
          return;
        }
        setSelViewIdx(viewIdx);
        setErr("");
        return;
      }

      if (viewIdx === selViewIdx) {
        setSelViewIdx(null);
        setErr("");
        return;
      }

      const fromServer = ov2CheckersViewToServerIdx(selViewIdx, mySeat);
      const toServer = serverIdx;
      const legals = ov2CheckersLegalTosForFrom(cells, turn, chainAt, fromServer);
      if (!legals.includes(toServer)) {
        setErr("Illegal move.");
        return;
      }
      const r = await applyStep(fromServer, toServer);
      setSelViewIdx(null);
      if (!r.ok) {
        /* err already set */
      }
    },
    [vm, busy, vaultClaimBusy, turn, mySeat, chainAt, cells, selViewIdx, applyStep, setErr]
  );

  const stakeBtnDisabled = busy || vaultClaimBusy || !canOfferDoubleNow;

  const onRematch = useCallback(async () => {
    if (!roomId || rematchBusy) return;
    setRematchBusy(true);
    setErr("");
    try {
      const r = await requestRematch();
      if (!r.ok) setErr(r.error || "Rematch request failed");
    } finally {
      setRematchBusy(false);
    }
  }, [roomId, rematchBusy, requestRematch, setErr]);

  const onStartNext = useCallback(async () => {
    if (!roomId || !isHost || startNextBusy) return;
    setStartNextBusy(true);
    setErr("");
    try {
      const r = await startNextMatch(roomMatchSeq);
      if (!r.ok) {
        setErr(r.error || "Could not start next match");
        return;
      }
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
        } catch {
          /* ignore */
        }
      }
      if (typeof onSessionRefresh === "function") {
        const prev = snapshot?.sessionId != null ? String(snapshot.sessionId) : "";
        await onSessionRefresh(prev, "", { expectClearedSession: true });
      }
      await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
    } finally {
      setStartNextBusy(false);
    }
  }, [
    roomId,
    isHost,
    startNextBusy,
    startNextMatch,
    roomMatchSeq,
    onSessionRefresh,
    snapshot?.sessionId,
    router,
    setErr,
  ]);

  const onExitToLobby = useCallback(async () => {
    if (!roomId || !pk || exitBusy) return;
    setExitBusy(true);
    setExitErr("");
    try {
      await leaveOv2RoomWithForfeitRetry({ room, room_id: roomId, participant_key: pk });
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
        } catch {
          /* ignore */
        }
      }
      await router.push("/online-v2/rooms");
    } catch (e) {
      setExitErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setExitBusy(false);
    }
  }, [roomId, pk, exitBusy, room, router]);

  const finished = vm.phase === "finished";
  const finishSessionId = finished ? String(vm.sessionId || "").trim() : "";
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
  const showResultModal = finished && finishSessionId.length > 0 && !finishModalDismissed;
  const didIWin = vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;
  const isDraw = finished && vm.winnerSeat == null;

  const stakePerSeat =
    room?.stake_per_seat != null && Number.isFinite(Number(room.stake_per_seat)) ? Number(room.stake_per_seat) : null;
  const finishMultiplier = vm.stakeMultiplier ?? 1;

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.winnerSeat) + 1}`;
  }, [members, vm.winnerSeat]);

  const finishOutcome = useMemo(() => {
    if (!finished) return "unknown";
    if (isDraw) return "draw";
    if (didIWin) return "win";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "loss";
    return "unknown";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishTitle = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Draw";
    if (didIWin) return "Victory";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "Defeat";
    return "Match finished";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishReasonLine = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "No winner — stakes refunded";
    return winnerDisplayName ? `Winner: ${winnerDisplayName}` : "Round complete";
  }, [finished, isDraw, winnerDisplayName]);

  const finishAmountLine = useMemo(() => {
    if (!finished) return { text: "—", className: "text-zinc-500" };
    if (vaultClaimBusy) return { text: "…", className: "text-zinc-400" };
    if (stakePerSeat == null) return { text: "—", className: "text-zinc-500" };
    const mult = Math.max(1, Math.min(16, Math.floor(Number(finishMultiplier)) || 1));
    const seat = Math.floor(stakePerSeat * mult);
    const pot = Math.floor(stakePerSeat * 2 * mult);
    if (isDraw) {
      return { text: `+${seat} MLEO (refunded)`, className: "font-semibold tabular-nums text-emerald-300/95" };
    }
    if (didIWin) {
      return { text: `+${pot} MLEO`, className: "font-semibold tabular-nums text-amber-200/95" };
    }
    if (vm.mySeat != null && vm.winnerSeat != null) {
      return { text: `−${seat} MLEO`, className: "font-semibold tabular-nums text-rose-300/95" };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [finished, vaultClaimBusy, stakePerSeat, isDraw, didIWin, vm.mySeat, vm.winnerSeat, finishMultiplier]);

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

  const finishDismissedStripActions = (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={rematchBusy} onClick={() => void onRematch()} className={BTN_PRIMARY}>
        {rematchBusy ? "…" : "Rematch"}
      </button>
      <button type="button" onClick={() => void cancelRematch()} className={BTN_SECONDARY}>
        Cancel rematch
      </button>
      {isHost ? (
        <button type="button" disabled={startNextBusy} onClick={() => void onStartNext()} className={BTN_ACCENT}>
          {startNextBusy ? "…" : "Start next (host)"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden bg-zinc-950 px-1 pb-1 sm:min-h-0 sm:gap-1 sm:px-2 sm:pb-1.5">
      {roomHasActiveSession && !snapshot ? (
        !matchSnapshotTimedOut ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center text-sm text-zinc-400">
            Loading match…
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2 text-center">
            <p className="text-sm text-zinc-400">Could not load match.</p>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-zinc-900/70 px-3 py-2 text-[11px] font-medium text-zinc-200"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Retry
            </button>
          </div>
        )
      ) : (
        <>
      <div className="flex shrink-0 flex-col gap-0.5 sm:gap-0.5">
        <div className="rounded-lg border border-white/[0.1] bg-zinc-900/70 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:py-1 sm:px-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
            <div
              className={`flex min-h-[1.625rem] items-center rounded-md border px-2 py-0.5 tabular-nums ${
                vm.phase === "playing" &&
                (vm.turnSeat === vm.mySeat ||
                  (vm.mustRespondDouble && Number(vm.pendingDouble?.responder_seat) === vm.mySeat))
                  ? "border-amber-400/35 bg-amber-950/45 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/55 text-zinc-400"
              }`}
            >
              {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                <span>
                  <span className="font-medium uppercase text-zinc-500">Timer</span>{" "}
                  <span className="font-semibold text-zinc-100">~{vm.turnTimeLeftSec}s</span>
                </span>
              ) : vm.phase === "finished" ? (
                <span className="font-medium text-zinc-500">Round over</span>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-white/12 bg-zinc-950/40 px-2 py-0.5 font-medium tabular-nums text-zinc-200">
                Table ×{vm.stakeMultiplier ?? 1}
              </span>
              {vaultClaimBusy ? (
                <span className="rounded-md border border-sky-500/22 bg-sky-950/40 px-2 py-0.5 text-[10px] text-sky-100/90">
                  Settlement…
                </span>
              ) : null}
              {vaultClaimError && !vaultClaimBusy ? (
                <span className="flex max-w-full flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-red-300/95">{vaultClaimError}</span>
                  <button type="button" className="text-[10px] text-red-200 underline" onClick={() => void retryVaultClaim()}>
                    Retry
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0 overflow-x-hidden overscroll-contain sm:mt-2.5 sm:min-h-0 sm:overflow-y-hidden">
        <Ov2BoardDuelPlayerHeader
          game="checkers"
          seat0Label={seat0Label}
          seat1Label={seat1Label}
          mySeat={vm.mySeat}
          indicatorSeat={indicatorSeat}
          phase={String(vm.phase || "")}
          missedStreakBySeat={vm.missedStreakBySeat}
          mustRespondDouble={vm.mustRespondDouble === true}
        />

        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-950">
        <div
          className="relative z-[1] -mt-1.5 mb-[-4px] w-full max-w-[min(100%,448px)] rounded-[10px] p-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_0_0_1px_rgba(0,0,0,0.5),0_8px_28px_rgba(0,0,0,0.42),0_0_48px_rgba(18,26,42,0.28),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-2px_5px_rgba(0,0,0,0.28)] sm:max-w-[min(100%,548px)]"
          style={{
            background: "linear-gradient(152deg, #8c5f45 0%, #5a3524 38%, #3a2218 65%, #5c3a28 100%)",
          }}
        >
          <div
            className="relative overflow-hidden rounded-[8px] p-0.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.06),inset_0_-3px_8px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(0,0,0,0.26)]"
            style={{
              background: "linear-gradient(172deg, #2a201c 0%, #181210 48%, #1f1612 100%)",
            }}
          >
            <div
              className="relative grid aspect-square w-full gap-0 rounded-[6px] shadow-[inset_0_0_28px_rgba(0,0,0,0.32),inset_0_0_52px_rgba(0,0,0,0.08)]"
              style={{
                gridTemplateColumns: "repeat(8, 1fr)",
                gridTemplateRows: "repeat(8, 1fr)",
              }}
            >
              {Array.from({ length: 64 }, (_, viewPos) => {
                const r = Math.floor(viewPos / 8);
                const c = viewPos % 8;
                const dark = (r + c) % 2 === 1;
                const serverIdx = mySeat != null ? ov2CheckersViewToServerIdx(viewPos, mySeat) : viewPos;
                const p = cells[serverIdx] ?? 0;
                const sel = selViewIdx === viewPos;
                const leg = legalTosViewSet.has(viewPos);
                const mustChain = chainAt != null && serverIdx === chainAt;
                const forcedCapHint = !mustChain && forcedMenCaptureHintViewSet.has(viewPos);
                const showLegalDot = leg && !sel && !mustChain && !forcedCapHint;
                const hierarchyClass = mustChain
                  ? "z-[2] shadow-[inset_0_0_0_2px_rgba(251,191,36,0.48),inset_0_0_12px_rgba(251,191,36,0.055)]"
                  : forcedCapHint
                    ? "z-[1] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.32)]"
                    : sel
                      ? "z-[1] shadow-[inset_0_0_0_2px_rgba(125,211,252,0.32)]"
                      : "";
                const baseSq = dark
                  ? "bg-[#4a3020] shadow-[inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-2px_0_rgba(0,0,0,0.25)]"
                  : "bg-[#e0b078] shadow-[inset_0_1px_0_rgba(255,250,240,0.26),inset_0_-1px_0_rgba(0,0,0,0.075)]";
                const isDark = p === 1 || p === 2;
                const isKing = p === 2 || p === 4;
                return (
                  <button
                    key={viewPos}
                    type="button"
                    disabled={vm.readOnly || busy || vm.mustRespondDouble}
                    onClick={() => void onCellClick(viewPos)}
                    className={`relative flex min-h-0 min-w-0 items-center justify-center outline-none transition-[box-shadow,opacity] disabled:opacity-50 ${baseSq} ${hierarchyClass}`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    {showLegalDot ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-200/22 ring-1 ring-emerald-400/14"
                        aria-hidden
                      />
                    ) : null}
                    {p ? (
                      <span
                        className={`relative z-[1] flex h-[55%] w-[55%] max-h-8 max-w-8 items-center justify-center rounded-full sm:h-[61%] sm:w-[61%] sm:max-h-9 sm:max-w-9 md:h-[63%] md:w-[63%] md:max-h-[2.375rem] md:max-w-[2.375rem] ${
                          isKing ? "ring-1 ring-black/22" : "ring-1 ring-black/16"
                        }`}
                        style={{
                          background: isDark
                            ? "radial-gradient(circle at 32% 28%, #6a6a72 0%, #35353a 42%, #121214 88%)"
                            : "radial-gradient(circle at 32% 28%, #fffdf7 0%, #e8dcc8 45%, #c4b29a 88%)",
                          boxShadow:
                            "0 1px 2px rgba(0,0,0,0.58), 0 2px 4px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 5px rgba(0,0,0,0.22)",
                          ...(isKing
                            ? {
                                color: isDark ? "rgba(252,248,240,0.94)" : "rgba(36,30,24,0.76)",
                              }
                            : {}),
                        }}
                      >
                        {isKing ? (
                          <span
                            className="flex translate-y-px items-center justify-center font-light leading-none"
                            style={{
                              fontSize: "clamp(9px, 2.35vw, 10.5px)",
                              textShadow: isDark
                                ? "0 0.5px 1.5px rgba(0,0,0,0.5)"
                                : "0 0.5px 0 rgba(255,255,255,0.45)",
                            }}
                            aria-hidden
                          >
                            ♔
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

        <div className="mt-5 shrink-0 pt-4 md:mt-4 md:pt-3 md:pb-2">
          <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-row items-stretch gap-2 md:max-w-3xl md:justify-center md:gap-3">
            <button
              type="button"
              disabled={stakeBtnDisabled}
              className={`${BTN_ACCENT} flex min-h-[2.75rem] min-w-0 flex-[1.65] items-center justify-center px-2 py-2.5 text-center !text-xs font-semibold leading-tight sm:!text-sm md:flex-1 md:max-w-md md:px-4 md:py-2.5`}
              onClick={() => void offerDouble()}
            >
              Increase table stake
            </button>
            <button
              type="button"
              disabled={exitBusy || !pk}
              className={`${BTN_DANGER} flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center px-2 py-2.5 text-center !text-xs font-semibold leading-tight sm:!text-sm md:max-w-[12.5rem] md:flex-none md:shrink-0 md:px-4 md:py-2.5`}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
          </div>
          {exitErr ? <p className="mt-2 text-center text-[11px] text-red-300">{exitErr}</p> : null}
          {err ? (
            <div className="mt-2 rounded-md border border-red-500/20 bg-red-950/20 px-2 py-1.5 text-[11px] text-red-200/95">
              <span>{err}</span>{" "}
              <button type="button" className="text-red-300 underline" onClick={() => setErr("")}>
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Ov2SharedStakeDoubleModal
        open={vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble}
        proposedMult={vm.pendingDouble?.proposed_mult}
        stakeMultiplier={vm.stakeMultiplier}
        busy={busy}
        onAccept={() => void respondDouble(true)}
        onDecline={() => void respondDouble(false)}
      />

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-ck-finish-title">
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
                  (finishOutcome === "draw" || finishOutcome === "unknown") && "border-white/10 bg-zinc-900/80 text-zinc-200",
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
                  id="ov2-ck-finish-title"
                  className={[
                    "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                    finishOutcome === "win" && "text-emerald-400",
                    finishOutcome === "loss" && "text-rose-400",
                    finishOutcome === "draw" && "text-sky-300",
                    finishOutcome === "unknown" && "text-zinc-100",
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
                  <p className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}>
                    {finishAmountLine.text}
                  </p>
                </div>
                <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{finishReasonLine}</p>
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                  {vaultClaimBusy ? "Sending results to your balance…" : "Round complete — rematch, then host starts next."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-4">
            <button type="button" className={BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
              {rematchBusy ? "Requesting…" : "Request rematch"}
            </button>
            <button type="button" className={BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
              Cancel rematch
            </button>
            {isHost ? (
              <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
                <button
                  type="button"
                  className={BTN_PRIMARY + " w-full rounded-none"}
                  disabled={startNextBusy}
                  onClick={() => void onStartNext()}
                >
                  {startNextBusy ? "Starting…" : "Start next (host)"}
                </button>
              </div>
            ) : (
              <p className="rounded-lg border border-white/[0.06] bg-zinc-950/35 px-2 py-1.5 text-center text-[11px] text-zinc-500">
                Host starts the next match when both players rematch.
              </p>
            )}
            <button type="button" className={BTN_SECONDARY} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              className={BTN_FINISH_DANGER + " w-full"}
              disabled={exitBusy || !pk}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}

      {finished && !showResultModal ? (
        <div className="shrink-0 space-y-2 rounded-xl border border-white/[0.11] bg-gradient-to-b from-zinc-900/78 to-zinc-950 p-3 text-[11px] text-zinc-200/88 shadow-[0_12px_32px_rgba(0,0,0,0.42),0_0_0_1px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-8px_18px_rgba(0,0,0,0.24)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Result</p>
          <p className="mt-1 text-sm font-semibold text-zinc-50">Match finished</p>
          {vm.winnerSeat != null && vm.mySeat != null ? (
            <p className={`mt-1 ${didIWin ? "text-emerald-300/85" : "text-rose-200/82"}`}>
              {didIWin ? "You won." : "You lost."}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.1] pt-3">{finishDismissedStripActions}</div>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
