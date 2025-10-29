// games-online/PokerMP.js
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  maxStreetBet, minRaiseAmount,
  startHand as engineStartHand, advanceStreet as engineAdvanceStreet,
  settlePots as engineSettlePots
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
  const maxBet = maxStreetBet(pls); // from engine
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

  // Set callback for vault updates
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
  const [potRow, setPotRow] = useState(null);
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

  // ===== Realtime pot =====
  useEffect(() => {
    if(!ses?.id) return;
    const ch = supabase.channel("poker_pots:"+ses.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"poker_pots",filter:`session_id=eq.${ses.id}`},
        async ()=>{
          const { data } = await supabase.from("poker_pots").select("*").eq("session_id", ses.id).maybeSingle();
          setPotRow(data||{ total:0 });
        })
      .subscribe(async (st)=>{
        if(st==="SUBSCRIBED"){
          const { data } = await supabase.from("poker_pots").select("*").eq("session_id", ses.id).maybeSingle();
          setPotRow(data||{ total:0 });
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
    const readyPlayers = players.filter(p => p.seat_index !== null && Number(p.stack_live||0) > 0);
    const seatedCount  = readyPlayers.length;

    // When 2 players are seated — start game
    if (seatedCount >= MIN_PLAYERS_TO_START && (!ses || ses.stage === 'lobby')) {
      await startHand();
      return;
    }


    // After showdown — wait a bit then start new hand
    if (ses && ses.stage === 'showdown') {
      await new Promise(r => setTimeout(r, 3000)); // Small delay before new hand
      if (players.filter(p => p.seat_index !== null && Number(p.stack_live||0) > 0).length >= MIN_PLAYERS_TO_START) {
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

  // Check that game hasn't ended prematurely
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
    const canLoad = !!ses && (ses.stage === 'lobby' || (ses.stage === 'showdown' && !ses.turn_deadline));
    if (!canLoad) return;
    const vault = readVault();
    const amt = Math.min(Math.max(MIN_REBUY, Math.floor(Number(amount||0))), vault);
    if (amt <= 0) return;

    try{
      setRebuyBusy(true);
      writeVault(vault - amt);
      if (myRow?.id && myRow?.seat_index != null) {
        // ✅ Seated: load chips to table
        await supabase.from('poker_players')
          .update({ stack_live: Number(myRow.stack_live||0) + amt })
          .eq('id', myRow.id);
      } else {
        // ✅ Not seated: do Buy-in from Vault and seat
        const targetSeat = 0; // Find first available seat or use preferred logic
        await supabase.from('poker_players').upsert({
          session_id: ses.id,
          seat_index: targetSeat,
          player_name: name,
          client_id: clientId,
          stack_live: amt,
          bet_street: 0,
          total_bet: 0,
          hole_cards: [],
          folded: false,
          all_in: false,
          acted: false
        }, { onConflict: 'session_id,seat_index' });
      }
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

    // Create session if none exists - but don't use local ses until it's refreshing
    let session = ses;
    if (!session || !session.id) {
      session = await ensureSession(roomId, tierCode);
    }

    // Meanwhile, update local state
    setSes(session);

    // Check balance - minimum buy-in
    const minBuyin = Math.max(Number(session?.min_buyin || 0), 1000);
    const want = Math.floor(Math.max(minBuyin, minBuyin));
    const currentVault = readVault();
    
    if (currentVault < want) { 
      setMsg(`Insufficient vault balance (min ${minBuyin} MLEO)`); 
      return; 
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

    // Move seat if I have existing row
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

      // Deduct from vault only after success
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
    
    // Check if everyone acted or ALL-IN or their bet equals maximum
    return alive.every(p => p.acted || p.all_in || (p.bet_street||0) === maxBet);
  }

  async function resetStreetActs(){
    await supabase.from("poker_players").update({ bet_street:0, acted:false })
      .eq("session_id", ses.id);
  }


  async function showdownAndSettle(){
    // If one remains - he's the winner
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
    // ✅ Don't start if less than 2 with stack_live>0
    const ready = players.filter(p => p.seat_index!==null && Number(p.stack_live||0)>0);
    if (ready.length < 2) { setMsg("Need two players with chips on table to start"); return; }

    startingRef.current = true;
    try {
      // Ensure there's a Session (if first player enters and it's still 'null')
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
    if(!pl) return; // ⬅️ Don't backup from empty session
    
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
    // 1) Read current state
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

    // 2) Calculate total on table (pot + all current bets)
    const streetSum = players.reduce((s,p)=> s + Number(p.bet_street||0), 0);
    const potTotal = Number(ses.pot_total||0) + Number(pot?.total||0);
    const totalPot = potTotal + streetSum;

    // 3) Reset current bet for everyone (so it doesn't "remain on table")
    await supabase
      .from('poker_players')
      .update({ bet_street: 0 })
      .eq('session_id', sessionId);

    // 4) Transfer all pot to winner
    const winner = players.find(p => p.seat_index === winnerSeat);
    if (winner) {
      await supabase
        .from('poker_players')
        .update({ stack_live: winner.stack_live + totalPot })
        .match({ session_id: sessionId, seat_index: winnerSeat });
    }

    // 5) Clear session state — no turn, no deadline, pot empty
    await supabase
      .from('poker_sessions')
      .update({
        pot_total: 0,
        stage: 'lobby',         // ✅ No showdown – win by fold
        current_turn: null,
        turn_deadline: null,
      })
      .eq('id', sessionId);

    await supabase
      .from('poker_pots')
      .update({ total: 0 })
      .eq('session_id', sessionId);

    // 6) Log "win" action
    await supabase.from('poker_actions').insert({
      session_id: sessionId,
      action: 'win',
      amount: totalPot,
      note: `winner seat=${winnerSeat} by fold`,
    });
  }

  // ===== All-In Capped Helper =====
  async function applyAllInCapped(sessionId, actorSeat) {
    // Read current state
    const { data: ses } = await supabase
      .from('poker_sessions').select('id').eq('id', sessionId).single();

    const { data: pls } = await supabase
      .from('poker_players')
      .select('id, seat_index, bet_street, stack_live, folded')
      .eq('session_id', sessionId);

    const me = pls.find(p => p.seat_index === actorSeat);
    if (!me || me.folded) return { ok: false, reason: 'no-actor' };

    // Maximum investment opponents can cover (Heads-Up is simple)
    const opps = pls.filter(p => p.seat_index !== actorSeat && !p.folded);
    const oppMaxCommit = Math.max(
      0,
      ...opps.map(o => Number(o.bet_street||0) + Number(o.stack_live||0))
    );

    // How much I can "commit" total in hand: what I already put + what I have left
    const myMaxCommit = Number(me.bet_street||0) + Number(me.stack_live||0);

    // New "commitment" cannot exceed what opponents can cover
    const targetCommit = Math.min(myMaxCommit, oppMaxCommit);

    // How much more to add now (above what I already put)
    const addNow = Math.max(0, targetCommit - Number(me.bet_street||0));

    if (addNow > 0) {
      // Move to pot only the covered amount
      await takeChips(sessionId, actorSeat, addNow);
    }

    // If I contributed everything I had - I'm really ALL-IN, otherwise I'm not ALL-IN
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

    if (!everyoneLocked) return; // Still have player who can act

    // Collect street bet that hasn't been moved to pot yet
    const streetSum = (pls||[]).reduce((s,p)=> s + Number(p.bet_street||0), 0);
    if (streetSum > 0) {
      await supabase.from('poker_players')
        .update({ bet_street: 0 })
        .eq('session_id', sessionId);

      await supabase.from('poker_sessions')
        .update({ pot_total: Number(ses.pot_total||0) + streetSum, to_call: 0 })
        .eq('id', sessionId);
    }

    // Complete board to 5 cards
    let board = [...(ses.board||[])];
    let deck  = [...(ses.deck_remaining||[])];

    if (board.length === 0 && deck.length >= 3) { board.push(...deck.splice(0,3)); } // flop
    if (board.length === 3 && deck.length >= 1) { board.push(...deck.splice(0,1)); } // turn
    if (board.length === 4 && deck.length >= 1) { board.push(...deck.splice(0,1)); } // river

    await supabase.from('poker_sessions').update({
      board,
      deck_remaining: deck,
      stage: 'showdown',
      current_turn: null,
      to_call: 0,
      turn_deadline: null
    }).eq('id', sessionId);

    // In showdown: card display for non-folded players is already handled in UI (based on ses.stage==='showdown' && !folded)
    // And if you have a settlePots function - call it:
    await engineSettlePots(sessionId, ses.board || [], pls); // ✅ Always run actual pot distribution
  }

  // ===== Player Acts =====
  async function actFold(){
    if(!turnPlayer || !ses || !canAct(turnPlayer)) return;
    await supabase.from("poker_players").update({ folded:true, acted:true, hole_cards: [] }).eq("id", turnPlayer.id);
    await supabase.from("poker_actions").insert({ session_id: ses.id, seat_index: turnPlayer.seat_index, action:"fold" });
    
    await afterActionAdvanceStrict();
  }

  async function actCheck(){
    // Pull current state to avoid falling on old state
    const { data: sesNow } = await supabase
      .from('poker_sessions').select('id,to_call').eq('id', ses.id).single();
    if (!isMyTurn(ses, myRow)) return;
    if (Number(sesNow.to_call || 0) > 0) return; // Can't check when there's debt

    await supabase.from('poker_players')
      .update({ acted: true })   // Don't change bet_street in check
      .eq('id', myRow.id);

    await afterActionAdvanceStrict();
  }

  async function actCall(){
    if (!isMyTurn(ses, myRow)) return;
    // Calculate debt to me: max(bet_street) - mine
    const { data: pls } = await supabase
      .from('poker_players').select('seat_index,folded,bet_street').eq('session_id', ses.id);
    const active = (pls||[]).filter(p => !p.folded && p.seat_index !== null);
    const maxBet = Math.max(0, ...active.map(p => Number(p.bet_street||0)));
    const mine = Number(myRow.bet_street || 0);
    const need = Math.max(0, maxBet - mine);
    if (need <= 0) return;

    await takeChips(ses.id, myRow.seat_index, need, 'call');
    // Remove double bet_street update - takeChips already does this
    await afterActionAdvanceStrict();
  }

  async function actBet(amount){
    if (!isMyTurn(ses, myRow)) return;
    const { data: sesNow } = await supabase
      .from('poker_sessions').select('to_call').eq('id', ses.id).single();
    if (Number(sesNow.to_call || 0) > 0) return; // When there's debt can't "bet", only call/raise

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

    // ✅ Let player contribute only what's covered against opponent/s
    await applyAllInCapped(ses.id, myRow.seat_index);

    await supabase.from('poker_actions').insert({
      session_id: ses.id, 
      seat_index: myRow.seat_index, 
      action: 'allin', 
      amount: null
    });

    // If everyone is locked (or folded), run automatic runout
    await maybeAutoRunoutToShowdown(ses.id);

    await afterActionAdvanceStrict();
  }

  // ===== Main function: calculate next turn player and to_call =====
  async function afterActionAdvanceStrict() {
    // 1) Read current state from DB (don't rely on old state)
    const { data: sesNow } = await supabase
      .from('poker_sessions').select('*').eq('id', ses.id).single();
    const { data: pls } = await supabase
      .from('poker_players').select('*').eq('session_id', ses.id);

    const active = (pls || []).filter(p => !p.folded && p.seat_index !== null);
    if (!active.length) return;

    // ✅ If only one active player remains, close hand only if not already closed (avoid double payout)
    if (active.length === 1 && sesNow.stage !== 'showdown') {
      const winnerSeat = active[0].seat_index;
      // Calculate all money on table: from table + sum of bet_street from everyone
      const streetSum = (pls || []).reduce((s,p) => s + Number(p.bet_street||0), 0);
      const { data: potTbl } = await supabase.from('poker_pots').select('total').eq('session_id', ses.id).maybeSingle();
      const totalPot  = Number(potTbl?.total||0) + streetSum;

      // Reset street bet for everyone
      await supabase.from('poker_players')
        .update({ bet_street: 0 })
        .eq('session_id', ses.id);

      // Add all pot to winner's stack_live
      const winnerRow = (pls || []).find(p => p.seat_index === winnerSeat);
      if (winnerRow) {
        await supabase.from('poker_players')
          .update({ stack_live: Number(winnerRow.stack_live||0) + totalPot })
          .eq('id', winnerRow.id);
      }

      // Reset pot in table
      await supabase.from('poker_pots').update({ total: 0 }).eq('session_id', ses.id);
      // End hand
      await supabase.from('poker_sessions').update({
        stage: 'showdown',        // or 'lobby' if you're starting next hand from outside
        current_turn: null,
        to_call: 0,
        turn_deadline: null
      }).eq('id', ses.id);

      // Win log
      await supabase.from('poker_actions').insert({
        session_id: ses.id,
        seat_index: winnerSeat,
        action: 'win',
        amount: totalPot,
        note: 'winner by fold'
      });
      
      // Use engine to settle pots properly
      await engineSettlePots(ses.id, sesNow.board || [], pls);
      return; // Don't continue turn/street calculations
    }

    // 2) Calculate max bet in street
    const maxBet = Math.max(0, ...active.map(p => Number(p.bet_street || 0)));

    // 3) Find who's next in turn: next active player after current_turn who hasn't matched maxBet
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
      // Everyone matched: street ends only when we return to Last Aggressor and he acted (e.g. CHECK).
      const last = sesNow.last_raiser ?? null;
      const lastRow = last!=null ? active.find(p=>p.seat_index===last) : null;

      // If we haven't returned to him yet – pass turn to him with to_call=0 and wait for his action.
      if (last!=null && sesNow.current_turn !== last) {
        await supabase.from('poker_sessions').update({
          current_turn: last,
          to_call: 0,
          turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
        }).eq('id', ses.id);
        return;
      }

      // If it's Last Aggressor's turn and he already 'acted' (e.g. did CHECK) – advance street.
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
      // Otherwise – wait for his action (no independent advance)
      return;
    }

    // 4) There's a player in turn: calculate how much he owes
    const nextRow = active.find(p => p.seat_index === nextSeat);
    const need = Math.max(0, maxBet - Number(nextRow?.bet_street || 0));

    await supabase.from('poker_sessions').update({
      current_turn: nextSeat,
      to_call: need,
      turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString()
    }).eq('id', ses.id);
  }

  async function afterActionAdvance(resetOthers=false){
    // Check if everyone acted or ALL-IN
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
    
    // Move to next player
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
    // Auto: if can check → check; otherwise fold
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
    if (myRow.client_id !== clientId) return; // ✅ Only for me

    const handOver = ses.stage === 'lobby' || (ses.stage === 'showdown' && !ses.turn_deadline);
    if (!handOver) return;

    // ✅ Opens only if I'm actually seated at table and have no chips on it
    const seated = myRow.seat_index != null;
    const broke  = seated && Number(myRow.stack_live || 0) <= 0;
    const v      = readVault();

    if (broke && v > 0) {
      setRebuyAmt(Math.min(DEFAULT_REBUY, v));
      setShowRebuy(true);
    } else {
      setShowRebuy(false);
    }
  }, [ses?.stage, ses?.turn_deadline, myRow?.stack_live, myRow?.seat_index, myRow?.client_id]);
  
  const myTurn = isMyTurn(ses, myRow);
  const canCall = Number(ses?.to_call || 0) > 0;   // For visual display only
  const canCheck = !canCall;
  // ✅ Real pot: from table + street bets not yet collected
  const streetSum = players.reduce((s,p)=> s + Number(p.bet_street||0), 0);
  const pot = Number(potRow?.total||0) + streetSum;
  
  // ===== Vault and Stack Management =====
  const myVault = readVault();
  const myStack = Number(myRow?.stack_live||0);
  const canActNow = myTurn && myStack > 0;          // During hand - must have chips on table
  const inLobby = ses?.stage === 'lobby';
  const seated  = !!myRow && myRow.seat_index != null;

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
                    <HandView 
                      hand={p.hole_cards} 
                      hidden={!(isMe || (ses?.stage === 'showdown' && Array.isArray(ses?.board) && ses.board.length === 5 && !p?.folded))} 
                      isDealing={ses?.stage === 'preflop' || ses?.stage === 'flop' || ses?.stage === 'turn' || ses?.stage === 'river'}
                    />
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
            {players.filter(p=>p.seat_index!==null && Number(p.stack_live||0)>0).length < 2 && (
              <div className="text-xs text-yellow-300 mt-1">Need another player with chips to start</div>
            )}
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
              <button onClick={actFold} disabled={!canActNow} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                FOLD
              </button>
              <button onClick={actCheck} disabled={!canActNow || !canCheck} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CHECK
              </button>
              <button onClick={actCall} disabled={!canActNow || !canCall} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                CALL
              </button>
              <button onClick={actAllIn} disabled={!canActNow} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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
              <button onClick={()=>actBet(betInput)} disabled={!canActNow || canCall || betInput<=0} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                BET
              </button>
              <button onClick={()=>actRaise(betInput)} disabled={!canActNow || !canCall || betInput<=0} className="px-1 py-0.5 md:px-2 md:py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed">
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

            {/* Vault and Re-buy Messages */}
            {!canActNow && !inLobby && myStack<=0 && (
              <div className="text-xs text-red-400 mt-2">Busted from table • Add coins to Vault to continue</div>
            )}
            {inLobby && seated && myVault > 0 && (   // ✅ Only if I'm seated
              <button 
                className="px-3 py-2 rounded-md bg-indigo-600 text-white ml-2 text-xs"
                onClick={()=>{ setRebuyAmt(Math.min(DEFAULT_REBUY, readVault())); setShowRebuy(true); }}
                title={`Vault: ${myVault.toLocaleString()} MLEO`}
              >
                Load from Vault
              </button>
            )}
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
                      onClick={()=>doRebuy(rebuyAmt)} disabled={rebuyBusy || !(inLobby || (ses?.stage==='showdown' && !ses?.turn_deadline)) || !seated}>
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
