/**
 * Client-side legal action hints for OV2 21 Challenge (must mirror ov2C21MultiEngine apply rules).
 * Server remains authoritative; this only disables misleading buttons.
 */

import { canSplitByRank, isDealerUpAce, splitRankKey } from "../../solo-v2/challenge21HandMath";

function insuranceStakeForUi(roundBet) {
  const w = Math.max(100, Math.floor(Number(roundBet) || 0));
  return Math.floor(w / 2);
}

/**
 * @param {{ phase: string; engine: object | null | undefined; participantKey: string; vaultBalance?: number | null }} args
 * `vaultBalance` optional client mirror; server still rejects insufficient funds.
 */
export function getOv2C21LegalFlags({ phase, engine, participantKey, vaultBalance = null }) {
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
      if (vaultBalance != null && Number.isFinite(Number(vaultBalance))) {
        const vb = Math.max(0, Math.floor(Number(vaultBalance)));
        const ins = insuranceStakeForUi(seat.roundBet);
        out.insuranceYes = out.insuranceYes && ins > 0 && vb >= ins;
      }
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
  const pairOfAces =
    cards.length === 2 &&
    splitRankKey(cards[0]) === "A" &&
    splitRankKey(cards[1]) === "A";
  out.split = Boolean(
    shoeOk &&
      (seat.hands?.length || 0) < 4 &&
      m.firstAction &&
      cards.length === 2 &&
      canSplitByRank(cards[0], cards[1]) &&
      !(pairOfAces && seat.didSplitAces),
  );
  out.surrender = Boolean(
    m.firstAction &&
      cards.length === 2 &&
      !m.doubled &&
      !isDealerUpAce(engine.dealerHand || []),
  );

  if (vaultBalance != null && Number.isFinite(Number(vaultBalance))) {
    const vb = Math.max(0, Math.floor(Number(vaultBalance)));
    const addDouble = Math.max(0, Math.floor(Number(seat.handStakes?.[hi]) || 0));
    if (addDouble > 0) {
      out.double = Boolean(out.double && vb >= addDouble);
    }
    if (out.split) {
      const addSplit = Math.max(0, Math.floor(Number(seat.handStakes?.[hi]) || 0));
      out.split = Boolean(addSplit > 0 && vb >= addSplit);
    }
  }

  return out;
}
