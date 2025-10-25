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
        
        // עדכן את ה-vault אם זה השחקן המקומי
        if (typeof window !== 'undefined' && pl.client_id) {
          const rushData = JSON.parse(localStorage.getItem("mleo_rush_core_v4") || "{}");
          const currentVault = rushData.vault || 0;
          const newVault = currentVault + share;
          rushData.vault = newVault;
          localStorage.setItem("mleo_rush_core_v4", JSON.stringify(rushData));
          
          // עדכן גם את ה-state בדף הראשי אם יש callback
          if (window.updateVaultCallback) {
            window.updateVaultCallback(newVault);
          }
        }
      }
    }
  }
  await supabase.from("poker_sessions").update({ pot_total: 0 }).eq("id", sessionId);
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

/** ========= Take Chips ========= */
export async function takeChips(sessionId, seatIndex, amount, action) {
  const { data: pl } = await supabase.from("poker_players")
    .select("*").eq("session_id", sessionId).eq("seat_index", seatIndex).maybeSingle();
  if(!pl) return;
  
  const pay = Math.min(amount, pl.stack_live);
  
  // עדכן את השחקן
  await supabase.from("poker_players").update({
    stack_live: pl.stack_live - pay,
    bet_street: (pl.bet_street || 0) + pay,
    total_bet: (pl.total_bet || 0) + pay
  }).eq("id", pl.id);
  
  // עדכן את הפוט
  const { data: session } = await supabase.from("poker_sessions").select("pot_total").eq("id", sessionId).single();
  if (session) {
    await supabase.from("poker_sessions").update({
      pot_total: session.pot_total + pay
    }).eq("id", sessionId);
  }
}

/** ========= Hand flow helpers ========= */
function nextOccupied(players, seatIdx) {
  const seats = players.map(p=>p.seat_index).sort((a,b)=>a-b);
  if (seatIdx === null || seatIdx === undefined) return seats[0];
  const higher = seats.find(s => s > seatIdx);
  return (higher !== undefined) ? higher : seats[0];
}

function nextStage(stage){
  if(stage==='preflop') return 'flop';
  if(stage==='flop') return 'turn';
  if(stage==='turn') return 'river';
  if(stage==='river') return 'showdown';
  return 'lobby';
}

function nextToActAfterDealer(players, dealerSeat){
  // UTG is next seat after BB; but here we just reuse nextOccupied logic twice after dealer
  const sbSeat = nextOccupied(players, dealerSeat);
  const bbSeat = nextOccupied(players, sbSeat);
  return nextOccupied(players, bbSeat);
}

/** ========= Start hand (post blinds, set to_call) ========= */
export async function startHand(sessionId) {
  // session + seated players (מסודרים לפי seat_index)
  const { data: ses } = await supabase
    .from('poker_sessions').select('*').eq('id', sessionId).single();
  const { data: seated } = await supabase
    .from('poker_players')
    .select('id,seat_index,folded,bet_street,stack_live,hole_cards,client_id')
    .eq('session_id', sessionId)
    .not('seat_index','is',null)
    .order('seat_index',{ascending:true});

  if (!ses || !seated || seated.length < 2) return { ok:false, reason:'need 2 seated' };

  // מי הדילר וסדר הסמולים
  const dealer = (typeof ses.dealer_seat === 'number')
    ? nextOccupied(seated, ses.dealer_seat)
    : seated[0].seat_index;
  const sbSeat = nextOccupied(seated, dealer);
  const bbSeat = nextOccupied(seated, sbSeat);
  const utg    = nextOccupied(seated, bbSeat);

  const sb = Number(ses.sb || 10);
  const bb = Number(ses.bb || 20);

  // === Build deck and deal hole cards ===
  let deck = newDeck();
  // איפוס לכולם לפני חלוקה
  await supabase.from('poker_players')
    .update({ bet_street: 0, acted: false, folded: false, all_in: false, hole_cards: [] })
    .eq('session_id', sessionId);

  // חלוקת 2 קלפים לכל יושב (לפי סדר מושבים)
  for (const p of seated) {
    const c1 = deck.pop();
    const c2 = deck.pop();
    await supabase.from('poker_players')
      .update({ hole_cards: [c1, c2] })
      .eq('id', p.id);
  }

  // גביית בליינדים
  await takeChips(sessionId, sbSeat, sb, 'sb');
  await takeChips(sessionId, bbSeat, bb, 'bb');
  await supabase.from('poker_players').update({ bet_street: sb }).eq('session_id', sessionId).eq('seat_index', sbSeat);
  await supabase.from('poker_players').update({ bet_street: bb }).eq('session_id', sessionId).eq('seat_index', bbSeat);

  // Heads-Up: התור הראשון בפרה-פלופ הוא ה-SB (utg), והוא צריך להשלים BB-SB
  const needForUTG = Math.max(0, bb - sb);
  await supabase.from('poker_sessions').update({
    stage: 'preflop',
    dealer_seat: dealer,
    current_turn: utg,               // זה ה-SB ביד ראשונה HU
    to_call: needForUTG,             // ✅ עכשיו CALL של SB משלים בדיוק את ההפרש
    pot_total: Number(ses.pot_total||0) + sb + bb,
    board: [],
    deck_remaining: deck,
    min_bet: bb,
    turn_deadline: new Date(Date.now()+20_000).toISOString(),
    last_raiser: bbSeat
  }).eq('id', sessionId);

  return { ok:true };
}

/** ========= Advance street (only if settled) ========= */
export async function advanceStreet(sessionId) {
  const { data: ses } = await supabase
    .from('poker_sessions').select('*').eq('id', sessionId).single();
  const { data: players } = await supabase
    .from('poker_players').select('*').eq('session_id', sessionId);

  // פעילים (לא קיפלו)
  const active = players.filter(p => !p.folded && p.seat_index !== null);
  const maxBet = Math.max(0, ...active.map(p => Number(p.bet_street||0)));
  const unsettled = active.some(p => Number(p.bet_street||0) !== maxBet);

  // אם יש למישהו חוב/אי-שוויון – לא זזים
  if (Number(ses.to_call||0) > 0 || unsettled) return { ok:false, reason:'not settled' };

  // קביעת הרחוב הבא
  const order = ['preflop','flop','turn','river','showdown'];
  const idx = Math.max(0, order.indexOf(ses.stage));
  let next = order[idx+1] || 'showdown';

  let board = Array.isArray(ses.board) ? [...ses.board] : [];
  let deck  = Array.isArray(ses.deck_remaining) ? [...ses.deck_remaining] : [];

  if (ses.stage === 'preflop') { if (deck.length < 3) return {ok:false, reason:'no deck'}; board.push(deck.pop(), deck.pop(), deck.pop()); }
  else if (ses.stage === 'flop') { if (deck.length < 1) return {ok:false, reason:'no deck'}; board.push(deck.pop()); }
  else if (ses.stage === 'turn') { if (deck.length < 1) return {ok:false, reason:'no deck'}; board.push(deck.pop()); }
  else if (ses.stage === 'river') { next = 'showdown'; }

  if (next === 'showdown') {
    await settlePots(sessionId, board, players);
    await supabase.from('poker_sessions').update({
      stage: 'showdown', board, deck_remaining: deck, current_turn: null, to_call: 0, turn_deadline: null
    }).eq('id', sessionId);
    return { ok:true };
  }

  const firstToAct = nextOccupied(active, ses.dealer_seat);
  await supabase.from('poker_players')
    .update({ bet_street: 0, acted: false })
    .eq('session_id', sessionId);

  await supabase.from('poker_sessions')
    .update({
      stage: next,
      current_turn: firstToAct,
      to_call: 0,
      board,
      deck_remaining: deck,
      turn_deadline: new Date(Date.now()+20_000).toISOString()
    })
    .eq('id', sessionId);

  return { ok:true };
}