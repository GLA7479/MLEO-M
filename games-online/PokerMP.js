// games-online/PokerMP.js
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  newDeck, maxStreetBet, canCheck, minRaiseAmount,
  determineWinnersAuto, settlePots
} from "../lib/pokerEngine";

const TURN_SECONDS = Number(process.env.NEXT_PUBLIC_POKER_TURN_SECONDS||20);

// Helper functions
function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

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
    }, 250);
    return () => clearInterval(t);
  }, [deadline]);
  return <div className="text-xs text-emerald-300 font-bold">⏱️ {left}s</div>;
}

export default function PokerMP({ roomId, playerName, vault, setVaultBoth }) {
  // Use same vault functions as existing games
  function getVault() {
    const rushData = JSON.parse(localStorage.getItem("mleo_rush_core_v4") || "{}");
    return rushData.vault || 0;
  }

  function setVault(amount) {
    const rushData = JSON.parse(localStorage.getItem("mleo_rush_core_v4") || "{}");
    rushData.vault = amount;
    localStorage.setItem("mleo_rush_core_v4", JSON.stringify(rushData));
  }

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
    
    // אם יש 2+ שחקנים ואין סשן פעיל, התחל משחק
    if (players.length >= 2 && (!ses || ses.stage === 'lobby')) {
      await startHand();
      return;
    }
    
    // אם כולם פעלו, עבור לשלב הבא
    if (ses && ses.stage !== 'showdown' && everyoneActedOrAllIn()) {
      await advanceStreet();
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
    }, 250);
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

  // ===== Take Seat =====
  async function takeSeat(seatIndex) {
    if (!clientId) { setMsg("Client not recognized"); return; }

    // ודא שיש סשן – אם אין, התחל ואז נסה שוב
    if (!ses || !ses.id) {
      await startHand();
      setTimeout(() => takeSeat(seatIndex), 800);
      return;
    }

    // האם כבר יש לי שורה בסשן?
    const { data: mine } = await supabase
      .from("poker_players")
      .select("id, seat_index, client_id")
      .eq("session_id", ses.id)
      .eq("client_id", clientId)
      .maybeSingle();

    // בדוק תפוסת מושב היעד
    const { data: occ } = await supabase
      .from("poker_players")
      .select("id, client_id")
      .eq("session_id", ses.id)
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
      // בדיקת יתרה
      const currentVault = getVault();
      if (currentVault < 1000) { setMsg("Insufficient vault balance (min 1000 MLEO)"); return; }

      const { error: upErr } = await supabase.from("poker_players").upsert({
        session_id: ses.id,
        seat_index: seatIndex,
        player_name: name,
        client_id: clientId,
        stack_live: 1000,
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
      const newVault = currentVault - 1000;
      setVault(newVault);
      if (setVaultBoth) setVaultBoth(newVault);
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

  async function advanceStreet(auto=false){
    if(!ses) return;
    
    // אם נשאר שחקן אחד — ניצחון אוטומטי ללא דירוג
    const alive = players.filter(p => !p.folded);
    if (alive.length <= 1) {
      const winnerSeat = alive[0]?.seat_index;
      await supabase.from("poker_sessions").update({
        stage: "showdown", winners: winnerSeat!=null ? [winnerSeat] : [], current_turn: null, turn_deadline: null
      }).eq("id", ses.id);
      return;
    }

    // אפס מצב סטריט
    await resetStreetActs();

    let { board = [], deck_remaining = [], stage, dealer_seat } = ses;
    const d = [...deck_remaining];
    
    if(stage==="preflop"){ 
      board = [...board, d.pop(), d.pop(), d.pop()]; 
      stage="flop"; 
    }
    else if(stage==="flop"){ 
      board = [...board, d.pop()]; 
      stage="turn"; 
    }
    else if(stage==="turn"){ 
      board = [...board, d.pop()]; 
      stage="river"; 
    }
    else if(stage==="river"){ 
      stage="showdown"; 
    }

    let next = null;
    if(stage!=="showdown"){
      next = nextSeatAlive(dealer_seat); // first to act after flop: left of dealer
    }

    await supabase.from("poker_sessions").update({
      board, deck_remaining: d, stage, current_turn: next, 
      turn_deadline: next? new Date(Date.now()+TURN_SECONDS*1000).toISOString() : null
    }).eq("id", ses.id);

    if(stage==="showdown"){
      await showdownAndSettle();
    }
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
      const deck = newDeck();
      const { data: exist } = await supabase.from("poker_sessions").select("*").eq("room_id", roomId).maybeSingle();

    // קבע דילר/בליינדים
    const dealer = exist ? (exist.dealer_seat+1) % seats : 0;
    const sb = (dealer+1) % seats;
    const bbSeat = (dealer+2) % seats;

    let sessionId;
    if(!exist){
      const { data: ins, error: insErr } = await supabase.from("poker_sessions").insert({
        room_id: roomId, hand_no:1, stage:"preflop",
        dealer_seat: dealer, sb_seat: sb, bb_seat: bbSeat,
        board:[], deck_remaining: deck, pot_total:0,
        min_bet: 20, // הוסף min_bet
        current_turn: (bbSeat+1)%seats,
        turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
      }).select().single();
      
      if (insErr || !ins) {
        console.error("Failed to create poker session:", insErr);
        setMsg("Failed to start hand");
        return;
      }
      
      sessionId = ins.id;
      await supabase.from("poker_pots").insert({ session_id: sessionId, total: 0, eligible: [] });
    } else {
      const { data: upd, error: updErr } = await supabase.from("poker_sessions").update({
        hand_no: exist.hand_no+1, stage:"preflop",
        dealer_seat: dealer, sb_seat: sb, bb_seat: bbSeat,
        board:[], deck_remaining: deck, pot_total:0, winners:[],
        min_bet: 20, // הוסף min_bet
        current_turn: (bbSeat+1)%seats,
        turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
      }).eq("id", exist.id).select().single();
      
      if (updErr || !upd) {
        console.error("Failed to update poker session:", updErr);
        setMsg("Failed to start hand");
        return;
      }
      
      sessionId = upd.id;
      await supabase.from("poker_pots").update({ total:0, eligible:[] }).eq("session_id", sessionId);
      // במקום למחוק שחקנים, רק ננקה את הנתונים שלהם
      await supabase.from("poker_players").update({
        hole_cards: [],
        bet_street: 0,
        total_bet: 0,
        folded: false,
        all_in: false,
        acted: false
      }).eq("session_id", sessionId);
    }

    // בדוק אם יש שחקנים קיימים
    const { data: existingPlayers } = await supabase.from("poker_players").select("*").eq("session_id", sessionId);
    
    let sit = [];
    if (!existingPlayers || existingPlayers.length === 0) {
      // אם אין שחקנים, צור שחקנים חדשים מהחדר
      const { data: roomPlayers } = await supabase.from("arcade_room_players").select("*").eq("room_id", roomId).order("joined_at");
      sit = (roomPlayers||[]).slice(0, seats).map((rp,i)=>({
        session_id: sessionId, 
        player_name: rp.player_name, 
        seat_index: i,
        client_id: rp.client_id || null,
        stack_live: 2000, 
        bet_street: 0, 
        total_bet: 0, 
        folded: false, 
        all_in: false, 
        acted: false
      }));
      
      if (sit.length < 1) return; // שמור על דרישה למינימום 1

      await supabase
        .from("poker_players")
        .upsert(sit, {
          onConflict: "session_id,seat_index",
          ignoreDuplicates: true,
          returning: "minimal",
        });
    } else {
      // אם יש שחקנים קיימים, השתמש בהם
      sit = existingPlayers;
    }

    // מחלק Hole — עדכון per-row (מונע 400/409)
    let d = [...deck]; // הוצא את d מחוץ לבלוק
    
    {
      // קרא את כל השחקנים (לא רק חדשים)
      const { data: allPlayers, error: selErr } = await supabase
        .from("poker_players")
        .select("id, seat_index, hole_cards")
        .eq("session_id", sessionId)
        .order("seat_index");

      if (selErr) { console.error("select players error:", selErr); return; }

      // סבב 1 + 2: קלף לכל שחקן
      for (let round = 0; round < 2; round++) {
        for (const P of (allPlayers || [])) {
          const c = d.pop();
          const hand = Array.isArray(P.hole_cards) ? [...P.hole_cards, c] : [c];
          const { error: upErr } = await supabase
            .from("poker_players")
            .update({ hole_cards: hand })
            .eq("id", P.id);
          if (upErr) console.error("hole-card update error:", upErr);
          P.hole_cards = hand;
        }
      }
    }

    // עדכן את הסשן לשלב preflop
    await supabase.from("poker_sessions").update({
      stage: "preflop",
      current_turn: (bbSeat+1)%seats,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString(),
      deck_remaining: d
    }).eq("id", sessionId);

    // אנטה (אם יש)
    if((ses?.ante||0) > 0){
      for(const p of sit){
        await takeChips(sessionId, p.seat_index, ses.ante, "ante");
      }
    }
    // פוסט Blinds – רק אם יש לפחות 2 שחקנים
    if (sit.length >= 2) {
      const sbAmount = Math.floor((exist?.min_bet || 20) / 2);
      const bbAmount = (exist?.min_bet || 20);
      
      await takeChips(sessionId, sb, sbAmount, "post_sb");
      await takeChips(sessionId, bbSeat, bbAmount, "post_bb");
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
    
    // אם זה השחקן המקומי, הוצא כסף מה-vault (השוואה לפי client_id)
    if (pl.client_id && pl.client_id === clientId) {
      const currentVault = getVault();
      if (currentVault < pay) {
        setMsg("Insufficient vault balance");
        return;
      }
      const newVault = currentVault - pay;
      setVault(newVault);
      // עדכן גם את ה-state בדף הראשי
      if (setVaultBoth) {
        setVaultBoth(newVault);
      }
    }
    
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

  // ===== Player Acts =====
  async function actFold(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    await supabase.from("poker_players").update({ folded:true, acted:true }).eq("id", turnPlayer.id);
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action:"fold" });
    await afterActionAdvance();
  }

  async function actCheck(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    if(!canCheck(turnPlayer, players)) return; // לא חוקי
    await supabase.from("poker_players").update({ acted:true }).eq("id", turnPlayer.id);
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action:"check" });
    await afterActionAdvance();
  }

  async function actCall(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    const maxBet = maxStreetBet(players);
    const need = Math.max(0, maxBet - (turnPlayer.bet_street||0));
    if(need<=0) return actCheck();
    const pay = Math.min(need, turnPlayer.stack_live);
    await takeChips(ses.id, turnPlayer.seat_index, pay, "call");
    await afterActionAdvance();
  }

  async function actBet(amount){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    const maxBet = maxStreetBet(players);
    if(maxBet>0) return; // אם כבר יש העלאה/הימור קיים — זה בעצם רייז
    const minBet = ses.min_bet || 20;
    if(amount < minBet) amount = minBet;
    amount = Math.min(amount, turnPlayer.stack_live);
    await takeChips(ses.id, turnPlayer.seat_index, amount, "bet");
    // איפוס acted לכל האחרים (שיצטרכו להגיב)
    const others = players.filter(p=>p.id!==turnPlayer.id && !p.folded && !p.all_in).map(p=>p.id);
    if(others.length) await supabase.from("poker_players").update({ acted:false }).in("id", others);
    await afterActionAdvance(true);
  }

  async function actRaise(amount){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    const maxBet = maxStreetBet(players);
    const needToCall = Math.max(0, maxBet - (turnPlayer.bet_street||0));
    const minR = minRaiseAmount(players, ses.min_bet||20);
    const raiseBy = Math.max(minR, amount); // גודל ההעלאה
    const pay = Math.min(needToCall + raiseBy, turnPlayer.stack_live);
    if(pay<=0) return;
    await takeChips(ses.id, turnPlayer.seat_index, pay, "raise");
    const others = players.filter(p=>p.id!==turnPlayer.id && !p.folded && !p.all_in).map(p=>p.id);
    if(others.length) await supabase.from("poker_players").update({ acted:false }).in("id", others);
    await afterActionAdvance(true);
  }

  async function actAllIn(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    if(turnPlayer.stack_live <= 0) return; // בדיקה נוספת
    
    const pay = turnPlayer.stack_live;
    const actType = (maxStreetBet(players)===0 ? "bet" : "raise");
    
    // עדכן את השחקן ל-ALL-IN
    await supabase.from("poker_players").update({
      all_in: true,
      acted: true
    }).eq("id", turnPlayer.id);
    
    await takeChips(ses.id, turnPlayer.seat_index, pay, "allin");
    
    // איפוס acted לכל האחרים (שיצטרכו להגיב)
    const others = players.filter(p=>p.id!==turnPlayer.id && !p.folded && !p.all_in).map(p=>p.id);
    if(others.length) await supabase.from("poker_players").update({ acted:false }).in("id", others);
    
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action: actType, amount: pay });
    await afterActionAdvance(true);
  }

  async function afterActionAdvance(resetOthers=false){
    // בדוק אם כולם פעלו או ALL-IN
    if(everyoneActedOrAllIn()){
      await advanceStreet();
      return;
    }
    
    // מעבר לשחקן הבא
    const nextIdx = nextSeatAlive(ses.current_turn);
    if(nextIdx !== null){
      await supabase.from("poker_sessions").update({
        current_turn: nextIdx,
        turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
      }).eq("id", ses.id);
    }
  }

  async function autoAct(){
    if(!turnPlayer || !ses) return;
    // Auto: אם אפשר check → check; אחרת fold
    if(canCheck(turnPlayer, players)) await actCheck();
    else await actFold();
  }

  // ===== UI =====
  const board = ses?.board||[];
  const seatMapMemo = useMemo(()=> new Map(players.map(p=>[p.seat_index,p])), [players]);
  const isMyTurn = !!turnPlayer && turnPlayer.client_id === clientId;
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
            {["preflop","flop","turn","river"].includes(ses?.stage) && (
              <button 
                onClick={()=>advanceStreet(true)}
                className="px-2 py-1 md:px-3 md:py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold text-xs transition-all shadow-lg"
              >
                Force Advance
              </button>
            )}
          </div>
          <div className="text-white/60 text-xs mb-2">Vault: {fmt(getVault())} MLEO</div>
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
              <button onClick={actFold} disabled={!isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                FOLD
              </button>
              <button onClick={actCheck} disabled={!isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CHECK
              </button>
              <button onClick={actCall} disabled={!isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CALL
              </button>
              <button onClick={actAllIn} disabled={!isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                ALL-IN
              </button>
            </div>
            
            <div className="flex gap-1 items-center">
              <input
                type="number" min="0" step="10" value={betInput}
                onChange={e=>setBetInput(Number(e.target.value||0))}
                className="flex-1 bg-black/40 text-white text-xs rounded-lg px-1 py-0.5 md:px-2 md:py-1 border border-white/20 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount"
              />
              <button onClick={()=>actBet(betInput)} disabled={!isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                BET
              </button>
              <button onClick={()=>actRaise(betInput)} disabled={!isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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
