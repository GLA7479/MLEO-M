"use client";

import Link from "next/link";
import { useMemo } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { OV2_BOMBER_ARENA_PRODUCT_GAME_ID } from "../../../lib/online-v2/bomber-arena/ov2BomberArenaSessionAdapter";
import { useOv2BomberArenaSession } from "../../../hooks/useOv2BomberArenaSession";
import { useOv2MatchSnapshotWait } from "../../../hooks/useOv2MatchSnapshotWait";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";

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
  const session = useOv2BomberArenaSession(contextInput ?? undefined);
  const {
    authoritativeSnapshot,
    isPlaying,
    isFinished,
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

  const roomId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.id != null
      ? String(contextInput.room.id)
      : "";
  const roomProductId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.product_game_id != null
      ? String(contextInput.room.product_game_id)
      : "";
  const roomHasActiveOv2Session = Boolean(
    contextInput?.room &&
      typeof contextInput.room === "object" &&
      contextInput.room.active_session_id != null &&
      String(contextInput.room.active_session_id).trim() !== ""
  );

  const { matchSnapshotTimedOut } = useOv2MatchSnapshotWait(
    Boolean(roomHasActiveOv2Session && roomProductId === OV2_BOMBER_ARENA_PRODUCT_GAME_ID),
    Boolean(authoritativeSnapshot),
    { timeoutMs: 18_000 }
  );

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

  const finishTitle = useMemo(() => {
    if (!isFinished) return "";
    if (isDraw) return "Draw";
    if (winnerSeat === 0 || winnerSeat === 1) {
      if (mySeat != null && winnerSeat === mySeat) return "You win";
      return `Seat ${winnerSeat + 1} wins`;
    }
    return "Match over";
  }, [isFinished, isDraw, winnerSeat, mySeat]);

  const onLeave = contextInput?.onLeaveToLobby;
  const leaveBusy = Boolean(contextInput?.leaveToLobbyBusy);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-hidden overscroll-none p-2 text-zinc-100">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
        <div>
          {mySeat != null ? (
            <span>
              You: seat {mySeat + 1}
              {isPlaying ? (isMyTurn ? " — your turn" : ` — seat ${turnSeat + 1} to move`) : null}
            </span>
          ) : (
            <span>Spectating</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/online-v2/rooms" className="text-sky-300 underline">
            Lobby
          </Link>
          {typeof window !== "undefined" ? (
            <button
              type="button"
              className="text-sky-300 underline"
              onClick={() => {
                try {
                  if (roomId) window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
                } catch {
                  /* ignore */
                }
                void window.location.assign(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
              }}
            >
              Room
            </button>
          ) : null}
        </div>
      </div>

      {matchSnapshotTimedOut ? (
        <div className="shrink-0 rounded-lg border border-amber-500/35 bg-amber-950/25 p-2 text-[11px] text-amber-100">
          Snapshot is slow to load. Check your connection or tap Lobby and re-enter the room.
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

      {isFinished ? (
        <Ov2SharedFinishModalFrame titleId="ov2-bomber-finish-title">
          <div className="space-y-3 p-4">
            <h2 id="ov2-bomber-finish-title" className="text-center text-lg font-bold text-zinc-50">
              {finishTitle}
            </h2>
            <p className="text-center text-[11px] text-zinc-400">
              Payouts are applied through settlement. {vaultClaimBusy ? "Crediting vault…" : "Vault updated when ready."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={leaveBusy || typeof onLeave !== "function"}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 py-2 text-sm font-semibold text-zinc-100 disabled:opacity-45"
                onClick={() => void onLeave?.()}
              >
                {leaveBusy ? "Leaving…" : "Back to lobby"}
              </button>
            </div>
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}
    </div>
  );
}
