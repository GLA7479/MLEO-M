// ============================================================================
// MLEO Texas Hold'em Supabase Multiplayer - REAL VERSION
// Built with Supabase for real-time multiplayer
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { supabase, TABLES, GAME_STATUS, PLAYER_STATUS } from "../lib/supabase";

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

// Simple constants
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SMALL_BLIND = 25;
const BIG_BLIND = 50;
const STARTING_CHIPS = 1000;
const BETTING_TIME_LIMIT = 30000; // 30 seconds per action

// Simple utility functions
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

function fmt(n) { 
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; 
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; 
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; 
  return Math.floor(n).toString(); 
}

// Simple card functions
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

// Simple card component
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
  
  const isRed = card.suit === "♥️" || card.suit === "♦️";
  const color = isRed ? "text-red-600" : "text-black";
  
  return (
    <div 
      className="w-10 h-14 rounded bg-white border border-gray-400 shadow p-0.5 relative"
      style={{ animation: `slideInCard 0.4s ease-out ${delay}ms both`, opacity: 0 }}
    >
      <div className={`text-xs font-bold ${color} absolute top-0.5 left-1 leading-tight`}>
        {card.value}
      </div>
      <div className={`text-base ${color} flex items-center justify-center h-full`}>
        {card.suit}
      </div>
    </div>
  );
}

// Main game component
function TexasHoldemSupabasePage() {
  useIOSViewportFix();
  const router = useRouter();
  const clickSound = useRef(null);
  const wrapRef = useRef(null);

  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Simple state
  const [screen, setScreen] = useState("menu");
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Game state - REAL with Supabase!
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  
  // UI states
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [gameMessage, setGameMessage] = useState("");
  const [actionTimer, setActionTimer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const playSfx = (sound) => { 
    if (sfxMuted || !sound) return; 
    try { 
      sound.currentTime = 0; 
      sound.play().catch(() => {}); 
    } catch {} 
  };

  // Start action timer
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

  // Stop action timer
  const stopActionTimer = () => {
    if (actionTimer) {
      clearInterval(actionTimer);
      setActionTimer(null);
    }
    setTimeLeft(0);
  };

  // Start new game
  const startNewGame = async () => {
    if (!isHost || !game) return;
    
    try {
      // Stop any running timers
      stopActionTimer();
      
      // Reset game to waiting state
      await supabase
        .from(TABLES.GAMES)
        .update({
          status: GAME_STATUS.WAITING,
          pot: 0,
          current_bet: 0,
          current_player_index: 0,
          round: "pre-flop",
          community_visible: 0,
          community_cards: []
        })
        .eq("id", game.id);

      // Reset all players
      for (const player of players) {
        await supabase
          .from(TABLES.PLAYERS)
          .update({ 
            cards: [],
            bet: 0,
            status: PLAYER_STATUS.READY,
            chips: Math.max(player.chips, STARTING_CHIPS) // Ensure minimum chips
          })
          .eq("id", player.id);
      }
      
      // Clear game message
      setGameMessage("");
      
      // Return to lobby
      setScreen("lobby");
      
    } catch (err) {
      console.error("Error starting new game:", err);
    }
  };

  useEffect(() => {
    setMounted(true);
    
    if (typeof Audio !== "undefined") {
      try { 
        clickSound.current = new Audio("/sounds/click.mp3"); 
      } catch {}
    }
    
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      // Cleanup subscriptions
      if (game?.id) {
        supabase
          .channel(`game-${game.id}`)
          .unsubscribe();
      }
    };
  }, []);

  const openWalletModalUnified = () => isConnected ? openAccountModal?.() : openConnectModal?.();
  const hardDisconnect = () => { disconnect?.(); setMenuOpen(false); };

  // Create room with Supabase
  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    playSfx(clickSound.current);
    setIsConnecting(true);
    setError("");

    try {
      // Generate room code
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // Create game in Supabase
      const { data: gameData, error: gameError } = await supabase
        .from(TABLES.GAMES)
        .insert({
          room_code: roomCode,
          status: GAME_STATUS.WAITING,
          max_players: 6,
          pot: 0,
          current_bet: 0,
          current_player_index: 0,
          round: "pre-flop",
          community_cards: [],
          community_visible: 0,
          deck: []
        })
        .select()
        .single();

      if (gameError) {
        console.error("Error creating game:", gameError);
        setError("Failed to create room. Please try again.");
        return;
      }

      // Create host player
      const { data: playerData, error: playerError } = await supabase
        .from(TABLES.PLAYERS)
        .insert({
          game_id: gameData.id,
          name: playerName,
          is_host: true,
          chips: 10000,
          bet: 0,
          status: PLAYER_STATUS.READY,
          cards: [],
          position: 0
        })
        .select()
        .single();

      if (playerError) {
        console.error("Error creating player:", playerError);
        setError("Failed to create player. Please try again.");
        return;
      }

      // Set state
      setGame(gameData);
      setPlayers([playerData]);
      setRoomCode(roomCode);
      setIsHost(true);
      setPlayerId(playerData.id);
      setScreen("lobby");

      // Subscribe to game updates
      subscribeToGameUpdates(gameData.id);

    } catch (err) {
      console.error("Create room error:", err);
      setError("Failed to create room. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Join room with Supabase
  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!roomCode.trim()) {
      setError("Please enter a room code");
      return;
    }

    playSfx(clickSound.current);
    setIsConnecting(true);
    setError("");

    try {
      // Find game by room code
      const { data: gameData, error: gameError } = await supabase
        .from(TABLES.GAMES)
        .select("*")
        .eq("room_code", roomCode.toUpperCase())
        .eq("status", GAME_STATUS.WAITING)
        .single();

      if (gameError || !gameData) {
        setError("Room not found or game already started");
        return;
      }

      // Check if room is full
      const { data: existingPlayers } = await supabase
        .from(TABLES.PLAYERS)
        .select("*")
        .eq("game_id", gameData.id);

      if (existingPlayers && existingPlayers.length >= gameData.max_players) {
        setError("Room is full");
        return;
      }

      // Create guest player
      const { data: playerData, error: playerError } = await supabase
        .from(TABLES.PLAYERS)
        .insert({
          game_id: gameData.id,
          name: playerName,
          is_host: false,
          chips: 10000,
          bet: 0,
          status: PLAYER_STATUS.READY,
          cards: [],
          position: existingPlayers ? existingPlayers.length : 0
        })
        .select()
        .single();

      if (playerError) {
        console.error("Error creating player:", playerError);
        setError("Failed to join room. Please try again.");
        return;
      }

      // Set state
      setGame(gameData);
      setPlayers([...existingPlayers, playerData]);
      setRoomCode(gameData.room_code);
      setIsHost(false);
      setPlayerId(playerData.id);
      setScreen("lobby");

      // Subscribe to game updates
      subscribeToGameUpdates(gameData.id);

    } catch (err) {
      console.error("Join room error:", err);
      setError("Failed to join room. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Subscribe to real-time updates
  const subscribeToGameUpdates = (gameId) => {
    console.log("Subscribing to game updates for game:", gameId);

    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: TABLES.GAMES, filter: `id=eq.${gameId}` },
        (payload) => {
          console.log("Game updated:", payload);
          setGame(payload.new);
          setCurrentPlayerIndex(payload.new.current_player_index || 0);
          
                if (payload.new.status === GAME_STATUS.PLAYING) {
                  setScreen("game");
                } else if (payload.new.status === GAME_STATUS.FINISHED) {
                  // Game finished - stay on game screen to show winner
                  console.log("Game finished, showing winner");
                }
        }
      )
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: TABLES.PLAYERS, filter: `game_id=eq.${gameId}` },
        async (payload) => {
          console.log("New player joined:", payload);
          // Refresh players list
          const { data: playersData } = await supabase
            .from(TABLES.PLAYERS)
            .select("*")
            .eq("game_id", gameId)
            .order("position");
          
          if (playersData) {
            console.log("Updated players list:", playersData);
            setPlayers(playersData);
          }
        }
      )
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: TABLES.PLAYERS, filter: `game_id=eq.${gameId}` },
        async (payload) => {
          console.log("Player updated:", payload);
          // Refresh players list
          const { data: playersData } = await supabase
            .from(TABLES.PLAYERS)
            .select("*")
            .eq("game_id", gameId)
            .order("position");
          
          if (playersData) {
            console.log("Updated players list:", playersData);
            setPlayers(playersData);
          }
        }
      )
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });
  };

  // Start game with proper poker logic
  const handleStartGame = async () => {
    if (!isHost || !game) return;
    if (players.length < 2) {
      setError("Need at least 2 players to start");
      return;
    }

    playSfx(clickSound.current);
    
    try {
      const deck = shuffleDeck(createDeck());
      
      // Rotate dealer each hand (persist on game)
      const dealerIndex = (game.dealer_index ?? 0) % players.length;
      const smallBlindIndex = (dealerIndex + 1) % players.length;
      const bigBlindIndex = (dealerIndex + 2) % players.length;
      
      // Deal 2 cards each
      const updatedPlayers = players.map((p, idx) => {
        const base = { ...p };
        base.cards = [ deck[idx*2], deck[idx*2+1] ];
        base.bet = 0;
        base.status = PLAYER_STATUS.READY;
        base.chips = Math.max(base.chips ?? STARTING_CHIPS, STARTING_CHIPS);
        return base;
      });

      // Post blinds
      updatedPlayers[smallBlindIndex].bet = Math.min(SMALL_BLIND, updatedPlayers[smallBlindIndex].chips);
      updatedPlayers[smallBlindIndex].chips -= updatedPlayers[smallBlindIndex].bet;

      updatedPlayers[bigBlindIndex].bet = Math.min(BIG_BLIND, updatedPlayers[bigBlindIndex].chips);
      updatedPlayers[bigBlindIndex].chips -= updatedPlayers[bigBlindIndex].bet;

      // Community with burns (don't store burns)
      const start = players.length * 2;
      const communityCards = [
        deck[start+1], deck[start+2], deck[start+3], // flop after burn
        deck[start+5], // turn after burn
        deck[start+7]  // river after burn
      ];

      // First to act preflop (UTG). Heads-up: SB acts first preflop.
      let firstToAct = (players.length === 2) ? smallBlindIndex : (bigBlindIndex + 1) % players.length;

      // Initialize betting state
      const pot0 = (updatedPlayers[smallBlindIndex].bet + updatedPlayers[bigBlindIndex].bet);
      const currentBet = updatedPlayers[bigBlindIndex].bet; // usually BIG_BLIND
      const lastRaiseTo = currentBet;  // amount to call
      const lastAggressor = bigBlindIndex; // BB is considered last to act preflop

      // Persist game
      await supabase.from(TABLES.GAMES).update({
        status: GAME_STATUS.PLAYING,
        dealer_index: dealerIndex,
        pot: pot0,
        current_bet: currentBet,
        last_raise_to: lastRaiseTo,
        last_raiser_index: lastAggressor,
        current_player_index: firstToAct,
        round: "pre-flop",
        community_cards: communityCards,
        community_visible: 0,
        deck: deck
      }).eq("id", game.id);

      // Persist players
      for (const p of updatedPlayers) {
        await supabase.from(TABLES.PLAYERS)
          .update({ cards: p.cards, bet: p.bet, chips: p.chips, status: p.status })
          .eq("id", p.id);
      }

      setScreen("game");
    } catch (err) {
      console.error("Start game error:", err);
      setError("Failed to start game");
    }
  };

  // Player action with advanced game logic
  const handlePlayerAction = async (action, amount = 0) => {
    if (!game || !playerId) return;

    // Pull fresh snapshot from DB to avoid races
    const { data: gNow } = await supabase.from(TABLES.GAMES).select("*").eq("id", game.id).single();
    const { data: pNow } = await supabase.from(TABLES.PLAYERS).select("*").eq("game_id", game.id).order("position");

    const curIdx = gNow.current_player_index ?? 0;
    const pls = pNow || players;
    const me = pls.find(p => p.id === playerId);
    const cur = pls[curIdx];

    if (!cur || cur.id !== playerId) return; // not my turn
    if (me.status === PLAYER_STATUS.FOLDED || gNow.status !== GAME_STATUS.PLAYING) return;

    playSfx(clickSound.current);
    
    try {
      const active = pls.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      const toCall = Math.max(0, (gNow.current_bet ?? 0) - (me.bet ?? 0));

      let newBet = me.bet ?? 0;
      let newChips = me.chips ?? 0;
      let newStatus = me.status;

      if (action === "fold") {
        newStatus = PLAYER_STATUS.FOLDED;
      } else if (action === "check") {
        if (toCall > 0) return; // illegal
      } else if (action === "call") {
        const pay = Math.min(toCall, newChips);
        newBet += pay; newChips -= pay;
        if (pay < toCall) newStatus = PLAYER_STATUS.ALL_IN;
      } else if (action === "raise") {
        let raiseTo = Math.max((gNow.current_bet ?? 0) + BIG_BLIND, amount);
        raiseTo = Math.min(raiseTo, newBet + newChips);
        const put = raiseTo - newBet;
        if (put <= 0) return;
        newBet = raiseTo;
        newChips -= put;
        if (newChips === 0) newStatus = PLAYER_STATUS.ALL_IN;
      } else if (action === "allin") {
        const put = newChips;
        newBet += put; newChips = 0;
        newStatus = PLAYER_STATUS.ALL_IN;
      }

      // Update player
      await supabase.from(TABLES.PLAYERS)
        .update({ status: newStatus, bet: newBet, chips: newChips })
        .eq("id", playerId);

      // Recompute pot/current bet
      const freshPlayers = (await supabase.from(TABLES.PLAYERS).select("*").eq("game_id", game.id)).data || pls;
      const pot = freshPlayers.reduce((s,p)=> s + (p.bet||0), 0);
      const currentBet = Math.max(...freshPlayers.map(p=>p.bet||0), 0);

      // Detect last aggressor
      let lastRaiserIndex = gNow.last_raiser_index ?? curIdx;
      if ( (action === "raise") || (action === "allin" && newBet > (gNow.current_bet||0)) ) {
        lastRaiserIndex = curIdx;
      }

      // Stop timer
      stopActionTimer();

      // Advance to next active
      const canAct = (p) => p.status !== PLAYER_STATUS.FOLDED && p.status !== PLAYER_STATUS.ALL_IN;
      let nextIdx = (curIdx + 1) % freshPlayers.length;
      while (!canAct(freshPlayers[nextIdx])) {
        nextIdx = (nextIdx + 1) % freshPlayers.length;
        if (nextIdx === curIdx) break;
      }

      // Betting-round completion
      const activeCanAct = freshPlayers.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      const everyoneMatched = activeCanAct.every(p => (p.status === PLAYER_STATUS.ALL_IN) || ((p.bet||0) === currentBet));
      const bettingDone = everyoneMatched && (nextIdx === lastRaiserIndex);

      // Only 1 player left?
      const notFolded = freshPlayers.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      if (notFolded.length === 1) {
        await supabase.from(TABLES.GAMES).update({
          pot, current_bet: currentBet, current_player_index: nextIdx
        }).eq("id", game.id);
        await determineWinner();
        return;
      }

      if (bettingDone) {
        const nextRound = getNextRound(gNow.round);
        const newVisible = getCommunityVisible(nextRound);

        // Reset street bets
        for (const p of freshPlayers) {
          if (p.status !== PLAYER_STATUS.FOLDED) {
            await supabase.from(TABLES.PLAYERS).update({ bet: 0 }).eq("id", p.id);
          }
        }

        // Pick first to act postflop
        let dealerIndex = gNow.dealer_index ?? 0;
        let startIdx = (dealerIndex + 1) % freshPlayers.length;
        while (freshPlayers[startIdx].status === PLAYER_STATUS.FOLDED) {
          startIdx = (startIdx + 1) % freshPlayers.length;
        }

        const updates = {
          pot, 
          current_bet: 0,
          last_raise_to: 0,
          last_raiser_index: startIdx,
          round: nextRound,
          community_visible: newVisible,
          current_player_index: startIdx,
        };

        await supabase.from(TABLES.GAMES).update(updates).eq("id", game.id);

        if (nextRound === "showdown") {
          await determineWinner();
        }
      } else {
        // Keep betting
        await supabase.from(TABLES.GAMES).update({
          pot, current_bet: currentBet, last_raiser_index: lastRaiserIndex, current_player_index: nextIdx
        }).eq("id", game.id);
      }

    } catch (err) {
      console.error("Player action error:", err);
    }
  };

  // Get next round
  const getNextRound = (currentRound) => {
    const rounds = ["pre-flop", "flop", "turn", "river", "showdown"];
    const currentIndex = rounds.indexOf(currentRound);
    return rounds[currentIndex + 1] || "showdown";
  };

  // Get community cards visible count
  const getCommunityVisible = (round) => {
    const visible = {
      "pre-flop": 0,
      "flop": 3,
      "turn": 4,
      "river": 5,
      "showdown": 5
    };
    return visible[round] || 0;
  };

  // ===== Poker Hand Evaluation (7->best5) =====
  const RANKS_ORDER = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

  const normalizeCards = (cards) => {
    return cards.map(c => ({ r: RANKS_ORDER[c.value], v: c.value, s: c.suit }))
                .sort((a,b)=> b.r - a.r);
  };

  const uniqueRanksDesc = (rs) => {
    const seen = new Set(); const out = [];
    for (const x of rs) if (!seen.has(x)) { seen.add(x); out.push(x); }
    return out;
  };

  const findFlush = (cards7) => {
    const bySuit = new Map();
    for (const c of cards7) {
      const arr = bySuit.get(c.s) || [];
      arr.push(c);
      bySuit.set(c.s, arr);
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
    if (!best5 || best5.length !== 5) return [0]; // Invalid hand
    
    // Check if cards have the expected format
    if (!best5[0] || typeof best5[0].r === 'undefined') {
      console.error("Invalid card format in handRankTuple:", best5);
      return [0];
    }
    
    const counts = new Map();
    for (const c of best5) {
      if (c && typeof c.r !== 'undefined') {
        counts.set(c.r, (counts.get(c.r)||0)+1);
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
      if (h && h.length === 5) {
        const t = handRankTuple(h);
        if (!best || compareRankTuple(t, bestRank) > 0) {
          best = h; bestRank = t;
        }
      }
    }
    
    // Fallback: return first 5 cards if no valid hand found
    if (!best) {
      best = cards7.slice(0, 5);
      bestRank = handRankTuple(best);
    }
    
    return { best5: best, tuple: bestRank };
  };

  const compareRankTuple = (a,b) => {
    for (let i=0;i<Math.max(a.length,b.length);i++){
      const x = a[i] ?? -1, y = b[i] ?? -1;
      if (x!==y) return x>y?1:-1;
    }
    return 0;
  };

  // Public API used by UI
  const evaluateHand = (cards) => {
    if (!cards || cards.length < 5) return { rank: 0, score: [0], name: "Invalid", best5: [] };
    
    try {
      const norm = normalizeCards(cards);
      const { best5, tuple } = best5Of7(norm);
      
      if (!best5 || best5.length !== 5) {
        console.error("Invalid best5 returned:", best5);
        return { rank: 0, score: [0], name: "Invalid", best5: [] };
      }
      
      const names = {9:'Straight Flush',8:'Four of a Kind',7:'Full House',6:'Flush',5:'Straight',4:'Three of a Kind',3:'Two Pair',2:'Pair',1:'High Card'};
      return { 
        rank: tuple[0], 
        score: tuple, 
        name: names[tuple[0]] || "Unknown", 
        best5: best5.map(c=>({value:Object.keys(RANKS_ORDER).find(k=>RANKS_ORDER[k]===c.r), suit:c.s})) 
      };
    } catch (error) {
      console.error("Error in evaluateHand:", error, cards);
      return { rank: 0, score: [0], name: "Error", best5: [] };
    }
  };

  // Determine winner
  const determineWinner = async () => {
    try {
      stopActionTimer();

      const { data: gNow } = await supabase.from(TABLES.GAMES).select("*").eq("id", game.id).single();
      const { data: pls } = await supabase.from(TABLES.PLAYERS).select("*").eq("game_id", game.id).order("position");

      const active = pls.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      
      if (active.length === 1) {
        const w = active[0];
        await supabase.from(TABLES.PLAYERS).update({ chips: (w.chips||0) + (gNow.pot||0) }).eq("id", w.id);
        setGameMessage(`🎉 ${w.name} wins by fold! Pot: ${gNow.pot||0}`);
        await supabase.from(TABLES.GAMES).update({ status: GAME_STATUS.FINISHED, round: "finished", current_bet: 0 }).eq("id", game.id);
        return;
      }

      // Showdown: evaluate best5-of-7
      const board5 = (gNow.community_cards||[]).slice(0,5);
      const ranked = active.map(p => {
        const all = [...(p.cards||[]), ...board5];
        const evalRes = evaluateHand(all);
        return { p, evalRes };
      }).sort((a,b)=> compareRankTuple(b.evalRes.score, a.evalRes.score));

      const winner = ranked[0];
      await supabase.from(TABLES.PLAYERS).update({ chips: (winner.p.chips||0) + (gNow.pot||0) }).eq("id", winner.p.id);

      // Reveal cards
      for (const r of ranked) {
        await supabase.from(TABLES.PLAYERS).update({ revealed: true }).eq("id", r.p.id);
      }

      setGameMessage(`🎉 ${winner.p.name} wins with ${winner.evalRes.name}! Pot: ${gNow.pot||0}`);
      await supabase.from(TABLES.GAMES).update({ status: GAME_STATUS.FINISHED, round: "finished", current_bet: 0 }).eq("id", game.id);
    } catch (err) {
      console.error("Error determining winner:", err);
    }
  };

  const backToMenu = () => {
    playSfx(clickSound.current);
    if (game?.id) {
      supabase
        .channel(`game-${game.id}`)
        .unsubscribe();
    }
    setScreen("menu");
    setError("");
    setGame(null);
    setPlayers([]);
    setRoomCode("");
  };

  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return null;

  // MENU SCREEN
  if (screen === "menu") {
    return (
      <Layout>
        <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4 flex gap-2 z-50">
            <button onClick={backSafe} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
          </div>

          <div className="absolute top-4 right-4 flex gap-2 z-50">
            <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
            <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-extrabold text-white mb-2">🎴 Texas Hold'em</h1>
              <p className="text-white/70 text-lg">Supabase Multiplayer v1.0</p>
            </div>

            <div className="w-full max-w-md space-y-4">
              <button 
                onClick={() => { playSfx(clickSound.current); setScreen("create"); }} 
                className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:brightness-110 transition-all"
              >
                🎮 Create Game
              </button>

              <button 
                onClick={() => { playSfx(clickSound.current); setScreen("join"); }} 
                className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all"
              >
                🔗 Join Game
              </button>

              <div className="text-center text-white/60 text-sm mt-8">
                <p>• Real-time multiplayer with Supabase</p>
                <p>• Fast and reliable!</p>
                <p>• Play with friends anywhere</p>
              </div>
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}>
            <div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div>
              <div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div></div>
              <div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div>
              <div className="mt-4 text-xs opacity-70"><p>Supabase Multiplayer v1.0</p></div>
            </div>
          </div>
        )}
      </Layout>
    );
  }

  // CREATE SCREEN
  if (screen === "create") {
    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4">
            <button onClick={backToMenu} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold text-white mb-6 text-center">🎮 Create Game</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Your Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={15}
                    placeholder="Enter your name..."
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleCreateRoom}
                  disabled={isConnecting}
                  className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isConnecting ? "Creating..." : "Create Room"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // JOIN SCREEN
  if (screen === "join") {
    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4">
            <button onClick={backToMenu} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold text-white mb-6 text-center">🔗 Join Game</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Your Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={15}
                    placeholder="Enter your name..."
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40"
                  />
                </div>

                <div>
                  <label className="text-sm text-white/70 mb-2 block">Room Code</label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="Enter room code..."
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white font-mono text-center placeholder-white/40"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleJoinRoom}
                  disabled={isConnecting}
                  className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isConnecting ? "Joining..." : "Join Room"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // LOBBY SCREEN
  if (screen === "lobby") {
    const currentPlayers = players.length;
    const maxPlayers = game?.max_players || 6;

    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4">
            <button onClick={backToMenu} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">LEAVE</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-extrabold text-white mb-2">Game Lobby</h2>
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 mb-4">
                  <div className="text-sm text-white/70 mb-1">Room Code</div>
                  <div className="text-3xl font-bold text-white tracking-widest">{roomCode}</div>
                  <button onClick={() => { navigator.clipboard.writeText(roomCode); alert("Room code copied!"); }} className="mt-2 text-sm text-green-300 hover:text-green-200">📋 Copy Code</button>
                </div>
                <div className="text-white/70 text-sm">Players: {currentPlayers}/{maxPlayers}</div>
              </div>

              <div className="space-y-2 mb-6">
                {players.map((player, idx) => {
                  const isMe = player.id === playerId;
                  return (
                    <div key={player.id} className="bg-white/10 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{player.is_host ? '👑' : '👤'}</span>
                        <span className="font-semibold text-white">{player.name}</span>
                        {isMe && <span className="text-xs text-green-400">(You)</span>}
                      </div>
                      <div className="text-emerald-400 text-sm font-semibold">Ready</div>
                    </div>
                  );
                })}

                {Array.from({ length: maxPlayers - currentPlayers }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-white/5 rounded-lg p-3 flex items-center gap-2 opacity-50">
                    <span className="text-2xl">⏳</span>
                    <span className="text-white/50">Waiting...</span>
                  </div>
                ))}
              </div>

              {isHost && (
                <>
                  {error && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm text-center mb-4">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handleStartGame}
                    disabled={currentPlayers < 2}
                    className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {currentPlayers < 2 ? 'Waiting for Players...' : 'Start Game'}
                  </button>
                </>
              )}

              {!isHost && (
                <div className="text-center text-white/70 text-sm">
                  <div className="animate-pulse">Waiting for host to start game...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // GAME SCREEN
  if (screen === "game") {
    const pot = game?.pot || 0;
    const communityCards = game?.community_cards || [];
    const communityVisible = game?.community_visible || 0;
    const myPlayer = players.find(p => p.id === playerId);
    const currentPlayer = players[currentPlayerIndex];
    const isMyTurn = currentPlayer && currentPlayer.id === playerId;

    return (
      <Layout>
        <style jsx>{`
          @keyframes slideInCard {
            from {
              opacity: 0;
              transform: translateY(-30px) scale(0.8);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
        <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-2 left-2 flex gap-2 z-50">
            <button onClick={backToMenu} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">LEAVE</button>
          </div>

          <div className="absolute top-2 right-2 flex gap-2 z-50">
            <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
            <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
            {isHost && (
              <div className="flex gap-2">
                <button onClick={async () => { 
                  playSfx(clickSound.current); 
                  await determineWinner(); 
                }} className="px-3 py-1 rounded-lg text-xs font-bold bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30">END GAME</button>
                <button onClick={async () => { 
                  playSfx(clickSound.current); 
                  await startNewGame(); 
                }} className="px-3 py-1 rounded-lg text-xs font-bold bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30">NEW GAME</button>
              </div>
            )}
          </div>

          <div className="relative h-full flex flex-col items-center px-2 py-12">
            <div className="text-center mb-2">
              <div className="text-xs text-white/60">Room: {roomCode} • Round: {game?.round?.toUpperCase()}</div>
              <div className="text-2xl font-bold text-amber-400">POT: {fmt(pot)}</div>
              <div className="text-xs text-white/60 mt-1">
                Blinds: {SMALL_BLIND}/{BIG_BLIND} • Current Bet: {fmt(game?.current_bet || 0)}
              </div>
              {gameMessage && (
                <div className={`text-sm mt-2 px-3 py-2 rounded text-center ${
                  game?.status === GAME_STATUS.FINISHED 
                    ? 'bg-green-900/50 text-green-300 border border-green-500' 
                    : 'bg-yellow-900/30 text-yellow-300'
                }`}>
                  {gameMessage}
                  {game?.status === GAME_STATUS.FINISHED && (
                    <div className="text-xs mt-1 text-white/60">
                      Returning to lobby in a few seconds...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Community Cards */}
            <div className="mb-3">
              <div className="text-center text-white mb-2">
                <span className="text-lg font-bold">Community Cards - {game?.round?.toUpperCase() || 'PRE-FLOP'}</span>
              </div>
              <div className="flex gap-1 justify-center">
                {communityCards.slice(0, communityVisible).map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 200} />
                ))}
                {/* Show placeholder cards for remaining community cards */}
                {Array.from({ length: 5 - communityVisible }).map((_, i) => (
                  <div key={`placeholder-${i}`} className="w-12 h-16 bg-gray-600 rounded border-2 border-gray-500 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">?</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Players */}
            <div className="w-full max-w-lg space-y-1 mb-2 flex-1 overflow-y-auto">
              {players.map((player, idx) => {
                const isMe = player.id === playerId;
                const dealerIndex = 0; // First player is dealer
                const smallBlindIndex = (dealerIndex + 1) % players.length;
                const bigBlindIndex = (dealerIndex + 2) % players.length;
                
                let positionLabel = "";
                if (idx === dealerIndex) positionLabel = "D";
                else if (idx === smallBlindIndex) positionLabel = "SB";
                else if (idx === bigBlindIndex) positionLabel = "BB";
                
                return (
                  <div key={player.id} className={`bg-black/30 border ${isMe ? 'border-green-500/50' : idx === currentPlayerIndex ? 'border-yellow-500/50' : 'border-white/10'} rounded-lg p-2`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{player.is_host ? '👑' : '👤'}</span>
                      <span className="text-white font-semibold text-xs">{player.name}</span>
                      {positionLabel && <span className="text-xs bg-blue-600 px-1 rounded">{positionLabel}</span>}
                        {isMe && <span className="text-xs text-green-400">(You)</span>}
                      {player.status === PLAYER_STATUS.FOLDED && <span className="text-xs text-red-400">(Folded)</span>}
                      {player.status === PLAYER_STATUS.ALL_IN && <span className="text-xs text-purple-400">(All-in)</span>}
                      {idx === currentPlayerIndex && player.status !== PLAYER_STATUS.FOLDED && <span className="text-xs text-yellow-400">⏰</span>}
                    </div>
                    <div className="text-emerald-400 text-xs">{player.chips} | Bet: {player.bet}</div>
                  </div>
                    {isMe && player.cards && player.cards.length > 0 && (
                    <div className="mt-2">
                      <div className="flex gap-1 justify-center">
                        {player.cards.map((card, i) => (
                          <PlayingCard key={i} card={card} delay={i * 200} />
                        ))}
                      </div>
                      {/* Show current hand strength */}
                      {game?.community_cards && game.community_visible > 0 && (
                        <div className="text-center text-yellow-300 mt-2 text-xs">
                          Hand: {evaluateHand([...player.cards, ...game.community_cards.slice(0, game.community_visible)]).name}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Action Buttons - Show for current player */}
            {isMyTurn && myPlayer?.status !== PLAYER_STATUS.FOLDED && game?.status === GAME_STATUS.PLAYING && game?.round !== "finished" && (
              <div className="w-full max-w-sm space-y-3 bg-gray-800/50 p-4 rounded-lg">
                <div className="text-center text-white mb-2">
                  <span className="text-lg font-bold">Your Turn - Choose Action</span>
                  {timeLeft > 0 && (
                    <div className="text-sm text-yellow-400 mt-1">
                      Time left: {timeLeft}s
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handlePlayerAction("fold")} className="flex-1 h-12 rounded-lg bg-red-600 border border-red-500 text-white hover:bg-red-700 font-bold text-sm">FOLD</button>
                  {game.current_bet === myPlayer.bet ? (
                    <button 
                      onClick={() => handlePlayerAction("check")} 
                      className="flex-1 h-12 rounded-lg bg-blue-600 border border-blue-500 text-white hover:bg-blue-700 font-bold text-sm"
                    >
                      CHECK
                    </button>
                  ) : (
                    <button 
                      onClick={() => handlePlayerAction("call")} 
                      disabled={myPlayer.chips < (game.current_bet - myPlayer.bet)}
                      className="flex-1 h-12 rounded-lg bg-green-600 border border-green-500 text-white hover:bg-green-700 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      CALL {game.current_bet > myPlayer.bet ? `(${game.current_bet - myPlayer.bet})` : ''}
                    </button>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => handlePlayerAction("raise", BIG_BLIND)} 
                    disabled={myPlayer.chips === 0 || myPlayer.chips < BIG_BLIND}
                    className="flex-1 h-12 rounded-lg bg-yellow-600 border border-yellow-500 text-white hover:bg-yellow-700 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    RAISE {BIG_BLIND}
                  </button>
                  <button 
                    onClick={() => handlePlayerAction("raise", BIG_BLIND * 2)} 
                    disabled={myPlayer.chips === 0 || myPlayer.chips < BIG_BLIND * 2}
                    className="flex-1 h-12 rounded-lg bg-yellow-600 border border-yellow-500 text-white hover:bg-yellow-700 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    RAISE {BIG_BLIND * 2}
                  </button>
                  <button 
                    onClick={() => handlePlayerAction("allin")} 
                    disabled={myPlayer.chips === 0 || myPlayer.status === PLAYER_STATUS.ALL_IN}
                    className="flex-1 h-12 rounded-lg bg-purple-600 border border-purple-500 text-white hover:bg-purple-700 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ALL IN ({myPlayer.chips})
                  </button>
                </div>
              </div>
            )}

            {/* Game Finished Message */}
            {game?.status === GAME_STATUS.FINISHED && (
              <div className="w-full max-w-sm bg-green-800/50 p-4 rounded-lg text-center">
                <div className="text-green-300 text-lg font-bold mb-2">
                  🎉 Game Finished! 🎉
                </div>
                <div className="text-white text-sm mb-3">
                  {gameMessage || "Check the results above"}
                </div>
                {isHost && (
                  <button 
                    onClick={startNewGame}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold text-sm"
                  >
                    Start New Game
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MODALS */}
        {menuOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}>
            <div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div>
              <div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div></div>
              <div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div>
              <div className="mt-4 text-xs opacity-70"><p>Supabase Multiplayer v1.0</p></div>
            </div>
          </div>
        )}

        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">🎴 How to Play</h2>
              <div className="space-y-3 text-sm">
                <p><strong>Texas Hold'em with Supabase:</strong></p>
                <p>• Real-time multiplayer</p>
                <p>• Each player gets 2 hole cards</p>
                <p>• 5 community cards are revealed</p>
                <p>• Best 5-card hand wins the pot!</p>
                <p>• Small blind: {SMALL_BLIND} • Big blind: {BIG_BLIND}</p>
                <p className="text-white/60 text-xs mt-4">Fast and reliable with Supabase!</p>
              </div>
              <button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button>
            </div>
          </div>
        )}
      </Layout>
    );
  }

  return null;
}

export default TexasHoldemSupabasePage;
