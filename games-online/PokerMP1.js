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

  // Set callback for vault update
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
  const [busy, setBusy] = useState(false);
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

  // Prevent races in street advancement (flop/turn/river)
  const advancingRef = useRef(false);

  async function autopilot() {
    if (!isLeader) return;
    
    // If there are 2+ players and no active session, start game
    if (players.length >= 2 && (!ses || ses.stage === 'lobby')) {
      await startHand();
      return;
    }
    
    // Only run autopilot if turn deadline has passed
    if (ses?.turn_deadline) {
      const now = Date.now();
      const deadline = new Date(ses.turn_deadline).getTime();
      if (now < deadline) return; // Don't run if deadline hasn't passed
    }
    
    // If everyone acted, move to next stage
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

  // Helper functions for checking seated players
  async function seatedPlayersOf(sessionId) {
    const { data } = await supabase
      .from("poker_players")
      .select("id, seat_index, folded, stack_live, acted, bet_street, all_in")
      .eq("session_id", sessionId);
    return data || [];
  }

  async function requireAtLeastTwo(sessionId) {
    const seated = await seatedPlayersOf(sessionId);
    // "Seated" = has seat_index (regardless of stack_live)
    return seated.filter(p => p.seat_index !== null && p.seat_index !== undefined).length >= 2;
  }

  // Find the first alive seat after BB
  async function firstAliveAfterBB(sessionId, bbSeat) {
    const seated = await seatedPlayersOf(sessionId);
    const maxBet = Math.max(...seated.map(p => p.bet_street || 0), 0);
    for (let k = 1; k <= seats; k++) {
      const idx = (bbSeat + k) % seats;
      const p = seated.find(x => x.seat_index === idx);
      if (p && !p.folded && !p.all_in && (p.stack_live || 0) > 0) {
        // Check if this player needs to act (not aligned or not acted)
        const needsAction = (p.bet_street||0) !== maxBet || !p.acted;
        if(needsAction) return idx;
      }
    }
    return null;
  }

  // Helper functions for proper hand start
  function orderBySeat(startSeat, seats) {
    return Array.from({length: seats}, (_, i) => (startSeat + i) % seats);
  }

  function firstAliveAfter(seated, fromSeat, seats) {
    const order = orderBySeat(fromSeat + 1, seats);
    for (const idx of order) {
      const p = seated.find(x => x.seat_index === idx);
      if (p && !p.folded && !p.all_in && (p.stack_live ?? 0) > 0) return idx;
    }
    return null;
  }

  // Post blinds without touching acted
  async function postBlinds(sessionId, sbSeat, bbSeat, sbAmt, bbAmt) {
    const { data: players } = await supabase
      .from("poker_players")
      .select("id,seat_index,stack_live,bet_street,total_bet")
      .eq("session_id", sessionId);

    const sb = players.find(p => p.seat_index === sbSeat);
    const bb = players.find(p => p.seat_index === bbSeat);
    const sPay = Math.min(sbAmt, sb?.stack_live ?? 0);
    const bPay = Math.min(bbAmt, bb?.stack_live ?? 0);

    if (sb) await supabase.from("poker_players").update({
      stack_live: sb.stack_live - sPay,
      bet_street: (sb.bet_street||0) + sPay,
      total_bet: (sb.total_bet||0) + sPay
    }).eq("id", sb.id);

    if (bb) await supabase.from("poker_players").update({
      stack_live: bb.stack_live - bPay,
      bet_street: (bb.bet_street||0) + bPay,
      total_bet: (bb.total_bet||0) + bPay
    }).eq("id", bb.id);

    await supabase.from("poker_actions").insert([
      { session_id: sessionId, seat_index: sbSeat, action: "blind_sb", amount: sPay },
      { session_id: sessionId, seat_index: bbSeat, action: "blind_bb", amount: bPay }
    ]);
  }

  // Check that the game hasn't ended prematurely
  function canAct(player) {
    if (!player || player.folded || player.all_in) return false;
    if (ses?.current_turn !== player.seat_index) return false;
    if (ses?.stage === 'showdown') return false;
    return true;
  }

  // ===== Take Seat =====
  async function takeSeat(seatIndex) {
    if (!clientId) { setMsg("Client not recognized"); return; }

    // Ensure there's a session in LOBBY state – don't start hand here
    let session = ses;
    if (!session || !session.id) {
      session = await ensureSession(roomId);
    }

    // Do I already have a row in the session?
    const { data: mine } = await supabase
      .from("poker_players")
      .select("id, seat_index, client_id")
      .eq("session_id", session.id)
      .eq("client_id", clientId)
      .maybeSingle();

    // Check target seat occupancy
    const { data: occ } = await supabase
      .from("poker_players")
      .select("id, client_id")
      .eq("session_id", session.id)
      .eq("seat_index", seatIndex)
      .maybeSingle();

    // If occupied by someone else
    if (occ && occ.client_id && occ.client_id !== clientId) {
      setMsg("Seat is taken");
      return;
    }

    // Move seat if I have an existing row
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

    // Create new if I don't have one
    if (!mine) {
      // Check balance
      const currentVault = getVault();
      if (currentVault < 1000) { setMsg("Insufficient vault balance (min 1000 MLEO)"); return; }

      const { error: upErr } = await supabase.from("poker_players").upsert({
        session_id: session.id,
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

      // Deduct from vault only after success
      const newVault = currentVault - 1000;
      setVault(newVault);
      if (setVaultBoth) setVaultBoth(newVault);
    }

    setMsg("");
  }

  function nextSeatAlive(startIdx){
    const maxBet = maxStreetBet(players);
    for(let k=1;k<=seats;k++){
      const idx = (startIdx + k) % seats;
      const p = seatMap.get(idx);
      if(p && !p.folded && !p.all_in && p.stack_live>0) {
        // Check if this player needs to act (not aligned or not acted)
        const needsAction = (p.bet_street||0) !== maxBet || !p.acted;
        if(needsAction) return idx;
      }
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
    
    // Check if everyone actually acted AND bets are aligned
    const allActed = alive.every(p => p.acted === true || p.all_in);
    const betsAligned = alive.every(p => (p.bet_street||0) === maxBet);
    
    return allActed && betsAligned;
  }

  async function resetStreetActs(){
    // Reset only for alive players (not folded, not all-in)
    const alivePlayers = players.filter(p => !p.folded && !p.all_in && (p.stack_live || 0) > 0);
    if (alivePlayers.length > 0) {
      const aliveIds = alivePlayers.map(p => p.id);
      await supabase.from("poker_players").update({ 
        bet_street: 0, 
        acted: false 
      }).in("id", aliveIds);
    }
  }

  async function advanceStreet(auto=false){
    if(!ses || advancingRef.current) return;
    advancingRef.current = true;
    try {
      // Read current state from DB to prevent decisions based on old memory
      const { data: s } = await supabase
        .from("poker_sessions")
        .select("id, stage, board, deck_remaining, dealer_seat, current_turn, turn_deadline")
        .eq("id", ses.id)
        .single();
      if (!s) return;

      // If only one player remains — automatic win without ranking
      const aliveNow = players.filter(p => !p.folded);
      if (aliveNow.length <= 1) {
        const winnerSeat = aliveNow[0]?.seat_index;
        await supabase.from("poker_sessions").update({
          stage: "showdown", winners: winnerSeat!=null ? [winnerSeat] : [], current_turn: null, turn_deadline: null
        }).eq("id", s.id);
        return;
      }

      const board = Array.isArray(s.board) ? [...s.board] : [];
      let d = Array.isArray(s.deck_remaining) ? [...s.deck_remaining] : [];

      // Don't allow more than 5
      if (board.length >= 5) return;

      let nextStage = s.stage;

      if (s.stage === "preflop") {
        if (board.length !== 0 || d.length < 3) return; // Flop only once
        board.push(d.pop(), d.pop(), d.pop());
        nextStage = "flop";
      } else if (s.stage === "flop") {
        if (board.length !== 3 || d.length < 1) return;
        board.push(d.pop());
        nextStage = "turn";
      } else if (s.stage === "turn") {
        if (board.length !== 4 || d.length < 1) return;
        board.push(d.pop());
        nextStage = "river";
      } else if (s.stage === "river") {
        nextStage = "showdown";
      } else {
        return;
      }

      let next = null;
      if (nextStage !== "showdown") {
        // Use the new function for selecting alive player
        const seated = await seatedPlayersOf(s.id);
        for (let k = 1; k <= seats; k++) {
          const idx = (s.dealer_seat + k) % seats;
          const p = seated.find(x => x.seat_index === idx);
          if (p && !p.folded && (p.stack_live || 0) > 0) {
            next = idx;
            break;
          }
        }
      }

      // Conditional update: only if stage hasn't changed since the call (prevents multiple openings)
      const { error: updErr } = await supabase
        .from("poker_sessions")
        .update({
          board,
          deck_remaining: d,
          stage: nextStage,
          current_turn: next,
          turn_deadline: next ? new Date(Date.now()+TURN_SECONDS*1000).toISOString() : null
        })
        .eq("id", s.id)
        .eq("stage", s.stage);

      if (!updErr) {
        // Reset street state only after successful advancement
        await resetStreetActs();
      }

      if (nextStage === "showdown") {
        await showdownAndSettle();
      }
    } finally {
      advancingRef.current = false;
    }
  }

  async function showdownAndSettle(){
    // If only one remains – they are the winner
    const alive = players.filter(p=>!p.folded);
    const winners = (alive.length === 1)
      ? [alive[0].seat_index]
      : determineWinnersAuto(players, ses.board||[]);
    await supabase.from("poker_sessions").update({ stage:"showdown", winners, current_turn:null, turn_deadline:null }).eq("id", ses.id);
    await settlePots(ses.id, ses.board||[], players);
  }

  // ===== Ensure Session (create lobby if none exists) =====
  async function ensureSession(roomId) {
    // If session already exists for this room – return it
    const { data: exist } = await supabase
      .from("poker_sessions")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle();
    if (exist) return exist;

    // Create new session in LOBBY state only (don't start hand!)
    const deck = newDeck();
    const { data: ins, error } = await supabase
      .from("poker_sessions")
      .insert({
        room_id: roomId,
        hand_no: 1,
        stage: "lobby",
        dealer_seat: 0,
        sb_seat: 0,
        bb_seat: 0,
        board: [],
        deck_remaining: deck,
        pot_total: 0,
        min_bet: 20,
        current_turn: null,
        turn_deadline: null,
        winners: []
      })
      .select()
      .single();
    if (error || !ins) throw error || new Error("failed to create session");
    // Main pot
    await supabase.from("poker_pots").insert({ session_id: ins.id, total: 0, eligible: [] });
    // Update local state so UI sees there's a session
    setSes(ins);
    return ins;
  }

  // ===== Start / Next hand =====
  async function startHand(){
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      const deck = newDeck();
      
      // Ensure there's a session (lobby). If not – create one but don't start hand immediately.
      const exist = await ensureSession(roomId);
      const sessionId = exist.id;

      // Get seated players
      const seated = await seatedPlayersOf(sessionId);
      const seatedCount = seated.filter(p => p.seat_index !== null && p.seat_index !== undefined).length;
      if (seatedCount < 2) {
        setMsg("Need at least two players seated at the table to start.");
        return; // Stay in lobby; players can still sit
      }

      // Auto-topup players with 0 or negative stack
      const BB = 20;
      const SB = Math.floor(BB / 2);
      const MIN_STACK = Math.max(1000, BB * 10);

      const needTopup = seated.filter(p => (p.stack_live || 0) <= 0);
      if (needTopup.length > 0) {
        await supabase.from("poker_players")
          .update({ stack_live: MIN_STACK })
          .in("id", needTopup.map(p => p.id));
      }

      // Now get active players (after topup)
      const active = seated.filter(p => p.stack_live > 0);

      // Determine dealer - keep from session if exists, otherwise use first active
      let dealer = exist ? (exist.dealer_seat + 1) % seats : 0;
      if (!active.find(p => p.seat_index === dealer)) {
        dealer = active[0].seat_index;
      }

      // Heads-up rule: SB = dealer, BB = the other; otherwise SB=left of dealer, BB=left of SB
      let sbSeat, bbSeat;
      if (active.length === 2) {
        sbSeat = dealer;
        bbSeat = active.find(p => p.seat_index !== dealer).seat_index;
      } else {
        sbSeat = firstAliveAfter(seated, dealer, seats);
        bbSeat = firstAliveAfter(seated, sbSeat, seats);
      }

      // Update session with proper dealer/blinds
      if(exist) {
        await supabase.from("poker_sessions").update({
          hand_no: exist.hand_no+1, stage:"lobby",
          dealer_seat: dealer, sb_seat: sbSeat, bb_seat: bbSeat,
          board:[], deck_remaining: deck, pot_total:0, winners:[],
          min_bet: 20,
          current_turn: null,
          turn_deadline: null
        }).eq("id", sessionId);
        await supabase.from("poker_pots").update({ total:0, eligible:[] }).eq("session_id", sessionId);
      }

      // Reset players for new hand (no one acted yet)
      await supabase.from("poker_players").update({
        folded: false, all_in: false, acted: false, bet_street: 0, total_bet: 0, hole_cards: []
      }).eq("session_id", sessionId);

      // Post blinds without touching acted
      await postBlinds(sessionId, sbSeat, bbSeat, SB, BB);

      // Deal hole cards
      let d = [...deck];
      const { data: allPlayers } = await supabase
        .from("poker_players")
        .select("id, seat_index, hole_cards")
        .eq("session_id", sessionId)
        .order("seat_index");

      for (let round = 0; round < 2; round++) {
        for (const P of (allPlayers || [])) {
          const c = d.pop();
          const hand = Array.isArray(P.hole_cards) ? [...P.hole_cards, c] : [c];
          await supabase.from("poker_players").update({ hole_cards: hand }).eq("id", P.id);
        }
      }

      // First to act preflop:
      // - 2-handed: SB (dealer) acts first
      // - 3+ players: first alive left of BB
      const preflopFirst = (active.length === 2)
        ? sbSeat
        : firstAliveAfter(seated, bbSeat, seats);

      await supabase.from("poker_sessions").update({
        stage: "preflop",
        current_turn: preflopFirst,
        turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString(),
        deck_remaining: d
      }).eq("id", sessionId);

    } finally {
      startingRef.current = false;
    }
  }

  async function takeChips(sessionId, seatIndex, amount, action){
    const { data: pl } = await supabase.from("poker_players")
      .select("*").eq("session_id", sessionId).eq("seat_index", seatIndex).maybeSingle();
    if(!pl) return; // ⬅️ Don't charge from empty seat
    
    const { data: pot } = await supabase.from("poker_pots").select("*").eq("session_id", sessionId).maybeSingle();

    const pay = Math.min(amount, pl.stack_live);
    
    // If this is the local player, deduct money from vault (compare by client_id)
    if (pl.client_id && pl.client_id === clientId) {
      const currentVault = getVault();
      if (currentVault < pay) {
        setMsg("Insufficient vault balance");
        return;
      }
      const newVault = currentVault - pay;
      setVault(newVault);
      // Also update the state on the main page
      if (setVaultBoth) {
        setVaultBoth(newVault);
      }
    }
    
    await supabase.from("poker_players").update({
      stack_live: pl.stack_live - pay,
      bet_street: (pl.bet_street||0) + pay,
      total_bet:  (pl.total_bet||0)  + pay,
      all_in: (pl.stack_live - pay)===0
      // Note: Don't set acted=true here - let the specific action functions handle it
    }).eq("id", pl.id);
    await supabase.from("poker_pots").update({ total: (pot?.total||0) + pay }).eq("session_id", sessionId);
    await supabase.from("poker_actions").insert({ session_id: sessionId, seat_index: seatIndex, action, amount: pay });
  }

  // ===== Player Acts =====
  async function doAction(act, amount = 0) {
    if (busy) return;
    try {
      setBusy(true);
      await act(amount);
    } finally {
      setBusy(false);
    }
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
    
    await afterActionAdvance();
  }

  async function actCheck(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    if(!canCheck(turnPlayer, players)) return; // Not legal
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
    // Mark as acted after taking chips
    await supabase.from("poker_players").update({ acted:true }).eq("id", turnPlayer.id);
    await afterActionAdvance();
  }

  async function actBet(amount){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    const maxBet = maxStreetBet(players);
    if(maxBet>0) return; // If there's already a raise/bet — this is actually a raise
    const minBet = ses.min_bet || 20;
    if(amount < minBet) amount = minBet;
    amount = Math.min(amount, turnPlayer.stack_live);
    await takeChips(ses.id, turnPlayer.seat_index, amount, "bet");
    // Mark as acted after taking chips
    await supabase.from("poker_players").update({ acted:true }).eq("id", turnPlayer.id);
    // Reset acted for all others (who will need to respond)
    const others = players.filter(p=>p.id!==turnPlayer.id && !p.folded && !p.all_in).map(p=>p.id);
    if(others.length) await supabase.from("poker_players").update({ acted:false }).in("id", others);
    await afterActionAdvance(true);
  }

  async function actRaise(amount){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    const maxBet = maxStreetBet(players);
    const needToCall = Math.max(0, maxBet - (turnPlayer.bet_street||0));
    const minR = minRaiseAmount(players, ses.min_bet||20);
    const raiseBy = Math.max(minR, amount); // Size of the raise
    const pay = Math.min(needToCall + raiseBy, turnPlayer.stack_live);
    if(pay<=0) return;
    await takeChips(ses.id, turnPlayer.seat_index, pay, "raise");
    // Mark as acted after taking chips
    await supabase.from("poker_players").update({ acted:true }).eq("id", turnPlayer.id);
    const others = players.filter(p=>p.id!==turnPlayer.id && !p.folded && !p.all_in).map(p=>p.id);
    if(others.length) await supabase.from("poker_players").update({ acted:false }).in("id", others);
    await afterActionAdvance(true);
  }

  async function actAllIn(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    if(turnPlayer.stack_live <= 0) return; // Additional check
    
    const pay = turnPlayer.stack_live;
    const actType = (maxStreetBet(players)===0 ? "bet" : "raise");
    
    // Update player to ALL-IN
    await supabase.from("poker_players").update({
      all_in: true,
      acted: true
    }).eq("id", turnPlayer.id);
    
    await takeChips(ses.id, turnPlayer.seat_index, pay, "allin");
    
    // Reset acted for all others (who will need to respond)
    const others = players.filter(p=>p.id!==turnPlayer.id && !p.folded && !p.all_in).map(p=>p.id);
    if(others.length) await supabase.from("poker_players").update({ acted:false }).in("id", others);
    
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action: actType, amount: pay });
    await afterActionAdvance(true);
  }

  async function afterActionAdvance(resetOthers=false){
    // Check if hand should end immediately (only one player left)
    if (await afterActionMaybeEnd(ses.id)) {
      return;
    }
    
    // Check if everyone acted or ALL-IN
    if(everyoneActedOrAllIn()){
      await advanceStreet();
      return;
    }
    
    // Move to next player
    const nextIdx = nextSeatAlive(ses.current_turn);
    if(nextIdx !== null){
      await supabase.from("poker_sessions").update({
        current_turn: nextIdx,
        turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
      }).eq("id", ses.id);
    }
  }

  // Check if hand should end immediately
  function alive(players) {
    return players.filter(p => !p.folded && (p.stack_live ?? 0) >= 0);
  }

  async function awardPotAndClose(sessionId, winnerSeatIdx) {
    const { data: sess } = await supabase.from("poker_sessions").select("pot_total").eq("id", sessionId).single();
    const { data: pls } = await supabase.from("poker_players")
      .select("id,seat_index,stack_live,bet_street").eq("session_id", sessionId);

    const w = pls.find(p => p.seat_index === winnerSeatIdx);
    if (!w) return;

    // חשב את כל הכסף על השולחן: pot_total + סך bet_street של כולם
    const streetSum = pls.reduce((s,p) => s + Number(p.bet_street||0), 0);
    const totalPot = Number(sess?.pot_total||0) + streetSum;

    // אפס הימור רחוב אצל כולם
    await supabase.from('poker_players')
      .update({ bet_street: 0 })
      .eq('session_id', sessionId);

    // הוסף את כל הקופה ל-stack_live של המנצח
    await supabase.from("poker_players").update({
      stack_live: (w.stack_live||0) + totalPot
    }).eq("id", w.id);

    await supabase.from("poker_actions").insert({ 
      session_id: sessionId, 
      seat_index: winnerSeatIdx, 
      action:"win", 
      amount: totalPot,
      note: 'winner by fold'
    });

    await supabase.from("poker_sessions").update({
      pot_total: 0,
      stage:"showdown", 
      current_turn:null, 
      turn_deadline:null
    }).eq("id", sessionId);
  }

  async function afterActionMaybeEnd(sessionId) {
    const { data: players } = await supabase.from("poker_players")
      .select("seat_index,folded,all_in,bet_street").eq("session_id", sessionId);
    const live = alive(players);

    // If only one player left -> immediate win
    if (live.length === 1) {
      await awardPotAndClose(sessionId, live[0].seat_index);
      return true;
    }
    return false;
  }

  async function autoAct(){
    if(!turnPlayer || !ses) return;
    
    // Only auto-act if deadline has passed
    if (ses.turn_deadline) {
      const now = Date.now();
      const deadline = new Date(ses.turn_deadline).getTime();
      if (now < deadline) return; // Don't auto-act if deadline hasn't passed
    }
    
    // Auto: if can check → check; otherwise fold
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
              disabled={busy}
              onClick={async ()=>{
                if (busy) return;
                setBusy(true);
                try {
                  if (!ses?.id) { 
                    await startHand(); 
                    return; 
                  }
                  const ok = await requireAtLeastTwo(ses.id);
                  if (!ok) { 
                    setMsg("Need at least two players seated to start."); 
                    return; 
                  }
                  await startHand();
                } finally {
                  setBusy(false);
                }
              }}
              className="px-2 py-1 md:px-3 md:py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-xs transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
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
              <button onClick={()=>doAction(actFold)} disabled={busy || !isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                FOLD
              </button>
              <button onClick={()=>doAction(actCheck)} disabled={busy || !isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CHECK
              </button>
              <button onClick={()=>doAction(actCall)} disabled={busy || !isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CALL
              </button>
              <button onClick={()=>doAction(actAllIn)} disabled={busy || !isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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
              <button onClick={()=>doAction(actBet, betInput)} disabled={busy || !isMyTurn || betInput <= 0} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                BET
              </button>
              <button onClick={()=>doAction(actRaise, betInput)} disabled={busy || !isMyTurn} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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
