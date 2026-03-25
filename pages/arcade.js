// pages/arcade.js - MLEO Arcade/Gaming Hub
import { useState, useEffect, useMemo, useRef } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { ConnectButton, useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { getFreePlayStatus, formatTimeRemaining } from "../lib/free-play-system";
import { ensureCsrfToken } from "../lib/arcadeDeviceClient";
import {
  debitSharedVault,
  initSharedVault,
  readSharedVault,
  subscribeSharedVault,
} from "../lib/sharedVault";

const ARCADE_BG = "linear-gradient(135deg, #1a1a1a 0%, #3a2a0a 50%, #1a1a1a 100%)";

/** Mobile lobby: 4 tabs × up to 9 games (3×3) each, sequential slices of `games` */
const MOBILE_GAMES_PER_GROUP = 9;
const MOBILE_ARCADE_GROUPS = [
  { id: 0, label: "1", shortLabel: "1–9" },
  { id: 1, label: "2", shortLabel: "10–18" },
  { id: 2, label: "3", shortLabel: "19–27" },
  { id: 3, label: "4", shortLabel: "28+" },
];

/** Desktop lobby: 4 tabs × 8 games (4×2) per page — slice size is separate from mobile (9). */
const DESKTOP_GAMES_PER_GROUP = 8;

// ==== On-chain Claim (TBNB) config ====
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || process.env.NEXT_PUBLIC_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const CLAIM_FN = process.env.NEXT_PUBLIC_MLEO_CLAIM_FN || "claim";

// Minimal ABI v3: claim(gameId, amount)
const MINING_CLAIM_ABI = [{
  type: "function",
  name: "claim",
  stateMutability: "nonpayable",
  inputs: [
    { name: "gameId", type: "uint256" },
    { name: "amount", type: "uint256" }
  ],
  outputs: []
}];

const ALLOW_TESTNET_WALLET_FLAG =
  (process.env.NEXT_PUBLIC_ALLOW_TESTNET_WALLET || "").toLowerCase() === "1" ||
  (process.env.NEXT_PUBLIC_ALLOW_TESTNET_WALLET || "").toLowerCase() === "true";

/** One grapheme for mobile tiles — avoids stacked multi-emoji (e.g. 🎰🎴) */
function compactCardEmoji(emoji) {
  if (emoji == null || typeof emoji !== "string") return "🎮";
  const t = emoji.trim();
  if (!t) return "🎮";
  try {
    const Seg = Intl.Segmenter;
    if (typeof Seg === "function") {
      for (const { segment } of new Seg("en", { granularity: "grapheme" }).segment(t)) {
        return segment;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return Array.from(t)[0] ?? "🎮";
}

function GameCard({ title, emoji, description, reward, href, color, freePlayStatus, comingSoon = false, compact = false, lobby = false }) {
  const [showInfo, setShowInfo] = useState(false);
  
  return (
    <>
      <article 
        className={`relative overflow-hidden rounded-lg border border-white/10 shadow-md backdrop-blur-md transition-all duration-300 ease-out ${comingSoon ? "opacity-60" : ""} ${
          lobby
            ? "flex h-full min-h-0 w-full min-w-0 flex-col rounded-xl p-3.5 shadow-lg hover:border-white/25 hover:shadow-xl"
            : compact
              ? "h-full min-h-0 p-0"
              : "flex flex-col p-5 shadow-lg hover:scale-[1.02] hover:border-white/25 hover:shadow-xl"
        }`}
        style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
          ...(compact || lobby ? { minHeight: 0 } : { height: "200px" }),
        }}
      >
        {/* Info button - fixed position top right */}
        <button
          onClick={() => setShowInfo(true)}
          type="button"
          className={`absolute z-10 flex items-center justify-center border border-white/15 bg-white/10 leading-none transition-all hover:bg-white/20 ${
            compact
              ? "right-1 top-1 h-10 min-h-[40px] w-10 min-w-[40px] rounded-full border-white/10 bg-white/5 text-sm hover:bg-white/12"
              : lobby
                ? "right-2 top-2 h-9 w-9 rounded-full text-base"
                : "right-2 top-2 h-7 w-7 rounded-full text-sm"
          }`}
          title="Info"
        >
          ℹ️
        </button>

        {lobby ? (
          <>
            <div className="pointer-events-none shrink-0 select-none pb-1 pt-1 text-center text-4xl leading-none lg:text-5xl xl:text-[3.35rem]">
              {emoji}
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center">
              {comingSoon ? (
                <h2 className="line-clamp-2 text-sm font-extrabold leading-snug text-amber-300 lg:text-base">
                  COMING SOON
                </h2>
              ) : (
                <h2 className="line-clamp-2 text-sm font-extrabold leading-snug lg:text-base">{title}</h2>
              )}
              {!comingSoon && reward ? (
                <p
                  className="mt-0 max-w-full truncate px-1 text-[11px] font-semibold leading-snug text-amber-200/95 lg:text-xs"
                  title={reward}
                >
                  {reward}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 pt-1">
              {comingSoon ? (
                <button
                  type="button"
                  disabled
                  className="block w-full cursor-not-allowed rounded-xl py-2.5 text-center text-sm font-extrabold leading-none text-white/50 opacity-50 shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                  }}
                >
                  PLAY
                </button>
              ) : (
                <Link
                  href={href}
                  className="block w-full rounded-xl py-2.5 text-center text-sm font-extrabold leading-none text-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:opacity-90 lg:py-3 lg:text-[15px]"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  }}
                >
                  PLAY
                </Link>
              )}
            </div>
          </>
        ) : compact ? (
          <>
            {/* 3×3 mobile: inner layout fixed — outer tile height comes from grid only */}
            <div className="flex h-full min-h-0 flex-col px-1 pb-1 pl-1 pr-2.5 pt-1.5">
              <div className="mt-1 flex shrink-0 justify-center leading-none">
                <span
                  className="inline-block translate-y-0.5 select-none text-[2.9rem] leading-none sm:text-[3.1rem]"
                  aria-hidden
                >
                  {compactCardEmoji(emoji)}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-0 px-0.5 text-center">
                {comingSoon ? (
                  <h2 className="text-[11px] font-bold leading-tight line-clamp-2 text-amber-300">
                    COMING SOON
                  </h2>
                ) : (
                  <h2 className="text-[11px] font-bold leading-tight line-clamp-2">{title}</h2>
                )}
                {reward ? (
                  <p
                    className="mt-0 max-w-full px-0.5 text-[9px] font-semibold leading-none text-amber-200/95 line-clamp-1"
                    title={reward}
                  >
                    {reward}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 pt-0.5">
                {comingSoon ? (
                  <button
                    type="button"
                    disabled
                    className="block w-full min-h-[33px] cursor-not-allowed rounded-md py-1.5 text-center text-[11px] font-bold leading-none text-white/50 opacity-50 shadow-inner"
                    style={{
                      background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                    }}
                  >
                    PLAY
                  </button>
                ) : (
                  <Link
                    href={href}
                    className="flex min-h-[33px] w-full items-center justify-center rounded-md py-1.5 text-center text-[11px] font-bold leading-none text-white shadow-sm active:opacity-90"
                    style={{
                      background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                    }}
                  >
                    PLAY
                  </Link>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="absolute left-0 right-0 text-center" style={{ top: "18px" }}>
              <div className="text-[2.75rem] leading-none">{emoji}</div>
            </div>
            <div
              className="absolute left-0 right-0 flex items-center justify-center px-3 text-center"
              style={{ top: "86px", height: "52px" }}
            >
              {comingSoon ? (
                <h2 className="line-clamp-2 text-[15px] font-bold leading-snug text-amber-300">
                  COMING SOON
                </h2>
              ) : (
                <h2 className="line-clamp-2 text-[15px] font-bold leading-snug">{title}</h2>
              )}
            </div>
            <div className="absolute left-4 right-4" style={{ bottom: "14px" }}>
              {comingSoon ? (
                <button
                  disabled
                  className="block w-full cursor-not-allowed rounded-lg px-4 py-2.5 text-center text-sm font-bold text-white/50 opacity-50 shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                  }}
                >
                  PLAY
                </button>
              ) : (
                <Link
                  href={href}
                  className="block w-full rounded-lg px-4 py-2.5 text-center text-sm font-bold text-white shadow-md transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  }}
                >
                  PLAY
                </Link>
              )}
            </div>
          </>
        )}
      </article>
      
      {/* Info Modal */}
      {showInfo && (
        <Modal open={showInfo} onClose={() => setShowInfo(false)}>
          <div className="text-center mb-4">
            <div className="text-6xl mb-3">{emoji}</div>
            <h2 className="text-2xl font-bold mb-2">{title}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg mb-2">About This Game</h3>
              <p className="text-zinc-300">{description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 text-center">
                <div className="text-sm opacity-70 mb-1">Session Cost</div>
                <div className="text-xl font-bold text-amber-400">100+ MLEO</div>
              </div>
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 text-center">
                <div className="text-sm opacity-70 mb-1">Top Reward Tier</div>
                <div className="text-xl font-bold text-green-400">{reward}</div>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">How to Play</h3>
              <p className="text-zinc-300">Click "PLAY NOW" to start the game. Each session uses 100 MLEO or more depending on the selected mode. Complete runs, reach milestones, and collect reward boosts based on your results.</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ open, onClose, children, title = "🎮 How to Play", sheetOnMobile = false }) {
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const root = modalRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const prevActive = document.activeElement;
    closeBtnRef.current?.focus();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (prevActive && typeof prevActive.focus === "function") {
        prevActive.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-0 flex justify-center px-0 sm:px-4 ${
          sheetOnMobile ? "items-end pb-0 sm:items-center sm:pb-0" : "items-center"
        }`}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          className={`w-full max-w-sm bg-zinc-900 border border-zinc-800 shadow-2xl overflow-auto ${
            sheetOnMobile
              ? "rounded-t-2xl sm:rounded-2xl max-h-[88dvh] sm:max-h-[85vh]"
              : "rounded-2xl max-h-[85vh]"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
            <h3 className="text-lg sm:text-xl font-bold text-white pr-2">{title}</h3>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1 text-zinc-300 hover:text-white hover:bg-zinc-800"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
          <div className="px-5 py-6 text-zinc-200 leading-relaxed space-y-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** category: featured | cards | picks | action | classics | soon — used for mobile lobby filters */
const games = [
  {
    title: "Drop Run",
    emoji: "🎯",
    description: "Drop the ball through pegs and aim for high-value reward zones.",
    reward: "UP TO ×40",
    href: "/plinko",
    color: "#3B82F6",
    category: "featured",
  },
  {
    title: "Sky Run",
    emoji: "📈",
    description: "Track the live boost curve and lock in your result before the run ends.",
    reward: "UP TO ×10",
    href: "/crash",
    color: "#DC2626",
    category: "featured",
  },
  {
    title: "Diamonds",
    emoji: "💎",
    description: "Find diamonds, avoid bombs! 4 difficulty levels from Easy to Expert!",
    reward: "UP TO ×17+",
    href: "/diamonds",
    color: "#0EA5E9",
    category: "featured",
  },
  {
    title: "21 Challenge",
    emoji: "♠️",
    description: "Reach 21 with smart card decisions in this fast card challenge.",
    reward: "UP TO ×2.5",
    href: "/21-challenge",
    color: "#10B981",
    category: "cards",
  },
  {
    title: "Card Arena",
    emoji: "🎴",
    description: "Build the strongest hand using your cards and the shared board.",
    reward: "UP TO ×800",
    href: "/card-arena",
    color: "#8B5CF6",
    category: "featured",
  },
  {
    title: "Hi-Lo Cards",
    emoji: "📊",
    description: "Guess if the next card is higher or lower. Build streaks for huge multipliers!",
    reward: "Unlimited",
    href: "/hilo",
    color: "#059669",
    category: "cards",
  },
  {
    title: "Triple Cards",
    emoji: "♦️",
    description: "Fast three-card challenge with quick round results.",
    reward: "UP TO ×65",
    href: "/triple-cards",
    color: "#EC4899",
    category: "cards",
  },
  {
    title: "Ultimate Cards",
    emoji: "🃏",
    description: "A strategy-focused card mode with staged decisions and stronger reward tiers.",
    reward: "UP TO ×2",
    href: "/ultimate-cards",
    color: "#6366F1",
    category: "cards",
  },
  {
    title: "Ladder",
    emoji: "🪜",
    description: "Climb the ladder! Choose left or right to climb higher - lock in result before you fall!",
    reward: "UP TO ×12",
    href: "/ladder",
    color: "#9333EA",
    category: "featured",
  },
  {
    title: "Bomb Squad",
    emoji: "💣",
    description: "Defuse the bomb! Cut the correct wire at each level - wrong wire = BOOM!",
    reward: "UP TO ×17",
    href: "/bomb",
    color: "#DC2626",
    category: "action",
  },
  {
    title: "Mystery Box",
    emoji: "🎁",
    description: "Choose 1 box from 10! Find the grand reward or walk away empty!",
    reward: "UP TO ×3.49",
    href: "/mystery",
    color: "#F59E0B",
    category: "picks",
  },
  {
    title: "Mystery Chamber",
    emoji: "🔫",
    description: "Choose your path through 6 chambers and secure your progress before the danger appears.",
    reward: "UP TO ×1.84",
    href: "/chamber",
    color: "#64748B",
    category: "picks",
  },
  {
    title: "Speed Track",
    emoji: "🏇",
    description: "Pick your racer and follow the track to see how your choice performs.",
    reward: "UP TO ×3.25",
    href: "/horse",
    color: "#16A34A",
    category: "action",
  },
  {
    title: "Target Shooter",
    emoji: "🏹",
    description: "Hit all targets in 20 seconds! Fast clicks = big wins!",
    reward: "UP TO ×2.00",
    href: "/shooter",
    color: "#EA580C",
    category: "action",
  },
  {
    title: "Triple Dice",
    emoji: "🀄",
    description: "A fast dice challenge based on totals, patterns, and bonus outcomes.",
    reward: "UP TO ×50",
    href: "/triple-dice",
    color: "#B91C1C",
    category: "action",
  },
  {
    title: "Gold Rush Digger",
    emoji: "⛏️",
    description: "Dig a 5×5 treasure map! Find gems and grand rewards - avoid 6 skulls!",
    reward: "UP TO ×1.67",
    href: "/goldrush",
    color: "#D97706",
    category: "picks",
  },
  {
    title: "Limit Run",
    emoji: "🔥",
    description: "Set your target boost and see whether your run reaches it.",
    reward: "UP TO ×100",
    href: "/limbo",
    color: "#6366F1",
    category: "featured",
  },
  {
    title: "Dice Pick",
    emoji: "⚄",
    description: "Choose your target range and roll for a result-based reward tier.",
    reward: "UP TO ×99",
    href: "/dice-over-under",
    color: "#14B8A6",
    category: "picks",
  },
  {
    title: "Color Wheel",
    emoji: "🔴",
    description: "Spin the wheel and land on color-based reward zones with different outcomes.",
    reward: "UP TO ×1.97",
    href: "/color-wheel",
    color: "#7C3AED",
    category: "classics",
  },
  {
    title: "Checkers",
    emoji: "♟️",
    description: "Classic checkers vs bot! Capture all pieces to win!",
    reward: "UP TO ×1.92",
    href: "/checkers",
    color: "#DC2626",
    category: "classics",
  },
  {
    title: "Backgammon",
    emoji: "🎲",
    description: "Classic backgammon vs bot! Bear off all pieces first to win!",
    reward: "UP TO ×1.92",
    href: "/backgammon",
    color: "#D97706",
    category: "classics",
  },
  {
    title: "Dragon Tower",
    emoji: "🐉",
    description: "Climb 10 floors through the dragon's lair! 3 difficulty modes!",
    reward: "UP TO ×22",
    href: "/dragon-tower",
    color: "#DC2626",
    category: "picks",
  },
  {
    title: "Symbol Match",
    emoji: "💰",
    description: "Match symbols across 5 reels to unlock bonus reward patterns.",
    reward: "UP TO ×492.5",
    href: "/symbol-match",
    color: "#FBBF24",
    category: "picks",
  },
  {
    title: "Mega Spin Board",
    emoji: "🎡",
    description: "Spin across 40 segments and land on different reward tiers and bonus events.",
    reward: "UP TO ×2.12",
    href: "/mega-wheel",
    color: "#A855F7",
    category: "action",
  },
  {
    title: "Number Hunt",
    emoji: "🎱",
    description: "Choose your numbers and track how many matches you hit in each round.",
    reward: "UP TO ×188",
    href: "/keno",
    color: "#6366F1",
    category: "classics",
  },
  {
    title: "Dice Arena",
    emoji: "🎲",
    description: "Roll the dice through different outcome zones and unlock score-based rewards.",
    reward: "UP TO ×8.6",
    href: "/dice-arena",
    color: "#16A34A",
    category: "classics",
  },
  {
    title: "Card Duel",
    emoji: "♥️",
    description: "Choose between card sides and follow the result in a fast head-to-head round.",
    reward: "UP TO ×9.1",
    href: "/card-duel",
    color: "#9333EA",
    category: "cards",
  },
  {
    title: "Quick Flip",
    emoji: "🪙",
    description: "Choose a side and reveal the result in a quick one-tap challenge.",
    reward: "UP TO ×1.92",
    href: "/coin-flip",
    color: "#F59E0B",
    category: "action",
  },
  {
    title: "Sky Run X",
    emoji: "📈",
    description: "Track the live boost curve and lock in your result before the run ends.",
    reward: "×10",
    href: "/crash2",
    color: "#EF4444",
    comingSoon: true,
    category: "soon",
  },
  {
    title: "Drop Run X",
    emoji: "🎲",
    description: "Enhanced Drop Run with 17 rows, wall penalty, and maximized play area!",
    reward: "×10",
    href: "/plinko2",
    color: "#8B5CF6",
    comingSoon: true,
    category: "soon",
  },
  {
    title: "Coming Soon",
    emoji: "🚀",
    description: "A new exciting game is coming soon! Stay tuned for updates.",
    reward: "TBA",
    href: "#",
    color: "#6366F1",
    comingSoon: true,
    category: "soon",
  },
];

export default function ArcadeHub() {
  const [vault, setVault] = useState(0);
  const [freePlayStatus, setFreePlayStatus] = useState({
    tokens: 0,
    maxTokens: 5,
    hasTokens: false,
    isFull: false,
    timeUntilNext: 0,
  });
  const [freePlayCountdown, setFreePlayCountdown] = useState(0);
  const [freePlayLoaded, setFreePlayLoaded] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showFreePlayModal, setShowFreePlayModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [collectAmount, setCollectAmount] = useState(100);
  const [claiming, setClaiming] = useState(false);
  const [devPassword, setDevPassword] = useState("");
  const [showDevButton, setShowDevButton] = useState(false);
  const [addingCoins, setAddingCoins] = useState(false);
  const [mobileGroupIndex, setMobileGroupIndex] = useState(0);
  const [desktopGroupIndex, setDesktopGroupIndex] = useState(0);
  const [showArcadeInfoModal, setShowArcadeInfoModal] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0, active: false, blocked: false });

  // Wagmi hooks
  const { openConnectModal } = useConnectModal();
  const { address, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  
  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return Math.floor(n).toString();
  }
  
  // Update free play status
  async function updateFreePlayStatus() {
    try {
      const status = await getFreePlayStatus();
      setFreePlayStatus(status);
      setFreePlayCountdown(status.timeUntilNext || 0);
      setFreePlayLoaded(true);
    } catch (error) {
      console.error("Failed to update free play status:", error);
    }
  }

  // Countdown timer - decrement every second
  useEffect(() => {
    const id = setInterval(() => {
      setFreePlayCountdown((prev) => {
        if (freePlayStatus.isFull || freePlayStatus.tokens > 0) return 0;
        return Math.max(0, prev - 1000);
      });
    }, 1000);

    return () => clearInterval(id);
  }, [freePlayStatus.isFull, freePlayStatus.tokens]);

  // Auto-refresh when countdown reaches 0
  useEffect(() => {
    if (freePlayStatus.tokens === 0 && !freePlayStatus.isFull && freePlayCountdown === 0) {
      const timer = setTimeout(() => {
        updateFreePlayStatus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [freePlayCountdown, freePlayStatus.tokens, freePlayStatus.isFull]);

  // Add dev coins (testing only)
  async function addDevCoins() {
    if (devPassword !== "7479") {
      alert("Invalid password");
      return;
    }

    setAddingCoins(true);
    try {
      const csrfToken = await ensureCsrfToken();
      const response = await fetch("/api/arcade/vault/dev-credit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ password: devPassword, amount: 10000 }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.success) {
        setVault(result.balance || 0);
        alert(`✅ Added 10,000 MLEO! New balance: ${fmt(result.balance || 0)}`);
        setDevPassword("");
        setShowDevButton(false);
      } else {
        alert(`Failed to add coins: ${result.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to add dev coins:", error);
      alert("Failed to add coins. Please try again.");
    } finally {
      setAddingCoins(false);
    }
  }

  // Collect MLEO to wallet
  async function collectToWallet() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (chainId !== CLAIM_CHAIN_ID) {
      try {
        await switchChain?.({ chainId: CLAIM_CHAIN_ID });
      } catch {
        alert("Switch to BSC Testnet (TBNB)");
        return;
      }
    }

    if (!CLAIM_ADDRESS) {
      alert("Missing CLAIM address");
      return;
    }

    if (collectAmount <= 0 || collectAmount > vault) {
      alert("Invalid amount!");
      return;
    }

    setClaiming(true);
    try {
      const amountUnits = parseUnits(
        Number(collectAmount).toFixed(Math.min(2, MLEO_DECIMALS)),
        MLEO_DECIMALS
      );

      const hash = await writeContractAsync({
        address: CLAIM_ADDRESS,
        abi: MINING_CLAIM_ABI,
        functionName: "claim",
        args: [BigInt(1), amountUnits], // GameId = 1 for Arcade
        chainId: CLAIM_CHAIN_ID,
        account: address,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      const debit = await debitSharedVault(collectAmount, "arcade-claim");
      if (!debit.ok) {
        alert("Claim succeeded on-chain, but shared vault sync failed.");
      } else {
        setVault(debit.balance || 0);
      }

      alert(`✅ Sent ${fmt(collectAmount)} MLEO to wallet!`);
      setShowSettingsModal(false);
    } catch (err) {
      console.error(err);
      alert("Claim failed or rejected");
    } finally {
      setClaiming(false);
    }
  }
  
  // Load vault and free play status on mount
  useEffect(() => {
    let unsub = null;

    async function boot() {
      try {
        initSharedVault();

        const snapshot = await readSharedVault();
        setVault(snapshot.balance || 0);

        unsub = subscribeSharedVault((nextSnapshot) => {
          setVault(nextSnapshot.balance || 0);
        });

        await updateFreePlayStatus();
      } catch (err) {
        console.error("Arcade boot failed:", err);
      }
    }

    boot();
    
    // Refresh free play status every 30 seconds (to correct drift)
    const freePlayInterval = setInterval(() => {
      updateFreePlayStatus();
    }, 30000);
    
    // Refresh on visibility change / page focus
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        try {
          const snapshot = await readSharedVault();
          setVault(snapshot.balance || 0);
        } catch {}
        updateFreePlayStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(freePlayInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (unsub) unsub();
    };
  }, []);

  const mobileGroupGames = useMemo(() => {
    const start = mobileGroupIndex * MOBILE_GAMES_PER_GROUP;
    return games.slice(start, start + MOBILE_GAMES_PER_GROUP);
  }, [mobileGroupIndex]);

  const desktopGroupGames = useMemo(() => {
    const start = desktopGroupIndex * DESKTOP_GAMES_PER_GROUP;
    return games.slice(start, start + DESKTOP_GAMES_PER_GROUP);
  }, [desktopGroupIndex]);

  const SWIPE_THRESHOLD_PX = 40;
  const SWIPE_INTENT_RATIO = 1.2;

  function setMobileGroupIndexClamped(nextIndexOrUpdater) {
    const maxIndex = MOBILE_ARCADE_GROUPS.length - 1;
    setMobileGroupIndex((prev) => {
      const nextIndex =
        typeof nextIndexOrUpdater === "function" ? nextIndexOrUpdater(prev) : nextIndexOrUpdater;
      return Math.max(0, Math.min(maxIndex, nextIndex));
    });
  }

  function handlePagerTouchStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    const interactiveStart = e.target?.closest?.("button, a, input, textarea, select, [role='button']");
    touchStartRef.current = {
      x: t.clientX,
      y: t.clientY,
      active: true,
      blocked: Boolean(interactiveStart),
    };
  }

  function handlePagerTouchEnd(e) {
    const start = touchStartRef.current;
    touchStartRef.current = { x: 0, y: 0, active: false, blocked: false };
    if (!start.active || start.blocked) return;
    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx < SWIPE_THRESHOLD_PX) return;
    if (adx <= ady * SWIPE_INTENT_RATIO) return;

    // Left swipe -> next page, right swipe -> previous page
    if (dx < 0) {
      setMobileGroupIndexClamped((prev) => prev + 1);
    } else {
      setMobileGroupIndexClamped((prev) => prev - 1);
    }
  }

  return (
    <Layout title="MLEO — Arcade Games">
      <main
        className="relative text-white max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:overflow-hidden md:flex md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:flex-col md:overflow-hidden"
        style={{
          background: ARCADE_BG,
        }}
      >
        {/* —— Mobile: fixed-screen lobby (md:hidden) —— */}
        <div className="flex md:hidden flex-col h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden px-2 pt-2 pb-[max(0.2rem,env(safe-area-inset-bottom))] gap-1">
          {/* Top zone: readable control / header block */}
          <header className="flex-shrink-0 rounded-xl border border-white/20 bg-black/40 px-2.5 py-2 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Link
                href="/mining"
                className="rounded-full px-2.5 py-1 text-[11px] font-bold bg-white/10 border border-white/25 hover:bg-white/20 whitespace-nowrap shrink-0"
              >
                ← BACK
              </Link>
              <div className="flex-1 min-w-0 text-center px-1">
                <h1 className="text-[15px] sm:text-base font-extrabold tracking-tight truncate leading-tight">
                  🎮 MLEO Arcade
                </h1>
                <p className="text-[10px] text-white/75 leading-snug line-clamp-2 mt-0.5">
                  Vault • free play • mini-games
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowArcadeInfoModal(true)}
                  className="rounded-lg px-2 py-1 text-[11px] font-bold bg-purple-500/30 border border-purple-400/45 text-purple-100"
                >
                  Info
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="p-1.5 rounded-lg bg-white/10 border border-white/25 hover:bg-white/20"
                  title="Settings"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="w-3.5 h-0.5 bg-white" />
                    <div className="w-3.5 h-0.5 bg-white" />
                    <div className="w-3.5 h-0.5 bg-white" />
                  </div>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowVaultModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 border border-white/25 text-[11px] font-semibold"
              >
                <span>💰</span>
                <span className="text-emerald-400 tabular-nums">{fmt(vault)}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFreePlayModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600/30 to-orange-600/30 border border-amber-500/40 text-[11px] font-semibold max-w-[58%]"
              >
                <span>🎁</span>
                <span className="text-amber-200 truncate">
                  {freePlayLoaded ? `${freePlayStatus.tokens}/${freePlayStatus.maxTokens}` : "…"}
                </span>
                {freePlayStatus.tokens === 0 && !freePlayStatus.isFull && freePlayCountdown > 0 && (
                  <span className="text-[9px] text-amber-300/90 shrink-0">{formatTimeRemaining(freePlayCountdown)}</span>
                )}
              </button>
            </div>
          </header>

          {/* Mobile groups: 4 tabs → 9 games each (no Prev/Next) */}
          <div className="flex-shrink-0 flex justify-center gap-1 px-0.5 mt-1 mb-1">
            {MOBILE_ARCADE_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setMobileGroupIndex(g.id)}
                aria-label={`Games ${g.shortLabel}`}
                className={`flex-1 max-w-[4.5rem] py-1 rounded-lg text-[11px] font-extrabold border transition-all ${
                  mobileGroupIndex === g.id
                    ? "bg-amber-500/40 border-amber-400/70 text-amber-50 shadow-sm"
                    : "bg-white/5 border-white/15 text-white/85"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Middle zone: grid uses 90% of flex slot (~10% shorter rows); spacer below = fixed empty strip before footer */}
          <div
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
            onTouchStart={handlePagerTouchStart}
            onTouchEnd={handlePagerTouchEnd}
          >
            <section
              className="grid h-[90%] min-h-0 w-full shrink-0 grid-cols-3 grid-rows-3 gap-x-0.5 gap-y-px"
              aria-label="Games"
            >
              {mobileGroupGames.map((game, idx) => (
                <GameCard
                  key={`${mobileGroupIndex}-${game.href}-${idx}`}
                  {...game}
                  freePlayStatus={freePlayStatus}
                  comingSoon={game.comingSoon}
                  compact
                />
              ))}
              {Array.from({ length: Math.max(0, MOBILE_GAMES_PER_GROUP - mobileGroupGames.length) }).map((_, i) => (
                <div
                  key={`pad-${i}`}
                  className="rounded-md border border-white/5 bg-white/[0.02] min-h-0 min-w-0"
                  aria-hidden
                />
              ))}
            </section>
            <div
              className="mobile-arcade-grid-undergap min-h-2 max-h-8 flex-1 shrink-0 basis-0"
              aria-hidden
            />
          </div>

          {/* Bottom zone: replaceable footer actions (Back to Home + dev — temporary) */}
          <footer className="mobile-arcade-footer flex-shrink-0 flex flex-col gap-1 pt-1 border-t border-white/20">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Link
                href="/mining"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-[10px] font-bold text-white border border-emerald-400/40"
              >
                <span>⬅️</span>
                <span>Back to Home</span>
              </Link>
              {!showDevButton ? (
                <button
                  type="button"
                  onClick={() => setShowDevButton(true)}
                  className="inline-flex items-center px-2 py-1 rounded-lg bg-red-600/25 border border-red-500/35 text-red-300 text-[10px] font-bold hover:bg-red-600/35"
                  title="Dev Tools"
                >
                  🔧 +10K
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-1 w-full">
                  <input
                    type="password"
                    value={devPassword}
                    onChange={(e) => setDevPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addDevCoins();
                      }
                    }}
                    placeholder="Password"
                    className="px-2 py-1 rounded-md bg-white/10 border border-white/20 text-white text-[10px] placeholder-zinc-500 focus:outline-none focus:border-red-500 w-[100px]"
                  />
                  <button
                    type="button"
                    onClick={addDevCoins}
                    disabled={addingCoins}
                    className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-white text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingCoins ? "…" : "+10K"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDevButton(false);
                      setDevPassword("");
                    }}
                    className="px-2 py-1 rounded-md bg-white/10 border border-white/20 text-white text-[10px] hover:bg-white/20"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </footer>
        </div>

        {/* —— Desktop / tablet: fixed lobby, 4 groups × 8 games (4×2), separate index from mobile —— */}
        <div className="mx-auto hidden min-h-0 w-full max-w-[72rem] flex-1 flex-col overflow-hidden px-3 pb-2 pt-1.5 md:flex">
          {/* Top bar: BACK | Vault + Free play | Info + Settings */}
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 pb-1.5">
            <div className="flex justify-start">
              <Link
                href="/mining"
                className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
              >
                ← BACK
              </Link>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowVaultModal(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-all hover:border-white/30 hover:bg-white/[0.14]"
              >
                <span>💰</span>
                <span className="tabular-nums text-emerald-400">{fmt(vault)} MLEO</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFreePlayModal(true)}
                className="inline-flex max-w-[min(100%,14rem)] cursor-pointer items-center gap-1.5 rounded-full border border-amber-500/35 bg-gradient-to-r from-amber-600/25 to-orange-600/20 px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-all hover:border-amber-400/50 hover:from-amber-600/35"
              >
                <span>🎁</span>
                <span className="truncate text-amber-200">
                  {freePlayLoaded ? `${freePlayStatus.tokens}/${freePlayStatus.maxTokens} Free` : "Loading..."}
                </span>
                {freePlayStatus.tokens === 0 && !freePlayStatus.isFull && freePlayCountdown > 0 && (
                  <span className="shrink-0 text-[10px] text-amber-300/90">{formatTimeRemaining(freePlayCountdown)}</span>
                )}
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowArcadeInfoModal(true)}
                className="rounded-lg border border-purple-400/45 bg-purple-500/25 px-2.5 py-1 text-xs font-bold text-purple-100 hover:bg-purple-500/35"
              >
                Info
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="rounded-lg border border-white/20 bg-white/10 p-1.5 transition-all hover:bg-white/20"
                title="Settings"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="h-0.5 w-3.5 bg-white" />
                  <div className="h-0.5 w-3.5 bg-white" />
                  <div className="h-0.5 w-3.5 bg-white" />
                </div>
              </button>
            </div>
          </div>

          {/* Hero → group tabs */}
          <header className="shrink-0 pt-1.5 text-center">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
              Live • Mini-Games Arcade
            </div>
            <h1 className="mb-0.5 text-2xl font-extrabold tracking-tight lg:text-3xl">🎮 MLEO Arcade</h1>
            <p className="mx-auto max-w-lg px-2 text-xs leading-snug text-white/85 lg:text-[13px]">
              Play mini-games, collect in-app MLEO rewards, and unlock extra challenges. Each session uses 100
              MLEO from your in-app vault or a free play token when available.
            </p>
          </header>

          {/* Desktop group tabs (8 games per page; index separate from mobile) */}
          <div className="flex shrink-0 justify-center gap-2 px-1 py-1">
            {MOBILE_ARCADE_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setDesktopGroupIndex(g.id)}
                aria-label={`Desktop games page ${g.label}`}
                className={`max-w-[5rem] flex-1 rounded-lg border py-1.5 text-xs font-extrabold transition-all ${
                  desktopGroupIndex === g.id
                    ? "border-amber-400/70 bg-amber-500/40 text-amber-50 shadow-sm"
                    : "border-white/15 bg-white/5 text-white/85 hover:bg-white/10"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* 4 cols × 2 rows = 8 cells — no inner scrollbar */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <section
              className="mx-auto grid h-full w-full max-w-5xl grid-cols-4 gap-2 [grid-template-rows:repeat(2,minmax(0,1fr))]"
              aria-label="Games"
            >
              {desktopGroupGames.map((game, idx) => (
                <div key={`d-${desktopGroupIndex}-${game.href}-${idx}`} className="min-h-0 min-w-0">
                  <GameCard
                    {...game}
                    freePlayStatus={freePlayStatus}
                    comingSoon={game.comingSoon}
                    lobby
                  />
                </div>
              ))}
              {Array.from({ length: Math.max(0, DESKTOP_GAMES_PER_GROUP - desktopGroupGames.length) }).map((_, i) => (
                <div
                  key={`d-pad-${desktopGroupIndex}-${i}`}
                  className="min-h-0 min-w-0 rounded-xl border border-white/5 bg-white/[0.02]"
                  aria-hidden
                />
              ))}
            </section>
          </div>

          {/* Slim bottom row */}
          <footer className="mt-1 flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-2">
            <Link
              href="/mining"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-600/90 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <span>⬅️</span>
              <span>Back to Main Games</span>
            </Link>
            {!showDevButton ? (
              <button
                type="button"
                onClick={() => setShowDevButton(true)}
                className="inline-flex items-center rounded-lg border border-red-500/35 bg-red-600/20 px-2.5 py-1 text-xs font-bold text-red-300 hover:bg-red-600/30"
                title="Dev Tools"
              >
                🔧 +10K
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <input
                  type="password"
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      addDevCoins();
                    }
                  }}
                  placeholder="Password"
                  className="w-[100px] rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder-zinc-400 focus:border-red-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addDevCoins}
                  disabled={addingCoins}
                  className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingCoins ? "…" : "+10K"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDevButton(false);
                    setDevPassword("");
                  }}
                  className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
                >
                  ✕
                </button>
              </div>
            )}
          </footer>
        </div>
      </main>

      {/* Mobile: long-form arcade info (Important + Play Responsibly) */}
      {showArcadeInfoModal && (
        <Modal
          open={showArcadeInfoModal}
          onClose={() => setShowArcadeInfoModal(false)}
          title="ℹ️ Arcade Info"
          sheetOnMobile
        >
          <div className="max-w-4xl mx-auto rounded-2xl bg-yellow-500/10 border-2 border-yellow-500/30 p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="text-2xl sm:text-3xl shrink-0">⚠️</div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-yellow-300 mb-2">Important Information</h3>
                <ul className="text-xs sm:text-sm text-white/90 space-y-2">
                  <li>• <strong>🎁 Free Play:</strong> Receive 1 free play token every hour (up to 5 stored). Use tokens on any game without using vault MLEO!</li>
                  <li>• <strong>Session Cost:</strong> Each game session uses at least 100 MLEO from your in-app vault. Some modes may use a different session cost.</li>
                  <li>• <strong>Vault Usage:</strong> MLEO is taken from your in-app vault when you start a session (free play sessions do not use vault MLEO).</li>
                  <li>• <strong>Rewards:</strong> Session rewards are added automatically to your vault, including rewards earned from free play sessions.</li>
                  <li>• <strong>Game Info:</strong> Click the ℹ️ button on each game card to view the rules, controls, and reward structure.</li>
                  <li>• <strong>Game Logic:</strong> Some games use randomized events, while others focus on timing, reaction, memory, or decision-making.</li>
                  <li>• <strong>Statistics:</strong> Each game tracks your activity, completed sessions, best score, streaks, and progress milestones.</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="max-w-4xl mx-auto rounded-2xl bg-black/30 border border-white/10 p-6 sm:p-8 text-center mt-4">
            <h3 className="text-xl font-bold mb-3">🏆 Play Responsibly</h3>
            <p className="text-white/80 text-sm leading-relaxed max-w-2xl mx-auto">
              These arcade mini-games are designed for entertainment, progression, and in-app rewards.
              MLEO used here is earned inside the platform and stored in your in-app vault.
              Focus on fun, strategy, timing, and progression as you explore different game modes.
            </p>
          </div>
        </Modal>
      )}

      {/* Vault Modal */}
      {showVaultModal && (
        <Modal open={showVaultModal} onClose={() => setShowVaultModal(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-center">
              <h2 className="text-xl font-bold mb-3">Your MLEO Vault</h2>
              <div className="text-sm opacity-70 mb-2">Current Balance</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl">💰</span>
                <span className="text-2xl font-bold text-emerald-400">{fmt(vault)} MLEO</span>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-3">How to Get MLEO Tokens</h3>
              <div className="space-y-3 text-sm text-zinc-300">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎮</span>
                  <div>
                    <div className="font-semibold text-white">Play Miners or MLEO BASE</div>
                    <div>Earn MLEO through the main Miners loop or by running shipments and support systems in MLEO BASE. The same vault is shared here.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="font-semibold text-white">Arcade Rewards</div>
                    <div>All rewards earned in arcade sessions are automatically added to your vault.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎁</span>
                  <div>
                    <div className="font-semibold text-white">Free Play Rewards</div>
                    <div>Free play sessions can also add MLEO rewards to your vault.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4">
              <div className="text-sm text-blue-300">
                <strong>💡 Tip:</strong> Your vault is shared across all MLEO games. Build balance in Miners or MLEO BASE, then spend it here.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Free Play Modal */}
      {showFreePlayModal && (
        <Modal open={showFreePlayModal} onClose={() => setShowFreePlayModal(false)}>
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 text-center">
              <h2 className="text-xl font-bold mb-3">Free Play Tokens</h2>
              <div className="text-sm opacity-70 mb-2">Current Tokens</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl">🎁</span>
                <span className="text-2xl font-bold text-amber-400">
                  {freePlayLoaded ? `${freePlayStatus.tokens}/${freePlayStatus.maxTokens} Free` : "Loading..."}
                </span>
              </div>
              {freePlayStatus.tokens === 0 && !freePlayStatus.isFull && freePlayCountdown > 0 && (
                <div className="text-xs text-amber-300 mt-2">
                  Next token in: {formatTimeRemaining(freePlayCountdown)}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg mb-3">How Free Play Works</h3>
              <div className="space-y-3 text-sm text-zinc-300">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⏰</span>
                  <div>
                    <div className="font-semibold text-white">Token Regeneration</div>
                    <div>Receive 1 free play token every hour automatically. No need to stay online.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <div className="font-semibold text-white">Maximum Storage</div>
                    <div>You can store up to 5 free play tokens maximum. Tokens don't accumulate beyond this limit.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎯</span>
                  <div>
                    <div className="font-semibold text-white">Token Value</div>
                    <div>Each free play token can be used to start one arcade session without using vault MLEO.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="font-semibold text-white">Rewards</div>
                    <div>Rewards from free play sessions are added to your vault just like standard session rewards.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4">
              <div className="text-sm text-green-300">
                <strong>💡 Pro Tip:</strong> Use free play tokens to explore new games and build your vault through regular play.
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <Modal open={showSettingsModal} onClose={() => setShowSettingsModal(false)}>
          <div className="w-80 space-y-4">
            <div className="text-center mb-3">
              <div className="text-3xl mb-2">⚙️</div>
              <h2 className="text-xl font-bold">Settings</h2>
            </div>

            {/* Audio Settings + Wallet - 3 buttons in one row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                <div className="text-sm font-medium mb-2">SOUND</div>
                <div className="flex justify-center">
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`px-4 py-2 rounded-full flex items-center justify-center text-sm transition-all ${
                      soundEnabled 
                        ? 'bg-emerald-500 hover:bg-emerald-600' 
                        : 'bg-zinc-700 hover:bg-zinc-600 opacity-50'
                    }`}
                    style={{ minWidth: '60px', height: '32px' }}
                  >
                    {soundEnabled ? '🔊' : '🔇'}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
                <div className="text-sm font-medium mb-2">MUSIC</div>
                <div className="flex justify-center">
                  <button
                    onClick={() => setMusicEnabled(!musicEnabled)}
                    className={`px-4 py-2 rounded-full flex items-center justify-center text-sm transition-all ${
                      musicEnabled 
                        ? 'bg-amber-500 hover:bg-amber-600' 
                        : 'bg-zinc-700 hover:bg-zinc-600 opacity-50'
                    }`}
                    style={{ minWidth: '60px', height: '32px' }}
                  >
                    {musicEnabled ? '🎵' : '🔇'}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-center">
                <div className="text-sm font-medium mb-2">WALLET</div>
                <div className="flex justify-center">
                  <div className="scale-90">
                    <ConnectButton
                      chainStatus="none"
                      accountStatus="avatar"
                      showBalance={false}
                      label="CONNECT"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Token Collection */}
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">💰</span>
                <span className="text-sm font-medium">Collect MLEO</span>
              </div>
              
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(Number(e.target.value))}
                    className="flex-1 px-2 py-1 text-sm rounded bg-white/10 border border-white/20 text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500"
                    placeholder="Amount"
                    min="1"
                    max={vault}
                  />
                  <button
                    onClick={() => setCollectAmount(vault)}
                    className="px-2 py-1 text-xs rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                  >
                    MAX
                  </button>
                </div>
                <div className="text-xs text-zinc-400">
                  Available: {fmt(vault)} MLEO
                </div>
                <button
                  onClick={collectToWallet}
                  disabled={collectAmount <= 0 || collectAmount > vault || claiming}
                  className="w-full py-2 text-sm rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

    </Layout>
  );
}

