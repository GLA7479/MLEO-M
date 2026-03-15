// lib/holdem-eval.js
import { evaluateHand as eval5 } from "poker-evaluator";

/**
 * ממיר קלף כמו "As" / "Td" לפורמט הספרייה: ['A','s'] וכו'.
 */
function parseCard(cs) {
  const r = cs[0].toUpperCase();
  const s = cs[1].toLowerCase();
  if (!"23456789TJQKA".includes(r) || !"shdc".includes(s)) {
    throw new Error(`Bad card: ${cs}`);
  }
  return r + s; // הפורמט שהספריה אוהבת
}

/**
 * מעריך 7 קלפים (2 ביד + 5 לוח) ומחזיר ציון מספרי להשוואה.
 * הספרייה מקבלת 5 קלפים; לכן נריץ את כל קומבינציות 5 מתוך 7 וניקח מקסימום.
 * מחזיר:
 *  - score: מספר להשוואה (גבוה יותר טוב)
 *  - best5: המערך המנצח של 5 קלפים (לוגים/דיבאג)
 */
export function eval7(hole2, board5) {
  if (!Array.isArray(hole2) || hole2.length !== 2) throw new Error("hole must be 2 cards");
  if (!Array.isArray(board5) || board5.length !== 5) throw new Error("board must be 5 cards");

  const cards = [...hole2.map(parseCard), ...board5.map(parseCard)];
  // כל 5 מתוך 7
  const idx = [0,1,2,3,4,5,6];
  let best = { score: -Infinity, best5: [] };

  // קומבינציות 5 מתוך 7 – 21 תת־קבוצות
  for (let a=0;a<7;a++) for (let b=a+1;b<7;b++) {
    const five = idx.filter(i => i!==a && i!==b).map(i => cards[i]);
    const r = eval5(five); // {handType, handRank, handName, value}
    const score = r.value; // ערך גבוה יותר = חזק יותר
    if (score > best.score) best = { score, best5: five };
  }
  return best;
}

/** השוואה נוחה בין שתי תוצאות eval7 */
export function compareScores(a, b) {
  return (a.score === b.score) ? 0 : (a.score > b.score ? 1 : -1);
}

