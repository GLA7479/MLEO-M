"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOv2Rummy51Session } from "../../../hooks/useOv2Rummy51Session";
import {
  deserializeCard,
  getCardDisplayLabel,
  RUMMY51_ELIMINATION_SCORE,
  simulateTableAddsJokerReturns,
  sortHandCards,
  tryAddCardToMeldWithJokerSwap,
  validateFullTurnSubmission,
} from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";
import { OV2_RUMMY51_PRODUCT_GAME_ID } from "../../../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";
import Ov2SeatStrip from "../shared/Ov2SeatStrip";
import Ov2Rummy51Hand from "./Ov2Rummy51Hand";
import Ov2Rummy51TableMelds from "./Ov2Rummy51TableMelds";

/**
 * @typedef {import("../../../lib/online-v2/rummy51/ov2Rummy51Engine").Rummy51Card} Rummy51Card
 */

const MID_RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const MID_SUIT = /** @type {const} */ ({ S: "♠", H: "♥", D: "♦", C: "♣" });

const OV2_R51_HAND_ORDER_PREFIX = "ov2_r51_hand_order_v1";

/** @param {string|null|undefined} roomId @param {string|null|undefined} selfKey */
function handOrderStorageKey(roomId, selfKey) {
  const r = String(roomId || "").trim();
  const s = String(selfKey || "").trim();
  if (!r || !s) return null;
  return `${OV2_R51_HAND_ORDER_PREFIX}:${r}:${s}`;
}

/** @param {string|null} key */
function readStoredHandOrder(key) {
  if (!key || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : null;
  } catch {
    return null;
  }
}

/** @param {string|null} key @param {string[]|null|undefined} ids */
function writeStoredHandOrder(key, ids) {
  if (!key || typeof sessionStorage === "undefined") return;
  try {
    if (ids?.length) sessionStorage.setItem(key, JSON.stringify(ids));
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** @param {string[]|null|undefined} prev @param {string[]} serverVisibleIds */
function mergeHandOrderWithVisible(prev, serverVisibleIds) {
  const vis = new Set(serverVisibleIds);
  const next = [];
  for (const id of prev || []) {
    if (vis.has(id)) {
      next.push(id);
      vis.delete(id);
    }
  }
  for (const id of serverVisibleIds) {
    if (vis.has(id)) {
      next.push(id);
      vis.delete(id);
    }
  }
  return next;
}

/** @param {Rummy51Card} c */
function cardToHandRaw(c) {
  return {
    id: c.id,
    rank: c.rank,
    suit: c.suit,
    isJoker: c.isJoker,
    deckIndex: c.deckIndex,
  };
}

const HAND_NUDGE_BTN =
  "flex h-full min-h-[32px] w-8 shrink-0 items-center justify-center rounded-md border border-white/20 bg-zinc-800/90 text-sm font-bold leading-none text-zinc-100 active:bg-zinc-700 disabled:pointer-events-none disabled:opacity-35 sm:min-h-[34px] sm:w-9 sm:text-base";

/** Fixed-width column between Draw and Take (or beside Submit); holds ◀/▶ or invisible spacers. */
const HAND_NUDGE_SLOT =
  "flex shrink-0 items-stretch justify-center gap-1 basis-[4.5rem] sm:basis-[5rem]";

/** @param {{ leftDisabled: boolean, rightDisabled: boolean, onNudge: (delta: -1 | 1) => void }} props */
function HandReorderNudgeButtons({ leftDisabled, rightDisabled, onNudge }) {
  return (
    <>
      <button
        type="button"
        aria-label="Move card left"
        disabled={leftDisabled}
        onClick={() => onNudge(-1)}
        className={HAND_NUDGE_BTN}
      >
        ◀
      </button>
      <button
        type="button"
        aria-label="Move card right"
        disabled={rightDisabled}
        onClick={() => onNudge(1)}
        className={HAND_NUDGE_BTN}
      >
        ▶
      </button>
    </>
  );
}

/** Invisible same-width spacers — keeps Draw/Take/Submit layout stable when nudges are hidden. */
function HandNudgeSlotSpacer() {
  const bar = "min-h-[32px] w-8 shrink-0 sm:min-h-[34px] sm:w-9";
  return (
    <>
      <div className={bar} aria-hidden />
      <div className={bar} aria-hidden />
    </>
  );
}

/**
 * Discard pile top — floated above the table (absolute in parent); does not shrink meld layout.
 * @param {{ card: Rummy51Card|null, empty: boolean, highlight: boolean }} props
 */
function SideDiscardStrip({ card, empty, highlight }) {
  const red = Boolean(card && !card.isJoker && (card.suit === "H" || card.suit === "D"));
  return (
    <div
      className={`flex w-max shrink-0 select-none flex-col items-center gap-0.5 rounded-md bg-zinc-950/90 px-1 py-1 shadow-[0_2px_14px_rgba(0,0,0,0.5)] ring-1 ring-white/12 ${
        highlight ? "ring-amber-400/50 drop-shadow-[0_0_10px_rgba(245,158,11,0.35)]" : ""
      }`}
    >
      <p className="w-full truncate text-center text-[6px] font-bold uppercase leading-none text-amber-200/80 sm:text-[7px]">
        Discard
      </p>
      {card ? (
        <div
          className={`relative flex h-[3.65rem] w-[2.65rem] flex-col rounded-md border py-0.5 shadow-md sm:h-[3.95rem] sm:w-[2.85rem] ${
            highlight
              ? "border-amber-400/65 bg-gradient-to-b from-amber-900/45 to-zinc-950"
              : "border-amber-500/45 bg-gradient-to-b from-zinc-600 to-zinc-950"
          }`}
        >
          <div
            className={`px-0.5 text-left leading-none ${card.isJoker ? "text-amber-200" : red ? "text-rose-300" : "text-zinc-100"}`}
          >
            <div className="text-[11px] font-extrabold leading-none sm:text-xs">{card.isJoker ? "J" : MID_RANK[card.rank] ?? "?"}</div>
            <div className="text-[12px] font-bold leading-none sm:text-sm">{card.isJoker ? "★" : card.suit ? MID_SUIT[card.suit] ?? "" : ""}</div>
          </div>
          <div
            className={`flex flex-1 items-center justify-center px-px text-center text-[11px] font-black leading-none sm:text-xs ${
              card.isJoker ? "text-amber-200" : red ? "text-rose-200" : "text-zinc-100"
            }`}
          >
            {getCardDisplayLabel(card)}
          </div>
        </div>
      ) : (
        <div className="flex h-[3.65rem] w-[2.65rem] flex-col items-center justify-center rounded-md border border-dashed border-zinc-600/55 bg-zinc-950/90 sm:h-[3.95rem] sm:w-[2.85rem]">
          <span className="px-px text-center text-[7px] font-semibold leading-tight text-zinc-500 sm:text-[8px]">{empty ? "∅" : "—"}</span>
        </div>
      )}
    </div>
  );
}

/** Icon-only undo: return last discard draw (sibling to discard strip; pointer-events-auto on button only). */
function DiscardUndoIconButton({ disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title="Return card to discard"
      aria-label="Return taken card to discard pile"
      className="pointer-events-auto mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-500/45 bg-zinc-950/95 text-amber-200 shadow-[0_2px_10px_rgba(0,0,0,0.4)] ring-1 ring-white/10 backdrop-blur-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:w-10"
    >
      <svg className="h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h8.5a4.5 4.5 0 0 1 0 9H11" />
      </svg>
    </button>
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void | Promise<void>, leaveToLobbyBusy?: boolean } | null }} props
 */
export default function Ov2Rummy51Screen({ contextInput = null }) {
  const session = useOv2Rummy51Session(contextInput ?? undefined);
  const {
    snapshot,
    members,
    room,
    selfKey,
    busy,
    actionError,
    setActionError,
    drawStock,
    drawDiscard,
    undoDiscardDraw,
    submitTurn,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isMyTurn,
    hasActiveSession,
    isPlaying,
    isFinished,
    rematchCounts,
    isHost,
  } = session;

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [discardPickMode, setDiscardPickMode] = useState(false);
  const [discardCardId, setDiscardCardId] = useState(/** @type {string|null} */ (null));
  const [sortMode, setSortMode] = useState(/** @type {"rank"|"suit"} */ ("rank"));
  /** Custom hand strip order (visible hand only); cleared when Rank/Suit sort is chosen in hand UI. */
  const [manualOrder, setManualOrder] = useState(/** @type {string[]|null} */ (null));
  const [handOrderBasis, setHandOrderBasis] = useState(/** @type {"natural"|"sorted"} */ ("natural"));
  const [optimisticReturnedJokers, setOptimisticReturnedJokers] = useState(/** @type {Rummy51Card[]} */ ([]));
  /** @type {Rummy51Card[][]} */
  const [draftNewMelds, setDraftNewMelds] = useState([]);
  /** @type {{ meldId: string, cards: Rummy51Card[] }[]} */
  const [draftTableAdds, setDraftTableAdds] = useState([]);
  const [targetMeldId, setTargetMeldId] = useState(/** @type {string|null} */ (null));
  /** @type {{ title: string, lines: string[] }|null} */
  const [roundBanner, setRoundBanner] = useState(null);

  /** Brief highlight on card(s) just drawn from stock or discard (revision diff). */
  const [drawHighlightIds, setDrawHighlightIds] = useState(() => new Set());
  const prevDrawRevisionRef = useRef(-1);
  const prevHandIdsForDrawRef = useRef(/** @type {Set<string>} */ (new Set()));
  /** Must not clear on every effect re-run — that blocked the 2s fade (cleanup ran before timeout fired). */
  const drawHighlightTimeoutRef = useRef(/** @type {number} */ (0));

  const scoreSnapRef = useRef(/** @type {Record<string, number>} */ ({}));
  const roundRef = useRef(0);

  const roomProductId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.product_game_id != null
      ? String(contextInput.room.product_game_id)
      : null;

  const isRummyRoom = roomProductId === OV2_RUMMY51_PRODUCT_GAME_ID;

  const onLeaveToLobby =
    contextInput && typeof contextInput === "object" && typeof contextInput.onLeaveToLobby === "function"
      ? contextInput.onLeaveToLobby
      : null;
  const leaveToLobbyBusy = Boolean(
    contextInput && typeof contextInput === "object" && contextInput.leaveToLobbyBusy === true
  );

  const myHandRaw = useMemo(() => {
    if (!snapshot?.hands || !selfKey) return [];
    const h = snapshot.hands[selfKey];
    return Array.isArray(h) ? h : [];
  }, [snapshot?.hands, selfKey]);

  /** Cards committed to meld draft — hidden from hand strip until submit or Clr (server hand unchanged). */
  const draftPlayedCardIds = useMemo(() => {
    const s = new Set();
    for (const meld of draftNewMelds) {
      for (const c of meld) {
        if (c && typeof c.id === "string") s.add(c.id);
      }
    }
    for (const row of draftTableAdds) {
      for (const c of row.cards) {
        if (c && typeof c.id === "string") s.add(c.id);
      }
    }
    return s;
  }, [draftNewMelds, draftTableAdds]);

  const myHandRawVisible = useMemo(() => {
    if (draftPlayedCardIds.size === 0) return myHandRaw;
    return myHandRaw.filter(raw => {
      if (!raw || typeof raw !== "object") return true;
      const id = /** @type {Record<string, unknown>} */ (raw).id;
      return typeof id !== "string" || !draftPlayedCardIds.has(id);
    });
  }, [myHandRaw, draftPlayedCardIds]);

  const handOrderKey = useMemo(() => handOrderStorageKey(room?.id, selfKey), [room?.id, selfKey]);

  const handCards = useMemo(() => {
    const out = [];
    for (const raw of myHandRaw) {
      try {
        out.push(deserializeCard(raw));
      } catch {
        /* skip */
      }
    }
    return out;
  }, [myHandRaw]);

  const handById = useMemo(() => {
    const m = new Map();
    for (const c of handCards) m.set(c.id, c);
    return m;
  }, [handCards]);

  const optimisticHandExtraRaw = useMemo(() => {
    const have = new Set(handCards.map(c => c.id));
    return optimisticReturnedJokers.filter(j => j && !have.has(j.id)).map(cardToHandRaw);
  }, [optimisticReturnedJokers, handCards]);

  const handRawForUi = useMemo(
    () => [...myHandRawVisible, ...optimisticHandExtraRaw],
    [myHandRawVisible, optimisticHandExtraRaw]
  );

  const visibleUiOrderIds = useMemo(() => {
    const out = [];
    for (const raw of handRawForUi) {
      try {
        out.push(deserializeCard(raw).id);
      } catch {
        /* skip */
      }
    }
    return out;
  }, [handRawForUi]);

  const visibleUiOrderSig = visibleUiOrderIds.join("\0");

  useEffect(() => {
    if (!handOrderKey || handOrderBasis !== "natural") return;
    setManualOrder(prev => {
      const stored = readStoredHandOrder(handOrderKey);
      const base = prev?.length ? prev : stored;
      const merged = mergeHandOrderWithVisible(base, visibleUiOrderIds);
      return merged.length ? merged : null;
    });
  }, [handOrderKey, handOrderBasis, visibleUiOrderSig]);

  useEffect(() => {
    if (!handOrderKey || handOrderBasis !== "natural" || !manualOrder?.length) return;
    writeStoredHandOrder(handOrderKey, manualOrder);
  }, [handOrderKey, handOrderBasis, manualOrder]);

  const sortedVisibleHandCards = useMemo(() => {
    const out = [];
    for (const raw of handRawForUi) {
      try {
        out.push(deserializeCard(raw));
      } catch {
        /* skip */
      }
    }
    return sortHandCards(out, sortMode);
  }, [handRawForUi, sortMode]);

  const onSortModeFromUser = useCallback(
    mode => {
      setHandOrderBasis("sorted");
      setSortMode(mode);
      setManualOrder(null);
      if (handOrderKey) writeStoredHandOrder(handOrderKey, []);
    },
    [handOrderKey]
  );

  const myPs = useMemo(() => {
    if (!snapshot?.playerState || !selfKey) return null;
    const ps = snapshot.playerState[selfKey];
    return ps && typeof ps === "object" ? ps : null;
  }, [snapshot?.playerState, selfKey]);

  const hasEverOpened = Boolean(myPs?.hasEverOpened);
  const hasOpenedThisHand = Boolean(myPs?.hasOpenedThisHand);

  const membersBySeat = useMemo(() => {
    const out = new Map();
    for (const m of members) {
      if (!m || typeof m !== "object") continue;
      const si = m.seat_index;
      if (si === null || si === undefined || si === "") continue;
      const n = Number(si);
      if (!Number.isInteger(n) || n < 0 || n > 3) continue;
      if (!out.has(n)) out.set(n, m);
    }
    return out;
  }, [members]);

  const seatLabels = useMemo(() => {
    return [0, 1, 2, 3].map(seat => {
      const mem = membersBySeat.get(seat);
      const name = mem?.display_name ? String(mem.display_name).trim() : "";
      return name ? `${name}` : `Seat ${seat + 1}`;
    });
  }, [membersBySeat]);

  const turnSeatIndex = useMemo(() => {
    if (!snapshot?.turnParticipantKey || !snapshot.playerState) return null;
    const ps = snapshot.playerState[snapshot.turnParticipantKey];
    if (!ps || typeof ps !== "object") return null;
    const si = ps.seatIndex;
    return si != null ? Number(si) : null;
  }, [snapshot?.turnParticipantKey, snapshot?.playerState]);

  const selfSeatIndex = useMemo(() => {
    if (!selfKey || !snapshot?.playerState) return null;
    const ps = snapshot.playerState[selfKey];
    if (!ps || typeof ps !== "object") return null;
    const si = ps.seatIndex;
    return si != null ? Number(si) : null;
  }, [selfKey, snapshot?.playerState]);

  const eliminatedSeatIndices = useMemo(() => {
    if (!snapshot?.playerState) return [];
    const out = [];
    for (const [pk, ps] of Object.entries(snapshot.playerState)) {
      if (!ps || typeof ps !== "object") continue;
      if (!ps.isEliminated) continue;
      const si = ps.seatIndex;
      if (si != null && Number.isInteger(Number(si))) out.push(Number(si));
    }
    return out;
  }, [snapshot?.playerState]);

  /** Per-seat lines for `Ov2SeatStrip` (score / opened / near-elimination). */
  const seatStripMeta = useMemo(() => {
    const scoreLines = /** @type {(string|null)[]} */ ([null, null, null, null]);
    const openedFlags = [false, false, false, false];
    const nearFlags = [false, false, false, false];
    if (!snapshot?.playerState) {
      return { scoreLines, openedFlags, nearFlags };
    }
    for (const [, ps] of Object.entries(snapshot.playerState)) {
      if (!ps || typeof ps !== "object") continue;
      const si = ps.seatIndex;
      if (si == null || !Number.isInteger(Number(si)) || Number(si) < 0 || Number(si) > 3) continue;
      const s = Number(si);
      const total = ps.scoreTotal != null ? Number(ps.scoreTotal) : 0;
      const out = Boolean(ps.isEliminated);
      scoreLines[s] = `${total}/${RUMMY51_ELIMINATION_SCORE}`;
      openedFlags[s] = Boolean(ps.hasEverOpened);
      nearFlags[s] = !out && total >= RUMMY51_ELIMINATION_SCORE - 80;
    }
    return { scoreLines, openedFlags, nearFlags };
  }, [snapshot?.playerState]);

  const pickedDiscardCard = useMemo(() => {
    if (!discardCardId) return null;
    return handById.get(discardCardId) ?? null;
  }, [discardCardId, handById]);

  const discardTopCard = useMemo(() => {
    const t = snapshot?.discardTop;
    if (!t || typeof t !== "object") return null;
    try {
      return deserializeCard(t);
    } catch {
      return null;
    }
  }, [snapshot?.discardTop]);

  const discardCount = snapshot?.discardCount != null ? Number(snapshot.discardCount) : 0;

  const pendingDraw = snapshot?.pendingDrawSource != null ? String(snapshot.pendingDrawSource) : "";

  const orderIdsForDockNudge = useMemo(() => {
    if (manualOrder?.length) return manualOrder;
    if (handOrderBasis === "sorted") return sortedVisibleHandCards.map(c => c.id);
    return visibleUiOrderIds;
  }, [manualOrder, handOrderBasis, sortedVisibleHandCards, visibleUiOrderIds]);

  const singleSelForDockNudge = selectedIds.size === 1 ? [...selectedIds][0] : null;
  const singleSelIdxDock =
    singleSelForDockNudge != null ? orderIdsForDockNudge.indexOf(singleSelForDockNudge) : -1;

  /** One card selected + 2+ visible cards — nudge order (any time in play, any seat). */
  const dockHandReorder =
    isPlaying && !busy && myHandRawVisible.length > 1 && selectedIds.size === 1;

  const showOffTurnHandReorderDock = dockHandReorder && !isMyTurn;

  const nudgeHandOrder = useCallback(
    delta => {
      if (!singleSelForDockNudge) return;
      const base = manualOrder?.length
        ? [...manualOrder]
        : handOrderBasis === "sorted"
          ? sortedVisibleHandCards.map(c => c.id)
          : [...visibleUiOrderIds];
      const i = base.indexOf(singleSelForDockNudge);
      if (i < 0) return;
      const j = i + delta;
      if (j < 0 || j >= base.length) return;
      const next = [...base];
      [next[i], next[j]] = [next[j], next[i]];
      setHandOrderBasis("natural");
      setManualOrder(next);
    },
    [singleSelForDockNudge, manualOrder, handOrderBasis, sortedVisibleHandCards, visibleUiOrderIds]
  );

  useEffect(() => {
    const rev = snapshot?.revision ?? 0;
    const ids = new Set(handCards.map(c => c.id));
    const drewPending = pendingDraw === "stock" || pendingDraw === "discard";

    if (prevDrawRevisionRef.current >= 0 && rev > prevDrawRevisionRef.current && drewPending) {
      const added = [...ids].filter(id => !prevHandIdsForDrawRef.current.has(id));
      if (added.length > 0) {
        setDrawHighlightIds(new Set(added));
        if (drawHighlightTimeoutRef.current) window.clearTimeout(drawHighlightTimeoutRef.current);
        drawHighlightTimeoutRef.current = window.setTimeout(() => {
          drawHighlightTimeoutRef.current = 0;
          setDrawHighlightIds(new Set());
        }, 2000);
      }
    }
    prevDrawRevisionRef.current = rev;
    prevHandIdsForDrawRef.current = ids;
  }, [snapshot?.revision, handCards, pendingDraw]);

  useEffect(() => {
    return () => {
      if (drawHighlightTimeoutRef.current) {
        window.clearTimeout(drawHighlightTimeoutRef.current);
        drawHighlightTimeoutRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!snapshot?.roundNumber || !snapshot.playerState) return undefined;
    const rn = Number(snapshot.roundNumber);
    const prevR = roundRef.current;
    const prevScores = { ...scoreSnapRef.current };

    if (prevR > 0 && rn > prevR) {
      const lines = [];
      const winnerPk = snapshot.turnParticipantKey;
      const wname =
        winnerPk && snapshot.playerState[winnerPk]?.displayName
          ? String(snapshot.playerState[winnerPk].displayName)
          : winnerPk?.slice(0, 8) ?? "—";
      lines.push(`Winner (next lead): ${wname}`);
      for (const [pk, ps] of Object.entries(snapshot.playerState)) {
        if (!ps || typeof ps !== "object") continue;
        const now = ps.scoreTotal != null ? Number(ps.scoreTotal) : 0;
        const was = prevScores[pk] ?? 0;
        const d = now - was;
        if (pk !== winnerPk && d !== 0) {
          const label = ps.displayName != null ? String(ps.displayName) : pk.slice(0, 6);
          lines.push(`${label}: +${d} pts`);
        }
      }
      setRoundBanner({ title: `Round ${prevR} finished`, lines });
      const t = window.setTimeout(() => setRoundBanner(null), 12000);
      roundRef.current = rn;
      const nextScores = {};
      for (const [pk, ps] of Object.entries(snapshot.playerState)) {
        if (ps && typeof ps === "object" && ps.scoreTotal != null) nextScores[pk] = Number(ps.scoreTotal);
      }
      scoreSnapRef.current = nextScores;
      return () => window.clearTimeout(t);
    }

    roundRef.current = rn;
    const nextScores = {};
    for (const [pk, ps] of Object.entries(snapshot.playerState)) {
      if (ps && typeof ps === "object" && ps.scoreTotal != null) nextScores[pk] = Number(ps.scoreTotal);
    }
    scoreSnapRef.current = nextScores;
    return undefined;
  }, [snapshot?.roundNumber, snapshot?.playerState, snapshot?.turnParticipantKey]);

  const resetTurnUi = useCallback(() => {
    setSelectedIds(new Set());
    setDiscardPickMode(false);
    setDiscardCardId(null);
    setDraftNewMelds([]);
    setDraftTableAdds([]);
    setTargetMeldId(null);
    setOptimisticReturnedJokers([]);
  }, []);

  const prevTurnPkRef = useRef(/** @type {string|null} */ (null));
  useEffect(() => {
    const pk = snapshot?.turnParticipantKey != null ? String(snapshot.turnParticipantKey) : null;
    const pend = snapshot?.pendingDrawSource != null ? String(snapshot.pendingDrawSource) : "";
    if (selfKey && pk === selfKey && !pend && prevTurnPkRef.current !== pk) {
      resetTurnUi();
    }
    prevTurnPkRef.current = pk;
  }, [snapshot?.turnParticipantKey, snapshot?.pendingDrawSource, selfKey, resetTurnUi]);

  const selectedCards = useMemo(() => {
    const out = [];
    for (const id of selectedIds) {
      const c = handById.get(id);
      if (c) out.push(c);
    }
    return out;
  }, [selectedIds, handById]);

  const tableMeldById = useMemo(() => {
    const m = new Map();
    for (const raw of snapshot?.tableMelds || []) {
      if (!raw || typeof raw !== "object") continue;
      const o = /** @type {Record<string, unknown>} */ (raw);
      const id = o.meldId != null ? String(o.meldId) : "";
      if (!id) continue;
      const cardsRaw = Array.isArray(o.cards) ? o.cards : [];
      const cards = [];
      for (const c of cardsRaw) {
        try {
          cards.push(deserializeCard(c));
        } catch {
          /* skip */
        }
      }
      m.set(id, cards);
    }
    return m;
  }, [snapshot?.tableMelds]);

  const onToggleCardId = useCallback(
    id => {
      if (discardPickMode) {
        setDiscardCardId(id);
        setDiscardPickMode(false);
        return;
      }
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [discardPickMode]
  );

  const onNewMeldFromSelection = useCallback(() => {
    if (selectedCards.length < 3) return;
    const played = new Set(selectedCards.map(c => c.id));
    setDraftNewMelds(prev => [...prev, [...selectedCards]]);
    setSelectedIds(new Set());
    setDiscardCardId(prev => (prev && played.has(prev) ? null : prev));
  }, [selectedCards]);

  const onAddSelectionToTarget = useCallback(() => {
    if (!targetMeldId || selectedCards.length < 1) return;
    const played = new Set(selectedCards.map(c => c.id));
    const existing = tableMeldById.get(targetMeldId) ?? [];
    let cur = [...existing];
    /** @type {(string|null)[]} */
    const replaceJokerIds = [];
    /** @type {Rummy51Card[]} */
    const returned = [];
    let swapPathOk = true;
    for (const c of selectedCards) {
      const res = tryAddCardToMeldWithJokerSwap(cur, c, {});
      if (!res) {
        swapPathOk = false;
        break;
      }
      cur = res.meld;
      replaceJokerIds.push(res.returnedJoker ? res.returnedJoker.id : null);
      if (res.returnedJoker) returned.push(res.returnedJoker);
    }
    if (swapPathOk) {
      if (returned.length) setOptimisticReturnedJokers(prev => [...prev, ...returned]);
      setDraftTableAdds(prev => {
        const idx = prev.findIndex(x => x.meldId === targetMeldId);
        const row = {
          meldId: targetMeldId,
          cards: [...selectedCards],
          replaceJokerIds,
        };
        if (idx >= 0) {
          const copy = [...prev];
          const prevRow = copy[idx];
          copy[idx] = {
            meldId: targetMeldId,
            cards: [...(prevRow.cards || []), ...row.cards],
            replaceJokerIds: [
              ...(Array.isArray(prevRow.replaceJokerIds) ? prevRow.replaceJokerIds : []),
              ...replaceJokerIds,
            ],
          };
          return copy;
        }
        return [...prev, row];
      });
    } else {
      setDraftTableAdds(prev => {
        const idx = prev.findIndex(x => x.meldId === targetMeldId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { meldId: targetMeldId, cards: [...copy[idx].cards, ...selectedCards] };
          return copy;
        }
        return [...prev, { meldId: targetMeldId, cards: [...selectedCards] }];
      });
    }
    setSelectedIds(new Set());
    setDiscardCardId(prev => (prev && played.has(prev) ? null : prev));
  }, [targetMeldId, selectedCards, tableMeldById]);

  const canSubmitTurn = useMemo(() => {
    if (!isMyTurn || !isPlaying || !pendingDraw || !discardCardId) return false;
    const discardCard = handById.get(discardCardId);
    if (!discardCard) return false;

    const playedIds = new Set();
    for (const meld of draftNewMelds) for (const c of meld) playedIds.add(c.id);
    for (const row of draftTableAdds) for (const c of row.cards) playedIds.add(c.id);

    const tableAddsForSim = draftTableAdds.map(a => ({
      existing: tableMeldById.get(a.meldId) ?? [],
      cardsFromHand: a.cards,
    }));
    const jokerSim = simulateTableAddsJokerReturns(tableAddsForSim, {});
    const returnedFromTable = jokerSim.ok ? jokerSim.returnedJokers : [];

    let after = handCards.filter(c => !playedIds.has(c.id));
    for (const j of returnedFromTable) after.push(j);
    const hasDiscardInAfter = after.some(c => c.id === discardCardId);
    if (!hasDiscardInAfter) return false;

    const initialOpen =
      !hasEverOpened && draftNewMelds.length
        ? { newMeldsFromHand: draftNewMelds, hadOpenedBefore: hasEverOpened }
        : undefined;

    const tableAdds = draftTableAdds.map(a => ({
      meldId: a.meldId,
      existing: tableMeldById.get(a.meldId) ?? [],
      cardsFromHand: a.cards,
    }));

    const drawSrc = pendingDraw === "discard" ? "discard" : "stock";
    const v = validateFullTurnSubmission({
      turn: {
        hasDrawn: false,
        hasDiscarded: false,
        hasOpenedBefore: hasEverOpened,
      },
      draw: {
        source: drawSrc,
        pickedCardId: drawSrc === "discard" ? snapshot?.takenDiscardCardId ?? null : null,
      },
      initialOpen,
      tableAdds,
      newMeldsAfterOpen: hasEverOpened ? draftNewMelds : [],
      discard: { card: discardCard },
      handBeforeTurn: handCards,
      handAfterMeldsBeforeDiscard: after,
      closing: after.length === 1 && after[0].id === discardCardId,
      stockEmpty: false,
      discardEmpty: false,
    });
    return v.ok === true;
  }, [
    isMyTurn,
    isPlaying,
    pendingDraw,
    discardCardId,
    handById,
    handCards,
    draftNewMelds,
    draftTableAdds,
    hasEverOpened,
    tableMeldById,
    snapshot?.takenDiscardCardId,
  ]);

  const validationMessage = useMemo(() => {
    if (!isMyTurn || !isPlaying || !pendingDraw || !discardCardId) return "";
    const discardCard = handById.get(discardCardId);
    if (!discardCard) return "Pick a discard card from your hand.";
    const playedIds = new Set();
    for (const meld of draftNewMelds) for (const c of meld) playedIds.add(c.id);
    for (const row of draftTableAdds) for (const c of row.cards) playedIds.add(c.id);
    const tableAddsForSimV = draftTableAdds.map(a => ({
      existing: tableMeldById.get(a.meldId) ?? [],
      cardsFromHand: a.cards,
    }));
    const jokerSimV = simulateTableAddsJokerReturns(tableAddsForSimV, {});
    const returnedV = jokerSimV.ok ? jokerSimV.returnedJokers : [];
    let after = handCards.filter(c => !playedIds.has(c.id));
    for (const j of returnedV) after.push(j);
    if (!after.some(c => c.id === discardCardId)) {
      return "The card you marked to discard (orange “out”) is also in a Meld/Tbl draft — remove it from the draft (Clr) or mark a different discard. The discard must stay in your hand until you submit.";
    }

    const initialOpen =
      !hasEverOpened && draftNewMelds.length
        ? { newMeldsFromHand: draftNewMelds, hadOpenedBefore: hasEverOpened }
        : undefined;
    const tableAdds = draftTableAdds.map(a => ({
      meldId: a.meldId,
      existing: tableMeldById.get(a.meldId) ?? [],
      cardsFromHand: a.cards,
    }));
    const drawSrc = pendingDraw === "discard" ? "discard" : "stock";
    const v = validateFullTurnSubmission({
      turn: { hasDrawn: false, hasDiscarded: false, hasOpenedBefore: hasEverOpened },
      draw: {
        source: drawSrc,
        pickedCardId: drawSrc === "discard" ? snapshot?.takenDiscardCardId ?? null : null,
      },
      initialOpen,
      tableAdds,
      newMeldsAfterOpen: hasEverOpened ? draftNewMelds : [],
      discard: { card: discardCard },
      handBeforeTurn: handCards,
      handAfterMeldsBeforeDiscard: after,
      closing: after.length === 1 && after[0].id === discardCardId,
      stockEmpty: false,
      discardEmpty: false,
    });
    return v.ok ? "" : v.message;
  }, [
    isMyTurn,
    isPlaying,
    pendingDraw,
    discardCardId,
    handById,
    handCards,
    draftNewMelds,
    draftTableAdds,
    hasEverOpened,
    tableMeldById,
    snapshot?.takenDiscardCardId,
  ]);

  const onSubmitTurn = useCallback(async () => {
    if (!canSubmitTurn || !discardCardId) return;
    setActionError("");
    const newMeldsPayload = draftNewMelds.map(m => m.map(c => ({ ...c })));
    const tableAddsPayload = draftTableAdds.map(a => ({
      meld_id: a.meldId,
      cards_from_hand: a.cards.map(c => ({ ...c })),
    }));
    await submitTurn({
      new_melds: newMeldsPayload,
      table_additions: tableAddsPayload,
      discard_card_id: discardCardId,
    });
    resetTurnUi();
  }, [canSubmitTurn, discardCardId, draftNewMelds, draftTableAdds, submitTurn, resetTurnUi, setActionError]);

  const onUndoDiscardDraw = useCallback(async () => {
    setActionError("");
    const r = await undoDiscardDraw();
    if (r.ok) resetTurnUi();
  }, [undoDiscardDraw, resetTurnUi, setActionError]);

  const previewOnly = !contextInput?.room?.id || !isRummyRoom;

  if (previewOnly) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
        <p className="text-sm text-zinc-400">Join a Rummy 51 room and open <span className="font-mono text-zinc-300">?room=</span> for live play.</p>
        <p className="text-[11px] text-zinc-600">Local practice board is not implemented — use the lobby to start a table.</p>
      </div>
    );
  }

  if (!hasActiveSession) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
        {isHost ? (
          <>
            <p className="text-sm text-zinc-300">No Rummy 51 session yet</p>
            <p className="text-[11px] text-zinc-500">
              Use <strong className="text-zinc-400">Open Rummy 51 match (host)</strong> above (or{" "}
              <strong className="text-zinc-400">Open match</strong> in the shared room). The room row must show an active
              session before play loads here.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-300">Waiting for the host</p>
            <p className="text-[11px] text-zinc-500">
              The host must open the match first. This page will show the table when the session exists. You can use
              Refresh room in the info panel to poll.
            </p>
          </>
        )}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-zinc-500">Loading table…</div>
    );
  }

  const hasBottomActionBlock =
    Boolean(actionError) ||
    (!pendingDraw && isMyTurn && isPlaying) ||
    (pendingDraw && isMyTurn && isPlaying) ||
    showOffTurnHandReorderDock;

  /** Fixed dock height during play so Draw / Take / Submit never shifts the hand. */
  const reserveBottomActionDock = isPlaying && !isFinished;

  const canClearTransient =
    draftNewMelds.length > 0 ||
    draftTableAdds.length > 0 ||
    discardPickMode ||
    Boolean(discardCardId) ||
    selectedIds.size > 0 ||
    Boolean(targetMeldId) ||
    optimisticReturnedJokers.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden">
      <Ov2SeatStrip
        count={4}
        labels={seatLabels}
        activeIndex={turnSeatIndex}
        selfIndex={selfSeatIndex}
        awaitedIndex={turnSeatIndex}
        eliminatedIndices={eliminatedSeatIndices}
        seatScoreLines={seatStripMeta.scoreLines}
        seatOpenedFlags={seatStripMeta.openedFlags}
        seatNearElim={seatStripMeta.nearFlags}
      />
      {onLeaveToLobby ? (
        <div className="flex shrink-0 justify-end px-0.5 pt-0.5">
          <button
            type="button"
            disabled={leaveToLobbyBusy}
            onClick={() => void onLeaveToLobby()}
            className="text-[10px] font-semibold text-red-200/95 underline decoration-red-400/50 disabled:opacity-45"
          >
            {leaveToLobbyBusy ? "Leaving…" : "Leave table"}
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-teal-500/20 bg-teal-950/10">
          <Ov2Rummy51TableMelds
            framed={false}
            tableMeldsRaw={snapshot.tableMelds || []}
            draftNewMelds={draftNewMelds}
            draftTableAdds={draftTableAdds}
            selectedTargetMeldId={targetMeldId}
            onSelectTargetMeld={setTargetMeldId}
            disabled={busy || !isMyTurn || !isPlaying}
          />
          <div className="pointer-events-none absolute bottom-1 right-1 z-20 flex flex-row items-end gap-1 sm:bottom-1.5 sm:right-1.5 sm:gap-1.5">
            {pendingDraw === "discard" && isMyTurn && isPlaying ? (
              <DiscardUndoIconButton disabled={busy} onClick={() => void onUndoDiscardDraw()} />
            ) : null}
            <div className="pointer-events-none shrink-0">
              <SideDiscardStrip
                card={discardTopCard}
                empty={discardCount <= 0}
                highlight={Boolean(isMyTurn && isPlaying && pendingDraw && pickedDiscardCard)}
              />
            </div>
          </div>
        </div>

        {roundBanner ? (
          <div className="shrink-0 rounded border border-cyan-500/30 bg-cyan-950/25 px-1.5 py-0.5 text-[8px] text-cyan-50">
            <p className="font-semibold text-cyan-200">{roundBanner.title}</p>
            <ul className="mt-0.5 max-h-12 space-y-0 overflow-y-auto text-[7px] leading-tight text-cyan-100/85 [scrollbar-width:thin]">
              {roundBanner.lines.map((l, i) => (
                <li key={`rb-${i}`}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {isFinished ? (
          <div className="shrink-0 rounded-md border border-amber-500/35 bg-amber-950/25 p-1.5 text-[9px] text-amber-50">
            <p className="font-bold text-amber-200">Match finished</p>
            <p className="mt-0.5 text-[8px] text-amber-100/85">
              Winner: {snapshot.winnerName || snapshot.winnerParticipantKey?.slice(0, 10) || "—"}
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
              <button
                type="button"
                disabled={busy || !selfKey}
                onClick={() => void requestRematch()}
                className="min-h-[38px] rounded-md border border-amber-500/40 bg-amber-950/35 py-1 text-[10px] font-semibold text-amber-100 disabled:opacity-40"
              >
                Request rematch ({rematchCounts.ready}/{rematchCounts.eligible})
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancelRematch()}
                className="min-h-[38px] rounded-md border border-white/20 bg-white/10 py-1 text-[10px] font-semibold text-zinc-200 disabled:opacity-40"
              >
                Cancel rematch
              </button>
              <button
                type="button"
                disabled={busy || !isHost}
                onClick={() => void startNextMatch()}
                className="min-h-[38px] rounded-md border border-emerald-500/40 bg-emerald-950/35 py-1 text-[10px] font-semibold text-emerald-100 disabled:opacity-40"
              >
                Start next match (host)
              </button>
            </div>
            <p className="mt-1 text-[7px] text-zinc-500">Next match returns the room to stake commit in the lobby.</p>
          </div>
        ) : null}

        <div className="shrink-0 truncate pb-0.5 text-[7px] text-zinc-600 sm:text-[8px]">
          {hasOpenedThisHand ? <span className="text-emerald-600/90">Opened · </span> : null}
          Opp:{" "}
          {Object.entries(snapshot.hands || {})
            .filter(([pk]) => pk !== selfKey)
            .map(([pk, h]) => `${(snapshot.playerState?.[pk]?.displayName || pk).toString().slice(0, 6)} (${Array.isArray(h) ? h.length : 0})`)
            .join(" · ") || "—"}
        </div>
      </div>

      <div className="flex shrink-0 flex-col overflow-hidden rounded-md border border-violet-500/35 bg-zinc-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <Ov2Rummy51Hand
          embedded
          handRaw={handRawForUi}
          manualOrder={manualOrder}
          setManualOrder={setManualOrder}
          drawHighlightIds={drawHighlightIds}
          selectedIds={selectedIds}
          discardCardId={discardCardId}
          discardPickMode={discardPickMode}
          sortMode={sortMode}
          disabled={busy || !isMyTurn || !isPlaying}
          selectionDisabled={busy || !isPlaying}
          sortDisabled={busy || !isPlaying}
          targetMeldId={targetMeldId}
          onNewMeldFromSelection={onNewMeldFromSelection}
          onAddSelectionToTarget={onAddSelectionToTarget}
          onClearMeldDraft={resetTurnUi}
          clearDisabled={busy || !canClearTransient}
          hasMeldDraft={draftNewMelds.length > 0 || draftTableAdds.length > 0}
          onToggleCardId={onToggleCardId}
          onSortModeChange={onSortModeFromUser}
          defaultOrderUsesSort={handOrderBasis === "sorted"}
          onEnterDiscardPickMode={() => {
            setDiscardPickMode(true);
            setSelectedIds(new Set());
          }}
        />

        {reserveBottomActionDock ? (
          <div
            className="flex min-h-[2.5rem] shrink-0 flex-col justify-center space-y-0.5 border-t border-violet-500/25 bg-black/50 px-1 py-px sm:min-h-[2.625rem] sm:px-1.5 sm:py-0.5"
            aria-hidden={!hasBottomActionBlock}
          >
            {hasBottomActionBlock ? (
              <>
                {actionError ? <p className="text-center text-[9px] leading-tight text-red-300">{actionError}</p> : null}
                {!pendingDraw && isMyTurn && isPlaying ? (
                  <div className="flex min-h-[32px] w-full items-stretch gap-1.5 sm:min-h-[34px]">
                    <button
                      type="button"
                      disabled={busy || (snapshot.stockCount ?? 0) <= 0}
                      onClick={() => void drawStock()}
                      className="flex min-h-[32px] min-w-0 flex-1 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-950/40 px-1 py-0.5 text-[9px] font-bold leading-none text-emerald-100 disabled:opacity-40 sm:min-h-[34px] sm:px-1.5 sm:text-[10px]"
                    >
                      Draw stock
                    </button>
                    <div className={HAND_NUDGE_SLOT}>
                      {dockHandReorder ? (
                        <HandReorderNudgeButtons
                          leftDisabled={singleSelIdxDock <= 0}
                          rightDisabled={
                            singleSelIdxDock < 0 || singleSelIdxDock >= orderIdsForDockNudge.length - 1
                          }
                          onNudge={nudgeHandOrder}
                        />
                      ) : (
                        <HandNudgeSlotSpacer />
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy || (snapshot.discardCount ?? 0) <= 0}
                      onClick={() => void drawDiscard()}
                      className="flex min-h-[32px] min-w-0 flex-1 items-center justify-center rounded-md border border-sky-500/40 bg-sky-950/40 px-1 py-0.5 text-[9px] font-bold leading-none text-sky-100 disabled:opacity-40 sm:min-h-[34px] sm:px-1.5 sm:text-[10px]"
                    >
                      Take discard
                    </button>
                  </div>
                ) : null}

                {showOffTurnHandReorderDock ? (
                  <div className="flex min-h-[32px] items-stretch justify-center gap-1 sm:min-h-[34px]">
                    <HandReorderNudgeButtons
                      leftDisabled={singleSelIdxDock <= 0}
                      rightDisabled={
                        singleSelIdxDock < 0 || singleSelIdxDock >= orderIdsForDockNudge.length - 1
                      }
                      onNudge={nudgeHandOrder}
                    />
                  </div>
                ) : null}

                {pendingDraw && isMyTurn && isPlaying ? (
                  <div className="flex flex-col gap-0">
                    {validationMessage ? (
                      <p className="px-0.5 pb-0.5 text-[8px] leading-snug text-amber-200/95 sm:text-[9px]">{validationMessage}</p>
                    ) : null}
                    <div className="flex min-h-[32px] flex-row items-stretch gap-1 sm:min-h-[34px]">
                      <div className={HAND_NUDGE_SLOT}>
                        {dockHandReorder ? (
                          <HandReorderNudgeButtons
                            leftDisabled={singleSelIdxDock <= 0}
                            rightDisabled={
                              singleSelIdxDock < 0 || singleSelIdxDock >= orderIdsForDockNudge.length - 1
                            }
                            onNudge={nudgeHandOrder}
                          />
                        ) : (
                          <HandNudgeSlotSpacer />
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busy || !canSubmitTurn}
                        onClick={() => void onSubmitTurn()}
                        className="min-h-[32px] min-w-0 flex-1 rounded-md border border-violet-500/50 bg-violet-950/45 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-violet-100 disabled:opacity-40 sm:min-h-[34px] sm:text-xs"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
