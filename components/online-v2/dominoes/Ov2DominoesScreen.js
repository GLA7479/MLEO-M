"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  dominoTileAttachSides,
  parseDominoTile,
} from "../../../lib/online-v2/dominoes/ov2DominoesClientLegality";
import { useOv2DominoesSession } from "../../../hooks/useOv2DominoesSession";

const finishDismissStorageKey = sid => `ov2_dom_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

function PipDots({ n, compact }) {
  const v = Math.min(6, Math.max(0, Math.floor(Number(n) || 0)));
  const patterns = {
    0: [],
    1: [[0.5, 0.5]],
    2: [[0.25, 0.25], [0.75, 0.75]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
  };
  const pts = patterns[v] || [];
  const sz = compact ? 36 : 44;
  return (
    <svg width={sz} height={sz} viewBox="0 0 1 1" className="shrink-0 text-zinc-900">
      <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.06" fill="currentColor" className="text-[#f5f0e8]" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.07" className="fill-zinc-900/88" />
      ))}
    </svg>
  );
}

function DominoFace({ a, b, vertical }) {
  if (vertical) {
    return (
      <div className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-black/20 bg-[#faf6ef] px-1 py-1 shadow-inner">
        <PipDots n={a} compact />
        <div className="h-px w-[80%] bg-black/25" />
        <PipDots n={b} compact />
      </div>
    );
  }
  return (
    <div className="flex flex-row items-center justify-center gap-1 rounded-md border border-black/20 bg-[#faf6ef] px-1 py-1 shadow-inner">
      <PipDots n={a} compact />
      <div className="h-[70%] w-px bg-black/25" />
      <PipDots n={b} compact />
    </div>
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2DominoesScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2DominoesSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    playTile,
    drawOne,
    passTurn,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;

  const [selIdx, setSelIdx] = useState(/** @type {number|null} */ (null));
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
    setSelIdx(null);
  }, [vm.sessionId, vm.revision]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  const onTileClick = useCallback(
    async idx => {
      if (vm.phase !== "playing" || busy || vaultClaimBusy) return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      if (vm.mustRespondDouble) return;
      if (!vm.canClientPlayTiles && vm.line.length > 0) {
        setErr("Draw or pass — no legal play on the board.");
        return;
      }
      const tile = parseDominoTile(vm.myHand[idx]);
      if (!tile) return;

      if (vm.line.length === 0) {
        setErr("");
        const r = await playTile(idx, "");
        setSelIdx(null);
        if (!r.ok) {
          /* err set */
        }
        return;
      }

      const sides = dominoTileAttachSides(vm.line, tile);
      if (!sides.left && !sides.right) {
        setErr("That tile does not match either end.");
        return;
      }

      if (selIdx !== idx) {
        setSelIdx(idx);
        setErr("");
        return;
      }

      if (sides.left && !sides.right) {
        const r = await playTile(idx, "left");
        setSelIdx(null);
        if (!r.ok) {
          /* */
        }
        return;
      }
      if (!sides.left && sides.right) {
        const r = await playTile(idx, "right");
        setSelIdx(null);
        if (!r.ok) {
          /* */
        }
        return;
      }
      setErr("Choose left or right end.");
    },
    [vm, busy, vaultClaimBusy, playTile, selIdx, setErr]
  );

  const playSelected = useCallback(
    async side => {
      if (selIdx == null) return;
      setErr("");
      const r = await playTile(selIdx, side);
      setSelIdx(null);
      if (!r.ok) {
        /* */
      }
    },
    [selIdx, playTile, setErr]
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

  const selectedTile =
    selIdx != null && selIdx >= 0 && selIdx < vm.myHand.length ? parseDominoTile(vm.myHand[selIdx]) : null;
  const attachSides =
    selectedTile && vm.line.length > 0 ? dominoTileAttachSides(vm.line, selectedTile) : { left: false, right: false };
  const needSidePick =
    Boolean(
      selIdx != null &&
        attachSides.left &&
        attachSides.right &&
        vm.line.length > 0 &&
        vm.turnSeat === vm.mySeat &&
        vm.canClientPlayTiles
    );

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
                Table ×{vm.stakeMultiplier}
              </span>
              <span className="rounded border border-white/10 px-2 py-0.5">Stack {vm.boneyardCount}</span>
              <span className="rounded border border-white/10 px-2 py-0.5">Opponent {vm.oppHandCount}</span>
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
        <div className="rounded-lg border border-white/[0.08] bg-zinc-900/40 p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Line</p>
          <div className="flex min-h-[4.5rem] flex-wrap items-center justify-center gap-1 overflow-x-auto py-1">
            {vm.line.length === 0 ? (
              <span className="text-[11px] text-zinc-500">Empty — first tile sets the line.</span>
            ) : (
              vm.line.map((seg, i) => {
                const lo = Math.floor(Number(seg?.lo));
                const hi = Math.floor(Number(seg?.hi));
                return (
                  <div key={i} className="flex items-center">
                    <DominoFace a={lo} b={hi} vertical={false} />
                  </div>
                );
              })
            )}
          </div>
        </div>

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

        <div className="rounded-lg border border-white/[0.08] bg-zinc-900/40 p-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Your tiles</p>
          <div className="flex flex-wrap justify-center gap-2">
            {vm.myHand.map((t, idx) => {
              const p = parseDominoTile(t);
              if (!p) return null;
              const sel = selIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={
                    busy ||
                    vaultClaimBusy ||
                    vm.phase !== "playing" ||
                    vm.mySeat !== vm.turnSeat ||
                    vm.mustRespondDouble ||
                    !vm.canClientPlayTiles
                  }
                  onClick={() => void onTileClick(idx)}
                  className={`rounded-md p-0.5 transition ring-offset-2 ring-offset-zinc-950 ${
                    sel ? "ring-2 ring-sky-400/70" : "ring-0"
                  } disabled:opacity-40`}
                >
                  <DominoFace a={p.a} b={p.b} vertical />
                </button>
              );
            })}
          </div>
          {needSidePick ? (
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <button type="button" disabled={busy} className={BTN_ACCENT} onClick={() => void playSelected("left")}>
                Play left
              </button>
              <button type="button" disabled={busy} className={BTN_ACCENT} onClick={() => void playSelected("right")}>
                Play right
              </button>
            </div>
          ) : null}
        </div>

        {vm.phase === "playing" && vm.mySeat === vm.turnSeat && !vm.mustRespondDouble ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={BTN_SECONDARY} onClick={() => void drawOne()}>
              Draw from stack
            </button>
            <button type="button" disabled={busy} className={BTN_SECONDARY} onClick={() => void passTurn()}>
              Pass
            </button>
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
              {isDraw ? "Draw" : didIWin ? "You won" : `${winnerDisplayName} won`}
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
