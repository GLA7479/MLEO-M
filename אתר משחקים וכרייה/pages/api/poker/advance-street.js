// pages/api/poker/advance-street.js
export const config = { runtime: "nodejs" };
import { q } from "../../../lib/db";
import { eval7, compareScores } from "../../../lib/holdem-eval";

// עוזר לשלוף n קלפים מהדק
function draw(deck, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(deck.pop());
  return out;
}

async function collectStreetToTotals(hand_id) {
  // נרכז הימורי רחוב לתוך contrib_total ונאפס bet_street/acted_street
  const rows = await q(`
    SELECT seat_index, bet_street
    FROM poker.poker_hand_players
    WHERE hand_id=$1
  `, [hand_id]);

  let sumStreet = 0;
  for (const r of rows.rows) {
    const bet = Number(r.bet_street || 0);
    sumStreet += bet;
    if (bet > 0) {
      await q(`
        UPDATE poker.poker_hand_players
        SET contrib_total = contrib_total + $3
        WHERE hand_id=$1 AND seat_index=$2
      `, [hand_id, r.seat_index, bet]);
    }
  }

  if (sumStreet > 0) {
    await q(`UPDATE poker.poker_hands SET pot_total = pot_total + $2 WHERE id=$1`, [hand_id, sumStreet]);
  }
  await q(`UPDATE poker.poker_hand_players SET bet_street=0, acted_street=false WHERE hand_id=$1`, [hand_id]);

  // reset מינרייז למדדים של הרחוב הבא
  await q(`UPDATE poker.poker_hands SET last_raise_to=0, last_raise_size=0 WHERE id=$1`, [hand_id]);

  return sumStreet;
}

/**
 * בניית קופות ו־Side Pots מתוך contrib_total של השחקנים החיים (לא folded).
 * @returns {Array<{side_idx:number, amount:number, members:number[]}>}
 */
function buildSidePotsAlive(alive) {
  // alive: [{seat_index, contrib_total}]
  // שלבי תקרה מסודרים (מספרים ייחודיים >0), לפי הסכום שכל שחקן תרם
  const levels = [...new Set(alive.map(a => Number(a.contrib_total || 0)).filter(v => v > 0))].sort((a, b) => a - b);
  if (levels.length === 0) return [];

  const pots = [];
  let prev = 0;
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const eligible = alive.filter(a => Number(a.contrib_total || 0) >= level).map(a => a.seat_index);
    const layer = level - prev;
    const amount = layer * eligible.length;
    pots.push({ side_idx: i, amount, members: eligible });
    prev = level;
  }
  return pots;
}

/** חלוקת קופות בין מנצחים */
function splitAmongWinners(total, winnersCount) {
  const base = Math.floor(total / winnersCount);
  let remainder = total - base * winnersCount;
  const parts = Array.from({ length: winnersCount }, () => base);
  // Chip האחרון: נעניק לרשמים הראשונים (או לפי סדר הניצחון)
  for (let i = 0; i < parts.length && remainder > 0; i++, remainder--) parts[i] += 1;
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { hand_id } = req.body || {};
  if (!hand_id) return res.status(400).json({ error: "bad_request", details: "Missing hand_id" });

  try {
    await q("BEGIN");

    const H = await q(`
      SELECT id, table_id, stage, dealer_seat, current_turn, board, deck_remaining
      FROM poker.poker_hands
      WHERE id=$1
      FOR UPDATE
    `, [hand_id]);
    if (!H.rowCount) { await q("ROLLBACK"); return res.status(404).json({ error: "hand_not_found" }); }
    const hand = H.rows[0];
    let deck = Array.isArray(hand.deck_remaining) ? [...hand.deck_remaining] : [];
    let board = Array.isArray(hand.board) ? [...hand.board] : [];

    // צבירה מרחוב נוכחי -> pot_total/contrib_total + reset per-street
    await collectStreetToTotals(hand_id);

    if (hand.stage === "preflop") {
      board = board.concat(draw(deck, 3)); // FLOP
      
      // Clear turn/deadline first to avoid ghost ticks
      await q(`UPDATE poker.poker_hands SET current_turn=NULL, turn_deadline=NULL WHERE id=$1`, [hand_id]);
      
      const nextTurn = await firstToActAfterDealer(hand_id, hand);
      await q(`
        UPDATE poker.poker_hands
        SET stage='flop', board=$2, deck_remaining=$3, current_turn=$4, turn_deadline=now()+interval '30 seconds',
            last_raise_to=0, last_raise_size=0
        WHERE id=$1
      `, [hand_id, board, deck, nextTurn]);

      await q("COMMIT");
      return res.json({ ok: true, stage: "flop", board, current_turn: nextTurn });
    }

    if (hand.stage === "flop") {
      board = board.concat(draw(deck, 1)); // TURN
      
      // Clear turn/deadline first to avoid ghost ticks
      await q(`UPDATE poker.poker_hands SET current_turn=NULL, turn_deadline=NULL WHERE id=$1`, [hand_id]);
      
      const nextTurn = await firstToActAfterDealer(hand_id, hand);
      await q(`
        UPDATE poker.poker_hands
        SET stage='turn', board=$2, deck_remaining=$3, current_turn=$4, turn_deadline=now()+interval '30 seconds',
            last_raise_to=0, last_raise_size=0
        WHERE id=$1
      `, [hand_id, board, deck, nextTurn]);

      await q("COMMIT");
      return res.json({ ok: true, stage: "turn", board, current_turn: nextTurn });
    }

    if (hand.stage === "turn") {
      board = board.concat(draw(deck, 1)); // RIVER
      
      // Clear turn/deadline first to avoid ghost ticks
      await q(`UPDATE poker.poker_hands SET current_turn=NULL, turn_deadline=NULL WHERE id=$1`, [hand_id]);
      
      const nextTurn = await firstToActAfterDealer(hand_id, hand);
      await q(`
        UPDATE poker.poker_hands
        SET stage='river', board=$2, deck_remaining=$3, current_turn=$4, turn_deadline=now()+interval '30 seconds',
            last_raise_to=0, last_raise_size=0
        WHERE id=$1
      `, [hand_id, board, deck, nextTurn]);

      await q("COMMIT");
      return res.json({ ok: true, stage: "river", board, current_turn: nextTurn });
    }

    // === RIVER → SHOWDOWN ===
    // שלב 1: שלוף משתתפים חיים (לא folded), עם hole_cards ו־contrib_total
    const alive = await q(`
      SELECT php.seat_index, php.contrib_total, php.folded, php.all_in, ps.stack_live, php.hole_cards
      FROM poker.poker_hand_players php
      JOIN poker.poker_seats ps
        ON ps.table_id = $1 AND ps.seat_index = php.seat_index
      WHERE php.hand_id = $2 AND php.folded = false
      ORDER BY php.seat_index
    `, [hand.table_id, hand_id]);

    const contestants = alive.rows.map(r => ({
      seat: r.seat_index,
      contrib: Number(r.contrib_total || 0),
      hole: r.hole_cards,
    }));
    // אם נשאר שחקן יחיד חי – הוא זוכה בכל הקופה
    if (contestants.length <= 1) {
      const totalPot = await q(`SELECT pot_total FROM poker.poker_hands WHERE id=$1`, [hand_id]);
      const amount = Number(totalPot.rows[0]?.pot_total || 0);

      if (contestants.length === 1 && amount > 0) {
        await q(`UPDATE poker.poker_seats SET stack_live = stack_live + $3 WHERE table_id=$1 AND seat_index=$2`,
          [hand.table_id, contestants[0].seat, amount]);
        await q(`UPDATE poker.poker_hand_players SET win_amount=$3 WHERE hand_id=$1 AND seat_index=$2`,
          [hand_id, contestants[0].seat, amount]);
      }
      await q(`UPDATE poker.poker_hands SET stage='hand_end', ended_at=now() WHERE id=$1`, [hand_id]);
      await q("COMMIT");
      return res.json({ ok: true, stage: "hand_end", winners: contestants.length ? [contestants[0].seat] : [] });
    }

    // שלב 2: בנה קופות ו־Side Pots מתוך contrib_total
    const sidePots = buildSidePotsAlive(contestants);
    // ננקה קופות קודמות (אם היו) ונשחזר על בסיס contrib_total
    await q(`DELETE FROM poker.poker_pot_members WHERE pot_id IN (SELECT id FROM poker.poker_pots WHERE hand_id=$1)`, [hand_id]);
    await q(`DELETE FROM poker.poker_pots WHERE hand_id=$1`, [hand_id]);

    const potIds = [];
    for (const p of sidePots) {
      const ins = await q(`INSERT INTO poker.poker_pots(hand_id, side_idx, amount) VALUES ($1,$2,$3) RETURNING id`,
        [hand_id, p.side_idx, p.amount]);
      const pot_id = ins.rows[0].id;
      potIds.push({ pot_id, ...p });
      for (const seat of p.members) {
        await q(`INSERT INTO poker.poker_pot_members(pot_id, seat_index, eligible) VALUES ($1,$2,true)`,
          [pot_id, seat]);
      }
    }

    // שלב 3: הערכת ידיים לכולם
    const board5 = board; // ב־River יש 5 קלפים
    const scoresBySeat = new Map();
    for (const c of contestants) {
      const result = eval7(c.hole, board5);
      scoresBySeat.set(c.seat, result);
    }

    // שלב 4: קביעת זוכים לכל קופה וחלוקת סכומים
    const awardMap = new Map(); // seat -> סכום זכייה כולל
    for (const { pot_id, amount, members } of potIds) {
      if (amount <= 0 || members.length === 0) continue;

      // מצא את הסקור המקסימלי בין הזכאים
      let bestScore = -Infinity;
      for (const s of members) {
        const sc = scoresBySeat.get(s);
        if (!sc) continue;
        if (sc.score > bestScore) bestScore = sc.score;
      }
      const winners = members.filter(s => scoresBySeat.get(s)?.score === bestScore);
      const splits = splitAmongWinners(amount, winners.length);

      // עדכן מיפוי זכיות
      winners.forEach((seat, i) => {
        awardMap.set(seat, (awardMap.get(seat) || 0) + splits[i]);
      });
    }

    // שלב 5: כתיבה ל־DB – עדכון win_amount ו־stack_live
    for (const [seat, won] of awardMap.entries()) {
      await q(`UPDATE poker.poker_hand_players SET win_amount = COALESCE(win_amount,0) + $3 WHERE hand_id=$1 AND seat_index=$2`,
        [hand_id, seat, won]);
      await q(`UPDATE poker.poker_seats SET stack_live = stack_live + $3 WHERE table_id=$1 AND seat_index=$2`,
        [hand.table_id, seat, won]);
    }

    await q(`UPDATE poker.poker_hands SET stage='hand_end', ended_at=now() WHERE id=$1`, [hand_id]);
    await q("COMMIT");

    const winnersArr = [...awardMap.entries()].sort((a,b)=>b[1]-a[1]).map(([seat, amt]) => ({ seat, amount: amt }));
    return res.json({ ok: true, stage: "hand_end", winners: winnersArr });
  } catch (e) {
    await q("ROLLBACK").catch(()=>{});
    console.error("API /poker/advance-street error:", e);
    res.status(500).json({ error: "server_error", details: String(e.message || e) });
  }
}

/** מציאת הראשון שמשחק אחרי הדילר ברחוב החדש */
async function firstToActAfterDealer(hand_id, handRow) {
  const alive = await q(`
    SELECT php.seat_index
    FROM poker.poker_hand_players php
    JOIN poker.poker_seats ps ON ps.table_id=$1 AND ps.seat_index=php.seat_index
    WHERE php.hand_id=$2 AND php.folded=false
    ORDER BY php.seat_index
  `, [handRow.table_id, hand_id]);
  const order = alive.rows.map(r => r.seat_index);
  if (!order.length) return handRow.current_turn;
  const idx = order.findIndex(s => s > handRow.dealer_seat);
  return (idx >= 0 ? order[idx] : order[0]);
}
