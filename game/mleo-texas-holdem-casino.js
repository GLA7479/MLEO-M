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
  const [sfxMuted, setSfxMuted] = useState(false);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gameMessage, setGameMessage] = useState("");
  const [actionTimer, setActionTimer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [winnerModal, setWinnerModal] = useState({ open: false, text: "", hand: "", pot: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [raiseTo, setRaiseTo] = useState(null);

  useEffect(() => {
    setMounted(true);
    setVaultAmount(getVault());
    
    // Check if user is admin
    setIsAdmin(address === "0x39846ebBA723e440562a60f4B4a0147150442c7b");
  }, [address]);

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
            .select('*', { count: 'exact', head: true })
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
        .select('*', { count: 'exact', head: true })
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
      
      // If no players left, clean up the game
      if (!remainingPlayers || remainingPlayers.length === 0) {
        await cleanupFinishedGame();
      }
      
      // Reset state
      setPlayerId(null);
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
    
    const playersChannel = supabase
      .channel(`table_${currentTableId}_players`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casino_players', filter: `table_id=eq.${currentTableId}` },
        () => loadTableData()
      )
      .subscribe();
    
    return () => {
      playersChannel.unsubscribe();
    };
  }, [currentTableId, screen]);

  // Auto-start game when 2+ players
  useEffect(() => {
    if (players.length >= 2 && !currentGameId) {
      startGame();
    }
  }, [players.length, currentGameId]);

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
      const isMyTurn = game.current_player_index === players.findIndex(p => p.id === playerId);
      if (isMyTurn && myPlayer.status !== PLAYER_STATUS.FOLDED && game.status === GAME_STATUS.PLAYING) {
        startActionTimer(playerId);
      } else {
        stopActionTimer();
      }
    }
  }, [game?.current_player_index, myPlayer?.status, game?.status, players, playerId, screen]);

  // Update raiseTo when game state changes
  useEffect(() => {
    if (!game || !myPlayer || screen !== "game") return;
    const minSize = getMinRaiseSize(game, selectedTable?.big_blind || 0);
    const minTo = (game?.current_bet || 0) + minSize;
    const maxTo = getMaxRaiseTo(myPlayer);
    setRaiseTo(Math.min(Math.max(minTo, myPlayer?.current_bet || 0), maxTo));
  }, [game?.current_bet, game?.last_raise_to, myPlayer?.chips, myPlayer?.current_bet, screen, selectedTable?.big_blind]);

  const loadTableData = async () => {
    if (!currentTableId) return;
    
    try {
      const { data: playersData } = await supabase
        .from('casino_players')
        .select('*')
        .eq('table_id', currentTableId)
        .order('seat_index', { ascending: true });
      
      setPlayers(playersData || []);
      
      if (playerId) {
        const me = playersData?.find(p => p.id === playerId);
        setMyPlayer(me);
      }
    } catch (err) {
      console.error("Error loading table data:", err);
    }
  };

  const loadGameData = async () => {
    if (!currentGameId) return;
    
    try {
      const { data: gameData } = await supabase
        .from('casino_games')
        .select('*')
        .eq('id', currentGameId)
        .single();
      
      const { data: playersData } = await supabase
        .from('casino_players')
        .select('*')
        .eq('game_id', currentGameId)
        .order('seat_index', { ascending: true });
      
      setGame(gameData);
      setPlayers(playersData || []);
      
      if (playerId) {
        const me = playersData?.find(p => p.id === playerId);
        setMyPlayer(me);
      }
    } catch (err) {
      console.error("Error loading game data:", err);
    }
  };

  // Start a new game
  const startGame = async () => {
    if (!currentTableId || players.length < 2) return;
    
    try {
      // 1) אם כבר יש current_game_id על הטבלה – מצטרפים אליו
      const { data: tbl, error: tableError } = await supabase
        .from('casino_tables')
        .select('id,current_game_id,small_blind,big_blind,min_buyin')
        .eq('id', currentTableId)
        .single();
      
      if (tableError) {
        console.error("Error loading table:", tableError);
        setError("Failed to load table: " + tableError.message);
        return;
      }
      
      if (tbl && tbl.current_game_id) {
        setCurrentGameId(tbl.current_game_id);
        setScreen('game');
        await loadGameData();
        return;
      }

      const deck = shuffleDeck(createDeck());
      
      // Create new game
      const n = players.length;
      const dealerIndex = 0;                       // יד ראשונה – דילר 0
      const smallBlindIdx = (dealerIndex + 1) % n;
      const bigBlindIdx   = (dealerIndex + 2) % n;
      const firstToAct    = (bigBlindIdx + 1) % n; // תמיד משמאל ל-BB

      const { data: newGame, error: gameError } = await supabase
        .from('casino_games')
        .insert({
          table_id: currentTableId,
          status: 'playing',
          deck: deck,
          round: 'preflop',
          dealer_index: dealerIndex,
          current_player_index: firstToAct,
          last_raiser_index: bigBlindIdx
        })
        .select()
        .single();
      
      if (gameError) throw gameError;
      
      // 2) CAS: קובעים שהטבלה "תופסת" את המשחק הזה – רק אם עדיין לא נקבע
      const { data: lock } = await supabase
        .from('casino_tables')
        .update({ current_game_id: newGame.id })
        .eq('id', currentTableId)
        .is('current_game_id', null)
        .select('current_game_id');
      
      // אם לא הצליח (מישהו הקדים אותנו) – מביאים את ה-id הקיים ומצטרפים אליו
      if (!lock || !lock.length) {
        const { data: t2, error: t2Err } = await supabase
          .from('casino_tables')
          .select('current_game_id')
          .eq('id', currentTableId)
          .single();
        
        if (t2Err || !t2?.current_game_id) {
          // fallback: נטוש את הניסיון ונאפשר ל-loadGameData להדביק
          console.warn('No current_game_id on table (lock lost).', t2Err);
          return;
        }
        setCurrentGameId(t2.current_game_id);
        setScreen('game');
        await loadGameData();
        return;
      }
      
      // Deal cards – **אל תשנה chips** כאן! משאירים את היתרה הקיימת
      const updatedPlayers = players.map((p, idx) => {
        const card1 = deck[idx * 2];
        const card2 = deck[idx * 2 + 1];
        
        return {
          ...p,
          game_id: newGame.id,
          hole_cards: [card1, card2],
          current_bet: 0,
          status: 'active'
          // chips: p.chips // שומרים כמות קיימת
        };
      });
      
      // Post blinds
      updatedPlayers[smallBlindIdx].current_bet = Math.min(selectedTable.small_blind, updatedPlayers[smallBlindIdx].chips);
      updatedPlayers[smallBlindIdx].chips -= updatedPlayers[smallBlindIdx].current_bet;
      updatedPlayers[smallBlindIdx].hand_invested = (updatedPlayers[smallBlindIdx].hand_invested || 0) + updatedPlayers[smallBlindIdx].current_bet;
      
      updatedPlayers[bigBlindIdx].current_bet = Math.min(selectedTable.big_blind, updatedPlayers[bigBlindIdx].chips);
      updatedPlayers[bigBlindIdx].chips -= updatedPlayers[bigBlindIdx].current_bet;
      updatedPlayers[bigBlindIdx].hand_invested = (updatedPlayers[bigBlindIdx].hand_invested || 0) + updatedPlayers[bigBlindIdx].current_bet;
      
      // Update players in database
      for (const player of updatedPlayers) {
        await supabase
          .from('casino_players')
          .update({
            game_id: player.game_id,
            hole_cards: player.hole_cards,
            current_bet: player.current_bet,
            status: player.status,
            chips: player.chips,
            hand_invested: player.hand_invested || 0
          })
          .eq('id', player.id);
      }
      
      // Update game with pot and current bet
      const pot = updatedPlayers.reduce((sum, p) => sum + p.current_bet, 0);
      const currentBet = Math.max(...updatedPlayers.map(p => p.current_bet || 0), 0);
      
      await supabase
        .from('casino_games')
        .update({
          pot: pot,
          current_bet: currentBet,
          last_raise_to: currentBet,         // ⬅️ חדש: גובה ההעלאה האחרון (BB בתחילת פרה-פלופ)
          current_player_index: firstToAct,
          last_raiser_index: bigBlindIdx,    // האגרסור בתחילת פרה-פלופ = BB
          community_cards: [],
          community_visible: 0
        })
        .eq('id', newGame.id);
      
      // ורק עכשיו מעבירים למסך המשחק – אחרי שכל הנתונים כתובים בבסיס
      setCurrentGameId(newGame.id);
      setScreen("game");
      await loadGameData();
      
    } catch (err) {
      console.error("Error starting game:", err);
      setError("Failed to start game: " + err.message);
    }
  };

  const handlePlayerAction = async (action, amount = 0) => {
    if (!game || !playerId) return;
    if (game.status !== GAME_STATUS.PLAYING || game.round === "finished") return;

    try {
      // 1) תמונת מצב עדכנית
      const { data: gNow } = await supabase
        .from('casino_games').select('*').eq('id', currentGameId).single();
      const { data: pNow } = await supabase
        .from('casino_players').select('*').eq('game_id', currentGameId).order('seat_index');

      const pls = pNow || players;
      const curIdx = gNow.current_player_index ?? 0;
      const cur    = pls[curIdx];
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
      const newLastRaiserIndex = didRaise ? curIdx : (gNow.last_raiser_index ?? curIdx);
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
          pot, current_bet: currentBet, current_player_index: nextIdx
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
      const reachedAggressor = nextIdx === newLastRaiserIndex;
      const moreThanOneCanAct = activeNotFolded.filter(canAct).length > 1;
      const bettingDone = (!moreThanOneCanAct) || (everyoneMatched && reachedAggressor);

      stopActionTimer();

      if (!bettingDone) {
        // ממשיכים להמר באותו רחוב
        await supabase.from('casino_games').update({
          pot,
          current_bet: currentBet,
          last_raiser_index: newLastRaiserIndex,
          last_raise_to: newLastRaiseTo,
          current_player_index: nextIdx
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

      // הראשון לפעולה ברחוב הבא: לשמאל הדילר
      const dealerIndex = gNow.dealer_index ?? 0;
      let startIdx = (dealerIndex + 1) % freshPlayers.length;
      while (freshPlayers[startIdx].status === PLAYER_STATUS.FOLDED || freshPlayers[startIdx].status === PLAYER_STATUS.ALL_IN) {
        startIdx = (startIdx + 1) % freshPlayers.length;
      }

      // עדכון משחק לרחוב הבא:
      // בפלופ/טרן/ריבר current_bet=0 ואין אגרסור עד שתהיה העלאה → last_raiser_index=startIdx, last_raise_to=0
      await supabase.from('casino_games').update({
        pot,
        current_bet: 0,
        last_raise_to: 0,
        last_raiser_index: startIdx,
        round: nextRound,
        community_cards: nextCommunity,
        community_visible: getCommunityVisible(nextRound),
        current_player_index: startIdx
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

        // 1) הוסף את הקופה לצ'יפים של המנצח בטבלה
        await supabase.from('casino_players')
          .update({ chips: (w.chips || 0) + potAmount })
          .eq('id', w.id);

        // אפס הימורים של כולם
        await supabase.from('casino_players')
          .update({ current_bet: 0 })
          .eq('game_id', currentGameId);

        // 2) עדכן את המשחק
        await supabase.from('casino_games').update({
          status: GAME_STATUS.FINISHED,
          round: "showdown",
          current_bet: 0,
          pot: 0,                            // ⬅️ אפס את הקופה
          community_visible: 5,
        }).eq("id", currentGameId);

        // UI
        setGameMessage(`🎉 ${w.player_name} wins by fold! Pot: ${fmt(potAmount)} MLEO`);
        setWinnerModal({ open: true, text: `🎉 ${w.player_name} wins by fold!`, hand: "", pot: potAmount });

        // התחל יד חדשה...
        setTimeout(() => {
          setWinnerModal({ open: false, text: "", hand: "", pot: 0 });
          startNewHand();
        }, 5000);
        setTimeout(() => { cleanupFinishedGame(); }, 30000);
        return;
      }

      // --- SHOWDOWN מלא ---
      // וודא שהלוח הוא 5 קלפים:
      const board5 = (gNow.community_cards || []).slice(0, 5);

      // גלה קלפים לכולם
      await supabase.from('casino_players')
        .update({ revealed: true })
        .eq("game_id", currentGameId);

      // בצע חלוקת סייד-פוטים:
      const { pots, chipIncrements } = await settleSidePots(currentGameId, gNow.dealer_index || 0, board5);

      // מסר ידידותי: בחר את הזוכה (או הזוכים) של הפוט העליון להצגה
      let topWinnersText = '';
      if (pots.length > 0) {
        const topPot = pots[pots.length - 1];
        const { data: elig } = await supabase
          .from('casino_players')
          .select('id,player_name,seat_index,hole_cards,hand_invested,status')
          .in('id', topPot.eligibleIds);

        const rankedTop = (elig || []).map(p => {
          const all = [...(p.hole_cards || []), ...board5];
          return { p, evalRes: evaluateHand(all) };
        }).sort((a, b) => compareRankTuple(b.evalRes.score, a.evalRes.score));

        const bestScore = rankedTop[0].evalRes.score;
        const winners = rankedTop.filter(r => compareRankTuple(r.evalRes.score, bestScore) === 0);

        topWinnersText = winners.map(w => `${w.p.player_name} (${w.evalRes.name})`).join(' & ');
      }

      // UI
      setGameMessage(`🏆 Pots settled. ${topWinnersText ? 'Top pot: ' + topWinnersText : ''}`);
      setWinnerModal({ open: true, text: "🏆 Side pots settled", hand: topWinnersText, pot: (gNow.pot || 0) });

      // התחל יד חדשה ואח״כ ניקוי
      setTimeout(() => {
        setWinnerModal({ open: false, text: "", hand: "", pot: 0 });
        startNewHand();
      }, 5000);

      // Clean up finished game after 30 seconds
      setTimeout(() => {
        cleanupFinishedGame();
      }, 30000);

    } catch (err) {
      console.error("Error determining winner:", err);
    }
  };

  // Start new hand
  const startNewHand = async () => {
    if (!currentTableId || players.length < 2) return;
    
    try {
      const deck = shuffleDeck(createDeck());
      
      // כשפותחים יד חדשה, קח את השחקנים מהדאטהבייס (ייתכן שה־state המקומי לא מסונכרן אחרי חלוקת הקופה)
      const { data: freshPlayers } = await supabase
        .from('casino_players').select('*')
        .eq('game_id', currentGameId).order('seat_index');
      const n = (freshPlayers?.length) || players.length;
      
      // איפוס hand_invested לכולם בתחילת יד חדשה
      await supabase.from('casino_players')
        .update({ hand_invested: 0 })
        .eq('game_id', currentGameId);
      
      // Compute positions for the new hand (MUST be before using them)
      const dealerIndex   = ((game?.dealer_index ?? -1) + 1) % n;
      const smallBlindIdx = (dealerIndex + 1) % n;
      const bigBlindIdx   = (dealerIndex + 2) % n;
      const startIdx      = (bigBlindIdx + 1) % n; // first to act preflop
      
      // Reset players
      const base = freshPlayers || players;
      const updatedPlayers = base.map((p, idx) => {
        const card1 = deck[idx * 2];
        const card2 = deck[idx * 2 + 1];
        
        return {
          ...p,
          hole_cards: [card1, card2],
          current_bet: 0,
          status: PLAYER_STATUS.ACTIVE,
          revealed: false,
          hand_invested: 0
        };
      });
      
      // Post blinds - use the calculated indices
      updatedPlayers[smallBlindIdx].current_bet = Math.min(selectedTable.small_blind, updatedPlayers[smallBlindIdx].chips);
      updatedPlayers[smallBlindIdx].chips -= updatedPlayers[smallBlindIdx].current_bet;
      updatedPlayers[smallBlindIdx].hand_invested = updatedPlayers[smallBlindIdx].current_bet;
      
      updatedPlayers[bigBlindIdx].current_bet = Math.min(selectedTable.big_blind, updatedPlayers[bigBlindIdx].chips);
      updatedPlayers[bigBlindIdx].chips -= updatedPlayers[bigBlindIdx].current_bet;
      updatedPlayers[bigBlindIdx].hand_invested = updatedPlayers[bigBlindIdx].current_bet;
      
      // Update players in database
      for (const player of updatedPlayers) {
        await supabase.from('casino_players').update({
          hole_cards: player.hole_cards,
          current_bet: player.current_bet,
          status: player.status,
          chips: player.chips,
          revealed: player.revealed,
          hand_invested: player.hand_invested || 0
        }).eq('id', player.id);
      }
      
      // Update game
      const pot = updatedPlayers.reduce((sum, p) => sum + p.current_bet, 0);
      const currentBet = Math.max(...updatedPlayers.map(p => p.current_bet));
      
      await supabase.from('casino_games').update({
        status: GAME_STATUS.PLAYING,
        pot: pot,
        current_bet: currentBet,
        last_raise_to: currentBet,           // ⬅️ חדש
        round: 'preflop',
        community_visible: 0,
        community_cards: [],
        deck: deck,
        dealer_index: dealerIndex,
        current_player_index: startIdx,      // (bigBlindIdx + 1) % n
        last_raiser_index: bigBlindIdx       // האגרסור בתחילת פרה-פלופ = BB
      }).eq("id", currentGameId);
      
    } catch (err) {
      console.error("Error starting new hand:", err);
    }
  };

  // ============================================================================
  // RENDER SCREENS
  // ============================================================================

  if (!mounted) {
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
          {/* Header */}
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="text-4xl font-extrabold text-white mb-2">
                🎰 Texas Hold'em Rooms
              </h1>
              <p className="text-white/70">Join a table and play poker with real players!</p>
            </div>

            {/* Player Info */}
            <div className="bg-black/30 rounded-xl p-4 mb-4 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <div className="text-white font-semibold">Your Balance:</div>
                <div className="text-emerald-400 text-xl font-bold">{fmt(vaultAmount)} MLEO</div>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter your name..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400"
                  maxLength={20}
                />
              </div>
              
              {error && (
                <div className="mt-2 text-red-400 text-sm">{error}</div>
              )}
            </div>

            {/* Tables List */}
            <div className="space-y-3">
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="bg-gradient-to-br from-purple-900/50 to-slate-900/50 rounded-xl p-5 backdrop-blur-sm border border-white/10 hover:border-purple-400/50 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">
                        🃏 {table.name}
                      </h3>
                      <div className="text-white/70 text-sm">
                        Min Buy-in: <span className="text-emerald-400 font-semibold">{fmt(table.min_buyin)} MLEO</span>
                      </div>
                      <div className="text-white/70 text-sm">
                        Blinds: <span className="text-amber-400">{fmt(table.small_blind)}</span> / <span className="text-amber-400">{fmt(table.big_blind)}</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-white/70 text-sm mb-2">
                        Players: {table.current_players}/{table.max_players}
                      </div>
                      <div className="flex gap-1 mb-3">
                        {Array.from({ length: table.max_players }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                              i < table.current_players
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white/10 text-white/30'
                            }`}
                          >
                            {i < table.current_players ? '👤' : '▫'}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleJoinTable(table)}
                        disabled={table.current_players >= table.max_players || vaultAmount < table.min_buyin}
                        className={`px-6 py-3 rounded-lg font-bold transition-all ${
                          table.current_players >= table.max_players || vaultAmount < table.min_buyin
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:shadow-lg hover:scale-105'
                        }`}
                      >
                        {table.current_players >= table.max_players ? 'FULL' : 'JOIN TABLE'}
                      </button>
                    </div>
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

            {/* Admin Controls */}
            {isAdmin && (
              <div className="mt-4 text-center">
                <button
                  onClick={resetAllTables}
                  className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all mr-4"
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
                  className="px-6 py-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold transition-all"
                >
                  🧹 Cleanup Now
                </button>
              </div>
            )}

            {/* Back Button */}
            <div className="mt-6 text-center">
              <button
                onClick={() => router.push('/arcade')}
                className="px-8 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
              >
                ← Back to Arcade
              </button>
            </div>
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 flex items-center justify-center">
          <div className="max-w-2xl w-full">
            {/* Table Info */}
            <div className="bg-black/40 rounded-xl p-6 backdrop-blur-sm border border-white/10 mb-4">
              <h2 className="text-2xl font-bold text-white mb-4 text-center">
                🃏 {selectedTable?.name}
              </h2>
              
              <div className="text-white/70 text-center mb-6">
                <div className="mb-2">Blinds: {fmt(selectedTable?.small_blind)} / {fmt(selectedTable?.big_blind)}</div>
                <div>Waiting for players to join...</div>
              </div>

              {/* Players List */}
              <div className="space-y-2 mb-6">
                {players.map((player, idx) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg flex items-center justify-between ${
                      player.id === playerId
                        ? 'bg-purple-500/30 border border-purple-400'
                        : 'bg-white/5 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">
                        {player.id === playerId ? '👑' : '👤'}
                      </div>
                      <div>
                        <div className="text-white font-semibold">
                          {player.player_name}
                          {player.id === playerId && ' (You)'}
                        </div>
                        <div className="text-white/50 text-sm">
                          Seat #{player.seat_index + 1}
                        </div>
                      </div>
                    </div>
                    <div className="text-emerald-400 font-bold">
                      {fmt(player.chips)} chips
                    </div>
                  </div>
                ))}
              </div>

              {/* Game Status */}
              <div className="text-center text-white/70 mb-4">
                {players.length < 2 ? (
                  <div className="text-amber-400">
                    ⏳ Waiting for at least 2 players to start...
                  </div>
                ) : (
                  <div className="text-emerald-400">
                    ✅ Ready to play! Game will start soon...
                  </div>
                )}
              </div>
            </div>

            {/* Leave Button */}
            <div className="text-center">
              <button
                onClick={handleLeaveTable}
                className="px-8 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all"
              >
                Leave Table
              </button>
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
    const isMyTurn = !!(game && myIndex >= 0 && game.current_player_index === myIndex);
    const communityCards = game?.community_cards || [];
    const visibleCards = communityCards.slice(0, game?.community_visible || 0);
    
    // Debug logging
    console.log("Game Debug:", {
      gameStatus: game?.status,
      gameRound: game?.round,
      currentPlayerIndex: game?.current_player_index,
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
          {/* Header */}
          <div className="max-w-6xl mx-auto mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  🃏 {selectedTable?.name}
                </h2>
                <div className="text-white/70 text-sm">
                  Round: {game?.round || 'preflop'} | Pot: {fmt(game?.pot || 0)} MLEO
                </div>
              </div>
              
              <button
                onClick={handleLeaveTable}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all"
              >
                Leave Table
              </button>
            </div>
          </div>

          {/* Game Table */}
          <div className="max-w-6xl mx-auto">
            <div className="bg-gradient-to-br from-green-800 to-green-900 rounded-2xl p-6 shadow-2xl border border-green-600/30">
              
              {/* Community Cards */}
              <div className="text-center mb-8">
                <div className="text-white/70 text-sm mb-3">Community Cards</div>
                <div className="flex justify-center gap-2">
                  {visibleCards.map((card, idx) => (
                    <PlayingCard key={idx} card={card} delay={idx * 100} />
                  ))}
                  {Array.from({ length: 5 - visibleCards.length }).map((_, idx) => (
                    <div key={idx} className="w-10 h-14 rounded bg-white/10 border border-white/20 flex items-center justify-center">
                      ?
                    </div>
                  ))}
                </div>
              </div>

              {/* Players */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {players.map((player, idx) => {
                  const isCurrentPlayer = game?.current_player_index === idx;
                  const isMe = player.id === playerId;
                  
                  return (
                    <div
                      key={player.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isCurrentPlayer
                          ? 'border-yellow-400 bg-yellow-400/20'
                          : isMe
                          ? 'border-purple-400 bg-purple-400/20'
                          : 'border-white/20 bg-white/5'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-white font-bold text-sm mb-1">
                          {player.player_name}
                          {isMe && ' (You)'}
                          {isCurrentPlayer && ' 👑'}
                        </div>
                        
                        <div className="text-emerald-400 text-xs mb-2">
                          {fmt(player.chips)} chips
                        </div>
                        
                        {player.current_bet > 0 && (
                          <div className="text-amber-400 text-xs">
                            Bet: {fmt(player.current_bet)}
                          </div>
                        )}
                        
                        {player.status === 'folded' && (
                          <div className="text-red-400 text-xs">FOLDED</div>
                        )}
                        
                        {player.status === 'all_in' && (
                          <div className="text-orange-400 text-xs">ALL IN</div>
                        )}
                      </div>
                      
                      {/* Player Cards */}
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

              {/* Action Buttons */}
              {isMyTurn && myPlayer?.status !== PLAYER_STATUS.FOLDED && game?.status === GAME_STATUS.PLAYING && game?.round !== "finished" && game?.round !== 'showdown' && !winnerModal.open && (
                <div className="text-center">
                  <div className="text-white/70 text-sm mb-4">
                    Your Turn {timeLeft > 0 && `(${timeLeft}s)`}
                  </div>
                  <div className="flex justify-center gap-3 flex-wrap">
                    <button onClick={() => handlePlayerAction("fold")} className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-all">
                      FOLD
                    </button>

                    <button
                      onClick={() => handlePlayerAction(game?.current_bet > (myPlayer?.current_bet || 0) ? "call" : "check")}
                      className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all"
                    >
                      {game?.current_bet > (myPlayer?.current_bet || 0) ? 'CALL' : 'CHECK'}
                    </button>

                    {/* RAISE CONTROL */}
                    <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
                      <input
                        type="range"
                        min={(game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)}
                        max={getMaxRaiseTo(myPlayer)}
                        step={selectedTable?.big_blind || 1}
                        value={raiseTo || ((game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0))}
                        onChange={(e) => setRaiseTo(Number(e.target.value))}
                        className="w-40"
                      />
                      <input
                        type="number"
                        className="w-24 bg-black/40 border border-white/20 rounded px-2 py-1 text-white"
                        value={raiseTo ?? ''}
                        min={(game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)}
                        max={getMaxRaiseTo(myPlayer)}
                        step={selectedTable?.big_blind || 1}
                        onChange={(e) => setRaiseTo(Math.min(Math.max(Number(e.target.value) || 0, (game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)), getMaxRaiseTo(myPlayer)))}
                      />
                      <button
                        onClick={() => handlePlayerAction("raise", raiseTo || ((game?.current_bet || 0) + getMinRaiseSize(game, selectedTable?.big_blind || 0)))}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold"
                      >
                        RAISE TO
                      </button>
                    </div>

                    <button onClick={() => handlePlayerAction("allin")} className="px-6 py-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold transition-all">
                      ALL IN
                    </button>
                  </div>
                </div>
              )}

              {/* Game Messages */}
              {gameMessage && (
                <div className="text-center text-white/90 text-sm mb-4 bg-black/30 rounded-lg p-3">
                  {gameMessage}
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
                    <div className="text-xs text-white/50 mt-3">
                      Starting next hand...
                    </div>
                    <button
                      onClick={() => setWinnerModal({ open: false, text: "", hand: "", pot: 0 })}
                      className="mt-4 w-full py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}

              {/* Game Status */}
              {game?.status === 'finished' && (
                <div className="text-center text-white/70">
                  <div className="text-2xl mb-2">🎉</div>
                  <div>Hand finished! Starting new hand...</div>
                </div>
              )}
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

