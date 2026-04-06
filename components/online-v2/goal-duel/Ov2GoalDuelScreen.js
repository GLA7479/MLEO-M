"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { useOv2GoalDuelSession } from "../../../hooks/useOv2GoalDuelSession";

const finishDismissStorageKey = sid => `ov2_gd_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_PAD =
  "flex h-11 min-w-[3.25rem] select-none items-center justify-center rounded-xl border border-white/15 bg-zinc-900/90 text-[13px] font-bold text-zinc-100 active:scale-[0.97] sm:h-12 sm:min-w-[4rem]";

/** @param {unknown} m */
function memberGdRematchRequested(m) {
  const meta = m?.meta;
  if (!meta || typeof meta !== "object") return false;
  const gd = /** @type {Record<string, unknown>} */ (meta).gd;
  if (!gd || typeof gd !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (gd).rematch_requested;
  return r === true || r === "true" || r === 1;
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2GoalDuelScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2GoalDuelSession(contextInput ?? undefined);
  const {
    vm,
    snapshot,
    vaultClaimBusy,
    err,
    setErr,
    setInput,
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
  const canvasRef = useRef(/** @type {HTMLCanvasElement|null} */ (null));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  useEffect(() => {
    const down = e => {
      if (vm.phase !== "playing") return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") setInput({ l: true });
      if (k === "arrowright" || k === "d") setInput({ r: true });
      if (k === " " || k === "w" || k === "arrowup") {
        e.preventDefault();
        setInput({ j: true });
      }
      if (k === "e" || k === "k") setInput({ k: true });
    };
    const up = e => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") setInput({ l: false });
      if (k === "arrowright" || k === "d") setInput({ r: false });
      if (k === " " || k === "w" || k === "arrowup") setInput({ j: false });
      if (k === "e" || k === "k") setInput({ k: false });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [vm.phase, setInput]);

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

  const rematchCounts = useMemo(() => {
    let ready = 0;
    let seated = 0;
    for (const m of members) {
      if (m?.seat_index == null || m?.seat_index === "") continue;
      seated += 1;
      if (String(m?.wallet_state || "").trim() !== "committed") continue;
      if (memberGdRematchRequested(m)) ready += 1;
    }
    return { ready, seated };
  }, [members]);

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

  const mySeat = vm.mySeat;
  const isDrawResult = Boolean(vm.result && vm.result.isDraw === true);
  const dismissFinishModal = useCallback(() => {
    if (!finishSessionId) return;
    setFinishModalDismissedSessionId(finishSessionId);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
      } catch {
        /* ignore */
      }
    }
  }, [finishSessionId]);

  const winnerLabel = useMemo(() => {
    if (isDrawResult) return "Draw";
    if (vm.winnerSeat != null && mySeat != null) return vm.winnerSeat === mySeat ? "You won" : "You lost";
    return "Match over";
  }, [isDrawResult, vm.winnerSeat, mySeat]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const pub = vm.public && typeof vm.public === "object" ? vm.public : {};
    const aw = Number(pub.arena?.w ?? 800) || 800;
    const ah = Number(pub.arena?.h ?? 400) || 400;
    const gy = Number(pub.arena?.groundY ?? 360) || 360;
    const gm = Number(pub.arena?.goalMargin ?? 48) || 48;
    const W = c.width;
    const H = c.height;
    const sx = W / aw;
    const sy = H / ah;

    ctx.fillStyle = "#1a3d2e";
    ctx.fillRect(0, 0, W, H);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    skyGrad.addColorStop(0, "#87a7ff");
    skyGrad.addColorStop(1, "#b8e0c8");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * 0.42);

    ctx.fillStyle = "#2d8f4f";
    ctx.fillRect(0, gy * sy, W, H - gy * sy);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(gm * sx, 80 * sy, (aw - 2 * gm) * sx, (gy - 80) * sy);
    ctx.beginPath();
    ctx.moveTo((aw / 2) * sx, 80 * sy);
    ctx.lineTo((aw / 2) * sx, gy * sy);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, gy * sy - 4, W, 6);

    const drawPlayer = (px, py, hw, hh, fill) => {
      ctx.fillStyle = fill;
      ctx.fillRect((px - hw) * sx, (py - hh) * sy, hw * 2 * sx, hh * 2 * sy);
    };

    const p0 = pub.p0 && typeof pub.p0 === "object" ? pub.p0 : {};
    const p1 = pub.p1 && typeof pub.p1 === "object" ? pub.p1 : {};
    const ball = pub.ball && typeof pub.ball === "object" ? pub.ball : {};
    const p0x = Number(p0.x ?? 180);
    const p0y = Number(p0.y ?? 338);
    const hw0 = Number(p0.hw ?? 14);
    const hh0 = Number(p0.hh ?? 22);
    const p1x = Number(p1.x ?? 620);
    const p1y = Number(p1.y ?? 338);
    const hw1 = Number(p1.hw ?? 14);
    const hh1 = Number(p1.hh ?? 22);
    const bx = Number(ball.x ?? 400);
    const by = Number(ball.y ?? 220);
    const br = Number(ball.r ?? 11);

    drawPlayer(p0x, p0y, hw0, hh0, mySeat === 0 ? "#fbbf24" : "#94a3b8");
    drawPlayer(p1x, p1y, hw1, hh1, mySeat === 1 ? "#fbbf24" : "#64748b");

    ctx.fillStyle = "#fafafa";
    ctx.beginPath();
    ctx.arc(bx * sx, by * sy, br * Math.min(sx, sy), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, 140 * sy, gm * sx, 160 * sy);
    ctx.fillRect((aw - gm) * sx, 140 * sy, gm * sx, 160 * sy);
  }, [vm.public, vm.revision, mySeat]);

  const oppScore = mySeat === 0 ? vm.score1 : mySeat === 1 ? vm.score0 : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1.5 pb-3 pt-1 sm:gap-3 sm:px-2">
      {err ? <div className="rounded-lg border border-red-500/30 bg-red-950/35 px-2 py-1.5 text-[11px] text-red-100">{err}</div> : null}
      {vaultClaimBusy ? (
        <div className="rounded-lg border border-zinc-500/20 bg-zinc-900/40 px-2 py-1 text-[10px] text-zinc-400">Updating vault…</div>
      ) : null}

      {vm.phase === "playing" && mySeat != null ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
            <span>
              Match
              {vm.matchTimeLeftSec != null ? (
                <span className="ml-2 font-mono text-amber-200/90">⏱ {vm.matchTimeLeftSec}s</span>
              ) : null}
            </span>
            <span className="text-zinc-400">
              You {vm.myScore ?? "—"} · Opp {oppScore ?? "—"}
            </span>
          </div>
          <div className="relative mx-auto w-full max-w-[min(100%,28rem)] overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-lg">
            <canvas ref={canvasRef} width={800} height={400} className="h-auto w-full touch-none" />
          </div>
          <p className="text-center text-[10px] text-zinc-500 sm:text-[11px]">Keys: A/D or arrows move · W/Space jump · E strike · or use buttons</p>
          <div className="grid grid-cols-3 gap-2 sm:mx-auto sm:max-w-md">
            <button
              type="button"
              className={BTN_PAD}
              onPointerDown={() => setInput({ l: true })}
              onPointerUp={() => setInput({ l: false })}
              onPointerLeave={() => setInput({ l: false })}
            >
              ◀
            </button>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className={BTN_PAD + " h-9 text-[11px] sm:h-10"}
                onPointerDown={() => setInput({ j: true })}
                onPointerUp={() => setInput({ j: false })}
                onPointerLeave={() => setInput({ j: false })}
              >
                Jump
              </button>
              <button
                type="button"
                className={BTN_PAD + " h-9 text-[11px] sm:h-10"}
                onPointerDown={() => setInput({ k: true })}
                onPointerUp={() => setInput({ k: false })}
                onPointerLeave={() => setInput({ k: false })}
              >
                Strike
              </button>
            </div>
            <button
              type="button"
              className={BTN_PAD}
              onPointerDown={() => setInput({ r: true })}
              onPointerUp={() => setInput({ r: false })}
              onPointerLeave={() => setInput({ r: false })}
            >
              ▶
            </button>
          </div>
        </div>
      ) : null}

      {!session.snapshot && room?.active_session_id ? (
        <div className="py-6 text-center text-[12px] text-zinc-500">Loading match…</div>
      ) : null}

      {showResultModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-xl">
            <div className="text-lg font-bold text-white">{winnerLabel}</div>
            {vm.result && typeof vm.result === "object" ? (
              <p className="mt-2 text-[12px] text-zinc-400">
                {String(vm.result.score0 ?? vm.score0)} — {String(vm.result.score1 ?? vm.score1)}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
                {rematchBusy ? "Requesting…" : "Request rematch"}
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
                Cancel rematch
              </button>
              {isHost ? (
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={startNextBusy || rematchCounts.ready < 2}
                  onClick={() => void onStartNext()}
                >
                  {startNextBusy ? "Starting…" : `Start next match (${rematchCounts.ready}/2 rematch)`}
                </button>
              ) : (
                <p className="text-center text-[11px] text-zinc-500">Host starts the next match when both players rematch.</p>
              )}
              <button type="button" className={BTN_SECONDARY} onClick={() => dismissFinishModal()}>
                Dismiss
              </button>
              <button
                type="button"
                className="mt-1 text-[11px] text-zinc-500 underline"
                disabled={exitBusy}
                onClick={() => void onExitToLobby()}
              >
                {exitBusy ? "Leaving…" : "Exit to lobby"}
              </button>
              {exitErr ? <p className="text-[11px] text-red-300">{exitErr}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {finished && !showResultModal ? (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-3 text-[11px] text-zinc-400">
          <p className="font-semibold text-zinc-200">{winnerLabel}</p>
          <p className="mt-1">Result dismissed — you can rematch from the lobby or use buttons below if still available.</p>
        </div>
      ) : null}
    </div>
  );
}
