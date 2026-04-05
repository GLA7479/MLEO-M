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

const finishDismissStorageKey = sid => `ov2_ck_finish_dismiss_${sid}`;

function pieceLabel(p) {
  if (p === 1) return "b";
  if (p === 2) return "BK";
  if (p === 3) return "w";
  if (p === 4) return "WK";
  return "";
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2CheckersScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2CheckersSession(contextInput ?? undefined);
  const { snapshot, vm, busy, vaultClaimBusy, err, setErr, applyStep, requestRematch, cancelRematch, startNextMatch, isHost, roomMatchSeq } =
    session;
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
      if (vm.readOnly || !vm.canClientMove || busy || vaultClaimBusy) return;
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

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.winnerSeat) + 1}`;
  }, [members, vm.winnerSeat]);

  const finishedActions = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={rematchBusy}
        onClick={() => void onRematch()}
        className="rounded-md border border-emerald-500/40 bg-emerald-950/40 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 disabled:opacity-45"
      >
        {rematchBusy ? "…" : "Rematch"}
      </button>
      <button
        type="button"
        onClick={() => void cancelRematch()}
        className="rounded-md border border-zinc-600 bg-zinc-800/50 px-2 py-1.5 text-[11px] text-zinc-200"
      >
        Cancel rematch
      </button>
      {isHost ? (
        <button
          type="button"
          disabled={startNextBusy}
          onClick={() => void onStartNext()}
          className="rounded-md border border-sky-500/40 bg-sky-950/40 px-2 py-1.5 text-[11px] font-semibold text-sky-100 disabled:opacity-45"
        >
          {startNextBusy ? "…" : "Start next (host)"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1 pb-2 sm:gap-3 sm:px-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
          <div className="tabular-nums">
            {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
              <span className={vm.turnSeat === vm.mySeat ? "text-amber-200" : "text-zinc-500"}>
                Turn clock ~{vm.turnTimeLeftSec}s
              </span>
            ) : (
              <span>—</span>
            )}
          </div>
          {vaultClaimBusy ? <span className="text-sky-300">Settlement…</span> : null}
        </div>
        <div className="flex min-h-[2.5rem] flex-col justify-center text-[11px] leading-snug">
          {err ? (
            <p className="text-red-300">
              {err}
              <button type="button" className="ml-2 underline decoration-red-400/80" onClick={() => setErr("")}>
                Dismiss
              </button>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <div
          className="grid aspect-square w-full max-w-[min(100%,420px)] gap-0 rounded-md border border-[#2a1810] p-1 shadow-inner sm:max-w-[min(100%,520px)]"
          style={{
            background: "linear-gradient(145deg,#1c1410,#0d0907)",
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
            const ringFocus =
              mustChain
                ? "z-[1] ring-2 ring-amber-400/90 ring-inset"
                : forcedCapHint
                  ? "z-[1] ring-2 ring-orange-400/90 ring-inset shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                  : sel
                    ? "z-[1] ring-2 ring-sky-400 ring-inset"
                    : leg
                      ? "z-[1] ring-2 ring-emerald-500/80 ring-inset"
                      : "";
            return (
              <button
                key={viewPos}
                type="button"
                disabled={vm.readOnly || busy}
                onClick={() => void onCellClick(viewPos)}
                className={`relative flex min-h-0 min-w-0 items-center justify-center outline-none transition-[box-shadow] disabled:opacity-50 ${
                  dark
                    ? "bg-gradient-to-br from-[#3d2918] to-[#1e120c]"
                    : "bg-gradient-to-br from-[#c4a574] to-[#8a6a3e]"
                } ${ringFocus}`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {p ? (
                  <span
                    className={`flex h-[55%] w-[55%] max-h-8 max-w-8 items-center justify-center rounded-full border border-black/40 text-[9px] font-bold shadow-md sm:h-[58%] sm:w-[58%] sm:text-[10px] ${
                      p === 1 || p === 2
                        ? "bg-gradient-to-b from-zinc-600 to-zinc-900 text-zinc-100"
                        : "bg-gradient-to-b from-stone-100 to-stone-400 text-stone-900"
                    }`}
                  >
                    {pieceLabel(p)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {showResultModal ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-xl border border-white/20 bg-zinc-900/95 p-4 text-center shadow-2xl sm:max-w-md">
            <p
              className={`text-lg font-bold uppercase tracking-wide sm:text-xl ${
                didIWin ? "text-emerald-300" : vm.mySeat != null ? "text-red-300" : "text-white"
              }`}
            >
              {didIWin ? "You win" : vm.mySeat != null ? "You lose" : "Match over"}
            </p>
            {vm.winnerSeat != null ? (
              <p className="mt-1 text-xs text-zinc-300">
                Winner: <span className="font-semibold text-zinc-100">{winnerDisplayName}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-400">Match complete</p>
            )}
            <div className="mt-4 space-y-2 text-left text-[11px] text-zinc-200">{finishedActions}</div>
            <button
              type="button"
              className="mt-4 w-full rounded-md border border-white/20 bg-white/10 py-2 text-xs font-semibold text-zinc-100"
              onClick={() => {
                try {
                  window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
                } catch {
                  /* ignore */
                }
                setFinishModalDismissedSessionId(finishSessionId);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {finished && !showResultModal ? (
        <div className="shrink-0 space-y-2 rounded-lg border border-white/10 bg-zinc-900/50 p-2 text-[11px] text-zinc-200">
          <p className="font-semibold text-zinc-100">Match finished</p>
          {vm.winnerSeat != null && vm.mySeat != null ? (
            <p className={didIWin ? "text-emerald-300/95" : "text-red-300/95"}>
              {didIWin ? "You won." : "You lost."}
            </p>
          ) : null}
          {finishedActions}
        </div>
      ) : null}

      <div className="shrink-0">
        <button
          type="button"
          disabled={exitBusy || !pk}
          onClick={() => void onExitToLobby()}
          className="w-full rounded-md border border-red-500/35 bg-red-950/25 py-2 text-[11px] font-semibold text-red-100 disabled:opacity-45"
        >
          {exitBusy ? "Leaving…" : "Leave table"}
        </button>
        {exitErr ? <p className="mt-1 text-[10px] text-red-300">{exitErr}</p> : null}
      </div>
    </div>
  );
}
