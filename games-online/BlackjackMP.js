// Blackjack (MP) — mobile-optimized layout
// Uses supabaseMP (new project) + local Vault

import { useEffect, useMemo, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";

const MIN_BET = 1000;
const SEATS = 5;

// ---------- Utils ----------
function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

function newShoe() {
  const suits = ["h","d","c","s"];
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck = [];
  for (let i = 0; i < 6; i++) for (const s of suits) for (const r of ranks) deck.push(r+s);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [deck[i], deck[j]]=[deck[j], deck[i]]; }
  return deck;
}
function cardValue(r){ if(r==="A") return 11; if(["K","Q","J"].includes(r)) return 10; return parseInt(r,10); }
function handValue(hand){ let t=0,a=0; for(const c of hand){ const r=c.slice(0,-1); t+=cardValue(r); if(r==="A")a++; } while(t>21&&a>0){ t-=10;a--; } return t; }
const suitIcon = (s)=> s==="h"?"♥":s==="d"?"♦":s==="c"?"♣":"♠";
const suitClass = (s)=> (s==="h"||s==="d") ? "text-red-400" : "text-blue-300";

function Card({ code, size = "normal" }) {
  if (!code) return null;
  const r = code.slice(0,-1), s = code.slice(-1);
  const sizeClasses = size === "small" ? "w-8 h-10 text-xs" : "w-10 h-14 text-sm";
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

  // bootstrap session
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      const { data } = await supabase.from("bj_sessions").select("*").eq("room_id", roomId).maybeSingle();
      if (!data) {
        const shoe = newShoe();
        const { data: created } = await supabase.from("bj_sessions")
          .insert({ room_id: roomId, stage: "lobby", shoe, shoe_pos: 0 })
          .select().single();
        setSession(created);
      } else setSession(data);
    })();
  }, [roomId]);

  // presence
  useEffect(() => {
    if (!roomId) return;
    const load = async () => {
      const { data } = await supabase.from("arcade_room_players").select("id,player_name").eq("room_id", roomId);
      setRoomMembers(data||[]);
    };
    load();
    const ch = supabase
      .channel(`presence:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "arcade_room_players", filter: `room_id=eq.${roomId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [roomId]);

  // players + session realtime
  useEffect(() => {
    if (!session?.id) return;
    const reloadPlayers = async ()=> {
      const { data } = await supabase.from("bj_players").select("*").eq("session_id", session.id);
      setPlayers(data||[]);
    };
    reloadPlayers();
    const ch = supabase
      .channel(`bj:${session.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bj_sessions", filter: `id=eq.${session.id}` }, (p)=> setSession(p.new))
      .on("postgres_changes", { event: "*", schema: "public", table: "bj_players", filter: `session_id=eq.${session.id}` }, reloadPlayers)
      .subscribe();
    return ()=> supabase.removeChannel(ch);
  }, [session?.id]);

  // actions
  async function ensureSeated() {
    if (!session?.id) return null;
    if (myRow) return myRow;
    const used = new Set(players.map(p=>p.seat).filter(x=>typeof x==="number"));
    if (used.size >= SEATS) { setMsg("Table is full."); return null; }
    const seat = [0,1,2,3,4].find(i=>!used.has(i));
    const { data: up, error } = await supabase.from("bj_players")
      .upsert({ session_id: session.id, player_name: name, seat, status: "idle", bet: 0, hand: [] }, { onConflict: "session_id,player_name" })
      .select().single();
    if (error) { setMsg("Join failed"); return null; }
    return up;
  }

  async function placeBet() {
    const amount = clampBet(bet);
    if (vault < amount) { setMsg("Insufficient Vault balance"); return; }
    const me = await ensureSeated(); if (!me) return;
    setVaultBoth(vault - amount);
    await supabase.from("bj_players").update({ bet: amount, status: "betting" }).eq("id", me.id);
    setMsg(`Bet placed: ${fmt(amount)} MLEO`);
  }

  async function deal() {
    if (!session) return;
    const actives = players.filter(p=>p.bet>0);
    if (actives.length===0) { setMsg("No bets yet."); return; }
    let deck = session.shoe || newShoe(); let pos = session.shoe_pos || 0;
    let dealer = [];
    const updates = [];
    for (const p of actives){ const a=deck[pos++], b=deck[pos++]; updates.push({ id:p.id, hand:[a,b], status:"playing" }); }
    dealer.push(deck[pos++]); dealer.push(deck[pos++]);
    await supabase.from("bj_sessions").update({ stage:"acting", dealer_hand: dealer, shoe: deck, shoe_pos: pos }).eq("id", session.id);
    for (const u of updates) await supabase.from("bj_players").update({ hand:u.hand, status:u.status }).eq("id", u.id);
    setMsg("Cards dealt.");
  }

  async function hit(){
    if (!session || !myRow || myRow.status!=="playing") return;
    let deck=session.shoe||newShoe(); let pos=session.shoe_pos||0;
    const card=deck[pos++]; 
    const next=[...(myRow.hand||[]), card];

    // ❌ לא להשתמש ב- map(...slice(0,-1))
    const total = handValue(next); 
    const bust = total > 21;

    await supabase.from("bj_sessions").update({ shoe:deck, shoe_pos:pos }).eq("id", session.id);
    await supabase.from("bj_players").update({ hand:next, status:bust?"bust":"playing" }).eq("id", myRow.id);
  }

  async function stand(){ if(!myRow) return; await supabase.from("bj_players").update({ status:"stood" }).eq("id", myRow.id); }

  async function settle(){
    if(!session) return;
    let deck=session.shoe||newShoe(); let pos=session.shoe_pos||0; 
    let dealer=session.dealer_hand||[];

    const dv = () => handValue(dealer);

    while(dv()<17){ dealer=[...dealer, deck[pos++]]; }

    await supabase.from("bj_sessions").update({ stage:"settle", dealer_hand:dealer, shoe:deck, shoe_pos:pos }).eq("id", session.id);

    const dealerV = dv();
    for(const p of players){
      if(!p.bet || !p.hand) continue;

      // ❌ במקום handValue((p.hand||[]).map(...))
      const pv = handValue(p.hand);

      let outcome="lose";
      if(pv>21) outcome="lose"; 
      else if(dealerV>21 || pv>dealerV) outcome="win"; 
      else if(pv===dealerV) outcome="push";

      if(p.player_name===name){
        let next=vault; 
        if(outcome==="win")  next = vault + p.bet*2;
        if(outcome==="push") next = vault + p.bet;
        setVaultBoth(next);
      }
      await supabase.from("bj_players").update({ status:"idle", bet:0, hand:[] }).eq("id", p.id);
    }
    await supabase.from("bj_sessions").update({ stage:"lobby" }).eq("id", session.id);
  }

  // ---------- UI ----------
  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">Select or create a room to start.</div>;
  const dealerV = handValue(session?.dealer_hand || []);

  return (
    <div className="w-full h-full flex flex-col p-2 md:p-4 gap-2 md:gap-4">
      {/* Header - Mobile Optimized */}
      <div className="bg-white/5 rounded-lg p-2 md:p-4 border border-white/10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div className="text-white font-bold text-lg md:text-xl">🃏 Blackjack (MP)</div>
          <div className="flex flex-wrap items-center gap-2 md:gap-4 text-white/80 text-xs md:text-sm">
            <span>Room: {roomId.slice(0,8)}</span>
            <span>Stage: {session?.stage||"…"}</span>
            <span>Players: {roomMembers.length}</span>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col gap-3 md:gap-6">
        {/* Dealer Section - Mobile Optimized */}
        <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 rounded-lg p-3 md:p-6 border border-red-400/30">
          <div className="text-center">
            <div className="text-white font-bold text-base md:text-lg mb-2">Dealer</div>
            <HandView hand={session?.dealer_hand||[]}/>
            <div className="text-white/80 text-xs md:text-sm mt-1">Total: {dealerV||"—"}</div>
          </div>
        </div>

        {/* Players Grid - Mobile Responsive */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
          {Array.from({length: SEATS}).map((_,i)=>{
            const occupant = players.find(p=>p.seat===i);
            const isMe = occupant && occupant.player_name===name;
            const hv = occupant?.hand ? handValue(occupant.hand) : null;
            return (
              <div key={i} className={`rounded-lg border ${isMe?'border-emerald-400 bg-emerald-900/20':'border-white/20 bg-white/5'} p-2 md:p-4 min-h-[120px] md:min-h-[180px] transition-all hover:bg-white/10`}>
                <div className="text-center">
                  <div className="text-white/70 text-xs mb-1">Seat {i+1}</div>
                  {occupant ? (
                    <div className="space-y-1 md:space-y-3">
                      <div className="text-white font-bold text-sm md:text-lg truncate">{occupant.player_name}</div>
                      <div className="text-emerald-300 text-xs md:text-sm font-semibold">Bet: {fmt(occupant.bet||0)}</div>
                      <HandView hand={occupant.hand} size="small"/>
                      <div className="text-white/80 text-xs">
                        Total: {hv??"—"} 
                        <span className={`ml-1 px-1 py-0.5 rounded text-xs ${occupant.status==='playing'?'bg-blue-600':occupant.status==='stood'?'bg-gray-600':'bg-red-600'}`}>
                          {occupant.status}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button onClick={ensureSeated} className="mt-2 px-2 py-1 md:px-4 md:py-2 rounded bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-xs md:text-sm transition-all">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4">
        <div className="bg-white/5 rounded-lg p-2 md:p-4 border border-white/10">
          <div className="text-white/80 text-xs md:text-sm mb-2 font-semibold">Place Bet</div>
          <div className="flex gap-2">
            <input type="number" value={bet} min={MIN_BET} step={MIN_BET}
              onChange={(e)=>setBet(Math.max(MIN_BET, Math.floor(e.target.value)))}
              className="flex-1 bg-black/40 text-white text-xs md:text-sm rounded px-2 py-1 md:px-3 md:py-2 border border-white/20 focus:border-emerald-400 focus:outline-none" />
            <button onClick={placeBet} className="px-2 py-1 md:px-4 md:py-2 rounded bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold text-xs md:text-sm transition-all">
              PLACE
            </button>
          </div>
          <div className="text-white/60 text-xs mt-1">Vault: {fmt(vault)} MLEO</div>
        </div>

        <div className="bg-white/5 rounded-lg p-2 md:p-4 border border-white/10">
          <div className="text-white/80 text-xs md:text-sm mb-2 font-semibold">Game Actions</div>
          <div className="grid grid-cols-2 gap-1 md:gap-2">
            <button onClick={deal} className="px-2 py-1 md:px-3 md:py-2 rounded bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-xs md:text-sm transition-all">
              DEAL
            </button>
            <button onClick={hit} className="px-2 py-1 md:px-3 md:py-2 rounded bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold text-xs md:text-sm transition-all">
              HIT
            </button>
            <button onClick={stand} className="px-2 py-1 md:px-3 md:py-2 rounded bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold text-xs md:text-sm transition-all">
              STAND
            </button>
            <button onClick={settle} className="px-2 py-1 md:px-3 md:py-2 rounded bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold text-xs md:text-sm transition-all">
              SETTLE
            </button>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-2 md:p-4 border border-white/10">
          <div className="text-white/80 text-xs md:text-sm mb-2 font-semibold">Status</div>
          <div className="text-emerald-300 text-xs md:text-sm min-h-[20px] md:min-h-[40px] flex items-center">
            {msg || "Ready to play"}
          </div>
        </div>
      </div>
    </div>
  );
}