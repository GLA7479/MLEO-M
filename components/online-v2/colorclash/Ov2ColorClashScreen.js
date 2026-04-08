"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  ccCardInPendingDrawList,
  ccCardType,
  ccCardsEqual,
  ccColorName,
  ccFormatCard,
  ccStableCardKey,
} from "../../../lib/online-v2/colorclash/ov2ColorClashCards";
import { useOv2ColorClashSession } from "../../../hooks/useOv2ColorClashSession";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";

const finishDismissStorageKey = sid => `ov2_cc_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

const COLOR_SWATCH = [
  "bg-rose-600 border-rose-400/50",
  "bg-sky-600 border-sky-400/50",
  "bg-emerald-600 border-emerald-400/50",
  "bg-amber-500 border-amber-300/50",
];

/** @param {unknown} m */
function memberRematchRequested(m) {
  const meta = m?.meta;
  if (!meta || typeof meta !== "object") return false;
  const cc = /** @type {Record<string, unknown>} */ (meta).cc;
  if (!cc || typeof cc !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (cc).rematch_requested;
  return r === true || r === "true" || r === 1;
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2ColorClashScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2ColorClashSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    drawCard,
    passAfterDraw,
    playCard,
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
  const [wildForCard, setWildForCard] = useState(/** @type {Record<string, unknown>|null} */ (null));
  /** Two-tap Surge: first tap arms, second number submits (when surgeTwoTapMode). */
  const [surgeTwoTapMode, setSurgeTwoTapMode] = useState(false);
  const [surgeArmCard, setSurgeArmCard] = useState(/** @type {Record<string, unknown>|null} */ (null));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  useEffect(() => {
    setFinishModalDismissedSessionId("");
    setWildForCard(null);
    setSurgeTwoTapMode(false);
    setSurgeArmCard(null);
  }, [vm.sessionId]);

  useEffect(() => {
    setSurgeTwoTapMode(false);
    setSurgeArmCard(null);
  }, [vm.turnSeat, vm.turnPhase, vm.revision]);

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

  const seatDisplayName = useCallback(
    seat => {
      const m = members.find(x => Number(x?.seat_index) === Number(seat));
      const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
      return n || `Seat ${Number(seat) + 1}`;
    },
    [members]
  );

  const isEliminated = useCallback(
    seat => {
      const e = vm.eliminated;
      const v = e[String(seat)] ?? e[seat];
      return v === true || v === "true";
    },
    [vm.eliminated]
  );

  const opponentSeats = useMemo(() => {
    return vm.activeSeats.filter(s => vm.mySeat == null || s !== vm.mySeat);
  }, [vm.activeSeats, vm.mySeat]);

  const rematchCounts = useMemo(() => {
    let ready = 0;
    let seated = 0;
    for (const m of members) {
      if (m?.seat_index == null || m?.seat_index === "") continue;
      seated += 1;
      if (String(m?.wallet_state || "").trim() !== "committed") continue;
      if (memberRematchRequested(m)) ready += 1;
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
  const isDraw = Boolean(vm.result && vm.result.draw === true);
  const didIWin =
    !isDraw && vm.mySeat != null && vm.winnerSeat != null && Number(vm.winnerSeat) === Number(vm.mySeat);

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    return seatDisplayName(vm.winnerSeat);
  }, [vm.winnerSeat, seatDisplayName]);

  const finishMultiplier = 1;

  const finishOutcome = useMemo(() => {
    if (!finished) return "unknown";
    if (isDraw) return "draw";
    if (didIWin) return "win";
    if (vm.mySeat != null && vm.winnerSeat != null && Number(vm.winnerSeat) !== Number(vm.mySeat)) return "loss";
    return "unknown";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishTitle = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Draw";
    if (didIWin) return "Victory";
    if (vm.mySeat != null && vm.winnerSeat != null && Number(vm.winnerSeat) !== Number(vm.mySeat)) return "Defeat";
    return "Match finished";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishReasonLine = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Round drawn — stakes settled";
    return winnerDisplayName ? `Winner: ${winnerDisplayName}` : "Round complete";
  }, [finished, isDraw, winnerDisplayName]);

  const finishAmountLine = useMemo(() => {
    if (!finished) return { text: "—", className: "text-zinc-500" };
    if (vaultClaimBusy) return { text: "…", className: "text-zinc-400" };
    const res = vm.result && typeof vm.result === "object" ? /** @type {Record<string, unknown>} */ (vm.result) : null;
    const prizeRaw = res?.prize != null ? Number(res.prize) : NaN;
    const lossRaw = res?.lossPerSeat != null ? Number(res.lossPerSeat) : NaN;
    const baseStake =
      room?.stake_per_seat != null && Number.isFinite(Number(room.stake_per_seat)) ? Number(room.stake_per_seat) : null;
    const lossFb = baseStake != null ? Math.floor(baseStake) : null;
    const prizeFb = lossFb != null ? lossFb * 2 : null;
    if (isDraw) {
      const at = Number.isFinite(lossRaw) && lossRaw >= 0 ? Math.floor(lossRaw) : lossFb;
      if (at != null) {
        return { text: `+${at} MLEO (refunded)`, className: "font-semibold tabular-nums text-emerald-300/95" };
      }
      return { text: "Draw — stakes settled", className: "text-zinc-400" };
    }
    if (didIWin) {
      const p = Number.isFinite(prizeRaw) && prizeRaw > 0 ? Math.floor(prizeRaw) : prizeFb;
      if (p != null) {
        return { text: `+${p} MLEO`, className: "font-semibold tabular-nums text-amber-200/95" };
      }
    }
    if (!didIWin && vm.mySeat != null && vm.winnerSeat != null) {
      const l = Number.isFinite(lossRaw) && lossRaw > 0 ? Math.floor(lossRaw) : lossFb;
      if (l != null) {
        return { text: `−${l} MLEO`, className: "font-semibold tabular-nums text-rose-300/95" };
      }
    }
    return { text: "—", className: "text-zinc-500" };
  }, [finished, vaultClaimBusy, vm.result, isDraw, didIWin, vm.mySeat, vm.winnerSeat, room?.stake_per_seat]);

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

  const myTurnPlaying =
    vm.phase === "playing" && vm.mySeat != null && vm.turnSeat === vm.mySeat && vm.turnPhase === "play";
  const myTurnPostDraw =
    vm.phase === "playing" && vm.mySeat != null && vm.turnSeat === vm.mySeat && vm.turnPhase === "post_draw";

  const tryPlay = useCallback(
    async (card, colorOpt) => {
      const t = ccCardType(card);
      if (t === "w" || t === "f") {
        if (colorOpt == null || !Number.isInteger(colorOpt) || colorOpt < 0 || colorOpt > 3) {
          setWildForCard(/** @type {Record<string, unknown>} */ (card));
          return;
        }
      }
      setWildForCard(null);
      setSurgeTwoTapMode(false);
      setSurgeArmCard(null);
      await playCard(/** @type {Record<string, unknown>} */ (card), t === "w" || t === "f" ? colorOpt : null);
    },
    [playCard]
  );

  const onCardPress = useCallback(
    async card => {
      if (busy || vaultClaimBusy) return;
      if (vm.phase !== "playing") return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      setErr("");
      if (myTurnPostDraw) {
        if (!vm.pendingDrawForYou || !ccCardInPendingDrawList(vm.pendingDrawForYou, card)) return;
        await tryPlay(card, null);
        return;
      }
      if (myTurnPlaying) {
        if (surgeTwoTapMode && vm.surgeAvailableForMe) {
          if (surgeArmCard) {
            if (ccCardsEqual(card, surgeArmCard)) {
              setSurgeArmCard(null);
              return;
            }
            const t2 = ccCardType(card);
            if (t2 === "n") {
              const first = surgeArmCard;
              setSurgeArmCard(null);
              setSurgeTwoTapMode(false);
              const r = await playCard(first, null, { secondCard: /** @type {Record<string, unknown>} */ (card) });
              if (!r?.ok) {
                setSurgeTwoTapMode(true);
                setSurgeArmCard(first);
              }
              return;
            }
            setErr("Surge needs a second number card (or cancel).");
            return;
          }
          const t = ccCardType(card);
          if (t === "n") {
            setSurgeArmCard(/** @type {Record<string, unknown>} */ (card));
            return;
          }
          setSurgeTwoTapMode(false);
          await tryPlay(card, null);
          return;
        }
        await tryPlay(card, null);
      }
    },
    [
      busy,
      vaultClaimBusy,
      vm,
      myTurnPostDraw,
      myTurnPlaying,
      tryPlay,
      setErr,
      surgeTwoTapMode,
      surgeArmCard,
      playCard,
    ]
  );

  const onPickWildColor = useCallback(
    async ci => {
      if (!wildForCard || busy) return;
      setErr("");
      await tryPlay(wildForCard, ci);
    },
    [wildForCard, busy, tryPlay, setErr]
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden bg-zinc-950 px-1 pb-1.5 sm:gap-2 sm:px-2 sm:pb-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
            <div
              className={`flex items-center rounded-md border px-2 py-1 tabular-nums ${
                vm.phase === "playing" && vm.turnSeat === vm.mySeat
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
                Stock {vm.stockCount} · Pile {vm.discardCount}
              </span>
              <span className="rounded border border-amber-500/20 px-2 py-0.5 text-amber-100/90" title="Clash stack">
                Clash {vm.clashCount ?? 0}
              </span>
              {vm.wildLockAppliesToMe && vm.lockedColor != null ? (
                <span className="rounded border border-fuchsia-500/25 px-2 py-0.5 text-fuchsia-100/88" title="Wild lock">
                  Lock {ccColorName(vm.lockedColor)}
                </span>
              ) : null}
              {vm.mySeat != null ? (
                <span
                  className={`rounded border px-2 py-0.5 ${
                    vm.surgeUsedForMe ? "border-zinc-600 text-zinc-500" : "border-emerald-500/25 text-emerald-100/85"
                  }`}
                  title="Surge (once per match)"
                >
                  Surge {vm.surgeUsedForMe ? "used" : "ready"}
                </span>
              ) : null}
              {vm.currentColor != null ? (
                <span className="rounded border border-white/10 px-2 py-0.5 text-zinc-200">
                  Match color: {ccColorName(vm.currentColor)}
                </span>
              ) : null}
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

      <div className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
        {opponentSeats.map(seat => (
          <div
            key={`opp-${seat}`}
            className={`rounded-lg border px-2 py-1.5 text-[10px] sm:text-[11px] ${
              vm.turnSeat === seat ? "border-amber-500/35 bg-amber-950/20 text-amber-50/90" : "border-white/[0.08] bg-zinc-900/40 text-zinc-300"
            }`}
          >
            <div className="font-semibold text-zinc-100">{seatDisplayName(seat)}</div>
            <div className="mt-0.5 text-zinc-400">
              Cards: {Math.max(0, Math.floor(Number(vm.handCounts[String(seat)] ?? vm.handCounts[seat] ?? 0) || 0))}
            </div>
            {isEliminated(seat) ? <div className="mt-0.5 text-rose-300/90">Out</div> : null}
            <div className="mt-0.5 text-zinc-500">Missed: {vm.missedStreakBySeat[seat] ?? 0}/3</div>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-3">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Top card</p>
          <div className="mt-2 flex flex-col items-center gap-2">
            <div className="rounded-lg border border-white/15 bg-zinc-950 px-4 py-3 font-mono text-sm text-zinc-100">
              {vm.topDiscard ? ccFormatCard(vm.topDiscard) : "—"}
            </div>
            {vm.currentColor != null ? (
              <div
                className={`h-3 w-full max-w-[12rem] rounded-md border ${COLOR_SWATCH[vm.currentColor] ?? "bg-zinc-700"}`}
                title={ccColorName(vm.currentColor)}
              />
            ) : null}
          </div>
        </div>

        {vm.phase === "playing" && myTurnPlaying ? (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy || vm.stockCount <= 0}
              className={BTN_PRIMARY}
              onClick={() => {
                setSurgeTwoTapMode(false);
                setSurgeArmCard(null);
                void drawCard();
              }}
            >
              Draw
            </button>
            {vm.surgeAvailableForMe ? (
              <button
                type="button"
                disabled={busy}
                className={surgeTwoTapMode ? BTN_ACCENT : BTN_SECONDARY}
                onClick={() => {
                  setErr("");
                  setSurgeArmCard(null);
                  setSurgeTwoTapMode(s => !s);
                }}
              >
                Surge {surgeTwoTapMode ? "on" : "off"}
              </button>
            ) : null}
            {surgeTwoTapMode && surgeArmCard ? (
              <button
                type="button"
                disabled={busy}
                className={BTN_SECONDARY}
                onClick={() => {
                  setSurgeArmCard(null);
                }}
              >
                Cancel 1st
              </button>
            ) : null}
          </div>
        ) : null}

        {vm.phase === "playing" && myTurnPostDraw ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-950/15 p-2">
            <p className="text-center text-[11px] text-violet-100/90">
              {Array.isArray(vm.pendingDrawForYou) && vm.pendingDrawForYou.length > 1
                ? `You drew ${vm.pendingDrawForYou.length} cards. Play any drawn card that matches, or pass.`
                : "You drew a card. Play it now if it matches, or pass to end your turn."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" disabled={busy} className={BTN_SECONDARY} onClick={() => void passAfterDraw()}>
                Pass
              </button>
            </div>
          </div>
        ) : null}

        {wildForCard ? (
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-2">
            <p className="text-center text-[11px] text-sky-100/90">Choose match color for this wild card.</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map(ci => (
                <button
                  key={ci}
                  type="button"
                  disabled={busy}
                  className={`rounded-lg border px-2 py-2 text-[10px] font-semibold text-white ${COLOR_SWATCH[ci]}`}
                  onClick={() => void onPickWildColor(ci)}
                >
                  {ccColorName(ci)}
                </button>
              ))}
            </div>
            <button type="button" className="mt-2 w-full text-[10px] text-zinc-500 underline" onClick={() => setWildForCard(null)}>
              Cancel
            </button>
          </div>
        ) : null}

        <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-2 sm:p-3">
          <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Your hand</p>
          <div className="flex max-h-[40vh] flex-wrap justify-center gap-1 overflow-y-auto sm:max-h-none sm:gap-1.5">
            {vm.myHand.map((card, idx) => {
              const key = `${idx}-${ccStableCardKey(card)}`;
              const highlightPostDraw =
                myTurnPostDraw && vm.pendingDrawForYou && ccCardInPendingDrawList(vm.pendingDrawForYou, card);
              const surgeHighlight =
                surgeTwoTapMode &&
                surgeArmCard &&
                myTurnPlaying &&
                ccCardsEqual(card, surgeArmCard) &&
                ccCardType(card) === "n";
              const canTry =
                vm.phase === "playing" &&
                vm.mySeat != null &&
                vm.turnSeat === vm.mySeat &&
                !busy &&
                !vaultClaimBusy &&
                (myTurnPlaying || highlightPostDraw);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canTry}
                  onClick={() => void onCardPress(card)}
                  className={`min-w-[2.35rem] rounded-md border px-1.5 py-1 font-mono text-[10px] sm:min-w-[2.6rem] sm:text-[11px] ${
                    surgeHighlight
                      ? "border-emerald-400/55 bg-emerald-950/35 text-emerald-50"
                      : highlightPostDraw
                        ? "border-violet-400/60 bg-violet-950/40 text-violet-50"
                        : canTry
                          ? "border-sky-500/35 bg-sky-950/35 text-sky-100 active:scale-[0.97]"
                          : "cursor-default border-white/[0.06] bg-zinc-950/50 text-zinc-500"
                  }`}
                >
                  {ccFormatCard(card)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-cc-finish-title">
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
                  id="ov2-cc-finish-title"
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
                <p className="mt-2 text-center text-[10px] text-zinc-500">
                  Rematch ready: {rematchCounts.ready}/{rematchCounts.seated} seated (committed)
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
                Host starts the next match when players are ready to rematch.
              </p>
            )}
            <button type="button" className={BTN_SECONDARY} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              className={BTN_DANGER + " w-full"}
              disabled={exitBusy || !pk}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}

      <div className="shrink-0 border-t border-white/[0.06] pt-2">
        <button
          type="button"
          disabled={exitBusy || !pk}
          className="w-full rounded-lg border border-white/10 bg-zinc-900/50 py-2 text-[11px] text-zinc-300 disabled:opacity-45"
          onClick={() => void onExitToLobby()}
        >
          {exitBusy ? "Leaving…" : "Leave table (forfeit if in play)"}
        </button>
        {exitErr ? <p className="mt-1 text-center text-[10px] text-red-300">{exitErr}</p> : null}
      </div>
    </div>
  );
}
