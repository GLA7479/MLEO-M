// pages/arcade-online.js - MLEO Arcade Online Hub
// בסגנון דף Arcade הקיים עם GameCard components
import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";

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

// Game Registry with lazy loading
const GAME_REGISTRY = [
  {
    id: "dice",
    title: "Dice",
    emoji: "🎲",
    description: "Roll the dice! Choose high or low and win big!",
    color: "#3B82F6",
    isMultiplayer: false,
    loader: () => import("../games-online/DiceGame").then(m => m.default)
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
function GameViewport({ gameId, vault, setVaultBoth, playerName, roomId }) {
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
    <GameComponent 
      vault={vault} 
      setVaultBoth={setVaultBoth}
      playerName={playerName}
      roomId={roomId}
    />
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
    if (gameId && GAME_REGISTRY.some(g => g.id === gameId)) {
      setSelectedGame(gameId);
    } else {
      setSelectedGame(null);
    }
  }, [router.query.game]);

  function setVaultBoth(next) {
    setVault(next);
    setVaultAmt(getVault());
  }

  function selectGame(gameId) {
    const url = {
      pathname: router.pathname,
      query: { ...router.query, game: gameId }
    };
    router.push(url, undefined, { shallow: true });
  }

  function goBack() {
    if (selectedGame) {
      setSelectedGame(null);
      router.push('/arcade-online', undefined, { shallow: true });
    } else {
      router.push('/');
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
        className="relative w-full overflow-hidden bg-gradient-to-br from-indigo-900 via-black to-purple-900" 
        style={{ height: 'var(--app-100vh,100svh)' }}
      >
        {/* Header */}
        <header className="relative px-4 py-6 text-center">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={goBack}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold"
            >
              ← {selectedGame ? 'BACK TO GAMES' : 'BACK'}
            </button>
            <div className="text-center">
              <h1 className="text-3xl font-extrabold text-white mb-2">🎮 MLEO Arcade Online</h1>
              <p className="text-white/60">
                {selectedGame ? `Playing ${GAME_REGISTRY.find(g => g.id === selectedGame)?.title || 'Game'}` : 'Multiplayer & Single Player Games'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-sm">Vault</div>
              <div className="text-emerald-400 text-lg font-bold">{fmt(vaultAmt)} MLEO</div>
            </div>
          </div>

          {/* Player Name Input */}
          <div className="max-w-md mx-auto mb-6">
            <input
              type="text"
              placeholder="Enter your player name..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-emerald-400 text-center"
              maxLength={20}
            />
          </div>
        </header>

        {/* Content */}
        {selectedGame ? (
          /* Game Viewport */
          <div className="flex-1 px-4 pb-8">
            <div className="max-w-6xl mx-auto h-full">
              <GameViewport 
                gameId={selectedGame}
                vault={vaultAmt}
                setVaultBoth={setVaultBoth}
                playerName={playerName}
                roomId={selectedGame === 'dice' ? null : 'default-room'}
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