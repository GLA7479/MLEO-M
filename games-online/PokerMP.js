// games-online/PokerMP.js
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  maxStreetBet, minRaiseAmount,
  startHand as engineStartHand, 
  advanceStreet as engineAdvanceStreet,
  settlePots,
  determineWinnersAuto
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
  const color = (s==="h"||s==="d") ? "text-red-600" : "text-black";
  
  const cardSize = isDealing ? "w-20 h-32 md:w-24 md:h-40" : "w-10 h-14 md:w-12 md:h-18";
  
  if (hidden) {
    return (
      <div className={`relative ${cardSize} rounded-md shadow-lg transition-all`}>
        {/* Realistic card back pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 rounded-md border-2 border-blue-500/50">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,.15)_1px,transparent_1px)] bg-[length:6px_6px]"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg md:text-xl font-black text-white drop-shadow-lg">MLEO</span>
          </div>
        </div>
      </div>
    );
  }
  
  const isLarge = isDealing; // Large cards for community cards
  
  return (
    <div className={`${cardSize} rounded-md bg-white border-2 border-gray-300 shadow-xl hover:scale-105 transition-all relative overflow-hidden`}>
      {/* Top left corner rank */}
      <div className={`absolute top-1 left-2 text-base md:text-lg font-black ${color} leading-none`}>
        {r}
      </div>
      {/* Top left corner suit */}
      <div className={`absolute top-4 left-2 text-base ${color}`}>
        {suitIcon}
      </div>
      
      {/* Center large suit icon */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isLarge ? 'text-6xl md:text-8xl' : 'text-2xl md:text-4xl'} ${color} opacity-20`}>
        {suitIcon}
      </div>
      
      {/* Bottom right corner (rotated) */}
      <div className={`absolute bottom-1 right-2 text-base md:text-lg font-black ${color} leading-none rotate-180`}>
        {r}
      </div>
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
      const remaining = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now())/1000));
      setLeft(remaining);
    }, 1000); // Update every second
    return () => clearInterval(t);
  }, [deadline]);
  return <span className="text-xs text-white font-bold">⏰ {left}s</span>;
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
  const [showRebuy, setShowRebuy] = useState(false);
  const [rebuyAmt, setRebuyAmt] = useState(1000);
  const [rebuyBusy, setRebuyBusy] = useState(false);
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

  // ===== Vault Management =====
  function safeRead(k, d){ try{ const r=localStorage.getItem(k); return r? JSON.parse(r):d }catch{ return d } }
  function safeWrite(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch{} }

  function readVault(){ 
    const rushData = safeRead("mleo_rush_core_v4", {});
    return Math.max(0, Number(rushData.vault || 0));
  }
  
  function writeVault(v){ 
    const rushData = safeRead("mleo_rush_core_v4", {});
    rushData.vault = Math.max(0, Math.floor(v));
    safeWrite("mleo_rush_core_v4", rushData);
    
    // Update main page state if callback exists
    if (window.updateVaultCallback) {
      window.updateVaultCallback(rushData.vault);
    }
  }

  // ===== Re-buy Management =====
  const MIN_REBUY = 100;        // Can be changed
  const DEFAULT_REBUY = 1000;   // Default for quick button

  async function doRebuy(amount) {
    if (ses?.stage !== 'lobby' || !myRow?.id) return;
    const vault = readVault();
    const amt = Math.min(Math.max(MIN_REBUY, Math.floor(Number(amount||0))), vault);
    if (amt <= 0) return;
    try{
      setRebuyBusy(true);
      writeVault(vault - amt);
      await supabase.from('poker_players')
        .update({ stack_live: Number(myRow.stack_live||0) + amt })
        .eq('id', myRow.id);
      setShowRebuy(false);
    } finally {
      setRebuyBusy(false);
    }
  }

  async function rebuy(amount){
    await doRebuy(amount);
  }

  // ===== Leave Seat =====
  async function leaveSeat(){
    if(!ses || !myRow) return;
    await supabase.from('poker_players')
      .update({ seat_index: null })
      .eq('id', myRow.id);
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
    const currentVault = readVault();
    
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
      writeVault(currentVault - want);
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
        stage: 'lobby',         // ✅ אין שואודאון – ניצחון בקיפול
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

  // ===== All-In Capped Helper =====
  async function applyAllInCapped(sessionId, actorSeat) {
    // קרא מצב נוכחי
    const { data: ses } = await supabase
      .from('poker_sessions').select('id').eq('id', sessionId).single();

    const { data: pls } = await supabase
      .from('poker_players')
      .select('id, seat_index, bet_street, stack_live, folded')
      .eq('session_id', sessionId);

    const me = pls.find(p => p.seat_index === actorSeat);
    if (!me || me.folded) return { ok: false, reason: 'no-actor' };

    // גובה ההשקעה המקסימלית שהיריבים יכולים לכסות (Heads-Up זה פשוט)
    const opps = pls.filter(p => p.seat_index !== actorSeat && !p.folded);
    const oppMaxCommit = Math.max(
      0,
      ...opps.map(o => Number(o.bet_street||0) + Number(o.stack_live||0))
    );

    // כמה אני יכול "להתחייב" סה"כ ביד: מה שכבר שמתי + כמה שנשאר לי
    const myMaxCommit = Number(me.bet_street||0) + Number(me.stack_live||0);

    // ה"התחייבות" החדשה לא יכולה לעבור את מה שהיריבים מסוגלים לכסות
    const targetCommit = Math.min(myMaxCommit, oppMaxCommit);

    // כמה עוד צריך להוסיף כרגע (מעל מה שכבר שמתי)
    const addNow = Math.max(0, targetCommit - Number(me.bet_street||0));

    if (addNow > 0) {
      // מזיזים לקופה רק את הסכום המכוסה
      await takeChips(sessionId, actorSeat, addNow);
    }

    // אם תרמתי את כל מה שהיה לי – אני באמת ALL-IN, אחרת אני לא ALL-IN
    const { data: meAfter } = await supabase
      .from('poker_players')
      .select('stack_live')
      .eq('id', me.id)
      .single();

    const reallyAllIn = Number(meAfter?.stack_live||0) === 0;

    await supabase
      .from('poker_players')
      .update({ all_in: reallyAllIn, acted: true })
      .eq('id', me.id);

    return { ok: true, all_in: reallyAllIn };
  }

  // ===== Auto Runout Helper =====
  async function maybeAutoRunoutToShowdown(sessionId) {
    const { data: ses } = await supabase
      .from('poker_sessions')
      .select('id, stage, board, deck_remaining, pot_total')
      .eq('id', sessionId).single();

    const { data: pls } = await supabase
      .from('poker_players')
      .select('folded, all_in, seat_index, bet_street')
      .eq('session_id', sessionId);

    const alive = (pls||[]).filter(p => !p.folded);
    if (!alive.length) return;
    const everyoneLocked = alive.every(p => p.all_in === true);

    if (!everyoneLocked) return; // עדיין יש שחקן שיכול לפעול

    // אסוף גם הימור רחוב שעוד לא הוזז לפוט
    const streetSum = (pls||[]).reduce((s,p)=> s + Number(p.bet_street||0), 0);
    if (streetSum > 0) {
      await supabase.from('poker_players')
        .update({ bet_street: 0 })
        .eq('session_id', sessionId);

      await supabase.from('poker_sessions')
        .update({ pot_total: Number(ses.pot_total||0) + streetSum, to_call: 0 })
        .eq('id', sessionId);
    }

    // השלם לוח עד 5 קלפים
    let board = [...(ses.board||[])];
    let deck  = [...(ses.deck_remaining||[])];

    if (board.length === 0 && deck.length >= 3) { board.push(...deck.splice(0,3)); } // פלופ
    if (board.length === 3 && deck.length >= 1) { board.push(...deck.splice(0,1)); } // טרן
    if (board.length === 4 && deck.length >= 1) { board.push(...deck.splice(0,1)); } // ריבר

    await supabase.from('poker_sessions').update({
      board,
      deck_remaining: deck,
      stage: 'showdown',
      current_turn: null,
      to_call: 0,
      turn_deadline: null
    }).eq('id', sessionId);

    // בשואודאון: הצגת קלפים לשחקנים שלא קיפלו נעשית כבר ב־UI (לפי ses.stage==='showdown' && !folded)
    // שקרא ל-settlePots עם כל הפרמטרים הנדרשים
    const { data: allPlayers } = await supabase
      .from('poker_players')
      .select('*')
      .eq('session_id', sessionId);
    
    if (allPlayers && board.length === 5) {
      await settlePots(sessionId, board, allPlayers);
    }
  }

  // ===== Player Acts =====
  async function actFold(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    await supabase.from("poker_players").update({ folded:true, acted:true, hole_cards: [] }).eq("id", turnPlayer.id);
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

    // ✅ תן לשחקן לתרום רק מה שמכוסה מול היריב/ים
    await applyAllInCapped(ses.id, myRow.seat_index);

    await supabase.from('poker_actions').insert({
      session_id: ses.id, 
      seat_index: myRow.seat_index, 
      action: 'allin', 
      amount: null
    });

    // אם כולם נעולים (או מקופלים), מריצים ראנאאוט אוטומטי
    await maybeAutoRunoutToShowdown(ses.id);

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

  // ===== Helper Functions =====
  function isMyTurn(ses, me) {
    if (!ses || !me) return false;
    return ses.current_turn === me.seat_index;
  }

  // ===== UI =====
  const board = ses?.board||[];
  const seatMapMemo = useMemo(()=> new Map(players.map(p=>[p.seat_index,p])), [players]);
  const myRow = players.find(p => p.client_id === clientId) || null;

  // ===== Bust-out Check =====
  useEffect(()=>{
    if (!ses?.stage || !myRow) return;

    // End of hand: lobby or showdown that ended (without turn_deadline)
    const handOver = ses.stage === 'lobby' || (ses.stage === 'showdown' && !ses.turn_deadline);
    if (!handOver) return;

    const vault = readVault();
    const stack = Number(myRow.stack_live||0);

    // No chips on table
    if (stack <= 0) {
      if (vault > 0) {
        setRebuyAmt(Math.min(DEFAULT_REBUY, vault));
        setShowRebuy(true);         // ✅ Opens rebuy popup
      } else {
        // No Vault -> can only offer seat exit/info
        setShowRebuy(false);
        if (myRow.seat_index != null) {
          leaveSeat();
          setMsg("Left table: No coins in Vault");
        }
      }
    }
  }, [ses?.stage, ses?.turn_deadline, myRow?.stack_live]);
  
  const myTurn = isMyTurn(ses, myRow);
  const canCall = Number(ses?.to_call || 0) > 0;   // For visual display only
  const canCheck = !canCall;
  const pot = ses?.pot_total || players.reduce((sum,p)=> sum + (p.total_bet||0), 0);
  
  // ===== Vault and Stack Management =====
  const myVault = readVault();
  const myStack = Number(myRow?.stack_live||0);
  const canActNow = myTurn && myStack > 0;          // During hand - must have chips on table
  const inLobby = ses?.stage === 'lobby';

  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70">Select or create a room to start.</div>;

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ height: '100svh' }}>
      {/* Poker Table Felt Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-green-900 to-emerald-800">
        {/* Felt texture overlay */}
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)',
        }}></div>
        {/* Dot pattern for realistic felt */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.1) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}></div>
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex flex-col h-full overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex-shrink-0 bg-black/40 backdrop-blur-sm px-2 py-2 md:px-4 md:py-3 border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            <div className="text-white font-bold text-xs md:text-base">🃏 MLEO Poker</div>
            <div className="flex items-center gap-1 md:gap-2 text-white/90 text-[10px] md:text-xs">
              <span className="bg-green-800/50 px-2 py-0.5 rounded">Hand #{ses?.hand_no||"-"}</span>
              <span className="bg-green-800/50 px-2 py-0.5 rounded capitalize">{ses?.stage||"lobby"}</span>
              <span className="bg-amber-600/50 px-2 py-0.5 rounded font-bold">💰 {fmt(pot)}</span>
            </div>
          </div>
        </div>

        {/* Game Area - Center table */}
        <div className="flex-1 relative overflow-hidden" style={{ minHeight: '50vh', maxHeight: '55vh' }}>
          
          {/* Community Cards - Center of table - NO FRAME */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-full px-4">
            <div className="flex justify-center gap-3 md:gap-4">
              {board.map((card, idx) => (
                <Card key={idx} code={card} isDealing={true} />
              ))}
              {Array.from({ length: 5 - board.length }).map((_, idx) => (
                <div key={idx} className="w-20 h-32 md:w-24 md:h-40 rounded-md bg-white/10 border-2 border-white/40 flex items-center justify-center text-white/80 text-3xl font-bold shadow-lg">
                  ?
                </div>
              ))}
            </div>
          </div>


          {/* Players - 3 top, 3 bottom rows */}
          <div className="absolute inset-0 overflow-visible">
            {Array.from({length: seats}).map((_,i)=>{
              const p = seatMapMemo.get(i);
              const isTurn = ses?.current_turn===i && ["preflop","flop","turn","river"].includes(ses?.stage);
              const isMe = p?.client_id === clientId;
              
              // Position calculation: Player 5 (you) always in center
              let x = 0, y = 0;
              if (i === 5) {
                // You - center bottom
                x = 50; // Center
                y = 85; // Bottom
              } else if (i < 3) {
                // Top row (seats 0, 1, 2) - same as bottom row
                if (i === 0) {
                  x = 15; // Left
                } else if (i === 1) {
                  x = 50; // Center
                } else if (i === 2) {
                  x = 85; // Right
                }
                y = 15; // Top
              } else {
                // Bottom row (seats 3, 4) around seat 5 - wider spacing
                if (i === 3) {
                  x = 15; // Left of center
                  y = 85;
                } else if (i === 4) {
                  x = 85; // Right of center
                  y = 85;
                }
              }
              
              // Scale for responsive sizing
              const scale = isMe ? 1.0 : 0.7;
              
              return (
                <div
                  key={i}
                  className={`absolute rounded-md border-2 shadow-lg transition-all ${
                    isTurn ? 'border-yellow-400 bg-yellow-400/20 ring-2 ring-yellow-400/30' :
                    isMe ? 'border-purple-400 bg-purple-400/15' :
                    'border-white/20 bg-white/10'
                  }`}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    minWidth: '80px',
                    minHeight: isMe ? '90px' : '80px',
                    maxWidth: '90px',
                    fontSize: '10px'
                  }}
                >
                  {p ? (
                    <div className="p-2 md:p-3 text-center space-y-1">
                      {/* Player name */}
                      <div className={`text-white font-bold text-[10px] md:text-xs truncate ${
                        isMe ? 'text-purple-300' : ''
                      }`}>
                        {p.player_name}{isMe && ' (You)'}
                      </div>
                      
                      {/* Chips count */}
                      <div className="text-cyan-300 text-[11px] md:text-sm font-semibold">
                        {fmt(p.stack_live)} 💰
                      </div>
                      
                      {/* Current bet */}
                      {p.bet_street > 0 && (
                        <div className="text-amber-300 text-[9px] md:text-xs">
                          Bet: {fmt(p.bet_street)}
                        </div>
                      )}
                      
                      {/* Cards */}
                      <div className="flex justify-center gap-0.5 mt-1">
                        {p.hole_cards?.map((card, idx) => (
                          <Card 
                            key={idx} 
                            code={card} 
                            hidden={!(isMe || (ses?.stage === 'showdown' && ses.board?.length === 5 && !p?.folded))}
                            isDealing={false}
                          />
                        ))}
                      </div>
                      
                      {/* Status badges */}
                      <div className="flex flex-col items-center gap-1 mt-1">
                        {p.folded && <div className="bg-red-900/50 text-red-300 text-[9px] px-2 py-0.5 rounded">FOLDED</div>}
                        {p.all_in && <div className="bg-orange-900/50 text-orange-300 text-[9px] px-2 py-0.5 rounded">ALL-IN</div>}
                        {isTurn && <div className="bg-green-600 text-white text-[9px] px-2 py-0.5 rounded">YOUR TURN</div>}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex flex-col items-center justify-center h-full">
                      <div className="text-white/40 text-[10px] mb-2">Seat {i+1}</div>
                      <button 
                        onClick={() => takeSeat(i)}
                        className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-all shadow-lg"
                      >
                        JOIN
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls - Single Panel */}
        <div className="flex-shrink-0 bg-black/50 backdrop-blur-sm border-t border-white/20 p-2 md:p-3">
          <div className="bg-black/50 rounded-lg p-2 border border-white/20">
            <div className="text-white font-bold text-xs mb-2">Your Actions</div>
            
            {/* Player Actions */}
            <div className="space-y-1.5 mb-2">
              <div className="flex gap-1">
                <button onClick={actFold} disabled={!canActNow} 
                  className="flex-1 px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all disabled:opacity-40 shadow-lg">
                  FOLD
                </button>
                <button onClick={actCheck} disabled={!canActNow || !canCheck}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white font-bold text-xs transition-all disabled:opacity-40 shadow-lg">
                  CHECK
                </button>
                <button onClick={actCall} disabled={!canActNow || !canCall}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition-all disabled:opacity-40 shadow-lg">
                  CALL
                </button>
                <button onClick={actAllIn} disabled={!canActNow}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white font-bold text-xs transition-all disabled:opacity-40 shadow-lg">
                  ALL-IN
                </button>
              </div>
              
              <div className="flex gap-1 flex-wrap">
                <button 
                  onClick={startHand}
                  className="px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-lg"
                >
                  ▶ Start
                </button>
                <button 
                  onClick={leaveSeat}
                  className="px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all shadow-lg"
                >
                  Leave
                </button>
                <button 
                  onClick={()=>engineAdvanceStreet(ses.id)}
                  disabled={!["preflop","flop","turn","river"].includes(ses?.stage)}
                  className="px-2 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ⏩ Advance
                </button>
                <div className="flex items-center gap-0.5">
                  <button 
                    onClick={()=>setBetInput(prev=>Math.max(0, prev - 10))}
                    className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 font-bold text-xs"
                  >
                    ↓
                  </button>
                  <input
                    type="number" min="0" step="10" value={betInput}
                    onChange={e=>setBetInput(Number(e.target.value||0))}
                    className="w-20 bg-black/60 text-white text-xs rounded-lg px-2 py-1 border border-white/20 focus:border-emerald-400 focus:outline-none placeholder-white/50"
                    placeholder="Amount"
                    disabled={!myTurn}
                  />
                  <button 
                    onClick={()=>setBetInput(prev=>Math.max(0, prev + 10))}
                    className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 font-bold text-xs"
                  >
                    ↑
                  </button>
                </div>
                <button onClick={()=>setBetInput(ses?.min_bet||20)} className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 font-bold text-xs">
                  BB
                </button>
                <button onClick={()=>setBetInput(Math.floor(pot/2))} className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 font-bold text-xs">
                  ½ Pot
                </button>
                <button onClick={()=>setBetInput(pot)} className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 font-bold text-xs">
                  Pot
                </button>
                <button onClick={()=>setBetInput(pot * 2)} className="px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 font-bold text-xs">
                  2× Pot
                </button>
                <button onClick={()=>actBet(betInput)} disabled={!canActNow || canCall || betInput<=0} 
                  className="px-2 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold text-xs transition-all disabled:opacity-40 shadow-lg">
                  BET
                </button>
                <button onClick={()=>actRaise(betInput)} disabled={!canActNow || !canCall || betInput<=0}
                  className="px-2 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs transition-all disabled:opacity-40 shadow-lg">
                  RAISE
                </button>
                {ses?.turn_deadline && (
                  <div className="bg-red-600 text-white px-3 py-1 rounded-full font-bold text-xs shadow-lg animate-pulse">
                    <TurnCountdown deadline={ses.turn_deadline} />
                  </div>
                )}
              </div>
            </div>
            
            {/* Info Section */}
            <div className="text-white/80 text-xs border-t border-white/20 pt-2">
              <div>Vault: {fmt(getVaultFromProps(vault))}</div>
              {/* Waiting Players Info */}
              {roomMembers.length > players.length && (
                <div className="mt-1">
                  <div className="text-[9px] text-blue-400 font-semibold mb-1">
                    👥 Waiting ({roomMembers.length - players.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {roomMembers
                      .filter(member => !players.some(p => p.player_name === member.player_name))
                      .slice(0, 3)
                      .map((member, idx) => (
                        <div key={idx} className="px-1 py-0.5 bg-white/10 rounded text-[8px] text-white/80 border border-white/20">
                          {member.player_name}
                        </div>
                      ))
                    }
                    {roomMembers.filter(member => !players.some(p => p.player_name === member.player_name)).length > 3 && (
                      <div className="px-1 py-0.5 bg-white/10 rounded text-[8px] text-white/80 border border-white/20">
                        +{roomMembers.filter(member => !players.some(p => p.player_name === member.player_name)).length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages - Floating */}
        {msg && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-emerald-900/40 backdrop-blur-sm rounded-lg p-3 border border-emerald-400/40 shadow-lg max-w-md mx-auto z-50">
            <div className="text-emerald-300 text-xs md:text-sm text-center">{msg}</div>
          </div>
        )}
      </div>

      {/* Re-buy Modal */}
      {showRebuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[92%] max-w-md rounded-2xl bg-[#121220] p-5 shadow-xl border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-3">Load from Vault</h3>
            <p className="text-sm text-white/70 mb-4">
              Vault Balance: <b>{readVault().toLocaleString()} MLEO</b>
            </p>

            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                min={MIN_REBUY}
                max={readVault()}
                value={rebuyAmt}
                onChange={e=>setRebuyAmt(Number(e.target.value||0))}
                className="flex-1 bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-white outline-none"
              />
              <button className="px-2 py-2 rounded-lg bg-white/10 text-white"
                      onClick={()=>setRebuyAmt(Math.min(500, readVault()))}>500</button>
              <button className="px-2 py-2 rounded-lg bg-white/10 text-white"
                      onClick={()=>setRebuyAmt(Math.min(1000, readVault()))}>1K</button>
              <button className="px-2 py-2 rounded-lg bg-white/10 text-white"
                      onClick={()=>setRebuyAmt(readVault())}>MAX</button>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="px-3 py-2 rounded-lg bg-white/10 text-white"
                      onClick={()=>setShowRebuy(false)} disabled={rebuyBusy}>Cancel</button>
              <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white"
                      onClick={()=>doRebuy(rebuyAmt)} disabled={rebuyBusy || !inLobby}>
                {rebuyBusy ? 'Loading…' : 'Load to Table'}
              </button>
            </div>

            {!inLobby && (
              <div className="text-xs text-yellow-400 mt-3">
                Can only load from Vault between hands (in Lobby).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
