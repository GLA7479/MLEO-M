import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyPreviewMark,
  buildDeck,
  computePreviewLineCompletion,
  generateCard,
  makeEmptyMarks,
} from "../lib/online-v2/bingo/ov2BingoEngine";
import { OV2_BINGO_PLAY_MODE, resolveOv2BingoPlayMode } from "../lib/online-v2/bingo/ov2BingoSessionAdapter";

function initialRoundState() {
  return {
    marks: makeEmptyMarks(),
    called: /** @type {number[]} */ ([]),
    deckPos: 0,
  };
}

/**
 * OV2 Bingo — React layer above `ov2BingoSessionAdapter` + `ov2BingoEngine`.
 *
 * - **PREVIEW_ONLY** / **ROOM_CONTEXT_NO_MATCH_YET:** same local preview round; marks and calls are
 *   not authoritative. Room mode is shell/context only until live snapshot + RPC exist.
 *
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2BingoSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;

  const playMode = useMemo(
    () => resolveOv2BingoPlayMode(baseContext ?? null),
    // Resolver only depends on `room.id`; avoid resetting when parent passes a fresh context object.
    [roomId]
  );

  const seed = `${roomId ?? "no-room"}:ov2-bingo-preview:v1`;
  const card = useMemo(() => generateCard(seed), [seed]);
  const deck = useMemo(() => buildDeck(seed), [seed]);

  const [round, setRound] = useState(initialRoundState);

  useEffect(() => {
    setRound(initialRoundState());
  }, [seed]);

  const { marks, called, deckPos } = round;
  const calledSet = useMemo(() => new Set(called), [called]);

  const linePreview = useMemo(() => computePreviewLineCompletion(marks), [marks]);

  const phaseLine = useMemo(() => {
    const core =
      "Local preview — not authoritative. Marks are UI-only; server will own calls & claims in a later phase.";
    if (playMode === OV2_BINGO_PLAY_MODE.ROOM_CONTEXT_NO_MATCH_YET) {
      return `Room context (no live Bingo match yet). ${core}`;
    }
    return core;
  }, [playMode]);

  const callNextPreviewNumber = useCallback(() => {
    setRound(prev => {
      if (prev.deckPos >= deck.length) return prev;
      const n = deck[prev.deckPos];
      return {
        marks: prev.marks,
        called: [...prev.called, n],
        deckPos: prev.deckPos + 1,
      };
    });
  }, [deck]);

  const resetPreviewRound = useCallback(() => {
    setRound(initialRoundState());
  }, []);

  const onCellClick = useCallback(
    n => {
      setRound(prev => {
        const { marks: next, changed } = applyPreviewMark(card, prev.marks, n, new Set(prev.called));
        if (!changed) return prev;
        return { ...prev, marks: next };
      });
    },
    [card]
  );

  const lastCalled = called.length ? called[called.length - 1] : null;

  return {
    vm: {
      playMode,
      card,
      marks,
      called,
      calledSet,
      lastCalled,
      phaseLine,
      deckRemaining: Math.max(0, deck.length - deckPos),
      deckTotal: deck.length,
      /** UI-only row/full detection for preview testing */
      previewLine: linePreview,
    },
    callNextPreviewNumber,
    resetPreviewRound,
    onCellClick,
  };
}
