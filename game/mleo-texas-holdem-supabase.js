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
const SMALL_BLIND = 50;
const BIG_BLIND = 100;

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

  const playSfx = (sound) => { 
    if (sfxMuted || !sound) return; 
    try { 
      sound.currentTime = 0; 
      sound.play().catch(() => {}); 
    } catch {} 
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

  // Start game
  const handleStartGame = async () => {
    if (!isHost || !game) return;
    if (players.length < 2) {
      setError("Need at least 2 players to start");
      return;
    }

    playSfx(clickSound.current);
    
    try {
      const deck = shuffleDeck(createDeck());
      
      // Update players with cards and blinds
      const updatedPlayers = players.map((player, idx) => ({
        ...player,
        cards: [deck[idx * 2], deck[idx * 2 + 1]],
        bet: idx === 0 ? SMALL_BLIND : idx === 1 ? BIG_BLIND : 0,
        chips: 10000 - (idx === 0 ? SMALL_BLIND : idx === 1 ? BIG_BLIND : 0),
        status: PLAYER_STATUS.READY
      }));

      const communityCards = [
        deck[players.length * 2],
        deck[players.length * 2 + 1],
        deck[players.length * 2 + 2],
        deck[players.length * 2 + 3],
        deck[players.length * 2 + 4]
      ];

      // Update game in Supabase
      const { error: gameError } = await supabase
        .from(TABLES.GAMES)
        .update({
          status: GAME_STATUS.PLAYING,
          pot: SMALL_BLIND + BIG_BLIND,
          current_bet: BIG_BLIND,
          current_player_index: 2 >= players.length ? 0 : 2,
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

  // Player action
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
      // Update player action
      const { error } = await supabase
        .from(TABLES.PLAYERS)
        .update({
          status: action === "fold" ? PLAYER_STATUS.FOLDED : PLAYER_STATUS.READY,
          bet: action === "call" ? game.current_bet : 
               action === "raise" ? myPlayer.bet + amount :
               action === "allin" ? myPlayer.chips : myPlayer.bet,
          chips: action === "call" ? myPlayer.chips - (game.current_bet - myPlayer.bet) :
                 action === "raise" ? myPlayer.chips - amount :
                 action === "allin" ? 0 : myPlayer.chips
        })
        .eq("id", playerId);

      if (error) {
        console.error("Error updating player action:", error);
        return;
      }

      // Update game state
      const newPot = game.pot + (action === "call" ? (game.current_bet - myPlayer.bet) :
                                action === "raise" ? amount :
                                action === "allin" ? myPlayer.chips : 0);
      
      const newCurrentBet = action === "raise" ? myPlayer.bet + amount :
                           action === "allin" ? Math.max(game.current_bet, myPlayer.chips) :
                           game.current_bet;

      // Move to next player
      let nextIndex = (currentPlayerIndex + 1) % players.length;
      while (players[nextIndex]?.status === PLAYER_STATUS.FOLDED) {
        nextIndex = (nextIndex + 1) % players.length;
      }

      const { error: gameError } = await supabase
        .from(TABLES.GAMES)
        .update({
          pot: newPot,
          current_bet: newCurrentBet,
          current_player_index: nextIndex
        })
        .eq("id", game.id);

      if (gameError) {
        console.error("Error updating game state:", gameError);
      }

    } catch (err) {
      console.error("Player action error:", err);
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
          </div>

          <div className="relative h-full flex flex-col items-center px-2 py-12">
            <div className="text-center mb-2">
              <div className="text-xs text-white/60">Room: {roomCode} • Round: {game?.round}</div>
              <div className="text-2xl font-bold text-amber-400">POT: {fmt(pot)}</div>
            </div>

            {/* Community Cards */}
            <div className="mb-3">
              <div className="flex gap-1 justify-center">
                {communityCards.slice(0, communityVisible).map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 200} />
                ))}
              </div>
            </div>

            {/* Players */}
            <div className="w-full max-w-lg space-y-1 mb-2 flex-1 overflow-y-auto">
              {players.map((player, idx) => {
                const isMe = player.id === playerId;
                return (
                  <div key={player.id} className={`bg-black/30 border ${isMe ? 'border-green-500/50' : idx === currentPlayerIndex ? 'border-yellow-500/50' : 'border-white/10'} rounded-lg p-2`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{player.is_host ? '👑' : '👤'}</span>
                      <span className="text-white font-semibold text-xs">{player.name}</span>
                        {isMe && <span className="text-xs text-green-400">(You)</span>}
                      {player.status === PLAYER_STATUS.FOLDED && <span className="text-xs text-red-400">(Folded)</span>}
                      {idx === currentPlayerIndex && player.status !== PLAYER_STATUS.FOLDED && <span className="text-xs text-yellow-400">⏰</span>}
                    </div>
                    <div className="text-emerald-400 text-xs">{player.chips} | Bet: {player.bet}</div>
                  </div>
                    {isMe && player.cards && player.cards.length > 0 && (
                    <div className="flex gap-1 mt-2 justify-center">
                      {player.cards.map((card, i) => (
                        <PlayingCard key={i} card={card} delay={i * 200} />
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Action Buttons - Show for current player */}
            {isMyTurn && myPlayer?.status !== PLAYER_STATUS.FOLDED && (
              <div className="w-full max-w-sm space-y-2">
                <div className="flex gap-2">
                  <button onClick={() => handlePlayerAction("fold")} className="flex-1 h-10 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 font-semibold text-xs">FOLD</button>
                  <button 
                    onClick={() => handlePlayerAction("check")} 
                    disabled={game.current_bet > myPlayer.bet}
                    className="flex-1 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    CHECK
                  </button>
                  <button 
                    onClick={() => handlePlayerAction("call")} 
                    disabled={game.current_bet <= myPlayer.bet || myPlayer.chips < (game.current_bet - myPlayer.bet)}
                    className="flex-1 h-10 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    CALL {game.current_bet > myPlayer.bet ? `(${game.current_bet - myPlayer.bet})` : ''}
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => handlePlayerAction("raise", 100)} 
                    disabled={myPlayer.chips === 0}
                    className="flex-1 h-10 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    RAISE 100
                  </button>
                  <button 
                    onClick={() => handlePlayerAction("allin")} 
                    disabled={myPlayer.chips === 0 || myPlayer.status === PLAYER_STATUS.ALL_IN}
                    className="flex-1 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ALL-IN
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
