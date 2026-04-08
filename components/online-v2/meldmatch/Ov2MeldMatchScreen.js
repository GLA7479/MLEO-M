"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { mmFormatCard, mmSuggestFinishFromHand11 } from "../../../lib/online-v2/meldmatch/ov2MeldMatchCards";
import { useOv2MeldMatchSession } from "../../../hooks/useOv2MeldMatchSession";
import {
  OV2_DUEL_HAND_HIT_CLEAR_MS,
  OV2_DUEL_HAND_HIT_DELAY_MS,
  playOv2DuelCardTap,
  playOv2DuelInvalid,
  playOv2DuelSuccess,
} from "../../../lib/online-v2/ov2DuelPairUiSounds";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import Ov2SharedStakeDoubleModal from "../Ov2SharedStakeDoubleModal";
import {
  OV2_BTN_ACCENT,
  OV2_BTN_DANGER,
  OV2_BTN_PRIMARY,
  OV2_BTN_SECONDARY,
  OV2_CALLOUT_VIOLET,
  OV2_DUEL_CHIP_METRIC,
  OV2_DUEL_HAND_PILL_BASE,
  OV2_DUEL_HAND_PILL_DISABLED,
  OV2_DUEL_HAND_PILL_ENABLED,
  OV2_DUEL_HAND_HIT,
  OV2_DUEL_HUD_BAR,
  OV2_DUEL_ACTION_STRIP,
  OV2_DUEL_LAYOFF_MELD_BTN_BASE,
  OV2_DUEL_LAYOFF_MELD_IDLE,
  OV2_DUEL_LAYOFF_MELD_SELECTED,
  OV2_DUEL_PANEL_HAND,
  OV2_DUEL_PANEL_HAND_ACTIVE,
  OV2_DUEL_PANEL_LABEL,
  OV2_DUEL_PANEL_TOP,
  OV2_DUEL_TOP_CARD_AURA,
  OV2_DUEL_TOP_CARD_FACE,
  OV2_DUEL_SETTLEMENT_BADGE,
  OV2_DUEL_TIMER_ACTIVE,
  OV2_DUEL_TIMER_IDLE,
  OV2_REVEALED_HAND_PANEL,
} from "../tokens/ov2DuelPairUiTokens";

const finishDismissStorageKey = sid => `ov2_mm_finish_dismiss_${sid}`;
const MM_SUIT_SYMBOL = ["♠", "♥", "♦", "♣"];
const MM_SUIT_TEXT = ["Spades", "Hearts", "Diamonds", "Clubs"];
const MM_RANK_TEXT = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function mmCardUi(cardId) {
  const n = Math.floor(Number(cardId));
  if (!Number.isFinite(n) || n < 0 || n > 51) return { rank: "?", suit: "?", suitName: "Unknown", red: false };
  const rank = n % 13;
  const suit = Math.floor(n / 13);
  const sym = MM_SUIT_SYMBOL[suit] ?? "?";
  return {
    rank: MM_RANK_TEXT[rank] ?? "?",
    suit: sym,
    suitName: MM_SUIT_TEXT[suit] ?? "Unknown",
    red: suit === 1 || suit === 2,
  };
}

/**
 * @param {{ cardId: number|null|undefined, large?: boolean }} props
 */
function MmCardFace({ cardId, large = false }) {
  if (cardId == null) {
    return (
      <div className="flex h-full w-full items-center justify-center text-zinc-500">
        —
      </div>
    );
  }
  const ui = mmCardUi(cardId);
  return (
    <div
      className={`flex h-full w-full flex-col rounded-[1rem] border border-zinc-400/70 bg-[linear-gradient(165deg,#ffffff_0%,#f7f3ea_52%,#ece7dc_100%)] px-2 py-1 text-zinc-900 shadow-[0_12px_24px_rgba(0,0,0,0.35)] ${large ? "min-h-[6.4rem] min-w-[4.4rem] sm:min-h-[7.8rem] sm:min-w-[5.2rem]" : ""}`}
      title={`${ui.rank} of ${ui.suitName}`}
    >
      <span className={`flex w-full items-start justify-between text-[clamp(11px,2.8vw,14px)] font-bold ${ui.red ? "text-rose-600" : "text-zinc-900"}`}>
        <span>{ui.rank}</span>
        <span className="opacity-80">{ui.suit}</span>
      </span>
      <span className={`mt-1.5 block text-center text-[clamp(21px,5.5vw,34px)] leading-none ${ui.red ? "text-rose-600" : "text-zinc-900"}`}>
        {ui.suit}
      </span>
      <span className={`mt-auto text-left text-[11px] font-semibold ${ui.red ? "text-rose-500" : "text-zinc-700"}`}>{ui.rank}</span>
    </div>
  );
}

/** @param {unknown} raw */
function normalizeLayoffMelds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(m => {
      if (!Array.isArray(m)) return [];
      return m.map(x => Math.floor(Number(x))).filter(n => Number.isFinite(n) && n >= 0 && n <= 51);
    })
    .filter(m => m.length >= 3);
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2MeldMatchScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2MeldMatchSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    draw,
    discard,
    declareFinish,
    resolveLayoff,
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
  const [finishPanelOpen, setFinishPanelOpen] = useState(false);
  const [layoffAssignments, setLayoffAssignments] = useState(/** @type {{ meld_index: number, card_id: number }[]} */ ([]));
  const [layoffMeldPick, setLayoffMeldPick] = useState(0);
  /** Delayed press + bounce on hand tile (discard / layoff) */
  const [handCardHitKey, setHandCardHitKey] = useState(/** @type {string|null} */ (null));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  const layoffMeldsNorm = useMemo(() => normalizeLayoffMelds(vm.layoffMelds), [vm.layoffMelds]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
    setFinishPanelOpen(false);
    setHandCardHitKey(null);
  }, [vm.sessionId]);

  useEffect(() => {
    if (vm.phase !== "layoff") setLayoffAssignments([]);
  }, [vm.phase]);

  const finishSuggestion = useMemo(() => {
    if (vm.myHand.length !== 11) return null;
    return mmSuggestFinishFromHand11(vm.myHand);
  }, [vm.myHand]);

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

  const onCardDiscard = useCallback(
    async cardId => {
      if (vm.phase !== "playing" || vm.turnPhase !== "discard" || busy || vaultClaimBusy) return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      if (vm.mustRespondDouble) return;
      setErr("");
      await discard(cardId);
    },
    [vm, busy, vaultClaimBusy, discard, setErr]
  );

  const onSubmitFinish = useCallback(async () => {
    if (!finishSuggestion) return;
    setErr("");
    const { kind, melds, deadwood, discard: dCard } = finishSuggestion;
    const r = await declareFinish({
      kind,
      melds,
      deadwood,
      discardCard: dCard,
    });
    if (r.ok) setFinishPanelOpen(false);
  }, [finishSuggestion, declareFinish, setErr]);

  const onLayoffAddCard = useCallback(
    cardId => {
      if (vm.phase !== "layoff" || busy) return;
      if (layoffMeldsNorm.length === 0) return;
      const mi = Math.max(0, Math.min(layoffMeldsNorm.length - 1, layoffMeldPick));
      setLayoffAssignments(prev => [...prev, { meld_index: mi, card_id: cardId }]);
    },
    [vm.phase, busy, layoffMeldsNorm.length, layoffMeldPick]
  );

  const onLayoffSubmit = useCallback(async () => {
    setErr("");
    await resolveLayoff(layoffAssignments);
  }, [layoffAssignments, resolveLayoff, setErr]);

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
  const didIWin = !isDraw && vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.winnerSeat) + 1}`;
  }, [members, vm.winnerSeat]);
  const opponentDisplayName = useMemo(() => {
    if (vm.mySeat == null) return "Opponent";
    const oppSeat = vm.mySeat === 0 ? 1 : 0;
    const m = members.find(x => Number(x?.seat_index) === oppSeat);
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${oppSeat + 1}`;
  }, [members, vm.mySeat]);

  const finishMultiplier = vm.stakeMultiplier ?? 1;

  const finishOutcome = useMemo(() => {
    if (!finished) return "unknown";
    if (isDraw) return "draw";
    if (didIWin) return "win";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "loss";
    return "unknown";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishTitle = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Draw";
    if (didIWin) return "Victory";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "Defeat";
    return "Match finished";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishReasonLine = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Draw — entries returned";
    const res = vm.result && typeof vm.result === "object" ? vm.result : null;
    const knock = res?.knockFinish
      ? `Deadwood ${String(res.closerDeadwood ?? "—")} vs ${String(res.opponentDeadwoodAfterLayoff ?? "—")} after layoffs`
      : "";
    const win = winnerDisplayName ? `Winner: ${winnerDisplayName}` : "Round complete";
    return knock ? `${knock} · ${win}` : win;
  }, [finished, isDraw, vm.result, winnerDisplayName]);

  const finishAmountLine = useMemo(() => {
    if (!finished) return { text: "—", className: "text-zinc-500" };
    if (vaultClaimBusy) return { text: "…", className: "text-zinc-400" };
    const res = vm.result && typeof vm.result === "object" ? /** @type {Record<string, unknown>} */ (vm.result) : null;
    const prizeRaw = res?.prize != null ? Number(res.prize) : NaN;
    const lossRaw = res?.lossPerSeat != null ? Number(res.lossPerSeat) : NaN;
    const baseStake =
      room?.stake_per_seat != null && Number.isFinite(Number(room.stake_per_seat)) ? Number(room.stake_per_seat) : null;
    const mult = vm.stakeMultiplier ?? 1;
    const lossFb = baseStake != null ? Math.floor(baseStake * mult) : null;
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
  }, [finished, vaultClaimBusy, vm.result, vm.stakeMultiplier, isDraw, didIWin, vm.mySeat, vm.winnerSeat, room?.stake_per_seat]);

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

  const myColorLabel = vm.mySeat === 0 ? "Rose" : vm.mySeat === 1 ? "Amber" : "—";
  const oppColorLabel = vm.mySeat === 0 ? "Amber" : vm.mySeat === 1 ? "Rose" : "—";

  const canInteractHand =
    vm.phase === "playing" &&
    vm.mySeat === vm.turnSeat &&
    vm.turnPhase === "discard" &&
    !vm.mustRespondDouble &&
    !busy &&
    !vaultClaimBusy;
  const handBoardActive =
    (vm.phase === "playing" && vm.mySeat != null && vm.turnSeat === vm.mySeat) ||
    (vm.phase === "layoff" && vm.mySeat != null && vm.turnSeat === vm.mySeat);
  const myTurn = vm.mySeat != null && vm.turnSeat === vm.mySeat;
  const goalStrip = "Make sets or runs · Draw one card, discard one card · Finish when ready";
  const turnGuidance = useMemo(() => {
    if (vm.phase === "finished") return "Round complete";
    if (vm.mustRespondDouble) return "Opponent asked to increase table stake. Accept or decline.";
    if (vm.phase === "layoff") {
      return myTurn ? "Add cards to the revealed melds, then confirm scoring." : "Waiting for opponent to finish layoffs.";
    }
    if (vm.phase !== "playing") return "Waiting for round to start";
    if (!myTurn) return "Waiting for opponent";
    if (vm.turnPhase === "draw") return "Draw from stock or discard.";
    if (vm.turnPhase === "discard") {
      if (vm.myHand.length === 11 && finishSuggestion) return "Your hand is ready. Finish now or discard one card.";
      return "Choose one card to discard.";
    }
    return "Your turn";
  }, [vm, myTurn, finishSuggestion]);
  const finishReasonReadable = useMemo(() => {
    const res = vm.result && typeof vm.result === "object" ? vm.result : null;
    if (!res) return "";
    if (res.knockFinish) {
      return `Knock finish: deadwood ${String(res.closerDeadwood ?? "—")} vs ${String(res.opponentDeadwoodAfterLayoff ?? "—")} after layoffs.`;
    }
    return "Perfect finish closed the hand with no deadwood.";
  }, [vm.result]);
  const drawPhaseMyTurn = vm.phase === "playing" && myTurn && vm.turnPhase === "draw" && !vm.mustRespondDouble;
  const discardPhaseMyTurn = vm.phase === "playing" && myTurn && vm.turnPhase === "discard" && !vm.mustRespondDouble;
  const finishMapByCard = useMemo(() => {
    /** @type {Record<number, { kind: "meld"|"deadwood", group: number }>} */
    const out = {};
    if (!finishSuggestion) return out;
    finishSuggestion.melds.forEach((group, i) => {
      group.forEach(c => {
        out[c] = { kind: "meld", group: i + 1 };
      });
    });
    finishSuggestion.deadwood.forEach(c => {
      if (!out[c]) out[c] = { kind: "deadwood", group: 0 };
    });
    return out;
  }, [finishSuggestion]);
  const topCardPulse = drawPhaseMyTurn || discardPhaseMyTurn;
  const compactActionLine =
    vm.phase === "playing" && vm.turnPhase === "draw"
      ? "Draw from stock or top discard"
      : vm.phase === "playing" && vm.turnPhase === "discard"
        ? "Choose a discard"
        : vm.phase === "layoff"
          ? "Layoff phase"
          : "Round state";
  const canOfferDoubleNow =
    vm.phase === "playing" &&
    vm.mySeat === vm.turnSeat &&
    vm.mustRespondDouble !== true &&
    vm.canOfferDouble === true &&
    !busy &&
    !vaultClaimBusy;
  const myMissedTurns = vm.mySeat != null ? vm.missedStreakBySeat[vm.mySeat] ?? 0 : 0;
  const opponentMissedTurns = vm.mySeat === 0 ? vm.missedStreakBySeat[1] ?? 0 : vm.mySeat === 1 ? vm.missedStreakBySeat[0] ?? 0 : 0;
  return (
    <div className="relative flex h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_52%,rgba(45,212,191,0.23),rgba(15,23,42,0.34)_42%,rgba(6,11,22,0.95)_76%),radial-gradient(circle_at_50%_20%,rgba(125,211,252,0.13),transparent_40%),linear-gradient(180deg,#162235_0%,#0c1626_55%,#070f1e_100%)] px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-[max(4px,env(safe-area-inset-top))] sm:h-full sm:px-2 sm:pb-2 sm:pt-2">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_38%),radial-gradient(circle_at_50%_50%,transparent_58%,rgba(3,7,16,0.55)_100%)]" />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/12 bg-zinc-900/45 px-2 py-1.5 text-[10px] text-zinc-300">
          <div
            className={
              (vm.phase === "playing" || vm.phase === "layoff") &&
              (vm.turnSeat === vm.mySeat || (vm.mustRespondDouble && Number(vm.pendingDouble?.responder_seat) === vm.mySeat))
                ? OV2_DUEL_TIMER_ACTIVE
                : OV2_DUEL_TIMER_IDLE
            }
          >
            {(vm.phase === "playing" || vm.phase === "layoff") && vm.turnTimeLeftSec != null ? (
              <span className="font-semibold text-zinc-100">~{vm.turnTimeLeftSec}s</span>
            ) : (
              <span>—</span>
            )}
          </div>
          <p className="truncate text-center text-[10px] font-medium text-zinc-100">{compactActionLine}</p>
          <div className="flex items-center gap-1 text-[9px] text-zinc-400">
            <span>Stock {vm.stockCount}</span>
            <span>·</span>
            <span>Discard {vm.discardCount}</span>
          </div>
          {vaultClaimBusy ? <span className={OV2_DUEL_SETTLEMENT_BADGE}>Settlement…</span> : null}
        </div>

        <div className="shrink-0 rounded-xl border border-cyan-300/30 bg-cyan-900/20 px-2 py-1 text-center text-[10px] font-medium text-cyan-100/90">
          {goalStrip}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2">
          <div
            className={`rounded-2xl border px-2.5 py-1.5 backdrop-blur-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_20px_rgba(0,0,0,0.28)] ${
              !myTurn && (vm.phase === "playing" || vm.phase === "layoff")
                ? "border-amber-200/45 bg-gradient-to-b from-amber-200/18 to-amber-900/18 ring-1 ring-amber-200/30"
                : "border-white/12 bg-gradient-to-b from-slate-200/12 to-slate-900/20"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300/90">Opponent</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-50">{opponentDisplayName} · {vm.opponentHandCount ?? "—"} cards</p>
            <p className="mt-1 text-[10px] text-slate-200/85">{!myTurn && (vm.phase === "playing" || vm.phase === "layoff") ? "Active" : "Waiting"}</p>
            <p className="mt-0.5 text-[10px] text-slate-300/70">Hand {vm.opponentHandCount ?? "—"} · Missed {opponentMissedTurns} · {oppColorLabel}</p>
          </div>
          <div
            className={`rounded-2xl border px-2.5 py-1.5 backdrop-blur-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_20px_rgba(0,0,0,0.28)] ${
              myTurn && (vm.phase === "playing" || vm.phase === "layoff")
                ? "border-emerald-200/45 bg-gradient-to-b from-emerald-200/20 to-emerald-900/16 ring-1 ring-emerald-200/30"
                : "border-white/12 bg-gradient-to-b from-slate-200/12 to-slate-900/20"
            }`}
          >
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300/90">You</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-50">Seat {vm.mySeat != null ? vm.mySeat + 1 : "—"}</p>
            <p className="mt-1 text-[10px] text-slate-100">{myTurn ? "Active" : "Waiting"}</p>
            <p className="mt-0.5 text-[10px] text-slate-300/70">{myColorLabel} · Missed {myMissedTurns} · Table ×{vm.stakeMultiplier}</p>
          </div>
        </div>

        {err ? (
          <div className="shrink-0 rounded-md border border-red-500/25 bg-red-950/30 px-2 py-1 text-[11px] text-red-200">
            <span>{err}</span>{" "}
            <button type="button" className="text-red-300 underline" onClick={() => setErr("")}>
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_50%_44%,rgba(45,212,191,0.28),rgba(8,17,33,0.18)_36%,rgba(4,10,20,0.78)_82%),linear-gradient(180deg,rgba(19,34,56,0.5)_0%,rgba(6,12,24,0.82)_100%)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-16px_60px_rgba(0,0,0,0.28),0_24px_40px_rgba(0,0,0,0.35)] sm:p-3">
          <div className="flex h-full flex-col justify-between gap-2">
            <div className="rounded-2xl bg-zinc-900/18 p-2">
              <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">Top discard</p>
              <div className="mt-2 flex items-center justify-center gap-2 sm:gap-4">
                <button
                  type="button"
                  disabled={!drawPhaseMyTurn || busy || vm.stockCount <= 0}
                  onClick={() => void draw("stock")}
                  className="inline-flex h-[5.4rem] w-[3.6rem] flex-col items-center justify-center rounded-2xl border border-slate-200/25 bg-gradient-to-b from-slate-700/95 to-slate-900 text-[10px] font-semibold text-slate-100 shadow-[0_10px_18px_rgba(0,0,0,0.4)] transition enabled:hover:-translate-y-1 enabled:hover:brightness-110 disabled:opacity-45 sm:h-[6.6rem] sm:w-[4.4rem]"
                >
                  <span>Stock</span>
                  <span className="mt-1 text-[11px] text-zinc-200">{vm.stockCount}</span>
                </button>
                <button
                  type="button"
                  disabled={!drawPhaseMyTurn || busy || vm.discardTop == null}
                  onClick={() => void draw("discard")}
                  className={`${OV2_DUEL_TOP_CARD_AURA} inline-flex rounded-2xl transition enabled:hover:-translate-y-1 disabled:opacity-45`}
                >
                  <div className={`${OV2_DUEL_TOP_CARD_FACE} rounded-[1.05rem] border border-zinc-300/50 bg-transparent p-0 font-semibold text-zinc-900 [text-shadow:none] ${topCardPulse ? "ring-2 ring-emerald-300/55 shadow-[0_0_34px_rgba(45,212,191,0.45),0_12px_22px_rgba(0,0,0,0.38)]" : "shadow-[0_12px_22px_rgba(0,0,0,0.38)]"}`}>
                    <MmCardFace cardId={vm.discardTop ?? null} large />
                  </div>
                </button>
              </div>
              {drawPhaseMyTurn ? <p className="mt-2 text-center text-[11px] font-medium text-emerald-100">Tap stock or discard to draw</p> : null}
            </div>

            {discardPhaseMyTurn ? (
              <div className={`${OV2_DUEL_ACTION_STRIP} rounded-xl px-2 py-1.5`}>
                <p className="text-center text-[11px] font-semibold text-emerald-200">Choose a discard</p>
                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
                  {vm.myHand.length === 11 && finishSuggestion ? (
                    <button type="button" disabled={busy} className={OV2_BTN_ACCENT} onClick={() => setFinishPanelOpen(true)}>
                      Ready to finish
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className={`${OV2_DUEL_PANEL_HAND} ${handBoardActive ? `${OV2_DUEL_PANEL_HAND_ACTIVE} ring-1 ring-emerald-300/35 shadow-[0_0_30px_rgba(16,185,129,0.2)]` : ""} shrink-0 rounded-3xl border-white/12 bg-[linear-gradient(180deg,rgba(17,27,45,0.62)_0%,rgba(8,14,27,0.86)_100%)] p-2 sm:p-3 md:py-2 md:max-h-[10.25rem]`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">Your hand</p>
            <p className="text-[10px] text-zinc-400">{vm.myHand.length} cards</p>
          </div>
          <div className="flex items-end justify-center gap-0 overflow-hidden px-0.5 pb-1" style={{ "--mm-hand-count": Math.max(1, vm.myHand.length) }}>
            {vm.myHand.map((c, idx) => {
              const hid = `h-${idx}-${c}-${vm.revision}`;
              const showingHit = handCardHitKey === hid;
              const ui = mmCardUi(c);
              const map = finishMapByCard[c];
              return (
              <button
                key={hid}
                type="button"
                disabled={!canInteractHand && !(vm.phase === "layoff" && vm.turnSeat === vm.mySeat)}
                onClick={() => {
                  if (vm.phase === "layoff" && vm.turnSeat === vm.mySeat) {
                    void onLayoffAddCard(c);
                    void (async () => {
                      await new Promise(r => setTimeout(r, OV2_DUEL_HAND_HIT_DELAY_MS));
                      playOv2DuelCardTap();
                      setHandCardHitKey(hid);
                      window.setTimeout(() => setHandCardHitKey(k => (k === hid ? null : k)), OV2_DUEL_HAND_HIT_CLEAR_MS);
                    })();
                    return;
                  }
                  if (canInteractHand) {
                    void (async () => {
                      const p = onCardDiscard(c);
                      await new Promise(r => setTimeout(r, OV2_DUEL_HAND_HIT_DELAY_MS));
                      playOv2DuelCardTap();
                      setHandCardHitKey(hid);
                      window.setTimeout(() => setHandCardHitKey(k => (k === hid ? null : k)), OV2_DUEL_HAND_HIT_CLEAR_MS);
                      try {
                        await p;
                        playOv2DuelSuccess();
                      } catch {
                        playOv2DuelInvalid();
                      }
                    })();
                  }
                }}
                className={`${OV2_DUEL_HAND_PILL_BASE} first:ml-0 min-h-[max(62px,14vw)] md:min-h-[72px] rounded-[0.95rem] border border-zinc-400/65 bg-[linear-gradient(165deg,#ffffff_0%,#f7f3ea_52%,#ece7dc_100%)] px-1.5 py-1 md:py-0.5 text-zinc-900 shadow-[0_16px_28px_rgba(0,0,0,0.5)] transition-transform duration-150 hover:-translate-y-2 hover:scale-[1.05] active:scale-[0.98] ${showingHit ? `${OV2_DUEL_HAND_HIT} -translate-y-2 scale-[1.04]` : ""} ${
                  canInteractHand || (vm.phase === "layoff" && vm.turnSeat === vm.mySeat)
                    ? "ring-1 ring-sky-400/30"
                    : "opacity-45 grayscale"
                } ${map?.kind === "meld" ? "ring-2 ring-emerald-400/55" : map?.kind === "deadwood" ? "ring-2 ring-amber-400/55" : ""}`}
                style={{
                  width: `min(72px, max(38px, calc((100vw - 18px) / var(--mm-hand-count) + 9px)))`,
                  marginLeft: idx === 0 ? "0px" : "max(-11px, calc(-1 * (var(--mm-hand-count) - 7) * 1.4px))",
                  transform: `translateY(${Math.abs(idx - (vm.myHand.length - 1) / 2) * 0.45}px) rotate(${(idx - (vm.myHand.length - 1) / 2) * 0.75}deg)`,
                }}
                title={`${ui.rank} of ${ui.suitName}`}
              >
                <MmCardFace cardId={c} />
                {map?.kind === "meld" ? <span className="mt-0.5 block text-center text-[8px] font-semibold uppercase tracking-wide text-emerald-700">Meld {map.group}</span> : null}
                {map?.kind === "deadwood" ? <span className="mt-0.5 block text-center text-[8px] font-semibold uppercase tracking-wide text-amber-700">Deadwood</span> : null}
              </button>
            );
            })}
          </div>
        </div>

        {vm.phase === "layoff" && vm.turnSeat === vm.mySeat ? (
          <div className={`p-2 ${OV2_CALLOUT_VIOLET}`}>
            <p className="text-[11px] text-violet-100/90">
              Add your matching cards to the closer&apos;s revealed melds. Pick a meld, tap cards in your hand, then confirm scoring.
            </p>
            {layoffMeldsNorm.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {layoffMeldsNorm.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLayoffMeldPick(i)}
                    className={`${OV2_DUEL_LAYOFF_MELD_BTN_BASE} ${
                      layoffMeldPick === i ? OV2_DUEL_LAYOFF_MELD_SELECTED : OV2_DUEL_LAYOFF_MELD_IDLE
                    }`}
                  >
                    #{i + 1}: {m.map(mmFormatCard).join(" ")}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-500">Waiting for meld data…</p>
            )}
            {layoffAssignments.length ? (
              <p className="mt-2 text-[10px] text-zinc-400">
                Pending:{" "}
                {layoffAssignments.map((a, j) => (
                  <span key={j} className="mr-1 font-mono">
                    M{a.meld_index + 1}+{mmFormatCard(a.card_id)}
                  </span>
                ))}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={OV2_BTN_PRIMARY} onClick={() => void onLayoffSubmit()}>
                Confirm scoring
              </button>
              <button
                type="button"
                disabled={busy}
                className={OV2_BTN_SECONDARY}
                onClick={() => void resolveLayoff([])}
              >
                Skip layoffs
              </button>
              <button type="button" className={OV2_BTN_SECONDARY} onClick={() => setLayoffAssignments([])}>
                Clear pending
              </button>
            </div>
          </div>
        ) : vm.phase === "layoff" ? (
          <p className="text-center text-[11px] text-zinc-400">Opponent is laying off…</p>
        ) : null}

        {(vm.phase === "finished" || vm.phase === "layoff") && vm.opponentHandRevealed.length > 0 ? (
          <div className={OV2_REVEALED_HAND_PANEL}>
            <p className="text-[10px] font-semibold text-zinc-500">Revealed opponent hand</p>
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px] text-zinc-300">
              {vm.opponentHandRevealed.map(c => (
                <span key={c}>{mmFormatCard(c)}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-1 flex shrink-0 flex-col gap-1 border-t border-white/[0.08] pt-1 text-[9px] text-zinc-500 sm:text-[10px]">
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              disabled={!canOfferDoubleNow}
              className={`${OV2_BTN_ACCENT} flex-1 py-2 text-[11px] disabled:opacity-45`}
              onClick={() => void offerDouble()}
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
      </div>

      {finishPanelOpen && finishSuggestion ? (
        <Ov2SharedFinishModalFrame variant="center" titleId="ov2-mm-finish-hand-title">
          <div className="p-4">
            <p id="ov2-mm-finish-hand-title" className="text-sm font-semibold text-zinc-100">
              Finish hand
            </p>
            <p className="mt-1 text-[11px] text-zinc-300">
              {finishSuggestion.kind === "gin" ? "Perfect finish is available." : "Ready to finish with low deadwood."} You will discard{" "}
              <span className="font-mono text-zinc-100">{mmFormatCard(finishSuggestion.discard)}</span> and declare{" "}
              {finishSuggestion.deadwoodPts} deadwood points.
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">Why this works: {finishSuggestion.kind === "gin" ? "all cards fit into melds." : "deadwood is 10 or less."}</p>
            <p className="mt-2 text-[10px] text-zinc-500">Melds (server validates):</p>
            <ul className="mt-1 max-h-32 overflow-y-auto text-[10px] font-mono text-zinc-300">
              {finishSuggestion.melds.map((m, i) => (
                <li key={i}>{m.map(mmFormatCard).join(" ")}</li>
              ))}
            </ul>
            {finishSuggestion.deadwood.length ? (
              <p className="mt-2 text-[10px] text-zinc-500">
                Deadwood: {finishSuggestion.deadwood.map(mmFormatCard).join(" ")}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={OV2_BTN_PRIMARY} onClick={() => void onSubmitFinish()}>
                Finish round
              </button>
              <button type="button" className={OV2_BTN_SECONDARY} onClick={() => setFinishPanelOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}

      <Ov2SharedStakeDoubleModal
        open={vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble}
        proposedMult={vm.pendingDouble?.proposed_mult}
        stakeMultiplier={vm.stakeMultiplier}
        busy={busy}
        onAccept={() => void respondDouble(true)}
        onDecline={() => void respondDouble(false)}
      />

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-mm-finish-title">
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
                  id="ov2-mm-finish-title"
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
                {finishReasonReadable ? <p className="mt-1 text-center text-[10px] leading-snug text-zinc-500">{finishReasonReadable}</p> : null}
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                  {vaultClaimBusy ? "Sending results to your balance…" : "Round complete — rematch, then host starts next."}
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
                Host starts the next match when both players rematch.
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
    </div>
  );
}
