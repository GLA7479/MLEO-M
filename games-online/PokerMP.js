// games-online/PokerMP.js
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  maxStreetBet, minRaiseAmount,
  startHand as engineStartHand, advanceStreet as engineAdvanceStreet
} from "../lib/pokerEngine";

const TURN_SECONDS = Number(process.env.NEXT_PUBLIC_POKER_TURN_SECONDS||20);
const MIN_PLAYERS_TO_START = 2;     // start when 2 are seated

// ===== Vault from props (Arcade Online) - single source of truth =====
function getVaultFromProps(vaultProp) {
  return Math.max(0, Number(vaultProp || 0));
}
function setVaultFromProps(setVaultBoth, nextAmount) {
  if (typeof setVaultBoth === 'function') {
    setVaultBoth(Math.max(0, Math.floor(Number(nextAmount || 0))));
  }
}

// ===== Fixed Tiers (client mapping) =====
const FIXED_TIERS = {
  '1K':    { min_buyin: 1_000,        sb: 10,       bb: 20 },
  '10K':   { min_buyin: 10_000,       sb: 100,      bb: 200 },
  '100K':  { min_buyin: 100_000,      sb: 1_000,    bb: 2_000 },
  '1M':    { min_buyin: 1_000_000,    sb: 10_000,   bb: 20_000 },
  '10M':   { min_buyin: 10_000_000,   sb: 100_000,  bb: 200_000 },
  '100M':  { min_buyin: 100_000_000,  sb: 1_000_000,bb: 2_000_000 },
};

// returns true if I am seated and it's my turn on an acting street
function isMyTurn(ses, meRow) {
  if (!ses || !meRow) return false;
  const actingStreet = ['preflop','flop','turn','river'].includes(ses.stage);
  return actingStreet && meRow.seat_index !== null && ses.current_turn === meRow.seat_index;
}

// display-oriented guard for action buttons
function canActNow(ses, meRow) {
  if (!ses || !meRow) return false;
  if (meRow.seat_index === null) return false;
  // no actions in lobby/showdown
  if (ses.stage === 'lobby' || ses.stage === 'showdown') return false;
  return isMyTurn(ses, meRow);
}

// Helper functions
function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

function activePlayers(pls){
  return (pls||[]).filter(p => !p.folded && p.seat_index !== null);
}
function canCheckNow(ses, pls, seatIndex){
  if (!ses) return false;
  if (!['preflop','flop','turn','river'].includes(ses.stage)) return false;
  const me = (pls||[]).find(p => p.seat_index === seatIndex);
  if (!me) return false;
  const maxBet = maxStreetBet(pls); // מהמנוע
  return Number(ses.to_call || 0) === 0 && Number(me.bet_street || 0) === maxBet;
}

function Card({ code, hidden = false, isDealing = false }) {
  if (!code) return null;
  
  const r = code.slice(0,-1), s = code.slice(-1);
  const suitIcon = s==="h"?"♥":s==="d"?"♦":s==="c"?"♣":"♠";
  const suitClass = (s==="h"||s==="d") ? "text-red-400" : "text-blue-300";
  
  // Dynamic sizing based on game state
  const cardSize = isDealing ? "w-12 h-16 mx-1 text-sm" : "w-10 h-14 mx-1 text-xs";
  
  if (hidden) {
    return (
      <div className={`inline-flex items-center justify-center border-2 border-white/30 rounded-lg ${cardSize} font-bold bg-gradient-to-b from-gray-600 to-gray-800 text-white`}>
        <span className="leading-none">?</span>
      </div>
    );
  }
  
  return (
    <div className={`inline-flex items-center justify-center border-2 border-white/30 rounded-lg ${cardSize} font-bold bg-gradient-to-b from-white/10 to-white/5 shadow-lg ${suitClass}`}>
      <span className="leading-none">{r}{suitIcon}</span>
    </div>
  );
}

function HandView({ hand, hidden = false, isDealing = false }) {
  const h = hand || [];
  return (
    <div className="flex items-center justify-center overflow-x-auto whitespace-nowrap no-scrollbar py-0.5 gap-0.5">
      {h.length===0 ? <span className="text-white/60 text-sm">—</span> : h.map((c,i)=><Card key={i} code={c} hidden={hidden} isDealing={isDealing}/>)}
    </div>
  );
}

function TurnCountdown({ deadline }) {
  const [left, setLeft] = useState(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now())/1000)));
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now())/1000)));
    }, 100);
    return () => clearInterval(t);
  }, [deadline]);
  return <div className="text-xs text-emerald-300 font-bold">⏱️ {left}s</div>;
}

export default function PokerMP({ roomId, playerName, vault, setVaultBoth, tierCode = '10K' }) {

  // הגדר callback לעדכון vault
  useEffect(() => {
    window.updateVaultCallback = setVaultBoth;
    return () => {
      delete window.updateVaultCallback;
    };
  }, [setVaultBoth]);
  const name = playerName || "Guest";
  const seats = 6;

  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [betInput, setBetInput] = useState(0);
  const [msg, setMsg] = useState("");
  const tickRef = useRef(null);
  const startingRef = useRef(false);
  const advancingRef = useRef(false);

  // ===== Realtime session =====
  useEffect(() => {
    if(!roomId) return;
    const ch = supabase.channel("poker_sessions:"+roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"poker_sessions",filter:`room_id=eq.${roomId}`},
        async ()=>{
          const { data } = await supabase.from("poker_sessions").select("*").eq("room_id", roomId).maybeSingle();
          setSes(data||null);
        })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (st)=>{
        if(st==="SUBSCRIBED"){
          const { data } = await supabase.from("poker_sessions").select("*").eq("room_id", roomId).maybeSingle();
          setSes(data||null);
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });
    return ()=> ch.unsubscribe();
  },[roomId]);

  // ===== Realtime players =====
  useEffect(() => {
    if(!ses) return;
    const ch = supabase.channel("poker_players:"+ses.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"poker_players",filter:`session_id=eq.${ses.id}`},
        async ()=>{
          const { data } = await supabase.from("poker_players").select("*").eq("session_id", ses.id).order("seat_index");
          setPlayers(data||[]);
        })
      .subscribe(async (st)=>{
        if(st==="SUBSCRIBED"){
          const { data } = await supabase.from("poker_players").select("*").eq("session_id", ses.id).order("seat_index");
          setPlayers(data||[]);
        }
      });
    return ()=> ch.unsubscribe();
  },[ses?.id]);

  // ===== Autopilot =====
  const isLeader = useMemo(() => {
    if (!roomMembers.length || !name) return false;
    const sorted = [...roomMembers].sort((a, b) => a.player_name.localeCompare(b.player_name));
    return sorted[0]?.player_name === name;
  }, [roomMembers, name]);

  const clientId = useMemo(() => getClientId(), []);

  async function autopilot() {
    if (!isLeader) return;
    const seatedCount = players.filter(p => p.seat_index !== null).length;

    // כשיש 2 שחקנים יושבים — התחל משחק
    if (seatedCount >= MIN_PLAYERS_TO_START && (!ses || ses.stage === 'lobby')) {
      await startHand();
      return;
    }


    // אחרי showdown — המתן קצת ואז התחל יד חדשה
    if (ses && ses.stage === 'showdown') {
      await new Promise(r => setTimeout(r, 1200));
      if (players.filter(p => p.seat_index !== null).length >= MIN_PLAYERS_TO_START) {
        await startHand();
      }
      return;
    }
  }

  // ===== Autopilot heartbeat =====
  useEffect(() => {
    const interval = setInterval(autopilot, 1000);
    return () => clearInterval(interval);
  }, [isLeader, players.length, ses]);

  // ===== Timer tick (client-side auto action) =====
  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(async ()=>{
      if(!ses) return;
      if(!ses.turn_deadline || !ses.current_turn?.toString().length) return;
      const deadline = new Date(ses.turn_deadline).getTime();
      if(Date.now() >= deadline){
        await autoAct();
      }
    }, 100);
    return ()=> clearInterval(tickRef.current);
  },[ses?.turn_deadline, ses?.current_turn, players]);

  // ===== Helpers =====
  const seatMap = useMemo(()=> new Map(players.map(p=>[p.seat_index, p])), [players]);
  const turnPlayer = ses?.current_turn!=null ? seatMap.get(ses.current_turn) : null;
  const bb = ses?.min_bet || 20;

  // בדיקה שהמשחק לא נגמר בטרם עת
  function canAct(player) {
    if (!player || player.folded || player.all_in) return false;
    if (ses?.current_turn !== player.seat_index) return false;
    if (ses?.stage === 'showdown') return false;
    return true;
  }

  // ===== Ensure Session exists for room =====
  async function ensureSession(roomId, tierCode = '10K') {
    // try get existing session for this room
    const { data: existing, error: selErr } = await supabase
      .from('poker_sessions')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (selErr) {
      console.warn('ensureSession select error', selErr);
    }
    if (existing && existing.length) return existing[0];

    // create fresh session in lobby per selected tier
    const T = FIXED_TIERS[tierCode] || FIXED_TIERS['10K'];
    const { data: created, error: insErr } = await supabase
      .from('poker_sessions')
      .insert({
        room_id: roomId,
        stage: 'lobby',
        tier_code: tierCode,
        min_buyin: T.min_buyin,
        sb: T.sb,
        bb: T.bb,
        pot_total: 0,
      })
      .select()
      .single();

    if (insErr) {
      console.error('ensureSession insert error', insErr);
      throw insErr;
    }
    return created;
  }

  // ===== Take Seat =====
  async function takeSeat(seatIndex) {
    if (!clientId) { setMsg("Client not recognized"); return; }

    // מייצר session אם אין - אבל לא משתמש ב-ses המקומי עד ש-הוא refreshing
    let session = ses;
    if (!session || !session.id) {
      session = await ensureSession(roomId, tierCode);
    }

    // במקביל, עדכן את ה-state המקומי
    setSes(session);

    // בדיקת יתרה - minimum buy-in
    const minBuyin = Math.max(Number(session?.min_buyin || 0), 1000);
    const want = Math.floor(Math.max(minBuyin, minBuyin));
    const currentVault = getVaultFromProps(vault);
    
    if (currentVault < want) { 
      setMsg(`Insufficient vault balance (min ${minBuyin} MLEO)`); 
      return; 
    }

    // האם כבר יש לי שורה בסשן?
    const { data: mine } = await supabase
      .from("poker_players")
      .select("id, seat_index, client_id")
      .eq("session_id", session.id)
      .eq("client_id", clientId)
      .maybeSingle();

    // בדוק תפוסת מושב היעד
    const { data: occ } = await supabase
      .from("poker_players")
      .select("id, client_id")
      .eq("session_id", session.id)
      .eq("seat_index", seatIndex)
      .maybeSingle();

    // אם תפוס ע"י אחר
    if (occ && occ.client_id && occ.client_id !== clientId) {
      setMsg("Seat is taken");
      return;
    }

    // מעבר מושב אם יש לי שורה קיימת
    if (mine && mine.seat_index !== seatIndex) {
      if (!occ) {
        await supabase.from("poker_players").update({ seat_index: seatIndex }).eq("id", mine.id);
        setMsg("");
        return;
      } else {
        setMsg("Seat is taken");
        return;
      }
    }

    // יצירה חדשה אם אין לי
    if (!mine) {
      const { error: upErr } = await supabase.from("poker_players").upsert({
        session_id: session.id,
        seat_index: seatIndex,
        player_name: name,
        client_id: clientId,
        stack_live: want,
        bet_street: 0,
        total_bet: 0,
        hole_cards: [],
        folded: false,
        all_in: false,
        acted: false
      }, {
        onConflict: 'session_id,seat_index',
        ignoreDuplicates: false
      });

      if (upErr) {
        setMsg(upErr.message?.includes('duplicate') ? "Seat is taken" : upErr.message);
        return;
      }

      // ניכוי מה-vault רק אחרי הצלחה
      setVaultFromProps(setVaultBoth, currentVault - want);
    }

    setMsg("");
  }

  function nextSeatAlive(startIdx){
    for(let k=1;k<=seats;k++){
      const idx = (startIdx + k) % seats;
      const p = seatMap.get(idx);
      if(p && !p.folded && p.stack_live>0) return idx;
    }
    return null;
  }

  async function updateTurnDeadline(){
    const dl = new Date(Date.now() + TURN_SECONDS*1000).toISOString();
    await supabase.from("poker_sessions").update({ turn_deadline: dl }).eq("id", ses.id);
  }

  function everyoneActedOrAllIn(){
    const alive = players.filter(p=>!p.folded && p.stack_live>0);
    const maxBet = maxStreetBet(players);
    if(alive.length<=1) return true;
    
    // בדוק אם כולם פעלו או ALL-IN או שההימור שלהם שווה למקסימום
    return alive.every(p => p.acted || p.all_in || (p.bet_street||0) === maxBet);
  }

  async function resetStreetActs(){
    await supabase.from("poker_players").update({ bet_street:0, acted:false })
      .eq("session_id", ses.id);
  }


  async function showdownAndSettle(){
    // אם נשאר אחד – הוא המנצח
    const alive = players.filter(p=>!p.folded);
    const winners = (alive.length === 1)
      ? [alive[0].seat_index]
      : determineWinnersAuto(players, ses.board||[]);
    await supabase.from("poker_sessions").update({ stage:"showdown", winners, current_turn:null, turn_deadline:null }).eq("id", ses.id);
    await settlePots(ses.id, ses.board||[], players);
  }

  // ===== Start / Next hand =====
  async function startHand(){
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      // ודא שיש Session (אם שחקן ראשון נכנס וזה עדיין 'null')
      let sessionId = ses?.id;
      if (!sessionId) {
        const { data } = await supabase.from("poker_sessions").select("id").eq("room_id", roomId).maybeSingle();
        sessionId = data?.id;
        if (!sessionId) {
          const created = await ensureSession(roomId, tierCode);
          sessionId = created.id;
          setSes(created);
        }
      }
      const result = await engineStartHand(sessionId);
      if (!result?.ok) {
        setMsg(result?.reason || "Failed to start hand");
        return;
      }
    } finally {
      startingRef.current = false;
    }
  }

  async function takeChips(sessionId, seatIndex, amount, action){
    const { data: pl } = await supabase.from("poker_players")
      .select("*").eq("session_id", sessionId).eq("seat_index", seatIndex).maybeSingle();
    if(!pl) return; // ⬅️ אל תגבה ממושב ריק
    
    const { data: pot } = await supabase.from("poker_pots").select("*").eq("session_id", sessionId).maybeSingle();

    const pay = Math.min(amount, pl.stack_live);
    
    // No vault charging during gameplay - only at seat entry
    
    await supabase.from("poker_players").update({
      stack_live: pl.stack_live - pay,
      bet_street: (pl.bet_street||0) + pay,
      total_bet:  (pl.total_bet||0)  + pay,
      acted: true,
      all_in: (pl.stack_live - pay)===0
    }).eq("id", pl.id);
    await supabase.from("poker_pots").update({ total: (pot?.total||0) + pay }).eq("session_id", sessionId);
    await supabase.from("poker_actions").insert({ session_id: sessionId, seat_index: seatIndex, action, amount: pay });
  }

  // ===== Quick Win Helper =====
  async function quickWin(sessionId, winnerSeat) {
    // 1) קרא מצב עדכני
    const { data: ses } = await supabase
      .from('poker_sessions')
      .select('id, pot_total')
      .eq('id', sessionId)
      .single();

    const { data: pot } = await supabase
      .from('poker_pots')
      .select('total')
      .eq('session_id', sessionId)
      .maybeSingle();

    const { data: players } = await supabase
      .from('poker_players')
      .select('seat_index, bet_street, stack_live, total_bet')
      .eq('session_id', sessionId);

    // 2) חשב סך הכל על השולחן (pot + כל ההימורים הנוכחיים)
    const streetSum = players.reduce((s,p)=> s + Number(p.bet_street||0), 0);
    const potTotal = Number(ses.pot_total||0) + Number(pot?.total||0);
    const totalPot = potTotal + streetSum;

    // 3) אפס הימור נוכחי אצל כולם (כדי שלא "יישאר על השולחן")
    await supabase
      .from('poker_players')
      .update({ bet_street: 0 })
      .eq('session_id', sessionId);

    // 4) העבר את כל הפוט למנצח
    const winner = players.find(p => p.seat_index === winnerSeat);
    if (winner) {
      await supabase
        .from('poker_players')
        .update({ stack_live: winner.stack_live + totalPot })
        .match({ session_id: sessionId, seat_index: winnerSeat });
    }

    // 5) נקה את מצב הסשן — אין תור, אין דדליין, הפוט ריק
    await supabase
      .from('poker_sessions')
      .update({
        pot_total: 0,
        stage: 'showdown',
        current_turn: null,
        turn_deadline: null,
      })
      .eq('id', sessionId);

    await supabase
      .from('poker_pots')
      .update({ total: 0 })
      .eq('session_id', sessionId);

    // 6) רשום לוג פעולה "win"
    await supabase.from('poker_actions').insert({
      session_id: sessionId,
      action: 'win',
      amount: totalPot,
      note: `winner seat=${winnerSeat} by fold`,
    });
  }

  // ===== Player Acts =====
  async function actFold(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    await supabase.from("poker_players").update({ folded:true, acted:true }).eq("id", turnPlayer.id);
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action:"fold" });
    
    // בדוק אם נשאר רק שחקן פעיל אחד (Heads-Up Fold)
    const { data: pls } = await supabase
      .from('poker_players').select('seat_index, folded, bet_street, stack_live, total_bet')
      .eq('session_id', ses.id);
    
    const alive = (pls || []).filter(p => !p.folded && p.seat_index !== null);
    if (alive.length === 1) {
      // ✅ Heads-Up: FOLD -> סגירה מיידית של היד והעברת כל הפוט למנצח
      const winnerSeat = alive[0].seat_index;
      await quickWin(ses.id, winnerSeat);
      return;
    }
    
    await afterActionAdvanceStrict();
  }

  async function actCheck(){
    // משוך מצב עדכני כדי לא ליפול על state ישן
    const { data: sesNow } = await supabase
      .from('poker_sessions').select('id,to_call').eq('id', ses.id).single();
    if (!isMyTurn(ses, myRow)) return;
    if (Number(sesNow.to_call || 0) > 0) return; // אסור check כשיש חוב

    await supabase.from('poker_players')
      .update({ acted: true })   // לא משנים bet_street ב-check
      .eq('id', myRow.id);

    await afterActionAdvanceStrict();
  }

  async function actCall(){
    if (!isMyTurn(ses, myRow)) return;
    // חישוב חוב אליי: max(bet_street) - שלי
    const { data: pls } = await supabase
      .from('poker_players').select('seat_index,folded,bet_street').eq('session_id', ses.id);
    const active = (pls||[]).filter(p => !p.folded && p.seat_index !== null);
    const maxBet = Math.max(0, ...active.map(p => Number(p.bet_street||0)));
    const mine = Number(myRow.bet_street || 0);
    const need = Math.max(0, maxBet - mine);
    if (need <= 0) return;

    await takeChips(ses.id, myRow.seat_index, need, 'call');
    // הסר את העדכון הכפול של bet_street - takeChips כבר עושה את זה
    await afterActionAdvanceStrict();
  }

  async function actBet(amount){
    if (!isMyTurn(ses, myRow)) return;
    const { data: sesNow } = await supabase
      .from('poker_sessions').select('to_call').eq('id', ses.id).single();
    if (Number(sesNow.to_call || 0) > 0) return; // כשיש חוב אסור "bet", רק call/raise

    const amt = Math.max(0, Math.floor(Number(amount || 0)));
    if (amt <= 0) return;

    await takeChips(ses.id, myRow.seat_index, amt, 'bet');
    await supabase.from('poker_sessions').update({ last_raiser: myRow.seat_index }).eq('id', ses.id);
    await afterActionAdvanceStrict();
  }

  async function actRaise(amount){
    if (!isMyTurn(ses, myRow)) return;
    const add = Math.max(0, Math.floor(Number(amount || 0)));
    if (add <= 0) return;

    await takeChips(ses.id, myRow.seat_index, add, 'raise');
    await supabase.from('poker_sessions').update({ last_raiser: myRow.seat_index }).eq('id', ses.id);
    await afterActionAdvanceStrict();
  }

  async function actAllIn(){
    if (!isMyTurn(ses, myRow)) return;
    const pay = Number(myRow.stack_live || 0);
    if (pay <= 0) return;

    await takeChips(ses.id, myRow.seat_index, pay, 'allin');
    // הסר את העדכון הכפול של bet_street - takeChips כבר עושה את זה

    await afterActionAdvanceStrict();
  }

  // ===== פונקציה מרכזית: לחשב שחקן תור־הבא ו־to_call =====
  async function afterActionAdvanceStrict() {
    // 1) קרא מצב עדכני מה-DB (לא להסתמך על state ישן)
    const { data: sesNow } = await supabase
      .from('poker_sessions').select('*').eq('id', ses.id).single();
    const { data: pls } = await supabase
      .from('poker_players').select('*').eq('session_id', ses.id);

    const active = (pls || []).filter(p => !p.folded && p.seat_index !== null);
    if (!active.length) return;

    // ✅ אם נשאר שחקן פעיל אחד – סגירה מיידית והעברת כל הכסף למנצח
    if (active.length === 1) {
      const winnerSeat = active[0].seat_index;
      // חשב את כל הכסף על השולחן: pot_total + סך bet_street של כולם
      const streetSum = (pls || []).reduce((s,p) => s + Number(p.bet_street||0), 0);
      const totalPot  = Number(sesNow.pot_total||0) + streetSum;

      // אפס הימור רחוב אצל כולם
      await supabase.from('poker_players')
        .update({ bet_street: 0 })
        .eq('session_id', ses.id);

      // הוסף את כל הקופה ל-stack_live של המנצח
      const winnerRow = (pls || []).find(p => p.seat_index === winnerSeat);
      if (winnerRow) {
        await supabase.from('poker_players')
          .update({ stack_live: Number(winnerRow.stack_live||0) + totalPot })
          .eq('id', winnerRow.id);
      }

      // אפס את הפוט וסיים יד
      await supabase.from('poker_sessions').update({
        pot_total: 0,
        stage: 'showdown',        // או 'lobby' אם אתה פותח יד הבאה מבחוץ
        current_turn: null,
        to_call: 0,
        turn_deadline: null
      }).eq('id', ses.id);

      // לוג זכייה
      await supabase.from('poker_actions').insert({
        session_id: ses.id,
        seat_index: winnerSeat,
        action: 'win',
        amount: totalPot,
        note: 'winner by fold'
      });
      return; // לא ממשיכים חישובי תור/רחוב
    }

    // 2) חשב הימור-שיא ברחוב
    const maxBet = Math.max(0, ...active.map(p => Number(p.bet_street || 0)));

    // 3) מצא מי הבא בתור: השחקן הפעיל הבא אחרי current_turn שעדיין לא השווה ל-maxBet
    const order = active.map(p => p.seat_index).sort((a, b) => a - b);
    const cur = Number(sesNow.current_turn);
    const ring = order.filter(s => s > cur).concat(order.filter(s => s <= cur));

    let nextSeat = null;
    for (const s of ring) {
      const pr = active.find(p => p.seat_index === s);
      if (pr && !pr.folded && Number(pr.bet_street || 0) < maxBet) {
        nextSeat = s;
        break;
      }
    }

    if (nextSeat === null) {
      // כולם השוו: הרחוב מסתיים רק כשחזרנו ל-Last Aggressor והוא פעל (למשל CHECK).
      const last = sesNow.last_raiser ?? null;
      const lastRow = last!=null ? active.find(p=>p.seat_index===last) : null;

      // אם עדיין לא חזרנו אליו – העבר לו את התור עם to_call=0 והמתן לפעולה שלו.
      if (last!=null && sesNow.current_turn !== last) {
        await supabase.from('poker_sessions').update({
          current_turn: last,
          to_call: 0,
          turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
        }).eq('id', ses.id);
        return;
      }

      // אם זה התור של ה-Last Aggressor והוא כבר 'acted' (למשל עשה CHECK) – התקדמות רחוב.
      if (lastRow?.acted) {
        if (advancingRef.current) return;
        advancingRef.current = true;
        try {
          await supabase.from('poker_sessions').update({ to_call: 0 }).eq('id', ses.id);
          await engineAdvanceStreet(ses.id);
        } finally {
          advancingRef.current = false;
        }
      }
      // אחרת – מחכים לפעולה שלו (אין advance עצמאי)
      return;
    }

    // 4) יש שחקן בתור: חשב כמה חסר לו
    const nextRow = active.find(p => p.seat_index === nextSeat);
    const need = Math.max(0, maxBet - Number(nextRow?.bet_street || 0));

    await supabase.from('poker_sessions').update({
      current_turn: nextSeat,
      to_call: need,
      turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString()
    }).eq('id', ses.id);
  }

  async function afterActionAdvance(resetOthers=false){
    // בדוק אם כולם פעלו או ALL-IN
    if(everyoneActedOrAllIn()){
      // guard settlement: no to_call and equalized bets
      const active = players.filter(p => !p.folded && p.seat_index !== null);
      const maxBet = Math.max(...active.map(p=>Number(p.bet_street||0)), 0);
      const unsettled = active.some(p => Number(p.bet_street||0) !== maxBet);
      if (!unsettled && Number(ses?.to_call||0) === 0) {
        await engineAdvanceStreet(ses.id);
        return;
      }
    }
    
    // מעבר לשחקן הבא
    const nextIdx = nextSeatAlive(ses.current_turn);
    if(nextIdx !== null){
      const active = players.filter(p => !p.folded && p.seat_index !== null);
      const maxBet = Math.max(...active.map(p=>Number(p.bet_street||0)), 0);
      const nextPlayer = players.find(p => p.seat_index === nextIdx);
      const nextBet = Number(nextPlayer?.bet_street||0);
      const newToCall = Math.max(0, maxBet - nextBet);
      await supabase.from("poker_sessions").update({
        current_turn: nextIdx,
        to_call: newToCall,
        turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
      }).eq("id", ses.id);
    }
  }

  async function autoAct(){
    const turnSeat = ses?.current_turn;
    const turnPlayer = players.find(p => p.seat_index === turnSeat);
    if(!turnPlayer || !ses) return;
    // Auto: אם אפשר check → check; אחרת fold
    if (canCheckNow(ses, players, turnPlayer.seat_index)) await actCheck();
    else await actFold();
  }

  // ===== Leave Seat (refund to vault) =====
  async function leaveSeat(){
    const me = players.find(p => p.client_id === clientId);
    if (!me || me.seat_index === null) return;
    const refund = Number(me.stack_live || 0);
    await supabase.from('poker_players').update({ seat_index: null }).eq('id', me.id);
    if (refund > 0) {
      const now = getVaultFromProps(vault);
      setVaultFromProps(setVaultBoth, now + refund);
    }
  }

  // ===== UI =====
  const board = ses?.board||[];
  const seatMapMemo = useMemo(()=> new Map(players.map(p=>[p.seat_index,p])), [players]);
  const myRow = players.find(p => p.client_id === clientId) || null;
  const myTurn = canActNow(ses, myRow);
  const canCall = Number(ses?.to_call || 0) > 0;   // לקריאה ויזואלית בלבד
  const canCheck = !canCall;
  const pot = ses?.pot_total || players.reduce((sum,p)=> sum + (p.total_bet||0), 0);

  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70">Select or create a room to start.</div>;

  return (
    <div className="w-full h-full flex flex-col p-1 md:p-2 gap-1 md:gap-2 -mt-1">
      {/* Header */}
      <div className="flex items-center justify-between bg-white/5 rounded-xl p-1 md:p-2 border border-white/10">
        <div className="text-white font-bold text-sm md:text-lg">MLEO Online</div>
        <div className="flex items-center gap-1 md:gap-2 text-white/80 text-xs">
          <span>Hand #{ses?.hand_no||"-"}</span>
          <span>Stage: {ses?.stage||"lobby"}</span>
          <span>Pot: {fmt(pot)}</span>
        </div>
      </div>

      {/* Board - Fixed Height */}
      <div className="bg-gradient-to-r from-green-900/20 to-green-800/20 rounded-xl p-2 md:p-3 border border-green-400/30 h-32 sm:h-40 relative">
        <div className="text-center h-full flex flex-col justify-center">
          {/* Hide text during active game for more card space */}
          {!(ses?.stage === 'preflop' || ses?.stage === 'flop' || ses?.stage === 'turn' || ses?.stage === 'river') && (
            <div className="text-white font-bold text-xs mb-0.5">Community Cards</div>
          )}
          <HandView hand={board} isDealing={ses?.stage === 'preflop' || ses?.stage === 'flop' || ses?.stage === 'turn' || ses?.stage === 'river'}/>
          {!(ses?.stage === 'preflop' || ses?.stage === 'flop' || ses?.stage === 'turn' || ses?.stage === 'river') && (
            <div className="text-white/80 text-xs mt-0.5">
              {board.length === 0 ? "No cards yet" : 
               board.length === 3 ? "Flop" :
               board.length === 4 ? "Turn" : 
               board.length === 5 ? "River" : ""}
            </div>
          )}
        </div>
        {/* Timer in bottom-left corner */}
        {ses?.turn_deadline && (
          <div className="absolute bottom-2 left-2 text-sm">
            <div className="text-amber-300 font-bold text-lg">
              ⏰ {Math.max(0, Math.ceil((new Date(ses.turn_deadline).getTime() - Date.now())/1000))}s
            </div>
          </div>
        )}
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 md:gap-2">
        {Array.from({length: seats}).map((_,i)=>{
          const p = seatMapMemo.get(i);
          const isTurn = ses?.current_turn===i && ["preflop","flop","turn","river"].includes(ses?.stage);
          const isMe = p?.client_id === clientId;
          return (
            <div key={i} className={`rounded-xl border-2 ${isTurn?'border-emerald-400 bg-emerald-900/20':isMe?'border-blue-400 bg-blue-900/20':'border-white/20 bg-white/5'} p-1 md:p-2 min-h-[120px] md:min-h-[150px] transition-all hover:bg-white/10 relative`}>
              {/* Turn indicator button - top right corner */}
              {p && (
                <div className={`absolute top-1 right-1 w-3 h-3 rounded-full ${isTurn ? 'bg-green-500' : 'bg-red-500'} ${isTurn ? 'animate-pulse' : ''}`}></div>
              )}
              <div className="text-center">
                {p ? (
                  <div className="space-y-1 md:space-y-2">
                    <div className="text-white font-bold text-xs md:text-sm truncate">{p.player_name}</div>
                    <div className="text-emerald-300 text-xs font-semibold">Stack: {fmt(p.stack_live)}</div>
                    <div className="text-cyan-300 text-xs">Bet: {fmt(p.bet_street||0)}</div>
                    <div className="text-yellow-300 text-sm">Total: {fmt(p.total_bet||0)}</div>
                    <HandView hand={p.hole_cards} hidden={!isMe} isDealing={ses?.stage === 'preflop' || ses?.stage === 'flop' || ses?.stage === 'turn' || ses?.stage === 'river'}/>
                    {p.folded && <div className="text-red-400 text-sm font-bold">FOLDED</div>}
                    {p.all_in && <div className="text-yellow-400 text-sm font-bold">ALL-IN</div>}
                    {isTurn && <div className="text-emerald-400 text-sm font-bold">YOUR TURN</div>}
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-white/50 text-sm mb-2">Empty Seat</div>
                    <button 
                      onClick={() => takeSeat(i)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-all"
                    >
                      TAKE SEAT
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>


      {/* Controls - Fixed Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-2 h-40 md:h-44">
        <div className="bg-white/5 rounded-xl p-1 md:p-2 border border-white/10 h-full">
          <div className="text-white/80 text-xs mb-1 font-semibold">Game Control</div>
          <div className="flex gap-1 flex-wrap mb-2">
            <button 
              onClick={startHand}
              className="px-2 py-1 md:px-3 md:py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-xs transition-all shadow-lg"
            >
              Start / Next Hand
            </button>
            <button 
              onClick={leaveSeat}
              className="px-2 py-1 md:px-3 md:py-2 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-xs transition-all shadow-lg"
            >
              Leave Seat
            </button>
            {["preflop","flop","turn","river"].includes(ses?.stage) && (
              <button 
                onClick={()=>engineAdvanceStreet(ses.id)}
                className="px-2 py-1 md:px-3 md:py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold text-xs transition-all shadow-lg"
              >
                Force Advance
              </button>
            )}
          </div>
          <div className="text-white/60 text-xs mb-2">Vault: {fmt(getVaultFromProps(vault))} MLEO</div>
          {/* Waiting Players Info */}
          {roomMembers.length > players.length && (
            <div>
              <div className="text-xs text-blue-400 font-semibold mb-1">
                👥 Waiting ({roomMembers.length - players.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {roomMembers
                  .filter(member => !players.some(p => p.player_name === member.player_name))
                  .slice(0, 3)
                  .map((member, idx) => (
                    <div key={idx} className="px-1 py-0.5 bg-white/10 rounded text-xs text-white/80 border border-white/20">
                      {member.player_name}
                    </div>
                  ))
                }
                {roomMembers.filter(member => !players.some(p => p.player_name === member.player_name)).length > 3 && (
                  <div className="px-1 py-0.5 bg-white/10 rounded text-xs text-white/80 border border-white/20">
                    +{roomMembers.filter(member => !players.some(p => p.player_name === member.player_name)).length - 3}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white/5 rounded-xl p-1 md:p-2 border border-white/10 h-full">
          <div className="text-white/80 text-xs mb-1 font-semibold">Player Actions</div>
          <div className="space-y-1">
            <div className="flex gap-1 flex-wrap">
              <button onClick={actFold} disabled={!myTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                FOLD
              </button>
              <button onClick={actCheck} disabled={!myTurn || !canCheck} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CHECK
              </button>
              <button onClick={actCall} disabled={!myTurn || !canCall} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CALL
              </button>
              <button onClick={actAllIn} disabled={!myTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                ALL-IN
              </button>
            </div>
            
            <div className="flex gap-1 items-center">
              <input
                type="number" min="0" step="10" value={betInput}
                onChange={e=>setBetInput(Number(e.target.value||0))}
                className="flex-1 bg-black/40 text-white text-xs rounded-lg px-1 py-0.5 md:px-2 md:py-1 border border-white/20 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount"
              disabled={!myTurn}
              />
              <button onClick={()=>actBet(betInput)} disabled={!myTurn || canCall || betInput<=0} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                BET
              </button>
              <button onClick={()=>actRaise(betInput)} disabled={!myTurn || !canCall || betInput<=0} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                RAISE
              </button>
            </div>

            <div className="flex gap-1 text-xs">
              <button onClick={()=>setBetInput(ses?.min_bet||20)} className="px-1 py-0.5 rounded bg-white/10 border border-white/20 text-white/80 hover:bg-white/20">
                1×BB
              </button>
              <button onClick={()=>setBetInput(Math.floor(pot/2))} className="px-1 py-0.5 rounded bg-white/10 border border-white/20 text-white/80 hover:bg-white/20">
                ½ Pot
              </button>
              <button onClick={()=>setBetInput(pot)} className="px-1 py-0.5 rounded bg-white/10 border border-white/20 text-white/80 hover:bg-white/20">
                Pot
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Timer Position */}
      <div className="h-16 flex items-center justify-center">
        {ses?.current_turn!=null && ses?.turn_deadline && (
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
            <TurnCountdown deadline={ses.turn_deadline} />
          </div>
        )}
      </div>

      {/* Fixed Status Message Position */}
      <div className="h-16 flex items-center justify-center">
        {msg && (
          <div className="bg-emerald-900/20 rounded-xl p-4 border border-emerald-400/30 text-center max-w-md mx-auto">
            <div className="text-emerald-300 text-sm">{msg}</div>
          </div>
        )}
      </div>
    </div>
  );
}
