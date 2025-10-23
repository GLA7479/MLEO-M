// lib/pokerEngine.js
import { supabaseMP as supabase } from "./supabaseClients";

/** ========= Deck ========= */
export const SUITS = ["h","d","c","s"];
export const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];

export function newDeck(){
  const d=[]; for(const s of SUITS) for(const r of RANKS) d.push(r+s);
  for(let i=d.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}

/** ========= Hand evaluator (7 cards → best 5) =========
 * מחזיר { cat, ranks } כש-cat:
 * 8=StraightFlush, 7=FourKind, 6=FullHouse, 5=Flush, 4=Straight,
 * 3=Trips, 2=TwoPair, 1=Pair, 0=HighCard
 */
const RANK_VAL = Object.fromEntries(RANKS.map((r,i)=>[r,i]));
function sortByRankDesc(cards){ return [...cards].sort((a,b)=>RANK_VAL[b[0]]-RANK_VAL[a[0]]); }

function isStraight(vals){
  // vals: אינדקסים בסדר יורד, ייחודיים
  const uniq = [...new Set(vals)];
  // A-2-3-4-5
  if (uniq.includes(12) && uniq.includes(3) && uniq.includes(2) && uniq.includes(1) && uniq.includes(0)) return 3;
  let run=1, best=-1;
  for(let i=0;i<uniq.length-1;i++){
    if(uniq[i]-1===uniq[i+1]){ run++; if(run>=5) best = uniq[i+1]; } else run=1;
  }
  return best; // -1 אם אין סטרייט
}

function evaluate5(cards){
  // סינון קלפים לא חוקיים (undefined/null/"")
  const clean = (cards || []).filter(c => typeof c === "string" && c.length >= 2);
  if (clean.length < 5) return { cat: -1, ranks: [] }; // לא מספיק קלפים להשוואה
  const ranks = clean.map(c=>c[0]);
  const suits = clean.map(c=>c[1]);
  const byRank = {}; ranks.forEach(r=>byRank[r]=(byRank[r]||0)+1);
  const bySuit = {}; suits.forEach(s=>bySuit[s]=(bySuit[s]||0)+1);
  const isFlush = Object.values(bySuit).some(c=>c===5);
  const vals = sortByRankDesc(clean).map(c=>RANK_VAL[c[0]]);
  const straightLow = isStraight(vals);
  const isStr = straightLow!==-1;

  const rankGroups = Object.entries(byRank).sort((a,b)=>{
    if(b[1]!==a[1]) return b[1]-a[1];
    return RANK_VAL[b[0]]-RANK_VAL[a[0]];
  });

  // Straight Flush
  if(isFlush && isStr) return { cat:8, ranks:[Math.max(...vals)] };
  // Four of a Kind
  if(rankGroups[0][1]===4){
    const four = RANK_VAL[rankGroups[0][0]];
    const kicker = Math.max(...vals.filter(v=>v!==four));
    return { cat:7, ranks:[four,kicker] };
  }
  // Full House
  if(rankGroups[0][1]===3 && rankGroups[1]?.[1]===2){
    const trips = RANK_VAL[rankGroups[0][0]], pair = RANK_VAL[rankGroups[1][0]];
    return { cat:6, ranks:[trips,pair] };
  }
  // Flush
  if(isFlush) return { cat:5, ranks:vals };
  // Straight
  if(isStr) return { cat:4, ranks:[Math.max(...vals)] };
  // Trips
  if(rankGroups[0][1]===3){
    const t = RANK_VAL[rankGroups[0][0]];
    const kick = sortByRankDesc(cards.filter(c=>c[0]!==rankGroups[0][0])).slice(0,2).map(c=>RANK_VAL[c[0]]);
    return { cat:3, ranks:[t, ...kick] };
  }
  // Two Pair
  if(rankGroups[0][1]===2 && rankGroups[1]?.[1]===2){
    const p1 = RANK_VAL[rankGroups[0][0]], p2 = RANK_VAL[rankGroups[1][0]];
    const kick = Math.max(...vals.filter(v=>v!==p1 && v!==p2));
    return { cat:2, ranks:[Math.max(p1,p2), Math.min(p1,p2), kick] };
  }
  // One Pair
  if(rankGroups[0][1]===2){
    const p = RANK_VAL[rankGroups[0][0]];
    const kick = sortByRankDesc(cards.filter(c=>c[0]!==rankGroups[0][0])).slice(0,3).map(c=>RANK_VAL[c[0]]);
    return { cat:1, ranks:[p, ...kick] };
  }
  // High Card
  return { cat:0, ranks:vals };
}

function compareRanks(a,b){
  for(let i=0;i<Math.max(a.length,b.length);i++){
    const av = a[i]??-1, bv = b[i]??-1;
    if(av!==bv) return av-bv;
  }
  return 0;
}

function best5of7(seven){
  let best = { cat:-1, ranks:[], cards:[] };
  const src = (seven || []).filter(c => typeof c === "string" && c.length >= 2);
  if (src.length < 5) return best;
  const n = src.length; // ייתכן <7 אם יש חסרים
  for(let a=0;a<n;a++)
  for(let b=a+1;b<n;b++){
    const five = Array.from({length:n})
      .map((_,i)=>i)
      .filter(i=>i!==a && i!==b)
      .slice(0,5)       // בדיוק 5
      .map(i=>src[i]);
    const s = evaluate5(five);
    if(s.cat>best.cat || (s.cat===best.cat && compareRanks(s.ranks,best.ranks)>0)){
      best={...s,cards:five};
    }
  }
  return best;
}

/** ========= Winners ========= */
export function determineWinnersAuto(players, board){
  const contenders = (players||[]).filter(p=>!p.folded);
  if (contenders.length === 0) return [];                 // אין מתחרים
  if (contenders.length === 1) return [contenders[0].seat_index]; // מנצח יחיד מיידי
  const scored = contenders.map(p=>{
    const seven = [...(p.hole_cards||[]), ...(board||[])];
    const best = best5of7(seven); // ייתן cat=-1 אם אין מספיק קלפים חוקיים
    return { seat: p.seat_index, cat: best.cat, ranks: best.ranks };
  });
  // אם אי אפשר להעריך לאף אחד (cat=-1) — הכריזו על כולם כזוכים (split) או תנו את הקופה לפי הכללים שלכם
  if (scored.every(s => s.cat < 0)) return contenders.map(c=>c.seat_index);
  scored.sort((A,B)=> (B.cat-A.cat) || compareRanks(B.ranks, A.ranks));
  const top = scored[0];
  return scored.filter(s=> s.cat===top.cat && compareRanks(s.ranks, top.ranks)===0).map(s=>s.seat);
}

/** ========= Side Pots (פשוט ומספיק ל-MVP) =========
 * בונה פוטים לפי רמות תרומה (total_bet) ומחלק לפי מנצחים בכל פוט.
 */
export function buildSidePots(players){
  const active = players.filter(p=>p.total_bet>0);
  if (active.length===0) return [];
  const caps = active.map(p=>p.total_bet).sort((a,b)=>a-b);
  const uniqueCaps = [...new Set(caps)];
  const pots = [];
  let prevCap = 0;
  for(const cap of uniqueCaps){
    const contributors = players.filter(p=>!p.folded && p.total_bet>=cap).map(p=>p.seat_index);
    const amountPer = cap - prevCap;
    if (amountPer>0 && contributors.length>0){
      const chunk = amountPer * contributors.length;
      pots.push({ amount: chunk, eligible: contributors });
    }
    prevCap = cap;
  }
  return pots; // [{amount, eligible:[...]}]
}

export async function settlePots(sessionId, board, players){
  const pots = buildSidePots(players);
  for(const pot of pots){
    const eligible = players.filter(p=> pot.eligible.includes(p.seat_index));
    const winners = determineWinnersAuto(eligible, board);
    const share = Math.floor(pot.amount / winners.length);
    for(const seat of winners){
      const { data: pl } = await supabase
        .from("poker_players")
        .select("*").eq("session_id", sessionId).eq("seat_index", seat).maybeSingle();
      if(pl){
        await supabase.from("poker_players").update({ stack_live: pl.stack_live + share }).eq("id", pl.id);
      }
    }
  }
  await supabase.from("poker_sessions").update({ pot_total: 0, winners: [] }).eq("id", sessionId);
}

/** ========= Bet/call/raise helpers ========= */
export function maxStreetBet(players){
  return Math.max(0, ...players.map(p=>p.bet_street||0));
}
export function canCheck(me, players){
  return (me.bet_street||0) === maxStreetBet(players);
}
export function minRaiseAmount(players, bb){
  // מינימום רייז = לפחות BB (אפשר לשפר לגודל ההעלאה האחרונה בהמשך)
  return bb;
}