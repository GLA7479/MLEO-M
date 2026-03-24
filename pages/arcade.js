// pages/arcade.js - MLEO Arcade/Gaming Hub
import { useState, useEffect, useMemo } from "react";
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

const MOBILE_PAGE_SIZE = 6;

const ARCADE_CATEGORIES = [
  { id: "featured", label: "Featured" },
  { id: "cards", label: "Cards" },
  { id: "picks", label: "Picks" },
  { id: "action", label: "Action" },
  { id: "classics", label: "Classics" },
  { id: "soon", label: "Soon" },
];

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

function GameCard({ title, emoji, description, reward, href, color, freePlayStatus, comingSoon = false, compact = false }) {
  const [showInfo, setShowInfo] = useState(false);
  
  return (
    <>
      <article 
        className={`rounded-lg border border-white/10 backdrop-blur-md shadow-lg flex flex-col transition-all hover:scale-105 hover:border-white/30 relative overflow-hidden ${comingSoon ? 'opacity-60' : ''} ${compact ? 'p-2 h-full min-h-0' : 'p-4'}`}
        style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
          ...(compact ? { minHeight: 0 } : { height: '187px' }),
        }}
      >
        {/* Info button - fixed position top right */}
        <button
          onClick={() => setShowInfo(true)}
          className={`absolute rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all z-10 ${compact ? 'top-1 right-1 w-6 h-6 text-xs' : 'top-2 right-2 w-7 h-7 text-base'}`}
          title="Info"
        >
          ℹ️
        </button>

        {compact ? (
          <>
            <div className="text-center pt-0.5 flex-shrink-0">
              <div className="text-3xl leading-none">{emoji}</div>
            </div>
            <div className="text-center px-0.5 flex flex-col items-center justify-center gap-0.5 flex-shrink-0 py-0.5 min-h-0">
              {comingSoon ? (
                <h2 className="text-[11px] font-bold line-clamp-2 leading-tight text-amber-300">COMING SOON</h2>
              ) : (
                <h2 className="text-[11px] font-bold line-clamp-2 leading-tight">{title}</h2>
              )}
              {reward && (
                <p className="text-[9px] leading-tight text-amber-200/90 font-semibold line-clamp-1">{reward}</p>
              )}
            </div>
            <div className="mt-auto pt-0.5 px-0.5 flex-shrink-0">
              {comingSoon ? (
                <button
                  disabled
                  className="block w-full text-center px-1 py-1.5 rounded text-[10px] font-bold text-white/50 shadow-lg cursor-not-allowed opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                  }}
                >
                  PLAY
                </button>
              ) : (
                <Link
                  href={href}
                  className="block w-full text-center px-1 py-1.5 rounded text-[10px] font-bold text-white shadow-lg transition-all hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  }}
                >
                  PLAY
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-center absolute left-0 right-0" style={{ top: '15px' }}>
              <div className="text-5xl leading-none">{emoji}</div>
            </div>
            <div
              className="text-center absolute left-0 right-0 px-2 flex items-center justify-center"
              style={{ top: '80px', height: '45px' }}
            >
              {comingSoon ? (
                <h2 className="text-base font-bold line-clamp-2 leading-tight text-amber-300">COMING SOON</h2>
              ) : (
                <h2 className="text-base font-bold line-clamp-2 leading-tight">{title}</h2>
              )}
            </div>
            <div className="absolute left-4 right-4" style={{ bottom: '12px' }}>
              {comingSoon ? (
                <button
                  disabled
                  className="block w-full text-center px-4 py-2.5 rounded text-sm font-bold text-white/50 shadow-lg cursor-not-allowed opacity-50"
                  style={{
                    background: `linear-gradient(135deg, ${color}40 0%, ${color}30 100%)`,
                  }}
                >
                  PLAY
                </button>
              ) : (
                <Link
                  href={href}
                  className="block w-full text-center px-4 py-2.5 rounded text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`absolute inset-0 flex justify-center px-0 sm:px-4 ${
          sheetOnMobile ? "items-end pb-0 sm:items-center sm:pb-0" : "items-center"
        }`}
      >
        <div
          className={`w-full max-w-sm bg-zinc-900 border border-zinc-800 shadow-2xl overflow-auto ${
            sheetOnMobile
              ? "rounded-t-2xl sm:rounded-2xl max-h-[88dvh] sm:max-h-[85vh]"
              : "rounded-2xl max-h-[85vh]"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
            <h3 className="text-lg sm:text-xl font-bold text-white pr-2">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1 text-zinc-300 hover:text-white hover:bg-zinc-800"
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
    href: "/blackjack",
    color: "#10B981",
    category: "cards",
  },
  {
    title: "Card Arena",
    emoji: "🎴",
    description: "Build the strongest hand using your cards and the shared board.",
    reward: "UP TO ×800",
    href: "/poker",
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
    href: "/three-card-poker",
    color: "#EC4899",
    category: "cards",
  },
  {
    title: "Ultimate Cards",
    emoji: "🃏",
    description: "A strategy-focused card mode with staged decisions and stronger reward tiers.",
    reward: "UP TO ×2",
    href: "/ultimate-poker",
    color: "#6366F1",
    category: "cards",
  },
  {
    title: "Card Rooms",
    emoji: "🎰🎴",
    description: "Join live multiplayer card tables with drop-in/drop-out play and session-based progression.",
    reward: "Social",
    href: "/tournament",
    color: "#7C3AED",
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
    href: "/sicbo",
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
    href: "/roulette",
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
    href: "/slots-upgraded",
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
    href: "/craps",
    color: "#16A34A",
    category: "classics",
  },
  {
    title: "Card Duel",
    emoji: "♥️",
    description: "Choose between card sides and follow the result in a fast head-to-head round.",
    reward: "UP TO ×9.1",
    href: "/baccarat",
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
  const [mobileCategory, setMobileCategory] = useState("featured");
  const [mobilePage, setMobilePage] = useState(0);
  const [showArcadeInfoModal, setShowArcadeInfoModal] = useState(false);

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

  const mobileFilteredGames = useMemo(
    () => games.filter((g) => g.category === mobileCategory),
    [mobileCategory]
  );

  const mobileTotalPages = Math.max(1, Math.ceil(mobileFilteredGames.length / MOBILE_PAGE_SIZE));

  const mobilePageClamped = Math.min(mobilePage, mobileTotalPages - 1);

  const mobilePageGames = useMemo(() => {
    const start = mobilePageClamped * MOBILE_PAGE_SIZE;
    return mobileFilteredGames.slice(start, start + MOBILE_PAGE_SIZE);
  }, [mobileFilteredGames, mobilePageClamped]);

  useEffect(() => {
    if (mobilePage > mobileTotalPages - 1) {
      setMobilePage(Math.max(0, mobileTotalPages - 1));
    }
  }, [mobilePage, mobileTotalPages]);

  return (
    <Layout title="MLEO — Arcade Games">
      <main
        className="relative text-white max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:overflow-hidden md:min-h-screen"
        style={{
          background: ARCADE_BG,
        }}
      >
        {/* —— Mobile: fixed-screen lobby (md:hidden) —— */}
        <div className="flex md:hidden flex-col h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] gap-1.5">
          <div className="flex-shrink-0 flex items-center justify-between gap-2">
            <Link
              href="/mining"
              className="rounded-full px-2.5 py-1 text-[10px] font-bold bg-white/10 border border-white/20 hover:bg-white/20 whitespace-nowrap"
            >
              ← BACK
            </Link>
            <div className="flex-1 min-w-0 text-center">
              <h1 className="text-sm font-extrabold tracking-tight truncate">🎮 MLEO Arcade</h1>
              <p className="text-[9px] text-white/75 leading-tight line-clamp-1">Vault • free play • mini-games</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowArcadeInfoModal(true)}
                className="rounded-lg px-2 py-1 text-[10px] font-bold bg-purple-500/25 border border-purple-400/40 text-purple-200"
              >
                Info
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="p-1.5 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20"
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

          <div className="flex-shrink-0 flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowVaultModal(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-[10px] font-semibold"
            >
              <span>💰</span>
              <span className="text-emerald-400">{fmt(vault)}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowFreePlayModal(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-amber-600/25 to-orange-600/25 border border-amber-500/35 text-[10px] font-semibold"
            >
              <span>🎁</span>
              <span className="text-amber-300">
                {freePlayLoaded ? `${freePlayStatus.tokens}/${freePlayStatus.maxTokens}` : "…"}
              </span>
              {freePlayStatus.tokens === 0 && !freePlayStatus.isFull && freePlayCountdown > 0 && (
                <span className="text-[9px] text-amber-400/80">{formatTimeRemaining(freePlayCountdown)}</span>
              )}
            </button>
          </div>

          <div className="flex-shrink-0 -mx-1 overflow-x-auto pb-0.5">
            <div className="flex gap-1.5 px-1 min-w-min">
              {ARCADE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setMobileCategory(c.id);
                    setMobilePage(0);
                  }}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                    mobileCategory === c.id
                      ? "bg-amber-500/35 border-amber-400/60 text-amber-100"
                      : "bg-white/5 border-white/15 text-white/80"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <section className="flex-1 min-h-0 grid grid-cols-2 grid-rows-3 gap-1.5">
            {mobilePageGames.map((game, idx) => (
              <GameCard
                key={`${game.href}-${idx}`}
                {...game}
                freePlayStatus={freePlayStatus}
                comingSoon={game.comingSoon}
                compact
              />
            ))}
            {Array.from({ length: Math.max(0, MOBILE_PAGE_SIZE - mobilePageGames.length) }).map((_, i) => (
              <div
                key={`pad-${i}`}
                className="rounded-lg border border-white/5 bg-white/[0.02] min-h-0"
                aria-hidden
              />
            ))}
          </section>

          <div className="flex-shrink-0 flex items-center justify-between gap-2 pt-1 border-t border-white/10">
            <button
              type="button"
              disabled={mobilePageClamped <= 0}
              onClick={() => setMobilePage((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 border border-white/20 disabled:opacity-35 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-[10px] text-white/70 font-semibold tabular-nums">
              {mobilePageClamped + 1} / {mobileTotalPages}
            </span>
            <button
              type="button"
              disabled={mobilePageClamped >= mobileTotalPages - 1}
              onClick={() => setMobilePage((p) => Math.min(mobileTotalPages - 1, p + 1))}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 border border-white/20 disabled:opacity-35 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>

        {/* —— Desktop / tablet —— */}
        <div className="hidden md:block mx-auto max-w-7xl px-4 py-8">
          {/* Top bar */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <Link
                href="/mining"
                className="rounded-full px-4 py-2 text-sm font-bold bg-white/10 border border-white/20 hover:bg-white/20"
              >
                ← BACK
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-all"
                title="Settings"
              >
                <div className="flex flex-col gap-1">
                  <div className="w-4 h-0.5 bg-white"></div>
                  <div className="w-4 h-0.5 bg-white"></div>
                  <div className="w-4 h-0.5 bg-white"></div>
                </div>
              </button>
            </div>
          </div>

          {/* Header */}
          <header className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-500/40 px-4 py-2 text-amber-300 text-sm font-semibold mb-4">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Live • Mini-Games Arcade
            </div>
            
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
              🎮 MLEO Arcade
            </h1>
            
            <p className="text-lg text-white/90 max-w-2xl mx-auto">
              Play mini-games, collect in-app MLEO rewards, and unlock extra challenges. 
              Each session uses 100 MLEO from your in-app vault or a free play token when available.
            </p>
            
            {/* Vault and Free Play Status */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setShowVaultModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 font-semibold text-sm hover:bg-white/20 transition-all cursor-pointer"
              >
                <span>💰</span>
                <span className="text-emerald-400">{fmt(vault)} MLEO</span>
              </button>
              
              <button
                onClick={() => setShowFreePlayModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/30 font-semibold text-sm hover:bg-amber-500/30 transition-all cursor-pointer"
              >
                <span>🎁</span>
                <span className="text-amber-300">
                  {freePlayLoaded ? `${freePlayStatus.tokens}/${freePlayStatus.maxTokens} Free` : "Loading..."}
                </span>
                {freePlayStatus.tokens === 0 && !freePlayStatus.isFull && freePlayCountdown > 0 && (
                  <span className="text-xs text-amber-400/70">
                    {formatTimeRemaining(freePlayCountdown)}
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* Games Grid */}
          <section className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 mb-8">
            {games.map((game, idx) => (
              <GameCard key={idx} {...game} freePlayStatus={freePlayStatus} comingSoon={game.comingSoon} />
            ))}
          </section>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/40">
              <span className="text-2xl">🎮</span>
              <span className="font-bold text-purple-300">{games.length} Exciting Games to Play!</span>
            </div>
          </div>

          {/* Important Notice - Moved below games */}
          <div className="max-w-4xl mx-auto mb-8 rounded-2xl bg-yellow-500/10 border-2 border-yellow-500/30 p-6">
            <div className="flex items-start gap-4">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-xl font-bold text-yellow-300 mb-2">Important Information</h3>
                <ul className="text-sm text-white/90 space-y-2">
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

          {/* Stats Highlight */}
          <div className="max-w-4xl mx-auto rounded-2xl bg-black/30 border border-white/10 p-8 text-center">
            <h3 className="text-2xl font-bold mb-4">🏆 Play Responsibly</h3>
            <p className="text-white/80 max-w-2xl mx-auto">
              These arcade mini-games are designed for entertainment, progression, and in-app rewards. 
              MLEO used here is earned inside the platform and stored in your in-app vault. 
              Focus on fun, strategy, timing, and progression as you explore different game modes.
            </p>
          </div>

          {/* Back to Main Games */}
          <div className="mt-12 text-center flex items-center justify-center gap-4">
            <Link
              href="/mining"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-lg"
            >
              <span>⬅️</span>
              <span>Back to Main Games</span>
            </Link>
            
            {/* Dev Button - Testing Only */}
            {!showDevButton ? (
              <button
                onClick={() => setShowDevButton(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600/20 border border-red-500/30 text-red-300 text-sm font-bold hover:bg-red-600/30"
                title="Dev Tools"
              >
                🔧
              </button>
            ) : (
              <div className="inline-flex items-center gap-2">
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
                  className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder-zinc-400 focus:outline-none focus:border-red-500"
                  style={{ minWidth: "120px" }}
                />
                <button
                  onClick={addDevCoins}
                  disabled={addingCoins}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-white text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingCoins ? "Adding..." : "+10K"}
                </button>
                <button
                  onClick={() => {
                    setShowDevButton(false);
                    setDevPassword("");
                  }}
                  className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
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

