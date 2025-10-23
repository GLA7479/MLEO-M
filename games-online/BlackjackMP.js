// Blackjack (MP) — Updated for new schema
// Uses supabaseMP (new project) + local Vault

import { useEffect, useMemo, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";

const MIN_BET = 1000;
const SEATS = 5;

// ---------- Utils ----------
function safeRead(key, fallback){ try { const raw = localStorage.getItem(key); return raw? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

// ---------- Blackjack Logic ----------
function freshShoe(decks = 4) {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♠','♥','♦','♣'];
  const shoe = [];
  for (let d=0; d<decks; d++) for (const r of ranks) for (const s of suits) shoe.push(r + s);
  for (let i=shoe.length-1; i>0; i--) { const j = Math.floor(Math.random() * (i+1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  return shoe;
}

function baseCardValue(r) {
  if (r === 'A') return 11;
  if (['K','Q','J','10'].includes(r)) return 10;
  return parseInt(r, 10);
}

function handScore(cards) {
  let total = 0; let aces = 0;
  for (const c of cards) {
    const r = c.replace('♠','').replace('♥','').replace('♦','').replace('♣','');
    if (r === 'A') { aces++; total += 11; } else total += baseCardValue(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const soft = cards.some(c => c.startsWith('A')) && total <= 21;
  return { total, soft };
}

function cardValue(r){ if(r==="A") return 11; if(["K","Q","J"].includes(r)) return 10; return parseInt(r,10); }
function handValue(hand){ let t=0,a=0; for(const c of hand){ const r=c.slice(0,-1); t+=cardValue(r); if(r==="A")a++; } while(t>21&&a>0){ t-=10;a--; } return t; }
const suitIcon = (s)=> s==="h"?"♥":s==="d"?"♦":s==="c"?"♣":"♠";
const suitClass = (s)=> (s==="h"||s==="d") ? "text-red-400" : "text-blue-300";

function Card({ code, size = "normal" }) {
  if (!code) return null;
  const r = code.slice(0,-1), s = code.slice(-1);
  const sizeClasses = size === "small" ? "w-6 h-8 text-xs" : "w-8 h-10 text-sm";
  return (
    <div className={`inline-flex items-center justify-center border border-white/30 rounded ${sizeClasses} font-bold bg-gradient-to-b from-white/10 to-white/5 shadow ${suitClass(s)}`}>
      <span className="leading-none">{r}{suitIcon(s)}</span>
    </div>
  );
}
function HandView({ hand, size = "normal" }) {
  const h = hand || [];
  return (
    <div className="flex items-center justify-center overflow-x-auto whitespace-nowrap py-1">
      {h.length===0 ? <span className="text-white/60 text-xs">—</span> : h.map((c,i)=><Card key={i} code={c} size={size}/>)}
    </div>
  );
}

// ---------- Component ----------
export default function BlackjackMP({ roomId, playerName, vault, setVaultBoth }) {
  const name = playerName || "Guest";

  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [bet, setBet] = useState(MIN_BET);
  const [msg, setMsg] = useState("");

  const clampBet = (n) => {
    const v = Math.floor(Number(n || 0));
    if (!Number.isFinite(v) || v < MIN_BET) return MIN_BET;
    return Math.min(v, vault);
  };
  const myRow = useMemo(() => players.find(p => p.player_name === name) || null, [players, name]);

  // bootstrap session with new schema
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      const { data } = await supabase.from("bj_sessions").select("*").eq("room_code", roomId).maybeSingle();
      if (!data) {
        const shoe = freshShoe(4);
        const { data: created } = await supabase.from("bj_sessions")
          .insert({ room_code: roomId, state: 'lobby', shoe, dealer_hand: [], seat_count: SEATS, min_bet: MIN_BET })
          .select().single();
        setSession(created);
      } else setSession(data);
    })();
  }, [roomId]);

  // presence
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`room_${roomId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('join', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('leave', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString(), player_name: name });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, name]);

  // realtime updates
  useEffect(() => {
    if (!session?.id) return;
    
    const channel = supabase.channel(`bj_session_${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_sessions', filter: `id=eq.${session.id}` }, (payload) => {
        setSession(payload.new || payload.old);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_players', filter: `session_id=eq.${session.id}` }, async () => {
        const { data } = await supabase.from("bj_players").select("*").eq("session_id", session.id).order("seat");
        setPlayers(data || []);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // ---------- Actions ----------
  async function ensureSeated() {
    if (!session) return;
    const existing = players.find(p => p.player_name === name);
    if (existing) return;

    const { data, error } = await supabase.from("bj_players").upsert({
      session_id: session.id,
      seat: 0, // Auto-assign first available seat
      player_name: name,
      stack: Math.min(vault, 10000),
      bet: 0,
      hand: [],
      status: 'seated',
      acted: false
    }, { onConflict: "session_id,seat", ignoreDuplicates: false }).select().single();

    if (error) {
      console.error("Failed to join seat:", error);
      setMsg("Failed to join seat");
    }
  }

  async function placeBet() {
    if (!myRow || bet < MIN_BET) return;
    const { error } = await supabase.from("bj_players").update({
      bet: bet,
      status: 'betting',
      acted: true
    }).eq("id", myRow.id);

    if (error) {
      console.error("Failed to place bet:", error);
      setMsg("Failed to place bet");
    }
  }

  async function deal() {
    if (!session) return;
    const ready = players.every(p => p.bet >= MIN_BET && p.status !== 'left');
    if (!ready) {
      setMsg("Not all players have placed minimum bet");
      return;
    }

    let shoe = session.shoe && session.shoe.length ? [...session.shoe] : freshShoe(4);
    const draw = () => shoe.pop();

    // Deal to players
    for (const p of players) {
      const hand = [draw(), draw()];
      const isBlackjack = handValue(hand) === 21;
      await supabase.from("bj_players").update({
        hand: hand,
        status: isBlackjack ? 'blackjack' : 'acting',
        acted: false
      }).eq("id", p.id);
    }

    // Deal to dealer
    const dealerHand = [draw(), draw()];
    await supabase.from("bj_sessions").update({
      state: 'acting',
      dealer_hand: dealerHand,
      dealer_hidden: true,
      shoe: shoe,
      round_no: (session.round_no || 0) + 1,
      current_seat: 0
    }).eq("id", session.id);
  }

  async function hit() {
    if (!session || !myRow || myRow.status !== 'acting') return;
    
    let shoe = [...session.shoe];
    const card = shoe.pop();
    const hand = [...myRow.hand, card];
    const isBust = handValue(hand) > 21;
    
    await supabase.from("bj_players").update({
      hand: hand,
      status: isBust ? 'busted' : 'acting'
    }).eq("id", myRow.id);
    
    await supabase.from("bj_sessions").update({ shoe }).eq("id", session.id);
  }

  async function stand() {
    if (!myRow || myRow.status !== 'acting') return;
    await supabase.from("bj_players").update({
      status: 'stood',
      acted: true
    }).eq("id", myRow.id);
  }

  async function double() {
    if (!session || !myRow || myRow.status !== 'acting') return;
    const newBet = myRow.bet * 2;
    if (myRow.stack < (newBet - myRow.bet)) {
      setMsg("Insufficient stack to double");
      return;
    }
    
    let shoe = [...session.shoe];
    const card = shoe.pop();
    const hand = [...myRow.hand, card];
    
    await supabase.from("bj_players").update({
      bet: newBet,
      hand: hand,
      status: 'stood',
      acted: true,
      stack: myRow.stack - (newBet - myRow.bet)
    }).eq("id", myRow.id);
    
    await supabase.from("bj_sessions").update({ shoe }).eq("id", session.id);
  }

  async function settle() {
    if (!session) return;
    
    const players = await supabase.from("bj_players").select("*").eq("session_id", session.id);
    if (players.error) return;
    
    const dealerScore = handValue(session.dealer_hand || []);
    const dealerBust = dealerScore > 21;
    
    for (const p of players.data) {
      const score = handValue(p.hand || []);
      let result = 'lose';
      let payout = 0;
      
      if (p.status === 'blackjack') {
        result = 'blackjack';
        payout = Math.floor(p.bet * 3 / 2);
      } else if (dealerBust && score <= 21) {
        result = 'win';
        payout = p.bet;
      } else if (score > 21) {
        result = 'lose';
      } else if (score > dealerScore) {
        result = 'win';
        payout = p.bet;
      } else if (score === dealerScore) {
        result = 'push';
        payout = 0;
      } else {
        result = 'lose';
      }
      
      const newStack = p.stack + payout - p.bet;
      await supabase.from("bj_players").update({
        result: result,
        stack: newStack,
        status: 'settled',
        bet: 0
      }).eq("id", p.id);
    }
    
    await supabase.from("bj_sessions").update({
      state: 'ended',
      dealer_hidden: false
    }).eq("id", session.id);
  }

  async function resetRound() {
    if (!session) return;
    await supabase.from("bj_players").update({
      hand: [],
      bet: 0,
      result: null,
      status: 'seated',
      acted: false
    }).eq("session_id", session.id);
    
    await supabase.from("bj_sessions").update({
      state: 'lobby',
      dealer_hand: [],
      dealer_hidden: true
    }).eq("id", session.id);
  }

  // ---------- UI ----------
  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">Select or create a room to start.</div>;
  const dealerV = handValue(session?.dealer_hand || []);

  return (
    <div className="w-full h-full flex flex-col p-1 md:p-2 gap-1 md:gap-2">
      {/* Header - Mobile Optimized */}
      <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
          <div className="text-white font-bold text-sm md:text-lg">🃏 Blackjack (MP)</div>
          <div className="flex flex-wrap items-center gap-1 md:gap-2 text-white/80 text-xs">
            <span>Room: {roomId.slice(0,8)}</span>
            <span>State: {session?.state||"…"}</span>
            <span>Players: {roomMembers.length}</span>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col gap-1 md:gap-2">
        {/* Dealer Section - Mobile Optimized */}
        <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 rounded-lg p-2 md:p-3 border border-red-400/30">
          <div className="text-center">
            <div className="text-white font-bold text-sm md:text-base mb-1">Dealer</div>
            <HandView hand={session?.dealer_hand||[]}/>
            <div className="text-white/80 text-xs mt-1">Total: {dealerV||"—"}</div>
          </div>
        </div>

        {/* Players Grid - Mobile Responsive */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 md:gap-2">
          {Array.from({length: SEATS}).map((_,i)=>{
            const occupant = players.find(p=>p.seat===i);
            const isMe = occupant && occupant.player_name===name;
            const hv = occupant?.hand ? handValue(occupant.hand) : null;
            return (
              <div key={i} className={`rounded-lg border ${isMe?'border-emerald-400 bg-emerald-900/20':'border-white/20 bg-white/5'} p-1 md:p-2 min-h-[80px] md:min-h-[120px] transition-all hover:bg-white/10`}>
                <div className="text-center">
                  <div className="text-white/70 text-xs mb-1">Seat {i+1}</div>
                  {occupant ? (
                    <div className="space-y-0.5 md:space-y-1">
                      <div className="text-white font-bold text-xs md:text-sm truncate">{occupant.player_name}</div>
                      <div className="text-emerald-300 text-xs font-semibold">Bet: {fmt(occupant.bet||0)}</div>
                      <HandView hand={occupant.hand} size="small"/>
                      <div className="text-white/80 text-xs">
                        Total: {hv??"—"} 
                        <span className={`ml-1 px-1 py-0.5 rounded text-xs ${occupant.status==='playing'?'bg-blue-600':occupant.status==='stood'?'bg-gray-600':'bg-red-600'}`}>
                          {occupant.status}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button onClick={ensureSeated} className="mt-1 px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-xs transition-all">
                      TAKE SEAT
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls - Mobile Optimized */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-2">
        <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
          <div className="text-white/80 text-xs mb-1 font-semibold">Place Bet</div>
          <div className="flex gap-1">
            <input type="number" value={bet} min={MIN_BET} step={MIN_BET}
              onChange={(e)=>setBet(Math.max(MIN_BET, Math.floor(e.target.value)))}
              className="flex-1 bg-black/40 text-white text-xs rounded px-1 py-0.5 md:px-2 md:py-1 border border-white/20 focus:border-emerald-400 focus:outline-none" />
            <button onClick={placeBet} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold text-xs transition-all">
              PLACE
            </button>
          </div>
          <div className="text-white/60 text-xs mt-1">Vault: {fmt(vault)} MLEO</div>
        </div>

        <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
          <div className="text-white/80 text-xs mb-1 font-semibold">Game Actions</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={deal} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-xs transition-all">
              DEAL
            </button>
            <button onClick={hit} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-xs transition-all">
              HIT
            </button>
            <button onClick={stand} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold text-xs transition-all">
              STAND
            </button>
            <button onClick={settle} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold text-xs transition-all">
              SETTLE
            </button>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10">
          <div className="text-white/80 text-xs mb-1 font-semibold">Round Control</div>
          <div className="flex gap-1">
            <button onClick={resetRound} className="flex-1 px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 text-white font-semibold text-xs transition-all">
              NEW ROUND
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className="bg-red-900/20 border border-red-400/30 rounded-lg p-2 text-red-300 text-xs">
          {msg}
        </div>
      )}
    </div>
  );
}