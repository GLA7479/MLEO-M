"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOv2Rummy51Session } from "../../../hooks/useOv2Rummy51Session";
import {
  deserializeCard,
  getCardDisplayLabel,
  RUMMY51_ELIMINATION_SCORE,
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

/**
 * Discard pile top — floated above the table (absolute in parent); does not shrink meld layout.
 * @param {{ card: Rummy51Card|null, empty: boolean, highlight: boolean }} props
 */
function SideDiscardStrip({ card, empty, highlight }) {
  const red = Boolean(card && !card.isJoker && (card.suit === "H" || card.suit === "D"));
  return (
    <div
      className={`pointer-events-none flex w-max shrink-0 select-none flex-col items-center gap-0.5 rounded-md bg-zinc-950/85 px-0.5 py-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.45)] ring-1 ring-white/10 ${
        highlight ? "ring-amber-400/50 drop-shadow-[0_0_10px_rgba(245,158,11,0.35)]" : ""
      }`}
    >
      <p className="w-full truncate text-center text-[5px] font-bold uppercase leading-none text-amber-200/75 sm:text-[6px]">
        Discard
      </p>
      {card ? (
        <div
          className={`relative flex h-[3.35rem] w-[2.45rem] flex-col rounded-md border py-0.5 shadow-md sm:h-[3.5rem] sm:w-[2.55rem] ${
            highlight
              ? "border-amber-400/65 bg-gradient-to-b from-amber-900/45 to-zinc-950"
              : "border-amber-500/45 bg-gradient-to-b from-zinc-600 to-zinc-950"
          }`}
        >
          <div
            className={`px-0.5 text-left leading-none ${card.isJoker ? "text-amber-200" : red ? "text-rose-300" : "text-zinc-100"}`}
          >
            <div className="text-[10px] font-extrabold leading-none">{card.isJoker ? "J" : MID_RANK[card.rank] ?? "?"}</div>
            <div className="text-[11px] font-bold leading-none">{card.isJoker ? "★" : card.suit ? MID_SUIT[card.suit] ?? "" : ""}</div>
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
        <div className="flex h-[3.35rem] w-[2.45rem] flex-col items-center justify-center rounded-md border border-dashed border-zinc-600/55 bg-zinc-950/90 sm:h-[3.5rem] sm:w-[2.55rem]">
          <span className="px-px text-center text-[7px] font-semibold leading-tight text-zinc-500">{empty ? "∅" : "—"}</span>
        </div>
      )}
    </div>
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null }} props
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
  /** @type {Rummy51Card[][]} */
  const [draftNewMelds, setDraftNewMelds] = useState([]);
  /** @type {{ meldId: string, cards: Rummy51Card[] }[]} */
  const [draftTableAdds, setDraftTableAdds] = useState([]);
  const [targetMeldId, setTargetMeldId] = useState(/** @type {string|null} */ (null));
  /** @type {{ title: string, lines: string[] }|null} */
  const [roundBanner, setRoundBanner] = useState(null);

  const scoreSnapRef = useRef(/** @type {Record<string, number>} */ ({}));
  const roundRef = useRef(0);

  const roomProductId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.product_game_id != null
      ? String(contextInput.room.product_game_id)
      : null;

  const isRummyRoom = roomProductId === OV2_RUMMY51_PRODUCT_GAME_ID;

  const myHandRaw = useMemo(() => {
    if (!snapshot?.hands || !selfKey) return [];
    const h = snapshot.hands[selfKey];
    return Array.isArray(h) ? h : [];
  }, [snapshot?.hands, selfKey]);

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
    setDraftTableAdds(prev => {
      const idx = prev.findIndex(x => x.meldId === targetMeldId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { meldId: targetMeldId, cards: [...copy[idx].cards, ...selectedCards] };
        return copy;
      }
      return [...prev, { meldId: targetMeldId, cards: [...selectedCards] }];
    });
    setSelectedIds(new Set());
    setDiscardCardId(prev => (prev && played.has(prev) ? null : prev));
  }, [targetMeldId, selectedCards]);

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

  const canSubmitTurn = useMemo(() => {
    if (!isMyTurn || !isPlaying || !pendingDraw || !discardCardId) return false;
    const discardCard = handById.get(discardCardId);
    if (!discardCard) return false;

    const playedIds = new Set();
    for (const meld of draftNewMelds) for (const c of meld) playedIds.add(c.id);
    for (const row of draftTableAdds) for (const c of row.cards) playedIds.add(c.id);

    let after = handCards.filter(c => !playedIds.has(c.id));
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
    const after = handCards.filter(c => !playedIds.has(c.id));
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
    const r = await submitTurn({
      new_melds: newMeldsPayload,
      table_additions: tableAddsPayload,
      discard_card_id: discardCardId,
    });
    if (r.ok) resetTurnUi();
  }, [canSubmitTurn, discardCardId, draftNewMelds, draftTableAdds, submitTurn, resetTurnUi, setActionError]);

  const previewOnly = !contextInput?.room?.id || !isRummyRoom;

  if (previewOnly) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
        <p className="text-sm text-zinc-400">Join a Rummy 51 room and open <span className="font-mono text-zinc-300">?room=</span> for live play.</p>
        <p className="text-[11px] text-zinc-600">Local practice board is not implemented — use the lobby to start a table.</p>
      </div>
    );
  }

  if (!hasActiveSession || !snapshot) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
        <p className="text-sm text-zinc-400">No active Rummy 51 session for this room yet.</p>
        <p className="text-[11px] text-zinc-500">The host opens the match from the lobby when the room is active and stakes are committed.</p>
      </div>
    );
  }

  const hasBottomActionBlock =
    Boolean(actionError) ||
    (!pendingDraw && isMyTurn && isPlaying) ||
    (pendingDraw && isMyTurn && isPlaying);

  /** Fixed dock height during play so Draw / Take / Submit never shifts the hand. */
  const reserveBottomActionDock = isPlaying && !isFinished;

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

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-teal-500/20 bg-teal-950/10">
          <Ov2Rummy51TableMelds
            framed={false}
            tableMeldsRaw={snapshot.tableMelds || []}
            selectedTargetMeldId={targetMeldId}
            onSelectTargetMeld={setTargetMeldId}
            disabled={busy || !isMyTurn || !isPlaying}
          />
          <div className="pointer-events-none absolute bottom-1 right-1 z-20 sm:bottom-1.5 sm:right-1.5">
            <SideDiscardStrip
              card={discardTopCard}
              empty={discardCount <= 0}
              highlight={Boolean(isMyTurn && isPlaying && pendingDraw && pickedDiscardCard)}
            />
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
          handRaw={myHandRaw}
          selectedIds={selectedIds}
          discardCardId={discardCardId}
          discardPickMode={discardPickMode}
          sortMode={sortMode}
          disabled={busy || !isMyTurn || !isPlaying}
          sortDisabled={busy}
          targetMeldId={targetMeldId}
          onNewMeldFromSelection={onNewMeldFromSelection}
          onAddSelectionToTarget={onAddSelectionToTarget}
          onClearMeldDraft={() => {
            setDraftNewMelds([]);
            setDraftTableAdds([]);
          }}
          hasMeldDraft={draftNewMelds.length > 0 || draftTableAdds.length > 0}
          onToggleCardId={onToggleCardId}
          onSortModeChange={setSortMode}
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
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy || (snapshot.stockCount ?? 0) <= 0}
                      onClick={() => void drawStock()}
                      className="min-h-[32px] flex-1 rounded-md border border-emerald-500/40 bg-emerald-950/40 py-0.5 text-[10px] font-bold text-emerald-100 disabled:opacity-40 sm:min-h-[34px] sm:text-xs"
                    >
                      Draw stock
                    </button>
                    <button
                      type="button"
                      disabled={busy || (snapshot.discardCount ?? 0) <= 0}
                      onClick={() => void drawDiscard()}
                      className="min-h-[32px] flex-1 rounded-md border border-sky-500/40 bg-sky-950/40 py-0.5 text-[10px] font-bold text-sky-100 disabled:opacity-40 sm:min-h-[34px] sm:text-xs"
                    >
                      Take discard
                    </button>
                  </div>
                ) : null}

                {pendingDraw && isMyTurn && isPlaying ? (
                  <div className="flex flex-col gap-0">
                    {validationMessage ? (
                      <p className="px-0.5 pb-0.5 text-[8px] leading-snug text-amber-200/95 sm:text-[9px]">{validationMessage}</p>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || !canSubmitTurn}
                      onClick={() => void onSubmitTurn()}
                      className="min-h-[32px] w-full rounded-md border border-violet-500/50 bg-violet-950/45 py-0.5 text-[11px] font-bold text-violet-100 disabled:opacity-40 sm:min-h-[34px] sm:text-sm"
                    >
                      Submit turn
                    </button>
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
