// pages/arcade-online.js - MLEO Arcade Online Hub
// בסגנון דף Arcade הקיים עם GameCard components
import { useCallback, useEffect, useRef, useState } from "react";
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

/** Same warm gradient family as pages/arcade.js (local duplicate — do not import arcade). */
const ARCADE_ONLINE_BG =
  "linear-gradient(135deg, #1a1a1a 0%, #3a2a0a 50%, #1a1a1a 100%)";

const TIERED_GAMES = ['poker', 'backgammon', 'roulette', 'blackjack', 'war', 'ludo', 'bingo', 'checkers'];

/** Mobile hub: 3 pages — 4 + 4 + 2 games from GAME_REGISTRY order (no reorder). */
const HUB_PAGE_SLICES = [
  [0, 4],
  [4, 8],
  [8, 10],
];
const HUB_PAGE_COUNT = HUB_PAGE_SLICES.length;

const SWIPE_THRESHOLD_PX = 40;
const SWIPE_INTENT_RATIO = 1.2;

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
    title: "21 Challenge",
    emoji: "🃏",
    description: "A live multiplayer 21 card challenge with room-based play.",
    color: "#10B981",
    isMultiplayer: true,
    loader: () => import("../games-online/BlackjackMP").then(m => m.default)
  },
  {
    id: "poker",
    title: "Card Arena",
    emoji: "♠️",
    description: "A live multiplayer card room built around hand strategy and table play.",
    color: "#8B5CF6",
    isMultiplayer: true,
    loader: () => import("../games-online/PokerMP").then(m => m.default)
  },
  {
    id: "roulette",
    title: "Color Wheel",
    emoji: "🔴",
      description: "Color Wheel! Spin the wheel and unlock bigger rewards!",
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
    description: "Bingo like Ludo! Online multiplayer (2-8 players) or local play. Earn rewards for rows and full board!",
    color: "#EC4899",
    isMultiplayer: true,
    loader: () => import("../games-online/BingoMP").then(m => m.default)
  },
  {
    id: "rummy51",
    title: "Rummy 51",
    emoji: "🃏",
    description: "Classic Rummy 51! Initial meld must be 51+ points. Jokers are wild. Sets and runs with friends!",
    color: "#F59E0B",
    isMultiplayer: true,
    loader: () => import("../games-online/Rummy51MP").then(m => m.default)
  },
  {
    id: "checkers",
    title: "Checkers",
    emoji: "⚫",
    description: "Classic Checkers (Draughts)! Two-player strategy game with mandatory captures and kings.",
    color: "#3B82F6",
    isMultiplayer: true,
    loader: () => import("../games-online/CheckersMP").then(m => m.default)
  },
  {
    id: "poker-tables",
    title: "Card Rooms",
    emoji: "🎰",
    description: "Live multiplayer card tables with drop-in/drop-out play and session-based progression. Includes strategic heads-up rounds (pre-flop through river).",
    color: "#7C3AED",
    isMultiplayer: false,
    isExternal: true,
    href: "/tournament"
  },
];

function hubGamesForPage(pageIndex) {
  const slice = HUB_PAGE_SLICES[pageIndex];
  if (!slice) return [];
  return GAME_REGISTRY.slice(slice[0], slice[1]);
}

// GameCard component (כמו בדף Arcade)
function GameCard({ game, onSelect }) {
  return (
    <article
      className="relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-white/10 bg-transparent p-4 shadow-md backdrop-blur-md transition-all hover:scale-105 hover:border-white/25 hover:shadow-lg"
      style={{
        background:
          "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)",
        height: "187px",
      }}
      onClick={() => onSelect(game.id)}
    >
      {game.isMultiplayer && (
        <div className="absolute left-2 top-2 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-extrabold text-emerald-200">
          MP
        </div>
      )}

      <div className="absolute left-0 right-0 text-center" style={{ top: "15px" }}>
        <div className="text-5xl leading-none">{game.emoji}</div>
      </div>

      <div
        className="absolute left-0 right-0 flex items-center justify-center px-2 text-center"
        style={{ top: "80px", height: "45px" }}
      >
        <h2 className="line-clamp-2 text-base font-bold leading-tight">{game.title}</h2>
      </div>

      <div className="absolute bottom-3 left-4 right-4">
        <div
          className="block w-full rounded-md px-4 py-2.5 text-center text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
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
  /** Mobile hub pager (hub view only; 0..HUB_PAGE_COUNT-1). */
  const [hubPageIndex, setHubPageIndex] = useState(0);
  const hubTouchStartRef = useRef({
    x: 0,
    y: 0,
    active: false,
    blocked: false,
  });

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

  const setHubPageIndexClamped = useCallback((nextIndexOrUpdater) => {
    setHubPageIndex((prev) => {
      const next =
        typeof nextIndexOrUpdater === "function"
          ? nextIndexOrUpdater(prev)
          : nextIndexOrUpdater;
      return Math.max(0, Math.min(HUB_PAGE_COUNT - 1, next));
    });
  }, []);

  function handleHubTouchStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    const interactiveStart = e.target?.closest?.(
      "button, a, input, textarea, select, [role='button']"
    );
    hubTouchStartRef.current = {
      x: t.clientX,
      y: t.clientY,
      active: true,
      blocked: Boolean(interactiveStart),
    };
  }

  function handleHubTouchEnd(e) {
    const start = hubTouchStartRef.current;
    hubTouchStartRef.current = {
      x: 0,
      y: 0,
      active: false,
      blocked: false,
    };
    if (!start.active || start.blocked) return;
    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx < SWIPE_THRESHOLD_PX) return;
    if (adx <= ady * SWIPE_INTENT_RATIO) return;

    if (dx < 0) {
      setHubPageIndexClamped((prev) => prev + 1);
    } else {
      setHubPageIndexClamped((prev) => prev - 1);
    }
  }

  if (!mounted) {
    return (
      <Layout address={address} isConnected={isConnected} vaultAmount={0}>
        <div
          className="flex h-screen items-center justify-center text-white"
          style={{ background: ARCADE_ONLINE_BG }}
        >
          <div className="text-lg font-semibold">Loading…</div>
        </div>
      </Layout>
    );
  }

  const hubSubtitle = showRoomBrowser
    ? `Choose Room for ${GAME_REGISTRY.find((g) => g.id === selectedGame)?.title || "Game"}`
    : selectedGame
      ? `Playing ${GAME_REGISTRY.find((g) => g.id === selectedGame)?.title || "Game"}`
      : "Multiplayer & Single Player Games";

  const backIsLeave = Boolean(selectedGame && selectedRoomId);
  const isHubView = !selectedGame && !showRoomBrowser;

  return (
    <Layout address={address} isConnected={isConnected} vaultAmount={vaultAmt}>
      <div
        className={`relative flex w-full flex-col text-white ${
          isHubView
            ? "max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:min-h-0 max-md:overflow-hidden md:min-h-[var(--app-100vh,100svh)] md:overflow-y-auto"
            : "min-h-[var(--app-100vh,100svh)] overflow-y-auto"
        }`}
        style={{ background: ARCADE_ONLINE_BG }}
      >
        <header className="shrink-0 px-3 pb-2 pt-3 sm:px-4 md:px-5">
          <div className="mx-auto max-w-7xl space-y-2 rounded-xl border border-white/20 bg-black/40 px-2.5 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={backIsLeave ? leaveTable : goBack}
                className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  backIsLeave
                    ? "border border-red-500/45 bg-red-600/25 text-red-200 hover:bg-red-600/35"
                    : "border border-white/25 bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {showRoomBrowser
                  ? "BACK"
                  : backIsLeave
                    ? "LEAVE"
                    : selectedGame
                      ? "BACK"
                      : "BACK"}
              </button>
              <div className="min-w-0 flex-1 px-1 text-center">
                <h1 className="truncate text-[15px] font-extrabold leading-tight tracking-tight sm:text-base">
                  MLEO Online
                </h1>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/75">
                  {hubSubtitle}
                </p>
              </div>
              <div
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-semibold"
                title="Vault balance"
              >
                <span aria-hidden>💰</span>
                <span className="tabular-nums text-emerald-400">{fmt(vaultAmt)}</span>
                <span className="text-white/80">MLEO</span>
              </div>
            </div>

            {!selectedGame && (
              <div className="space-y-1.5 border-t border-white/15 pt-2">
                <div className="text-center">
                  <label className="text-[11px] font-semibold text-white/90">
                    Player Registration
                  </label>
                  <p className="mt-0.5 text-[10px] text-white/65">
                    Enter your name to start playing
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Enter your player name..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-[11px] text-white placeholder-white/45 focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/35 sm:text-sm"
                  maxLength={20}
                />
              </div>
            )}
          </div>
        </header>

        {showLudoModePicker && selectedGame === "ludo" && !selectedMode ? (
          <div className="flex-1 px-3 pb-8 sm:px-4 md:px-5">
            <div className="mx-auto flex h-full max-w-md items-center">
              <div className="w-full rounded-xl border border-white/20 bg-black/35 p-5 shadow-sm md:p-6">
                <div className="mb-6 text-center">
                  <div className="mb-2 text-4xl">🎲</div>
                  <h2 className="mb-1 text-2xl font-bold text-white">Ludo</h2>
                  <p className="text-sm text-white/70">Choose how you want to play</p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => chooseLudoMode("online")}
                    className="w-full rounded-xl bg-emerald-600/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Online Multiplayer (Rooms)
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseLudoMode("bot")}
                    className="w-full rounded-xl bg-sky-600/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
                  >
                    Vs Bot (offline)
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseLudoMode("local")}
                    className="w-full rounded-xl bg-purple-600/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-500"
                  >
                    Local 2–4 players (offline)
                  </button>
                </div>
                <p className="mt-4 text-center text-xs text-white/50">
                  Bot & Local modes do not require rooms or internet connection.
                </p>
              </div>
            </div>
          </div>
        ) : showRoomBrowser ? (
          <div className="flex-1 px-3 pb-8 sm:px-4 md:px-5">
            <div className="mx-auto h-full max-w-4xl">
              <div className="h-full rounded-xl border border-white/20 bg-black/35 p-5 shadow-sm md:p-6">
                <div className="mb-6 text-center">
                  <h2 className="mb-2 text-2xl font-bold text-white">
                    {GAME_REGISTRY.find((g) => g.id === selectedGame)?.emoji}{" "}
                    {GAME_REGISTRY.find((g) => g.id === selectedGame)?.title}
                  </h2>
                  <p className="text-sm text-white/70">
                    Choose a room to join or create a new one
                  </p>
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
          <div className="flex-1 px-3 pb-8 sm:px-4 md:px-5">
            <div className="mx-auto h-full max-w-6xl">
              <GameViewport
                gameId={selectedGame}
                vault={vaultAmt}
                setVaultBoth={setVaultBoth}
                playerName={playerName}
                roomId={selectedRoomId}
                tierCode={
                  TIERED_GAMES.includes(selectedGame)
                    ? selectedTier || "10K"
                    : undefined
                }
                mode={selectedMode}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:block md:min-h-0 md:overflow-visible">
            <section className="hidden px-3 pb-8 sm:px-4 md:block md:px-5">
              <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-2 lg:grid-cols-6 lg:gap-2">
                {GAME_REGISTRY.map((game) => (
                  <GameCard key={game.id} game={game} onSelect={selectGame} />
                ))}
              </div>
            </section>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-[max(0.2rem,env(safe-area-inset-bottom))] pt-1 md:hidden">
              <div className="mb-1 mt-1 flex shrink-0 justify-center gap-1 px-0.5">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Games page ${i + 1}`}
                    onClick={() => setHubPageIndexClamped(i)}
                    className={`max-w-[4.5rem] flex-1 rounded-lg border py-1 text-[11px] font-extrabold transition-all ${
                      hubPageIndex === i
                        ? "border-amber-400/70 bg-amber-500/40 text-amber-50 shadow-sm"
                        : "border-white/15 bg-white/5 text-white/85"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <div
                className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
                onTouchStart={handleHubTouchStart}
                onTouchEnd={handleHubTouchEnd}
              >
                <div
                  className={`mx-auto grid min-h-0 w-full min-w-0 flex-1 gap-2 px-0.5 ${
                    hubPageIndex === 2
                      ? "grid-cols-2 grid-rows-1 content-start"
                      : "grid-cols-2 grid-rows-2 content-center"
                  }`}
                  aria-label="Games"
                >
                  {hubGamesForPage(hubPageIndex).map((game) => (
                    <GameCard key={game.id} game={game} onSelect={selectGame} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}