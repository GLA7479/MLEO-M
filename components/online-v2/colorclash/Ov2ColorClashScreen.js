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
import { ccIsPlayableOn, ccSurgeSecondPlayable, humanizeOv2ColorClashError } from "../../../lib/online-v2/colorclash/ov2ColorClashPlayLogic";
import { useOv2ColorClashSession } from "../../../hooks/useOv2ColorClashSession";
import { useOv2MatchSnapshotWait } from "../../../hooks/useOv2MatchSnapshotWait";
import {
  OV2_DUEL_HAND_HIT_CLEAR_MS,
  OV2_DUEL_HAND_HIT_DELAY_MS,
  playOv2DuelCardTap,
  playOv2DuelInvalid,
  playOv2DuelSuccess,
} from "../../../lib/online-v2/ov2DuelPairUiSounds";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import {
  OV2_BTN_ACCENT,
  OV2_BTN_DANGER,
  OV2_BTN_PRIMARY,
  OV2_BTN_SECONDARY,
  OV2_DUEL_CHIP_METRIC,
  OV2_DUEL_HAND_PILL_BASE,
  OV2_DUEL_HAND_PILL_DISABLED,
  OV2_DUEL_HAND_PILL_ENABLED,
  OV2_DUEL_HUD_BAR,
  OV2_DUEL_ACTION_GROUP,
  OV2_DUEL_PANEL_HAND,
  OV2_DUEL_PANEL_HAND_ACTIVE,
  OV2_DUEL_PANEL_LABEL,
  OV2_DUEL_PANEL_TOP,
  OV2_DUEL_SETTLEMENT_BADGE,
  OV2_DUEL_TIMER_ACTIVE,
  OV2_DUEL_TIMER_IDLE,
  OV2_OPP_PANEL_ACTIVE,
  OV2_OPP_PANEL_BASE,
  OV2_OPP_PANEL_IDLE,
} from "../tokens/ov2DuelPairUiTokens";

const finishDismissStorageKey = sid => `ov2_cc_finish_dismiss_${sid}`;

const COLOR_SWATCH = [
  "bg-rose-600 border-rose-400/50",
  "bg-sky-600 border-sky-400/50",
  "bg-emerald-600 border-emerald-400/50",
  "bg-amber-500 border-amber-300/50",
];
const CC_COLOR_CARD_BG = ["from-rose-500 to-rose-700", "from-sky-500 to-sky-700", "from-emerald-500 to-emerald-700", "from-amber-400 to-amber-600"];
const CC_COLOR_CARD_RING = ["ring-rose-300/45", "ring-sky-300/45", "ring-emerald-300/45", "ring-amber-300/45"];

/** @param {unknown} m */
function memberRematchRequested(m) {
  const meta = m?.meta;
  if (!meta || typeof meta !== "object") return false;
  const cc = /** @type {Record<string, unknown>} */ (meta).cc;
  if (!cc || typeof cc !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (cc).rematch_requested;
  return r === true || r === "true" || r === 1;
}

function ccCardPresentation(card) {
  const t = ccCardType(card);
  const c = Number(card?.c);
  const hasColor = Number.isInteger(c) && c >= 0 && c <= 3;
  const label = ccFormatCard(card);
  if (t === "w") return { label: "WILD", sub: "Choose color", wild: true };
  if (t === "f") return { label: "WILD +4", sub: "Choose color", wild: true };
  if (t === "s") return { label: "SKIP", sub: "Skip next", wild: false };
  if (t === "r") return { label: "REVERSE", sub: "Turn flip", wild: false };
  if (t === "d") return { label: "+2", sub: "Draw two", wild: false };
  return { label, sub: "", wild: !hasColor };
}

/**
 * Shared card interior: corner row, main label, optional sub — `justify-between` so number cards match top vs hand.
 * @param {{ card: Record<string, unknown>, variant: "top" | "hand" }} props
 */
function CcSharedCardFaceInner({ card, variant }) {
  const p = ccCardPresentation(card);
  const ci = Number(card?.c);
  const ring = Number.isInteger(ci) && ci >= 0 && ci <= 3 ? CC_COLOR_CARD_RING[ci] : "ring-fuchsia-300/40";
  const isTop = variant === "top";
  const innerClass = isTop
    ? `flex h-full min-h-[5.25rem] w-full flex-col justify-between rounded-md border border-white/30 bg-black/20 px-0.5 py-px text-white ring-1 sm:min-h-[8.35rem] sm:rounded-lg sm:px-1 sm:py-0.5 ${ring}`
    : `flex min-h-0 w-full flex-1 flex-col justify-between rounded-md border border-white/25 bg-black/25 p-px text-white ring-1 sm:rounded-lg sm:p-0.5 ${ring}`;
  const cornerClass = isTop
    ? "flex items-start justify-between text-[10px] font-bold leading-none sm:text-base"
    : "flex items-start justify-between text-[9px] font-bold leading-none sm:text-[10px]";
  const mainClass = isTop
    ? "px-0.5 text-center text-2xl font-black leading-none sm:text-4xl"
    : "px-px text-center text-base font-black leading-none sm:text-xl";
  const subClass = isTop
    ? "text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-white/85 sm:text-sm"
    : "text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-white/85 sm:text-[9px]";

  return (
    <span className={innerClass}>
      <span className={cornerClass}>
        <span className="min-w-0 truncate">{p.label}</span>
        <span className="shrink-0">{p.wild ? "★" : "●"}</span>
      </span>
      <span className={mainClass}>{p.label}</span>
      {p.sub ? <span className={subClass}>{p.sub}</span> : null}
    </span>
  );
}

/** Top discard — outer sizing only; face matches hand via CcSharedCardFaceInner */
function CcTopDiscardCardFace({ card }) {
  if (card == null || typeof card !== "object") {
    return (
      <div className="relative z-[1] inline-flex min-h-[6.85rem] min-w-[5.15rem] items-center justify-center rounded-lg border border-white/15 bg-zinc-900/55 text-center font-mono text-sm font-semibold text-zinc-500 sm:min-h-[10.15rem] sm:min-w-[7.15rem] sm:rounded-xl sm:text-xl">
        —
      </div>
    );
  }
  const ci = Number(card?.c);
  const colorBg = Number.isInteger(ci) && ci >= 0 && ci <= 3 ? CC_COLOR_CARD_BG[ci] : null;
  const gradientClass = colorBg ? `bg-gradient-to-b ${colorBg}` : "bg-gradient-to-b from-fuchsia-500 to-indigo-700";
  return (
    <div
      className={`relative z-[1] inline-flex min-h-[6.85rem] min-w-[5.15rem] flex-col rounded-lg border border-white/35 px-0.5 py-px sm:min-h-[10.15rem] sm:min-w-[7.15rem] sm:rounded-xl sm:px-1 sm:py-0.5 ${gradientClass}`}
    >
      <CcSharedCardFaceInner card={card} variant="top" />
    </div>
  );
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
    vaultClaimError,
    retryVaultClaim,
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
  /** Emerald flash on successful play (after delayed hit anim) */
  const [handCardFlash, setHandCardFlash] = useState(/** @type {{ id: string, kind: "success" }|null} */ (null));
  /** 80ms-delayed press + bounce (avoids instant-UI feel) */
  const [handCardHitKey, setHandCardHitKey] = useState(/** @type {string|null} */ (null));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const roomHasActiveSession =
    room?.active_session_id != null && String(room.active_session_id).trim() !== "";
  const { matchSnapshotTimedOut } = useOv2MatchSnapshotWait(roomHasActiveSession, Boolean(snapshot));

  useEffect(() => {
    setFinishModalDismissedSessionId("");
    setWildForCard(null);
    setSurgeTwoTapMode(false);
    setSurgeArmCard(null);
    setHandCardFlash(null);
    setHandCardHitKey(null);
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
      if (!r.ok) setErr(humanizeOv2ColorClashError(r.code, r.error || "Rematch request failed"));
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
        setErr(humanizeOv2ColorClashError(r.code, r.error || "Could not start next match"));
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

  /** All seated players in seat order (includes you) — four seats in a 4-player match. */
  const playerStripSeats = useMemo(() => {
    return [...vm.activeSeats].sort((a, b) => a - b);
  }, [vm.activeSeats]);

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
  const handBoardActive = vm.phase === "playing" && vm.mySeat != null && vm.turnSeat === vm.mySeat;
  const goalStrip = "Play a matching color or symbol · Draw if needed · Wild lets you choose color";
  /** Draw/Surge/Pass/Cancel: floating column is always mounted so layout never jumps. */
  const topStripDrawSurgeContext =
    vm.phase === "playing" && vm.mySeat != null && handBoardActive && myTurnPlaying && !wildForCard;
  const drawActionEnabled =
    topStripDrawSurgeContext && !busy && !vaultClaimBusy && Number(vm.stockCount) > 0;
  const surgeActionEnabled =
    topStripDrawSurgeContext && !busy && !vaultClaimBusy && vm.surgeAvailableForMe === true;
  const passActionEnabled =
    vm.phase === "playing" &&
    vm.mySeat != null &&
    handBoardActive &&
    myTurnPostDraw &&
    !wildForCard &&
    !busy &&
    !vaultClaimBusy;
  const surgeCancelArmed = topStripDrawSurgeContext && surgeTwoTapMode && surgeArmCard != null;
  const surgeCancelEnabled = surgeCancelArmed && !busy && !vaultClaimBusy;
  const stockEmptyHint =
    topStripDrawSurgeContext && Number(vm.stockCount) <= 0;

  const wildLockForPlay = useMemo(() => {
    if (vm.wildLockAppliesToMe && vm.lockedColor != null) return vm.lockedColor;
    return null;
  }, [vm.wildLockAppliesToMe, vm.lockedColor]);

  const currentColorEff = useMemo(() => {
    if (vm.currentColor != null && Number.isInteger(vm.currentColor) && vm.currentColor >= 0 && vm.currentColor <= 3) {
      return vm.currentColor;
    }
    return 0;
  }, [vm.currentColor]);

  const cardPlayableHint = useCallback(
    card => {
      if (!vm.topDiscard || typeof vm.topDiscard !== "object") return false;
      if (busy || vaultClaimBusy) return false;
      if (myTurnPostDraw) return false;
      if (!myTurnPlaying) return false;
      if (surgeTwoTapMode && vm.surgeAvailableForMe) {
        if (surgeArmCard) {
          return ccSurgeSecondPlayable(
            card,
            surgeArmCard,
            vm.topDiscard,
            currentColorEff,
            wildLockForPlay
          );
        }
        return ccCardType(card) === "n" && ccIsPlayableOn(card, vm.topDiscard, currentColorEff, wildLockForPlay);
      }
      return ccIsPlayableOn(card, vm.topDiscard, currentColorEff, wildLockForPlay);
    },
    [
      vm.topDiscard,
      vm.surgeAvailableForMe,
      busy,
      vaultClaimBusy,
      myTurnPostDraw,
      myTurnPlaying,
      surgeTwoTapMode,
      surgeArmCard,
      currentColorEff,
      wildLockForPlay,
    ]
  );

  const turnGuidance = useMemo(() => {
    if (vm.phase === "finished") return "Round complete";
    if (vm.phase !== "playing") return "Waiting for round to start";
    if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return "";
    if (myTurnPostDraw) {
      return Array.isArray(vm.pendingDrawForYou) && vm.pendingDrawForYou.length > 1
        ? "You drew cards. Play one highlighted card or pass."
        : "You drew a card. Play it if it matches, or pass.";
    }
    if (wildForCard) return "Choose a color for your wild card";
    if (vm.wildLockAppliesToMe && vm.lockedColor != null) return `Locked to ${ccColorName(vm.lockedColor)} this turn`;
    return "";
  }, [vm, seatDisplayName, myTurnPostDraw, wildForCard]);

  const tryPlay = useCallback(
    async (card, colorOpt) => {
      const t = ccCardType(card);
      if (t === "w" || t === "f") {
        if (colorOpt == null || !Number.isInteger(colorOpt) || colorOpt < 0 || colorOpt > 3) {
          setWildForCard(/** @type {Record<string, unknown>} */ (card));
          return { ok: false };
        }
      }
      setWildForCard(null);
      setSurgeTwoTapMode(false);
      setSurgeArmCard(null);
      return await playCard(/** @type {Record<string, unknown>} */ (card), t === "w" || t === "f" ? colorOpt : null);
    },
    [playCard]
  );

  const onCardPress = useCallback(
    async card => {
      if (busy || vaultClaimBusy) return false;
      if (vm.phase !== "playing") return false;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return false;
      setErr("");
      if (myTurnPostDraw) {
        if (!vm.pendingDrawForYou || !ccCardInPendingDrawList(vm.pendingDrawForYou, card)) return false;
        const r = await tryPlay(card, null);
        return r?.ok === true;
      }
      if (myTurnPlaying) {
        if (surgeTwoTapMode && vm.surgeAvailableForMe) {
          if (surgeArmCard) {
            if (ccCardsEqual(card, surgeArmCard)) {
              setSurgeArmCard(null);
              return false;
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
              return r?.ok === true;
            }
            setErr("Surge: tap a second number that follows the first — or cancel.");
            return false;
          }
          const t = ccCardType(card);
          if (t === "n") {
            setSurgeArmCard(/** @type {Record<string, unknown>} */ (card));
            return false;
          }
          setSurgeTwoTapMode(false);
          const r = await tryPlay(card, null);
          return r?.ok === true;
        }
        const r2 = await tryPlay(card, null);
        return r2?.ok === true;
      }
      return false;
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

  const ccPlayingActionSlotInner =
    vm.phase === "playing" && vm.mySeat != null ? (
      handBoardActive ? (
        myTurnPlaying && wildForCard ? (
          <p className="flex min-h-[4.25rem] items-center text-center text-[10px] leading-snug text-sky-200/90">
            Tap a color below for your wild card (or Cancel there).
          </p>
        ) : null
      ) : null
    ) : null;

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-1 flex-col gap-0.5 overflow-hidden bg-zinc-950 px-1 pb-1 sm:gap-1 sm:px-2 sm:pb-1.5">
      {roomHasActiveSession && !snapshot ? (
        !matchSnapshotTimedOut ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center text-sm text-zinc-400">
            Loading match…
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2 text-center">
            <p className="text-sm text-zinc-400">Could not load match.</p>
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-zinc-900/70 px-3 py-2 text-[11px] font-medium text-zinc-200"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Retry
            </button>
          </div>
        )
      ) : (
      <>
      <div className="flex shrink-0 flex-col justify-center gap-1">
        <div className="flex min-h-[2.5rem] items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-950/25 px-2 py-1 text-center text-[10px] font-medium leading-snug text-cyan-100/90 sm:min-h-[2.75rem] sm:py-1.5">
          {goalStrip}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className={`${OV2_DUEL_HUD_BAR} !py-1 sm:!py-1.5`}>
            <div className="flex min-h-[2.25rem] flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-zinc-400 sm:min-h-[2.35rem] sm:text-[11px]">
              <div className="flex flex-1 flex-wrap gap-1.5 sm:gap-2">
                <span className={OV2_DUEL_CHIP_METRIC}>
                  Stock {vm.stockCount} · Pile {vm.discardCount}
                </span>
                <span className="rounded border border-amber-500/25 px-2 py-0.5 text-amber-100/90 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.08)]" title="Clash stack">
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
                  <span className={`${OV2_DUEL_CHIP_METRIC} text-zinc-200`}>
                    Match color: {ccColorName(vm.currentColor)}
                  </span>
                ) : null}
              </div>
              {vaultClaimBusy ? (
                <span className={OV2_DUEL_SETTLEMENT_BADGE}>
                  Settlement…
                </span>
              ) : null}
              {vaultClaimError && !vaultClaimBusy ? (
                <span className="max-w-[14rem] text-right text-[9px] text-red-300">
                  {vaultClaimError}{" "}
                  <button type="button" className="underline" onClick={() => void retryVaultClaim()}>
                    Retry
                  </button>
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-row flex-nowrap gap-1 sm:gap-1.5">
            {playerStripSeats.map(seat => {
              const isMe = vm.mySeat != null && seat === vm.mySeat;
              const cardCount = isMe
                ? vm.myHand.length
                : Math.max(
                    0,
                    Math.floor(Number(vm.handCounts[String(seat)] ?? vm.handCounts[seat] ?? 0) || 0)
                  );
              const missed = vm.missedStreakBySeat[seat] ?? 0;
              const out = isEliminated(seat);
              const isTurn = vm.turnSeat === seat;
              return (
                <div
                  key={`seat-strip-${seat}`}
                  title={`${seatDisplayName(seat)} — ${cardCount} cards · missed ${missed}/3`}
                  className={`${OV2_OPP_PANEL_BASE} ${
                    isTurn ? OV2_OPP_PANEL_ACTIVE : OV2_OPP_PANEL_IDLE
                  } ${isMe ? "!opacity-100" : ""} flex min-h-[3.1rem] min-w-0 flex-1 basis-0 flex-col justify-center gap-y-0.5 px-1.5 py-1 sm:min-h-[3.4rem] sm:px-2 sm:py-1.5`}
                >
                  <div className="min-w-0 truncate text-[9px] font-semibold leading-tight sm:text-[10px]">
                    {seatDisplayName(seat)}
                  </div>
                  <div className="flex min-w-0 flex-row flex-nowrap items-center gap-x-1">
                    {isMe ? (
                      <span className="shrink-0 rounded border border-emerald-400/35 bg-emerald-500/12 px-0.5 py-0.5 text-[6px] font-bold uppercase leading-none text-emerald-100 sm:py-0.5 sm:text-[7px]">
                        You
                      </span>
                    ) : null}
                    {isTurn ? (
                      <span className="shrink-0 rounded border border-amber-400/40 bg-amber-500/15 px-0.5 py-0.5 text-[6px] font-bold uppercase leading-none text-amber-100 sm:py-0.5 sm:text-[7px]">
                        Turn
                      </span>
                    ) : null}
                    <span
                      className={`shrink-0 whitespace-nowrap text-[8px] leading-none tabular-nums sm:text-[9px] ${
                        isTurn ? "text-amber-100/78" : "text-zinc-400"
                      }`}
                    >
                      C{cardCount}
                      <span className={isTurn ? "text-amber-200/45" : "text-zinc-600"}>·</span>
                      M{missed}/3
                      {out ? <span className="font-semibold text-rose-300/90">·Out</span> : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-hidden sm:gap-0.5">
        <div className={`${OV2_DUEL_ACTION_GROUP} flex min-h-0 flex-1 flex-col`}>
          <div className={`${OV2_DUEL_PANEL_TOP} relative flex min-h-0 flex-1 flex-col p-2 sm:p-3`}>
            <div className="relative z-10 mb-1 shrink-0 pr-[5.35rem] sm:pr-[6.85rem]">
              <p className={`text-left text-[10px] leading-tight sm:text-center ${OV2_DUEL_PANEL_LABEL}`}>
                Top discard (match this card)
              </p>
            </div>
            {/* err / turn / stock hints — floated left so the card area keeps full height */}
            {err || turnGuidance || stockEmptyHint ? (
              <div className="pointer-events-none absolute bottom-2 left-2 z-30 max-w-[7.35rem] sm:bottom-3 sm:left-3 sm:max-w-[7.85rem]">
                {err ? (
                  <button
                    type="button"
                    className="pointer-events-auto w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left text-[10px] font-medium leading-normal text-rose-200/95 sm:text-[11px]"
                    title="Tap to clear"
                    onClick={() => setErr("")}
                  >
                    <span className="line-clamp-8">{err}</span>
                  </button>
                ) : turnGuidance ? (
                  <p className="m-0 text-left text-[10px] font-medium leading-normal text-zinc-100/92 sm:text-[11px]">
                    <span className="line-clamp-8">{turnGuidance}</span>
                  </p>
                ) : stockEmptyHint ? (
                  <p className="m-0 text-left text-[10px] font-medium leading-normal text-amber-200/90 sm:text-[11px]">
                    <span className="line-clamp-8">Stock empty — play from hand; timer advances if nothing matches.</span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {/* Timer + draw/surge: out of document flow so the discard card stays vertically centered */}
            <div className="pointer-events-auto absolute right-2 top-2 z-20 flex w-[5.15rem] flex-col items-stretch gap-0.5 sm:right-3 sm:top-3 sm:w-[6.55rem] sm:gap-1">
              <div
                className={`w-full justify-center rounded-md border !px-1 !py-0.5 text-center text-[9px] tabular-nums sm:!px-2 sm:!py-1 sm:text-[12px] !animate-none !transition-none duration-0 will-change-auto ${
                  vm.phase === "playing" && vm.turnSeat === vm.mySeat ? OV2_DUEL_TIMER_ACTIVE : OV2_DUEL_TIMER_IDLE
                }`}
              >
                {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                  <span className="inline-flex flex-col items-center leading-tight">
                    <span className="font-medium uppercase text-zinc-500">Timer</span>
                    <span className="font-semibold text-zinc-100">~{vm.turnTimeLeftSec}s</span>
                  </span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
              <button
                type="button"
                disabled={!drawActionEnabled}
                title={
                  !topStripDrawSurgeContext
                    ? "Available on your turn (play phase)"
                    : Number(vm.stockCount) <= 0
                      ? "Stock is empty — play from your hand"
                      : `Draw from stock (${vm.stockCount ?? 0} left)`
                }
                className={`${OV2_BTN_PRIMARY} w-full justify-center !px-1 !py-1 !text-[9px] shadow-lg sm:!px-1.5 sm:!py-1.5 sm:!text-xs`}
                onClick={() => {
                  if (!drawActionEnabled) return;
                  setSurgeTwoTapMode(false);
                  setSurgeArmCard(null);
                  void drawCard();
                }}
              >
                Draw{vm.stockCount != null && vm.stockCount > 0 ? ` (${vm.stockCount})` : ""}
              </button>
              <button
                type="button"
                disabled={!surgeActionEnabled}
                title={
                  !topStripDrawSurgeContext
                    ? "Available on your turn"
                    : !vm.surgeAvailableForMe
                      ? "Surge not available"
                      : surgeTwoTapMode
                        ? "Surge on — tap two numbers in order"
                        : "Turn Surge on (two number cards)"
                }
                className={`${
                  surgeTwoTapMode && topStripDrawSurgeContext && vm.surgeAvailableForMe ? OV2_BTN_ACCENT : OV2_BTN_SECONDARY
                } w-full justify-center !px-1 !py-1 !text-[9px] shadow-lg sm:!px-1.5 sm:!py-1.5 sm:!text-xs`}
                onClick={() => {
                  if (!surgeActionEnabled) return;
                  setErr("");
                  setSurgeArmCard(null);
                  setSurgeTwoTapMode(s => !s);
                }}
              >
                Surge {surgeTwoTapMode ? "on" : "off"}
              </button>
              <button
                type="button"
                disabled={!passActionEnabled}
                title={
                  passActionEnabled
                    ? "Pass after drawing if you cannot play a drawn card"
                    : myTurnPostDraw
                      ? "Pass the turn"
                      : "Available after you draw — play a drawn card or pass"
                }
                className={`${OV2_BTN_SECONDARY} w-full justify-center !px-1 !py-1 !text-[9px] shadow-lg sm:!px-1.5 sm:!py-1.5 sm:!text-xs`}
                onClick={() => {
                  if (!passActionEnabled) return;
                  void passAfterDraw();
                }}
              >
                Pass turn
              </button>
              <button
                type="button"
                disabled={!surgeCancelEnabled}
                title="Clear first Surge tap"
                className={`${OV2_BTN_SECONDARY} min-h-[1.5rem] w-full justify-center !px-1 !py-1 !text-[9px] shadow-lg sm:min-h-[2rem] sm:!px-1.5 sm:!py-1.5 sm:!text-xs ${
                  surgeCancelArmed ? "" : "pointer-events-none invisible"
                }`}
                onClick={() => {
                  if (!surgeCancelEnabled) return;
                  setSurgeArmCard(null);
                }}
              >
                ×1st
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
              <CcTopDiscardCardFace card={vm.topDiscard && typeof vm.topDiscard === "object" ? vm.topDiscard : null} />
            </div>
          </div>
        </div>

        {vm.phase === "playing" && vm.mySeat != null && ccPlayingActionSlotInner ? (
          <div className="flex min-h-0 shrink-0 flex-col gap-1 px-0.5">
            {ccPlayingActionSlotInner}
          </div>
        ) : null}

        {wildForCard ? (
          <div className="shrink-0 rounded-lg border border-sky-400/35 bg-gradient-to-b from-sky-950/45 to-indigo-950/40 p-2 shadow-[0_8px_24px_rgba(14,116,144,0.22)] sm:rounded-xl sm:p-2.5">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200/90 sm:text-xs">Wild color choice</p>
            <p className="mt-0.5 text-center text-[10px] text-sky-100/90 sm:text-[11px]">Choose a color for this wild card.</p>
            <div className="mt-1.5 grid grid-cols-4 gap-1 sm:mt-2 sm:gap-2">
              {[0, 1, 2, 3].map(ci => (
                <button
                  key={ci}
                  type="button"
                  disabled={busy}
                  className={`rounded-md border px-1 py-1.5 text-[9px] font-semibold text-white transition-[transform,opacity,filter,box-shadow] duration-150 ease-out enabled:hover:-translate-y-px enabled:hover:brightness-110 active:scale-[0.97] active:shadow-none disabled:pointer-events-none disabled:opacity-40 sm:rounded-lg sm:px-2 sm:py-2 sm:text-[10px] ${COLOR_SWATCH[ci]}`}
                  onClick={() => void onPickWildColor(ci)}
                >
                  {ccColorName(ci)}
                </button>
              ))}
            </div>
            <button type="button" className="mt-1.5 w-full text-[10px] text-zinc-500 underline sm:mt-2" onClick={() => setWildForCard(null)}>
              Cancel
            </button>
          </div>
        ) : null}

        <div
          className={`${OV2_DUEL_PANEL_HAND} ${handBoardActive ? OV2_DUEL_PANEL_HAND_ACTIVE : ""} flex min-h-[10.4rem] flex-1 flex-col overflow-hidden p-1.5 sm:min-h-[14.4rem] sm:p-2 md:p-3`}
        >
          <p className={`mb-0.5 shrink-0 text-center text-[10px] ${OV2_DUEL_PANEL_LABEL}`}>Your hand</p>
          <div className="flex min-h-0 flex-1 flex-wrap content-center justify-center gap-1 overflow-x-hidden overflow-y-auto overscroll-y-contain sm:gap-2">
            {vm.myHand.map((card, idx) => {
              const key = `${idx}-${ccStableCardKey(card)}`;
              const showingHit = handCardHitKey === key;
              const highlightPostDraw =
                myTurnPostDraw && vm.pendingDrawForYou && ccCardInPendingDrawList(vm.pendingDrawForYou, card);
              const surgeHighlight =
                !showingHit &&
                surgeTwoTapMode &&
                surgeArmCard &&
                myTurnPlaying &&
                ccCardsEqual(card, surgeArmCard) &&
                ccCardType(card) === "n";
              const highlightPostDrawEff = !showingHit && highlightPostDraw;
              const canTry =
                vm.phase === "playing" &&
                vm.mySeat != null &&
                vm.turnSeat === vm.mySeat &&
                !busy &&
                !vaultClaimBusy &&
                (myTurnPlaying || highlightPostDraw);
              const playableLegalHint = cardPlayableHint(card);
              const showPlayableRing =
                playableLegalHint &&
                canTry &&
                !showingHit &&
                handCardFlash?.id !== key &&
                !surgeHighlight &&
                !highlightPostDrawEff;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canTry}
                  onClick={() => {
                    void (async () => {
                      if (!canTry) return;
                      const playPromise = onCardPress(card);
                      await new Promise(r => setTimeout(r, OV2_DUEL_HAND_HIT_DELAY_MS));
                      playOv2DuelCardTap();
                      setHandCardHitKey(key);
                      window.setTimeout(() => setHandCardHitKey(k => (k === key ? null : k)), OV2_DUEL_HAND_HIT_CLEAR_MS);
                      const ok = await playPromise;
                      if (ok) {
                        playOv2DuelSuccess();
                        setHandCardFlash({ id: key, kind: "success" });
                        window.setTimeout(() => {
                          setHandCardFlash(f => (f?.id === key ? null : f));
                        }, 90);
                      } else {
                        playOv2DuelInvalid();
                      }
                    })();
                  }}
                  className={`${OV2_DUEL_HAND_PILL_BASE} inline-flex min-h-[3.6rem] min-w-[2.55rem] flex-col items-stretch rounded-lg border border-white/35 !p-0.5 text-[10px] sm:min-h-[5.35rem] sm:min-w-[3.5rem] sm:rounded-xl sm:!px-1 sm:!py-0.5 sm:text-[11px] !animate-none !transition-none duration-0 will-change-auto enabled:hover:!translate-y-0 enabled:hover:!scale-100 enabled:hover:!brightness-100 enabled:hover:!shadow-none enabled:hover:!bg-top active:!scale-100 active:!brightness-100 ${
                    (() => {
                      const ci = Number(card?.c);
                      const colorBg = Number.isInteger(ci) && ci >= 0 && ci <= 3 ? CC_COLOR_CARD_BG[ci] : null;
                      return colorBg ? `bg-gradient-to-b ${colorBg}` : "bg-gradient-to-b from-fuchsia-500 to-indigo-700";
                    })()
                  } ${showingHit ? "ring-2 ring-white/35" : ""} ${
                    handCardFlash?.id === key ? "ring-2 ring-emerald-400/55" : ""
                  } ${
                    surgeHighlight
                      ? "scale-100 border-emerald-400/65 bg-emerald-950/40 text-emerald-50 ring-2 ring-emerald-400/45"
                      : highlightPostDrawEff
                        ? "scale-100 border-violet-400/65 bg-violet-950/40 text-violet-50 ring-2 ring-violet-400/45"
                        : canTry
                          ? OV2_DUEL_HAND_PILL_ENABLED
                          : OV2_DUEL_HAND_PILL_DISABLED
                  } ${showPlayableRing ? "ring-2 ring-cyan-400/55" : ""}`}
                >
                  <CcSharedCardFaceInner card={card} variant="hand" />
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
    <p className="mt-1 text-center text-[10px] leading-snug text-zinc-500">
      {isDraw ? "No winner this round, stakes were settled as draw." : "Winner emptied hand and completed legal turn flow."}
    </p>
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
            <button type="button" className={OV2_BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
              {rematchBusy ? "Requesting…" : "Request rematch"}
            </button>
            <button type="button" className={OV2_BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
              Cancel rematch
            </button>
            {isHost ? (
              <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
                <button
                  type="button"
                  className={OV2_BTN_PRIMARY + " w-full rounded-none"}
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
            <button type="button" className={OV2_BTN_SECONDARY} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              className={OV2_BTN_DANGER + " w-full"}
              disabled={exitBusy || !pk}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}

      <div className="mt-1 flex shrink-0 flex-col gap-1 border-t border-white/[0.12] pt-1 text-[9px] text-zinc-400 sm:text-[10px]">
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            className={`${OV2_BTN_ACCENT} pointer-events-none flex-1 cursor-default select-none py-2 text-[11px]`}
          >
            Increase table stake
          </button>
          <button
            type="button"
            disabled={exitBusy || !pk}
            className={`${OV2_BTN_DANGER} flex-1 py-2 text-[11px] disabled:opacity-45`}
            onClick={() => void onExitToLobby()}
          >
            {exitBusy ? "Leaving…" : "Leave table"}
          </button>
        </div>
        {exitErr ? <span className="text-red-300">{exitErr}</span> : null}
      </div>
      </>
      )}
    </div>
  );
}
