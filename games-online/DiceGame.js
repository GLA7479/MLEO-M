// ============================================================================
// MLEO DiceGame — plug-in component (for Arcade Hub /pages/arcade-online.js)
// Specs: Min bet 1,000 MLEO, No Max, Daily Cap 100,000, House Edge 0%.
// Local Vault only; all UI text in EN.
// ============================================================================
import { useEffect, useState } from "react";

const DICE_MIN = 1000; 
const DICE_CAP = 100000;
const DICE_KEY = "mleo_dice_v2";

function safeRead(key, fallback){ try { const raw = localStorage.getItem(key); return raw? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
const todayISO=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");const day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;};
function loadDice(){ const st=safeRead(DICE_KEY,{dailyWon:0,lastPlayed:todayISO()}); if(st.lastPlayed!==todayISO()) return {dailyWon:0,lastPlayed:todayISO()}; return {dailyWon:Math.max(0,Number(st.dailyWon||0)),lastPlayed:st.lastPlayed}; }
function saveDice(s){ safeWrite(DICE_KEY,s); }
const rollDie=()=>Math.floor(Math.random()*6)+1; const isHigh=(v)=>v>=4; const isLow=(v)=>v<=3;
function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

export default function DiceGame({ vault, setVaultBoth }){
  const [bet,setBet]=useState(DICE_MIN); 
  const [pick,setPick]=useState("high");
  const [state,setState]=useState(loadDice());
  const [spin,setSpin]=useState(false);
  const [roll,setRoll]=useState(null);
  const [msg,setMsg]=useState(""); 
  const [err,setErr]=useState("");

  const remaining=Math.max(0,DICE_CAP-(state.dailyWon||0));
  const clamp=(n)=>{const v=Math.floor(Number(n||0)); if(!Number.isFinite(v)||v<DICE_MIN) return DICE_MIN; const mv=Math.max(0,vault); const byCap=Math.max(0,remaining); return Math.min(v,mv,byCap>0?byCap:v); };

  function setAllIn(){ const m=Math.max(0,Math.min(vault,remaining)); setBet(Math.max(DICE_MIN,Math.floor(m))); }
  function setHalf(){ const m=Math.max(0,Math.min(vault,remaining||vault)); setBet(Math.max(DICE_MIN,Math.floor(m/2))); }
  function setMin(){ setBet(DICE_MIN); }
  function resetDaily(){ const s={dailyWon:0,lastPlayed:todayISO()}; setState(s); saveDice(s); }

  async function onRoll(){
    setErr(""); setMsg(""); const amount=clamp(bet);
    if(amount<DICE_MIN){ setErr(`Minimum is ${fmt(DICE_MIN)} MLEO`); return; }
    if(vault<amount){ setErr("Insufficient Vault balance"); return; }
    if(amount>remaining){ setErr(`Daily win cap reached. You can bet up to ${fmt(remaining)} MLEO right now.`); return; }

    setVaultBoth(vault-amount); setSpin(true);
    const t0=Date.now();
    const tick=()=>{ if(Date.now()-t0>1000){ finish(); } else { setRoll(r=>(((r??1)%6)+1)); requestAnimationFrame(tick);} };
    function finish(){ 
      const r=rollDie(); setRoll(r); 
      const win=(pick==='high'?isHigh(r):isLow(r)); 
      if(win){ 
        const profit=amount; 
        setVaultBoth(vault-amount+amount+profit); 
        const next=Math.min(DICE_CAP,(state.dailyWon||0)+profit); 
        const s={dailyWon:next,lastPlayed:todayISO()};
        setState(s); saveDice(s); 
        setMsg(`🎉 You won: ${fmt(profit)} MLEO (roll: ${r})`);
      } else { 
        setMsg(`😬 You lost: ${fmt(amount)} MLEO (roll: ${r})`);
      }
      setSpin(false);
    }
    requestAnimationFrame(tick);
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="mb-3 text-center">
        <div className="text-white/70 text-sm mb-2">Roll result</div>
        <div className={`mx-auto w-24 h-24 md:w-28 md:h-28 rounded-2xl border border-white/20 flex items-center justify-center text-4xl md:text-5xl font-extrabold text-white ${spin?'animate-pulse':''}`} style={{background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,.15), rgba(0,0,0,.2))'}}>
          {roll ?? '—'}
        </div>
        {roll!=null && <div className="mt-1 text-xs text-white/60">{roll<=3?'LOW (1-3)':'HIGH (4-6)'}</div>}
      </div>

      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-xl p-3">
        <div className="flex items-center justify-center gap-2 mb-3">
          <button onClick={()=>setPick('low')}  className={`px-3 py-2 rounded-lg font-bold text-sm border ${pick==='low'  ? 'bg-blue-600 text-white border-blue-500':'bg-white/5 text-white/80 border-white/15 hover:bg-white/10'}`}>LOW (1-3)</button>
          <button onClick={()=>setPick('high')} className={`px-3 py-2 rounded-lg font-bold text-sm border ${pick==='high' ? 'bg-green-600 text-white border-green-500':'bg-white/5 text-white/80 border-white/15 hover:bg-white/10'}`}>HIGH (4-6)</button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <div className="flex items-center gap-2 bg-black/30 border border-white/15 rounded-lg px-2 py-2">
            <span className="text-white/70 text-xs">Bet</span>
            <input type="number" value={bet} min={DICE_MIN} step={DICE_MIN} onChange={(e)=>setBet(clamp(e.target.value))} className="flex-1 bg-transparent text-right text-white text-sm outline-none" />
          </div>
          <button onClick={onRoll} disabled={spin} className={`px-4 py-2 rounded-lg font-bold text-sm ${spin?'bg-gray-600 text-gray-300':'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>{spin?'Rolling…':'ROLL'}</button>
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={setMin}  className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs hover:bg-white/10">MIN</button>
          <button onClick={setHalf} className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs hover:bg-white/10">HALF</button>
          <button onClick={setAllIn} className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 text-xs hover:bg-white/10">ALL-IN</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/80">
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Min bet:  <span className="text-amber-300  font-semibold">{fmt(DICE_MIN)}</span></div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Daily Cap: <span className="text-emerald-300 font-semibold">{fmt(DICE_CAP)}</span></div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Today won: <span className="text-cyan-300   font-semibold">{fmt(state.dailyWon)}</span></div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">Cap left:  <span className="text-emerald-300 font-semibold">{fmt(Math.max(0,DICE_CAP-(state.dailyWon||0)))}</span></div>
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={resetDaily} className="px-2 py-1 text-[11px] rounded bg-white/5 border border-white/10 text-white/60 hover:text-white/90">Reset daily (debug)</button>
        </div>
        {err && <div className="mt-2 text-red-400     text-sm">{err}</div>}
        {msg && <div className="mt-2 text-emerald-300 text-sm">{msg}</div>}
      </div>

      <div className="mt-3 text-center text-xs text-white/60">Zero-edge 1:1 payout • Fun mode only • No real winnings</div>
    </div>
  );
}
