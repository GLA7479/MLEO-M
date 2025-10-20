// game/mleo-t-holdem.js
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

// ===== API Integration =====
const TABLE_NAME = "TEST"; // room code

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

  // API Integration
  const [tableId, setTableId] = useState(null);
  const [currentHandId, setCurrentHandId] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [serverSeats, setServerSeats] = useState([]); // seats from server
  const [state, setState] = useState({}); // server state snapshot

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
  const [stacks, setStacks] = useState({}); // seat -> current stack
  const [toCall, setToCall] = useState(0);
  const [acted, setActed] = useState({});
  const [allIn, setAllIn] = useState({});
  const [folded, setFolded] = useState({});
  const [stage, setStage] = useState("waiting"); // waiting|preflop|flop|turn|river|showdown|hand_end
  const [turnSeat, setTurnSeat] = useState(null);
  const [turnLeftSec, setTurnLeftSec] = useState(TURN_SECONDS);
  const [handMsg, setHandMsg] = useState("Waiting for players...");

  // Init vault & blinds & load table
  useEffect(()=>{
    const v = getVault();
    setVaultState(v);
    const sb = Math.max(1, Math.floor(tableMin*0.01));
    const bb = Math.max(sb+1, Math.floor(tableMin*0.02));
    setSmallBlind(sb);
    setBigBlind(bb);
    loadTable();

    // Start polling for server seats
    let alive = true;
    async function pollSeats() {
      if (!alive) return;
      try {
        const r = await fetch(`/api/poker/table?name=${encodeURIComponent(TABLE_NAME)}`).then(r=>r.json());
        if (alive && r && !r.error) {
          setServerSeats(r.seats || []);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
      if (alive) {
        setTimeout(pollSeats, 1500); // poll every 1.5 seconds
      }
    }
    setTimeout(pollSeats, 1500); // start polling after initial load

    return () => { alive = false; };
  }, [tableMin]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  // Persist name
  useEffect(()=> safeWrite(NAME_KEY, { name: displayName||"" }), [displayName]);

  // Create a map of server seats by index
  const seatByIndex = useMemo(() => {
    const m = new Map();
    (serverSeats || []).forEach(s => m.set(s.seat_index, s));
    return m;
  }, [serverSeats]);

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

  // API Functions
  async function loadTable() {
    try {
      const r = await fetch(`/api/poker/table?name=${encodeURIComponent(TABLE_NAME)}`).then(r=>r.json());
      if (!r || r.error) {
        console.error("loadTable error:", r);
        alert(`Table load failed: ${r?.error || "unknown"}`);
        return;
      }
      setTableId(r.table.id);
      setServerSeats(r.seats || []);
      console.log("Table loaded:", r.table.id, "with", r.seats?.length || 0, "seats");
    } catch (e) {
      console.error("Failed to load table:", e);
      alert("Failed to load table. Check server logs.");
    }
  }

  async function apiSit(seatIdx, name, buyin) {
    try {
      await fetch(`/api/poker/sit`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_id: tableId, seat_index: seatIdx, player_name: name, buyin })
      });
      await loadTable();
    } catch (e) {
      console.error("Failed to sit:", e);
    }
  }

  async function apiLeave(seatIdx) {
    try {
      await fetch(`/api/poker/leave`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_id: tableId, seat_index: seatIdx })
      });
      await loadTable();
    } catch (e) {
      console.error("Failed to leave:", e);
    }
  }

  async function apiStartHand() {
    try {
      return await fetch(`/api/poker/start-hand`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_id: tableId })
      }).then(r=>r.json()); // {hand_id,...}
    } catch (e) {
      console.error("Failed to start hand:", e);
      return null;
    }
  }

  async function apiAction(hand_id, seat_index, action, amount = 0) {
    try {
      const body = { hand_id, seat_index, action, amount: Number(amount)||0 };
      await fetch('/api/poker/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      console.error('Failed to perform action:', e);
    }
  }

  // Helper: Check if street can advance
  function canAdvanceStreet(state) {
    if (!state?.players?.length || !state.hand) return false;
    if (state.hand.stage === 'river' || state.hand.stage === 'showdown') return false;
    
    const active = state.players.filter(p => !p.folded && !p.all_in);
    if (active.length === 0) return false;
    
    const allActed = active.every(p => p.acted_street === true);
    const allZeroCall = active.every(p => (state.to_call?.[p.seat_index] || 0) === 0);
    
    return allActed && allZeroCall;
  }

  // Polling functions
  function startPolling(hand_id) {
    if (!hand_id) return;
    
    setCurrentHandId(hand_id);
    console.log("Starting polling for hand:", hand_id);
    
    // Clear existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    
    // Start new polling every 1 second
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/poker/state?hand_id=${hand_id}`);
        const state = await response.json();
        
        if (state?.error) {
          console.warn("State error:", state);
          return;
        }
        
        if (state.hand) {
          // Update UI based on server state
          setPot(state.hand.pot_total || 0);
          setStage(state.hand.stage || "waiting");
          setTurnSeat(state.hand.current_turn ?? null);
          
          // Update hole cards for players
          if (state.players && state.players.length > 0) {
            const newHoleCards = {};
            const newBets = {};
            const newFolded = {};
            const newAllIn = {};
            
            state.players.forEach(p => {
              if (p.hole_cards && p.hole_cards.length === 2) {
                newHoleCards[p.seat_index] = p.hole_cards;
              }
              newBets[p.seat_index] = Number(p.bet_street || 0);
              newFolded[p.seat_index] = p.folded || false;
              newAllIn[p.seat_index] = p.all_in || false;
            });
            
            setHoleCards(newHoleCards);
            setBets(newBets);
            setFolded(newFolded);
            setAllIn(newAllIn);
          }
          
          // Update board cards (when available)
          const board = (state.hand && state.hand.board) || state.board || [];
          setCommunity(Array.isArray(board) ? board : []);
          
          // Update toCall from server for my seat
          const me = (serverSeats || []).find(s => s && s.player_name === displayName);
          if (state.to_call && me && state.to_call[me.seat_index] !== undefined) {
            setToCall(state.to_call[me.seat_index]);
          } else if (state.players && me) {
            const maxBet = Math.max(0, ...state.players.map(p => Number(p.bet_street || 0)));
            const mine   = Number(state.players.find(p => p.seat_index === me.seat_index)?.bet_street || 0);
            setToCall(Math.max(0, maxBet - mine));
          }
          
          const actions = Array.isArray(state.actions) ? state.actions : [];
          console.log("State updated:", {
            stage: state.hand.stage,
            pot: state.hand.pot_total,
            players: state.players.length,
            actions: actions.length,
            current_turn: state.hand.current_turn
          });
          
          // Store state snapshot for other functions
          setState(state);
          
          // Retry if players empty (server snapshot not ready yet)
          if (Array.isArray(state.players) && state.players.length === 0) {
            setTimeout(() => {
              fetch(`/api/poker/state?hand_id=${hand_id}`)
                .then(r => r.json())
                .then(s2 => { 
                  if (!s2?.error && s2.players && s2.players.length > 0) {
                    setState(s2);
                    // Re-process the state
                    if (s2.hand?.pot_total) setPot(Number(s2.hand.pot_total));
                    const board2 = (s2.hand && s2.hand.board) || s2.board || [];
                    setCommunity(Array.isArray(board2) ? board2 : []);
                  }
                })
                .catch(()=>{});
            }, 250);
          }
          
          // Check if street can advance
          maybeAdvance(state);
          
          // Check if hand is over
          if (state.hand.stage === 'hand_end') {
            console.log("Hand ended, stopping polling");
            stopPolling();
          }
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 1000);
    
    // Also poll tick API for timeout enforcement
    const tickInterval = setInterval(async () => {
      try {
        await fetch(`/api/poker/tick?hand_id=${hand_id}`);
      } catch (e) {
        console.error("Tick error:", e);
      }
    }, 2000);
    
    setPollingInterval(interval);
    // Store tick interval for cleanup
    window.__tickInterval = tickInterval;
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    if (window.__tickInterval) {
      clearInterval(window.__tickInterval);
      window.__tickInterval = null;
    }
    setCurrentHandId(null);
  }

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
  const sitDown = async (seatIdx) => {
    if (!displayName.trim()) { alert("Set a display name first."); return; }
    if (buyIn < tableMin) { alert(`Minimum buy-in: ${fmt(tableMin)}`); return; }
    const v = getVault();
    if (v < buyIn) { alert("Insufficient Vault balance."); return; }
    if (!tableId) { alert("Table not loaded yet."); return; }
    
    // Check if seat is already taken on server
    const serverSeat = seatByIndex.get(seatIdx);
    if (serverSeat) {
      alert("Seat is already taken!");
      return;
    }
    
    // deduct from Vault
    setVault(v - buyIn); setVaultState(v - buyIn);
    
    // Call API - this will refresh serverSeats automatically
    await apiSit(seatIdx, displayName, buyIn);
    
    saveSeatState(seatIdx, buyIn);
  };

  const leaveTable = async () => {
    // Stop polling
    stopPolling();
    
    // Find my seat from serverSeats
    const mySeat = (serverSeats || []).find(s => s && s.player_name === displayName);
    if (!mySeat) return;
    
    const chips = mySeat.stack || 0;
    const v = getVault() + chips;
    setVault(v); setVaultState(v);
    
    // Call API - this will refresh serverSeats automatically
    if (tableId) {
      await apiLeave(mySeat.seat_index);
    }
    
    const saved = safeRead(STORAGE_KEY, {}); 
    delete saved[roomCode]; 
    safeWrite(STORAGE_KEY, saved);
    
    // reset hand state
    setStage("waiting"); setTurnSeat(null); setHandMsg("Waiting for players...");
    setCommunity([]); setHoleCards({}); setPot(0); setBets({}); setStacks({}); setFolded({}); setAllIn({}); setActed({}); setToCall(0);
  };

  // Player actions
  const [actionInFlight, setActionInFlight] = useState(false);
  
  // Street advancement logic
  let _advancing = false; // Prevent double advances
  
  function holeFor(seatIdx) {
    // server: players[row].hole_cards OR map by seat
    const fromPlayers = (state?.players || []).find(p => p.seat_index === seatIdx)?.hole_cards;
    if (fromPlayers && fromPlayers.length === 2) return fromPlayers;
    const map = state?.holes || state?.hole_cards || state?.hand?.holes || holeCards || {};
    return map?.[seatIdx] || null;
  }
  
  function computeBackupTurn(state) {
    const seats = state?.seats || state?.hand?.seats || [];
    const alive = seats
      .map((s, i) => ({ ...s, i }))
      .filter(s => s?.player_name && !s?.sat_out && ((s.stack_live ?? s.stack ?? 0) > 0));

    if (!alive.length) return null;

    const n = seats.length || 9;
    const dealer = seats.findIndex(s => s?.is_dealer);
    const sb = seats.findIndex(s => s?.is_sb);
    const bb = seats.findIndex(s => s?.is_bb);

    let start = (bb >= 0 ? bb : (sb >= 0 ? sb : dealer));
    if (start < 0) start = alive[0].i;

    for (let step = 1; step <= n; step++) {
      const idx = (start + step) % n;
      const s = seats[idx];
      if (s?.player_name && !s?.sat_out && ((s.stack_live ?? s.stack ?? 0) > 0)) return idx;
    }
    return null;
  }
  
  function everyoneDone(state) {
    const seats = state?.seats || serverSeats || [];
    const bets = state?.bets || Object.values(bets).length > 0 ? bets : {};
    const alive = seats
      .map((s,i)=>({s,i}))
      .filter(x => x.s?.player_id && !x.s?.sat_out && (x.s?.stack_live ?? x.s?.stack ?? 0) > 0);
    if (alive.length <= 1) return true;
    const maxBet = Math.max(0, ...Object.values(bets));
    return alive.every(x => (bets[x.i] || 0) === maxBet);
  }
  
  async function maybeAdvance(state) {
    if (_advancing || !currentHandId) return;
    if (!everyoneDone(state)) return;
    _advancing = true;
    try {
      await fetch('/api/poker/advance-street', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ hand_id: currentHandId })
      });
    } finally { 
      _advancing = false; 
    }
  }
  
  const playerAction = async (action, amount = 0) => {
    if (!currentHandId || actionInFlight) return;
    
    // Find my seat from serverSeats
    const mySeat = (serverSeats || []).find(s => s && s.player_name === displayName);
    if (!mySeat) return;
    
    setActionInFlight(true);
    
    try {
      await apiAction(currentHandId, mySeat.seat_index, action, amount);
      
      // Fetch fresh snapshot immediately (no waiting for polling)
      const r = await fetch(`/api/poker/state?hand_id=${currentHandId}`);
      if (r.ok) {
        const state = await r.json();
        
        // Update community cards
        const board = (state.hand && state.hand.board) || state.board || [];
        setCommunity(Array.isArray(board) ? board : []);
        
        // Update pot
        if (state.hand?.pot_total) {
          setPot(Number(state.hand.pot_total));
        }
        
        // Update players state
        if (state.players) {
          const newStacks = {};
          const newBets = {};
          const newFolded = {};
          const newAllIn = {};
          
          state.players.forEach(p => {
            newStacks[p.seat_index] = Number(p.stack_live || 0);
            newBets[p.seat_index] = Number(p.bet_street || 0);
            newFolded[p.seat_index] = p.folded || false;
            newAllIn[p.seat_index] = p.all_in || false;
          });
          
          setStacks(newStacks);
          setBets(newBets);
          setFolded(newFolded);
          setAllIn(newAllIn);
        }
        
        // Update toCall
        const me = (serverSeats || []).find(s => s && s.player_name === displayName);
        if (state.to_call && me && state.to_call[me.seat_index] !== undefined) {
          setToCall(state.to_call[me.seat_index]);
        } else if (state.players && me) {
          const maxBet = Math.max(0, ...state.players.map(p => Number(p.bet_street || 0)));
          const mine   = Number(state.players.find(p => p.seat_index === me.seat_index)?.bet_street || 0);
          setToCall(Math.max(0, maxBet - mine));
        }
        
        console.log("Action completed, UI updated immediately");
        
        // Check if we should advance street
        maybeAdvance(state);
      }
    } catch (e) {
      console.error("Action failed:", e);
      setHandMsg("Action failed. Please try again.");
    } finally {
      setActionInFlight(false);
    }
  };

  // Can start?
  const canStart = useMemo(()=> {
    const seatedCount = (serverSeats || []).filter(s => s && s.player_name && s.stack > 0).length;
    return seatedCount >= 2;
  }, [serverSeats]);

  // Start hand
  const startHand = async () => {
    if (!canStart) { 
      setHandMsg("Need at least 2 seated players with chips."); 
      return; 
    }
    if (!tableId) { 
      setHandMsg("Table not loaded yet."); 
      return; 
    }

    try {
      setHandMsg("Starting hand...");
      
      // Start hand on server (includes dealing and blinds)
      const r = await fetch('/api/poker/start-hand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: tableId })
      });
      
      if (!r.ok) {
        const error = await r.text().catch(() => 'Unknown error');
        throw new Error(`Start failed: ${error}`);
      }
      
      const start = await r.json();
      console.log('HAND STARTED:', start);
      setCurrentHandId(start.hand_id);
      setHandMsg(`Hand #${start.hand_no} - Cards dealt!`);

      // Start polling for state updates
      startPolling(start.hand_id);
      
    } catch (e) {
      console.error('Failed to start hand:', e);
      setHandMsg('Start hand failed: ' + e.message);
    }
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
      setBets({}); setStacks({}); setActed({}); setAllIn({}); setFolded({});
      setPot(0); setToCall(0);
      setStage("waiting");
      if (canStart) startHand();
    }, NEXT_HAND_DELAY_MS);
  };

  // My actions (demo: client controls only their seat)
  // Find my seat from serverSeats
  const mySeat = useMemo(() => {
    return (serverSeats || []).find(s => s && s.player_name === displayName);
  }, [serverSeats, displayName]);
  
  const meIdx = mySeat ? mySeat.seat_index : -1;
  const myChips = mySeat ? mySeat.stack : 0;
  
  // Calculate effective turn with backup
  const serverTurn = turnSeat;
  const backupTurn = computeBackupTurn({ seats: serverSeats });
  const effectiveTurn = (serverTurn === null || serverTurn === undefined) ? backupTurn : serverTurn;
  const myTurn = (meIdx !== -1 && effectiveTurn === meIdx) && (stage==="preflop"||stage==="flop"||stage==="turn"||stage==="river");

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
    if (!myTurn || meIdx === -1) return;
    // Call API action instead of local state
    playerAction('fold', 0);
  };
  const doCheck = () => {
    if (!myTurn || meIdx === -1) return;
    const myBet=bets[meIdx]||0;
    if (myBet<toCall) { doCall(); return; }
    // Call API action instead of local state
    playerAction('check', 0);
  };
  const doCall = () => {
    if (!myTurn || meIdx === -1) return;
    const need = Math.max(0, toCall - (bets[meIdx]||0));
    const have = myChips;
    const pay = Math.min(need, have);
    if (pay>0) {
      // Call API action instead of local state
      playerAction('call', pay);
    }
  };
  const doBetOrRaise = (amt) => {
    if (!myTurn || meIdx === -1) return;
    amt = Math.max(0, Math.floor(Number(amt)||0));
    const currentBet = bets[meIdx] || 0;
    const needToCall = Math.max(0, toCall - currentBet);
    const delta = (needToCall > 0) ? (needToCall + amt) : amt;
    playerAction(needToCall > 0 ? 'raise' : 'bet', delta);
  };
  const doAllIn = () => {
    if (!myTurn || meIdx === -1) return;
    const shove = myChips;
    if (shove<=0) return;
    // Call API action instead of local state
    playerAction('allin', shove);
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
              {Array.from({length: SEATS}).map((_,i)=>{
                const serverSeat = seatByIndex.get(i);
                const localSeat = seats[i];
                // Check if this is "you" by comparing display name
                const isYou = serverSeat?.player_name === displayName || localSeat?.you || false;
                const p = serverSeat ? { 
                  name: serverSeat.player_name, 
                  chips: serverSeat.stack,
                  you: isYou,
                  id: serverSeat.player_name
                } : localSeat;
                const isTaken = !!serverSeat;
                
                return (
                <div key={i} className={`rounded-xl p-2 border ${turnSeat===i?'border-emerald-400':'border-white/10'} bg-black/30`}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <div className="font-bold">Seat #{i+1}</div>
                    {i===buttonIdx && <div className="px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold">D</div>}
                  </div>

                  {!p ? (
                    <button className="w-full py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
                            onClick={()=>sitDown(i)} disabled={isTaken || meIdx !== -1}>
                      {isTaken ? "Seat taken" : `Sit here (≥ ${fmt(tableMin)})`}
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
                        {(() => {
                          const myHole = holeFor(i);
                          if (myHole && Array.isArray(myHole)) {
                            return myHole.map((c,idx)=>(
                              <Card key={idx} card={(p.you || stage==="showdown") ? c : null} faceDown={!(p.you || stage==="showdown")} />
                            ));
                          }
                          return (holeCards[i]||[]).map((c,idx)=>(
                            <Card key={idx} card={(p.you || stage==="showdown") ? c : null} faceDown={!(p.you || stage==="showdown")} />
                          ));
                        })()}
                      </div>
                      {p.you && (
                        <div className="mt-2 flex gap-2">
                          <button onClick={leaveTable} className="flex-1 py-1 rounded bg-rose-600 hover:bg-rose-500 text-xs">Leave table</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )})}
            </div>

            {/* Action Bar */}
            {(() => {
              const meSeated = serverSeats?.[meIdx];
              const inHandFallback = !!(meSeated?.player_id && !meSeated?.sat_out && (meSeated?.stack_live ?? meSeated?.stack ?? 0) > 0);
              const showActionBar = inHandFallback && (stage==="preflop"||stage==="flop"||stage==="turn"||stage==="river");
              return meIdx!==-1 && myTurn && !folded[meIdx] && showActionBar;
            })() && (
              <ActionBar
                toCall={Math.max(0, toCall - (bets[meIdx]||0))}
                myBet={bets[meIdx]||0}
                myChips={myChips}
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
