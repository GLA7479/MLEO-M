import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";

function safeRead(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const VAULT_KEY = "mleo_rush_core_v4";
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

const DICE_KEY = "mleo_dice_v2"; const DICE_MIN=1000; const DICE_CAP=100000;
const todayISO=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");const day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;};
function loadDice(){ const st=safeRead(DICE_KEY,{dailyWon:0,lastPlayed:todayISO()}); if(st.lastPlayed!==todayISO()) return {dailyWon:0,lastPlayed:todayISO()}; return {dailyWon:Math.max(0,Number(st.dailyWon||0)),lastPlayed:st.lastPlayed}; }
function saveDice(s){ safeWrite(DICE_KEY,s); }
const rollDie=()=>Math.floor(Math.random()*6)+1; const isHigh=v=>v>=4; const isLow=v=>v<=3;

function DiceGame({ vault, setVaultBoth }){
  const [bet,setBet]=useState(DICE_MIN); const [pick,setPick]=useState("high");
  const [state,setState]=useState(loadDice()); const [spin,setSpin]=useState(false);
  const [roll,setRoll]=useState(null); const [msg,setMsg]=useState(""); const [err,setErr]=useState("");
  const remaining=Math.max(0,DICE_CAP-(state.dailyWon||0));
  const clamp=(n)=>{const v=Math.floor(Number(n||0)); if(!Number.isFinite(v)||v<DICE_MIN) return DICE_MIN; const mv=Math.max(0,vault); const byCap=Math.max(0,remaining); return Math.min(v,mv,byCap>0?byCap:v); };
  function setAllIn(){ const m=Math.max(0,Math.min(vault,remaining)); setBet(Math.max(DICE_MIN,Math.floor(m))); }
  function setHalf(){ const m=Math.max(0,Math.min(vault,remaining||vault)); setBet(Math.max(DICE_MIN,Math.floor(m/2))); }
  function setMin(){ setBet(DICE_MIN); }
  function resetDaily(){ const s={dailyWon:0,lastPlayed:todayISO()}; setState(s); saveDice(s); }

  async function onRoll(){
    setErr(""); setMsg(""); const amount=clamp(bet);
    if(amount<DICE_MIN){ setErr(`Minimum ${fmt(DICE_MIN)} MLEO`); return; }
    if(vault<amount){ setErr("Insufficient Vault balance"); return; }
    if(amount>remaining){ setErr(`Daily win cap reached. You can win up to ${fmt(remaining)} MLEO right now`); return; }

    setVaultBoth(vault-amount); setSpin(true);
    const t0=Date.now();
    const tick=()=>{ if(Date.now()-t0>1000){ finish(); } else { setRoll(r=>((r||1)%6)+1); requestAnimationFrame(tick);} };
    function finish(){ const r=rollDie(); setRoll(r); const win=(pick==='high'?isHigh(r):isLow(r)); if(win){ const profit=amount; setVaultBoth(vault-amount+amount+profit); const next=Math.min(DICE_CAP,(state.dailyWon||0)+profit); const s={dailyWon:next,lastPlayed:todayISO()}; setState(s); saveDice(s); setMsg(`🎉 You won: ${fmt(profit)} MLEO (roll: ${r})`);} else { setMsg(`😬 You lost: ${fmt(amount)} MLEO (roll: ${r})`);} setSpin(false);} 
    requestAnimationFrame(tick);
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="mb-3 text-center">
        <div className="text-white/70 text-sm mb-2">Roll result</div>
        <div className={`mx-auto w-24 h-24 md:w-28 md:h-28 rounded-2xl border border-white/20 flex items-center justify-center text-4xl md:text-5xl font-extrabold text-white ${spin?'animate-pulse':''}`} style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,.15), rgba(0,0,0,.2))'}}>
          {roll ?? '—'}
        </div>
        {roll!=null && <div className="mt-1 text-xs text-white/60">{roll<=3?'LOW (1‑3)':'HIGH (4‑6)'}</div>}
      </div>

      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl p-3">
        <div className="flex items-center justify-center gap-2 mb-3">
          <button onClick={()=>setPick('low')} className={`px-3 py-2 rounded-lg font-bold text-sm border ${'low'=== 'low' && pick==='low' ? 'bg-blue-600 text-white border-blue-500':'bg-white/5 text-white/80 border-white/15 hover:bg-white/10'}`}>LOW (1‑3)</button>
          <button onClick={()=>setPick('high')} className={`px-3 py-2 rounded-lg font-bold text-sm border ${'high'=== 'high' && pick==='high' ? 'bg-green-600 text-white border-green-500':'bg-white/5 text-white/80 border-white/15 hover:bg-white/10'}`}>HIGH (4‑6)</button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <div className="flex items-center gap-2 bg-black/30 border border-white/15 rounded-lg px-2 py-2">
            <span className="text-white/70 text-xs">Bet</span>
            <input type="number" value={bet} min={DICE_MIN} step={DICE_MIN} onChange={(e)=>setBet(clamp(e.target.value))} className="flex-1 bg-transparent text-right text-white text-sm outline-none" />
          </div>
          <button onClick={onRoll} disabled={spin} className={`px-4 py-2 rounded-lg font-bold text-sm ${spin?'bg-gray-600 text-gray-300':'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>{spin?'Rolling…':'ROLL'}</button>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={setMin} className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs hover:bg-white/10">MIN</button>
          <button onClick={setHalf} className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs hover:bg-white/10">HALF</button>
          <button onClick={setAllIn} className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs hover:bg-white/10">ALL‑IN</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/80">
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Min bet: <span className="text-amber-300 font-semibold">{fmt(DICE_MIN)}</span></div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Daily Cap: <span className="text-emerald-300 font-semibold">{fmt(DICE_CAP)}</span></div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Today won: <span className="text-cyan-300 font-semibold">{fmt(state.dailyWon)}</span></div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Cap left: <span className="text-emerald-300 font-semibold">{fmt(Math.max(0,DICE_CAP-(state.dailyWon||0)))} </span></div>
        </div>
        <div className="mt-2 flex justify-end"><button onClick={resetDaily} className="px-2 py-1 text-[11px] rounded bg-white/5 border border-white/10 text-white/60 hover:text-white/90">Reset daily (debug)</button></div>
        {err && <div className="mt-2 text-red-400 text-sm">{err}</div>}
        {msg && <div className="mt-2 text-emerald-300 text-sm">{msg}</div>}
      </div>

      <div className="mt-3 text-center text-xs text-white/60">Zero‑edge 1:1 payout • Fun mode only • No real winnings</div>
    </div>
  );
}

const REGISTRY = [
  { id: "dice", title: "Dice", icon: "🎲", component: DiceGame },
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

function GameViewport({ gameId, vault, setVaultBoth }){
  const entry = REGISTRY.find(g=>g.id===gameId);
  if(!entry) return <div className="flex items-center justify-center h-full text-white/70">Select a game on the left</div>;
  const Comp = entry.component;
  return <Comp vault={vault} setVaultBoth={setVaultBoth} />;
}

export default function ArcadeHub(){
  useIOSViewportFix();
  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [mounted,setMounted]=useState(false);
  const [isFs,setFs]=useState(false);
  const [vaultAmt,setVaultAmt]=useState(0);
  const [playerName,setPlayerName]=useState("");
  const [activeGame,setActiveGame]=useState("dice");
  const wrapRef=useRef(null);

  useEffect(()=>{ setMounted(true); setVaultAmt(getVault()); const saved = safeRead("mleo_player_name", ""); if(typeof saved==="string" && saved.trim()) setPlayerName(saved.trim()); },[]);
  useEffect(()=>{ safeWrite("mleo_player_name", playerName || ""); },[playerName]);

  useEffect(()=>{ const onFs=()=>setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", onFs); return ()=>document.removeEventListener("fullscreenchange", onFs); },[]);
  const toggleFs=()=>{ const el=wrapRef.current||document.documentElement; if(!document.fullscreenElement) el.requestFullscreen?.().catch(()=>{}); else document.exitFullscreen?.().catch(()=>{}); };

  function setVaultBoth(next){ setVault(next); setVaultAmt(getVault()); }

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
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-indigo-900 via_black to-purple-900" style={{height:'var(--app-100vh,100svh)'}}>
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{paddingTop:"calc(env(safe-area-inset-top,0px) + 10px)"}}>
            <div className="flex items-center justify-between gap-2 pointer-events-auto">
              <button onClick={()=>router.push('/')} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              <div className="text-white font-extrabold text-lg truncate">🎮 ARCADE - ONLINE</div>
              <button onClick={toggleFs} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFs?'EXIT':'FULL'}</button>
            </div>
          </div>
        </div>

        <div className="relative w-full h-full flex gap-3 pt-[calc(52px+var(--satb,0px))] px-3 pb-3 md:px-4">
          <aside className="w-[220px] hidden md:flex flex-col gap-2 bg-white/5 border border-white/10 rounded_2xl p-3">
            <div className="text-white/80 text-xs mb-1">Games</div>
            {REGISTRY.map(g=> (
              <GameCard key={g.id} game={g} active={activeGame===g.id} onSelect={setActiveGame} />
            ))}
          </aside>

          <main className="flex-1 border border-white/10 rounded-2xl backdrop-blur-md bg-gradient-to-b from-white/5 to-white/10 overflow-hidden">
            <div className="md:hidden p-2 border-b border-white/10 bg-white/5">
              <select value={activeGame} onChange={(e)=>setActiveGame(e.target.value)} className="w-full bg-black/30 text-white text-sm rounded-lg px-2 py-2 border border-white/20">
                {REGISTRY.map(g=> <option key={g.id} value={g.id}>{g.icon} {g.title}</option>)}
              </select>
            </div>
            <div className="h-[calc(100%-44px)] md:h-full">
              <GameViewport gameId={activeGame} vault={vaultAmt} setVaultBoth={setVaultBoth} />
            </div>
          </main>

          <aside className="w-[240px] hidden lg:flex flex-col gap-2">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white font-semibold">Your Balance</div>
                <div className="text-emerald-400 text-lg font-extrabold">{fmt(vaultAmt)} MLEO</div>
              </div>
              <input type="text" placeholder="Enter your name…" value={playerName} onChange={(e)=>setPlayerName(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text_white placeholder-white/50 focus:outline-none focus:border-purple-400" maxLength={20} />
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/80">
                <div className="bg-white/5 border border-white/10 rounded-lg p-2">Vault Key: <span className="text-cyan-300 break-all">{VAULT_KEY}</span></div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-2">Games: <span className="text-amber-300 font-semibold">{REGISTRY.length}</span></div>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={()=>setVaultBoth(vaultAmt + 100_000)} className="flex-1 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs">+100K (debug)</button>
                <button onClick={()=>setVaultBoth(Math.max(0, vaultAmt - 100_000))} className="flex-1 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs">-100K (debug)</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}

if (typeof document!=='undefined'){ const css=`@keyframes blink{0%,100%{opacity:1}50%{opacity:.5}}`; const el=document.createElement('style'); el.textContent=css; document.head.appendChild(el);}


