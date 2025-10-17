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
      
      // Determine dealer position (first player is dealer)
      const dealerIndex = 0;
      const smallBlindIndex = (dealerIndex + 1) % players.length;
      const bigBlindIndex = (dealerIndex + 2) % players.length;
      
      // Update players with cards and blinds
      const updatedPlayers = players.map((player, idx) => {
        let bet = 0;
        let chips = player.chips || STARTING_CHIPS;
        
        if (idx === smallBlindIndex) {
          bet = SMALL_BLIND;
          chips -= SMALL_BLIND;
        } else if (idx === bigBlindIndex) {
          bet = BIG_BLIND;
          chips -= BIG_BLIND;
        }
        
        return {
          ...player,
          cards: [deck[idx * 2], deck[idx * 2 + 1]],
          bet: bet,
          chips: chips,
          status: PLAYER_STATUS.READY
        };
      });

      // Deal community cards (burn one card before flop)
      const communityCards = [
        deck[players.length * 2 + 1], // Burn first card
        deck[players.length * 2 + 2], // Flop 1
        deck[players.length * 2 + 3], // Flop 2
        deck[players.length * 2 + 4], // Flop 3
        deck[players.length * 2 + 5]  // Turn (will be dealt later)
      ];

      // Determine first action (UTG - Under The Gun)
      let firstActionIndex = (bigBlindIndex + 1) % players.length;
      if (players.length === 2) {
        // Heads up: Small blind acts first
        firstActionIndex = smallBlindIndex;
      }

      // Update game in Supabase
      const { error: gameError } = await supabase
        .from(TABLES.GAMES)
        .update({
          status: GAME_STATUS.PLAYING,
          pot: SMALL_BLIND + BIG_BLIND,
          current_bet: BIG_BLIND,
          current_player_index: firstActionIndex,
          round: "pre-flop",
          community_cards: communityCards,
          community_visible: 0,
          deck: deck
        })
        .eq("id", game.id);

      if (gameError) {
        console.error("Error starting game:", gameError);
        setError("Failed to start game");
        return;
      }

      // Update players in Supabase
      for (const player of updatedPlayers) {
        const { error: playerError } = await supabase
          .from(TABLES.PLAYERS)
          .update({
            cards: player.cards,
            bet: player.bet,
            chips: player.chips,
            status: player.status
          })
          .eq("id", player.id);

        if (playerError) {
          console.error("Error updating player:", playerError);
        }
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
    
    const currentPlayer = players[currentPlayerIndex];
    const myPlayer = players.find(p => p.id === playerId);
    
    if (!currentPlayer || currentPlayer.id !== playerId) {
      console.log("Not my turn");
      return;
    }
    
    if (myPlayer.status === PLAYER_STATUS.FOLDED) {
      console.log("Player is folded");
      return;
    }
    
    playSfx(clickSound.current);
    
    try {
      // Calculate new bet and chips based on poker rules
      let newBet = myPlayer.bet;
      let newChips = myPlayer.chips;
      let newStatus = myPlayer.status;
      let actionAmount = 0;
      
      if (action === "fold") {
        newStatus = PLAYER_STATUS.FOLDED;
      } else if (action === "call") {
        const callAmount = game.current_bet - myPlayer.bet;
        actionAmount = callAmount;
        newBet = game.current_bet;
        newChips = myPlayer.chips - callAmount;
      } else if (action === "check") {
        // Check is only valid if no bet to call
        if (game.current_bet > myPlayer.bet) {
          console.log("Cannot check when there's a bet to call");
          return;
        }
      } else if (action === "raise") {
        // Raise must be at least the size of the current bet
        const minRaise = game.current_bet * 2 - myPlayer.bet;
        const actualRaise = Math.max(minRaise, amount);
        const raiseAmount = Math.min(actualRaise, myPlayer.chips);
        
        actionAmount = raiseAmount;
        newBet = myPlayer.bet + raiseAmount;
        newChips = myPlayer.chips - raiseAmount;
      } else if (action === "allin") {
        actionAmount = myPlayer.chips;
        newBet = myPlayer.bet + myPlayer.chips;
        newChips = 0;
        newStatus = PLAYER_STATUS.ALL_IN;
      }

      // Update player
      const { error } = await supabase
        .from(TABLES.PLAYERS)
        .update({
          status: newStatus,
          bet: newBet,
          chips: newChips
        })
        .eq("id", playerId);

      if (error) {
        console.error("Error updating player action:", error);
        return;
      }

      // Calculate new pot and current bet
      const betIncrease = newBet - myPlayer.bet;

      // Set game message
      const actionMessages = {
        "fold": `${myPlayer.name} folded`,
        "check": `${myPlayer.name} checked`,
        "call": `${myPlayer.name} called ${actionAmount}`,
        "raise": `${myPlayer.name} raised to ${newBet}`,
        "allin": `${myPlayer.name} went all in with ${actionAmount}!`
      };
      setGameMessage(actionMessages[action] || `${myPlayer.name} made a move`);
      const newPot = game.pot + betIncrease;
      const newCurrentBet = Math.max(game.current_bet, newBet);

      // Stop current timer
      stopActionTimer();

      // Move to next player
      let nextIndex = (currentPlayerIndex + 1) % players.length;
      while (players[nextIndex]?.status === PLAYER_STATUS.FOLDED) {
        nextIndex = (nextIndex + 1) % players.length;
      }
      
      // Start timer for next player if it's their turn
      if (nextIndex !== currentPlayerIndex) {
        const nextPlayer = players[nextIndex];
        if (nextPlayer && nextPlayer.id === playerId) {
          startActionTimer(nextPlayer.id);
        }
      }
      
      console.log("Turn management:", {
        currentPlayer: currentPlayerIndex,
        nextPlayer: nextIndex,
        action,
        newBet,
        newChips
      });

      // Check if betting round is complete
      const activePlayers = players.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      
      let updatedGame = {
        pot: newPot,
        current_bet: newCurrentBet,
        current_player_index: nextIndex
      };

      // Check if game should end (only one active player left)
      if (activePlayers.length === 1) {
        console.log("Only one player left - ending game");
        await determineWinner();
        return;
      }

      // Check if we need to progress to next round
      // This happens when all active players have bet the same amount
      const allPlayersBet = activePlayers.every(p => p.bet === newCurrentBet || p.status === PLAYER_STATUS.ALL_IN);
      const bettingComplete = allPlayersBet && activePlayers.length > 1;
      
      if (bettingComplete) {
        const nextRound = getNextRound(game.round);
        const newCommunityVisible = getCommunityVisible(nextRound);
        
        updatedGame = {
          ...updatedGame,
          round: nextRound,
          community_visible: newCommunityVisible,
          current_bet: 0
        };

        // Reset all player bets for next round
        for (const player of activePlayers) {
          await supabase
            .from(TABLES.PLAYERS)
            .update({ bet: 0 })
            .eq("id", player.id);
        }

        // Update players state locally
        setPlayers(prev => prev.map(p => ({
          ...p,
          bet: 0
        })));

        // Check for game end
        if (nextRound === "showdown") {
          await determineWinner();
        }
      }

      // Update game state
      const { error: gameError } = await supabase
        .from(TABLES.GAMES)
        .update(updatedGame)
        .eq("id", game.id);

      if (gameError) {
        console.error("Error updating game state:", gameError);
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

  // Evaluate poker hand
  const evaluateHand = (cards) => {
    if (!cards || cards.length < 5) return { rank: 0, highCard: 0, name: "Invalid" };
    
    // Convert cards to numbers for easier comparison
    const cardValues = cards.map(card => {
      const value = card.value;
      if (value === 'A') return 14;
      if (value === 'K') return 13;
      if (value === 'Q') return 12;
      if (value === 'J') return 11;
      return parseInt(value);
    });
    
    const suits = cards.map(card => card.suit);
    
    // Count occurrences of each value
    const valueCounts = {};
    cardValues.forEach(value => {
      valueCounts[value] = (valueCounts[value] || 0) + 1;
    });
    
    const counts = Object.values(valueCounts).sort((a, b) => b - a);
    const values = Object.keys(valueCounts).map(Number).sort((a, b) => b - a);
    
    // Check for straight flush
    if (isFlush(suits) && isStraight(cardValues)) {
      return { rank: 9, highCard: Math.max(...cardValues), name: "Straight Flush" };
    }
    
    // Check for four of a kind
    if (counts[0] === 4) {
      return { rank: 8, highCard: values[0], name: "Four of a Kind" };
    }
    
    // Check for full house
    if (counts[0] === 3 && counts[1] === 2) {
      return { rank: 7, highCard: values[0], name: "Full House" };
    }
    
    // Check for flush
    if (isFlush(suits)) {
      return { rank: 6, highCard: Math.max(...cardValues), name: "Flush" };
    }
    
    // Check for straight
    if (isStraight(cardValues)) {
      return { rank: 5, highCard: Math.max(...cardValues), name: "Straight" };
    }
    
    // Check for three of a kind
    if (counts[0] === 3) {
      return { rank: 4, highCard: values[0], name: "Three of a Kind" };
    }
    
    // Check for two pair
    if (counts[0] === 2 && counts[1] === 2) {
      return { rank: 3, highCard: Math.max(values[0], values[1]), name: "Two Pair" };
    }
    
    // Check for pair
    if (counts[0] === 2) {
      return { rank: 2, highCard: values[0], name: "Pair" };
    }
    
    // High card
    return { rank: 1, highCard: Math.max(...cardValues), name: "High Card" };
  };

  // Check if cards form a flush
  const isFlush = (suits) => {
    return suits.every(suit => suit === suits[0]);
  };

  // Check if cards form a straight
  const isStraight = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i-1] !== 1) {
        // Check for A-2-3-4-5 straight
        if (sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 14) {
          return true;
        }
        return false;
      }
    }
    return true;
  };

  // Determine winner
  const determineWinner = async () => {
    try {
      // Stop any running timers
      stopActionTimer();
      
      const activePlayers = players.filter(p => p.status !== PLAYER_STATUS.FOLDED);
      console.log("Determining winner. Active players:", activePlayers.length);
      
      if (activePlayers.length === 1) {
        // Only one player left - they win
        const winner = activePlayers[0];
        console.log("Winner by fold:", winner.name);
        
        // Update winner's chips
        await supabase
          .from(TABLES.PLAYERS)
          .update({ chips: winner.chips + game.pot })
          .eq("id", winner.id);
          
        // Show winner message
        setGameMessage(`🎉 ${winner.name} wins by fold! Pot: ${game.pot}`);
        
        // Update game status to finished first
        await supabase
          .from(TABLES.GAMES)
          .update({
            status: GAME_STATUS.FINISHED,
            pot: newPot,
            current_bet: 0,
            current_player_index: nextIndex,
            round: "finished"
          })
          .eq("id", game.id);
        
        // Reset game after 5 seconds
        setTimeout(async () => {
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
                chips: Math.max(player.chips, 1000) // Ensure minimum chips
              })
              .eq("id", player.id);
          }
          
          setScreen("lobby");
          setGameMessage("");
        }, 5000);
        
      } else if (activePlayers.length > 1) {
        // Evaluate hands and determine winner
        const hands = activePlayers.map(player => ({
          player,
          hand: evaluateHand([...player.cards, ...game.community_cards.slice(0, game.community_visible)])
        }));
        
        hands.sort((a, b) => {
          if (a.hand.rank !== b.hand.rank) return b.hand.rank - a.hand.rank;
          return b.hand.highCard - a.hand.highCard;
        });
        
        const winner = hands[0].player;
        const winningHand = hands[0].hand;
        console.log("Winner by hand:", winner.name, winningHand);
        
        // Update winner's chips
        await supabase
          .from(TABLES.PLAYERS)
          .update({ chips: winner.chips + game.pot })
          .eq("id", winner.id);
          
        // Show winner message
        setGameMessage(`🎉 ${winner.name} wins with ${winningHand.name}! Pot: ${game.pot}`);
        
        // Update game status to finished first
        await supabase
          .from(TABLES.GAMES)
          .update({
            status: GAME_STATUS.FINISHED,
            pot: game.pot,
            current_bet: 0,
            current_player_index: 0,
            round: "finished"
          })
          .eq("id", game.id);
        
        // Reset game after 7 seconds (longer for showdown)
        setTimeout(async () => {
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
                chips: Math.max(player.chips, 1000) // Ensure minimum chips
              })
              .eq("id", player.id);
          }
          
          setScreen("lobby");
          setGameMessage("");
        }, 7000);
      }
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
