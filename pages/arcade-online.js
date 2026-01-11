// pages/arcade-online.js - MLEO Arcade Online Hub
// בסגנון דף Arcade הקיים עם GameCard components
import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import RoomBrowser from "../components/online/RoomBrowser";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";

// iOS Viewport Fix (כמו במשחקים הקיימים)
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

// Helper functions (כמו במשחקים הקיימים)
function safeRead(key, fallback) {
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

function fmt(n) {
  n = Math.floor(Number(n || 0));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
}

const TIERED_GAMES = ['poker', 'backgammon', 'roulette', 'blackjack', 'war', 'ludo', 'bingo'];

// Game Registry with lazy loading
const GAME_REGISTRY = [
  {
    id: "backgammon",
    title: "Backgammon",
    emoji: "🎲",
    description: "Classic two-player backgammon with timers.",
    color: "#F59E0B",
    isMultiplayer: true,
    loader: () => import("../games-online/BackgammonMP").then(m => m.default)
  },
  {
    id: "blackjack",
    title: "Blackjack",
    emoji: "🃏",
    description: "Beat the dealer to 21! Multiplayer blackjack with friends.",
    color: "#10B981",
    isMultiplayer: true,
    loader: () => import("../games-online/BlackjackMP").then(m => m.default)
  },
  {
    id: "poker",
    title: "Texas Hold'em",
    emoji: "♠️",
    description: "Texas Hold'em poker! Multiplayer poker with friends.",
    color: "#8B5CF6",
    isMultiplayer: true,
    loader: () => import("../games-online/PokerMP").then(m => m.default)
  },
  {
    id: "roulette",
    title: "Roulette",
    emoji: "🎰",
    description: "European Roulette! Spin the wheel and win big!",
    color: "#EF4444",
    isMultiplayer: true,
    loader: () => import("../games-online/RouletteMP").then(m => m.default)
  },
  {
    id: "war",
    title: "War (Card Battle)",
    emoji: "⚔️",
    description: "1v1 card showdown. Flip, declare war, collect the pile!",
    color: "#2563EB",
    isMultiplayer: true,
    loader: () => import("../games-online/WarMP").then(m => m.default)
  },
  {
    id: "ludo",
    title: "Ludo",
    emoji: "🎲",
    description: "Classic Ludo board game! Play online with 2-4 players or vs Bot. Move your pieces around the board!",
    color: "#9333EA",
    isMultiplayer: true,
    loader: () => import("../games-online/LudoMP").then(m => m.default)
  },
  {
    id: "bingo",
    title: "Bingo",
    emoji: "🎯",
    description: "Bingo like Ludo! Online multiplayer (2-8 players) or local play. Win prizes for rows and full board!",
    color: "#EC4899",
    isMultiplayer: true,
    loader: () => import("../games-online/BingoMP").then(m => m.default)
  },
  {
    id: "poker-tables",
    title: "Poker Tables",
    emoji: "🎰",
    description: "Texas Hold'em vs Dealer! Strategic betting rounds - PRE-FLOP, FLOP, TURN, RIVER. Best hand wins the pot!",
    color: "#10B981",
    isMultiplayer: false,
    isExternal: true,
    href: "/tournament"
  },
];

// GameCard component (כמו בדף Arcade)
function GameCard({ game, onSelect }) {
  return (
    <article 
      className="rounded-lg border border-white/10 backdrop-blur-md shadow-lg p-4 flex flex-col transition-all hover:scale-105 hover:border-white/30 relative overflow-hidden cursor-pointer"
      style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
        height: '187px',
      }}
      onClick={() => onSelect(game.id)}
    >
      {/* Multiplayer Badge */}
      {game.isMultiplayer && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-xs font-bold text-emerald-300">
          MP
        </div>
      )}

      {/* Icon */}
      <div className="text-center absolute left-0 right-0" style={{ top: '15px' }}>
        <div className="text-5xl leading-none">{game.emoji}</div>
      </div>

      {/* Title */}
      <div 
        className="text-center absolute left-0 right-0 px-2 flex items-center justify-center" 
        style={{ 
          top: '80px',
          height: '45px'
        }}
      >
        <h2 className="text-base font-bold line-clamp-2 leading-tight">{game.title}</h2>
      </div>

      {/* Play button */}
      <div className="absolute left-4 right-4" style={{ bottom: '12px' }}>
        <div
          className="block w-full text-center px-4 py-2.5 rounded text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${game.color} 0%, ${game.color}dd 100%)`,
          }}
        >
          PLAY
        </div>
      </div>
    </article>
  );
}

// Game Viewport Component
function GameViewport({ gameId, vault, setVaultBoth, playerName, roomId, tierCode, mode }) {
  const [GameComponent, setGameComponent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId) {
      setGameComponent(null);
      return;
    }

    const game = GAME_REGISTRY.find(g => g.id === gameId);
    if (!game) {
      setError(`Game "${gameId}" not found`);
      return;
    }

    setLoading(true);
    setError(null);
    
    game.loader()
      .then((Component) => {
        setGameComponent(() => Component);
        setLoading(false);
      })
      .catch((err) => {
        console.error(`Failed to load game ${gameId}:`, err);
        setError(`Failed to load ${game.title}`);
        setLoading(false);
      });
  }, [gameId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-white/70">
        <div className="text-center">
          <div className="text-2xl mb-2">🎮</div>
          <div>Loading {GAME_REGISTRY.find(g => g.id === gameId)?.title || 'Game'}...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400">
        <div className="text-center">
          <div className="text-2xl mb-2">❌</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  if (!GameComponent) {
    return (
      <div className="flex items-center justify-center h-full text-white/70">
        <div className="text-center">
          <div className="text-2xl mb-2">🎯</div>
          <div>Select a game to play</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[500px]">
      <GameComponent 
        vault={vault} 
        setVaultBoth={setVaultBoth}
        playerName={playerName}
        roomId={roomId}
        tierCode={tierCode}
        mode={mode}
      />
    </div>
  );
}

export default function ArcadeOnline() {
  useIOSViewportFix();
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vaultAmt, setVaultAmt] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
const [selectedRoomId, setSelectedRoomId] = useState(null);
const [selectedTier, setSelectedTier] = useState(null);
const [showRoomBrowser, setShowRoomBrowser] = useState(false);
const [showLudoModePicker, setShowLudoModePicker] = useState(false);
const [selectedMode, setSelectedMode] = useState(null); // 'online' | 'bot' | 'local'

  useEffect(() => {
    setMounted(true);
    setVaultAmt(getVault());
    const saved = localStorage.getItem("mleo_player_name") || "";
    if (saved) setPlayerName(saved);
  }, []);

  useEffect(() => {
    if (playerName) {
      localStorage.setItem("mleo_player_name", playerName);
    }
  }, [playerName]);

  // Handle game selection from URL or clicks
useEffect(() => {
  const gameId = router.query.game;
  const roomId = router.query.room;
  const tierParam = router.query.tier;
  const modeParam = router.query.mode || router.query.variant;

  if (gameId && GAME_REGISTRY.some(g => g.id === gameId)) {
    setSelectedGame(gameId);
    setSelectedRoomId(roomId || null);
    setSelectedTier(tierParam ? String(tierParam) : null);
    setSelectedMode(modeParam ? String(modeParam) : null);
    if (gameId === "ludo") {
      setShowLudoModePicker(!modeParam && !roomId);
    } else {
      setShowLudoModePicker(false);
    }
  } else {
    setSelectedGame(null);
    setSelectedRoomId(null);
    setSelectedTier(null);
    setSelectedMode(null);
    setShowLudoModePicker(false);
  }
}, [router.query.game, router.query.room, router.query.tier, router.query.mode, router.query.variant]);

  function setVaultBoth(next) {
    setVault(next);
    setVaultAmt(getVault());
  }

  function selectGame(gameId) {
    // Check if player name is entered
    if (!playerName || playerName.trim() === '') {
      alert('Please enter your player name to start playing!');
      return;
    }

    const game = GAME_REGISTRY.find(g => g.id === gameId);
    
    if (game?.isExternal) {
      // For external games, navigate to the page (replace current page)
      window.location.href = game.href;
      return;
    }

    if (gameId === "ludo") {
      setSelectedGame("ludo");
      setSelectedRoomId(null);
      setSelectedTier(null);
      setShowRoomBrowser(false);
      setShowLudoModePicker(true);
      setSelectedMode(null);

      const query = { ...router.query };
      delete query.game;
      delete query.room;
      delete query.tier;
      delete query.mode;
      delete query.variant;

      router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
      return;
    }
    
    if (game?.isMultiplayer) {
      // For multiplayer games, show room browser first
      setSelectedGame(gameId);
      setShowRoomBrowser(true);
      setShowLudoModePicker(false);
      setSelectedMode(null);
    } else {
      // For single player games, go directly to game
      const url = {
        pathname: router.pathname,
        query: { ...router.query, game: gameId }
      };
      setShowLudoModePicker(false);
      setSelectedMode(null);
      router.push(url, undefined, { shallow: true });
    }
  }

  function handleJoinRoom(roomId, tierCode) {
    // Check if player name is entered
    if (!playerName || playerName.trim() === '') {
      alert('Please enter your player name to join a room!');
      return;
    }

    setSelectedRoomId(roomId);
    setSelectedTier(tierCode || '10K');
    setShowRoomBrowser(false);
    setShowLudoModePicker(false);
    if (selectedGame === "ludo") {
      setSelectedMode("online");
    }
    const query = { ...router.query, game: selectedGame, room: roomId };
    if (tierCode) query.tier = tierCode;
    if (selectedGame === "ludo") {
      query.mode = "online";
    }
    router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  }

  function chooseLudoMode(mode) {
    if (mode === "online") {
      setSelectedMode("online");
      setShowLudoModePicker(false);
      setShowRoomBrowser(true);
      setSelectedRoomId(null);
      setSelectedTier(null);
      return;
    }

    const baseQuery = { ...router.query, game: "ludo", mode };
    delete baseQuery.room;
    delete baseQuery.tier;

    setSelectedMode(mode);
    setShowLudoModePicker(false);
    setShowRoomBrowser(false);
    setSelectedRoomId(null);
    setSelectedTier(null);
    setSelectedGame("ludo");

    router.push({ pathname: router.pathname, query: baseQuery }, undefined, { shallow: true });
  }

  async function leaveTable() {
    if (selectedRoomId) {
      try {
        const client_id = getClientId();
        // Remove player from room
        await supabase
          .from("arcade_room_players")
          .delete()
          .eq("room_id", selectedRoomId)
          .eq("client_id", client_id);
        
        // For Blackjack, also remove from bj_players
        if (selectedGame === 'blackjack') {
          await supabase
            .from("bj_players")
            .delete()
            .eq("client_id", client_id);
        }
        
        // For Poker, also remove from poker_players
        if (selectedGame === 'poker') {
          await supabase
            .from("poker_players")
            .delete()
            .eq("client_id", client_id);
        }
      } catch (error) {
        console.error("Error leaving table:", error);
      }
    }
    
    // Reset state and go back to games
    setSelectedGame(null);
    setSelectedRoomId(null);
    setSelectedTier(null);
    setShowRoomBrowser(false);
    setShowLudoModePicker(false);
    setSelectedMode(null);
    router.push('/arcade-online', undefined, { shallow: true });
  }

  function goBack() {
    if (showRoomBrowser) {
      setShowRoomBrowser(false);
      setSelectedTier(null);
      setSelectedRoomId(null);
      if (selectedGame === "ludo") {
        setShowLudoModePicker(true);
        setSelectedMode(null);
      } else {
        setSelectedGame(null);
        setShowLudoModePicker(false);
        setSelectedMode(null);
      }
    } else if (selectedGame) {
      setSelectedGame(null);
      setSelectedRoomId(null);
      setSelectedTier(null);
      setShowRoomBrowser(false);
      setShowLudoModePicker(false);
      setSelectedMode(null);
      router.push('/arcade-online', undefined, { shallow: true });
    } else {
      router.push('/mining');
    }
  }

  if (!mounted) {
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
      <div
        className="relative w-full min-h-[var(--app-100vh,100svh)] flex flex-col overflow-y-auto bg-gradient-to-br from-indigo-900 via-black to-purple-900"
      >
        {/* Header */}
        <header className="relative px-4 py-6 text-center">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={selectedGame && selectedRoomId ? leaveTable : goBack}
              className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${
                selectedGame && selectedRoomId 
                  ? 'bg-red-600/20 border-red-500/40 hover:bg-red-600/30 text-red-300' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
              }`}
            >
              {showRoomBrowser ? 'BACK' : 
               selectedGame && selectedRoomId ? 'LEAVE' : 
               selectedGame ? 'BACK' : 'BACK'}
            </button>
            <div className="text-center">
              <h1 className="text-3xl font-extrabold text-white mb-2">MLEO Online</h1>
              <p className="text-white/60">
                {showRoomBrowser ? `Choose Room for ${GAME_REGISTRY.find(g => g.id === selectedGame)?.title || 'Game'}` : 
                 selectedGame ? `Playing ${GAME_REGISTRY.find(g => g.id === selectedGame)?.title || 'Game'}` : 
                 'Multiplayer & Single Player Games'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs">Vault</div>
              <div className="text-emerald-400 text-sm font-bold">{fmt(vaultAmt)} MLEO</div>
            </div>
          </div>

          {/* Player Name Input - Only show when no game is selected */}
          {!selectedGame && (
            <div className="max-w-sm mx-auto mb-4">
              <div className="text-center mb-2">
                <label className="text-white/80 text-sm font-medium">Player Registration</label>
                <p className="text-white/60 text-xs mt-1">Enter your name to start playing</p>
              </div>
              <input
                type="text"
                placeholder="Enter your player name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-emerald-400 text-center text-sm"
                maxLength={20}
              />
            </div>
          )}
        </header>

        {/* Content */}
{showLudoModePicker && selectedGame === "ludo" && !selectedMode ? (
          <div className="flex-1 px-4 pb-8">
            <div className="max-w-md mx-auto h-full flex items-center">
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="text-center mb-6">
                  <div className="text-4xl mb-2">🎲</div>
                  <h2 className="text-2xl font-bold text-white mb-1">Ludo</h2>
                  <p className="text-white/60 text-sm">Choose how you want to play</p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => chooseLudoMode("online")}
                    className="w-full px-4 py-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-sm font-semibold text-white"
                  >
                    Online Multiplayer (Rooms)
                  </button>
                  <button
                    onClick={() => chooseLudoMode("bot")}
                    className="w-full px-4 py-2.5 rounded-xl bg-sky-600/90 hover:bg-sky-500 text-sm font-semibold text-white"
                  >
                    Vs Bot (offline)
                  </button>
                  <button
                    onClick={() => chooseLudoMode("local")}
                    className="w-full px-4 py-2.5 rounded-xl bg-purple-600/90 hover:bg-purple-500 text-sm font-semibold text-white"
                  >
                    Local 2–4 players (offline)
                  </button>
                </div>
                <p className="mt-4 text-xs text-white/50 text-center">
                  Bot & Local modes do not require rooms or internet connection.
                </p>
              </div>
            </div>
          </div>
        ) : showRoomBrowser ? (
          /* Room Browser for Multiplayer Games */
          <div className="flex-1 px-4 pb-8">
            <div className="max-w-4xl mx-auto h-full">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-full">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {GAME_REGISTRY.find(g => g.id === selectedGame)?.emoji} {GAME_REGISTRY.find(g => g.id === selectedGame)?.title}
                  </h2>
                  <p className="text-white/60">Choose a room to join or create a new one</p>
                </div>
                <RoomBrowser 
                  gameId={selectedGame}
                  playerName={playerName}
                  onJoinRoom={handleJoinRoom}
                />
              </div>
            </div>
          </div>
        ) : selectedGame ? (
          /* Game Viewport */
          <div className="flex-1 px-4 pb-8 -mt-2">
            <div className="max-w-6xl mx-auto h-full">
              <GameViewport 
                gameId={selectedGame}
                vault={vaultAmt}
                setVaultBoth={setVaultBoth}
                playerName={playerName}
                roomId={selectedRoomId}
                tierCode={TIERED_GAMES.includes(selectedGame) ? (selectedTier || '10K') : undefined}
                mode={selectedMode}
              />
            </div>
          </div>
        ) : (
          /* Games Grid */
          <section className="px-4 pb-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-w-6xl mx-auto">
              {GAME_REGISTRY.map((game, idx) => (
                <GameCard key={idx} game={game} onSelect={selectGame} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}