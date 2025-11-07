// games-online/BackgammonMP.js
// Multiplayer Backgammon, JS, aligned with PokerMP patterns.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  initialBoardState, dirFor, oppOf, stepList, canBearOff, legalDestinations,
  applyStep, isFinished, winnerAndMultiplier, nextTurn, applyRoll, canOfferDouble, onAcceptDouble,
  hasAnyMove
} from "../lib/backgammonEngine";

// ===== Config =====
const TURN_SECONDS = Number(process.env.NEXT_PUBLIC_BG_TURN_SECONDS || 35);
const MIN_PLAYERS_TO_START = 2;
const BUYIN_PER_MATCH = Number(process.env.NEXT_PUBLIC_BG_BUYIN || 1000); // Vault points per match (optional)

const MIN_BUYIN_OPTIONS = {
  '1K': 1_000,
  '10K': 10_000,
  '100K': 100_000,
  '1M': 1_000_000,
  '10M': 10_000_000,
  '100M': 100_000_000,
};

// ===== Vault helpers (same spirit as PokerMP) =====
function safeRead(k, d){ try{ const r=localStorage.getItem(k); return r? JSON.parse(r):d }catch{ return d } }
function safeWrite(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch{} }
function readVault(){ const rush = safeRead("mleo_rush_core_v4", {}); return Math.max(0, Number(rush.vault || 0)); }
function writeVault(v){ const rush = safeRead("mleo_rush_core_v4", {}); rush.vault = Math.max(0, Math.floor(v)); safeWrite("mleo_rush_core_v4", rush); if(window.updateVaultCallback) window.updateVaultCallback(rush.vault); }

function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

// ===== UI Components =====
function TurnCountdown({ deadline }) {
  const [left, setLeft] = useState(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now())/1000)));
  useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now())/1000));
      setLeft(remaining);
    }, 100);
    return () => clearInterval(t);
  }, [deadline]);
  return (
    <div className={`px-3 py-1.5 rounded-lg font-bold text-sm transition-all ${
      left <= 10 ? 'bg-red-600 animate-pulse' : 
      left <= 20 ? 'bg-amber-600' : 
      'bg-emerald-600'
    } text-white shadow-lg`}>
      ⏱️ {left}s
    </div>
  );
}

function Dice({ value }) {
  return (
    <div className="w-8 h-8 md:w-10 md:h-10 rounded bg-white text-black shadow flex items-center justify-center text-sm md:text-xl font-bold border border-gray-300">
      {value != null ? String(value) : "?"}
    </div>
  );
}

function Checker({ owner, count, index }) {
  const isStack = count > 1;
  if (!owner) return null; // Don't render if no owner
  
  return (
    <div 
      className={`w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 xl:w-12 xl:h-12 rounded-full border-2 shadow-lg flex items-center justify-center ${
        owner === "A" 
          ? "bg-white border-gray-400 text-black" 
          : owner === "B"
          ? "bg-black border-gray-600 text-white"
          : "bg-gray-500 border-gray-400"
      } ${isStack && index === 0 ? 'ring-2 ring-yellow-400' : ''}`}
      style={{ zIndex: isStack ? (count - index) : 1 }}
    >
      {isStack && index === 0 && (
        <span className={`text-[8px] sm:text-[9px] md:text-[11px] lg:text-sm font-bold ${owner === "A" ? "text-black" : "text-white"}`}>
          {count}
        </span>
      )}
    </div>
  );
}

function Triangle({ up, isAlt }) {
  // Realistic backgammon board colors - alternating light cream and dark brown
  // isAlt = true means light color, false means dark color
  const lightColor = '#E8D5B7';  // Light cream/tan (ivory/beige)
  const darkColor = '#6B4423';   // Dark brown
  
  const bgColor = isAlt ? lightColor : darkColor;
  const borderColor = '#4A3420';
  
  return (
    <div className="relative w-full h-full" style={{ overflow: 'hidden' }}>
      <div 
        className="absolute inset-0"
        style={{
          clipPath: up ? 'polygon(0% 0%, 50% 100%, 100% 0%)' : 'polygon(0% 100%, 50% 0%, 100% 100%)',
          WebkitClipPath: up ? 'polygon(0% 0%, 50% 100%, 100% 0%)' : 'polygon(0% 100%, 50% 0%, 100% 100%)',
          backgroundColor: bgColor,
          borderLeft: `1px solid ${borderColor}`,
          borderRight: `1px solid ${borderColor}`,
          borderTop: up ? `1px solid ${borderColor}` : 'none',
          borderBottom: up ? 'none' : `1px solid ${borderColor}`,
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
        }}
      />
    </div>
  );
}

export default function BackgammonMP({ roomId, playerName, vault, setVaultBoth, tierCode="10K" }){
  useEffect(()=>{ window.updateVaultCallback = setVaultBoth; return ()=>{ delete window.updateVaultCallback; }; },[setVaultBoth]);

  const name = playerName || "Guest";
  const clientId = useMemo(()=>getClientId(), []);
  const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;
  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [pendingStepTo, setPendingStepTo] = useState(null); // quick "click destination"
  const tickRef = useRef(null);

  const isLeader = useMemo(() => {
    if (!roomMembers.length || !name) return false;
    const sorted = [...roomMembers].sort((a,b)=>a.player_name.localeCompare(b.player_name));
    return sorted[0]?.player_name === name;
  }, [roomMembers, name]);

  // ===== channel: sessions per room =====
  useEffect(() => {
    if(!roomId) return;

    const ch = supabase.channel("bg_sessions:"+roomId)
      .on("postgres_changes",{event:"*",schema:"public",table:"bg_sessions",filter:`room_id=eq.${roomId}`}, async ()=>{
        const { data } = await supabase.from("bg_sessions").select("*").eq("room_id", roomId).maybeSingle();
        setSes(data||null);
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState(); const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (st)=>{
        if(st==="SUBSCRIBED"){
          const { data } = await supabase.from("bg_sessions").select("*").eq("room_id", roomId).maybeSingle();
          setSes(data||null);
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });
    return ()=> ch.unsubscribe();
  }, [roomId, name]);

  // ===== channel: players per session =====
  useEffect(() => {
    if(!ses?.id) return;

    const ch = supabase.channel("bg_players:"+ses.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"bg_players",filter:`session_id=eq.${ses.id}`}, async ()=>{
        const { data } = await supabase.from("bg_players").select("*").eq("session_id", ses.id).order("seat_index");
        setPlayers(data||[]);
      })
      .subscribe(async (st)=>{
        if(st==="SUBSCRIBED"){
          const { data } = await supabase.from("bg_players").select("*").eq("session_id", ses.id).order("seat_index");
          setPlayers(data||[]);
        }
      });
    return ()=> ch.unsubscribe();
  }, [ses?.id]);

  // ===== ensure session =====
  async function ensureBgSession(roomId) {
    const { data: existing } = await supabase
      .from('bg_sessions').select('*').eq('room_id', roomId).order('created_at',{ascending:false}).limit(1);
    if(existing && existing.length) return existing[0];

    const board = initialBoardState();
    const { data: created, error } = await supabase
      .from('bg_sessions')
      .insert({
        room_id: roomId,
        stage: 'lobby',
        board_state: board,
        to_move: board.turn,
        current_turn: board.turn==="A" ? 0 : 1,
        turn_deadline: null,
        doubling_enabled: true,
        doubling_owner: null,
        doubling_value: 1
      })
      .select().single();
    if (error) throw error;
    return created;
  }

  // ===== seats =====
  const seats = 2;
  const seatMap = useMemo(()=> new Map(players.map(p=>[p.seat_index,p])), [players]);
  const myRow = players.find(p => p.client_id === clientId) || null;
  const mySeat = myRow?.seat_index ?? null;

  async function takeSeat(seatIndex){
    if (!clientId) { setMsg("Client not recognized"); return; }
    if (readVault() < minRequired) {
      setMsg(`Minimum buy-in is ${fmt(minRequired)}`);
      return;
    }
    let session = ses;
    if (!session || !session.id) {
      session = await ensureBgSession(roomId);
      setSes(session);
    }
    const { data: occ } = await supabase
      .from("bg_players").select("id,client_id").eq("session_id", session.id).eq("seat_index", seatIndex).maybeSingle();
    if (occ && occ.client_id && occ.client_id !== clientId) { setMsg("Seat taken"); return; }

    const { data: mine } = await supabase
      .from("bg_players").select("id,seat_index,client_id").eq("session_id", session.id).eq("client_id", clientId).maybeSingle();

    if (mine && mine.seat_index !== seatIndex) {
      await supabase.from("bg_players").update({ seat_index: seatIndex }).eq("id", mine.id);
      setMsg(""); return;
    }
    if (!mine) {
      const { error: upErr } = await supabase.from("bg_players").upsert({
        session_id: session.id, seat_index: seatIndex, player_name: playerName||"Guest", client_id: clientId, wins: 0
      }, { onConflict: "session_id,seat_index", ignoreDuplicates: false });
      if (upErr) { setMsg(upErr.message?.includes('duplicate') ? "Seat taken" : upErr.message); return; }
    }
    setMsg("");
  }
  async function leaveSeat(){ if(!myRow) return; await supabase.from("bg_players").delete().eq("id", myRow.id); }

    // ===== match start =====
  async function startMatch(){
    if (!isLeader) {
      setMsg("Only the leader can start the game");
      return;
    }
    const seatedPlayers = players.filter(p => p.seat_index !== null);
    if (seatedPlayers.length < MIN_PLAYERS_TO_START) {
      setMsg(`Need ${MIN_PLAYERS_TO_START} players to start`);
      return;
    }
    
    if (!ses || !ses.id) {
      try {
        const newSes = await ensureBgSession(roomId);
        setSes(newSes);
      } catch (err) {
        setMsg(err.message || "Failed to create session");
        return;
      }
    }

    const board = initialBoardState();
    const v = readVault();
    if (mySeat!==null && v >= BUYIN_PER_MATCH) {
      writeVault(v - BUYIN_PER_MATCH);
    }
    
    const { data, error } = await supabase.from("bg_sessions").update({
      stage: "playing",
      board_state: board,
      to_move: board.turn,
      current_turn: board.turn==="A" ? 0 : 1,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id).select().single();
    
    if (error) {
      setMsg(error.message || "Failed to start game");
    } else {
      if (data) {
        setSes(data); // Update local state immediately
      }
      setMsg("");
    }
  }

  // ===== timer (auto) =====
  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(async ()=>{
      if(!ses?.turn_deadline) return;
      const d = new Date(ses.turn_deadline).getTime();
      if(Date.now() >= d) await autoAct();
    }, 250);
    return ()=> clearInterval(tickRef.current);
  }, [ses?.turn_deadline, ses?.current_turn, ses?.stage, mySeat]);

  async function fetchSession(){ const { data } = await supabase.from("bg_sessions").select("*").eq("id", ses.id).single(); return data; }

  async function autoAct(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    const b = { ...(s.board_state) };
    const turnSeat = b.turn==="A" ? 0 : 1;
    if (mySeat !== turnSeat) return; // let the active client act

    // If no roll yet → roll
    if (b.roll?.d1==null || b.roll?.d2==null) { await doRoll(); return; }

    // If cannot move at all → end turn (pass)
    if (!hasAnyMove(b, b.turn)) { await endTurn(b, []); return; }

    // Otherwise: (MVP) do nothing; user must move. You can enable minimal auto-move if wanted.
    await bumpDeadline();
  }

  async function bumpDeadline(){
    await supabase.from("bg_sessions").update({
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id);
  }

  // ===== roll =====
  async function doRoll(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    const b = JSON.parse(JSON.stringify(s.board_state)); // Deep clone
    const seatTurn = b.turn==="A" ? 0 : 1;
    if (mySeat !== seatTurn) return;

    if (b.roll?.d1!=null && b.roll?.d2!=null && b.roll.moves_left>0) return;

    const d1 = 1 + Math.floor(Math.random()*6);
    const d2 = 1 + Math.floor(Math.random()*6);
    applyRoll(b, d1, d2);
    
    const { data, error } = await supabase.from("bg_sessions").update({
      board_state: b,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id).select().single();
    
    if (!error && data) {
      setSes(data); // Update local state immediately
    }
  }

  // ===== movement =====
  async function onPointClick(idx){
    if (ses?.stage!=="playing") return;
    const b = ses?.board_state; if (!b) return;
    const turnSeat = b.turn==="A" ? 0 : 1;
    if (mySeat !== turnSeat) return;
    
    // Handle clicking on "bar" as an index
    if (idx === "bar") {
      if (selectedPoint !== null && selectedPoint !== "bar") {
        // Trying to move FROM selected point TO bar (not typical, but handle it)
        // Actually, in backgammon you don't move TO bar, pieces get hit there
        return;
      }
      if (b.bar[b.turn] > 0) {
        setSelectedPoint(selectedPoint === "bar" ? null : "bar");
      }
      return;
    }
    
    // If we have a selected point/bar, try to move to this point
    if (selectedPoint !== null && selectedPoint !== idx) {
      await moveTo(idx);
      return;
    }
    
    // If we have pieces on bar and clicked a valid point, select bar first
    if (b.bar[b.turn] > 0 && selectedPoint === null) {
      setSelectedPoint("bar");
      // Then try to move immediately if valid
      await moveTo(idx);
      return;
    }
    
    // Select source point if it belongs to current player
    const pt = b.points[idx];
    if (pt.owner === b.turn && pt.count > 0) {
      if (selectedPoint === idx) {
        setSelectedPoint(null);
      } else {
        setSelectedPoint(idx);
      }
    }
  }

  async function moveTo(to){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    const b = JSON.parse(JSON.stringify(s.board_state)); // Deep clone
    const turnSeat = b.turn==="A" ? 0 : 1;
    if (mySeat !== turnSeat) return;

    if (b.roll?.d1==null || b.roll?.d2==null) { await doRoll(); return; }
    
    let from = selectedPoint;
    if (from === null && b.bar[b.turn] > 0) {
      // force from bar
      from = "bar";
    } else if (from === null) {
      return; // need to select source first
    }

    // Get remaining steps (use roll.steps if available, otherwise calculate from d1/d2)
    const availableSteps = (b.roll.steps && Array.isArray(b.roll.steps) && b.roll.steps.length > 0) 
      ? [...b.roll.steps] 
      : stepList(b.roll);
    
    if (availableSteps.length === 0) { setPendingStepTo(null); return; }

    // compute legality using only remaining steps
    const dir = dirFor(b.turn);
    const legal = new Set();
    
    if (from === "bar") {
      // treat virtual index for legality
      const virtualFrom = b.turn === "A" ? -1 : 24;
      for (const step of availableSteps) {
        const dest = virtualFrom + step * dir;
        if (dest < 0 || dest > 23) {
          if (canBearOff(b, b.turn)) legal.add("off");
          continue;
        }
        const pt = b.points[dest];
        if (pt.owner && pt.owner !== b.turn && pt.count >= 2) continue; // blocked
        legal.add(dest);
      }
    } else {
      for (const step of availableSteps) {
        const dest = from + step * dir;
        if (dest < 0 || dest > 23) {
          if (canBearOff(b, b.turn)) legal.add("off");
          continue;
        }
        const pt = b.points[dest];
        if (pt.owner && pt.owner !== b.turn && pt.count >= 2) continue; // blocked
        legal.add(dest);
      }
    }
    
    if (!legal.has(to)) { setPendingStepTo(null); return; }

    // Calculate the distance traveled to determine which step was used
    let distanceUsed = 0;
    
    if (from === "bar") {
      // Entry from bar - calculate distance to entry point
      if (to === "off") {
        // Bear off from bar shouldn't normally be possible, but handle edge case
        // Use the step that allows bearing off
        distanceUsed = b.roll.steps && b.roll.steps.length > 0 ? b.roll.steps[0] : (b.turn === "A" ? 24 : 1);
      } else {
        // Calculate entry distance: for A, point 0 = step 1, point 1 = step 2, etc.
        // For B, point 23 = step 1, point 22 = step 2, etc.
        if (b.turn === "A") {
          distanceUsed = to + 1; // Point 0 needs step 1, point 1 needs step 2, etc.
        } else {
          distanceUsed = 24 - to; // Point 23 needs step 1, point 22 needs step 2, etc.
        }
      }
    } else if (to === "off") {
      // Bear off - must use exact step needed to reach edge
      // Find which step from available steps was used for this bear-off
      const [homeLo, homeHi] = b.turn === "A" ? [18, 23] : [0, 5];
      if (b.turn === "A") {
        // For A: need to move from point to edge (point 24 is off)
        const distanceToEdge = 24 - from;
        // The step used is the one that matches this distance (or the minimum if over)
        distanceUsed = distanceToEdge;
      } else {
        // For B: need to move from point to edge (point -1 is off)
        const distanceToEdge = from + 1;
        distanceUsed = distanceToEdge;
      }
      // Verify the step exists in available steps
      if (b.roll.steps && b.roll.steps.length > 0) {
        const availableSteps = b.roll.steps;
        // If exact step exists, use it; otherwise use the minimum that's >= distanceToEdge
        const exactMatch = availableSteps.find(s => s === distanceUsed);
        if (!exactMatch && availableSteps.length > 0) {
          // Use the minimum step that allows bearing off (when bearing off, you can use a larger step)
          distanceUsed = Math.min(...availableSteps.filter(s => s >= distanceUsed));
          if (isNaN(distanceUsed)) {
            // Fallback to first available step
            distanceUsed = availableSteps[0];
          }
        }
      }
    } else {
      // Regular move - absolute distance in the direction of movement
      distanceUsed = Math.abs(to - from);
    }

    const res = applyStep(b, b.turn, from, to);
    if (!res.ok) { setPendingStepTo(null); return; }

    // Remove the used step from steps array
    if (b.roll.steps && Array.isArray(b.roll.steps) && b.roll.steps.length > 0) {
      // Find and remove the first step that matches the distance used
      const stepIndex = b.roll.steps.findIndex(step => step === distanceUsed);
      if (stepIndex >= 0) {
        b.roll.steps.splice(stepIndex, 1);
        // Update moves_left based on remaining steps
        b.roll.moves_left = b.roll.steps.length;
      } else {
        // Fallback: if step not found (shouldn't happen), just decrement
        if (b.roll.moves_left > 0) b.roll.moves_left -= 1;
      }
    } else {
      // Fallback: if steps array is missing, just decrement moves_left
      if (b.roll.moves_left > 0) b.roll.moves_left -= 1;
    }

    const { data, error } = await supabase.from("bg_sessions").update({
      board_state: b,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id).select().single();

    if (!error && data) {
      setSes(data); // Update local state immediately
    }

    setSelectedPoint(null);
    setPendingStepTo(null);

    if (b.roll.moves_left <= 0) {
      await endTurn(b, []); // record steps if you log, here we pass []
    }
  }

  async function endTurn(b, steps){
    // finished?
    if (isFinished(b)) {
      // winner/multiplier → payout vault locally (optional)
      const res = winnerAndMultiplier(b);
      if (res?.winner && BUYIN_PER_MATCH>0){
        const pot = BUYIN_PER_MATCH * (b.doubling?.value || 1) * (res.mult || 1);
        // NOTE: בדיפולט כאן נזקף לזוכה לוקאלית; בחדרים ציבוריים נזהר מכפילויות
        const cur = readVault();
        const add = pot; // אפשר להחמיר: לתת פיצוי נטו אחרי שנגרע תחילת משחק
        writeVault(cur + add);
      }

      const { data, error } = await supabase.from("bg_sessions").update({
        stage: "finished",
        board_state: b,
        current_turn: null,
        turn_deadline: null
      }).eq("id", ses.id).select().single();
      
      if (!error && data) {
        setSes(data); // Update local state immediately
      }
      return;
    }

    // next
    nextTurn(b);
    const { data, error } = await supabase.from("bg_sessions").update({
      board_state: b,
      to_move: b.turn,
      current_turn: b.turn==="A" ? 0 : 1,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id).select().single();
    
    if (!error && data) {
      setSes(data); // Update local state immediately
    }
  }

  // ===== Doubling cube (optional, Phase 2) =====
  async function offerDouble(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    const b = JSON.parse(JSON.stringify(s.board_state)); // Deep clone
    const seatTurn = b.turn==="A" ? 0 : 1;
    if (mySeat !== seatTurn) return;
    if (!canOfferDouble(b, b.turn)) return;
    
    // Store doubling_proposed_by in board_state so UI can see it
    b.doubling_proposed_by = b.turn;
    
    const { data, error } = await supabase.from("bg_sessions").update({
      board_state: b,
      doubling_proposed_by: b.turn, // Also store in session for query convenience
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id).select().single();
    
    if (!error && data) {
      setSes(data); // Update local state immediately
    }
  }
  async function acceptDouble(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    const b = JSON.parse(JSON.stringify(s.board_state)); // Deep clone
    if (!b.doubling_proposed_by) return;
    const acceptor = oppOf(b.doubling_proposed_by);
    onAcceptDouble(b, acceptor);
    b.doubling_proposed_by = null;
    
    const { data, error } = await supabase.from("bg_sessions").update({
      board_state: b,
      doubling_proposed_by: null, // Clear from session
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id).select().single();
    
    if (!error && data) {
      setSes(data); // Update local state immediately
    }
  }
  async function declineDouble(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    // loser resigns immediately (pays current value)
    const { data, error } = await supabase.from("bg_sessions").update({
      stage: "finished",
      turn_deadline: null,
      doubling_proposed_by: null
    }).eq("id", ses.id).select().single();
    
    if (!error && data) {
      setSes(data); // Update local state immediately
    }
  }

  // ===== UI =====
  if (!roomId) return <div className="w-full h-full grid place-items-center text-white/70">Select or create a room.</div>;

  const b = ses?.board_state || initialBoardState();
  const isPlaying = ses?.stage === "playing";
  const turnSeat = b.turn==="A" ? 0 : 1;
  const isMyTurn = isPlaying && mySeat === turnSeat;
  const seatedCount = players.filter(p => p.seat_index !== null).length;

  // Point indices for rendering (standard backgammon layout)
  const pointIndices = [
    // Top row (right to left, B's home on right)
    [23,22,21,20,19,18, 17,16,15,14,13,12],
    // Bottom row (left to right, A's home on left)
    [0,1,2,3,4,5, 6,7,8,9,10,11]
  ];

  // Calculate legal destinations when a point is selected
  // Use remaining steps from roll.steps instead of recalculating from d1/d2
  const legalDestinationsSet = useMemo(() => {
    if (!isPlaying || !isMyTurn || !b.roll?.d1 || !b.roll?.d2) return new Set();
    
    // Get remaining steps (use roll.steps if available, otherwise calculate from d1/d2)
    const availableSteps = (b.roll.steps && Array.isArray(b.roll.steps) && b.roll.steps.length > 0) 
      ? [...b.roll.steps] 
      : stepList(b.roll);
    
    if (availableSteps.length === 0) return new Set();
    
    let from = selectedPoint;
    if (from === null) {
      // If no selection but has pieces on bar, check bar destinations
      if (b.bar?.[b.turn] > 0) {
        from = "bar";
      } else {
        return new Set();
      }
    }
    
    // Create a temporary roll object with only remaining steps for legalDestinations calculation
    // We need to call legalDestinations but with modified roll that only has remaining steps
    // Since legalDestinations uses stepList internally, we need to modify the roll temporarily
    const dir = dirFor(b.turn);
    const res = new Set();
    
    if (from === "bar") {
      // Virtual index for bar entry
      const virtualFrom = b.turn === "A" ? -1 : 24;
      for (const step of availableSteps) {
        const dest = virtualFrom + step * dir;
        if (dest < 0 || dest > 23) {
          if (canBearOff(b, b.turn)) res.add("off");
          continue;
        }
        const pt = b.points[dest];
        if (pt.owner && pt.owner !== b.turn && pt.count >= 2) continue; // blocked
        res.add(dest);
      }
      return res;
    } else if (typeof from === 'number') {
      for (const step of availableSteps) {
        const dest = from + step * dir;
        if (dest < 0 || dest > 23) {
          if (canBearOff(b, b.turn)) res.add("off");
          continue;
        }
        const pt = b.points[dest];
        if (pt.owner && pt.owner !== b.turn && pt.count >= 2) continue; // blocked
        res.add(dest);
      }
      return res;
    }
    
    return new Set();
  }, [isPlaying, isMyTurn, b, selectedPoint]);

  return (
    <div className="w-full h-full flex flex-col p-1 md:p-2 gap-1 md:gap-2 -mt-1">
      {/* Header */}
      <div className="flex items-center justify-between bg-white/5 rounded-xl p-1 md:p-2 border border-white/10">
        <div className="text-white font-bold text-sm md:text-lg">Backgammon</div>
        <div className="flex items-center gap-1 md:gap-2 text-white/80 text-xs">
          <span>Stage: {ses?.stage || "lobby"}</span>
          <span>Min: {fmt(minRequired)}</span>
          {isMyTurn && ses?.turn_deadline && (
            <TurnCountdown deadline={ses.turn_deadline} />
          )}
          <span>💰 {fmt(readVault())}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-1 md:gap-2 overflow-auto">
        {(!myRow || myRow.seat_index===null) ? (
          <div className="flex-1 grid place-items-center">
            <div className="text-center max-w-md">
              <div className="text-white/90 mb-2 md:mb-4 text-sm md:text-xl font-semibold">Choose your seat</div>
              <div className="flex items-center justify-center gap-6 mb-4">
                <button 
                  onClick={()=>takeSeat(0)} 
                  disabled={players.some(p=>p.seat_index===0 && p.client_id!==clientId)}
                  className="px-6 py-4 rounded-xl bg-gradient-to-r from-amber-600/80 to-amber-700/80 border-2 border-amber-500/50 text-white hover:from-amber-700 hover:to-amber-800 font-bold text-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Seat A (White)
                </button>
                <button 
                  onClick={()=>takeSeat(1)} 
                  disabled={players.some(p=>p.seat_index===1 && p.client_id!==clientId)}
                  className="px-6 py-4 rounded-xl bg-gradient-to-r from-gray-800/80 to-black/80 border-2 border-gray-600/50 text-white hover:from-gray-700 hover:to-black font-bold text-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Seat B (Black)
                </button>
              </div>
              <div className="text-white/70 text-sm mb-2">
                Seated: {seatedCount}/2
              </div>
              {msg && <div className="text-amber-300 mt-3 text-sm bg-amber-900/40 px-4 py-2 rounded-lg">{msg}</div>}
              {isLeader && seatedCount >= MIN_PLAYERS_TO_START && (
                <button 
                  onClick={startMatch}
                  className="mt-4 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold text-lg shadow-lg hover:from-green-700 hover:to-emerald-700 transition-all"
                >
                  ▶ Start Game
                </button>
              )}
            </div>
          </div>
                ) : (
          <div className="flex-1 flex flex-col gap-1 md:gap-2">
                                                                                                        {/* Board - Fixed Height - Realistic Wooden Backgammon Board */}
               <div 
                 className="rounded-xl p-1 md:p-2 border-4 relative overflow-hidden shadow-2xl" 
                 style={{ 
                   aspectRatio: '16 / 10',
                   minHeight: '320px',
                   maxHeight: '500px',
                   width: '100%',
                   backgroundColor: '#8B6F47',
                   borderColor: '#5A4530',
                   boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.2)'
                 }}
               >
                {/* 30-point division markers */}
                {/* Vertical divider - separates left 15 points from right 15 points */}
                <div 
                  className="absolute left-1/2 top-0 bottom-0 z-0" 
                  style={{ 
                    width: '2px',
                    backgroundColor: '#4A3420',
                    transform: 'translateX(-50%)',
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                  }}
                ></div>
                                {/* Horizontal divider between top and bottom halves */}
                <div 
                  className="absolute left-0 right-0 top-1/2 z-0" 
                  style={{ 
                    height: '2px',
                    backgroundColor: '#4A3420',
                    transform: 'translateY(-50%)',
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                  }}
                ></div>
                
                {/* BAR - spans full height from edge to edge, centered in board */}
                <div 
                  className="absolute left-1/2 top-0 bottom-0 z-30"
                  style={{ 
                    width: '48px',
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div 
                    className={`w-full h-full flex flex-col items-center justify-center border-l-2 border-r-2 ${
                      selectedPoint === "bar" && (b.bar?.B > 0 || b.bar?.A > 0) && isMyTurn 
                        ? 'border-yellow-400 ring-2 ring-yellow-300' 
                        : 'border-[#4A3420]'
                    } cursor-pointer transition-all shadow-inner`}
                    style={{ 
                      backgroundColor: '#5A4530',
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)' 
                    }}
                    onClick={() => isMyTurn && (b.bar?.B > 0 || b.bar?.A > 0) && onPointClick("bar")}
                  >
                    <div className={`text-white/95 text-[10px] md:text-xs font-bold mb-1 drop-shadow-lg ${selectedPoint === "bar" ? "text-yellow-300" : ""}`}>BAR</div>
                    <div className="text-white text-xs md:text-sm font-bold mb-1 drop-shadow">
                      {(b?.bar?.B || 0) + (b?.bar?.A || 0)}
                    </div>
                    <div className="flex flex-col gap-1 items-center">
                      {b?.bar?.B > 0 && Array.from({length: Math.min(b.bar.B, 5)}).map((_,i) => (
                        <Checker key={`b-${i}`} owner="B" count={b.bar.B} index={i} />
                      ))}
                      {b?.bar?.A > 0 && Array.from({length: Math.min(b.bar.A, 5)}).map((_,i) => (
                        <Checker key={`a-${i}`} owner="A" count={b.bar.A} index={i} />
                      ))}
                    </div>
                  </div>
                </div>
                
              <div className="flex flex-col gap-0 h-full relative">
                {/* Top Row (B's side) - 12 points (6 on each side of BAR) */}
                <div className="flex gap-0 flex-1 relative" style={{ minHeight: '0' }}>
                  {/* First 6 points (right side) */}
                  {pointIndices[0].slice(0, 6).map((pointIdx, colIdx) => {
                    const pt = b?.points?.[pointIdx] || {owner:null,count:0};
                    const canClick = isMyTurn && ((selectedPoint === null && pt.owner === b.turn) || selectedPoint !== null);
                    const isSelected = selectedPoint === pointIdx;
                    const isLegalDestination = legalDestinationsSet.has(pointIdx);
                    // Top row: to ensure opposite of bottom, use ((23-pointIdx) % 2) === 0
                    // Bottom pointIdx 0 -> opposite is 23 -> (23-23) % 2 = 0 -> should be opposite of bottom's 0
                    // Bottom uses (pointIdx % 2) === 0 for light, so opposite should be dark
                    // So top: ((23-pointIdx) % 2) === 1 for light
                    const oppositeIdx = 23 - pointIdx;
                    const isAlt = (oppositeIdx % 2) === 1;
                    return (
                      <div 
                        key={`top-${pointIdx}`} 
                        className="flex-1 relative select-none transition-all h-full"
                      >
                        <div 
                          className={`absolute inset-0 ${canClick ? "cursor-pointer hover:brightness-110" : ""} ${isSelected ? "ring-4 ring-yellow-400 shadow-lg z-10" : ""} ${isLegalDestination && !isSelected ? "ring-2 ring-green-400 shadow-md z-5" : ""}`}
                          onClick={() => canClick && onPointClick(pointIdx)}
                        >
                          <div className="absolute inset-0 overflow-hidden rounded-t-lg">
                            <Triangle up={true} isAlt={isAlt} />
                          </div>
                                                     <div className="absolute left-1/2 -translate-x-1/2 top-0 flex flex-col gap-1 items-center z-10 pt-1">
                             {pt.count > 0 && Array.from({length: Math.min(pt.count, 5)}).map((_,k) => (
                               <Checker key={k} owner={pt.owner} count={pt.count} index={k} />
                             ))}
                             {pt.count > 5 && (
                               <div className="text-[10px] font-bold text-white bg-black/70 px-0.5 rounded">
                                 +{pt.count - 5}
                               </div>
                             )}
                           </div>
                         </div>
                       </div>
                     );
                   })}
                   
                   {/* Space for BAR (48px) */}
                  <div className="w-12"></div>
                  
                  {/* Last 6 points (left side) */}
                  {pointIndices[0].slice(6).map((pointIdx, colIdx) => {
                    const pt = b?.points?.[pointIdx] || {owner:null,count:0};
                    const canClick = isMyTurn && ((selectedPoint === null && pt.owner === b.turn) || selectedPoint !== null);
                    const isSelected = selectedPoint === pointIdx;
                    const isLegalDestination = legalDestinationsSet.has(pointIdx);
                    // Top row: use opposite index calculation for opposite color
                    const oppositeIdx = 23 - pointIdx;
                    const isAlt = (oppositeIdx % 2) === 1;
                    return (
                      <div 
                        key={`top-${pointIdx}`} 
                        className="flex-1 relative select-none transition-all h-full"
                      >
                        <div 
                          className={`absolute inset-0 ${canClick ? "cursor-pointer hover:brightness-110" : ""} ${isSelected ? "ring-4 ring-yellow-400 shadow-lg z-10" : ""} ${isLegalDestination && !isSelected ? "ring-2 ring-green-400 shadow-md z-5" : ""}`}
                          onClick={() => canClick && onPointClick(pointIdx)}
                        >
                          <div className="absolute inset-0 overflow-hidden rounded-t-lg">
                            <Triangle up={true} isAlt={isAlt} />
                          </div>
                                                     <div className="absolute left-1/2 -translate-x-1/2 top-0 flex flex-col gap-1 items-center z-10 pt-1">
                             {pt.count > 0 && Array.from({length: Math.min(pt.count, 5)}).map((_,k) => (
                               <Checker key={k} owner={pt.owner} count={pt.count} index={k} />
                             ))}
                             {pt.count > 5 && (
                               <div className="text-[10px] font-bold text-white bg-black/70 px-0.5 rounded">
                                 +{pt.count - 5}
                               </div>
                             )}
                           </div>
                         </div>
                       </div>
                     );
                   })}
                   
                                    </div>
 
                                   {/* Bottom Row (A's side) - 12 points (6 on each side of BAR) */}
                  <div className="flex gap-0 flex-1 relative" style={{ minHeight: '0' }}>
                    {/* First 6 points (left side) */}
                    {pointIndices[1].slice(0, 6).map((pointIdx, colIdx) => {
                      const pt = b?.points?.[pointIdx] || {owner:null,count:0};
                      const canClick = isMyTurn && ((selectedPoint === null && pt.owner === b.turn) || selectedPoint !== null);
                      const isSelected = selectedPoint === pointIdx;
                      const isLegalDestination = legalDestinationsSet.has(pointIdx);
                      // Bottom row: even pointIdx = light (isAlt=true), odd = dark (isAlt=false)
                      const isAlt = (pointIdx % 2) === 0;
                      return (
                        <div 
                          key={`bot-${pointIdx}`} 
                          className="flex-1 relative select-none transition-all h-full"
                        >
                          <div 
                            className={`absolute inset-0 ${canClick ? "cursor-pointer hover:brightness-110" : ""} ${isSelected ? "ring-4 ring-yellow-400 shadow-lg z-10" : ""} ${isLegalDestination && !isSelected ? "ring-2 ring-green-400 shadow-md z-5" : ""}`}
                            onClick={() => canClick && onPointClick(pointIdx)}
                          >
                            <div className="absolute inset-0 overflow-hidden rounded-b-lg">
                              <Triangle up={false} isAlt={isAlt} />
                            </div>
                                                         <div className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col-reverse gap-1 items-center z-10 pb-1">
                               {pt.count > 0 && Array.from({length: Math.min(pt.count, 5)}).map((_,k) => (
                                 <Checker key={k} owner={pt.owner} count={pt.count} index={k} />
                               ))}
                               {pt.count > 5 && (
                                 <div className="text-[10px] font-bold text-white bg-black/70 px-0.5 rounded">
                                   +{pt.count - 5}
                                 </div>
                               )}
                             </div>
                           </div>
                         </div>
                       );
                     })}
                     
                     {/* Space for BAR (48px) */}
                    <div className="w-12"></div>
                    
                                        {/* Last 6 points (right side) */}
                    {pointIndices[1].slice(6).map((pointIdx, colIdx) => {
                      const pt = b?.points?.[pointIdx] || {owner:null,count:0};
                      const canClick = isMyTurn && ((selectedPoint === null && pt.owner === b.turn) || selectedPoint !== null);
                      const isSelected = selectedPoint === pointIdx;
                      const isLegalDestination = legalDestinationsSet.has(pointIdx);
                      // Bottom row: even pointIdx = light (isAlt=true), odd = dark (isAlt=false)
                      const isAlt = (pointIdx % 2) === 0;
                      return (
                        <div 
                          key={`bot-${pointIdx}`} 
                          className="flex-1 relative select-none transition-all h-full"
                        >
                          <div 
                            className={`absolute inset-0 ${canClick ? "cursor-pointer hover:brightness-110" : ""} ${isSelected ? "ring-4 ring-yellow-400 shadow-lg z-10" : ""} ${isLegalDestination && !isSelected ? "ring-2 ring-green-400 shadow-md z-5" : ""}`}
                            onClick={() => canClick && onPointClick(pointIdx)}
                          >
                            <div className="absolute inset-0 overflow-hidden rounded-b-lg">
                              <Triangle up={false} isAlt={isAlt} />
                            </div>
                                                         <div className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col-reverse gap-1 items-center z-10 pb-1">
                               {pt.count > 0 && Array.from({length: Math.min(pt.count, 5)}).map((_,k) => (
                                 <Checker key={k} owner={pt.owner} count={pt.count} index={k} />
                               ))}
                               {pt.count > 5 && (
                                 <div className="text-[10px] font-bold text-white bg-black/70 px-0.5 rounded">
                                   +{pt.count - 5}
                                 </div>
                               )}
                             </div>
                           </div>
                         </div>
                       );
                     })}
                   </div>
               </div>
             </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-1 md:gap-2 items-center">
              <div className="flex items-center gap-1 md:gap-2 bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
                <Dice value={b?.roll?.d1} />
                <Dice value={b?.roll?.d2} />
                <button 
                  onClick={doRoll} 
                  disabled={!isMyTurn || (b?.roll?.d1 != null && b?.roll?.d2 != null && b?.roll?.moves_left > 0)} 
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-sm shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Roll Dice
                </button>
              </div>
              
              <div className="text-center bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
                <div className="text-white/80 text-xs mb-0.5">Turn</div>
                <div className="text-white font-bold text-sm">
                  {b?.turn === "A" ? "⚪ A" : "⚫ B"}
                </div>
                {isMyTurn && <div className="text-emerald-400 text-[10px] mt-0.5">Your turn!</div>}
              </div>
              
              <div className="flex items-center justify-center gap-1 md:gap-2 bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
                {ses?.stage==="lobby" ? (
                  <button 
                    onClick={startMatch} 
                    disabled={!isLeader || seatedCount < MIN_PLAYERS_TO_START}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-sm shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    START
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={()=>setSelectedPoint("bar")} 
                      disabled={!isMyTurn || b.bar[b.turn] === 0} 
                      className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      From BAR
                    </button>
                    <button 
                      onClick={()=>moveTo("off")} 
                      disabled={!isMyTurn || !canBearOff(b, b.turn) || !legalDestinationsSet.has("off")} 
                      className={`px-3 py-2 rounded-lg text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        legalDestinationsSet.has("off") && isMyTurn 
                          ? "bg-green-600/80 hover:bg-green-700 ring-2 ring-green-400" 
                          : "bg-white/10 hover:bg-white/20"
                      }`}
                    >
                      Bear Off
                    </button>
                    <button 
                      onClick={offerDouble} 
                      disabled={!isMyTurn || !canOfferDouble(b, b.turn)} 
                      className="px-3 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-700 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Double
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Status Messages */}
            {msg && (
              <div className="mt-3 text-center">
                <div className="inline-block bg-amber-900/60 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-lg text-sm">
                  {msg}
                </div>
              </div>
            )}

            {/* Doubling Proposal */}
            {b?.doubling_proposed_by && b.doubling_proposed_by !== b.turn && isMyTurn && (
              <div className="mt-3 bg-purple-900/60 border-2 border-purple-500 rounded-xl p-4 text-center">
                <div className="text-white font-bold mb-2">Doubling Cube Offered!</div>
                <div className="flex gap-3 justify-center">
                  <button 
                    onClick={acceptDouble}
                    className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold"
                  >
                    Accept
                  </button>
                  <button 
                    onClick={declineDouble}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Game Over */}
            {ses?.stage === "finished" && (
              <div className="mt-4 bg-gradient-to-r from-emerald-900/80 to-green-900/80 border-2 border-emerald-500 rounded-xl p-4 text-center">
                <div className="text-white font-bold text-xl mb-2">Game Finished!</div>
                {(() => {
                  const res = winnerAndMultiplier(b);
                  if (res) {
                    return (
                      <div className="text-white">
                        Winner: {res.winner === "A" ? "White (A)" : "Black (B)"} • 
                        Multiplier: {res.mult}x
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
        <div className="text-white/80 text-xs">
          Player: <span className="font-bold text-white">{playerName||"Guest"}</span>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {(!myRow || myRow.seat_index===null) ? null : (
            <button 
              onClick={leaveSeat} 
              className="px-2 md:px-4 py-0.5 md:py-1.5 rounded bg-red-600/80 hover:bg-red-700 text-white text-xs font-semibold transition-all"
            >
              LEAVE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}




