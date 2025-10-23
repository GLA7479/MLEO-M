// ============================================================================
// MLEO Texas Hold'em Rooms - Drop-in/Drop-out Multiplayer
// Built with Supabase for permanent poker rooms
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { supabase } from "../lib/supabase";

// ============================================================================
// VAULT SYSTEM
// ============================================================================

function safeRead(key, def) {
  if (typeof window === "undefined") return def;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : def;
  } catch {
    return def;
  }
}

function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// Persist local identity per table to keep playerId across refreshes/tabs
function savePlayerIdentity(tableId, pid) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`mleo_poker_player_${tableId}`, String(pid)); } catch {}
}
function loadPlayerIdentity(tableId) {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(`mleo_poker_player_${tableId}`) || null; } catch { return null; }
}
function clearPlayerIdentity(tableId) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(`mleo_poker_player_${tableId}`); } catch {}
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

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

function useIOSViewportFix() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const setVH = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
    };
    const onOrient = () => requestAnimationFrame(() => setTimeout(setVH, 250));
    setVH();
    if (vv) {
      vv.addEventListener("resize", setVH);
      vv.addEventListener("scroll", setVH);
    }
    window.addEventListener("orientationchange", onOrient);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", setVH);
        vv.removeEventListener("scroll", setVH);
      }
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);
}

// ============================================================================
// POKER CONSTANTS & UTILITIES
// ============================================================================

const SUITS = ['S','H','D','C'];
const SUIT_SYMBOL = { S:'♠', H:'♥', D:'♦', C:'♣' };
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANKS_ORDER = { A:14,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
const BETTING_TIME_LIMIT = 30000; // 30 seconds

// Game status constants
const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished'
};

const PLAYER_STATUS = {
  ACTIVE: 'active',
  FOLDED: 'folded',
  ALL_IN: 'all_in'
};

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================================
// POKER HAND EVALUATION
// ============================================================================

const normalizeCards = (cards) => {
  if (!Array.isArray(cards)) return [];

  const normalized = cards.map((c) => {
    if (!c) return null;

    const r = (typeof c.r === 'number' && c.r > 0) ? c.r :
              (c.value && RANKS_ORDER[c.value] !== undefined) ? RANKS_ORDER[c.value] : null;
    const s = c.s || c.suit || null;

    if (!r || !s) return null;
    return { r, s };
  }).filter(Boolean);

  return normalized.sort((a, b) => b.r - a.r);
};

const uniqueRanksDesc = (rs) => {
  const seen = new Set();
  const out = [];
  for (const x of rs) if (!seen.has(x)) { seen.add(x); out.push(x); }
  return out;
};

const findFlush = (cards7) => {
  if (!cards7 || !Array.isArray(cards7)) return null;
  
  const bySuit = new Map();
  for (const c of cards7) {
    if (c && c.s && typeof c.r !== 'undefined') {
      const arr = bySuit.get(c.s) || [];
      arr.push(c);
      bySuit.set(c.s, arr);
    }
  }
  for (const arr of bySuit.values()) {
    if (arr.length >= 5) {
      return arr.sort((a,b)=> b.r - a.r).slice(0,5);
    }
  }
  return null;
};

const findStraightFromRanks = (descRanks) => {
  const ranks = [...descRanks];
  if (ranks.includes(14)) ranks.push(1);
  let run = [ranks[0]];
  for (let i=1;i<ranks.length;i++) {
    const prev = ranks[i-1], cur = ranks[i];
    if (cur === prev) continue;
    if (cur === prev - 1) {
      run.push(cur);
    } else {
      run = [cur];
    }
    if (run.length >= 5) {
      const top = Math.max(...run.slice(-5));
      return top === 5 && run.slice(-5).includes(14) ? 5 : Math.max(...run.slice(-5));
    }
  }
  return null;
};

const pickStraightHand = (cards7) => {
  const uniqueDesc = uniqueRanksDesc(cards7.map(c=>c.r));
  const high = findStraightFromRanks(uniqueDesc);
  if (!high) return null;
  const need = [];
  const seq = (high === 5) ? [5,4,3,2,14] : [high, high-1, high-2, high-3, high-4];
  for (const r of seq) {
    const pick = cards7.find(c => c.r === r && !need.includes(c));
    if (!pick) return null;
    need.push(pick);
  }
  return need.sort((a,b)=> b.r - a.r);
};

const handRankTuple = (best5) => {
  if (!best5 || best5.length !== 5) return [0];
  
  const counts = new Map();
  for (const c of best5) {
    if (c && typeof c.r !== 'undefined' && c.r !== null) {
      counts.set(c.r, (counts.get(c.r)||0)+1);
    } else {
      return [0];
    }
  }
  
  const entries = [...counts.entries()].sort((a,b)=> (b[1]-a[1]) || (b[0]-a[0]));
  const ranksDesc = best5.map(c=>c.r).sort((a,b)=> b-a);

  const isFlush5 = best5.every(c => c.s === best5[0].s);
  const uniq = uniqueRanksDesc(ranksDesc);
  const isStraight5 = findStraightFromRanks(uniq) !== null;

  if (isFlush5 && isStraight5) {
    const high = (best5.find(c=>c.r===14) && best5.some(c=>c.r===5)) ? 5 : Math.max(...best5.map(c=>c.r));
    return [9, high];
  }
  if (entries[0][1] === 4) {
    const four = entries[0][0];
    const kicker = Math.max(...ranksDesc.filter(r=>r!==four));
    return [8, four, kicker];
  }
  if (entries[0][1] === 3 && entries[1] && entries[1][1] === 2) {
    return [7, entries[0][0], entries[1][0]];
  }
  if (isFlush5) {
    return [6, ...ranksDesc];
  }
  if (isStraight5) {
    const high = (best5.find(c=>c.r===14) && best5.some(c=>c.r===5)) ? 5 : Math.max(...best5.map(c=>c.r));
    return [5, high];
  }
  if (entries[0][1] === 3) {
    const trips = entries[0][0];
    const kickers = ranksDesc.filter(r=>r!==trips).slice(0,2);
    return [4, trips, ...kickers];
  }
  if (entries[0][1] === 2 && entries[1] && entries[1][1] === 2) {
    const highPair = Math.max(entries[0][0], entries[1][0]);
    const lowPair  = Math.min(entries[0][0], entries[1][0]);
    const kicker = Math.max(...ranksDesc.filter(r=>r!==highPair && r!==lowPair));
    return [3, highPair, lowPair, kicker];
  }
  if (entries[0][1] === 2) {
    const pair = entries[0][0];
    const kickers = ranksDesc.filter(r=>r!==pair).slice(0,3);
    return [2, pair, ...kickers];
  }
  return [1, ...ranksDesc];
};

const best5Of7 = (cards7) => {
  if (!cards7 || cards7.length < 5) {
    return { best5: [], tuple: [0] };
  }

  const flush5 = findFlush(cards7);
  const straight5 = pickStraightHand(cards7);

  let candidateHands = [];
  if (flush5) {
    const suited = flush5;
    const sf = pickStraightHand(suited);
    if (sf) candidateHands.push(sf);
    candidateHands.push(flush5);
  }
  if (straight5) candidateHands.push(straight5);

  if (candidateHands.length === 0 || candidateHands.some(h => handRankTuple(h)[0] < 9)) {
    const c = cards7;
    for (let a=0;a<3;a++) for (let b=a+1;b<4;b++) for (let d=b+1;d<5;d++) for (let e=d+1;e<6;e++) for (let f=e+1;f<7;f++) {
      candidateHands.push([c[a],c[b],c[d],c[e],c[f]]);
    }
  }

  let best = null, bestRank = null;
  for (const h of candidateHands) {
    if (h && h.length === 5 && h.every(c => c && typeof c.r !== 'undefined' && c.r !== null)) {
      try {
        const t = handRankTuple(h);
        if (t && t.length > 0 && t[0] !== 0) {
          if (!best || compareRankTuple(t, bestRank) > 0) {
            best = h; bestRank = t;
          }
        }
      } catch (error) {
        console.error("Error in handRankTuple for hand:", h, error);
      }
    }
  }

  return { best5: best || [], tuple: bestRank || [0] };
};

const compareRankTuple = (a, b) => {
  if (!a || !b) return 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i] || 0;
    const bi = b[i] || 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
};

const evaluateHand = (cards) => {
  if (!cards || cards.length < 5) return { rank: 0, score: [0], name: "Invalid", best5: [] };
  
  try {
    const converted = cards.map((card) => {
      if (!card) return null;
      if (typeof card.r === 'number' && card.s) return { r: card.r, s: card.s };
      if (card.suit && card.value && RANKS_ORDER[card.value] !== undefined) {
        return { r: RANKS_ORDER[card.value], s: card.suit };
      }
      return null;
    }).filter(Boolean);
    
    if (converted.length < 5) {
      return { rank: 0, score: [0], name: "Invalid", best5: [] };
    }
    
    const norm = normalizeCards(converted);
    if (norm.length < 5) {
      return { rank: 0, score: [0], name: "Invalid", best5: [] };
    }
    
    const { best5, tuple } = best5Of7(norm);
    
    if (!best5 || best5.length !== 5 || !tuple || !tuple.length) {
      return { rank: 0, score: [0], name: "Invalid", best5: [] };
    }

    const names = {9:'Straight Flush',8:'Four of a Kind',7:'Full House',6:'Flush',5:'Straight',4:'Three of a Kind',3:'Two Pair',2:'Pair',1:'High Card'};
    const rev = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
    return {
      rank: tuple[0],
      score: tuple,
      name: names[tuple[0]] || "Unknown",
      best5: best5.map(c => ({ value: rev[c.r] || "?", suit: c.s }))
    };
  } catch (error) {
    console.error("Error in evaluateHand:", error, cards);
    return { rank: 0, score: [0], name: "Error", best5: [] };
  }
};

// ============================================================================
// UI COMPONENTS
// ============================================================================

function PlayingCard({ card, hidden = false, delay = 0 }) {
  if (hidden) {
    return (
      <div 
        className="w-10 h-14 rounded bg-gradient-to-br from-red-600 to-red-800 border border-white/30 flex items-center justify-center shadow text-lg"
        style={{ animation: `slideInCard 0.4s ease-out ${delay}ms both`, opacity: 0 }}
      >
        🂠
      </div>
    );
  }
  
  const isRed = card.suit === "H" || card.suit === "D";
  const color = isRed ? "text-red-600" : "text-black";
  const suitSymbol = SUIT_SYMBOL[card.suit] || card.suit || '•';
  
  return (
    <div 
      className="w-10 h-14 rounded bg-white border border-gray-400 shadow p-0.5 relative"
      style={{ animation: `slideInCard 0.4s ease-out ${delay}ms both`, opacity: 0 }}
    >
      <div className={`text-xs font-bold ${color} absolute top-0.5 left-1 leading-tight`}>
        {card.value}
      </div>
      <div className={`text-base ${color} flex items-center justify-center h-full`}>
        {suitSymbol}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TexasHoldemCasinoPage() {
  useIOSViewportFix();
  const router = useRouter();

  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // State
  const [screen, setScreen] = useState("lobby"); // lobby, table, game
  const [mounted, setMounted] = useState(false);
  const [vaultAmount, setVaultAmount] = useState(0);
  const [playerName, setPlayerName] = useState("");
  
  // Persist player name across refreshes
  useEffect(() => {
    const savedName = safeRead("mleo_poker_name", "");
    if (typeof savedName === "string" && savedName.trim()) {
      setPlayerName(savedName);
    }
  }, []);
  useEffect(() => {
    try { safeWrite("mleo_poker_name", String(playerName || "")); } catch {}
  }, [playerName]);
  
  // Lobby state
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  
  // Table state
  const [currentTableId, setCurrentTableId] = useState(null);
  const [currentGameId, setCurrentGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [game, setGame] = useState(null);
  const [myPlayer, setMyPlayer] = useState(null);
  
  // UI states
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gameMessage, setGameMessage] = useState("");
  const [actionTimer, setActionTimer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [winnerModal, setWinnerModal] = useState({ open: false, text: "", hand: "", pot: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [raiseTo, setRaiseTo] = useState(null);

  // --- Fullscreen layout refs (match Limbo/Diamonds pattern) ---
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const metersRef = useRef(null);
  const listRef = useRef(null);
  const ctaRef = useRef(null);

  // Track fullscreen state changes (optional visual cue)
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Auto-fit layout so everything fits in one viewport height
  useEffect(() => {
    const calc = () => {
      const rootH = window.visualViewport?.height ?? window.innerHeight;
      const headH = headerRef.current?.offsetHeight || 0;
      document.documentElement.style.setProperty("--head-h", headH + "px");
      const topPad = headH + 8;

      if (screen === "lobby") {
        const used = headH + (ctaRef.current?.offsetHeight || 0) + topPad + 4;
        const freeH = Math.max(220, rootH - used);
        document.documentElement.style.setProperty("--lobby-list-h", freeH + "px");
      } else {
        // table/game
        const used =
          headH +
          (metersRef.current?.offsetHeight || 0) +
          (ctaRef.current?.offsetHeight || 0) +
          topPad +
          48;
        const freeH = Math.max(200, rootH - used);
        document.documentElement.style.setProperty("--table-area-h", freeH + "px");
      }
    };

    const vv = window.visualViewport;
    const onResize = () => requestAnimationFrame(() => setTimeout(calc, 50));

    calc();
    vv?.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      vv?.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [screen]);

  const toggleFullscreen = () => {
    const el = wrapRef.current || document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    setMounted(true);
    setVaultAmount(getVault());
    
    // Check if user is admin
    setIsAdmin(address === "0x39846ebBA723e440562a60f4B4a0147150442c7b");
  }, [address]);

  // Restore player identity if lost (e.g., refresh)
  useEffect(() => {
    if (!playerId && currentTableId) {
      const saved = loadPlayerIdentity(currentTableId);
      if (saved) setPlayerId(saved);
    }
  }, [playerId, currentTableId]);

  // Helper functions for raise calculations
  const getMinRaiseSize = (g, tableBB = 0) => {
    const lastRaiseTo = g?.last_raise_to || 0;
    const curBet = g?.current_bet || 0;
    // אם עוד לא הייתה העלאה ברחוב: מינימום = BB; אחרת = גודל ההעלאה הקודמת
    return Math.max(lastRaiseTo - curBet, tableBB);
  };

  const getMaxRaiseTo = (me) => {
    // לא לעבור ALL-IN מלא (מותר כמובן, אבל זה הגבול העליון)
    return (me?.current_bet || 0) + (me?.chips || 0);
  };

  // Helper function for RPC - pad tuple to 8 elements
  function padTuple8(arr = []) {
    const out = arr.slice(0, 8);
    while (out.length < 8) out.push(0);
    return out.map(x => Number(x || 0));
  }

  // ----- Seat helpers (use real seat_index ring) -----

  // players: array already sorted by seat_index ASC
  const seatRing = (players) => players.map(p => p.seat_index);

  // next seat clockwise that exists in players (wrap-around)
  const nextSeat = (seats, fromSeat) => {
    if (!seats.length) return null;
    // unique sorted
    const uniq = [...new Set(seats)].sort((a,b)=>a-b);
    const i = uniq.findIndex(s => s === fromSeat);
    if (i === -1) return uniq[0];                 // if dealer seat not present (left table), take first seat
    return uniq[(i + 1) % uniq.length];
  };

  // given seat number -> array index in `players` (sorted by seat_index)
  const arrIndexFromSeat = (players, seat) => players.findIndex(p => p.seat_index === seat);

  // first player to act on post-flop street = seat to the left of dealer that is not folded/all-in
  const firstToActIndex = (playersSorted, dealerSeat) => {
    const seats = seatRing(playersSorted);
    let s = nextSeat(seats, dealerSeat);
    for (let k=0;k<playersSorted.length;k++) {
      const idx = arrIndexFromSeat(playersSorted, s);
      const p   = playersSorted[idx];
      if (p && p.status !== PLAYER_STATUS.FOLDED && p.status !== PLAYER_STATUS.ALL_IN) return idx;
      s = nextSeat(seats, s);
    }
    return 0;
  };

  // compute positions for PREFLOP from dealerSeat on a sorted-by-seat array
  const computePreflopPositions = (playersSorted, dealerSeat) => {
    const seats = seatRing(playersSorted);
    const sbSeat = nextSeat(seats, dealerSeat);
    const bbSeat = nextSeat(seats, sbSeat);
    const first  = nextSeat(seats, bbSeat);

    return {
      dealerSeat,
      smallBlindIdx: arrIndexFromSeat(playersSorted, sbSeat),
      bigBlindIdx:   arrIndexFromSeat(playersSorted, bbSeat),
      firstToActIdx: arrIndexFromSeat(playersSorted, first),
    };
  };

  // Timer functions
  const startActionTimer = (playerId) => {
    if (actionTimer) {
      clearInterval(actionTimer);
    }
    
    setTimeLeft(BETTING_TIME_LIMIT / 1000);
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-fold if time runs out
          handlePlayerAction("fold");
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    setActionTimer(timer);
  };

  const stopActionTimer = () => {
    if (actionTimer) {
      clearInterval(actionTimer);
      setActionTimer(null);
    }
    setTimeLeft(0);
  };

  // Game flow functions
  const getNextRound = (currentRound) => {
    const rounds = ["preflop", "flop", "turn", "river", "showdown"];
    const currentIndex = rounds.indexOf(currentRound);
    return rounds[currentIndex + 1] || "showdown";
  };

  const getCommunityVisible = (round) => {
    const visible = {
      "preflop": 0,
      "flop": 3,
      "turn": 4,
      "river": 5,
      "showdown": 5
    };
    return visible[round] || 0;
  };

  // ============================================================================
  // CLEANUP FUNCTIONS
  // ============================================================================

  // Cleanup inactive players (not active for 5+ minutes)
  const cleanupInactivePlayers = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const { error } = await supabase
        .from('casino_players')
        .delete()
        .lt('last_action_time', fiveMinutesAgo.toISOString());
      
      if (error) console.error("Error cleaning inactive players:", error);
    } catch (err) {
      console.error("Error in cleanupInactivePlayers:", err);
    }
  };

  // Cleanup empty games (no players)
  const cleanupEmptyGames = async () => {
    try {
      const { data: games, error: gamesError } = await supabase
        .from('casino_games')
        .select('id');
      
      if (gamesError) throw gamesError;
      
      for (const game of games || []) {
        const { data: players, error: playersError } = await supabase
          .from('casino_players')
          .select('id')
          .eq('game_id', game.id);
        
        if (playersError) continue;
        
        if (!players || players.length === 0) {
          await supabase.from('casino_games').delete().eq('id', game.id);
        }
      }
    } catch (err) {
      console.error("Error in cleanupEmptyGames:", err);
    }
  };

  // Cleanup finished game
  const cleanupFinishedGame = async () => {
    try {
      if (currentGameId) {
        await supabase.from('casino_games').delete().eq('id', currentGameId);
        if (currentTableId) {
          await supabase.from('casino_tables')
            .update({ current_game_id: null })
            .eq('id', currentTableId);
        }
      }
    } catch (err) {
      console.error("Error in cleanupFinishedGame:", err);
    }
  };

  // Reset all tables (admin only)
  const resetAllTables = async () => {
    try {
      await supabase.from('casino_players').delete();
      await supabase.from('casino_games').delete();
      await supabase.from('casino_tables').update({ current_players: 0 });
      setError("All tables reset successfully!");
      loadTables(); // Reload tables
    } catch (err) {
      console.error("Error resetting tables:", err);
      setError("Failed to reset tables: " + err.message);
    }
  };

  // Periodic cleanup every 15 minutes
  useEffect(() => {
    const cleanupInterval = setInterval(async () => {
      await cleanupInactivePlayers();
      await cleanupEmptyGames();
    }, 15 * 60 * 1000); // 15 minutes
    
    return () => clearInterval(cleanupInterval);
  }, []);

  useEffect(() => {
    if (mounted) {
      setVaultAmount(getVault());
    }
  }, [mounted]);

  // Subscribe to tables
  useEffect(() => {
    if (screen !== "lobby") return;
    
    loadTables();
    
    const subscription = supabase
      .channel('casino_tables_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'casino_tables' }, 
        () => loadTables()
      )
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, [screen]);

  const loadTables = async () => {
    try {
      const { data: tablesData, error: tablesError } = await supabase
        .from('casino_tables')
        .select('*')
        .eq('status', 'active')
        .order('min_buyin', { ascending: true });
      
      if (tablesError) throw tablesError;
      
      // Get player counts for each table
      const tablesWithCounts = await Promise.all(
        (tablesData || []).map(async (table) => {
          const { count } = await supabase
            .from('casino_players')
            .select('id', { count: 'exact' })
            .eq('table_id', table.id);
          
          return { ...table, current_players: count || 0 };
        })
      );
      
      setTables(tablesWithCounts);
    } catch (err) {
      console.error("Error loading tables:", err);
    }
  };

  const handleJoinTable = async (table) => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    
    if (vaultAmount < table.min_buyin) {
      setError(`You need at least ${fmt(table.min_buyin)} MLEO to join this table`);
      return;
    }
    
    try {
      setError("");
      
      // Check if table is full
      const { count } = await supabase
        .from('casino_players')
        .select('id', { count: 'exact' })
        .eq('table_id', table.id);
      
      if (count >= table.max_players) {
        setError("Table is full");
        return;
      }
      
      // Find available seat
      const { data: existingPlayers } = await supabase
        .from('casino_players')
        .select('seat_index')
        .eq('table_id', table.id);
      
      const occupiedSeats = new Set(existingPlayers?.map(p => p.seat_index) || []);
      let seatIndex = -1;
      for (let i = 0; i < table.max_players; i++) {
        if (!occupiedSeats.has(i)) {
          seatIndex = i;
          break;
        }
      }
      
      if (seatIndex === -1) {
        setError("No available seats");
        return;
      }
      
      // Deduct from vault
      const newVault = vaultAmount - table.min_buyin;
      setVault(newVault);
      setVaultAmount(newVault);
      
      // Add player to table
      const { data: newPlayer, error: playerError } = await supabase
        .from('casino_players')
        .insert({
          table_id: table.id,
          player_name: playerName.trim(),
          player_wallet: address || "guest",
          chips: table.min_buyin,
          seat_index: seatIndex,
          status: 'active'
        })
        .select()
        .single();
      
      if (playerError) throw playerError;
      
      setPlayerId(newPlayer.id);
      savePlayerIdentity(table.id, newPlayer.id);
      setCurrentTableId(table.id);
      setSelectedTable(table);
      setScreen("table");
      
    } catch (err) {
      console.error("Error joining table:", err);
      setError("Failed to join table: " + err.message);
    }
  };

  const handleLeaveTable = async () => {
    if (!playerId || !currentTableId) return;
    
    try {
      // Get player's current chips
      const { data: player } = await supabase
        .from('casino_players')
        .select('chips')
        .eq('id', playerId)
        .single();
      
      if (player && player.chips > 0) {
        // Return chips to vault
        const newVault = vaultAmount + player.chips;
        setVault(newVault);
        setVaultAmount(newVault);
      }
      
      // Remove player from table
      await supabase
        .from('casino_players')
        .delete()
        .eq('id', playerId);
      
      // Check if game should be cleaned up
      const { data: remainingPlayers } = await supabase
        .from('casino_players')
        .select('id')
        .eq('game_id', currentGameId);
      
      // If no players left, mark game as waiting
      if (!remainingPlayers || remainingPlayers.length === 0) {
        await supabase.from('casino_games').update({
          status: GAME_STATUS.WAITING,
          round: 'preflop',
          pot: 0,
          current_bet: 0
        }).eq('id', currentGameId);
      }
      
      // Reset state
      setPlayerId(null);
      clearPlayerIdentity(currentTableId);
      setCurrentTableId(null);
      setCurrentGameId(null);
      setSelectedTable(null);
      setPlayers([]);
      setGame(null);
      setMyPlayer(null);
      setScreen("lobby");
      
    } catch (err) {
      console.error("Error leaving table:", err);
      setError("Failed to leave table: " + err.message);
    }
  };

  // Subscribe to table updates
  useEffect(() => {
    if (!currentTableId || screen !== "table") return;
    
    loadTableData();
    
    // Watch for current_game_id changes on the table and auto-switch to game
    const tableWatch = supabase
      .channel(`table_${currentTableId}_game_watch`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_tables', filter: `id=eq.${currentTableId}` },
        (payload) => {
          const row = payload.new || payload.old;
          if (row && row.current_game_id && !currentGameId) {
            setCurrentGameId(row.current_game_id);
            setScreen('game');
          }
        }
      )
      .subscribe();

    const playersChannel = supabase
      .channel(`table_${currentTableId}_players`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_players', filter: `table_id=eq.${currentTableId}` },
        () => loadTableData()
      )
      .subscribe();
    
    return () => {
      tableWatch.unsubscribe();
      playersChannel.unsubscribe();
    };
  }, [currentTableId, screen]);

  // Polling fallback for missed realtime events
  useEffect(() => {
    if (!currentTableId || screen !== 'table' || currentGameId) return;

    let tries = 0;
    const poll = setInterval(async () => {
      tries++;
      const { data, error } = await supabase
        .from('casino_tables')
        .select('current_game_id')
        .eq('id', currentTableId)
        .single();

      if (data?.current_game_id) {
        setCurrentGameId(data.current_game_id);
        setScreen('game');
        await loadGameData();
        clearInterval(poll);
      }
      if (tries >= 8) clearInterval(poll); // מפסיקים אחרי ~12 שניות
    }, 1500);

    return () => clearInterval(poll);
  }, [currentTableId, screen, currentGameId]);

  // Auto-start game when 2+ players - only by player with lowest seat_index
  useEffect(() => {
    if (!currentGameId && players.length >= 2 && myPlayer) {
      const minSeat = Math.min(...players.map(p => p.seat_index));
      if (myPlayer.seat_index === minSeat) {
        console.log("🟢 I'm the lowest seat, starting game...");
        startGame();
      } else {
        console.log("🟡 Waiting for player in seat", minSeat, "to start...");
      }
    }
  }, [currentGameId, players, myPlayer?.seat_index]);

  // Subscribe to game updates
  useEffect(() => {
    if (!currentGameId || screen !== "game") return;
    
    loadGameData();
    
    const gameChannel = supabase
      .channel(`game_${currentGameId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_games', filter: `id=eq.${currentGameId}` },
        () => loadGameData()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_players', filter: `game_id=eq.${currentGameId}` },
        () => loadGameData()
      )
      .subscribe();
    
    return () => {
      gameChannel.unsubscribe();
    };
  }, [currentGameId, screen]);

  // Start timer when it's my turn
  useEffect(() => {
    if (game && myPlayer && playerId && screen === "game") {
      const mySeatTmp = players.find(p => p.id === playerId)?.seat_index;
      const isMyTurn = mySeatTmp != null && game.current_player_seat === mySeatTmp;
      if (isMyTurn && myPlayer.status !== PLAYER_STATUS.FOLDED && game.status === GAME_STATUS.PLAYING) {
        startActionTimer(playerId);
      } else {
        stopActionTimer();
      }
    }
  }, [game?.current_player_seat, myPlayer?.status, game?.status, players, playerId, screen]);

  // Update raiseTo when game state changes
  useEffect(() => {
    if (!game || !myPlayer || screen !== "game") return;
    const minSize = getMinRaiseSize(game, selectedTable?.big_blind || 0);
    const minTo = (game?.current_bet || 0) + minSize;
    const maxTo = getMaxRaiseTo(myPlayer);
    setRaiseTo(Math.min(Math.max(minTo, myPlayer?.current_bet || 0), maxTo));
  }, [game?.current_bet, game?.last_raise_to, myPlayer?.chips, myPlayer?.current_bet, screen, selectedTable?.big_blind]);

  // Arbiter loop: every 2s check and fold timed-out player
  useEffect(() => {
    if (!currentGameId || screen !== 'game') return;
    const id = setInterval(() => { forceTimeoutFold(); }, 2000);
    return () => clearInterval(id);
  }, [currentGameId, screen]);

  const loadTableData = async () => {
    if (!currentTableId) return;
    
    try {
      const { data: playersData } = await supabase
        .from('casino_players')
        .select('*')
        .eq('table_id', currentTableId)
        .order('seat_index', { ascending: true });
      
      setPlayers(playersData || []);
      
      // Try to resolve my player reliably (by id, then by player_name)
      const meById = playerId ? (playersData || []).find(p => p.id === playerId) : null;
      const meByName = (!meById && playerName) ? (playersData || []).find(p => p.player_name === playerName) : null;
      const me = meById || meByName || null;
      setMyPlayer(me);
      if (!playerId && me) {
        setPlayerId(me.id);
        savePlayerIdentity(currentTableId, me.id);
      }

      // Also check if a game has started on this table and switch
      const { data: tblRow } = await supabase
        .from('casino_tables')
        .select('current_game_id')
        .eq('id', currentTableId)
        .single();

      if (tblRow && tblRow.current_game_id && !currentGameId) {
        setCurrentGameId(tblRow.current_game_id);
        setScreen('game');
      }
    } catch (err) {
      console.error("Error loading table data:", err);
    }
  };

  const loadGameData = async () => {
    if (!currentGameId) return;

    try {
      const { data: gameData, error: ge } = await supabase
        .from('casino_games')
        .select('*')
        .eq('id', currentGameId)
        .single();

      if (ge || !gameData) {
        // המשחק לא קיים – לא לקרוס
        setCurrentGameId(null);
        setScreen('table');
        return;
      }

      const { data: playersData } = await supabase
        .from('casino_players')
        .select('*')
        .eq('game_id', currentGameId)
        .order('seat_index');

      setGame(gameData);
      setPlayers(playersData || []);
      const meById = playerId ? (playersData || []).find(p => p.id === playerId) : null;
      const meByName = (!meById && playerName) ? (playersData || []).find(p => p.player_name === playerName) : null;
      const me = meById || meByName || null;
      setMyPlayer(me);
      if (!playerId && me && currentTableId) {
        setPlayerId(me.id);
        savePlayerIdentity(currentTableId, me.id);
      }
    } catch (err) {
      console.error('loadGameData error:', err);
      setCurrentGameId(null);
      setScreen('table');
    }
  };

  // Start a new game
  const startGame = async () => {
    console.log("🎯 startGame() triggered for table", currentTableId);

    // הגנה כפולה שלא יתחיל פעמיים
    const { data: table } = await supabase
      .from("casino_tables")
      .select("current_game_id")
      .eq("id", currentTableId)
      .single();
    if (table?.current_game_id) {
      console.log("⚠️ Table already has active game:", table.current_game_id);
      setCurrentGameId(table.current_game_id);
      setScreen('game');
      await loadGameData();
      return;
    }

    // שלוף את כל השחקנים בשולחן
    const { data: seatedPlayers } = await supabase
      .from("casino_players")
      .select("*")
      .eq("table_id", currentTableId)
      .order("seat_index");

    if (!seatedPlayers || seatedPlayers.length < 2) {
      console.log("⏸️ Not enough players to start.");
      return;
    }

    // צור חפיסת קלפים חדשה
    const deck = shuffleDeck(createDeck());
    const dealerIndex = 0;
    const smallBlindIndex = 0;
    const bigBlindIndex = 1;
    const firstToAct = 0;

    // צור משחק חדש
    const { data: game, error } = await supabase
      .from("casino_games")
      .insert({
        table_id: currentTableId,
        status: "playing", // <==== חשוב מאוד
        round: "preflop",
        dealer_index: dealerIndex,
        current_player_index: firstToAct,
        current_player_seat: seatedPlayers[firstToAct].seat_index,
        last_raiser_index: bigBlindIndex,
        last_raiser_seat: seatedPlayers[bigBlindIndex].seat_index,
        community_cards: [],
        community_visible: 0,
        pot: 0,
        current_bet: 0,
        deck,
        turn_deadline: new Date(Date.now() + 20000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Error inserting new game:", error);
      return;
    }

    // עדכן את השולחן
    await supabase
      .from("casino_tables")
      .update({ current_game_id: game.id })
      .eq("id", currentTableId);

    // עדכן את כל השחקנים שייכים למשחק הזה
    for (const p of seatedPlayers) {
      const cards = [deck.pop(), deck.pop()];
      await supabase
        .from("casino_players")
        .update({
          game_id: game.id,
          hole_cards: cards,
          current_bet: 0,
          hand_invested: 0,
          status: "active"
        })
        .eq("id", p.id);
    }

    console.log("✅ New game started:", game.id);
    setCurrentGameId(game.id);
    setScreen("game");
    await loadGameData();
  };

  const handlePlayerAction = async (action, amount = 0) => {
    if (!currentGameId) return;
    if (!game || !playerId) return;
    if (game.status !== GAME_STATUS.PLAYING || game.round === "finished") return;

    try {
      // 1) תמונת מצב עדכנית
      const { data: gNow } = await supabase
        .from('casino_games').select('*').eq('id', currentGameId).single();
      const { data: pNow } = await supabase
        .from('casino_players').select('*').eq('game_id', currentGameId).order('seat_index');

      const pls = pNow || players;
      const curIdx = pls.findIndex(p => p.seat_index === (gNow.current_player_seat ?? pls[0]?.seat_index));
      const cur    = curIdx >= 0 ? pls[curIdx] : null;
      const me     = pls.find(p => p.id === playerId);

      if (!cur || cur.id !== playerId) return;                         // לא התור שלי
      if (!me || me.status === PLAYER_STATUS.FOLDED) return;
      if (gNow.status !== GAME_STATUS.PLAYING) return;

      const toCall = Math.max(0, (gNow.current_bet ?? 0) - (me.current_bet ?? 0));

      // 2) יישום הפעולה מקומית
      let newBet = me.current_bet ?? 0;
      let newChips = me.chips ?? 0;
      let newStatus = me.status;
      let put = 0; // כמה שם השחקן בקופה

      if (action === "fold") {
        newStatus = PLAYER_STATUS.FOLDED;
      } else if (action === "check") {
        if (toCall > 0) return; // לא חוקי
      } else if (action === "call") {
        put = Math.min(toCall, newChips);
        newBet += put; newChips -= put;
        if (put < toCall) newStatus = PLAYER_STATUS.ALL_IN;
      } else if (action === "raise") {
        // מינימום העלאה = ההעלאה האחרונה ברחוב (או BB אם עוד לא הייתה העלאה)
        const lastRaiseTo = gNow.last_raise_to || 0;
        const minRaiseSize = Math.max((lastRaiseTo - (gNow.current_bet || 0)), selectedTable?.big_blind || 0);
        let raiseTo = Math.max((gNow.current_bet || 0) + minRaiseSize, amount);
        raiseTo = Math.min(raiseTo, newBet + newChips);
        put = raiseTo - newBet;
        if (put <= 0) return;
        newBet = raiseTo;
        newChips -= put;
        if (newChips === 0) newStatus = PLAYER_STATUS.ALL_IN;
      } else if (action === "allin") {
        put = newChips;
        newBet += put; newChips = 0;
        newStatus = PLAYER_STATUS.ALL_IN;
      }

      // עדכון hand_invested מצטבר
      const newInvested = (me.hand_invested || 0) + (put || 0);

      // 3) עדכון השחקן
      await supabase.from('casino_players').update({
        status: newStatus,
        current_bet: newBet,
        chips: newChips,
        hand_invested: newInvested,        // ⬅️ חדש
        last_action: action,
        last_action_time: new Date().toISOString(),
      }).eq('id', playerId);

      // 4) תמונת מצב אחרי העדכון
      const { data: freshPlayers } = await supabase
        .from('casino_players').select('*').eq('game_id', currentGameId).order('seat_index');

      const pot = freshPlayers.reduce((s, p) => s + (p.current_bet || 0), 0);
      const currentBet = Math.max(...freshPlayers.map(p => p.current_bet || 0), 0);

      // אם הייתה העלאה אמיתית – עדכן אגרסור וגובה ההעלאה
      const didRaise = (action === "raise") || (action === "allin" && newBet > (gNow.current_bet || 0));
      const newLastRaiserSeat = didRaise ? me.seat_index : (gNow.last_raiser_seat ?? me.seat_index);
      const newLastRaiseTo     = didRaise ? newBet  : (gNow.last_raise_to ?? (gNow.current_bet || 0));

      // מי הבא שיכול לפעול?
      const canAct = (p) => p.status !== PLAYER_STATUS.FOLDED && p.status !== PLAYER_STATUS.ALL_IN;
      let nextIdx = (curIdx + 1) % freshPlayers.length;
      while (!canAct(freshPlayers[nextIdx])) {
        nextIdx = (nextIdx + 1) % freshPlayers.length;
        if (nextIdx === curIdx) break;
      }

      // אם נשאר שחקן יחיד
      const stillIn = freshPlayers.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      if (stillIn.length === 1) {
        stopActionTimer();
        await supabase.from('casino_games').update({
          pot, current_bet: currentBet, current_player_seat: freshPlayers[nextIdx]?.seat_index ?? null
        }).eq('id', currentGameId);
        await determineWinner();
        return;
      }

      // האם כולם מיושרים לגובה ההימור (מלבד אול-אין/פולד)?
      const activeNotFolded = freshPlayers.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      const everyoneMatched = activeNotFolded.every(p =>
        p.status === PLAYER_STATUS.ALL_IN || (p.current_bet || 0) === currentBet
      );

      // סגירת רחוב: כולם מיושרים **והתור חוזר לאגרסור האחרון**
      const reachedAggressor = (freshPlayers[nextIdx]?.seat_index ?? null) === newLastRaiserSeat;
      const moreThanOneCanAct = activeNotFolded.filter(canAct).length > 1;
      const bettingDone = (!moreThanOneCanAct) || (everyoneMatched && reachedAggressor);

      stopActionTimer();

      if (!bettingDone) {
        // ממשיכים להמר באותו רחוב
        await supabase.from('casino_games').update({
          pot,
          current_bet: currentBet,
          last_raiser_seat: newLastRaiserSeat,
          last_raise_to: newLastRaiseTo,
          current_player_seat: freshPlayers[nextIdx]?.seat_index ?? null,
          turn_deadline: new Date(Date.now() + BETTING_TIME_LIMIT).toISOString()
        }).eq('id', currentGameId);
        return;
      }

      // מעבר לרחוב הבא – מחשבים לוח עם "burn" תקין
      const nextRound = getNextRound(gNow.round);
      const deck = gNow.deck || [];
      const n = freshPlayers.length;
      const base = n * 2;

      let nextCommunity = gNow.community_cards || [];
      if (nextRound === "flop"  && gNow.round === "preflop") nextCommunity = [deck[base+1], deck[base+2], deck[base+3]]; // burn: base+0
      if (nextRound === "turn"  && gNow.round === "flop")    nextCommunity = [...nextCommunity, deck[base+5]];          // burn: base+4
      if (nextRound === "river" && gNow.round === "turn")    nextCommunity = [...nextCommunity, deck[base+7]];          // burn: base+6

      // מאפסים הימורי רחוב לכל מי שלא קיפל
      for (const p of freshPlayers) {
        if (p.status !== PLAYER_STATUS.FOLDED) {
          await supabase.from('casino_players').update({ current_bet: 0 }).eq('id', p.id);
        }
      }

      // --- בתוך handlePlayerAction, לפני עדכון המשחק לרחוב הבא ---
      // players ברגע זה מסודרים לפי seat_index (נבנה מערך מסודר)
      const playersSorted = [...freshPlayers].sort((a,b)=>a.seat_index - b.seat_index);

      // dealerSeat נשמר ב-games.dealer_index (seat_index)
      const dealerSeat = gNow?.dealer_index ?? playersSorted[0]?.seat_index ?? 0;

      // מי פותח פעולה ברחוב הבא? משמאל לדילר שלא Fold/All-in
      const startIdx = firstToActIndex(playersSorted, dealerSeat);
      const startSeat = playersSorted[startIdx]?.seat_index ?? playersSorted[0]?.seat_index ?? 0;

      // עדכון משחק לרחוב הבא:
      // בפלופ/טרן/ריבר current_bet=0 ואין אגרסור עד שתהיה העלאה → last_raiser_seat=startSeat, last_raise_to=0
      await supabase.from('casino_games').update({
        pot,
        current_bet: 0,
        last_raise_to: 0,
        last_raiser_seat: startSeat,
        round: nextRound,
        community_cards: nextCommunity,
        community_visible: getCommunityVisible(nextRound),
        current_player_seat: startSeat,
        turn_deadline: new Date(Date.now() + BETTING_TIME_LIMIT).toISOString()
      }).eq('id', currentGameId);

      // אם עברנו לשואודאון בלי ALL-IN גורף – הכרז מנצח
      if (nextRound === 'showdown') {
        await determineWinner();
        return;
      }

      // אם כולם באול-אין – פותחים הכל ומסיימים
      const allAllIn = activeNotFolded.every(p => p.status === PLAYER_STATUS.ALL_IN);
      if (allAllIn) {
        await supabase.from('casino_games')
          .update({ community_visible: 5, round: 'showdown' })
          .eq('id', currentGameId);
        await determineWinner();
      }
    } catch (err) {
      console.error("Player action error:", err);
    }
  };

  // --- Side Pots --------------------------------------------------------------

  function buildSidePots(players) {
    // players: [{ id, seat_index, status, hand_invested, hole_cards }]
    // נבנה שכבות לפי ההשקעה המצטברת ביד
    const contrib = players.map(p => ({ id: p.id, folded: p.status === 'folded', v: Math.max(0, p.hand_invested || 0) }));
    const pots = [];

    while (true) {
      const active = contrib.filter(c => c.v > 0);
      if (active.length === 0) break;

      const minLayer = Math.min(...active.map(c => c.v));
      const layerParticipants = contrib.filter(c => c.v > 0); // כל מי שעדיין יש לו תרומה > 0 משתתף בשכבה הזו
      const amount = minLayer * layerParticipants.length;

      const eligibleIds = layerParticipants
        .filter(c => !c.folded)      // רק מי שלא קיפל זכאי לזכייה
        .map(c => c.id);

      pots.push({
        amount,
        eligibleIds
      });

      // הורד את השכבה מכל המשתתפים בשכבה
      for (const lp of layerParticipants) lp.v -= minLayer;
    }

    return pots; // [{amount, eligibleIds}]
  }

  function orderSeatsForRemainders(players, dealerIndex) {
    // החזרת מערך מזהי שחקנים לפי סדר קבלת "צ'יפ מוזר" (odd chip):
    // החל מהשחקן משמאל לדילר, עם wrap-around
    const sorted = [...players].sort((a, b) => a.seat_index - b.seat_index);
    const start = (dealerIndex + 1) % sorted.length;
    const ring = [];
    for (let i = 0; i < sorted.length; i++) {
      ring.push(sorted[(start + i) % sorted.length].id);
    }
    return ring;
  }

  // מחלק את ה-pot למנצח, מאפס current_bet לכולם ומאפס pot במשחק
  async function awardPotToWinner(currentGameId, winnerPlayerId) {
    // תמונת מצב עדכנית
    const { data: g } = await supabase
      .from('casino_games')
      .select('id,pot')
      .eq('id', currentGameId)
      .single();

    if (!g) return;

    const potAmount = g.pot || 0;

    // מוצאים את המנצח (בשביל ה-chips העדכני)
    const { data: w } = await supabase
      .from('casino_players')
      .select('id,chips')
      .eq('id', winnerPlayerId)
      .single();

    // 1) מזכים את המנצח בצ'יפים (stack)
    if (w && potAmount > 0) {
      await supabase
        .from('casino_players')
        .update({ chips: (w.chips || 0) + potAmount })
        .eq('id', winnerPlayerId);
    }

    // 2) מאפסים current_bet לכל שחקני היד
    await supabase
      .from('casino_players')
      .update({ current_bet: 0 })
      .eq('game_id', currentGameId);

    // 3) מאפסים את ה-pot במשחק
    await supabase
      .from('casino_games')
      .update({ pot: 0, current_bet: 0 })
      .eq('id', currentGameId);
  }

  async function settleSidePots(currentGameId, dealerIndex, board5) {
    // טען מצב נוכחי
    const { data: pls } = await supabase
      .from('casino_players')
      .select('id,player_name,seat_index,status,hole_cards,hand_invested,chips,game_id')
      .eq('game_id', currentGameId)
      .order('seat_index');

    const players = pls || [];
    const totalPot = players.reduce((s, p) => s + Math.max(0, p.hand_invested || 0), 0);

    const pots = buildSidePots(players); // [{amount, eligibleIds}]

    // הכנה לסדר שאריות
    const oddOrder = orderSeatsForRemainders(players, dealerIndex);

    // מצטבר עדכונים ל-DB
    const chipIncrements = new Map(); // playerId -> +chips

    for (const pot of pots) {
      const elig = players.filter(p => pot.eligibleIds.includes(p.id));
      if (elig.length === 0 || pot.amount <= 0) continue;

      // דירוג ידיים לזכאים
      const ranked = elig.map(p => {
        const all = [...(p.hole_cards || []), ...board5];
        const evalRes = evaluateHand(all);
        return { p, evalRes };
      }).sort((a, b) => compareRankTuple(b.evalRes.score, a.evalRes.score));

      // מצא את הניקוד הטוב ביותר
      const bestScore = ranked[0].evalRes.score;
      const winners = ranked.filter(r => compareRankTuple(r.evalRes.score, bestScore) === 0).map(r => r.p);

      // חלוקה שווה + שאריות לפי oddOrder
      const baseShare = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - baseShare * winners.length;

      for (const w of winners) {
        chipIncrements.set(w.id, (chipIncrements.get(w.id) || 0) + baseShare);
      }

      if (remainder > 0) {
        // חלק שאריות לפי סדר oddOrder (משמאל לדילר)
        for (const pid of oddOrder) {
          if (remainder === 0) break;
          if (winners.find(w => w.id === pid)) {
            chipIncrements.set(pid, (chipIncrements.get(pid) || 0) + 1);
            remainder--;
          }
        }
      }
    }

    // בצע העדכונים
    for (const [pid, inc] of chipIncrements.entries()) {
      await supabase.from('casino_players').update({
        chips: (players.find(p => p.id === pid)?.chips || 0) + inc
      }).eq('id', pid);
    }

    // איפוס הימורים/השקעה ידנית של כולם (יד נגמרה)
    await supabase.from('casino_players')
      .update({ current_bet: 0, hand_invested: 0 })
      .eq('game_id', currentGameId);

    // אפס את הקופה וסמן סיום
    await supabase.from('casino_games').update({
      pot: 0,
      current_bet: 0,
      round: 'showdown',
      status: 'finished',
      community_visible: 5
    }).eq('id', currentGameId);

    return { totalPot, pots, chipIncrements };
  }

  // Determine winner
  const determineWinner = async () => {
    try {
      stopActionTimer();

      const { data: gNow } = await supabase.from('casino_games').select("*").eq("id", currentGameId).single();
      const { data: pls } = await supabase.from('casino_players').select("*").eq("game_id", currentGameId).order("seat_index");

      const active = pls.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      
      // --- זכייה ע"י קיפול ---
      if (active.length === 1) {
        const w = active[0];
        const potAmount = gNow.pot || 0;

        // אין צורך בקלפים – פשוט מעבירים דירוג "דמה" (tuple גדל) רק למנצח:
        await supabase.rpc('award_pots_v2', {
          game_uuid: currentGameId,
          rankings_json: [{ player_id: w.id, tuple: padTuple8([99,99,99,99,99,99,99,99]) }]
        });

        // רענון תצוגה
        await loadGameData();

        setGameMessage(`🎉 ${w.player_name} wins by fold! Pot: ${fmt(potAmount)} MLEO`);
        setWinnerModal({ open: true, text: `🎉 ${w.player_name} wins by fold!`, hand: "", pot: potAmount });

        await supabase.from('casino_games').update({
          status: GAME_STATUS.FINISHED,
          round: "showdown",
          community_visible: 5,
          current_bet: 0
        }).eq("id", currentGameId);

        // התחל יד חדשה...
        setTimeout(() => {
          setWinnerModal({ open: false, text: "", hand: "", pot: 0 });
          startNewHand();
        }, 5000);
        return;
      }

      // --- SHOWDOWN מלא ---
      const board5 = (gNow.community_cards || []).slice(0, 5);

      // בונים דירוגים רק לשחקנים שלא קיפלו (folded לא משתתף בזכייה)
      const rankings = (pls || [])
        .filter(p => p.status !== 'folded')
        .map(p => {
          const all = [...(p.hole_cards || []), ...board5];
          const ev  = evaluateHand(all);      // מחזיר {score: int[] ...}
          return { player_id: p.id, tuple: padTuple8(ev.score) };
        });

      // קריאת ה-RPC – הוא יבצע Side Pots מלא + חלוקה לשחקנים (chips) ויאפס את הקופה/הימורים
      await supabase.rpc('award_pots_v2', {
        game_uuid: currentGameId,
        rankings_json: rankings
      });

      // חשיפת קלפים לכולם (אופציונלי)
      await supabase.from('casino_players')
        .update({ revealed: true })
        .eq('game_id', currentGameId);

      // רענון תצוגה
      await loadGameData();

      // מסר ידידותי: בחר את הזוכה (או הזוכים) להצגה
      let topWinnersText = '';
      if (rankings.length > 0) {
        const rankedTop = rankings
          .map(r => {
            const p = pls.find(pl => pl.id === r.player_id);
            const all = [...(p.hole_cards || []), ...board5];
            return { p, evalRes: evaluateHand(all) };
          })
          .sort((a, b) => compareRankTuple(b.evalRes.score, a.evalRes.score));

        const bestScore = rankedTop[0].evalRes.score;
        const winners = rankedTop.filter(r => compareRankTuple(r.evalRes.score, bestScore) === 0);

        topWinnersText = winners.map(w => `${w.p.player_name} (${w.evalRes.name})`).join(' & ');
      }

      // UI
      setGameMessage(`🏆 Pots settled. ${topWinnersText ? 'Winners: ' + topWinnersText : ''}`);
      setWinnerModal({ open: true, text: "🏆 Side pots settled", hand: topWinnersText, pot: (gNow.pot || 0) });

      await supabase.from('casino_games').update({
        status: GAME_STATUS.FINISHED,
        round: "showdown",
        community_visible: 5,
        current_bet: 0
      }).eq("id", currentGameId);

      // התחל יד חדשה
      setTimeout(() => {
        setWinnerModal({ open: false, text: "", hand: "", pot: 0 });
        startNewHand();
      }, 5000);

    } catch (err) {
      console.error("Error determining winner:", err);
    }
  };

  // Timeout arbiter - force fold if player exceeded deadline
  async function forceTimeoutFold() {
    const { data: g } = await supabase.from('casino_games').select('*').eq('id', currentGameId).single();
    if (!g || g.status !== GAME_STATUS.PLAYING) return;

    // אם לא עבר הדדליין – אל תתערב
    const deadline = g.turn_deadline ? new Date(g.turn_deadline).getTime() : 0;
    if (!deadline || Date.now() <= deadline) return;

    const { data: pls } = await supabase
      .from('casino_players').select('*').eq('game_id', currentGameId).order('seat_index');

    const curIdx = pls.findIndex(p => p.seat_index === (g.current_player_seat ?? pls[0]?.seat_index));
    const cur = curIdx >= 0 ? pls[curIdx] : null;
    if (!cur) return;

    // קפל את הנוכחי
    await supabase.from('casino_players')
      .update({ status: PLAYER_STATUS.FOLDED, last_action: 'timeout_fold', current_bet: cur.current_bet || 0 })
      .eq('id', cur.id);

    // חשב מי הבא שיכול לפעול
    const canAct = (p) => p.status !== PLAYER_STATUS.FOLDED && p.status !== PLAYER_STATUS.ALL_IN;
    let nextIdx = ((curIdx >= 0 ? curIdx : 0) + 1) % pls.length;
    while (pls[nextIdx] && !canAct(pls[nextIdx])) {
      nextIdx = (nextIdx + 1) % pls.length;
      if (nextIdx === (curIdx >= 0 ? curIdx : 0)) break;
    }

    // אם נשאר שחקן יחיד → סיים
    const stillIn = (pls || []).filter(p => p.status !== PLAYER_STATUS.FOLDED);
    if (stillIn.length <= 1) {
      await supabase.from('casino_games').update({
      current_player_seat: pls[nextIdx]?.seat_index ?? null
      }).eq('id', currentGameId);
      await determineWinner();
      return;
    }

    // עדכן תור + דדליין חדש
    await supabase.from('casino_games').update({
      current_player_seat: pls[nextIdx]?.seat_index ?? null,
      turn_deadline: new Date(Date.now() + BETTING_TIME_LIMIT).toISOString()
    }).eq('id', currentGameId);
  }

  // Start new hand — seat-true dealer, include all table players with chips > 0
  const startNewHand = async () => {
    if (!currentTableId) return;

    try {
      const deck = shuffleDeck(createDeck());

      // 1) טען את כל היושבים בשולחן (לא לפי game_id!)
      const { data: tablePlayers } = await supabase
        .from('casino_players')
        .select('*')
        .eq('table_id', currentTableId)
        .order('seat_index');

      // משחקים רק מי שיש להם צ'יפים
      const participants = (tablePlayers || []).filter(p => (p.chips || 0) > 0);
      if (participants.length < 2) {
        await supabase.from('casino_games').update({
          status: GAME_STATUS.WAITING,
          round: 'preflop',
          pot: 0,
          current_bet: 0,
          community_cards: [],
          community_visible: 0
        }).eq('id', currentGameId);
        return;
      }

      // 2) כל המשתתפים מקבלים game_id של היד הנוכחית
      await supabase.from('casino_players')
        .update({ game_id: currentGameId })
        .in('id', participants.map(p => p.id));

      // 3) בחר כיסא דילר חדש:
      //    game.dealer_index מחזיק את "כיסא הדילר" של היד הקודמת (seat_index),
      //    אם לא קיים – קח את הכיסא הנמוך ביותר.
      const prevDealerSeat = typeof game?.dealer_index === 'number'
        ? game.dealer_index : (participants[0]?.seat_index || 0);
      const dealerSeat = nextSeat(seatRing(participants), prevDealerSeat);

      // 4) סדר לפי seat_index, חשב עמדות
      const playersSorted = [...participants].sort((a,b)=>a.seat_index - b.seat_index);
      const pos = computePreflopPositions(playersSorted, dealerSeat);

      // 5) חלק קלפים ואפס סטטוסים/השקעה
      const updated = playersSorted.map((p, idx) => ({
        ...p,
        hole_cards: [deck[idx*2], deck[idx*2+1]],
        current_bet: 0,
        status: PLAYER_STATUS.ACTIVE,
        revealed: false,
        hand_invested: 0,
      }));

      // 6) פוסט בליינדים
      const sb = updated[pos.smallBlindIdx];
      const bb = updated[pos.bigBlindIdx];

      sb.current_bet = Math.min(selectedTable.small_blind, sb.chips);
      sb.chips      -= sb.current_bet;
      sb.hand_invested = sb.current_bet;

      bb.current_bet = Math.min(selectedTable.big_blind, bb.chips);
      bb.chips      -= bb.current_bet;
      bb.hand_invested = bb.current_bet;

      // כתיבה ל־DB
      for (const p of updated) {
        await supabase.from('casino_players').update({
          game_id: currentGameId,
          hole_cards: p.hole_cards,
          current_bet: p.current_bet,
          chips: p.chips,
          status: p.status,
          revealed: p.revealed,
          hand_invested: p.hand_invested
        }).eq('id', p.id);
      }

      const pot = updated.reduce((s, p) => s + (p.current_bet || 0), 0);
      const currentBet = Math.max(...updated.map(p => p.current_bet || 0), 0);

      // NB: dealer_index ישמור את *seat_index* של הדילר, לא אינדקס מערך
      await supabase.from('casino_games').update({
        status: GAME_STATUS.PLAYING,
        deck,
        pot,
        current_bet: currentBet,
        last_raise_to: currentBet,
        round: 'preflop',
        community_cards: [],
        community_visible: 0,
        dealer_index: dealerSeat,                    // ⬅️ seat_index
        last_raiser_seat: playersSorted[pos.bigBlindIdx].seat_index,
        current_player_seat: playersSorted[pos.firstToActIdx].seat_index,
        turn_deadline: new Date(Date.now() + BETTING_TIME_LIMIT).toISOString()
      }).eq('id', currentGameId);

      await loadGameData();
    } catch (err) {
      console.error('Error starting new hand (seat-based):', err);
    }
  };

  // ============================================================================
  // RENDER SCREENS
  // ============================================================================

  if (!mounted) {
    const mySeatLocal = players.find(p => p.id === playerId)?.seat_index;
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={0}
      >
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="text-white text-xl">Loading...</div>
        </div>

        {/* Bottom Utility Bar: BACK / FULL */}
        <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)" }}>
            <div className="flex items-center justify-between gap-2 pointer-events-auto">
              <button onClick={() => router.push('/arcade')} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title="Back to Arcade">BACK</button>
              <button onClick={toggleFullscreen} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>{isFullscreen ? 'EXIT' : 'FULL'}</button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ============================================================================
  // LOBBY SCREEN
  // ============================================================================

  if (screen === "lobby") {
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={vaultAmount}
      >
        <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-indigo-900 via-black to-purple-900" style={{ height: 'var(--app-100vh, 100svh)' }}>
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '30px 30px'
            }} />
          </div>

          {/* Top HUD Bar */}
          <div ref={headerRef} className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
            <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
              {/* Left: BACK */}
              <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
                <button
                  onClick={() => router.push('/arcade')}
                  className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
                  title="Back to Arcade"
                >
                  BACK
                </button>
              </div>

              {/* Right: FULL */}
              <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
                <button
                  onClick={toggleFullscreen}
                  className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                >
                  {isFullscreen ? 'EXIT' : 'FULL'}
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="relative w-full h-full flex flex-col items-center justify-start px-4 pt-[calc(var(--head-h,0px)+12px)] pb-4">
            <div className="text-center mb-4">
              <h1 className="text-xl md:text-2xl font-bold text-white mb-1">🃏 Texas Hold'em</h1>
              <p className="text-white/70 text-sm md:text-base">Join a table and start playing!</p>
            </div>

            {/* Player Info */}
            <div ref={metersRef} className="w-full max-w-[14rem] md:max-w-xs mb-2">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-2.5 md:p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white font-semibold">Your Balance:</div>
                  <div className="text-emerald-400 text-base md:text-lg font-bold">{fmt(vaultAmount)} MLEO</div>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter your name..."
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs md:text-sm rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
                    maxLength={20}
                  />
                </div>
                
                {error && (
                  <div className="mt-2 text-red-400 text-sm">{error}</div>
                )}
              </div>
            </div>

            {/* Tables Grid - horizontal grid of compact cards */}
            <div ref={listRef} className="w-full max-w-6xl grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-2 overflow-y-auto pr-1" style={{ maxHeight: 'calc(var(--lobby-list-h, 70vh) + 16vh)' }}>
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-2.5 md:p-3 hover:border-purple-400/50 transition-all"
                >
                  <div className="space-y-1">
                    <div className="text-sm md:text-base font-bold text-white">🃏 {table.name}</div>
                    <div className="text-white/70 text-xs">
                      Min Buy-in: <span className="text-emerald-400 font-semibold">{fmt(table.min_buyin)} MLEO</span>
                    </div>
                    <div className="text-white/70 text-xs">
                      Blinds: <span className="text-amber-400">{fmt(table.small_blind)}</span> / <span className="text-amber-400">{fmt(table.big_blind)}</span>
                    </div>

                    {/* Player indicators (tiny leds) */}
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      {Array.from({ length: table.max_players }).map((_, i) => (
                        <span
                          key={i}
                          className={`block rounded-full ${i < table.current_players ? 'bg-emerald-400' : 'bg-white/15'} w-2 h-2 md:w-2.5 md:h-2.5`}
                          title={i < table.current_players ? 'occupied' : 'empty'}
                        />
                      ))}
                      <span className="ml-auto text-white/50 text-[10px]">{table.current_players}/{table.max_players}</span>
                    </div>

                    <button
                      onClick={() => handleJoinTable(table)}
                      disabled={table.current_players >= table.max_players || vaultAmount < table.min_buyin}
                      className={`w-full px-2 py-1.5 md:px-3 md:py-1.5 rounded-lg font-bold text-xs md:text-sm transition-all ${
                        table.current_players >= table.max_players || vaultAmount < table.min_buyin
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:scale-105'
                      }`}
                    >
                      {table.current_players >= table.max_players ? 'FULL' : 'JOIN TABLE'}
                    </button>
                  </div>
                </div>
              ))}
              
              {tables.length === 0 && (
                <div className="text-center py-12 text-white/50">
                  <div className="text-4xl mb-3">🎴</div>
                  <div>No tables available. Please check back later.</div>
                </div>
              )}
            </div>

            {/* Bottom Controls - match Coin Flip style (colors/sizes) */}
            <div className="w-full max-w-6xl mt-2 grid grid-cols-3 gap-2">
              <button
                onClick={() => setShowHowToPlay(true)}
                className="py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all"
              >
                How to Play
              </button>
              <button
                onClick={() => setShowStats(true)}
                className="py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all"
              >
                Stats
              </button>
              <button
                onClick={() => setShowVaultModal(true)}
                className="py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all"
              >
                💰 Vault
              </button>
            </div>

            {/* Admin Controls */}
            {isAdmin && (
              <div ref={ctaRef} className="mt-3 text-center w-full max-w-4xl">
                <button
                  onClick={resetAllTables}
                  className="px-4 py-2 md:px-6 md:py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all mr-2 md:mr-4"
                >
                  🔄 Reset All Tables
                </button>
                <button
                  onClick={async () => {
                    await cleanupInactivePlayers();
                    await cleanupEmptyGames();
                    loadTables();
                    setError("Cleanup completed!");
                  }}
                  className="px-4 py-2 md:px-6 md:py-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold transition-all"
                >
                  🧹 Cleanup Now
                </button>
              </div>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // ============================================================================
  // TABLE SCREEN (Waiting for game to start)
  // ============================================================================

  if (screen === "table") {
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={vaultAmount}
      >
        <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-indigo-900 via-black to-purple-900" style={{ height: 'var(--app-100vh, 100svh)' }}>
          {/* HEADER */}
          <div ref={headerRef} className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
            <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
              <div className="flex items-center justify-between gap-2 pointer-events-auto">
                <button onClick={() => router.push('/arcade')} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title="Back to Arcade">BACK</button>
                <div className="text-white font-extrabold text-lg truncate">🃏 {selectedTable?.name}</div>
                <button onClick={toggleFullscreen} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>{isFullscreen ? 'EXIT' : 'FULL'}</button>
              </div>
            </div>
          </div>

          {/* BODY */}
          <div className="relative w-full h-full flex flex-col items-center justify-start pt-[calc(var(--head-h,0px)+8px)] px-2 pb-3">
            <div ref={metersRef} className="w-full max-w-2xl bg-black/40 rounded-xl p-4 backdrop-blur-sm border border-white/10 mb-2 text-center">
              <div className="text-white/70">Blinds: {fmt(selectedTable?.small_blind)} / {fmt(selectedTable?.big_blind)}</div>
              <div className="text-white/50 text-sm">Waiting for players to join...</div>
            </div>

            <div className="w-full max-w-2xl overflow-y-auto" style={{ maxHeight: 'var(--table-area-h, 60vh)' }}>
              <div className="space-y-2 mb-2">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg flex items-center justify-between ${
                      player.id === playerId ? 'bg-purple-500/30 border border-purple-400' : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-base md:text-2xl">{player.id === playerId ? '👑' : '👤'}</div>
                      <div>
                        <div className="text-white font-semibold">{player.player_name}{player.id === playerId && ' (You)'}</div>
                        <div className="text-white/50 text-sm">Seat #{player.seat_index + 1}</div>
                      </div>
                    </div>
                    <div className="text-emerald-400 font-bold">{fmt(player.chips)} chips</div>
                  </div>
                ))}
              </div>

              <div className="text-center text-white/70 mb-2">
                {players.length < 2 ? (
                  <div className="text-amber-400">⏳ Waiting for at least 2 players to start...</div>
                ) : (
                  <div className="text-emerald-400">✅ Ready to play! Game will start soon...</div>
                )}
              </div>
            </div>

            <div ref={ctaRef} className="w-full max-w-2xl mt-2 text-center">
              <button onClick={handleLeaveTable} className="px-8 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all">Leave Table</button>
            </div>
          </div>

          
        </div>
      </Layout>
    );
  }

  // ============================================================================
  // GAME SCREEN (Active poker game)
  // ============================================================================

  if (screen === "game") {
    const myIndex = players.findIndex(p => p.id === playerId);
    const mySeatInRender = myIndex >= 0 ? players[myIndex]?.seat_index : null;
    const isMyTurn = !!(game && mySeatInRender != null && game.current_player_seat === mySeatInRender);
    const communityCards = game?.community_cards || [];
    const visibleCards = communityCards.slice(0, game?.community_visible || 0);
    
    // Debug logging
    console.log("Game Debug:", {
      gameStatus: game?.status,
      gameRound: game?.round,
      currentPlayerSeat: game?.current_player_seat,
      myPlayerId: playerId,
      myPlayerStatus: myPlayer?.status,
      isMyTurn,
      playersCount: players.length
    });
    
    return (
      <Layout
        address={address}
        isConnected={isConnected}
        openConnectModal={openConnectModal}
        openAccountModal={openAccountModal}
        disconnect={disconnect}
        vaultAmount={vaultAmount}
      >
        <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-indigo-900 via-black to-purple-900" style={{ height: 'var(--app-100vh, 100svh)' }}>
          {/* HEADER */}
          <div ref={headerRef} className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
            <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
              <div className="flex items-center justify-between gap-2 pointer-events-auto">
                <button onClick={() => router.push('/arcade')} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title="Back to Arcade">BACK</button>
                <div className="text-center flex-1">
                  <div className="text-white font-extrabold text-lg truncate">🃏 {selectedTable?.name}</div>
                  <div className="text-white/60 text-xs">Round: {game?.round || 'preflop'} | Pot: {fmt(game?.pot || 0)} MLEO</div>
                </div>
                <button onClick={toggleFullscreen} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>{isFullscreen ? 'EXIT' : 'FULL'}</button>
              </div>
            </div>
          </div>

          {/* BODY */}
          <div className="relative w-full h-full flex flex-col items-center justify-start pt-[calc(var(--head-h,0px)+8px)] px-2 pb-3">
            <div ref={metersRef} className="w-full max-w-6xl bg-black/30 rounded-xl p-3 mb-2 backdrop-blur-sm border border-white/10 text-center">
              <div className="text-white/70 text-xs">Round: {game?.round || 'preflop'} • Current bet: {fmt(game?.current_bet || 0)}</div>
            </div>

            {/* Leave Table button (moved from header) */}
            <div className="w-full max-w-6xl text-right mb-2">
              <button onClick={handleLeaveTable} className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold">Leave Table</button>
            </div>

            {/* GAME AREA */}
            <div className="w-full max-w-6xl overflow-hidden" style={{ maxHeight: 'var(--table-area-h, 60vh)' }}>
              <div className="bg-green-900/50 backdrop-blur-sm border-4 border-amber-400 rounded-full aspect-[2/1] relative p-8">
                {/* Community Cards */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <div className="text-center">
                    <div className="text-white/70 text-sm mb-3">Community Cards</div>
                    <div className="flex justify-center gap-2">
                      {visibleCards.map((card, idx) => (
                        <PlayingCard key={idx} card={card} delay={idx * 100} />
                      ))}
                      {Array.from({ length: 5 - visibleCards.length }).map((_, idx) => (
                        <div key={idx} className="w-10 h-14 rounded bg-white/10 border border-white/20 flex items-center justify-center">?</div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Players positioned around the table */}
                <div className="absolute inset-0">
                  {players.map((player, idx) => {
                    const isCurrentPlayer = game?.current_player_seat === player.seat_index;
                    const isMe = player.id === playerId;
                    const angle = (idx * 360) / players.length;
                    const radius = 40;
                    const x = 50 + radius * Math.cos((angle - 90) * Math.PI / 180);
                    const y = 50 + radius * Math.sin((angle - 90) * Math.PI / 180);
                    return (
                      <div
                        key={player.id}
                        className={`absolute transform -translate-x-1/2 -translate-y-1/2 p-3 rounded-lg border-2 transition-all ${
                          isCurrentPlayer ? 'border-yellow-400 bg-yellow-400/20' : (isMe ? 'border-purple-400 bg-purple-400/20' : 'border-white/20 bg-white/5')
                        }`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                      >
                        <div className="text-center">
                          <div className="text-white font-bold text-sm mb-1">{player.player_name}{isMe && ' (You)'}{isCurrentPlayer && ' 👑'}</div>
                          <div className="text-emerald-400 text-xs mb-2">{fmt(player.chips)} chips</div>
                          {player.current_bet > 0 && (<div className="text-amber-400 text-xs">Bet: {fmt(player.current_bet)}</div>)}
                          {player.status === 'folded' && (<div className="text-red-400 text-xs">FOLDED</div>)}
                          {player.status === 'all_in' && (<div className="text-orange-400 text-xs">ALL IN</div>)}
                        </div>
                        {player.hole_cards && isMe && (
                          <div className="flex justify-center gap-1 mt-2">
                            {player.hole_cards.map((card, cardIdx) => (
                              <PlayingCard key={cardIdx} card={card} delay={cardIdx * 100} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* CTA / Actions */}
            <div ref={ctaRef} className="w-full max-w-6xl mt-2">
              {isMyTurn && myPlayer?.status !== PLAYER_STATUS.FOLDED && game?.status === GAME_STATUS.PLAYING && game?.round !== 'finished' && game?.round !== 'showdown' && !winnerModal.open && (
                <div className="text-center">
                  <div className="text-white/70 text-sm mb-2">Your Turn {timeLeft > 0 && `(${timeLeft}s)`}</div>
                  <div className="flex justify-center gap-3 flex-wrap">
                    <button onClick={() => handlePlayerAction('fold')} className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all">FOLD</button>
                    <button onClick={() => handlePlayerAction(game?.current_bet > (myPlayer?.current_bet || 0) ? 'call' : 'check')} className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all">{game?.current_bet > (myPlayer?.current_bet || 0) ? 'CALL' : 'CHECK'}</button>
                    <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                      <input type="range" min={(game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)} max={getMaxRaiseTo(myPlayer)} step={selectedTable?.big_blind || 1} value={raiseTo || ((game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0))} onChange={(e) => setRaiseTo(Number(e.target.value))} className="w-40" />
                      <input type="number" className="w-24 bg-black/40 border border-white/20 rounded px-2 py-1 text-white" value={raiseTo ?? ''} min={(game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)} max={getMaxRaiseTo(myPlayer)} step={selectedTable?.big_blind || 1} onChange={(e) => setRaiseTo(Math.min(Math.max(Number(e.target.value) || 0, (game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)), getMaxRaiseTo(myPlayer)))} />
                      <button onClick={() => handlePlayerAction('raise', raiseTo || ((game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)))} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold">RAISE TO</button>
                    </div>
                    <button onClick={() => handlePlayerAction('allin')} className="px-6 py-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold transition-all">ALL IN</button>
                  </div>
                </div>
              )}

              {/* Winner Modal */}
              {winnerModal.open && (
                <div className="fixed inset-0 z-[11000] bg-black/70 flex items-center justify-center p-4">
                  <div className="bg-zinc-900 text-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center">
                    <div className="text-2xl font-extrabold mb-2">🎉 Hand Result</div>
                    <div className="text-emerald-300 font-semibold">{winnerModal.text}</div>
                    {winnerModal.hand && <div className="text-white/70 text-sm mt-1">{winnerModal.hand}</div>}
                    {winnerModal.pot > 0 && <div className="text-amber-300 mt-2">Pot: {fmt(winnerModal.pot)}</div>}
                    <div className="text-xs text-white/50 mt-3">Starting next hand...</div>
                    <button onClick={() => setWinnerModal({ open: false, text: '', hand: '', pot: 0 })} className="mt-4 w-full py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">OK</button>
                  </div>
                </div>
              )}

              {game?.status === 'finished' && (
                <div className="text-center text-white/70">
                  <div className="text-2xl mb-2">🎉</div>
                  <div>Hand finished! Starting new hand...</div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Utility Bar: BACK / FULL */}
          <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
            <div className="relative px-2 py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)" }}>
              <div className="flex items-center justify-between gap-2 pointer-events-auto">
                <button onClick={() => router.push('/arcade')} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title="Back to Arcade">BACK</button>
                <button onClick={toggleFullscreen} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>{isFullscreen ? 'EXIT' : 'FULL'}</button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return null;
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
@keyframes slideInCard {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

