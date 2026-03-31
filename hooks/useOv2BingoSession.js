import { useCallback, useEffect, useMemo, useState } from "react";
import { applyMark, buildDeck, generateCard, makeEmptyMarks } from "../lib/online-v2/bingo/ov2BingoEngine";
import { OV2_BINGO_SESSION_KIND, resolveOv2BingoSessionKind } from "../lib/online-v2/bingo/ov2BingoSessionAdapter";

/**
 * OV2 Bingo — **preview session only** (no server caller/deck/claims).
 * All “Call” / marks are client-local until `ov2BingoSessionAdapter` is wired to RPC.
 *
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2BingoSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;

  const sessionKind = useMemo(() => resolveOv2BingoSessionKind(), []);

  const seed = `${roomId ?? "no-room"}:ov2-bingo-preview`;
  const card = useMemo(() => generateCard(seed), [seed]);
  const deck = useMemo(() => buildDeck(seed), [seed]);

  const [marks, setMarks] = useState(() => makeEmptyMarks());
  const [called, setCalled] = useState([]);
  const [deckPos, setDeckPos] = useState(0);

  useEffect(() => {
    setMarks(makeEmptyMarks());
    setCalled([]);
    setDeckPos(0);
  }, [seed]);

  const calledSet = useMemo(() => new Set(called), [called]);

  const phaseLine = useMemo(() => {
    const base =
      sessionKind === OV2_BINGO_SESSION_KIND.PREVIEW_ONLY
        ? "Preview only — no live caller or validated claims."
        : "Preview.";
    if (roomId) {
      return `${base} Room context is for shell/navigation only; round state is still local.`;
    }
    return `${base} Deterministic card from preview seed.`;
  }, [roomId, sessionKind]);

  const callNextPreviewNumber = useCallback(() => {
    if (deckPos >= deck.length) return;
    const n = deck[deckPos];
    setDeckPos(p => p + 1);
    setCalled(c => [...c, n]);
  }, [deck, deckPos]);

  const onCellClick = useCallback(
    n => {
      const { marks: next, changed } = applyMark(card, marks, n);
      if (changed) setMarks(next);
    },
    [card, marks]
  );

  const lastCalled = called.length ? called[called.length - 1] : null;

  return {
    vm: {
      sessionKind,
      card,
      marks,
      called,
      calledSet,
      lastCalled,
      phaseLine,
      deckRemaining: Math.max(0, deck.length - deckPos),
    },
    callNextPreviewNumber,
    onCellClick,
  };
}
