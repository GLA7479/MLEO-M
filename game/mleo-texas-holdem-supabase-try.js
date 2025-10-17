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

// VAULT System (same as other games)
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

// Simple constants
const SUITS = ['S','H','D','C']; // Data layer - for storage and calculations
const SUIT_SYMBOL = { S:'♠', H:'♥', D:'♦', C:'♣' }; // Display layer - for rendering only
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SMALL_BLIND = 25;
const BIG_BLIND = 50;
const STARTING_CHIPS = 1000;
const BETTING_TIME_LIMIT = 30000; // 30 seconds per action

// Simple utility functions (removed duplicate definitions)

// Simple card functions
function createDeck() {
  const deck = [];
  console.log("Creating deck with SUITS:", SUITS);
  
  for (const suit of SUITS) {
    for (const value of VALUES) {
      const card = { suit, value };
      deck.push(card);
    }
  }
  
  console.log("Created deck with", deck.length, "cards. Sample:", deck.slice(0, 5));
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
  
  // תמיכה בשני פורמטים: Unicode symbols ו-letters
  const isRed = card.suit === "H" || card.suit === "D" || card.suit === "♥" || card.suit === "♦";
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
  
  // Winner modal
  const [winnerModal, setWinnerModal] = useState({ open: false, text: "", hand: "", pot: 0 });
  
  // VAULT system
  const [vaultAmount, setVaultAmount] = useState(0);
  const [entryFee, setEntryFee] = useState(1000); // Default entry fee

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
        await supabase.from(TABLES.PLAYERS).update({ 
          cards: [],
          bet: 0,
          status: PLAYER_STATUS.READY,
          revealed: false,
          chips: Math.max(player.chips, STARTING_CHIPS)
        }).eq("id", player.id);
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
    
    // Load VAULT amount
    setVaultAmount(getVault());
    
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

    // Check VAULT balance
    const currentVault = getVault();
    if (currentVault < entryFee) {
      setError(`Insufficient MLEO in VAULT. Need ${fmt(entryFee)} MLEO, have ${fmt(currentVault)} MLEO`);
      return;
    }

    playSfx(clickSound.current);
    setIsConnecting(true);
    setError("");

    try {
      // Deduct entry fee from VAULT
      setVault(currentVault - entryFee);
      setVaultAmount(currentVault - entryFee);

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
          deck: [],
          entry_fee: entryFee
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
          chips: entryFee, // Use entry fee as starting chips
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

      // Check VAULT balance for entry fee
      const currentVault = getVault();
      const requiredEntryFee = gameData.entry_fee || 1000;
      if (currentVault < requiredEntryFee) {
        setError(`Insufficient MLEO in VAULT. Need ${fmt(requiredEntryFee)} MLEO, have ${fmt(currentVault)} MLEO`);
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

      // Deduct entry fee from VAULT
      setVault(currentVault - requiredEntryFee);
      setVaultAmount(currentVault - requiredEntryFee);

      // Create guest player
      const { data: playerData, error: playerError } = await supabase
        .from(TABLES.PLAYERS)
        .insert({
          game_id: gameData.id,
          name: playerName,
          is_host: false,
          chips: requiredEntryFee, // Use entry fee as starting chips
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
          const g = payload.new;
          
          // Cards should be in correct format from DB
          if (g.community_cards) {
            console.log("Reading from DB - Community cards:", g.community_cards);
          }
          
          setGame(g);
          setCurrentPlayerIndex(g.current_player_index ?? 0);

          // אם עברנו ל־PLAYING — הצג את מסך המשחק
          if (g.status === GAME_STATUS.PLAYING) {
            setScreen("game");
          }

          // סוף יד
          if (g.status === GAME_STATUS.FINISHED || g.round === "showdown") {
            stopActionTimer();

            // payout – רק אצל הזוכה
            if (g.winner_player_id && g.winner_player_id === playerId && !g.payout_done) {
              const curr = getVault();
              const next = curr + (g.pot || 0);
              setVault(next);
              setVaultAmount(next);
              supabase.from(TABLES.GAMES)
                .update({ payout_done: true })
                .eq("id", g.id)
                .then(() => {
                  console.log("Payout marked as done for winner:", playerId);
                })
                .catch((err) => {
                  console.error("Error marking payout as done:", err);
                });
            }

            // מודאל תוצאה
            const text = g.game_message || "Hand finished";
            const hand = g.winning_hand || "";
            const pot  = g.pot || 0;
            setWinnerModal({ open: true, text, hand, pot });

            // סגירת מודאל אוטומטית אחרי 6 שניות
            setTimeout(() => {
              setWinnerModal(prev => ({ ...prev, open: false }));
            }, 6000);

            // ה־Host יתחיל יד חדשה אוטומטית אם לשני השחקנים יש מספיק כסף
            if (isHost) {
              setTimeout(async () => { 
                try {
                  // בדוק אם לשני השחקנים יש מספיק כסף
                  const { data: currentPlayers } = await supabase
                    .from(TABLES.PLAYERS)
                    .select("chips")
                    .eq("game_id", g.id);
                  
                  if (currentPlayers && currentPlayers.length >= 2) {
                    const minChips = Math.min(...currentPlayers.map(p => p.chips));
                    const entryFee = g.entry_fee || 1000;
                    
                    if (minChips >= entryFee) {
                      console.log("Starting new game automatically - all players have enough chips");
                      await startNewGame();
                    } else {
                      console.log("Not starting new game - some players don't have enough chips");
                    }
                  }
                } catch (error) {
                  console.error("Error checking chips for auto-start:", error);
                }
              }, 6500);
            }
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
            
            // Player cards should be in correct format from DB
            const fixedPlayersData = playersData;
            
            setPlayers(fixedPlayersData);
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
            
            // Player cards should be in correct format from DB
            const fixedPlayersData = playersData;
            
            setPlayers(fixedPlayersData);
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
      const entryFee = game.entry_fee || 1000; // Use actual entry fee
      const updatedPlayers = players.map((p, idx) => {
        const base = { ...p };
        const card1 = deck[idx*2];
        const card2 = deck[idx*2+1];
        
        // Validate cards before assigning
        if (!card1 || !card2 || !card1.suit || !card1.value || !card2.suit || !card2.value) {
          console.error("Invalid cards for player", p.name, ":", { card1, card2, deckIndex: idx*2 });
          base.cards = [];
        } else {
          base.cards = [card1, card2];
        }
        
        base.bet = 0;
        base.status = PLAYER_STATUS.READY;
        base.chips = entryFee; // Use entry fee as starting chips
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
      
      // Validate community cards
      const validCommunityCards = communityCards.filter(card => 
        card && card.suit && card.value && card.suit !== '' && card.value !== ''
      );
      
      if (validCommunityCards.length !== 5) {
        console.error("Invalid community cards:", communityCards);
        console.error("Valid cards:", validCommunityCards);
      }

      // First to act preflop (UTG). Heads-up: SB acts first preflop.
      let firstToAct = (players.length === 2) ? smallBlindIndex : (bigBlindIndex + 1) % players.length;

      // Initialize betting state
      const pot0 = (updatedPlayers[smallBlindIndex].bet + updatedPlayers[bigBlindIndex].bet);
      const currentBet = updatedPlayers[bigBlindIndex].bet; // usually BIG_BLIND
      const lastRaiseTo = currentBet;  // amount to call
      const lastAggressor = bigBlindIndex; // BB is considered last to act preflop

      // Validate and fix cards before saving to DB
      console.log("Saving to DB - Community cards:", communityCards);
      console.log("Saving to DB - Deck sample:", deck.slice(0, 5));
      
      // Cards are already in correct format from createDeck
      const fixedCommunityCards = communityCards;
      const fixedDeck = deck;
      const fixedPlayers = updatedPlayers;
      
      // Persist game
      console.log("Saving fixed community cards:", fixedCommunityCards);
      console.log("Saving fixed deck sample:", fixedDeck.slice(0, 5));
      
      await supabase.from(TABLES.GAMES).update({
        status: GAME_STATUS.PLAYING,
        dealer_index: dealerIndex,
        pot: pot0,
        current_bet: currentBet,
        last_raise_to: lastRaiseTo,
        last_raiser_index: lastAggressor,
        current_player_index: firstToAct,
        round: "pre-flop",
        community_cards: fixedCommunityCards,
        community_visible: 0,
        deck: fixedDeck
      }).eq("id", game.id);

      // Persist players
      for (const p of fixedPlayers) {
        await supabase.from(TABLES.PLAYERS)
          .update({ cards: p.cards, bet: p.bet, chips: p.chips, status: p.status })
          .eq("id", p.id);
      }

      // Update dealer for next hand
      const nextDealer = (dealerIndex + 1) % players.length;
      await supabase.from(TABLES.GAMES)
        .update({ dealer_index: nextDealer })
        .eq("id", game.id);

      setScreen("game");
    } catch (err) {
      console.error("Start game error:", err);
      setError("Failed to start game");
    }
  };

  // Player action with advanced game logic
  const handlePlayerAction = async (action, amount = 0) => {
    if (!game || !playerId) return;
    // block when not in active betting
    if (game.status !== GAME_STATUS.PLAYING || game.round === "finished") return;

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
      
      // Special case: if everyone is all-in, betting is done regardless of position
      const allAllIn = activeCanAct.every(p => p.status === PLAYER_STATUS.ALL_IN);
      const bettingDone = everyoneMatched && (allAllIn || (nextIdx === lastRaiserIndex));

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

        // If all players are all-in, go directly to showdown regardless of round
        const allAllIn = freshPlayers.filter(p => p.status !== PLAYER_STATUS.FOLDED).every(p => p.status === PLAYER_STATUS.ALL_IN);
        if (allAllIn) {
          console.log("All players all-in, going directly to showdown");
          // Make sure all community cards are visible before showdown
          await supabase.from(TABLES.GAMES).update({ community_visible: 5 }).eq("id", game.id);
          await determineWinner();
        } else if (nextRound === "showdown") {
          // Normal showdown - go directly to determine winner
          console.log("Normal showdown, determining winner");
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
    if (!Array.isArray(cards)) return [];

    const normalized = cards.map((c) => {
      if (!c) return null;
      // rank
      const r =
        (typeof c.r === 'number' && c.r > 0) ? c.r :
        (c.value && RANKS_ORDER[c.value] !== undefined) ? RANKS_ORDER[c.value] :
        null;
      // suit
      const s = c.s || c.suit || null;
      if (!r || !s) return null;
      return { r, s };
    }).filter(Boolean);

    if (normalized.length < cards.length) {
      console.warn("normalizeCards: filtered out invalid cards. Original:", cards.length, "Valid:", normalized.length);
    }

    return normalized.sort((a,b) => b.r - a.r);
  };

  const uniqueRanksDesc = (rs) => {
    const seen = new Set(); const out = [];
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
    if (!best5 || best5.length !== 5) return [0]; // Invalid hand
    
    // Check if cards have the expected format
    if (!best5[0] || typeof best5[0].r === 'undefined') {
      console.error("Invalid card format in handRankTuple:", best5);
      return [0];
    }
    
    const counts = new Map();
    for (const c of best5) {
      if (c && typeof c.r !== 'undefined' && c.r !== null) {
        counts.set(c.r, (counts.get(c.r)||0)+1);
      } else {
        console.error("Invalid card in handRankTuple:", c);
        return [0];
      }
    }
    
    if (counts.size === 0) {
      console.error("No valid cards found in handRankTuple");
      return [0];
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
    
    // Fallback: return first 5 valid cards if no valid hand found
    if (!best) {
      const validCards = cards7.filter(c => c && typeof c.r !== 'undefined' && c.r !== null);
      if (validCards.length >= 5) {
        best = validCards.slice(0, 5);
        bestRank = handRankTuple(best);
      } else {
        console.error("Not enough valid cards for fallback:", cards7);
        return { best5: [], tuple: [0] };
      }
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
      console.log("evaluateHand input cards:", cards);
      const converted = cards.map((card) => {
        if (!card) return null;
        if (typeof card.r === 'number' && card.s) return { r: card.r, s: card.s };
        if (card.suit && card.value && RANKS_ORDER[card.value] !== undefined) {
          const converted = { r: RANKS_ORDER[card.value], s: card.suit };
          console.log("Converted card:", card, "->", converted);
          return converted;
        }
        console.log("Invalid card format:", card);
        return null;
      }).filter(Boolean);
      console.log("evaluateHand converted cards:", converted);

      if (converted.length < 5) {
        console.error("Not enough valid cards for evaluation after conversion:", { original: cards, converted });
        return { rank: 0, score: [0], name: "Invalid", best5: [] };
      }

      const norm = normalizeCards(converted);
      if (norm.length < 5) return { rank: 0, score: [0], name: "Invalid", best5: [] };

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
    } catch (e) {
      console.error("Error in evaluateHand:", e, cards);
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
        const potAmount = gNow.pot || 0;
        setGameMessage(`🎉 ${w.name} wins by fold! Pot: ${fmt(potAmount)} MLEO`);
        await supabase.from(TABLES.GAMES).update({
          status: GAME_STATUS.FINISHED,
          round: "showdown",
          community_visible: 5,
          current_bet: 0,
          current_player_index: null,
          winner_player_id: w.id,
          winning_hand: "By Fold",
          payout_done: false
        }).eq("id", game.id);
        return;
      }

      // Showdown: evaluate best5-of-7
      // Ensure all community cards are visible for showdown
      await supabase.from(TABLES.GAMES).update({ community_visible: 5 }).eq("id", game.id);
      
      const board5 = (gNow.community_cards||[]).slice(0,5);
      console.log("Showdown - Community cards:", board5);
      console.log("Showdown - Active players:", active.map(p => ({ name: p.name, cards: p.cards })));
      
      const ranked = active.map(p => {
        const all = [...(p.cards||[]), ...board5];
        console.log("Cards for showdown evaluation:", all);
        const evalRes = evaluateHand(all);
        console.log("Hand evaluation result:", evalRes);
        return { p, evalRes };
      }).sort((a,b)=> compareRankTuple(b.evalRes.score, a.evalRes.score));

      const winner = ranked[0];
      const potAmount = gNow.pot || 0;

      // Reveal cards
      for (const r of ranked) {
        await supabase.from(TABLES.PLAYERS).update({ revealed: true }).eq("id", r.p.id);
      }

      setGameMessage(`🎉 ${winner.p.name} wins with ${winner.evalRes.name}! Pot: ${fmt(potAmount)} MLEO`);
      await supabase.from(TABLES.GAMES).update({
        status: GAME_STATUS.FINISHED,
        round: "showdown",
        community_visible: 5,
        current_bet: 0,
        current_player_index: null,
        winner_player_id: winner.p.id,
        winning_hand: winner.evalRes.name,
        payout_done: false
      }).eq("id", game.id);
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

                <div>
                  <label className="text-sm text-white/70 mb-2 block">Entry Fee (MLEO)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={entryFee}
                      onChange={(e) => setEntryFee(Math.max(100, parseInt(e.target.value) || 100))}
                      min="100"
                      step="100"
                      placeholder="1000"
                      className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40 pr-16"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 text-sm">
                      MLEO
                    </div>
                  </div>
                  <div className="text-xs text-white/50 mt-1">
                    Your VAULT: {fmt(vaultAmount)} MLEO
                  </div>
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

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="text-sm text-blue-300 text-center">
                    Your VAULT: {fmt(vaultAmount)} MLEO
                  </div>
                  <div className="text-xs text-blue-200/70 text-center mt-1">
                    Entry fee will be deducted when joining
                  </div>
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
              <div className="text-xs text-emerald-400 mt-1">
                Your VAULT: {fmt(vaultAmount)} MLEO
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
                          Hand: {(() => {
                            try {
                              const playerCards = (player.cards || []).filter(c => c && c.suit && c.suit !== '' && c.value);
                              const communityCards = (game.community_cards || []).slice(0, game.community_visible || 0).filter(c => c && c.suit && c.suit !== '' && c.value);
                              const allCards = [...playerCards, ...communityCards];
                              
                              console.log("Cards for evaluation:", {
                                playerCards,
                                communityCards,
                                allCards,
                                playerCardsCount: playerCards.length,
                                communityCardsCount: communityCards.length,
                                totalCount: allCards.length
                              });
                              
                              if (allCards.length < 5) {
                                console.error("Not enough cards for evaluation:", allCards);
                                return "Invalid";
                              }
                              
                              const result = evaluateHand(allCards);
                              return result.name;
                            } catch (error) {
                              console.error("Error evaluating hand:", error);
                              return "Error";
                            }
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Action Buttons - Show for current player */}
            {isMyTurn &&
             myPlayer?.status !== PLAYER_STATUS.FOLDED &&
             game?.status === GAME_STATUS.PLAYING &&
             game?.round !== "finished" &&
             game?.round !== "showdown" &&
             !winnerModal.open && (
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

            {/* Winner Modal */}
            {winnerModal.open && (
              <div className="fixed inset-0 z-[11000] bg-black/70 flex items-center justify-center p-4">
                <div className="bg-zinc-900 text-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center">
                  <div className="text-2xl font-extrabold mb-2">🎉 Hand Result</div>
                  <div className="text-emerald-300 font-semibold">{winnerModal.text}</div>
                  {winnerModal.hand && <div className="text-white/70 text-sm mt-1">{winnerModal.hand}</div>}
                  {winnerModal.pot > 0 && <div className="text-amber-300 mt-2">Pot: {fmt(winnerModal.pot)}</div>}
                  <div className="text-xs text-white/50 mt-3">
                    {isHost ? "Starting next hand..." : "Waiting for host to start next hand..."}
                  </div>
                  <button
                    onClick={() => setWinnerModal(m => ({...m, open:false}))}
                    className="mt-4 w-full py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
                  >
                    OK
                  </button>
                </div>
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
