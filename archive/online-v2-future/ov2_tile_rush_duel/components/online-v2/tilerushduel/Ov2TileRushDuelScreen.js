"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { TRD_KIND_SWATCH, trdTileFreeAt } from "../../../lib/online-v2/tilerushduel/ov2TileRushDuelBoard";
import { useOv2TileRushDuelSession } from "../../../hooks/useOv2TileRushDuelSession";

const finishDismissStorageKey = sid => `ov2_trd_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** @param {unknown} m */
function memberTrdRematchRequested(m) {
  const meta = m?.meta;
  if (!meta || typeof meta !== "object") return false;
  const trd = /** @type {Record<string, unknown>} */ (meta).trd;
  if (!trd || typeof trd !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (trd).rematch_requested;
  return r === true || r === "true" || r === 1;
}

/** @param {Record<string, unknown>|null} res */
function resultDetailLine(res, mySeat) {
  if (!res || typeof res !== "object") return "";
  if (res.cleared === true) return "Winning pair cleared the last tiles.";
  if (res.forfeit === true) {
    const fs = res.forfeitSeat != null ? Number(res.forfeitSeat) : null;
    if (fs === 0 || fs === 1) {
      return mySeat === fs ? "You left during the duel." : "Opponent left during the duel.";
    }
    return "Table closed by forfeit.";
  }
  const fr = res.finishReason != null ? String(res.finishReason) : "";
  if (fr === "duel_timer") return "Duel timer ended — scores decide the winner.";
  if (fr === "inactivity_forfeit") return "Inactivity rule applied — active player awarded the win.";
  return "";
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2TileRushDuelScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2TileRushDuelSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    removePair,
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
  const [picked, setPicked] = useState(/** @type {{ r: number, c: number } | null} */ (null));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  useEffect(() => {
    setFinishModalDismissedSessionId("");
    setPicked(null);
  }, [vm.sessionId]);

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
      if (memberTrdRematchRequested(m)) ready += 1;
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
  const oppScore = mySeat === 0 ? vm.score1 : mySeat === 1 ? vm.score0 : null;

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

  const winnerLabel =
    vm.winnerSeat != null && mySeat != null ? (vm.winnerSeat === mySeat ? "You won" : "You lost") : "Match over";

  const tileByRc = useMemo(() => {
    const m = new Map();
    for (const t of vm.tiles) {
      m.set(`${t.r},${t.c}`, t);
    }
    return m;
  }, [vm.tiles]);

  const onCell = useCallback(
    (r, c) => {
      if (vm.phase !== "playing" || busy || vaultClaimBusy || mySeat == null) return;
      const t = tileByRc.get(`${r},${c}`);
      if (!t || t.removed) return;
      if (!trdTileFreeAt(vm.tiles, vm.cols, r, c)) return;

      if (!picked) {
        setPicked({ r, c });
        return;
      }
      if (picked.r === r && picked.c === c) {
        setPicked(null);
        return;
      }
      const pr = picked.r;
      const pc = picked.c;
      setPicked(null);
      void (async () => {
        const res = await removePair(pr, pc, r, c);
        if (!res.ok) {
          /* err already set in hook */
        }
      })();
    },
    [vm.phase, vm.tiles, vm.cols, busy, vaultClaimBusy, mySeat, picked, tileByRc, removePair]
  );

  const rows = vm.rows;
  const cols = vm.cols;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1.5 pb-3 pt-1 sm:gap-3 sm:px-2">
      {err ? <div className="rounded-lg border border-red-500/30 bg-red-950/35 px-2 py-1.5 text-[11px] text-red-100">{err}</div> : null}
      {vaultClaimBusy ? (
        <div className="rounded-lg border border-zinc-500/20 bg-zinc-900/40 px-2 py-1 text-[10px] text-zinc-400">Updating vault…</div>
      ) : null}

      {vm.phase === "playing" && mySeat != null ? (
        <div className="space-y-2 sm:space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
            <span>
              Duel
              {vm.duelTimeLeftSec != null ? (
                <span className="ml-2 font-mono text-amber-200/90">⏱ {vm.duelTimeLeftSec}s</span>
              ) : null}
            </span>
            <span className="text-zinc-400">
              You {vm.myScore ?? "—"} · Opp {oppScore ?? "—"}
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 sm:text-[11px]">Tap two exposed matching tiles. Cleared pairs are shared — race to clear first.</p>
          <div
            className="mx-auto grid w-full max-w-[min(100%,20rem)] gap-1 sm:max-w-[min(100%,24rem)] sm:gap-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: rows * cols }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const t = tileByRc.get(`${r},${c}`);
              const removed = Boolean(t?.removed);
              const free = t && !removed ? trdTileFreeAt(vm.tiles, vm.cols, r, c) : false;
              const kind = t != null ? Math.max(0, Math.min(TRD_KIND_SWATCH.length - 1, Math.floor(Number(t.kind)))) : 0;
              const sw = TRD_KIND_SWATCH[kind] || TRD_KIND_SWATCH[0];
              const isPick = picked && picked.r === r && picked.c === c;
              const clickable = Boolean(vm.phase === "playing" && !removed && free && !busy && !vaultClaimBusy);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  disabled={!clickable}
                  onClick={() => onCell(r, c)}
                  className={[
                    "relative aspect-[5/6] min-h-0 min-w-0 rounded-md border text-[9px] font-bold transition sm:aspect-[4/5] sm:text-[10px]",
                    removed ? "border-transparent bg-transparent opacity-0 pointer-events-none" : "",
                    !removed ? `border ${sw}` : "",
                    free && !removed ? "ring-1 ring-white/15" : "",
                    isPick ? "ring-2 ring-amber-300/80" : "",
                    clickable ? "cursor-pointer active:scale-[0.97]" : "cursor-default opacity-60",
                  ].join(" ")}
                  aria-label={removed ? "empty" : `tile ${kind + 1}`}
                >
                  {!removed ? <span className="sr-only">kind {kind + 1}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {!snapshot && room?.active_session_id ? (
        <div className="py-6 text-center text-[12px] text-zinc-500">Loading match…</div>
      ) : null}

      {showResultModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-xl">
            <div className="text-lg font-bold text-white">{winnerLabel}</div>
            {vm.result && typeof vm.result === "object" ? (
              <p className="mt-2 text-[12px] text-zinc-400">{resultDetailLine(/** @type {Record<string, unknown>} */ (vm.result), mySeat)}</p>
            ) : null}
            {vm.result && typeof vm.result === "object" ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                Final {String(/** @type {Record<string, unknown>} */ (vm.result).score0 ?? vm.score0)} —{" "}
                {String(/** @type {Record<string, unknown>} */ (vm.result).score1 ?? vm.score1)}
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
