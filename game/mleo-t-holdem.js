// pages/mleo-t-holdem.js
// ============================================================================
// MLEO Texas Hold'em (client-first demo, English-only)
// - Works with your Layout and local Vault
// - Private rooms via ?room=CODE
// - Table min stake via ?stake=MIN (default 1000)
// - 2–9 players, 30s turn timer, next hand ~10s
// - Actions: Fold / Check / Call / Bet / Raise / All-in
// - Basic pot awarding for demo (server should implement full side pots & kickers)
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";

// ===== Vault helpers (aligned with your other games) =====
function safeRead(key, fallback = {}) {
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
function getVault() {
  const rushData = safeRead("mleo_rush_core_v4", {});
  return rushData.vault || 0;
}
function setVault(amount) {
  const rushData = safeRead("mleo_rush_core_v4", {});
  rushData.vault = amount;
  safeWrite("mleo_rush_core_v4", rushData);
}
const fmt = (n) => {
  const num = Number(n) || 0;
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return Math.floor(num).toString();
};

// ===== Config =====
const TABLE_MIN_DEFAULT = 1000;
const SEATS = 9;
const TURN_SECONDS = 30;
const NEXT_HAND_DELAY_MS = 10000;
const STORAGE_KEY = "mleo_holdem_state_v1";
const NAME_KEY = "mleo_display_name_v1";

// ===== Cards =====
const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
const SUITS = ["♠","♥","♦","♣"];
function buildDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}
function shuffle(a) {
  const arr = a.slice();
  for (let i=arr.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

// ===== Simple evaluator (category only; server should add kickers & side pots) =====
function evaluateHand(cards7) {
  const rankIdx = (r)=>RANKS.indexOf(r);
  const counts = {};
  const suits = {};
  for (const c of cards7) {
    const r=c[0], s=c[1];
    counts[r]=(counts[r]||0)+1;
    (suits[s] ||= []).push(c);
  }
  const byCount = Object.entries(counts).sort((a,b)=>{
    if (b[1]!==a[1]) return b[1]-a[1];
    return rankIdx(b[0])-rankIdx(a[0]);
  });
  const ranks7 = cards7.map(c=>c[0]).sort((a,b)=>rankIdx(b)-rankIdx(a));
  function bestStraight(rs) {
    const uniq=[]; for (const r of rs) if (!uniq.includes(r)) uniq.push(r);
    const idxs = uniq.map(rankIdx);
    if (uniq.includes("A")) idxs.push(-1); // A-5 wheel
    idxs.sort((a,b)=>b-a);
    let run=1;
    for (let i=0;i<idxs.length-1;i++){
      if (idxs[i]-1===idxs[i+1]) { run++; if (run>=5) return idxs[i+1]+4; }
      else if (idxs[i]!==idxs[i+1]) run=1;
    }
    return null;
  }
  const straightTop = bestStraight(ranks7);
  let flushSuit=null, straightFlushTop=null;
  for (const [s,arr] of Object.entries(suits)) if (arr.length>=5) flushSuit=s;
  if (flushSuit) {
    const rs = suits[flushSuit].map(c=>c[0]).sort((a,b)=>rankIdx(b)-rankIdx(a));
    const top = bestStraight(rs);
    if (top!==null) straightFlushTop=top;
  }
  if (straightFlushTop!==null) {
    const royal = straightFlushTop===rankIdx("A");
    return { rank: 9, name: royal ? "Royal Flush" : "Straight Flush" };
  }
  if (byCount[0][1]===4) return { rank: 8, name: "Four of a Kind" };
  if (byCount[0][1]===3 && byCount[1]?.[1]===2) return { rank: 7, name: "Full House" };
  if (flushSuit) return { rank: 6, name: "Flush" };
  if (straightTop!==null) return { rank: 5, name: "Straight" };
  if (byCount[0][1]===3) return { rank: 4, name: "Three of a Kind" };
  if (byCount[0][1]===2 && byCount[1]?.[1]===2) return { rank: 3, name: "Two Pair" };
  if (byCount[0][1]===2) return { rank: 2, name: "One Pair" };
  return { rank: 1, name: "High Card" };
}

// ============================================================================
// Component
// ============================================================================
export default function HoldemPage() {
  const router = useRouter();
  const roomCode = router.query.room ? String(router.query.room) : "public";
  const tableMin = useMemo(() => {
    const q = Number(router.query.stake || TABLE_MIN_DEFAULT);
    return isNaN(q)||q<1 ? TABLE_MIN_DEFAULT : Math.floor(q);
  }, [router.query.stake]);

  const wrapRef = useRef(null);
  const headerRef = useRef(null);

  const [displayName, setDisplayName] = useState(()=>{
    const s = safeRead(NAME_KEY, { name: "" });
    return s.name || "";
  });

  // Vault & buy-in
  const [vault, setVaultState] = useState(0);
  const [buyIn, setBuyIn] = useState(tableMin);

  // Table state
  const [seats, setSeats] = useState(()=>Array(SEATS).fill(null)); // {id,name,chips,sittingOut,you}
  const [buttonIdx, setButtonIdx] = useState(0);
  const [smallBlind, setSmallBlind] = useState(0);
  const [bigBlind, setBigBlind] = useState(0);

  const [deck, setDeck] = useState([]);
  const [community, setCommunity] = useState([]);
  const [holeCards, setHoleCards] = useState({}); // seat -> [c1,c2]
  const [pot, setPot] = useState(0);
  const [bets, setBets] = useState({}); // seat -> bet this street
  const [toCall, setToCall] = useState(0);
  const [acted, setActed] = useState({});
  const [allIn, setAllIn] = useState({});
  const [folded, setFolded] = useState({});
  const [stage, setStage] = useState("waiting"); // waiting|preflop|flop|turn|river|showdown|hand_end
  const [turnSeat, setTurnSeat] = useState(null);
  const [turnLeftSec, setTurnLeftSec] = useState(TURN_SECONDS);
  const [handMsg, setHandMsg] = useState("Waiting for players...");

  // Init vault & blinds
  useEffect(()=>{
    const v = getVault();
    setVaultState(v);
    const sb = Math.max(1, Math.floor(tableMin*0.01));
    const bb = Math.max(sb+1, Math.floor(tableMin*0.02));
    setSmallBlind(sb);
    setBigBlind(bb);
  }, [tableMin]);

  // Persist name
  useEffect(()=> safeWrite(NAME_KEY, { name: displayName||"" }), [displayName]);

  // Restore seat for this room
  useEffect(()=>{
    const saved = safeRead(STORAGE_KEY, {});
    const rec = saved[roomCode];
    if (!rec) return;
    const { mySeat, myChips, myName } = rec;
    if (!displayName && myName) setDisplayName(myName);
    if (Number.isInteger(mySeat) && mySeat>=0 && mySeat<SEATS && myChips>0) {
      setSeats(prev=>{
        const cp = prev.slice();
        if (!cp[mySeat]) cp[mySeat] = { id:"you", name: myName||"You", chips: myChips, sittingOut:false, you:true };
        return cp;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const saveSeatState = (seatIdx, chips) => {
    const saved = safeRead(STORAGE_KEY, {});
    saved[roomCode] = {
      mySeat: seatIdx,
      myChips: chips,
      myName: displayName||"You",
    };
    safeWrite(STORAGE_KEY, saved);
  };

  // Sit / Leave
  const sitDown = (seatIdx) => {
    if (!displayName.trim()) { alert("Set a display name first."); return; }
    if (buyIn < tableMin) { alert(`Minimum buy-in: ${fmt(tableMin)}`); return; }
    const v = getVault();
    if (v < buyIn) { alert("Insufficient Vault balance."); return; }
    // deduct from Vault
    setVault(v - buyIn); setVaultState(v - buyIn);
    setSeats(prev=>{
      if (prev[seatIdx]) return prev;
      const cp = prev.slice();
      cp[seatIdx] = { id:"you", name: displayName||"You", chips: buyIn, sittingOut:false, you:true };
      return cp;
    });
    saveSeatState(seatIdx, buyIn);
  };

  const leaveTable = () => {
    setSeats(prev=>{
      const idx = prev.findIndex(p=>p && p.you);
      if (idx===-1) return prev;
      const chips = prev[idx].chips||0;
      const v = getVault() + chips;
      setVault(v); setVaultState(v);
      const cp = prev.slice(); cp[idx]=null;
      const saved = safeRead(STORAGE_KEY, {}); delete saved[roomCode]; safeWrite(STORAGE_KEY, saved);
      // reset hand state
      setStage("waiting"); setTurnSeat(null); setHandMsg("Waiting for players...");
      setCommunity([]); setHoleCards({}); setPot(0); setBets({}); setFolded({}); setAllIn({}); setActed({}); setToCall(0);
      return cp;
    });
  };

  // Can start?
  const canStart = useMemo(()=> seats.filter(p=>p && p.chips>0).length>=2 , [seats]);

  // Start hand
  const startHand = () => {
    if (!canStart) { setHandMsg("Need at least 2 seated players with chips."); return; }

    const occ = seats.map((p,i)=>p?i:null).filter(i=>i!==null);
    if (occ.length<2) return;

    // advance Dealer button to next occupied
    let nextBtn = buttonIdx;
    if (!seats[nextBtn]) nextBtn = occ[0]; else {
      let j=(nextBtn+1)%SEATS; while(!seats[j]) j=(j+1)%SEATS; nextBtn=j;
    }

    const d = shuffle(buildDeck());
    const newHole = {};
    const newFold = {};
    const newAllIn = {};
    const newBets = {};
    const newActed = {};

    const nextOccupiedFrom = (from) => {
      let j=(from+1)%SEATS;
      for (let g=0; g<SEATS; g++) {
        if (seats[j] && seats[j].chips>0) return j;
        j=(j+1)%SEATS;
      }
      return from;
    };

    const sbIdx = nextOccupiedFrom(nextBtn);
    const bbIdx = nextOccupiedFrom(sbIdx);

    // deal 2 each
    let di=0;
    for (let r=0;r<2;r++){
      for (const si of occ) if (seats[si].chips>0) {
        (newHole[si] ||= []).push(d[di++]);
      }
    }

    // post blinds
    const sbAmt = Math.min(seats[sbIdx].chips, smallBlind);
    const bbAmt = Math.min(seats[bbIdx].chips, bigBlind);
    newBets[sbIdx]=sbAmt; newBets[bbIdx]=bbAmt;

    const pay = (arr, idx, amt)=>{
      const cp = arr.map(p=>p?{...p}:p);
      if (!cp[idx]) return cp;
      cp[idx].chips -= amt;
      return cp;
    };
    const s1 = pay(seats, sbIdx, sbAmt);
    const s2 = pay(s1, bbIdx, bbAmt);

    // UTG acts first (next after BB)
    const actor = nextOccupiedFrom(bbIdx);

    setSeats(s2);
    setDeck(d.slice(di));
    setHoleCards(newHole);
    setFolded(newFold);
    setAllIn(newAllIn);
    setBets(newBets);
    setActed(newActed);
    setCommunity([]);
    setPot(sbAmt+bbAmt);
    setToCall(bbAmt);
    setButtonIdx(nextBtn);
    setStage("preflop");
    setTurnSeat(actor);
    setTurnLeftSec(TURN_SECONDS);
    setHandMsg(`New hand • SB: ${fmt(sbAmt)}  BB: ${fmt(bbAmt)}`);
  };

  // Turn timer
  useEffect(()=>{
    if (!(stage==="preflop"||stage==="flop"||stage==="turn"||stage==="river")) return;
    if (turnSeat===null) return;
    setTurnLeftSec(TURN_SECONDS);
    const iv = setInterval(()=>{
      setTurnLeftSec(t=>{
        if (t<=1) {
          clearInterval(iv);
          const myBet = bets[turnSeat]||0;
          const need = toCall - myBet;
          if (need>0) timeoutFold(turnSeat); else timeoutCheck(turnSeat);
        }
        return t-1;
      });
    }, 1000);
    return ()=>clearInterval(iv);
  }, [turnSeat, stage, toCall, bets]);

  const sumBets = () => Object.values(bets).reduce((a,b)=>a+(b||0),0);

  const nextActor = (from) => {
    let j=(from+1)%SEATS;
    for (let g=0; g<SEATS; g++){
      const p=seats[j];
      if (p && !folded[j] && p.chips>=0 && !allIn[j]) return j;
      j=(j+1)%SEATS;
    }
    return null;
  };

  const everyoneMatched = () => {
    for (let i=0;i<SEATS;i++){
      const p=seats[i]; if (!p || folded[i] || allIn[i]) continue;
      const b=bets[i]||0; if (b<toCall) return false;
    }
    return true;
  };

  // Auto on timeout
  const timeoutFold = (idx) => {
    setFolded(f=>({...f,[idx]:true}));
    passTurn(idx, false);
  };
  const timeoutCheck = (idx) => {
    passTurn(idx, false);
  };

  // Streets
  const advanceStreet = () => {
    const add = sumBets();
    setPot(p=>p+add);
    setBets({});
    setActed({});
    setToCall(0);

    const nextFromButton = ()=>{
      let j=(buttonIdx+1)%SEATS;
      for (let g=0; g<SEATS; g++){
        if (seats[j] && !folded[j] && !allIn[j]) return j;
        j=(j+1)%SEATS;
      }
      return null;
    };

    if (stage==="preflop") {
      const d = deck.slice();
      const flop = [d[0],d[1],d[2]];
      setDeck(d.slice(3));
      setCommunity(flop);
      setStage("flop");
      setTurnSeat(nextFromButton());
      setHandMsg("Flop");
      return;
    }
    if (stage==="flop") {
      const d = deck.slice();
      setDeck(d.slice(1));
      setCommunity(c=>c.concat(d[0]));
      setStage("turn");
      setTurnSeat(nextFromButton());
      setHandMsg("Turn");
      return;
    }
    if (stage==="turn") {
      const d = deck.slice();
      setDeck(d.slice(1));
      setCommunity(c=>c.concat(d[0]));
      setStage("river");
      setTurnSeat(nextFromButton());
      setHandMsg("River");
      return;
    }
    if (stage==="river") {
      showdown();
    }
  };

  const showdown = () => {
    setStage("showdown"); setTurnSeat(null);
    const alive = seats.map((p,i)=>({p,i})).filter(x=>x.p && !folded[x.i]);
    if (alive.length===0) { endHand(); return; }
    const board = community.slice();
    const scored = alive.map(({p,i})=>{
      const h = holeCards[i]||[];
      const score = evaluateHand([...h, ...board]);
      return { i, score };
    }).sort((a,b)=>b.score.rank - a.score.rank);
    const top = scored[0].score.rank;
    const winners = scored.filter(s=>s.score.rank===top).map(s=>s.i);
    const total = pot + sumBets();
    const share = Math.floor(total / Math.max(1, winners.length));
    setSeats(prev=>{
      const cp = prev.map(p=>p?{...p}:p);
      winners.forEach(i=>{ if (cp[i]) cp[i].chips += share; });
      return cp;
    });
    setPot(0); setBets({});
    setHandMsg(`Showdown — winner(s): ${winners.map(i=>seats[i]?.name||("#"+(i+1))).join(", ")}`);
    setTimeout(()=>endHand(), 2000);
  };

  const endHand = () => {
    setStage("hand_end"); setTurnSeat(null);
    setTimeout(()=>{
      setCommunity([]); setHoleCards({});
      setBets({}); setActed({}); setAllIn({}); setFolded({});
      setPot(0); setToCall(0);
      setStage("waiting");
      if (canStart) startHand();
    }, NEXT_HAND_DELAY_MS);
  };

  // My actions (demo: client controls only their seat)
  const meIdx = seats.findIndex(p=>p && p.you);
  const myTurn = meIdx===turnSeat && (stage==="preflop"||stage==="flop"||stage==="turn"||stage==="river");

  const passTurn = (fromIdx, raised) => {
    const alive = seats.map((p,i)=>({p,i})).filter(x=>x.p && !folded[x.i] && (!allIn[x.i] || (bets[x.i]||0)>0));
    if (alive.length===1) {
      const total = pot + sumBets();
      setSeats(prev=>{
        const cp = prev.map(p=>p?{...p}:p);
        const w = alive[0].i;
        if (cp[w]) cp[w].chips += total;
        return cp;
      });
      setPot(0); setBets({});
      setHandMsg(`${seats[alive[0].i]?.name||"Player"} wins uncontested`);
      setStage("hand_end");
      setTimeout(()=>endHand(), 1200);
      return;
    }

    const n = nextActor(fromIdx);
    if (n===null) { advanceStreet(); return; }
    if (!raised && everyoneMatched()) { advanceStreet(); return; }
    setTurnSeat(n); setTurnLeftSec(TURN_SECONDS);
  };

  const doFold = () => {
    if (!myTurn) return;
    setFolded(f=>({...f,[meIdx]:true}));
    passTurn(meIdx, false);
  };
  const doCheck = () => {
    if (!myTurn) return;
    const myBet=bets[meIdx]||0;
    if (myBet<toCall) { doCall(); return; }
    setActed(a=>({...a,[meIdx]:true}));
    passTurn(meIdx, false);
  };
  const doCall = () => {
    if (!myTurn) return;
    const need = Math.max(0, toCall - (bets[meIdx]||0));
    const have = seats[meIdx].chips;
    const pay = Math.min(need, have);
    if (pay>0) {
      setSeats(prev=>{ const cp=prev.map(p=>p?{...p}:p); cp[meIdx].chips-=pay; return cp; });
      setBets(b=>({...b,[meIdx]:(b[meIdx]||0)+pay}));
    }
    if (have - pay === 0) setAllIn(a=>({...a,[meIdx]:true}));
    setActed(a=>({...a,[meIdx]:true}));
    passTurn(meIdx, false);
  };
  const doBetOrRaise = (amt) => {
    if (!myTurn) return;
    amt = Math.max(0, Math.floor(Number(amt)||0));
    const myChips = seats[meIdx].chips;
    const add = Math.min(amt, myChips);
    if (add<=0) return;
    const newBet = (bets[meIdx]||0)+add;
    setSeats(prev=>{ const cp=prev.map(p=>p?{...p}:p); cp[meIdx].chips-=add; return cp; });
    setBets(b=>({...b,[meIdx]:newBet}));
    setToCall(newBet);
    setActed({});
    if (myChips - add === 0) setAllIn(a=>({...a,[meIdx]:true}));
    passTurn(meIdx, true);
  };
  const doAllIn = () => {
    if (!myTurn) return;
    const shove = seats[meIdx].chips;
    if (shove<=0) return;
    doBetOrRaise(shove);
  };

  // Layout sizing like your other games
  useEffect(()=>{
    const calc = ()=>{
      if (!wrapRef.current || !headerRef.current) return;
      const headH = headerRef.current.offsetHeight || 0;
      document.documentElement.style.setProperty("--head-h", headH+"px");
    };
    calc(); window.addEventListener("resize", calc);
    return ()=>window.removeEventListener("resize", calc);
  },[]);

  // Chat (local demo)
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState([]);
  const sendChat = ()=>{ if (!chatInput.trim()) return; setChat(p=>[...p,{from:displayName||"You", text:chatInput.trim()}]); setChatInput(""); };

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full min-h-[100svh] bg-gradient-to-br from-emerald-900 via-black to-cyan-900 text-white">
        {/* Header */}
        <div ref={headerRef} className="sticky top-0 z-10">
          <div className="px-3 pt-3 pb-2 flex flex-wrap items-center gap-2 bg-black/30 backdrop-blur-md border-b border-white/10">
            <div className="text-lg font-extrabold">♠️ Texas Hold&apos;em</div>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className="opacity-70">Room:</span><span className="font-bold">{roomCode}</span>
              <span className="opacity-70">Stake ≥</span><span className="font-bold">{fmt(tableMin)}</span>
              <span className="opacity-70">SB/BB:</span><span className="font-bold">{fmt(smallBlind)}/{fmt(bigBlind)}</span>
            </div>
          </div>
          <div className="px-3 pb-2 flex flex-wrap items-center gap-3 bg-black/20">
            <div className="flex items-center gap-2">
              <label className="text-xs opacity-80">Name</label>
              <input className="px-2 py-1 text-sm rounded bg-white/10 border border-white/20" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs opacity-80">Vault</div>
              <div className="text-sm font-bold text-emerald-300">{fmt(vault)}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs opacity-80">Buy-in</div>
              <input type="number" min={tableMin} step={tableMin} className="w-24 px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                     value={buyIn} onChange={e=>setBuyIn(Math.max(tableMin, Math.floor(Number(e.target.value)||0)))} />
            </div>
            <button onClick={()=>canStart && startHand()} className={`px-3 py-1 rounded font-bold text-sm ${canStart?'bg-emerald-600 hover:bg-emerald-500':'bg-white/10 opacity-60'}`}>
              Start
            </button>
            <div className="ml-auto text-sm">
              <span className="opacity-80 mr-1">Turn:</span><span className="font-bold">{turnSeat!==null? `#${turnSeat+1}` : "-"}</span>
              <span className="mx-2">|</span>
              <span className="opacity-80 mr-1">Timer:</span><span className="font-bold">{turnSeat!==null? `${turnLeftSec}s`:"-"}</span>
            </div>
          </div>
        </div>

        {/* Table & Sidebar */}
        <div className="max-w-5xl mx-auto px-3 py-4 grid gap-4 md:grid-cols-[2fr_1fr]">
          {/* Table */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm opacity-80">Pot</div>
              <div className="font-bold">{fmt(pot + sumBets())}</div>
            </div>

            {/* Board */}
            <div className="flex items-center justify-center gap-2 my-3">
              {[0,1,2,3,4].map(i=> <Card key={i} card={community[i]} faceDown={!community[i]} /> )}
            </div>

            {/* Seats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {seats.map((p,i)=>(
                <div key={i} className={`rounded-xl p-2 border ${turnSeat===i?'border-emerald-400':'border-white/10'} bg-black/30`}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <div className="font-bold">Seat #{i+1}</div>
                    {i===buttonIdx && <div className="px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold">D</div>}
                  </div>

                  {!p ? (
                    <button className="w-full py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
                            onClick={()=>sitDown(i)} disabled={seats.some(x=>x && x.you)}>
                      Sit here (≥ {fmt(tableMin)})
                    </button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <div className="font-semibold truncate">{p.name}{p.you && " (You)"}</div>
                        <div className="text-emerald-300 font-bold">{fmt(p.chips)}</div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <div className={`${folded[i]?'text-rose-400':'opacity-70'}`}>
                          {folded[i] ? "Folded" : (allIn[i] ? "ALL-IN" : (bets[i]? `Bet ${fmt(bets[i])}`: "Idle"))}
                        </div>
                        <div className="opacity-70">Hole:</div>
                      </div>
                      <div className="mt-1 flex gap-1">
                        {(holeCards[i]||[]).map((c,idx)=>(
                          <Card key={idx} card={(p.you || stage==="showdown") ? c : null} faceDown={!(p.you || stage==="showdown")} />
                        ))}
                      </div>
                      {p.you && (
                        <div className="mt-2 flex gap-2">
                          <button onClick={leaveTable} className="flex-1 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs">Leave table</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Action Bar */}
            {meIdx!==-1 && myTurn && !folded[meIdx] && (
              <ActionBar
                toCall={Math.max(0, toCall - (bets[meIdx]||0))}
                myBet={bets[meIdx]||0}
                myChips={seats[meIdx].chips}
                onFold={doFold}
                onCheck={doCheck}
                onCall={doCall}
                onBet={doBetOrRaise}
                onAllIn={doAllIn}
                bigBlind={bigBlind}
              />
            )}

            <div className="mt-3 text-center text-sm opacity-80">{handMsg}</div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <div className="text-sm font-bold mb-2">Chat (local demo)</div>
              <div className="h-48 overflow-auto bg-black/20 rounded p-2 text-sm space-y-1">
                {chat.length===0 ? <div className="opacity-60">No messages.</div> : chat.map((m,idx)=>(
                  <div key={idx}><span className="text-emerald-300 font-semibold">{m.from}:</span> {m.text}</div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input className="flex-1 px-2 py-1 text-sm rounded bg-white/10 border border-white/20"
                       value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Type a message..." />
                <button onClick={sendChat} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-sm">Send</button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-sm">
              <div className="font-bold mb-2">Rules (quick):</div>
              <ul className="list-disc pl-5 space-y-1 opacity-90">
                <li>2–9 players. Each gets 2 private hole cards.</li>
                <li>Betting rounds: Preflop → Flop → Turn → River → Showdown.</li>
                <li>Turn timer: 30 seconds. No action → Fold if facing a bet, otherwise Check.</li>
                <li>Next hand auto-starts ~10 seconds after payouts.</li>
                <li>Chips remain on table until you leave; leaving returns chips to Vault.</li>
                <li>Private room via `?room=CODE`. Minimum stake via `?stake=1000` etc.</li>
              </ul>
              <div className="mt-2 opacity-80">
                <b>Note:</b> Demo awards the pot to top category only. Server should implement precise side pots, full kickers comparison, and rake.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ===== Presentational =====
function Card({ card, faceDown }) {
  return (
    <div className={`w-10 h-14 rounded-lg border ${faceDown?'bg-white/10 border-white/10':'bg-white text-black border-black/20'} grid place-items-center font-bold`}>
      {faceDown? "🂠" : card}
    </div>
  );
}

function ActionBar({ toCall, myChips, onFold, onCheck, onCall, onBet, onAllIn, bigBlind }) {
  const [amt, setAmt] = useState(bigBlind*2);

  useEffect(()=>{ setAmt(bigBlind*2); }, [bigBlind]);

  const canCall = toCall>0 && myChips>0;
  const canCheck = toCall===0;
  const canBet = myChips>0;

  const presets = [
    { label: "1×BB", val: bigBlind },
    { label: "2×BB", val: bigBlind*2 },
    { label: "3×BB", val: bigBlind*3 },
  ];

  return (
    <div className="mt-4 bg-black/40 border border-white/10 rounded-xl p-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onFold} className="px-3 py-2 rounded bg-rose-600 hover:bg-rose-500 font-bold text-sm">Fold</button>
        {canCheck ? (
          <button onClick={onCheck} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 font-bold text-sm">Check</button>
        ) : (
          <button onClick={onCall} disabled={!canCall} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20 font-bold text-sm disabled:opacity-50">
            Call {fmt(Math.min(toCall, myChips))}
          </button>
        )}

        {/* Bet/Raise */}
        <div className="ml-auto flex items-center gap-2">
          {presets.map(p=>(
            <button key={p.label} onClick={()=>setAmt(Math.min(myChips, p.val))}
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">
              {p.label}
            </button>
          ))}
          <input type="number" min={1} step={bigBlind} value={amt}
                 onChange={e=>setAmt(Math.max(1, Math.floor(Number(e.target.value)||0)))}
                 className="w-24 px-2 py-1 text-sm rounded bg-white/10 border border-white/20" />
          <button onClick={()=>onBet(Math.min(myChips, amt))}
                  disabled={!canBet}
                  className="px-3 py-2 rounded bg-amber-500/80 hover:bg-amber-500 font-bold text-sm disabled:opacity-50">
            {toCall===0 ? "Bet" : "Raise"}
          </button>
          <button onClick={onAllIn} disabled={myChips<=0}
                  className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 font-bold text-sm disabled:opacity-50">
            All-in
          </button>
        </div>
      </div>
    </div>
  );
}
