import { useCallback, useEffect, useMemo, useState } from "react";
import { applyMark, buildDeck, generateCard, makeEmptyMarks } from "../lib/online-v2/bingo/ov2BingoEngine";

/**
 * OV2 Bingo session hook — deterministic card/deck; marks UI local until RPC validates claims.
 *
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2BingoSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;

  const seed = `${roomId ?? "no-room"}:ov2-bingo`;
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
    if (roomId) {
      return "Room context loaded — caller/deck authority will move server-side; Call (demo) is local only.";
    }
    return "No room — deterministic card from seed; demo calls are local only.";
  }, [roomId]);

  const callNextDemo = useCallback(() => {
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
      card,
      marks,
      called,
      calledSet,
      lastCalled,
      phaseLine,
      deckRemaining: Math.max(0, deck.length - deckPos),
    },
    callNextDemo,
    onCellClick,
  };
}
