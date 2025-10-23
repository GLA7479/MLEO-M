// Blackjack (MP) — fixed layout (cards view, responsive seats)
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
const suitClass = (s)=> (s==="h"||s==="d") ? "text-rose-300" : "text-sky-300";

function Card({ code }) {
  if (!code) return null;
  const r = code.slice(0,-1), s = code.slice(-1);
  return (
    <span className={`inline-flex items-center justify-center border border-white/20 rounded-md w-8 h-10 mx-0.5 text-xs font-semibold bg-white/5 ${suitClass(s)}`}>
      <span className="leading-none">{r}{suitIcon(s)}</span>
    </span>
  );
}
function HandView({ hand }) {
  const h = hand || [];
  return (
    <div className="flex items-center overflow-x-auto whitespace-nowrap no-scrollbar pr-1">
      {h.length===0 ? <span className="text-white/60 text-xs">—</span> : h.map((c,i)=><Card key={i} code={c}/>)}
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
    const card=deck[pos++]; const next=[...(myRow.hand||[]), card];
    const total=handValue(next.map(c=>c.slice(0,-1))); const bust=total>21;
    await supabase.from("bj_sessions").update({ shoe:deck, shoe_pos:pos }).eq("id", session.id);
    await supabase.from("bj_players").update({ hand:next, status:bust?"bust":"playing" }).eq("id", myRow.id);
  }

  async function stand(){ if(!myRow) return; await supabase.from("bj_players").update({ status:"stood" }).eq("id", myRow.id); }

  async function settle(){
    if(!session) return;
    let deck=session.shoe||newShoe(); let pos=session.shoe_pos||0; let dealer=session.dealer_hand||[];
    const dv = ()=> handValue(dealer.map(c=>c.slice(0,-1)));
    while(dv()<17){ dealer=[...dealer, deck[pos++]]; }
    await supabase.from("bj_sessions").update({ stage:"settle", dealer_hand:dealer, shoe:deck, shoe_pos:pos }).eq("id", session.id);
    const dealerV = dv();
    for(const p of players){
      if(!p.bet || !p.hand) continue;
      const pv = handValue((p.hand||[]).map(c=>c.slice(0,-1)));
      let outcome="lose";
      if(pv>21) outcome="lose"; else if(dealerV>21 || pv>dealerV) outcome="win"; else if(pv===dealerV) outcome="push";
      if(p.player_name===name){
        let next=vault; if(outcome==="win") next=vault + p.bet*2; if(outcome==="push") next=vault + p.bet; setVaultBoth(next);
      }
      await supabase.from("bj_players").update({ status:"idle", bet:0, hand:[] }).eq("id", p.id);
    }
    await supabase.from("bj_sessions").update({ stage:"lobby" }).eq("id", session.id);
  }

  // ---------- UI ----------
  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70">Select or create a room to start.</div>;
  const dealerV = handValue((session?.dealer_hand||[]).map(c=>c.slice(0,-1)));

  return (
    <div className="w-full h-full grid grid-rows-[auto_1fr_auto] p-3 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-white font-semibold">Blackjack (MP) — Room {roomId.slice(0,8)}</div>
        <div className="flex items-center gap-3 text-white/70 text-sm">
          <span>Stage: {session?.stage||"…"}</span>
          <span>Players: {roomMembers.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Seats (responsive grid) */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {Array.from({length: SEATS}).map((_,i)=>{
            const occupant = players.find(p=>p.seat===i);
            const isMe = occupant && occupant.player_name===name;
            const hv = occupant?.hand ? handValue((occupant.hand||[]).map(c=>c.slice(0,-1))) : null;
            return (
              <div key={i} className={`rounded-xl border ${isMe?'border-emerald-400':'border-white/10'} bg-white/5 p-2 min-h-[110px]`}>
                <div className="text-xs text-white/70 mb-1">Seat {i+1}</div>
                {occupant ? (
                  <div className="space-y-1">
                    <div className="text-white text-sm font-semibold truncate">{occupant.player_name}</div>
                    <div className="text-white/70 text-xs">Bet: {fmt(occupant.bet||0)}</div>
                    <HandView hand={occupant.hand}/>
                    <div className="text-white/70 text-xs">Total: {hv??"—"} ({occupant.status})</div>
                  </div>
                ) : (
                  <button onClick={ensureSeated} className="mt-1 px-2 py-1 rounded bg-white/10 border border-white/10 text-white/80 text-xs w-full">TAKE</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Dealer panel */}
        <div className="w-full md:w-[300px] rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-white font-semibold mb-1">Dealer</div>
          <HandView hand={session?.dealer_hand||[]}/>
          <div className="text-white/60 text-xs mt-1">Total: {dealerV||"—"}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <div className="text-white/80 text-xs mb-1">Bet</div>
          <div className="flex gap-2">
            <input type="number" value={bet} min={MIN_BET} step={MIN_BET}
              onChange={(e)=>setBet(Math.max(MIN_BET, Math.floor(e.target.value)))}
              className="flex-1 bg-black/30 text-white text-sm rounded-lg px-2 py-1 border border-white/15" />
            <button onClick={placeBet} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm">PLACE</button>
          </div>
          <div className="text-white/60 text-xs mt-1">Vault: {fmt(vault)}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <div className="text-white/80 text-xs mb-1">Round</div>
          <div className="flex gap-2">
            <button onClick={deal}   className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm">DEAL</button>
            <button onClick={hit}    className="flex-1 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm">HIT</button>
            <button onClick={stand}  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm">STAND</button>
            <button onClick={settle} className="flex-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm">SETTLE</button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <div className="text-white/80 text-xs mb-1">Status</div>
          <div className="text-emerald-300 text-xs min-h-[20px]">{msg}</div>
        </div>
      </div>
    </div>
  );
}