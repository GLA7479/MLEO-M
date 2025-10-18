// pages/arcade.js - MLEO Arcade/Casino Hub
import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { ConnectButton, useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { getFreePlayStatus, formatTimeRemaining, debugAddTokens } from "../lib/free-play-system";

const ARCADE_BG = "linear-gradient(135deg, #1a1a1a 0%, #3a2a0a 50%, #1a1a1a 100%)";

// ==== On-chain Claim (TBNB) config ====
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || process.env.NEXT_PUBLIC_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const CLAIM_FN = process.env.NEXT_PUBLIC_MLEO_CLAIM_FN || "claim";

// ABI מינימלי של V3: claim(gameId, amount)
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

function GameCard({ title, emoji, description, prize, href, color, freePlayStatus }) {
  const [showInfo, setShowInfo] = useState(false);
  
  return (
    <>
      <article 
        className="rounded-lg border border-white/10 backdrop-blur-md shadow-lg p-4 flex flex-col transition-all hover:scale-105 hover:border-white/30 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
          height: '187px',
        }}
      >
        {/* Info button - fixed position top right */}
        <button
          onClick={() => setShowInfo(true)}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-base transition-all z-10"
          title="Info"
        >
          ℹ️
        </button>

        {/* Icon - fixed position */}
        <div className="text-center absolute left-0 right-0" style={{ top: '15px' }}>
          <div className="text-5xl leading-none">{emoji}</div>
        </div>

        {/* Title - fixed position with fixed height for 2 lines */}
        <div 
          className="text-center absolute left-0 right-0 px-2 flex items-center justify-center" 
          style={{ 
            top: '80px',
            height: '45px'
          }}
        >
          <h2 className="text-base font-bold line-clamp-2 leading-tight">{title}</h2>
        </div>

        {/* Play button - fixed position bottom */}
        <div className="absolute left-4 right-4" style={{ bottom: '12px' }}>
          <Link
            href={href}
            className="block w-full text-center px-4 py-2.5 rounded text-sm font-bold text-white shadow-lg transition-all hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
            }}
          >
            PLAY
          </Link>
        </div>
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
                <div className="text-sm opacity-70 mb-1">Cost per Round</div>
                <div className="text-xl font-bold text-amber-400">1,000+ MLEO</div>
              </div>
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4 text-center">
                <div className="text-sm opacity-70 mb-1">Max Win</div>
                <div className="text-xl font-bold text-green-400">{prize}</div>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">How to Play</h3>
              <p className="text-zinc-300">Click "PLAY NOW" to start the game. Each round costs 1,000 MLEO or more depending on your bet. Win multipliers and prizes based on the game outcome!</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl max-h-[85vh] overflow-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
            <h3 className="text-xl font-bold text-white">🎮 How to Play</h3>
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

export default function ArcadeHub() {
  const [vault, setVault] = useState(0);
  const [freePlayStatus, setFreePlayStatus] = useState({ tokens: 0, timeUntilNext: 0, hasTokens: false });
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showFreePlayModal, setShowFreePlayModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [collectAmount, setCollectAmount] = useState(1000);
  const [claiming, setClaiming] = useState(false);

  // Wagmi hooks
  const { openConnectModal } = useConnectModal();
  const { address, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  
  // Read vault from RUSH game
  function getVault() {
    if (typeof window === "undefined") return 0;
    try {
      const rushData = localStorage.getItem("mleo_rush_core_v4");
      if (!rushData) return 0;
      const data = JSON.parse(rushData);
      return data.vault || 0;
    } catch {
      return 0;
    }
  }
  
  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return Math.floor(n).toString();
  }
  
  // Update free play status
  function updateFreePlayStatus() {
    const status = getFreePlayStatus();
    setFreePlayStatus(status);
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

      // Update local vault
      const newVault = Math.max(0, vault - collectAmount);
      setVault(newVault);
      
      // Update RUSH game vault
      try {
        const rushData = localStorage.getItem("mleo_rush_core_v4");
        if (rushData) {
          const data = JSON.parse(rushData);
          data.vault = newVault;
          localStorage.setItem("mleo_rush_core_v4", JSON.stringify(data));
        }
      } catch (e) {
        console.error("Failed to update RUSH vault:", e);
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
  
  // Load vault and free play status on mount and refresh every 2 seconds
  useEffect(() => {
    setVault(getVault());
    updateFreePlayStatus();
    
    const interval = setInterval(() => {
      setVault(getVault());
      updateFreePlayStatus();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const games = [
    // 1. Plinko
    {
      title: "Plinko",
      emoji: "🎯",
      description: "Drop the ball through pegs! Land on high multipliers for massive wins!",
      prize: "×10",
      href: "/plinko",
      color: "#3B82F6",
    },
    // 2. Crash
    {
      title: "Crash",
      emoji: "📈",
      description: "Watch the multiplier grow! Cash out before it crashes to win big!",
      prize: "Unlimited",
      href: "/crash",
      color: "#DC2626",
    },
    // 3. Diamonds (Upgraded Mines)
    {
      title: "Diamonds",
      emoji: "💎",
      description: "Find diamonds, avoid bombs! 4 difficulty levels from Easy to Expert!",
      prize: "×1000+",
      href: "/diamonds",
      color: "#0EA5E9",
    },
    // 4. Blackjack
    {
      title: "Blackjack",
      emoji: "♠️",
      description: "Beat the dealer to 21! Classic card game with emoji cards.",
      prize: "×2",
      href: "/blackjack",
      color: "#10B981",
    },
    // 5. Poker
    {
      title: "Poker",
      emoji: "🎴",
      description: "Texas Hold'em poker! Use your 2 cards + 5 community cards to make the best hand.",
      prize: "×1000",
      href: "/poker",
      color: "#8B5CF6",
    },
    // 6. Hi-Lo Cards
    {
      title: "Hi-Lo Cards",
      emoji: "📊",
      description: "Guess if the next card is higher or lower. Build streaks for huge multipliers!",
      prize: "Unlimited",
      href: "/hilo",
      color: "#059669",
    },
    // 7. Three Card Poker
    {
      title: "Three Card Poker",
      emoji: "♦️",
      description: "Fast poker! 3 cards vs dealer - best hand wins with instant results.",
      prize: "×100",
      href: "/three-card-poker",
      color: "#EC4899",
    },
    // 8. Ultimate Texas Hold'em - NEW!
    {
      title: "Ultimate Poker",
      emoji: "🃏",
      description: "Texas Hold'em strategy! Raise 4X, 2X, or 1X at different stages. Beat the dealer!",
      prize: "×500",
      href: "/ultimate-poker",
      color: "#6366F1",
    },
    // 8.5. Texas Hold'em vs Dealer - NEW!
    {
      title: "Texas Hold'em",
      emoji: "🎴",
      description: "Classic Texas Hold'em vs Dealer! Strategic betting rounds - PRE-FLOP, FLOP, TURN, RIVER. Best hand wins the pot!",
      prize: "Unlimited",
      href: "/texas-holdem",
      color: "#10B981",
    },
    // 8.6. Texas Hold'em Multiplayer - NEW!
    {
      title: "Texas Hold'em Multiplayer",
      emoji: "🎴👥",
      description: "Play Texas Hold'em with friends! 2-6 players, real-time P2P connection via WiFi. No server needed!",
      prize: "Social",
      href: "/texas-holdem-multiplayer",
      color: "#059669",
    },
    // 8.6.1. Texas Hold'em Multiplayer - NEW!
    {
      title: "Texas Hold'em Multiplayer",
      emoji: "🎴⚡",
      description: "Real-time Texas Hold'em multiplayer with Supabase! Fast, reliable, and works anywhere. 2-6 players. BEST VERSION!",
      prize: "Social",
      href: "/texas-holdem-supabase-try",
      color: "#10B981",
    },
    // 8.7. Texas Hold'em Rooms - NEW!
    {
      title: "Texas Hold'em Rooms",
      emoji: "🎰🎴",
      description: "Join permanent poker tables! Drop-in/drop-out multiplayer with real stakes. Play anytime!",
      prize: "Social",
      href: "/tournament",
      color: "#7C3AED",
    },
    // 9. Multiplier Ladder
    {
      title: "Ladder",
      emoji: "🪜",
      description: "Climb the ladder! Choose left or right to climb higher - cash out before you fall!",
      prize: "×20",
      href: "/ladder",
      color: "#9333EA",
    },
    // 10. Bomb Squad - NEW!
    {
      title: "Bomb Squad",
      emoji: "💣",
      description: "Defuse the bomb! Cut the correct wire at each level - wrong wire = BOOM!",
      prize: "×20",
      href: "/bomb",
      color: "#DC2626",
    },
    // 11. Mystery Box - NEW!
    {
      title: "Mystery Box",
      emoji: "🎁",
      description: "Choose 1 box from 10! Find the jackpot or walk away empty!",
      prize: "×4",
      href: "/mystery",
      color: "#F59E0B",
    },
    // 12. Lucky Chamber - NEW!
    {
      title: "Lucky Chamber",
      emoji: "🔫",
      description: "6 chambers, 1 danger! Pick wisely and cash out before it's too late!",
      prize: "×7.5",
      href: "/chamber",
      color: "#64748B",
    },
    // 13. Horse Racing - NEW!
    {
      title: "Horse Racing",
      emoji: "🏇",
      description: "Bet on your favorite horse! Watch them race and win big!",
      prize: "×5.4",
      href: "/horse",
      color: "#16A34A",
    },
    // 14. Target Shooter - NEW!
    {
      title: "Target Shooter",
      emoji: "🏹",
      description: "Hit all targets in 20 seconds! Fast clicks = big wins!",
      prize: "×15",
      href: "/shooter",
      color: "#EA580C",
    },
    // 15. Sic Bo - NEW!
    {
      title: "Sic Bo",
      emoji: "🀄",
      description: "Ancient Chinese dice game! Bet on totals, triples, and more!",
      prize: "×50",
      href: "/sicbo",
      color: "#B91C1C",
    },
    // 16. Gold Rush Digger - NEW!
    {
      title: "Gold Rush Digger",
      emoji: "⛏️",
      description: "Dig a 5×5 treasure map! Find gems and jackpots - avoid 6 skulls!",
      prize: "×61",
      href: "/goldrush",
      color: "#D97706",
    },
    // 17. Limbo - NEW!
    {
      title: "Limbo",
      emoji: "🔥",
      description: "Set your target multiplier and roll! Higher risk = bigger rewards!",
      prize: "Unlimited",
      href: "/limbo",
      color: "#6366F1",
    },
    // 18. Dice Over/Under - NEW!
    {
      title: "Dice Over/Under",
      emoji: "⚄",
      description: "Over or Under! Slide your target and roll - ultimate control!",
      prize: "Unlimited",
      href: "/dice-over-under",
      color: "#14B8A6",
    },
    // 18. Roulette
    {
      title: "Roulette",
      emoji: "🔴",
      description: "Spin the wheel and win big! Classic casino wheel game with multiple betting options.",
      prize: "×36",
      href: "/roulette",
      color: "#7C3AED",
    },
    // Additional upgraded games
    {
      title: "Dragon Tower",
      emoji: "🐉",
      description: "Climb 10 floors through the dragon's lair! 3 difficulty modes!",
      prize: "×150",
      href: "/dragon-tower",
      color: "#DC2626",
    },
    {
      title: "Slots Upgraded",
      emoji: "💰",
      description: "5-reel mega slots! Match symbols for huge wins - 💎×500 jackpot!",
      prize: "×500",
      href: "/slots-upgraded",
      color: "#FBBF24",
    },
    {
      title: "Mega Wheel",
      emoji: "🎡",
      description: "40 segments of fortune! Spin for prizes up to ×50 jackpot!",
      prize: "×50",
      href: "/mega-wheel",
      color: "#A855F7",
    },
    {
      title: "Keno",
      emoji: "🎱",
      description: "Classic lottery! Pick 1-10 numbers - match them all for ×1000!",
      prize: "×1000",
      href: "/keno",
      color: "#6366F1",
    },
    {
      title: "Craps",
      emoji: "🎲",
      description: "Roll the dice and win big! Classic casino dice game with multiple betting options.",
      prize: "×31",
      href: "/craps",
      color: "#16A34A",
    },
    {
      title: "Baccarat",
      emoji: "♥️",
      description: "Bet on Player, Banker, or Tie! Classic card game with simple rules.",
      prize: "×8",
      href: "/baccarat",
      color: "#9333EA",
    },
    // 25. Coin Flip - TEMPLATE GAME
    {
      title: "Coin Flip",
      emoji: "🪙",
      description: "Choose Heads or Tails! Simple 50/50 chance with instant results and big wins!",
      prize: "×1.95",
      href: "/coin-flip",
      color: "#F59E0B",
    },
    // 26. Crash2 - NEW WITH LIVE CHART!
    {
      title: "Crash2",
      emoji: "📈",
      description: "Watch the multiplier grow! Cash out before it crashes to win your bet times the multiplier!",
      prize: "×10",
      href: "/crash2",
      color: "#EF4444",
    },
    // 27. Plinko2 - OPTIMIZED VERSION!
    {
      title: "Plinko2",
      emoji: "🎲",
      description: "Enhanced Plinko with 17 rows, wall penalty, and maximized play area!",
      prize: "×10",
      href: "/plinko2",
      color: "#8B5CF6",
    },
  ];

  return (
    <Layout title="MLEO — Arcade Games">
      <main
        className="min-h-screen relative text-white"
        style={{
          background: ARCADE_BG,
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-8">
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
              Play mini-games and win MLEO tokens! Each game costs 1,000 MLEO per round.
              Win prizes, free spins, and multipliers up to 10x!
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
                  {freePlayStatus.tokens}/{freePlayStatus.maxTokens} Free
                </span>
                {freePlayStatus.tokens < freePlayStatus.maxTokens && (
                  <span className="text-xs text-amber-400/70">
                    {formatTimeRemaining(freePlayStatus.timeUntilNext)}
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* Games Grid */}
          <section className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 mb-8">
            {games.map((game, idx) => (
              <GameCard key={idx} {...game} freePlayStatus={freePlayStatus} />
            ))}
          </section>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/40">
              <span className="text-2xl">🎮</span>
              <span className="font-bold text-purple-300">27 Exciting Games to Play!</span>
            </div>
          </div>

          {/* Important Notice - Moved below games */}
          <div className="max-w-4xl mx-auto mb-8 rounded-2xl bg-yellow-500/10 border-2 border-yellow-500/30 p-6">
            <div className="flex items-start gap-4">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-xl font-bold text-yellow-300 mb-2">Important Information</h3>
                <ul className="text-sm text-white/90 space-y-2">
                  <li>• <strong>🎁 Free Play:</strong> Earn 1 free play token every hour (max 5 tokens). Use tokens on any game without spending MLEO!</li>
                  <li>• <strong>Minimum Bet:</strong> Each game has a minimum bet of 1,000 MLEO (some games allow higher bets)</li>
                  <li>• <strong>Source:</strong> MLEO is deducted from your vault when you play (not for free plays)</li>
                  <li>• <strong>Prizes:</strong> All winnings are automatically added back to your vault (including free play wins!)</li>
                  <li>• <strong>Game Info:</strong> Click the ℹ️ button on each game card to learn how to play and see prize details</li>
                  <li>• <strong>Fair Play:</strong> All games use random number generation for fair outcomes</li>
                  <li>• <strong>Statistics:</strong> Each game tracks your personal stats (total plays, wins, biggest win, etc.)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Stats Highlight */}
          <div className="max-w-4xl mx-auto rounded-2xl bg-black/30 border border-white/10 p-8 text-center">
            <h3 className="text-2xl font-bold mb-4">🏆 Play Responsibly</h3>
            <p className="text-white/80 max-w-2xl mx-auto">
              These are mini-games for entertainment. The house edge is balanced to provide fair gameplay.
              Remember: you're using in-game MLEO tokens that you've earned from the main games.
              Have fun and good luck!
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
            
            {/* DEBUG BUTTON - Remove in production */}
            <button
              onClick={() => {
                debugAddTokens();
                updateFreePlayStatus();
              }}
              className="px-4 py-3 rounded-xl bg-red-600/20 border border-red-500/30 text-red-300 text-sm font-bold hover:bg-red-600/30"
              title="Debug: Add 5 tokens"
            >
              🔧 DEBUG +5
            </button>
          </div>
        </div>
      </main>

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
                    <div className="font-semibold text-white">Play RUSH Game</div>
                    <div>Earn MLEO by playing the main RUSH game. Your vault is shared between RUSH and Arcade games.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="font-semibold text-white">Win Arcade Games</div>
                    <div>All winnings from arcade games are automatically added to your vault.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎁</span>
                  <div>
                    <div className="font-semibold text-white">Free Play Wins</div>
                    <div>Even free play games can win MLEO tokens that go to your vault!</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4">
              <div className="text-sm text-blue-300">
                <strong>💡 Tip:</strong> Your vault is the same across all MLEO games. Play RUSH to earn more tokens for arcade games!
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
                  {freePlayStatus.tokens}/{freePlayStatus.maxTokens} Free
                </span>
              </div>
              {freePlayStatus.tokens < freePlayStatus.maxTokens && (
                <div className="text-xs text-amber-300 mt-2">
                  Next token in: {formatTimeRemaining(freePlayStatus.timeUntilNext)}
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
                    <div>Earn 1 free play token every hour automatically. No need to be online!</div>
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
                    <div>Each free play token is worth 1,000 MLEO and can be used on any arcade game.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <div className="font-semibold text-white">Winnings</div>
                    <div>Free play wins are added to your vault just like regular game wins!</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-4">
              <div className="text-sm text-green-300">
                <strong>💡 Pro Tip:</strong> Use free play tokens to try new games risk-free and build your vault!
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

