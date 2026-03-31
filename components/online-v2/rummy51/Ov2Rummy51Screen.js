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
import Ov2Rummy51MeldComposer from "./Ov2Rummy51MeldComposer";
import Ov2Rummy51TableMelds from "./Ov2Rummy51TableMelds";

/**
 * @typedef {import("../../../lib/online-v2/rummy51/ov2Rummy51Engine").Rummy51Card} Rummy51Card
 */

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

  const scoreboardRows = useMemo(() => {
    if (!snapshot?.playerState) return [];
    return Object.entries(snapshot.playerState).map(([pk, ps]) => {
      if (!ps || typeof ps !== "object") return null;
      const name = ps.displayName != null ? String(ps.displayName) : pk.slice(0, 6);
      const total = ps.scoreTotal != null ? Number(ps.scoreTotal) : 0;
      const opened = Boolean(ps.hasEverOpened);
      const out = Boolean(ps.isEliminated);
      const near = !out && total >= RUMMY51_ELIMINATION_SCORE - 80;
      return { pk, name, total, opened, out, near, you: pk === selfKey };
    }).filter(Boolean);
  }, [snapshot?.playerState, selfKey]);

  const discardTopLabel = useMemo(() => {
    const t = snapshot?.discardTop;
    if (!t || typeof t !== "object") return "—";
    try {
      return getCardDisplayLabel(deserializeCard(t));
    } catch {
      return "—";
    }
  }, [snapshot?.discardTop]);

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
    const pending = snapshot?.pendingDrawSource != null ? String(snapshot.pendingDrawSource) : "";
    if (selfKey && pk === selfKey && !pending && prevTurnPkRef.current !== pk) {
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
    setDraftNewMelds(prev => [...prev, [...selectedCards]]);
    setSelectedIds(new Set());
  }, [selectedCards]);

  const onAddSelectionToTarget = useCallback(() => {
    if (!targetMeldId || selectedCards.length < 1) return;
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
    if (!after.some(c => c.id === discardCardId)) return "Discard must stay in hand until submit (after melds).";

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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <Ov2SeatStrip
        count={4}
        labels={seatLabels}
        activeIndex={turnSeatIndex}
        selfIndex={selfSeatIndex}
        awaitedIndex={turnSeatIndex}
        eliminatedIndices={eliminatedSeatIndices}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] text-zinc-200">
        <span>
          Turn:{" "}
          <strong className="text-white">
            {snapshot.turnParticipantKey === selfKey ? "You" : snapshot.turnParticipantKey?.slice(0, 8) ?? "—"}
          </strong>
        </span>
        <span className="text-zinc-600">·</span>
        <span>Stock {snapshot.stockCount ?? 0}</span>
        <span className="text-zinc-600">·</span>
        <span>Discard {discardTopLabel}</span>
        <span className="text-zinc-600">·</span>
        <span>Rnd {snapshot.roundNumber ?? 1}</span>
        {pendingDraw ? (
          <>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-300">Drew {pendingDraw}</span>
          </>
        ) : null}
      </div>

      {roundBanner ? (
        <div className="shrink-0 rounded-lg border border-cyan-500/35 bg-cyan-950/30 px-2 py-2 text-[11px] text-cyan-50">
          <p className="font-bold text-cyan-200">{roundBanner.title}</p>
          <ul className="mt-1 space-y-0.5 text-[10px] text-cyan-100/90">
            {roundBanner.lines.map((l, i) => (
              <li key={`rb-${i}`}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid max-h-[88px] shrink-0 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-white/10 bg-zinc-950/40 p-1.5 sm:max-h-[100px] sm:grid-cols-4">
        {scoreboardRows.map(row => {
          if (!row) return null;
          return (
            <div
              key={row.pk}
              className={`rounded border px-1.5 py-1 text-[9px] leading-tight ${
                row.out
                  ? "border-zinc-700 bg-zinc-900/50 text-zinc-500 line-through decoration-zinc-500"
                  : row.near
                    ? "border-amber-500/50 bg-amber-950/35 text-amber-100"
                    : "border-white/10 bg-white/5 text-zinc-200"
              }`}
            >
              <div className="truncate font-semibold text-white">
                {row.name}
                {row.you ? " · you" : ""}
              </div>
              <div className="mt-0.5 font-mono text-[10px]">
                {row.total} / {RUMMY51_ELIMINATION_SCORE}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {row.opened ? <span className="rounded bg-emerald-900/60 px-1 text-[8px] text-emerald-100">opened</span> : null}
                {row.out ? <span className="rounded bg-zinc-800 px-1 text-[8px] text-zinc-300">out</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <Ov2Rummy51TableMelds
          tableMeldsRaw={snapshot.tableMelds || []}
          selectedTargetMeldId={targetMeldId}
          onSelectTargetMeld={setTargetMeldId}
          disabled={busy || !isMyTurn || !isPlaying}
        />
      </div>

      <Ov2Rummy51Hand
        handRaw={myHandRaw}
        selectedIds={selectedIds}
        discardCardId={discardCardId}
        discardPickMode={discardPickMode}
        sortMode={sortMode}
        disabled={busy || !isMyTurn || !isPlaying}
        onToggleCardId={onToggleCardId}
        onSortModeChange={setSortMode}
        onEnterDiscardPickMode={() => {
          setDiscardPickMode(true);
          setSelectedIds(new Set());
        }}
      />

      {isMyTurn && isPlaying ? (
        <Ov2Rummy51MeldComposer
          hasEverOpened={hasEverOpened}
          draftNewMelds={draftNewMelds}
          draftTableAdds={draftTableAdds}
          selectedIds={selectedIds}
          targetMeldId={targetMeldId}
          onNewMeldFromSelection={onNewMeldFromSelection}
          onAddSelectionToTarget={onAddSelectionToTarget}
          onRemoveDraftMeld={i => setDraftNewMelds(prev => prev.filter((_, j) => j !== i))}
          onRemoveTableAdd={i => setDraftTableAdds(prev => prev.filter((_, j) => j !== i))}
          onClearDraft={() => {
            setDraftNewMelds([]);
            setDraftTableAdds([]);
          }}
          disabled={busy}
        />
      ) : null}

      <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 pt-2">
        {actionError ? <p className="text-center text-[11px] text-red-300">{actionError}</p> : null}
        {!pendingDraw && isMyTurn && isPlaying ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (snapshot.stockCount ?? 0) <= 0}
              onClick={() => void drawStock()}
              className="min-h-[44px] flex-1 rounded-lg border border-emerald-500/40 bg-emerald-950/35 py-2 text-xs font-bold text-emerald-100 disabled:opacity-40"
            >
              Draw stock
            </button>
            <button
              type="button"
              disabled={busy || (snapshot.discardCount ?? 0) <= 0}
              onClick={() => void drawDiscard()}
              className="min-h-[44px] flex-1 rounded-lg border border-sky-500/40 bg-sky-950/35 py-2 text-xs font-bold text-sky-100 disabled:opacity-40"
            >
              Take discard
            </button>
          </div>
        ) : null}

        {pendingDraw && isMyTurn && isPlaying ? (
          <>
            {validationMessage ? <p className="text-center text-[10px] text-amber-200/90">{validationMessage}</p> : null}
            <button
              type="button"
              disabled={busy || !canSubmitTurn}
              onClick={() => void onSubmitTurn()}
              className="min-h-[48px] w-full rounded-lg border border-violet-500/45 bg-violet-950/40 py-2.5 text-sm font-bold text-violet-100 disabled:opacity-40"
            >
              Submit turn
            </button>
          </>
        ) : null}
      </div>

      {isFinished ? (
        <div className="shrink-0 rounded-lg border border-amber-500/35 bg-amber-950/25 p-2 text-[11px] text-amber-50">
          <p className="font-bold text-amber-200">Match finished</p>
          <p className="mt-1 text-[10px] text-amber-100/85">
            Winner: {snapshot.winnerName || snapshot.winnerParticipantKey?.slice(0, 10) || "—"}
          </p>
          <div className="mt-2 flex flex-col gap-1">
            <button
              type="button"
              disabled={busy || !selfKey}
              onClick={() => void requestRematch()}
              className="min-h-[44px] rounded-md border border-amber-500/40 bg-amber-950/35 py-2 text-xs font-semibold text-amber-100 disabled:opacity-40"
            >
              Request rematch ({rematchCounts.ready}/{rematchCounts.eligible})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancelRematch()}
              className="min-h-[44px] rounded-md border border-white/20 bg-white/10 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-40"
            >
              Cancel rematch
            </button>
            <button
              type="button"
              disabled={busy || !isHost}
              onClick={() => void startNextMatch()}
              className="min-h-[44px] rounded-md border border-emerald-500/40 bg-emerald-950/35 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-40"
            >
              Start next match (host)
            </button>
          </div>
          <p className="mt-2 text-[9px] text-zinc-500">Next match returns the room to stake commit in the lobby.</p>
        </div>
      ) : null}

      <div className="shrink-0 text-[9px] text-zinc-600">
        {hasOpenedThisHand ? <span className="text-emerald-600/90">Opened this hand · </span> : null}
        Opponents:{" "}
        {Object.entries(snapshot.hands || {})
          .filter(([pk]) => pk !== selfKey)
          .map(([pk, h]) => `${(snapshot.playerState?.[pk]?.displayName || pk).toString().slice(0, 6)} (${Array.isArray(h) ? h.length : 0})`)
          .join(" · ") || "—"}
      </div>
    </div>
  );
}
