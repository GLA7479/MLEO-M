"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Matches server spawn-bubble (Manhattan ≤3 from each corner spawn). */
function isSpawnBubbleTile(x, y) {
  const d0 = Math.abs(x - 1) + Math.abs(y - 1);
  const d1 = Math.abs(x - 7) + Math.abs(y - 7);
  return d0 <= 3 || d1 <= 3;
}

/**
 * @param {unknown[]} members
 * @param {unknown} seatsRaw
 * @param {string} _selfKey
 * @param {number|null} mySeat
 */
function resolveOpponentDisplayName(members, seatsRaw, _selfKey, mySeat) {
  if (mySeat !== 0 && mySeat !== 1) return "Opponent";
  const other = mySeat === 0 ? 1 : 0;
  const seats = Array.isArray(seatsRaw) ? seatsRaw : [];
  const row = seats.find(s => {
    const o = /** @type {Record<string, unknown>} */ (s);
    const si = o.seatIndex ?? o.seat_index;
    return Number(si) === other;
  });
  const ro = row && typeof row === "object" ? /** @type {Record<string, unknown>} */ (row) : null;
  const pk = String(ro?.participantKey ?? ro?.participant_key ?? "").trim();
  if (!pk) return `Player ${other + 1}`;
  const m = members.find(x => String(/** @type {Record<string, unknown>} */ (x)?.participant_key || "").trim() === pk);
  const name = String(/** @type {Record<string, unknown>} */ (m)?.display_name || "").trim();
  return name || `Player ${other + 1}`;
}

/**
 * Bomber-local pilot token (no shared Ludo dog art).
 * @param {{ seat: 0|1, isTurnActive: boolean }} props
 */
function BomberPawnAvatar({ seat, isTurnActive }) {
  const shell =
    seat === 0
      ? "bg-gradient-to-br from-sky-200/95 via-sky-500 to-sky-950 shadow-[inset_0_2px_3px_rgba(255,255,255,0.38)]"
      : "bg-gradient-to-br from-amber-200/95 via-orange-500 to-amber-950 shadow-[inset_0_2px_3px_rgba(255,255,255,0.32)]";
  const ring = isTurnActive
    ? seat === 0
      ? "ring-2 ring-sky-100/90 shadow-[0_0_14px_rgba(56,189,248,0.55)]"
      : "ring-2 ring-amber-100/88 shadow-[0_0_14px_rgba(251,146,60,0.5)]"
    : "ring-1 ring-black/30";
  return (
    <span
      className={`pointer-events-none absolute inset-[8%] z-[3] block rounded-full ${shell} ${ring}`}
      aria-hidden
    >
      <span className="absolute left-1/2 top-[16%] h-[24%] w-[55%] -translate-x-1/2 rounded-full bg-black/40" />
    </span>
  );
}

const BTN =
  "rounded-md border border-emerald-500/35 bg-emerald-950/55 px-2 py-1.5 text-[10px] font-semibold leading-tight text-emerald-100 disabled:opacity-45 min-h-[2.5rem] sm:min-h-[2.625rem] sm:px-2.5 sm:py-2 sm:text-[11px]";

const BTN_BOMB =
  "rounded-md border border-orange-500/45 bg-gradient-to-b from-orange-950/75 to-zinc-950 px-2 py-1.5 text-[11px] font-bold leading-tight text-orange-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_12px_rgba(234,88,12,0.22)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40 min-h-[2.65rem] sm:rounded-lg sm:min-h-[2.75rem] sm:px-3 sm:py-2";

/** Match OV2 live shells: page body does not scroll; only bounded inner bands may. */
const BTN_PAD =
  "touch-none select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] disabled:opacity-45";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string, display_name?: string }, onLeaveToLobby?: () => void | Promise<void>, leaveToLobbyBusy?: boolean } | null }} props — `members` used for duel strip names.
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
    simTicksRemaining,
    rulesPhase,
    suddenDeathBombRadius,
    canWait,
    legalMoveCount,
    lastAction,
    finishReason,
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
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const seatsRaw = authoritativeSnapshot?.seats;

  const [boardFlash, setBoardFlash] = useState(false);
  const prevRevisionRef = useRef(/** @type {number|null} */ (null));

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

  useEffect(() => {
    const rev = Number(authoritativeSnapshot?.revision);
    if (!Number.isFinite(rev)) return undefined;
    const prev = prevRevisionRef.current;
    prevRevisionRef.current = rev;
    if (prev == null || !isPlaying) return undefined;
    if (rev > prev) {
      setBoardFlash(true);
      const t = window.setTimeout(() => setBoardFlash(false), 140);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [authoritativeSnapshot?.revision, isPlaying]);

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
  const fuseTicksDefault = Math.min(30, Math.max(1, Math.floor(Number(board?.fuseTicksDefault) || 6)));
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

  const maxBombsPerPlayer = Math.min(4, Math.max(1, Math.floor(Number(board?.maxBombsPerPlayer) || 2)));

  const myBombCount = useMemo(() => {
    if (mySeat == null || !Array.isArray(bombsRaw)) return 0;
    let c = 0;
    for (const b of bombsRaw) {
      if (!b || typeof b !== "object") continue;
      const o = /** @type {Record<string, unknown>} */ (b);
      if (Math.floor(Number(o.owner)) === mySeat) c += 1;
    }
    return c;
  }, [bombsRaw, mySeat]);

  const bombAtLimit = myBombCount >= maxBombsPerPlayer;

  const opponentDisplayName = useMemo(
    () => resolveOpponentDisplayName(members, seatsRaw, selfKey, mySeat),
    [members, seatsRaw, selfKey, mySeat]
  );

  const selfDisplayName = String(contextInput?.self?.display_name || "").trim() || "You";

  const lastPulseKey = useMemo(() => {
    if (!lastAction || typeof lastAction !== "object") return "";
    const seat = Number(/** @type {Record<string, unknown>} */ (lastAction).seat);
    if (seat !== 0 && seat !== 1) return "";
    if (mySeat != null && seat === mySeat) return "";
    if (String(/** @type {Record<string, unknown>} */ (lastAction).type) !== "move") return "";
    const pl = players?.[String(seat)];
    if (!pl || typeof pl !== "object") return "";
    const x = Math.floor(Number(/** @type {Record<string, unknown>} */ (pl).x));
    const y = Math.floor(Number(/** @type {Record<string, unknown>} */ (pl).y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
    return `${x},${y}`;
  }, [lastAction, players, mySeat]);

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

  /** Headline copy aligned with `Ov2SnakesScreen` finish modal (`Victory` / `Defeat` / `Match finished`). */
  const finishTitleSnakes = useMemo(() => {
    if (!isFinished) return "";
    if (isDraw) return "Match finished";
    if (didIWin) return "Victory";
    if (didILose) return "Defeat";
    return "Match finished";
  }, [isFinished, isDraw, didIWin, didILose]);

  /** Snakes tri-state for ribbon / icon / title colors (draw maps to `unknown`). */
  const snakesFinishVisual = useMemo(() => {
    if (finishOutcome === "win") return "win";
    if (finishOutcome === "loss") return "loss";
    return "unknown";
  }, [finishOutcome]);

  const prizeTotal = room?.pot_locked != null ? Math.floor(Number(room.pot_locked) || 0) : null;
  const stakePerSeat = room?.stake_per_seat != null ? Math.floor(Number(room.stake_per_seat) || 0) : null;

  const finishSubtitleBomber = useMemo(() => {
    const fr = String(finishReason || "")
      .replace(/^"+|"+$/g, "")
      .trim()
      .toLowerCase();
    if (fr === "double_ko") return "Double K.O.";
    if (fr === "time_limit") return "Time limit — draw";
    if (fr === "forfeit") return "Forfeit";
    if (fr === "elimination") return "K.O.";
    if (isDraw) return "Draw";
    return "Match complete";
  }, [finishReason, isDraw]);

  const rulesPhaseNorm = useMemo(() => {
    const s = String(rulesPhase ?? "normal")
      .replace(/^"+|"+$/g, "")
      .trim()
      .toLowerCase();
    if (s === "sudden_death" || s === "sudden death") return "sudden_death";
    return s || "normal";
  }, [rulesPhase]);

  const finishReasonLine = useMemo(() => {
    if (!isFinished) return "";
    if (isDraw) return "No winner — stakes refunded per settlement";
    if (winnerSeat === 0 || winnerSeat === 1) return `Winner: Seat ${winnerSeat + 1}`;
    return "Match complete";
  }, [isFinished, isDraw, winnerSeat]);

  const finishAmountLine = useMemo(() => {
    if (!isFinished) return { text: "—", className: "text-zinc-500" };
    if (isDraw) return { text: "—", className: "text-zinc-500" };
    if (didIWin && prizeTotal != null && prizeTotal > 0) {
      return {
        text: `+${prizeTotal.toLocaleString()} MLEO`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (didILose && stakePerSeat > 0) {
      return {
        text: `−${stakePerSeat.toLocaleString()} MLEO`,
        className: "font-semibold tabular-nums text-rose-300/95",
      };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [isFinished, isDraw, didIWin, didILose, prizeTotal, stakePerSeat]);

  const finishActionsLocked = vaultClaimBusy;

  const showInMatchLeaveChrome = Boolean(
    roomId && selfKey && roomHasActiveOv2Session && !isFinished && authoritativeSnapshot
  );

  const showBoardLoadingOverlay = Boolean(roomHasActiveOv2Session && !authoritativeSnapshot);

  const hudAlertLine = useMemo(() => {
    if (matchSnapshotTimedOut && !showBoardLoadingOverlay) {
      return (
        <span className="text-amber-200/95">
          Snapshot slow — check connection. Use <span className="font-semibold">Leave</span> below if needed.
        </span>
      );
    }
    if (vaultClaimError) {
      return (
        <span className="text-rose-200/95">
          {vaultClaimError}{" "}
          <button type="button" className="text-sky-300 underline" onClick={() => retryVaultClaim()}>
            Retry
          </button>
        </span>
      );
    }
    if (vaultClaimBusy) return <span className="text-zinc-500">Updating vault…</span>;
    if (stepError) return <span className="text-amber-200">{stepError}</span>;
    return null;
  }, [matchSnapshotTimedOut, showBoardLoadingOverlay, vaultClaimError, vaultClaimBusy, stepError, retryVaultClaim]);

  const boardBoxStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`,
      aspectRatio: `${w} / ${h}`,
      width: "min(100%, min(96vmin, calc(100dvh - 5.5rem)))",
      maxWidth: "100%",
      maxHeight: "min(96vmin, calc(100dvh - 5.5rem), 100%)",
    }),
    [w, h]
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-x-hidden overflow-y-hidden overscroll-none px-1 pb-[max(0.125rem,env(safe-area-inset-bottom))] pt-0.5 text-zinc-100 sm:px-2">
      <header className="shrink-0 border-b border-white/[0.06] pb-1 pt-0.5">
        <div className="flex items-center justify-between gap-1.5 text-[10px] font-semibold leading-tight tracking-tight text-zinc-200 sm:text-[11px]">
          <span className="min-w-0 truncate text-sky-200/95">{selfDisplayName}</span>
          <span className="shrink-0 rounded bg-zinc-800/90 px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.18em] text-zinc-500">
            vs
          </span>
          <span className="min-w-0 truncate text-right text-amber-200/95">{opponentDisplayName}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[9px] leading-tight text-zinc-500 sm:text-[10px]">
          <span className={isPlaying && mySeat != null && isMyTurn ? "font-bold uppercase tracking-wide text-orange-200/95" : ""}>
            {mySeat != null
              ? isPlaying
                ? isMyTurn
                  ? "Your turn"
                  : "Their turn"
                : isFinished
                  ? "Finished"
                  : "—"
              : "Spectating"}
          </span>
          {isPlaying && simTicksRemaining != null ? (
            <span className="max-w-[min(100%,14rem)] text-right tabular-nums">
              <span className="font-semibold text-zinc-300">{simTicksRemaining}</span> ticks
              {rulesPhaseNorm === "sudden_death" ? <span className="font-semibold text-orange-300/95"> · SD</span> : null}
              {suddenDeathBombRadius != null ? <span className="text-zinc-600"> · r{suddenDeathBombRadius}</span> : null}
              {legalMoveCount != null && mySeat != null ? (
                <span className="text-zinc-600"> · mv{legalMoveCount}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      </header>

      {hudAlertLine ? (
        <div className="shrink-0 border-b border-white/[0.05] py-0.5 text-[9px] leading-snug sm:text-[10px]">{hudAlertLine}</div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-stretch justify-center overflow-hidden">
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center px-0.5 py-0">
          <div
            className={[
              "grid min-h-0 min-w-0 gap-px rounded-md border border-zinc-700/55 bg-zinc-900 p-0.5 shadow-md transition-[box-shadow,filter] duration-150",
              boardFlash ? "shadow-[0_0_0_2px_rgba(251,146,60,0.38),0_8px_28px_rgba(0,0,0,0.35)]" : "",
            ].join(" ")}
            style={boardBoxStyle}
          >
          {Array.from({ length: h * w }, (_, i) => {
            const x = i % w;
            const y = Math.floor(i / w);
            const wall = cellInPairs(walls, x, y);
            const brk = !wall && cellInPairs(breakables, x, y);
            const pl = playerCell.get(`${x},${y}`);
            const bomb = bombsAt.get(`${x},${y}`);
            const spawnHint = !wall && !brk && isSpawnBubbleTile(x, y);
            let floor =
              "bg-zinc-800/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
            if (wall) {
              floor =
                "bg-gradient-to-br from-zinc-900 to-zinc-950 ring-1 ring-inset ring-black/50 shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]";
            } else if (brk) {
              floor =
                "bg-amber-950/28 bg-[repeating-linear-gradient(135deg,rgba(245,158,11,0.14)_0px,rgba(245,158,11,0.14)_3px,transparent_3px,transparent_7px)] ring-1 ring-inset ring-amber-900/32";
            } else if (spawnHint) {
              floor =
                "bg-zinc-800/92 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.14),inset_0_1px_0_rgba(255,255,255,0.04)]";
            }
            const detonating = Boolean(bomb && bomb.fuse <= 0);
            const oppMovePulse = lastPulseKey === `${x},${y}`;
            const fuseRingOpacity =
              bomb && bomb.fuse > 0 && fuseTicksDefault > 0
                ? 0.28 + 0.62 * Math.min(1, bomb.fuse / fuseTicksDefault)
                : 0.45;
            const pawnTurnActive = isPlaying && pl != null && (pl === 0 || pl === 1) && pl === turnSeat;
            return (
              <div
                key={`${x}-${y}`}
                className={`relative flex min-h-0 min-w-0 items-center justify-center text-[9px] font-bold ${floor}`}
              >
                {oppMovePulse ? (
                  <span
                    className="pointer-events-none absolute inset-0 z-0 ring-2 ring-inset ring-sky-400/40 animate-pulse"
                    aria-hidden
                  />
                ) : null}
                {detonating ? (
                  <span
                    className="pointer-events-none absolute inset-0 z-[1] ring-1 ring-inset ring-orange-500/35"
                    aria-hidden
                  />
                ) : null}
                {bomb && !wall ? (
                  <span className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
                    {bomb.fuse > 0 ? (
                      <span className="relative flex h-[44%] min-h-[0.95rem] w-[44%] min-w-[0.95rem] items-center justify-center">
                        <span
                          className="absolute inset-0 rounded-full border-2 border-orange-400/60 animate-pulse"
                          style={{ opacity: fuseRingOpacity }}
                          aria-hidden
                        />
                        <span className="relative z-[1] font-mono text-[10px] font-bold tabular-nums leading-none text-orange-100">
                          {bomb.fuse}
                        </span>
                      </span>
                    ) : (
                      <span className="rounded-sm px-0.5 text-[10px] font-bold text-amber-100 ring-1 ring-orange-400/40">
                        !
                      </span>
                    )}
                  </span>
                ) : null}
                {!wall && pl != null && (pl === 0 || pl === 1) ? (
                  <BomberPawnAvatar seat={/** @type {0|1} */ (pl)} isTurnActive={pawnTurnActive} />
                ) : null}
              </div>
            );
          })}
          </div>

          {showBoardLoadingOverlay ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-zinc-950/86 px-2 backdrop-blur-[1px]">
              <div className="w-full max-w-[17rem] space-y-2 rounded-lg border border-zinc-600/45 bg-zinc-900/95 p-3 text-center text-[11px] text-zinc-200 shadow-lg">
                {matchSnapshotTimedOut ? (
                  <>
                    <p className="text-amber-100/95">Could not load match.</p>
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
                  </>
                ) : (
                  <>
                    <p>Loading match…</p>
                    <div className="flex justify-center">
                      <button
                        type="button"
                        disabled={exitBusy || !selfKey}
                        className={BTN_SECONDARY}
                        onClick={() => setLeaveConfirmOpen(true)}
                      >
                        Leave
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-lg shrink-0 touch-none flex-col gap-1 pt-1">
        <div
          className={[
            !(isPlaying && mySeat != null) ? "invisible pointer-events-none select-none" : "",
            isPlaying && mySeat != null && !isMyTurn ? "opacity-[0.42]" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden={!(isPlaying && mySeat != null)}
        >
          <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
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
            {isMyTurn && canWait ? (
              <button
                type="button"
                disabled={stepBusy}
                className={`${BTN} ${BTN_PAD} text-[9px] sm:text-[10px]`}
                onClick={() => submitWait()}
              >
                Pass
              </button>
            ) : (
              <div className="min-h-[2.5rem]" aria-hidden />
            )}
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
            disabled={!isMyTurn || stepBusy || bombAtLimit}
            title={bombAtLimit ? `At most ${maxBombsPerPlayer} of your bombs on the field` : undefined}
            className={`${BTN_BOMB} ${BTN_PAD} flex w-full items-center justify-center gap-2`}
            onClick={() => submitBomb()}
          >
            <span>Drop bomb</span>
            {mySeat != null ? (
              <span className="rounded border border-orange-400/35 bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-orange-100/90">
                {myBombCount}/{maxBombsPerPlayer}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/[0.07] bg-zinc-950/35 px-1 py-0.5">
        {showInMatchLeaveChrome ? (
          <button
            type="button"
            title="Leave the match — may count as forfeit in shared stake rooms."
            disabled={exitBusy || !selfKey}
            onClick={() => setLeaveConfirmOpen(true)}
            className="min-w-[4.25rem] rounded border border-white/16 bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-zinc-100 shadow-sm disabled:opacity-45 sm:min-w-[4.5rem] sm:px-2.5 sm:py-1"
          >
            {exitBusy ? "…" : "Leave"}
          </button>
        ) : null}
      </div>

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-bomber-finish-title">
          <div
            className={[
              "border-b px-4 pb-3 pt-4",
              snakesFinishVisual === "win"
                ? "border-emerald-500/20 bg-gradient-to-br from-emerald-950/45 to-zinc-950/80"
                : snakesFinishVisual === "loss"
                  ? "border-rose-500/20 bg-gradient-to-br from-rose-950/40 to-zinc-950/80"
                  : "border-white/[0.07] bg-zinc-950/60",
            ].join(" ")}
          >
            <div className="flex items-start gap-3">
              <span
                className={[
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl shadow-inner",
                  snakesFinishVisual === "win" && "border-emerald-500/45 bg-emerald-950/60 text-emerald-200",
                  snakesFinishVisual === "loss" && "border-rose-500/45 bg-rose-950/55 text-rose-200",
                  snakesFinishVisual === "unknown" && "border-white/10 bg-zinc-900/80 text-zinc-200",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              >
                {snakesFinishVisual === "win" ? "🏆" : snakesFinishVisual === "loss" ? "✕" : "⎔"}
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Match result</p>
                <h2
                  id="ov2-bomber-finish-title"
                  className={[
                    "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                    snakesFinishVisual === "win" && "text-emerald-400",
                    snakesFinishVisual === "loss" && "text-rose-400",
                    snakesFinishVisual === "unknown" && "text-zinc-100",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {finishTitleSnakes}
                </h2>
                <p className="mt-2 text-center text-[12px] font-semibold leading-snug text-zinc-200">{finishSubtitleBomber}</p>
                <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                  <p className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}>
                    {finishAmountLine.text}
                  </p>
                </div>
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">{finishReasonLine}</p>
                {mySeat == null && prizeTotal != null && winnerSeat != null ? (
                  <p className="mt-2 text-center text-[10px] text-zinc-500">
                    Spectator · winner S{winnerSeat + 1} · pot {prizeTotal.toLocaleString()}
                  </p>
                ) : null}
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                  {finishActionsLocked ? "Sending results to your balance…" : "You can dismiss and stay at the table, or leave when you are done."}
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
              onClick={async () => {
                if (!selfKey) return;
                await onExitToLobby();
              }}
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
