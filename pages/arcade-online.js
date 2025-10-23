// ============================================================================
// MLEO Arcade-Online Hub — Single Page (Next.js /pages/arcade-online.js)
// One page runs all online games via lazy-loaded modules from /games-online/*
// • Query param routing: /arcade-online?game=dice
// • Shared Vault (localStorage: mleo_rush_core_v4) — no real winnings
// • English UI, Hebrew comments here only
// ============================================================================

import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import RoomBrowser from "../components/online/RoomBrowser";
import RoomChat from "../components/online/RoomChat";
import RoomPresence from "../components/online/RoomPresence";
import { supabaseMP as supabase } from "../lib/supabaseClients";

// --------------------------- Shared LocalStorage helpers --------------------
function safeRead(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Shared Vault — same key used across site
const VAULT_KEY = "mleo_rush_core_v4"; // preserves { vault: number, ... }
function getVault() { const data = safeRead(VAULT_KEY, {}); return Math.max(0, Number(data?.vault || 0)); }
function setVault(next) { const data = safeRead(VAULT_KEY, {}); data.vault = Math.max(0, Math.floor(Number(next||0))); safeWrite(VAULT_KEY, data); }

function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

function useIOSViewportFix(){
  useEffect(()=>{
    const root=document.documentElement; const vv=window.visualViewport;
    const setVH=()=>{ const h=vv?vv.height:window.innerHeight; root.style.setProperty("--app-100vh", `${Math.round(h)}px`); root.style.setProperty("--satb", getComputedStyle(root).getPropertyValue("env(safe-area-inset-bottom,0px)")); };
    const onOrient=()=>requestAnimationFrame(()=>setTimeout(setVH,250));
    setVH(); vv?.addEventListener("resize",setVH); vv?.addEventListener("scroll",setVH); window.addEventListener("orientationchange",onOrient);
    return()=>{ vv?.removeEventListener("resize",setVH); vv?.removeEventListener("scroll",setVH); window.removeEventListener("orientationchange",onOrient); };
  },[]);
}

// --------------------------- Lazy registry (code-splitting) -----------------
// Add games here. Each game is lazy-loaded only when selected.
const REGISTRY = [
  { id: "dice", title: "Dice", icon: "🎲", loader: () => import("../games-online/DiceGame").then(m => m.default) },
  { id: "blackjack", title: "Blackjack (MP)", icon: "🃏", loader: () => import("../games-online/BlackjackMP").then(m => m.default) },
  { id: "poker", title: "Texas Hold'em (MP)", icon: "♠️", loader: () => import("../games-online/PokerMP").then(m => m.default) },
  // Next games examples:
  // { id: "plinko", title: "Plinko", icon: "🟡", loader: () => import("../games-online/PlinkoGame").then(m => m.default) },
  // { id: "hilo",   title: "Hi-Lo", icon: "⬆️⬇️", loader: () => import("../games-online/HiLoGame").then(m => m.default) },
];

function GameCard({ game, active, onSelect }){
  return (
    <button onClick={()=>onSelect(game.id)} className={`flex items-center gap-3 w-full text-left px-3 py-2 rounded-xl border ${active? 'border-emerald-400 bg-emerald-400/10':'border-white/10 hover:bg-white/5'} text-white/90`}>
      <span className="text-xl">{game.icon}</span>
      <div className="flex-1">
        <div className="font-bold">{game.title}</div>
        <div className="text-xs text-white/60">Fun mode · Local vault</div>
      </div>
      <span className="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/10">OPEN</span>
    </button>
  );
}

function GameViewport({ gameId, vault, setVaultBoth, roomId, playerName }){
  const [Comp, setComp] = useState(null);
  const [loading, setLoading] = useState(false);
  const entry = REGISTRY.find(g=>g.id===gameId);

  useEffect(()=>{
    let alive = true;
    async function load(){
      if(!entry){ setComp(null); return; }
      setLoading(true);
      try {
        const C = await entry.loader();
        if(alive) setComp(() => C);
      } finally { if(alive) setLoading(false); }
    }
    load();
    return ()=>{ alive = false; };
  }, [entry?.id]);

  if(!entry) return <div className="flex items-center justify-center h-full text-white/70">Pick a game</div>;
  if(loading || !Comp) return <div className="flex items-center justify-center h-full text-white/70">Loading {entry.title}…</div>;
  return <Comp vault={vault} setVaultBoth={setVaultBoth} roomId={roomId} playerName={playerName} />;
}

export default function ArcadeOnline(){
  useIOSViewportFix();
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [mounted,setMounted]=useState(false);
  const [isFs,setFs]=useState(false);
  const [vaultAmt,setVaultAmt]=useState(0);
  const [playerName,setPlayerName]=useState("");
  const [activeGame,setActiveGame]=useState("dice"); // default
  const [roomId, setRoomId] = useState("");
  const wrapRef=useRef(null);

  // read game from query (?game=)
  useEffect(()=>{
    const q = (router.query?.game || '').toString();
    if(q && REGISTRY.some(g=>g.id===q)) setActiveGame(q);
  }, [router.query?.game]);

  // read roomId from query (?room=)
  useEffect(()=>{
    const rid = (router.query?.room || '').toString();
    if (rid) setRoomId(rid);
  }, [router.query?.room]);

  // mount & shared state
  useEffect(()=>{
    setMounted(true);
    setVaultAmt(getVault());
    const saved = safeRead("mleo_player_name", "");
    if(typeof saved==="string" && saved.trim()) setPlayerName(saved.trim());
  },[]);
  useEffect(()=>{ safeWrite("mleo_player_name", playerName || ""); },[playerName]);

  // ensure membership on deep-link (user opens URL with room directly)
  useEffect(()=>{
    if (!roomId) return;
    (async()=>{
      // attempt to upsert membership by (room_id, player_name) uniqueness
      const name = playerName || 'Guest';
      // upsert will handle existing membership gracefully
      await supabase.from('arcade_room_players').upsert({ room_id: roomId, player_name: name }, { onConflict: "room_id,player_name" });
    })();
  }, [roomId, playerName]);

  // fullscreen
  useEffect(()=>{ const onFs=()=>setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", onFs); return ()=>document.removeEventListener("fullscreenchange", onFs); },[]);
  const toggleFs=()=>{ const el=wrapRef.current||document.documentElement; if(!document.fullscreenElement) el.requestFullscreen?.().catch(()=>{}); else document.exitFullscreen?.().catch(()=>{}); };

  function setVaultBoth(next){ setVault(next); setVaultAmt(getVault()); }

  // switch game and update URL (shallow)
  function selectGame(id){
    const valid = REGISTRY.some(g=>g.id===id) ? id : "dice";
    setActiveGame(valid);
    const url = { pathname: router.pathname, query: { ...router.query, game: valid } };
    router.push(url, undefined, { shallow: true });
  }

  // join room helper from RoomBrowser
  function onJoinRoom(rid){
    setRoomId(rid);
    const url = { pathname: router.pathname, query: { ...router.query, game: activeGame, room: rid } };
    router.push(url, undefined, { shallow: true });
  }

  if(!mounted){
    return (
      <Layout address={address} isConnected={isConnected} vaultAmount={0}>
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="text-white text-xl">Loading…</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout address={address} isConnected={isConnected} vaultAmount={vaultAmt}>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-indigo-900 via-black to-purple-900" style={{height:'var(--app-100vh,100svh)'}}>
        {/* HUD */}
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{paddingTop:"calc(env(safe-area-inset-top,0px) + 10px)"}}>
            <div className="flex items-center justify-between gap-2 pointer-events-auto">
              <button onClick={()=>router.push('/')} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              <div className="text-white font-extrabold text-lg truncate">🎮 MLEO Arcade Online</div>
              <button onClick={toggleFs} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFs?'EXIT':'FULL'}</button>
            </div>
          </div>
        </div>

        {/* BODY: Sidebar (games) + Viewport */}
        <div className="relative w-full h-full flex gap-3 pt-[calc(52px+var(--satb,0px))] px-3 pb-3 md:px-4">
          <aside className="w-[260px] hidden md:flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-3">
            <div className="text-white/80 text-xs mb-1">Games</div>
            {REGISTRY.map(g=> (
              <GameCard key={g.id} game={g} active={activeGame===g.id} onSelect={(id)=>selectGame(id)} />
            ))}
            {/* Room browser appears only for MP titles */}
            {(activeGame === 'blackjack' || activeGame === 'poker') && (
              <div className="mt-3">
                <div className="text-white/80 text-xs mb-1">Rooms</div>
                <RoomBrowser gameId={activeGame} playerName={playerName} onJoinRoom={onJoinRoom} />
              </div>
            )}
          </aside>

          <main className="flex-1 border border-white/10 rounded-2xl backdrop-blur-md bg-gradient-to-b from-white/5 to-white/10 overflow-hidden">
            {/* MOBILE game switcher */}
            <div className="md:hidden p-2 border-b border-white/10 bg-white/5">
              <select value={activeGame} onChange={(e)=>selectGame(e.target.value)} className="w-full bg-black/30 text-white text-sm rounded-lg px-2 py-2 border border-white/20">
                {REGISTRY.map(g=> <option key={g.id} value={g.id}>{g.icon} {g.title}</option>)}
              </select>
            </div>
            <div className="h-[calc(100%-44px)] md:h-full">
              <GameViewport gameId={activeGame} vault={vaultAmt} setVaultBoth={setVaultBoth} roomId={roomId} playerName={playerName} />
            </div>
          </main>

          {/* Right column: Player & Vault */}
          <aside className="w-[260px] hidden lg:flex flex-col gap-3">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white font-semibold">Your Balance</div>
                <div className="text-emerald-400 text-lg font-extrabold">{fmt(vaultAmt)} MLEO</div>
              </div>
              <input type="text" placeholder="Enter your name…" value={playerName} onChange={(e)=>setPlayerName(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400" maxLength={20} />
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/80">
                <div className="bg-white/5 border border-white/10 rounded-lg p-2">Vault Key: <span className="text-cyan-300 break-all">{VAULT_KEY}</span></div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-2">Games: <span className="text-amber-300 font-semibold">{REGISTRY.length}</span></div>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={()=>setVaultBoth(vaultAmt + 100_000)} className="flex-1 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs">+100K (debug)</button>
                <button onClick={()=>setVaultBoth(Math.max(0, vaultAmt - 100_000))} className="flex-1 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs">-100K (debug)</button>
              </div>
            </div>

            {(activeGame === 'blackjack' || activeGame === 'poker') && roomId && (
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3">
                <RoomPresence roomId={roomId} playerName={playerName} onLeave={() => {
                  // clear room from URL
                  const url = { pathname: router.pathname, query: { ...router.query } };
                  delete url.query.room;
                  router.push(url, undefined, { shallow: true });
                  setRoomId("");
                  // best-effort: clear game seats
                  (async()=>{
                    try {
                      const name = playerName || 'Guest';
                      // Clear Blackjack seat
                      const { data: bjSess } = await supabase.from('bj_sessions').select('id').eq('room_id', roomId).maybeSingle();
                      if(bjSess?.id){
                        const { data: bjMine } = await supabase.from('bj_players').select('id').eq('session_id', bjSess.id).eq('player_name', name).maybeSingle();
                        if(bjMine?.id){ await supabase.from('bj_players').delete().eq('id', bjMine.id); }
                      }
                      // Clear Poker seat
                      const { data: pokerSess } = await supabase.from('poker_sessions').select('id').eq('room_id', roomId).maybeSingle();
                      if(pokerSess?.id){
                        const { data: pokerMine } = await supabase.from('poker_players').select('id').eq('session_id', pokerSess.id).eq('player_name', name).maybeSingle();
                        if(pokerMine?.id){ await supabase.from('poker_players').delete().eq('id', pokerMine.id); }
                      }
                    } catch(e) {}
                  })();
                }} />
                <div className="mt-3">
                  <RoomChat roomId={roomId} playerName={playerName} />
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </Layout>
  );
}

// Minimal injected CSS keyframes (optional)
if (typeof document!=='undefined'){ const css=`@keyframes blink{0%,100%{opacity:1}50%{opacity:.5}}`; const el=document.createElement('style'); el.textContent=css; document.head.appendChild(el); }