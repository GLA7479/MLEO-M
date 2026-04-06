"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  flipGridCellPlayable,
  OV2_FLIPGRID_SIZE,
  parseFlipGridCells,
} from "../../../lib/online-v2/flipgrid/ov2FlipGridClientLegality";
import { useOv2FlipGridSession } from "../../../hooks/useOv2FlipGridSession";

const finishDismissStorageKey = sid => `ov2_fg_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

function CellDisc({ seat }) {
  if (seat !== 0 && seat !== 1) {
    return (
      <div className="aspect-square w-full min-h-[1.85rem] rounded-[3px] border border-white/[0.06] bg-emerald-950/35 sm:min-h-[2.25rem] sm:rounded-md" />
    );
  }
  const cls =
    seat === 0
      ? "bg-gradient-to-b from-rose-400/90 to-rose-700/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
      : "bg-gradient-to-b from-amber-300/90 to-amber-700/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]";
  return (
    <div
      className={`aspect-square w-full min-h-[1.85rem] rounded-full border border-black/20 ${cls} sm:min-h-[2.25rem]`}
    />
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2FlipGridScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2FlipGridSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    playCell,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;

  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  const cells = useMemo(() => parseFlipGridCells(vm.cells), [vm.cells]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  const onCell = useCallback(
    async (r, c) => {
      if (vm.phase !== "playing" || busy || vaultClaimBusy) return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      if (vm.mustRespondDouble) return;
      if (!flipGridCellPlayable(r, c, cells, vm.mySeat, vm.turnSeat, vm.mustRespondDouble)) {
        setErr("Illegal move — must flip at least one opposing disc.");
        return;
      }
      setErr("");
      await playCell(r, c);
    },
    [vm, busy, vaultClaimBusy, cells, playCell, setErr]
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
  const isDraw = finished && vm.winnerSeat == null;

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.winnerSeat) + 1}`;
  }, [members, vm.winnerSeat]);

  const myColorLabel = vm.mySeat === 0 ? "Rose" : vm.mySeat === 1 ? "Amber" : "—";
  const oppColorLabel = vm.mySeat === 0 ? "Amber" : vm.mySeat === 1 ? "Rose" : "—";

  const canInteractBoard =
    vm.phase === "playing" && vm.mySeat === vm.turnSeat && !vm.mustRespondDouble && !busy && !vaultClaimBusy;

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
    <div className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden bg-zinc-950 px-1 pb-1.5 sm:gap-2 sm:px-2 sm:pb-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
            <div
              className={`flex items-center rounded-md border px-2 py-1 tabular-nums ${
                vm.phase === "playing" &&
                (vm.turnSeat === vm.mySeat ||
                  (vm.mustRespondDouble && Number(vm.pendingDouble?.responder_seat) === vm.mySeat))
                  ? "border-amber-400/38 bg-amber-950/50 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/65 text-zinc-400"
              }`}
            >
              {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                <span>
                  <span className="font-medium uppercase text-zinc-500">Timer</span>{" "}
                  <span className="font-semibold text-zinc-100">~{vm.turnTimeLeftSec}s</span>
                </span>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded border border-white/10 px-2 py-0.5 text-zinc-300">
                Rose {vm.discCounts[0]} · Amber {vm.discCounts[1]}
              </span>
              <span className="rounded border border-white/10 px-2 py-0.5 text-zinc-300">
                Table ×{vm.stakeMultiplier}
              </span>
              <span className="hidden rounded border border-white/10 px-2 py-0.5 sm:inline">You: {myColorLabel}</span>
              <span className="hidden rounded border border-white/10 px-2 py-0.5 sm:inline">
                Opponent: {oppColorLabel}
              </span>
            </div>
            {vaultClaimBusy ? (
              <span className="rounded-md border border-sky-500/18 bg-sky-950/35 px-2 py-0.5 text-[10px] text-sky-100/88">
                Settlement…
              </span>
            ) : null}
          </div>
        </div>
        {err ? (
          <div className="rounded-md border border-red-500/20 bg-red-950/20 px-2 py-1.5 text-[11px] text-red-200/95">
            <span>{err}</span>{" "}
            <button type="button" className="text-red-300 underline" onClick={() => setErr("")}>
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-950/25 p-2">
            <p className="text-[11px] text-amber-100/90">
              Opponent proposes table ×{String(vm.pendingDouble.proposed_mult ?? "")}. Declining or timing out ends the round at
              the current ×{vm.stakeMultiplier}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => void respondDouble(true)}>
                Accept ×{String(vm.pendingDouble.proposed_mult ?? "")}
              </button>
              <button type="button" disabled={busy} className={BTN_DANGER} onClick={() => void respondDouble(false)}>
                Decline
              </button>
            </div>
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-[min(100%,22rem)] rounded-xl border border-white/[0.08] bg-zinc-900/50 p-1.5 sm:max-w-md sm:p-3 md:max-w-lg">
          <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:mb-2">
            8×8 grid
          </p>
          <div
            className="grid gap-0.5 sm:gap-1"
            style={{ gridTemplateColumns: `repeat(${OV2_FLIPGRID_SIZE}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: OV2_FLIPGRID_SIZE * OV2_FLIPGRID_SIZE }, (_, i) => {
              const r = Math.floor(i / OV2_FLIPGRID_SIZE);
              const c = i % OV2_FLIPGRID_SIZE;
              const v = cells[i];
              const playable = canInteractBoard && flipGridCellPlayable(r, c, cells, vm.mySeat, vm.turnSeat, false);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!playable}
                  aria-label={`Cell row ${r + 1} column ${c + 1}`}
                  onClick={() => void onCell(r, c)}
                  className={`min-w-0 rounded-[3px] border p-0 transition sm:rounded-md ${
                    playable
                      ? "border-sky-500/40 bg-sky-950/30 active:scale-[0.96]"
                      : "cursor-default border-white/[0.05] bg-zinc-950/40"
                  }`}
                >
                  <CellDisc seat={v} />
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500 sm:hidden">
            You {myColorLabel} · Opponent {oppColorLabel}
          </p>
        </div>

        {vm.phase === "playing" && vm.mySeat === vm.turnSeat && !vm.mustRespondDouble ? (
          <div className="flex flex-wrap gap-2">
            {vm.canOfferDouble ? (
              <button type="button" disabled={busy} className={BTN_ACCENT} onClick={() => void offerDouble()}>
                Increase table stake
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-1 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-500">
          <p>
            Missed turns: you {vm.mySeat != null ? vm.missedStreakBySeat[vm.mySeat] ?? 0 : "—"} · opponent{" "}
            {vm.mySeat === 0 ? vm.missedStreakBySeat[1] : vm.mySeat === 1 ? vm.missedStreakBySeat[0] : "—"}
          </p>
          <button
            type="button"
            disabled={exitBusy || !pk}
            className="w-fit text-sky-300 underline disabled:opacity-45"
            onClick={() => void onExitToLobby()}
          >
            {exitBusy ? "Leaving…" : "Leave table"}
          </button>
          {exitErr ? <span className="text-red-300">{exitErr}</span> : null}
        </div>
      </div>

      {showResultModal ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/55 p-2 sm:items-center">
          <div
            className="w-full max-w-sm rounded-xl border border-white/[0.1] bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <p className="text-center text-sm font-semibold text-zinc-100">
              {isDraw
                ? `Draw (${vm.discCounts[0]}–${vm.discCounts[1]})`
                : didIWin
                  ? "You won"
                  : `${winnerDisplayName} won`}
            </p>
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              {vaultClaimBusy ? "Sending results to your balance…" : "Round complete. Rematch, then host starts the next match."}
            </p>
            <div className="mt-4">{finishedActions}</div>
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-white/10 py-2 text-[11px] text-zinc-300"
              onClick={() => {
                setFinishModalDismissedSessionId(finishSessionId);
                try {
                  window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
