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

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/28 bg-gradient-to-b from-emerald-950/70 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_4px_14px_rgba(0,0,0,0.32)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/28 bg-gradient-to-b from-zinc-800/55 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_12px_rgba(0,0,0,0.28)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/28 bg-gradient-to-b from-sky-950/65 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_14px_rgba(0,0,0,0.3)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "w-full rounded-lg border border-[#4a3035]/80 bg-gradient-to-b from-[#2e2226] to-[#10090b] py-2 px-3 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_16px_rgba(0,0,0,0.38)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_GHOST =
  "w-full rounded-lg border border-white/[0.12] bg-zinc-900/45 py-2 px-3 text-xs font-semibold text-zinc-200/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_12px_rgba(0,0,0,0.28)] transition-[transform,opacity] active:scale-[0.98]";

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
    <div className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-1 pb-1.5 sm:gap-2 sm:px-2 sm:pb-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-2 sm:py-2">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] sm:text-[12px]">
            <div
              className={`flex min-h-[1.625rem] items-center rounded-md border px-2.5 py-1 tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_2px_rgba(0,0,0,0.35)] ${
                vm.phase === "playing" && vm.turnSeat === vm.mySeat
                  ? "border-amber-400/38 bg-amber-950/50 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/65 text-zinc-400"
              }`}
            >
              {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                <span className="tracking-wide">
                  <span className="text-[10px] font-medium uppercase text-zinc-500 sm:text-[10px]">Turn</span>{" "}
                  <span className="text-[12px] font-semibold text-zinc-100 sm:text-[13px]">~{vm.turnTimeLeftSec}s</span>
                </span>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </div>
            {vaultClaimBusy ? (
              <span className="rounded-md border border-sky-500/18 bg-sky-950/35 px-2 py-0.5 text-[10px] font-medium text-sky-100/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                Settlement…
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex min-h-[2.5rem] flex-col justify-center text-[11px] leading-snug">
          {err ? (
            <div className="rounded-md border border-red-500/20 bg-red-950/20 px-2 py-1.5 text-red-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <p className="pr-1">
                {err}{" "}
                <button
                  type="button"
                  className="ml-1 inline align-baseline text-[10px] font-medium text-red-300/90 underline decoration-red-400/40 underline-offset-2 transition hover:text-red-200"
                  onClick={() => setErr("")}
                >
                  Dismiss
                </button>
              </p>
            </div>
          ) : (
            <div className="min-h-[2.5rem]" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_72%_58%_at_50%_48%,transparent_20%,rgba(0,0,0,0.34)_100%)]">
        <div
          className="relative z-[1] -mt-1.5 mb-[-4px] w-full max-w-[min(100%,448px)] rounded-[10px] p-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_52px_rgba(0,0,0,0.22),0_22px_56px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_4px_rgba(0,0,0,0.38)] sm:max-w-[min(100%,548px)]"
          style={{
            background: "linear-gradient(152deg, #7a4f38 0%, #4a2a1c 40%, #2e1810 68%, #523222 100%)",
          }}
        >
          <div
            className="relative overflow-hidden rounded-[8px] p-0.5 shadow-[inset_0_2px_3px_rgba(255,255,255,0.05),inset_0_-3px_8px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(0,0,0,0.32)]"
            style={{
              background: "linear-gradient(172deg, #1c120e 0%, #0c0806 52%, #140d0a 100%)",
            }}
          >
            <div
              className="relative grid aspect-square w-full gap-0 rounded-[6px] shadow-[inset_0_0_30px_rgba(0,0,0,0.5),inset_0_0_52px_rgba(0,0,0,0.16)]"
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
                  ? "z-[2] shadow-[inset_0_0_0_2px_rgba(251,191,36,0.55),inset_0_0_12px_rgba(251,191,36,0.08)]"
                  : forcedCapHint
                    ? "z-[1] shadow-[inset_0_0_0_1px_rgba(234,179,8,0.4)]"
                    : sel
                      ? "z-[1] shadow-[inset_0_0_0_2px_rgba(125,211,252,0.38)]"
                      : "";
                const baseSq = dark
                  ? "bg-[#1f0f08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-2px_0_rgba(0,0,0,0.4)]"
                  : "bg-[#e2a968] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.1)]";
                const isDark = p === 1 || p === 2;
                const isKing = p === 2 || p === 4;
                return (
                  <button
                    key={viewPos}
                    type="button"
                    disabled={vm.readOnly || busy}
                    onClick={() => void onCellClick(viewPos)}
                    className={`relative flex min-h-0 min-w-0 items-center justify-center outline-none transition-[box-shadow,opacity] disabled:opacity-50 ${baseSq} ${hierarchyClass}`}
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    {showLegalDot ? (
                      <span
                        className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-200/30 ring-1 ring-emerald-400/22"
                        aria-hidden
                      />
                    ) : null}
                    {p ? (
                      <span
                        className={`relative z-[1] flex h-[55%] w-[55%] max-h-8 max-w-8 items-center justify-center rounded-full text-[8px] font-bold tracking-tight sm:h-[61%] sm:w-[61%] sm:max-h-9 sm:max-w-9 sm:text-[9px] md:h-[63%] md:w-[63%] md:max-h-[2.375rem] md:max-w-[2.375rem] md:text-[10px] ${
                          isKing ? "ring-1 ring-black/25" : "ring-1 ring-black/20"
                        }`}
                        style={{
                          background: isDark
                            ? "radial-gradient(circle at 32% 28%, #6a6a72 0%, #35353a 42%, #121214 88%)"
                            : "radial-gradient(circle at 32% 28%, #fffdf7 0%, #e8dcc8 45%, #c4b29a 88%)",
                          boxShadow:
                            "0 1px 2px rgba(0,0,0,0.65), 0 3px 5px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -3px 6px rgba(0,0,0,0.25)",
                          color: isDark ? "rgba(245,240,232,0.92)" : "rgba(28,24,20,0.9)",
                          textShadow: isDark
                            ? "0 1px 1px rgba(0,0,0,0.6)"
                            : "0 1px 0 rgba(255,255,255,0.35)",
                        }}
                      >
                        {isKing ? (
                          <span
                            className="text-[clamp(9px,2.5vw,11px)] font-normal leading-none sm:text-[clamp(10px,2.6vw,12px)] md:text-[clamp(10px,2.4vw,12px)]"
                            style={{ opacity: 0.88 }}
                            aria-hidden
                          >
                            ♔
                          </span>
                        ) : (
                          pieceLabel(p)
                        )}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showResultModal ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/[0.68] p-3 backdrop-blur-[4px]">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.15] bg-gradient-to-b from-zinc-900/98 to-zinc-950/98 p-5 text-center shadow-[0_28px_72px_rgba(0,0,0,0.72),0_0_0_1px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-12px_28px_rgba(0,0,0,0.32)] sm:max-w-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Match result</p>
            <p
              className={`mt-2 text-lg font-semibold tracking-tight sm:text-xl ${
                didIWin ? "text-emerald-200/88" : vm.mySeat != null ? "text-rose-200/85" : "text-zinc-50"
              }`}
            >
              {didIWin ? "You win" : vm.mySeat != null ? "You lose" : "Match over"}
            </p>
            {vm.winnerSeat != null ? (
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                Winner: <span className="font-semibold text-zinc-300/95">{winnerDisplayName}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">Match complete</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.11] pt-3 text-left text-[11px] text-zinc-300/90">
              {finishedActions}
            </div>
            <button
              type="button"
              className={`${BTN_GHOST} mt-3`}
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
        <div className="shrink-0 space-y-2 rounded-xl border border-white/[0.14] bg-gradient-to-b from-zinc-900/82 to-zinc-950 p-3 text-[11px] text-zinc-200/92 shadow-[0_16px_44px_rgba(0,0,0,0.5),0_0_0_1px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-10px_24px_rgba(0,0,0,0.3)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Result</p>
          <p className="mt-1 text-sm font-semibold text-zinc-50">Match finished</p>
          {vm.winnerSeat != null && vm.mySeat != null ? (
            <p className={`mt-1 ${didIWin ? "text-emerald-300/85" : "text-rose-200/82"}`}>
              {didIWin ? "You won." : "You lost."}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.1] pt-3">{finishedActions}</div>
        </div>
      ) : null}

      <div className="shrink-0">
        <button type="button" disabled={exitBusy || !pk} onClick={() => void onExitToLobby()} className={BTN_DANGER}>
          {exitBusy ? "Leaving…" : "Leave table"}
        </button>
        {exitErr ? <p className="mt-1 min-h-[1rem] text-[10px] text-red-300/95">{exitErr}</p> : null}
      </div>
    </div>
  );
}
