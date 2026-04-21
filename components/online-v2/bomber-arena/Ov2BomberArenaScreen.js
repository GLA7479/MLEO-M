"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOv2BomberArenaSession } from "../../../hooks/useOv2BomberArenaSession";
import { useOv2MatchSnapshotWait } from "../../../hooks/useOv2MatchSnapshotWait";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { OV2_BOMBER_ARENA_PRODUCT_GAME_ID } from "../../../lib/online-v2/bomber-arena/ov2BomberArenaSessionAdapter";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";

const finishDismissStorageKey = sid => `ov2_bomber_finish_dismiss_${sid}`;

const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_FINISH_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

function cellInPairs(arr, x, y) {
  if (!Array.isArray(arr)) return false;
  for (const p of arr) {
    if (!Array.isArray(p) || p.length < 2) continue;
    if (Number(p[0]) === x && Number(p[1]) === y) return true;
  }
  return false;
}

const BTN =
  "rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-[11px] font-semibold text-emerald-100 disabled:opacity-45";

/** Match OV2 live shells: page body does not scroll; only bounded inner bands may. */
const BTN_PAD =
  "touch-none select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] disabled:opacity-45";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string, display_name?: string }, onLeaveToLobby?: () => void | Promise<void>, leaveToLobbyBusy?: boolean } | null }} props
 */
export default function Ov2BomberArenaScreen({ contextInput = null }) {
  const router = useRouter();
  const session = useOv2BomberArenaSession(contextInput ?? undefined);
  const {
    authoritativeSnapshot,
    isPlaying,
    isFinished,
    sessionId,
    mySeat,
    turnSeat,
    isMyTurn,
    stepBusy,
    stepError,
    submitMove,
    submitBomb,
    submitWait,
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
  } = session;

  const room =
    contextInput?.room && typeof contextInput.room === "object" ? /** @type {Record<string, unknown>} */ (contextInput.room) : null;
  const roomId = room?.id != null ? String(room.id) : "";
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : "";
  const selfKey = String(contextInput?.self?.participant_key || "").trim();

  const roomHasActiveOv2Session = Boolean(
    room && room.active_session_id != null && String(room.active_session_id).trim() !== ""
  );

  const { matchSnapshotTimedOut } = useOv2MatchSnapshotWait(
    Boolean(roomHasActiveOv2Session && roomProductId === OV2_BOMBER_ARENA_PRODUCT_GAME_ID),
    Boolean(authoritativeSnapshot),
    { timeoutMs: 18_000 }
  );

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");

  useEffect(() => {
    if (!isFinished) setFinishModalDismissedSessionId("");
  }, [isFinished]);

  useEffect(() => {
    setLeaveConfirmOpen(false);
  }, [sessionId]);

  const finishModalDismissed = useMemo(() => {
    const sid = String(sessionId || "").trim();
    if (!sid) return false;
    return (
      finishModalDismissedSessionId === sid ||
      (typeof window !== "undefined" &&
        (() => {
          try {
            return window.sessionStorage.getItem(finishDismissStorageKey(sid)) === "1";
          } catch {
            return false;
          }
        })())
    );
  }, [sessionId, finishModalDismissedSessionId]);

  const showResultModal = isFinished && Boolean(String(sessionId || "").trim()) && !finishModalDismissed;

  const dismissFinishModal = useCallback(() => {
    const sid = String(sessionId || "").trim();
    if (!sid) return;
    setFinishModalDismissedSessionId(sid);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(finishDismissStorageKey(sid), "1");
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const reopenFinishModal = useCallback(() => {
    const sid = String(sessionId || "").trim();
    if (!sid) return;
    setFinishModalDismissedSessionId("");
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(finishDismissStorageKey(sid));
      }
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const onExitToLobby = useCallback(async () => {
    if (!roomId || !selfKey || exitBusy) return;
    setExitErr("");
    setExitBusy(true);
    try {
      await leaveOv2RoomWithForfeitRetry({
        room,
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
  }, [roomId, selfKey, exitBusy, room, router]);

  const board = authoritativeSnapshot?.board && typeof authoritativeSnapshot.board === "object"
    ? /** @type {Record<string, unknown>} */ (authoritativeSnapshot.board)
    : null;
  const w = board && Number(board.w) > 0 ? Math.floor(Number(board.w)) : 9;
  const h = board && Number(board.h) > 0 ? Math.floor(Number(board.h)) : 9;
  const walls = board?.walls;
  const breakables = board?.breakables;
  const bombsRaw = board?.bombs;
  const players = board?.players && typeof board.players === "object" ? board.players : null;

  const playerCell = useMemo(() => {
    /** @type {Map<string, number>} */
    const m = new Map();
    if (players && typeof players === "object") {
      for (const seat of ["0", "1"]) {
        const o = /** @type {Record<string, unknown>|undefined} */ (players[seat]);
        if (!o || typeof o !== "object") continue;
        const x = Math.floor(Number(o.x));
        const y = Math.floor(Number(o.y));
        if (Number.isFinite(x) && Number.isFinite(y)) m.set(`${x},${y}`, Number(seat));
      }
    }
    return m;
  }, [players]);

  const bombsAt = useMemo(() => {
    /** @type {Map<string, { fuse: number, owner: number }>} */
    const m = new Map();
    if (!Array.isArray(bombsRaw)) return m;
    for (const b of bombsRaw) {
      if (!b || typeof b !== "object") continue;
      const o = /** @type {Record<string, unknown>} */ (b);
      const x = Math.floor(Number(o.x));
      const y = Math.floor(Number(o.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      m.set(`${x},${y}`, {
        fuse: Math.floor(Number(o.fuse) || 0),
        owner: Math.floor(Number(o.owner) || 0),
      });
    }
    return m;
  }, [bombsRaw]);

  const winnerSeat =
    authoritativeSnapshot?.winnerSeat != null && authoritativeSnapshot.winnerSeat !== ""
      ? Number(authoritativeSnapshot.winnerSeat)
      : null;
  const isDraw = authoritativeSnapshot?.isDraw === true;

  const didIWin = mySeat != null && winnerSeat != null && winnerSeat === mySeat;
  const didILose = mySeat != null && winnerSeat != null && winnerSeat !== mySeat;

  const finishOutcome = useMemo(() => {
    if (!isFinished) return "unknown";
    if (isDraw) return "draw";
    if (didIWin) return "win";
    if (didILose) return "loss";
    return "unknown";
  }, [isFinished, isDraw, didIWin, didILose]);

  const finishTitle = useMemo(() => {
    if (!isFinished) return "";
    if (isDraw) return "Draw";
    if (winnerSeat === 0 || winnerSeat === 1) {
      if (mySeat != null && winnerSeat === mySeat) return "You win";
      return `Seat ${winnerSeat + 1} wins`;
    }
    return "Match over";
  }, [isFinished, isDraw, winnerSeat, mySeat]);

  const showInMatchLeaveChrome = Boolean(
    roomId && selfKey && roomHasActiveOv2Session && !isFinished && authoritativeSnapshot
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-hidden overscroll-none p-2 text-zinc-100">
      <div className="shrink-0 text-[11px] text-zinc-400">
        {mySeat != null ? (
          <span>
            You: seat {mySeat + 1}
            {isPlaying ? (isMyTurn ? " — your turn" : ` — seat ${turnSeat + 1} to move`) : null}
          </span>
        ) : (
          <span>Spectating</span>
        )}
      </div>

      {matchSnapshotTimedOut ? (
        <div className="shrink-0 rounded-lg border border-amber-500/35 bg-amber-950/25 p-2 text-[11px] text-amber-100">
          Snapshot is slow to load. Check your connection, use Leave if you need to exit, then rejoin from the hub room list.
        </div>
      ) : null}

      {vaultClaimError ? (
        <div className="shrink-0 rounded-lg border border-rose-500/35 bg-rose-950/25 p-2 text-[11px] text-rose-100">
          {vaultClaimError}
          <button type="button" className="ml-2 text-sky-300 underline" onClick={() => retryVaultClaim()}>
            Retry
          </button>
        </div>
      ) : null}
      {vaultClaimBusy ? <p className="shrink-0 text-[10px] text-zinc-500">Updating vault…</p> : null}

      {stepError ? <p className="shrink-0 text-[11px] text-amber-200">{stepError}</p> : null}

      <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-[360px] flex-1 items-center justify-center overflow-hidden py-1">
        <div
          className="grid w-full min-w-0 gap-px rounded-lg border border-zinc-700 bg-zinc-900 p-1"
          style={{
            gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`,
            maxHeight: "100%",
            aspectRatio: `${w} / ${h}`,
          }}
        >
          {Array.from({ length: h * w }, (_, i) => {
            const x = i % w;
            const y = Math.floor(i / w);
            const wall = cellInPairs(walls, x, y);
            const brk = !wall && cellInPairs(breakables, x, y);
            const pl = playerCell.get(`${x},${y}`);
            const bomb = bombsAt.get(`${x},${y}`);
            let bg = "bg-zinc-800/90";
            if (wall) bg = "bg-zinc-950";
            else if (brk) bg = "bg-amber-900/35";
            return (
              <div
                key={`${x}-${y}`}
                className={`relative flex min-h-0 min-w-0 items-center justify-center text-[9px] font-bold ${bg}`}
              >
                {!wall && pl === 0 ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.7)]" />
                ) : null}
                {!wall && pl === 1 ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.7)]" />
                ) : null}
                {bomb ? (
                  <span
                    className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-orange-200/95"
                    title="Bomb"
                  >
                    {bomb.fuse > 0 ? bomb.fuse : "!"}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {roomHasActiveOv2Session && !authoritativeSnapshot && !matchSnapshotTimedOut ? (
        <div className="shrink-0 space-y-2 rounded-lg border border-zinc-600/40 bg-zinc-900/50 p-3 text-center text-[11px] text-zinc-300">
          <p>Loading match…</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={exitBusy || !selfKey}
              className={BTN_SECONDARY}
              onClick={() => setLeaveConfirmOpen(true)}
            >
              Leave
            </button>
          </div>
        </div>
      ) : null}

      {roomHasActiveOv2Session && !authoritativeSnapshot && matchSnapshotTimedOut ? (
        <div className="shrink-0 space-y-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-center text-[11px] text-amber-100">
          <p>Could not load match.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={exitBusy || !selfKey}
              className={BTN_SECONDARY}
              onClick={() => setLeaveConfirmOpen(true)}
            >
              Leave
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {isPlaying && mySeat != null ? (
        <div className="mx-auto flex w-full max-w-sm shrink-0 flex-col gap-2 touch-none pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-3 gap-2">
            <div />
            <button
              type="button"
              disabled={!isMyTurn || stepBusy}
              className={`${BTN} ${BTN_PAD}`}
              onClick={() => submitMove(0, -1)}
            >
              Up
            </button>
            <div />
            <button
              type="button"
              disabled={!isMyTurn || stepBusy}
              className={`${BTN} ${BTN_PAD}`}
              onClick={() => submitMove(-1, 0)}
            >
              Left
            </button>
            <button
              type="button"
              disabled={!isMyTurn || stepBusy}
              className={`${BTN} ${BTN_PAD}`}
              onClick={() => submitWait()}
            >
              Wait
            </button>
            <button
              type="button"
              disabled={!isMyTurn || stepBusy}
              className={`${BTN} ${BTN_PAD}`}
              onClick={() => submitMove(1, 0)}
            >
              Right
            </button>
            <div />
            <button
              type="button"
              disabled={!isMyTurn || stepBusy}
              className={`${BTN} ${BTN_PAD}`}
              onClick={() => submitMove(0, 1)}
            >
              Down
            </button>
            <div />
          </div>
          <button
            type="button"
            disabled={!isMyTurn || stepBusy}
            className={`${BTN} ${BTN_PAD}`}
            onClick={() => submitBomb()}
          >
            Drop bomb
          </button>
        </div>
      ) : null}

      {showInMatchLeaveChrome ? (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/[0.08] bg-zinc-950/40 px-1 py-1.5 sm:gap-3 sm:py-2">
          <button
            type="button"
            title="Leave the match — may count as forfeit in shared stake rooms."
            disabled={exitBusy || !selfKey}
            onClick={() => setLeaveConfirmOpen(true)}
            className="min-w-[4.5rem] rounded-md border border-white/18 bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-zinc-100 shadow-sm disabled:opacity-45 sm:min-w-[5rem] sm:px-3 sm:py-1.5 sm:text-[11px]"
          >
            {exitBusy ? "…" : "Leave"}
          </button>
        </div>
      ) : null}

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-bomber-finish-title">
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Match result</p>
                <h2
                  id="ov2-bomber-finish-title"
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
                <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">
                  Payouts are applied through settlement.{" "}
                  {vaultClaimBusy ? "Crediting vault…" : vaultClaimError ? "Tap Retry above if settlement stalls." : "Vault updated when ready."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-4">
            <button type="button" className={BTN_SECONDARY + " w-full"} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              disabled={exitBusy || !selfKey}
              className={BTN_FINISH_DANGER + " w-full"}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}

      {isFinished && !showResultModal ? (
        <div className="shrink-0 space-y-2 rounded-xl border border-white/[0.11] bg-gradient-to-b from-zinc-900/78 to-zinc-950 p-3 text-[11px] text-zinc-200/88 shadow-[0_12px_32px_rgba(0,0,0,0.42)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Result</p>
          <p className="text-sm font-semibold text-zinc-50">{finishTitle}</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.1] pt-3">
            <button type="button" className={BTN_SECONDARY} onClick={reopenFinishModal}>
              Show result again
            </button>
            <button
              type="button"
              disabled={exitBusy || !selfKey}
              className={BTN_FINISH_DANGER}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
          </div>
          {exitErr ? <p className="text-[11px] text-red-300">{exitErr}</p> : null}
        </div>
      ) : null}

      {leaveConfirmOpen ? (
        <Ov2SharedFinishModalFrame variant="center" titleId="ov2-bomber-leave-title">
          <div className="space-y-3 p-4">
            <h2 id="ov2-bomber-leave-title" className="text-center text-lg font-bold text-zinc-50">
              Leave match?
            </h2>
            <p className="text-center text-[11px] leading-snug text-zinc-400">
              Leaving an active Bomber Arena session uses the shared-room forfeit rules: you may lose the stake match, and
              your opponent can be awarded the win.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={BTN_SECONDARY + " w-full"}
                disabled={exitBusy}
                onClick={() => setLeaveConfirmOpen(false)}
              >
                Stay in match
              </button>
              <button
                type="button"
                className={BTN_FINISH_DANGER + " w-full"}
                disabled={exitBusy || !selfKey}
                onClick={async () => {
                  setLeaveConfirmOpen(false);
                  await onExitToLobby();
                }}
              >
                {exitBusy ? "Leaving…" : "Leave table"}
              </button>
            </div>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}
    </div>
  );
}
