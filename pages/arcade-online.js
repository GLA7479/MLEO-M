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
import { readVault, writeVault } from "../lib/vault";

// --------------------------- Shared LocalStorage helpers --------------------
function safeRead(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// Shared Vault — using vault.js for migration and protection
function getVault() {
  return readVault();
}

function setVault(next) {
  writeVault(next);
}

function fmt(n){
  n=Math.floor(Number(n||0));
  if(n>=1e9)return(n/1e9).toFixed(2)+"B";
  if(n>=1e6)return(n/1e6).toFixed(2)+"M";
  if(n>=1e3)return(n/1e3).toFixed(2)+"K";
  return String(n);
}

function useIOSViewportFix(){
  useEffect(()=>{
    const root=document.documentElement;
    const vv=window.visualViewport;
    const setVH=()=>{
      const h=vv?vv.height:window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
      root.style.setProperty("--satb", getComputedStyle(root).getPropertyValue("env(safe-area-inset-bottom,0px)"));
    };
    const onOrient=()=>requestAnimationFrame(()=>setTimeout(setVH,250));
    setVH();
    vv?.addEventListener("resize",setVH);
    vv?.addEventListener("scroll",setVH);
    window.addEventListener("orientationchange",onOrient);
    return()=>{
      vv?.removeEventListener("resize",setVH);
      vv?.removeEventListener("scroll",setVH);
      window.removeEventListener("orientationchange",onOrient);
    };
  },[]);
}

// --------------------------- Lazy registry (code-splitting) -----------------
// Add games here. Each game is lazy-loaded only when selected.
const REGISTRY = [
  { id: "dice", title: "Dice", icon: "🎲", loader: () => import("../games-online/DiceGame").then(m => m.default) },
  { id: "blackjack", title: "Blackjack (MP)", icon: "🃏", loader: () => import("../games-online/BlackjackMP").then(m => m.default) },
  { id: "poker", title: "Texas Hold'em (MP)", icon: "♠️", loader: () => import("../games-online/PokerMP").then(m => m.default) },
];

function GameViewport({ gameId, vault, setVaultBoth, roomId, playerName }){
  const [Comp, setComp] = useState(null);
  const [loading, setLoading] = useState(false);
  const entry = REGISTRY.find(g=>g.id===gameId);

  useEffect(()=>{
    let alive = true;
    async function load(){
      if(!entry){
        setComp(null);
        return;
      }
      setLoading(true);
      try {
        const C = await entry.loader();
        if(alive) setComp(() => C);
      } finally {
        if(alive) setLoading(false);
      }
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
  const [vaultAmt,setVaultAmt]=useState(0);
  const [playerName,setPlayerName]=useState("");
  const [activeGame,setActiveGame]=useState("dice"); // default
  const [roomId, setRoomId] = useState("");
  const [showGameSelector, setShowGameSelector] = useState(false);
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

  function setVaultBoth(next){
    setVault(next);
    setVaultAmt(getVault());
  }

  // switch game and update URL (shallow)
  function selectGame(id){
    const valid = REGISTRY.some(g=>g.id===id) ? id : "dice";
    setActiveGame(valid);
    const url = { pathname: router.pathname, query: { ...router.query, game: valid } };
    router.push(url, undefined, { shallow: true });
  }

  // handle room joining
  function onJoinRoom(roomId) {
    setRoomId(roomId);
    const url = { pathname: router.pathname, query: { ...router.query, room: roomId } };
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
        
        {/* HEADER - בסגנון mleo-texas-holdem-casino */}
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{paddingTop:"calc(env(safe-area-inset-top,0px) + 10px)"}}>
            <div className="flex items-center justify-between gap-2 pointer-events-auto">
              <button onClick={()=>router.push('/')} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              <div className="text-center flex-1">
                <div className="text-white font-extrabold text-lg truncate">🎮 MLEO Arcade Online</div>
                <div className="text-white/60 text-xs">
                  {activeGame === 'blackjack' ? '🃏 Blackjack' : activeGame === 'poker' ? '♠️ Poker' : '🎲 Dice'}
                  {roomId && ' • In Room'}
                </div>
              </div>
              <button onClick={()=>setShowGameSelector(!showGameSelector)} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">GAMES</button>
            </div>
          </div>
        </div>

        {/* BODY - בסגנון mleo-texas-holdem-casino */}
        <div className="relative w-full h-full flex flex-col items-center justify-start pt-[calc(52px+var(--satb,0px))] px-2 pb-3">
          
          {/* Game Selector Modal */}
          {showGameSelector && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <div className="bg-slate-800 border border-white/20 rounded-2xl w-full max-w-sm p-4">
                <div className="text-white font-semibold text-lg mb-4 text-center">Select Game</div>
                <div className="space-y-2">
                  {REGISTRY.map(g=> (
                    <button
                      key={g.id}
                      onClick={() => {
                        selectGame(g.id);
                        setShowGameSelector(false);
                      }}
                      className={`w-full p-3 rounded-lg text-left ${activeGame===g.id ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{g.icon}</span>
                        <div>
                          <div className="font-semibold">{g.title}</div>
                          <div className="text-xs opacity-70">Fun mode · Local vault</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setShowGameSelector(false)}
                  className="w-full mt-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Room Selection for MP games */}
          {(activeGame === 'blackjack' || activeGame === 'poker') && !roomId && (
            <div className="w-full max-w-2xl bg-black/30 rounded-xl p-4 mb-4 backdrop-blur-sm border border-white/10">
              <div className="text-white font-semibold text-lg mb-3 text-center">Select Room</div>
              <RoomBrowser 
                gameId={activeGame} 
                playerName={playerName} 
                onJoinRoom={onJoinRoom} 
              />
            </div>
          )}

          {/* In Room Header */}
          {roomId && (
            <div className="w-full max-w-2xl bg-black/30 rounded-xl p-3 mb-4 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between">
                <div className="text-white font-semibold">
                  {activeGame === 'blackjack' ? '🃏 Blackjack Room' : '♠️ Poker Room'}
                </div>
                <button 
                  onClick={async () => {
                    try {
                      const rid = roomId;
                      if (rid) {
                        // מחיקה "Best-effort" של נוכחות בטבלת שחקני חדר
                        const { getClientId } = await import("../lib/supabaseClients");
                        const { supabaseMP } = await import("../lib/supabaseClients");
                        await supabaseMP
                          .from("arcade_room_players")
                          .delete()
                          .match({ room_id: rid, client_id: getClientId() });
                      }
                    } catch {}
                    const url = { pathname: router.pathname, query: { ...router.query } };
                    delete url.query.room;
                    router.push(url, undefined, { shallow: true });
                    setRoomId("");
                  }}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
                >
                  Leave Room
                </button>
              </div>
            </div>
          )}

          {/* Main Game Area */}
          <div className="w-full max-w-6xl flex-1 border border-white/10 rounded-2xl backdrop-blur-md bg-gradient-to-b from-white/5 to-white/10 overflow-hidden">
            <GameViewport gameId={activeGame} vault={vaultAmt} setVaultBoth={setVaultBoth} roomId={roomId} playerName={playerName} />
          </div>

          {/* Player Info - רק במובייל */}
          <div className="md:hidden w-full max-w-2xl bg-black/30 rounded-xl p-3 mt-4 backdrop-blur-sm border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white font-semibold text-sm">Balance</div>
              <div className="text-emerald-400 text-lg font-extrabold">{fmt(vaultAmt)} MLEO</div>
            </div>
            <input 
              type="text" 
              placeholder="Your name…" 
              value={playerName} 
              onChange={(e)=>setPlayerName(e.target.value)} 
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400" 
              maxLength={20} 
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}