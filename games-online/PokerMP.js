// games-online/PokerMP.js
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";
import {
  newDeck, maxStreetBet, canCheck, minRaiseAmount,
  determineWinnersAuto, settlePots
} from "../lib/pokerEngine";

const TURN_SECONDS = Number(process.env.NEXT_PUBLIC_POKER_TURN_SECONDS||20);

// Helper functions
function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

function Card({ code, hidden = false }) {
  if (!code) return null;
  const r = code.slice(0,-1), s = code.slice(-1);
  const suitIcon = s==="h"?"♥":s==="d"?"♦":s==="c"?"♣":"♠";
  const suitClass = (s==="h"||s==="d") ? "text-red-400" : "text-blue-300";
  
  if (hidden) {
    return (
      <div className="inline-flex items-center justify-center border-2 border-white/30 rounded-lg w-10 h-14 mx-1 text-xs font-bold bg-gradient-to-b from-gray-600 to-gray-800 text-white">
        <span className="leading-none">?</span>
      </div>
    );
  }
  
  return (
    <div className={`inline-flex items-center justify-center border-2 border-white/30 rounded-lg w-10 h-14 mx-1 text-xs font-bold bg-gradient-to-b from-white/10 to-white/5 shadow-lg ${suitClass}`}>
      <span className="leading-none">{r}{suitIcon}</span>
    </div>
  );
}

function HandView({ hand, hidden = false }) {
  const h = hand || [];
  return (
    <div className="flex items-center justify-center overflow-x-auto whitespace-nowrap no-scrollbar py-2">
      {h.length===0 ? <span className="text-white/60 text-sm">—</span> : h.map((c,i)=><Card key={i} code={c} hidden={hidden}/>)}
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
  const name = playerName || "Guest";
  const seats = 6;

  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
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
      .subscribe(async (st)=>{
        if(st==="SUBSCRIBED"){
          const { data } = await supabase.from("poker_sessions").select("*").eq("room_id", roomId).maybeSingle();
          setSes(data||null);
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
    return alive.every(p => (p.bet_street||0)===maxBet || p.all_in);
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
    if(stage==="preflop"){ board = [...board, d.pop(), d.pop(), d.pop()]; stage="flop"; }
    else if(stage==="flop"){ board = [...board, d.pop()]; stage="turn"; }
    else if(stage==="turn"){ board = [...board, d.pop()]; stage="river"; }
    else if(stage==="river"){ stage="showdown"; }

    let next = null;
    if(stage!=="showdown"){
      next = nextSeatAlive(dealer_seat); // first to act after flop: left of dealer
    }

    await supabase.from("poker_sessions").update({
      board, deck_remaining: d, stage, current_turn: next, turn_deadline: next? new Date(Date.now()+TURN_SECONDS*1000).toISOString() : null
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
      await supabase.from("poker_players").delete().eq("session_id", sessionId);
    }

    // מושיבים מהחדר
    const { data: roomPlayers } = await supabase.from("arcade_room_players").select("*").eq("room_id", roomId).order("joined_at");
    const sit = (roomPlayers||[]).slice(0, seats).map((rp,i)=>({
      session_id: sessionId, player_name: rp.player_name, seat_index:i,
      stack_live: 2000, bet_street:0, total_bet:0, folded:false, all_in:false, acted:false
    }));
    // לאפשר גם יד עם שחקן יחיד לצורכי פיתוח
    if (sit.length < 1) return; // שמור על דרישה למינימום 1

    await supabase
      .from("poker_players")
      .upsert(sit, {
        onConflict: "session_id,seat_index",
        ignoreDuplicates: false,
        returning: "minimal",
      });

    // מחלק Hole — עדכון per-row (מונע 400/409)
    {
      // קרא את השחקנים שזה עתה נוצרו (עם ה-IDs)
      const { data: created, error: selErr } = await supabase
        .from("poker_players")
        .select("id, seat_index, hole_cards")
        .eq("session_id", sessionId)
        .order("seat_index");

      if (selErr) { console.error("select players error:", selErr); return; }

      let d = [...deck];

      // סבב 1 + 2: קלף לכל שחקן
      for (let r = 0; r < 2; r++) {
        for (const P of (created || [])) {
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

      // שמור את החבילה שנותרה
      await supabase.from("poker_sessions").update({ deck_remaining: d }).eq("id", sessionId);
    }

    // אנטה (אם יש)
    if((ses?.ante||0) > 0){
      for(const p of sit){
        await takeChips(sessionId, p.seat_index, ses.ante, "ante");
      }
    }
    // פוסט Blinds – רק אם יש לפחות 2 שחקנים
    if (sit.length >= 2) {
      await takeChips(sessionId, sb, Math.floor((ses?.min_bet||bb)/2), "post_sb");
      await takeChips(sessionId, bbSeat, (ses?.min_bet||bb), "post_bb");
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
    
    // אם זה השחקן המקומי, הוצא כסף מה-vault
    if (pl.player_name === name) {
      const currentVault = getVault();
      if (currentVault < pay) {
        setMsg("Insufficient vault balance");
        return;
      }
      setVault(currentVault - pay);
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
    if(!turnPlayer || !ses) return;
    await supabase.from("poker_players").update({ folded:true, acted:true }).eq("id", turnPlayer.id);
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action:"fold" });
    await afterActionAdvance();
  }

  async function actCheck(){
    if(!turnPlayer || !ses) return;
    if(!canCheck(turnPlayer, players)) return; // לא חוקי
    await supabase.from("poker_players").update({ acted:true }).eq("id", turnPlayer.id);
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action:"check" });
    await afterActionAdvance();
  }

  async function actCall(){
    if(!turnPlayer || !ses) return;
    const maxBet = maxStreetBet(players);
    const need = Math.max(0, maxBet - (turnPlayer.bet_street||0));
    if(need<=0) return actCheck();
    const pay = Math.min(need, turnPlayer.stack_live);
    await takeChips(ses.id, turnPlayer.seat_index, pay, "call");
    await afterActionAdvance();
  }

  async function actBet(amount){
    if(!turnPlayer || !ses) return;
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
    if(!turnPlayer || !ses) return;
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
    if(!turnPlayer || !ses) return;
    const pay = turnPlayer.stack_live;
    if(pay<=0) return;
    const actType = (maxStreetBet(players)===0 ? "bet" : "raise");
    await takeChips(ses.id, turnPlayer.seat_index, pay, "allin");
    const others = players.filter(p=>p.id!==turnPlayer.id && !p.folded && !p.all_in).map(p=>p.id);
    if(others.length) await supabase.from("poker_players").update({ acted:false }).in("id", others);
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action: actType, amount: pay });
    await afterActionAdvance(true);
  }

  async function afterActionAdvance(resetOthers=false){
    // סגירת סטריט? אם כן → advanceStreet
    const maxBet = maxStreetBet(players);
    const nextIdx = nextSeatAlive(ses.current_turn);
    if(everyoneActedOrAllIn()){
      await advanceStreet();
      return;
    }
    if(nextIdx!==null){
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
  const isMyTurn = !!turnPlayer; // (ב-MVP אין auth משתמש—זה תור השחקן במושב הנוכחי)
  const pot = ses?.pot_total || players.reduce((sum,p)=> sum + (p.total_bet||0), 0);

  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70">Select or create a room to start.</div>;

  return (
    <div className="w-full h-full flex flex-col p-1 md:p-2 gap-1 md:gap-2">
      {/* Header */}
      <div className="flex items-center justify-between bg-white/5 rounded-xl p-1 md:p-2 border border-white/10">
        <div className="text-white font-bold text-sm md:text-lg">♠️ Texas Hold'em (MP)</div>
        <div className="flex items-center gap-1 md:gap-2 text-white/80 text-xs">
          <span>Hand #{ses?.hand_no||"-"}</span>
          <span>Stage: {ses?.stage||"lobby"}</span>
          <span>Pot: {fmt(pot)}</span>
        </div>
      </div>

      {/* Board */}
      <div className="bg-gradient-to-r from-green-900/20 to-green-800/20 rounded-xl p-2 md:p-3 border border-green-400/30">
        <div className="text-center">
          <div className="text-white font-bold text-sm md:text-base mb-2">Community Cards</div>
          <HandView hand={board}/>
          <div className="text-white/80 text-xs mt-1">
            {board.length === 0 ? "No cards yet" : 
             board.length === 3 ? "Flop" :
             board.length === 4 ? "Turn" : 
             board.length === 5 ? "River" : ""}
          </div>
        </div>
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 md:gap-2">
        {Array.from({length: seats}).map((_,i)=>{
          const p = seatMapMemo.get(i);
          const isTurn = ses?.current_turn===i && ["preflop","flop","turn","river"].includes(ses?.stage);
          const isMe = p?.player_name === name;
          return (
            <div key={i} className={`rounded-xl border-2 ${isTurn?'border-emerald-400 bg-emerald-900/20':isMe?'border-blue-400 bg-blue-900/20':'border-white/20 bg-white/5'} p-1 md:p-2 min-h-[120px] md:min-h-[150px] transition-all hover:bg-white/10`}>
              <div className="text-center">
                <div className="text-white/70 text-xs mb-1">
                  Seat #{i+1} 
                  {i===ses?.dealer_seat && " • D"} 
                  {i===ses?.sb_seat && " • SB"} 
                  {i===ses?.bb_seat && " • BB"}
                </div>
                {p ? (
                  <div className="space-y-1 md:space-y-2">
                    <div className="text-white font-bold text-xs md:text-sm truncate">{p.player_name}</div>
                    <div className="text-emerald-300 text-xs font-semibold">Stack: {fmt(p.stack_live)}</div>
                    <div className="text-cyan-300 text-xs">Bet: {fmt(p.bet_street||0)}</div>
                    <div className="text-yellow-300 text-sm">Total: {fmt(p.total_bet||0)}</div>
                    <HandView hand={p.hole_cards} hidden={!isMe}/>
                    {p.folded && <div className="text-red-400 text-sm font-bold">FOLDED</div>}
                    {p.all_in && <div className="text-yellow-400 text-sm font-bold">ALL-IN</div>}
                    {isTurn && <div className="text-emerald-400 text-sm font-bold">YOUR TURN</div>}
                  </div>
                ) : (
                  <div className="text-white/50 text-sm">Empty Seat</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-2">
        <div className="bg-white/5 rounded-xl p-1 md:p-2 border border-white/10">
          <div className="text-white/80 text-xs mb-1 font-semibold">Game Control</div>
          <div className="flex gap-1 flex-wrap">
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
        </div>

        <div className="bg-white/5 rounded-xl p-1 md:p-2 border border-white/10">
          <div className="text-white/80 text-xs mb-1 font-semibold">Player Actions</div>
          {["preflop","flop","turn","river"].includes(ses?.stage) && isMyTurn ? (
            <div className="space-y-1 md:space-y-2">
              <div className="flex gap-1 flex-wrap">
                <button onClick={actFold} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-xs transition-all">
                  FOLD
                </button>
                <button onClick={actCheck} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold text-xs transition-all">
                  CHECK
                </button>
                <button onClick={actCall} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-xs transition-all">
                  CALL
                </button>
                <button onClick={actAllIn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white font-semibold text-xs transition-all">
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
                <button onClick={()=>actBet(betInput)} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold text-xs transition-all">
                  BET
                </button>
                <button onClick={()=>actRaise(betInput)} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-semibold text-xs transition-all">
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
          ) : ses?.stage==="showdown" ? (
            <div className="text-emerald-300 text-sm">Showdown complete. Press "Start / Next Hand".</div>
          ) : (
            <div className="text-white/60 text-sm">Waiting for your turn...</div>
          )}
        </div>
      </div>

      {/* Timer */}
      {ses?.current_turn!=null && ses?.turn_deadline && (
        <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-center">
          <TurnCountdown deadline={ses.turn_deadline} />
        </div>
      )}

      {/* Status Message */}
      {msg && (
        <div className="bg-emerald-900/20 rounded-xl p-4 border border-emerald-400/30 text-center">
          <div className="text-emerald-300 text-sm">{msg}</div>
        </div>
      )}
    </div>
  );
}
