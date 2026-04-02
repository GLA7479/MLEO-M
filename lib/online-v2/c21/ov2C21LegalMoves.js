/**
 * Client-side legal action hints for OV2 21 Challenge (must mirror ov2C21MultiEngine apply rules).
 * Server remains authoritative; this only disables misleading buttons.
 */

import { canSplitByRank, isDealerUpAce } from "../../solo-v2/challenge21HandMath";

/**
 * @param {{ phase: string; engine: object | null | undefined; participantKey: string }} args
 */
export function getOv2C21LegalFlags({ phase, engine, participantKey }) {
  const out = {
    hit: false,
    stand: false,
    double: false,
    split: false,
    surrender: false,
    insuranceYes: false,
    insuranceNo: false,
  };
  if (!engine || !participantKey) return out;

  const shoeLen = Array.isArray(engine.shoe) ? engine.shoe.length : 999;
  const shoeOk = shoeLen > 0;

  if (phase === "insurance") {
    const seat = engine.seats?.find(s => s.participantKey === participantKey);
    if (seat?.inRound && Math.floor(Number(seat.roundBet) || 0) > 0 && seat.insuranceChoice == null) {
      out.insuranceYes = true;
      out.insuranceNo = true;
    }
    return out;
  }

  if (phase !== "acting") return out;
  const ct = engine.currentTurn;
  if (!ct) return out;
  const seat = engine.seats?.[ct.seatIndex];
  if (!seat || seat.participantKey !== participantKey) return out;
  const hi = ct.handIndex;
  const m = seat.handMeta?.[hi];
  const cards = seat.hands?.[hi] || [];
  if (!m || m.stood || m.busted) return out;

  out.stand = true;
  out.hit = shoeOk && !(m.splitAces && cards.length >= 2);
  out.double = Boolean(shoeOk && m.firstAction && cards.length === 2 && !m.splitAces);
  out.split = Boolean(
    shoeOk &&
      !seat.splitUsed &&
      seat.hands?.length === 1 &&
      cards.length === 2 &&
      canSplitByRank(cards[0], cards[1]),
  );
  out.surrender = Boolean(
    m.firstAction &&
      cards.length === 2 &&
      !m.doubled &&
      !isDealerUpAce(engine.dealerHand || []),
  );

  return out;
}
