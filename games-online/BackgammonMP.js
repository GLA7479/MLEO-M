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
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white to-gray-100 text-black shadow-lg flex items-center justify-center text-xl font-bold border-2 border-gray-300">
      {value ?? "?"}
    </div>
  );
}

function Checker({ owner, count, index }) {
  const isStack = count > 1;
  return (
    <div 
      className={`w-8 h-8 rounded-full border-2 shadow-lg flex items-center justify-center ${
        owner === "A" 
          ? "bg-gradient-to-br from-white to-gray-200 border-gray-400" 
          : "bg-gradient-to-br from-gray-800 to-black border-gray-600"
      } ${isStack && index === 0 ? 'ring-2 ring-yellow-400' : ''}`}
      style={{ zIndex: isStack ? (count - index) : 1 }}
    >
      {isStack && index === 0 && <span className="text-xs font-bold">{count}</span>}
    </div>
  );
}

function Triangle({ up, isAlt }) {
  return (
    <div 
      className={`w-full h-full ${
        up 
          ? "bg-gradient-to-t from-amber-700/80 to-amber-600/40" 
          : "bg-gradient-to-b from-amber-700/80 to-amber-600/40"
      }`}
      style={{
        clipPath: up ? 'polygon(0% 0%, 50% 100%, 100% 0%)' : 'polygon(0% 100%, 50% 0%, 100% 100%)'
      }}
    />
  );
}

export default function BackgammonMP({ roomId, playerName, vault, setVaultBoth, tierCode="10K" }){
  useEffect(()=>{ window.updateVaultCallback = setVaultBoth; return ()=>{ delete window.updateVaultCallback; }; },[setVaultBoth]);

  const name = playerName || "Guest";
  const clientId = useMemo(()=>getClientId(), []);
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
    
    const { error } = await supabase.from("bg_sessions").update({
      stage: "playing",
      board_state: board,
      to_move: board.turn,
      current_turn: board.turn==="A" ? 0 : 1,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id);
    
    if (error) {
      setMsg(error.message || "Failed to start game");
    } else {
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
    const b = { ...(s.board_state) };
    const seatTurn = b.turn==="A" ? 0 : 1;
    if (mySeat !== seatTurn) return;

    if (b.roll?.d1!=null && b.roll?.d2!=null && b.roll.moves_left>0) return;

    const d1 = 1 + Math.floor(Math.random()*6);
    const d2 = 1 + Math.floor(Math.random()*6);
    applyRoll(b, d1, d2);
    await supabase.from("bg_sessions").update({
      board_state: b,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id);
  }

  // ===== movement =====
  async function onPointClick(idx){
    if (ses?.stage!=="playing") return;
    const b = ses?.board_state; if (!b) return;
    const turnSeat = b.turn==="A" ? 0 : 1;
    if (mySeat !== turnSeat) return;
    
    // If we have a selected point, try to move to this point
    if (selectedPoint !== null && selectedPoint !== idx) {
      await moveTo(idx);
      return;
    }
    
    // If clicking on bar when we have pieces on bar
    if (b.bar[b.turn] > 0) {
      setSelectedPoint("bar");
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
    const b = { ...(s.board_state) };
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

    // compute legality
    let legal = [];
    if (from==="bar") {
      // treat virtual index for legality
      const virtualFrom = b.turn==="A" ? -1 : 24;
      legal = legalDestinations(b, b.turn, virtualFrom);
    } else {
      legal = legalDestinations(b, b.turn, from);
    }
    if (!legal.includes(to)) { setPendingStepTo(null); return; }

    const res = applyStep(b, b.turn, from, to);
    if (!res.ok) { setPendingStepTo(null); return; }

    // consume a step
    if (b.roll.moves_left>0) b.roll.moves_left -= 1;

    await supabase.from("bg_sessions").update({
      board_state: b,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id);

    setSelectedPoint(null);
    setPendingStepTo(null);

    if (b.roll.moves_left<=0) {
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

      await supabase.from("bg_sessions").update({
        stage: "finished",
        board_state: b,
        current_turn: null,
        turn_deadline: null
      }).eq("id", ses.id);
      return;
    }

    // next
    nextTurn(b);
    await supabase.from("bg_sessions").update({
      board_state: b,
      to_move: b.turn,
      current_turn: b.turn==="A" ? 0 : 1,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id);
  }

  // ===== Doubling cube (optional, Phase 2) =====
  async function offerDouble(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    const b = { ...(s.board_state) };
    const seatTurn = b.turn==="A" ? 0 : 1;
    if (mySeat !== seatTurn) return;
    if (!canOfferDouble(b, b.turn)) return;
    // In MVP: store intent flag on session; in production you'd add bg_actions table or modal handshake
    await supabase.from("bg_sessions").update({
      doubling_proposed_by: b.turn,
      turn_deadline: new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    }).eq("id", ses.id);
  }
  async function acceptDouble(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    const b = { ...(s.board_state) };
    if (!b.doubling_proposed_by) return;
    const acceptor = oppOf(b.doubling_proposed_by);
    onAcceptDouble(b, acceptor);
    b.doubling_proposed_by = null;
    await supabase.from("bg_sessions").update({ board_state: b }).eq("id", ses.id);
  }
  async function declineDouble(){
    const s = await fetchSession(); if (!s || s.stage!=="playing") return;
    // loser resigns immediately (pays current value)
    await supabase.from("bg_sessions").update({ stage: "finished", turn_deadline: null }).eq("id", ses.id);
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

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-amber-950 via-amber-900 to-amber-950" style={{ height: "100svh" }}>
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-amber-900/80 to-amber-800/80 backdrop-blur-sm px-4 py-3 border-b-2 border-amber-600/50 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="text-white font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">🎲</span>
            <span>Backgammon</span>
          </div>
          <div className="flex items-center gap-3 text-white/90 text-sm">
            <span className={`px-3 py-1 rounded-lg font-semibold ${
              ses?.stage==="playing" ? "bg-emerald-700/60" : 
              ses?.stage==="finished" ? "bg-red-700/60" : 
              "bg-blue-700/60"
            }`}>
              {ses?.stage || "lobby"}
            </span>
            {isMyTurn && ses?.turn_deadline && (
              <TurnCountdown deadline={ses.turn_deadline} />
            )}
            <span className="bg-purple-700/60 px-3 py-1 rounded-lg font-semibold">
              💰 {fmt(readVault())}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 overflow-auto">
        {(!myRow || myRow.seat_index===null) ? (
          <div className="h-full grid place-items-center">
            <div className="text-center max-w-md">
              <div className="text-white/90 mb-4 text-xl font-semibold">Choose your seat</div>
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
          <div className="max-w-6xl mx-auto">
            {/* Players Info */}
            <div className="mb-4 flex items-center justify-between bg-black/30 rounded-xl p-3 border border-white/20">
              <div className="flex items-center gap-4">
                {players.map((p, idx) => (
                  <div key={idx} className={`px-4 py-2 rounded-lg ${
                    p.seat_index === turnSeat && isPlaying ? 'bg-emerald-700/60 ring-2 ring-emerald-400' : 'bg-white/10'
                  }`}>
                    <div className="text-white text-sm font-semibold">
                      {p.player_name} {p.seat_index === mySeat ? "(You)" : ""}
                    </div>
                    <div className="text-white/70 text-xs">
                      Seat {p.seat_index === 0 ? "A" : "B"} • {p.wins || 0} wins
                    </div>
                  </div>
                ))}
              </div>
              {isLeader && ses?.stage === "lobby" && seatedCount >= MIN_PLAYERS_TO_START && (
                <button 
                  onClick={startMatch}
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold shadow-lg hover:from-green-700 hover:to-emerald-700 transition-all"
                >
                  ▶ Start Game
                </button>
              )}
            </div>

            {/* Board */}
            <div className="bg-gradient-to-br from-amber-800/40 to-amber-900/40 rounded-3xl shadow-2xl p-4 border-4 border-amber-600/50">
              <div className="grid grid-cols-13 grid-rows-2 gap-1">
                {/* Top Row (B's side) */}
                {pointIndices[0].map((pointIdx, colIdx) => {
                  const isBarCol = colIdx === 6;
                  if (isBarCol) {
                    return (
                      <div key={`bar-top`} className="col-span-1 row-span-2 flex items-center justify-center">
                        <div 
                          className={`w-16 h-full bg-black/60 rounded-lg flex flex-col items-center justify-center border-2 ${
                            selectedPoint === "bar" && b.bar?.B > 0 && isMyTurn ? 'border-yellow-400 ring-2 ring-yellow-300' : 'border-gray-600'
                          } cursor-pointer transition-all`}
                          onClick={() => isMyTurn && b.bar?.B > 0 && onPointClick("bar")}
                        >
                          <div className="text-white text-xs font-bold mb-1">BAR</div>
                          <div className="text-white text-lg font-bold">{b?.bar?.B || 0}</div>
                          {b?.bar?.B > 0 && Array.from({length: Math.min(b.bar.B, 5)}).map((_,i) => (
                            <Checker key={i} owner="B" count={b.bar.B} index={i} />
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const pt = b?.points?.[pointIdx] || {owner:null,count:0};
                  const canClick = isMyTurn && ((selectedPoint === null && pt.owner === b.turn) || selectedPoint !== null);
                  const isSelected = selectedPoint === pointIdx;
                  return (
                    <div 
                      key={`top-${pointIdx}`} 
                      className={`relative select-none transition-all ${
                        canClick ? "cursor-pointer hover:brightness-110" : ""
                      } ${isSelected ? "ring-4 ring-yellow-400 shadow-lg" : ""}`}
                      onClick={() => canClick && onPointClick(pointIdx)}
                    >
                      <div className="absolute inset-0 overflow-hidden rounded-t-lg">
                        <Triangle up={true} isAlt={(colIdx % 2) === 0} />
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 top-2 flex flex-col gap-1 items-center">
                        {pt.count > 0 && Array.from({length: Math.min(pt.count, 5)}).map((_,k) => (
                          <Checker key={k} owner={pt.owner} count={pt.count} index={k} />
                        ))}
                        {pt.count > 5 && (
                          <div className="text-xs font-bold text-white bg-black/50 px-1 rounded">
                            +{pt.count - 5}
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold text-white/80">
                        {pointIdx}
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Row (A's side) */}
                {pointIndices[1].map((pointIdx, colIdx) => {
                  const isBarCol = colIdx === 6;
                  if (isBarCol) {
                    return (
                      <div key={`bar-bot`} className="col-span-1 row-span-2 flex items-center justify-center">
                        <div 
                          className={`w-16 h-full bg-black/60 rounded-lg flex flex-col items-center justify-center border-2 ${
                            selectedPoint === "bar" && b.bar?.A > 0 && isMyTurn ? 'border-yellow-400 ring-2 ring-yellow-300' : 'border-gray-600'
                          } cursor-pointer transition-all`}
                          onClick={() => isMyTurn && b.bar?.A > 0 && onPointClick("bar")}
                        >
                          <div className="text-white text-xs font-bold mb-1">BAR</div>
                          <div className="text-white text-lg font-bold">{b?.bar?.A || 0}</div>
                          {b?.bar?.A > 0 && Array.from({length: Math.min(b.bar.A, 5)}).map((_,i) => (
                            <Checker key={i} owner="A" count={b.bar.A} index={i} />
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const pt = b?.points?.[pointIdx] || {owner:null,count:0};
                  const canClick = isMyTurn && ((selectedPoint === null && pt.owner === b.turn) || selectedPoint !== null);
                  const isSelected = selectedPoint === pointIdx;
                  return (
                    <div 
                      key={`bot-${pointIdx}`} 
                      className={`relative select-none transition-all ${
                        canClick ? "cursor-pointer hover:brightness-110" : ""
                      } ${isSelected ? "ring-4 ring-yellow-400 shadow-lg" : ""}`}
                      onClick={() => canClick && onPointClick(pointIdx)}
                    >
                      <div className="absolute inset-0 overflow-hidden rounded-b-lg">
                        <Triangle up={false} isAlt={(colIdx % 2) === 0} />
                      </div>
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-2 flex flex-col-reverse gap-1 items-center">
                        {pt.count > 0 && Array.from({length: Math.min(pt.count, 5)}).map((_,k) => (
                          <Checker key={k} owner={pt.owner} count={pt.count} index={k} />
                        ))}
                        {pt.count > 5 && (
                          <div className="text-xs font-bold text-white bg-black/50 px-1 rounded">
                            +{pt.count - 5}
                          </div>
                        )}
                      </div>
                      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-xs font-bold text-white/80">
                        {pointIdx}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Controls */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="flex items-center gap-3 bg-black/30 rounded-xl p-3 border border-white/20">
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
              
              <div className="text-center bg-black/30 rounded-xl p-3 border border-white/20">
                <div className="text-white/80 text-sm mb-1">Current Turn</div>
                <div className="text-white font-bold text-lg">
                  {b?.turn === "A" ? "⚪ White (A)" : "⚫ Black (B)"}
                </div>
                {isMyTurn && <div className="text-emerald-400 text-xs mt-1">Your turn!</div>}
              </div>
              
              <div className="flex items-center justify-center gap-2 bg-black/30 rounded-xl p-3 border border-white/20">
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
                      disabled={!isMyTurn || !canBearOff(b, b.turn)} 
                      className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
      <div className="flex-shrink-0 bg-gradient-to-r from-amber-900/80 to-amber-800/80 backdrop-blur-sm px-4 py-2 border-t-2 border-amber-600/50 flex items-center justify-between">
        <div className="text-white/80 text-sm">
          Player: <span className="font-bold text-white">{playerName||"Guest"}</span>
        </div>
        <div className="flex items-center gap-2">
          {(!myRow || myRow.seat_index===null) ? null : (
            <button 
              onClick={leaveSeat} 
              className="px-4 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-700 text-white text-sm font-semibold shadow-lg transition-all"
            >
              LEAVE SEAT
            </button>
          )}
        </div>
      </div>
    </div>
  );
}




