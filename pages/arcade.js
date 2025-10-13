// pages/arcade.js - MLEO Arcade/Casino Hub
import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getFreePlayStatus, formatTimeRemaining, debugAddTokens } from "../lib/free-play-system";

const ARCADE_BG = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

function GameCard({ title, emoji, description, prize, href, color, freePlayStatus }) {
  const [showInfo, setShowInfo] = useState(false);
  
  return (
    <>
      <article 
        className="rounded-xl border border-white/10 backdrop-blur-md shadow-lg p-5 flex flex-col h-full transition-all hover:scale-105 hover:border-white/30"
        style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
        }}
      >
        <div className="text-center mb-4">
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1"></div>
            <div className="text-5xl">{emoji}</div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={() => setShowInfo(true)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-sm transition-all"
                title="Info"
              >
                ℹ️
              </button>
            </div>
          </div>
          <h2 className="text-xl font-extrabold mb-2">{title}</h2>
          <p className="text-sm text-zinc-300 leading-relaxed line-clamp-2">
            {description}
          </p>
        </div>

        <div className="mt-auto">
          {/* Cost & Max Win in same row */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 text-center">
              <div className="text-xs opacity-70 mb-1">Cost</div>
              <div className="text-base font-bold text-amber-400">1K+</div>
            </div>
            
            <div className="rounded-lg bg-black/30 border border-white/10 p-2.5 text-center">
              <div className="text-xs opacity-70 mb-1">Max Win</div>
              <div className="text-base font-bold text-green-400">{prize}</div>
            </div>
          </div>

          {/* Free Play Button (if tokens available) */}
          {freePlayStatus && freePlayStatus.hasTokens && (
            <Link
              href={`${href}?freePlay=true`}
              className="block w-full text-center px-5 py-2.5 rounded-lg font-extrabold text-white text-base shadow-lg transition-all hover:scale-105 mb-2 bg-gradient-to-r from-amber-500 to-orange-500"
            >
              🎁 FREE PLAY ({freePlayStatus.tokens}/{freePlayStatus.maxTokens})
            </Link>
          )}

          {/* Regular Play Button */}
          <Link
            href={href}
            className="block w-full text-center px-5 py-2.5 rounded-lg font-extrabold text-white text-base shadow-lg transition-all hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
            }}
          >
            PLAY NOW
          </Link>
          
          {/* Timer display (if not full) */}
          {freePlayStatus && !freePlayStatus.isFull && (
            <div className="text-center mt-2 text-xs text-amber-400/70">
              ⏰ Next free: {formatTimeRemaining(freePlayStatus.timeUntilNext)}
            </div>
          )}
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
        <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl max-h-[80vh] overflow-auto">
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
      emoji: "🚀",
      description: "Watch the multiplier grow! Cash out before it crashes to win big!",
      prize: "Unlimited",
      href: "/crash",
      color: "#DC2626",
    },
    // 3. Mines
    {
      title: "Mines",
      emoji: "💣",
      description: "Minesweeper-style risk game. Find safe tiles and cash out before hitting a mine!",
      prize: "×10",
      href: "/mines",
      color: "#EA580C",
    },
    // 4. Blackjack
    {
      title: "Blackjack",
      emoji: "🎰",
      description: "Beat the dealer to 21! Classic card game with emoji cards.",
      prize: "×2",
      href: "/blackjack",
      color: "#10B981",
    },
    // 5. Poker
    {
      title: "Poker",
      emoji: "🃏",
      description: "Texas Hold'em poker! Use your 2 cards + 5 community cards to make the best hand.",
      prize: "×1000",
      href: "/poker",
      color: "#8B5CF6",
    },
    // 6. Hi-Lo Cards
    {
      title: "Hi-Lo Cards",
      emoji: "🃏",
      description: "Guess if the next card is higher or lower. Build streaks for huge multipliers!",
      prize: "Unlimited",
      href: "/hilo",
      color: "#059669",
    },
    // 7. Three Card Poker
    {
      title: "Three Card Poker",
      emoji: "🃏",
      description: "Fast poker! 3 cards vs dealer - best hand wins with instant results.",
      prize: "×100",
      href: "/three-card-poker",
      color: "#EC4899",
    },
    // 8. Caribbean Stud
    {
      title: "Caribbean Stud",
      emoji: "🃏",
      description: "5 cards vs dealer - best hand wins with instant results.",
      prize: "×100",
      href: "/caribbean-stud",
      color: "#14B8A6",
    },
    // 9. Pai Gow Poker
    {
      title: "Pai Gow Poker",
      emoji: "🃏",
      description: "7 cards split into 5+2 - beat dealer on both hands!",
      prize: "×2",
      href: "/pai-gow",
      color: "#F59E0B",
    },
    // 10. Roulette
    {
      title: "Roulette",
      emoji: "🎯",
      description: "Spin the wheel and win big! Classic casino wheel game with multiple betting options.",
      prize: "×36",
      href: "/roulette",
      color: "#7C3AED",
    },
    // Additional games
    {
      title: "Slot Machine",
      emoji: "🎰",
      description: "Classic 3-reel slots with matching symbols. Land 3 diamonds for the JACKPOT!",
      prize: "×10",
      href: "/slots",
      color: "#FBBF24",
    },
    {
      title: "Dice Roller",
      emoji: "🎲",
      description: "Roll 3 dice and match combinations. Triple six wins big!",
      prize: "×10",
      href: "/dice",
      color: "#EF4444",
    },
    {
      title: "Wheel of Fortune",
      emoji: "🎡",
      description: "Spin the wheel and land on prizes. Watch out for free spins!",
      prize: "×10",
      href: "/wheel",
      color: "#A855F7",
    },
    {
      title: "Scratch Card",
      emoji: "🃏",
      description: "Scratch to reveal 9 symbols. Match 3 identical symbols to win!",
      prize: "×10",
      href: "/scratch",
      color: "#06B6D4",
    },
    {
      title: "Coin Flip",
      emoji: "🪙",
      description: "Classic 50/50! Choose heads or tails with random win multipliers up to ×10!",
      prize: "×10",
      href: "/coinflip",
      color: "#D97706",
    },
    {
      title: "Racer",
      emoji: "🏁",
      description: "Bet on your favorite car and watch them race! Win up to ×6 multiplier!",
      prize: "×6",
      href: "/racer",
      color: "#F97316",
    },
    {
      title: "Darts",
      emoji: "🎯",
      description: "Throw darts and hit the bullseye for massive wins! Up to ×10 multiplier!",
      prize: "×10",
      href: "/darts",
      color: "#BE123C",
    },
    {
      title: "Tower",
      emoji: "⚖️",
      description: "Climb the tower and cash out before it collapses! Risk vs reward game!",
      prize: "×10",
      href: "/tower",
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
      emoji: "🃏",
      description: "Bet on Player, Banker, or Tie! Classic card game with simple rules.",
      prize: "×8",
      href: "/baccarat",
      color: "#9333EA",
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
              
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 font-semibold text-sm">
                <span>💰</span>
                <span className="text-emerald-400">{fmt(vault)} MLEO</span>
              </div>
              
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/30 font-semibold text-sm">
                <span>🎁</span>
                <span className="text-amber-300">
                  {freePlayStatus.tokens}/{freePlayStatus.maxTokens} Free
                </span>
                {freePlayStatus.tokens < freePlayStatus.maxTokens && (
                  <span className="text-xs text-amber-400/70">
                    {formatTimeRemaining(freePlayStatus.timeUntilNext)}
                  </span>
                )}
              </div>
              
              {/* DEBUG BUTTON - Remove in production */}
              <button
                onClick={() => {
                  debugAddTokens();
                  updateFreePlayStatus();
                }}
                className="px-3 py-2 rounded-xl bg-red-600/20 border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-600/30"
                title="Debug: Add 5 tokens"
              >
                🔧 DEBUG +5
              </button>
            </div>

            <div className="flex items-center gap-3">
              <ConnectButton
                chainStatus="none"
                accountStatus="avatar"
                showBalance={false}
                label="CONNECT"
              />
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
          </header>

          {/* Games Grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {games.map((game, idx) => (
              <GameCard key={idx} {...game} freePlayStatus={freePlayStatus} />
            ))}
          </section>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/40">
              <span className="text-2xl">🎮</span>
              <span className="font-bold text-purple-300">20 Exciting Games to Play!</span>
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
          <div className="mt-12 text-center">
            <Link
              href="/mining"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white shadow-lg"
            >
              <span>⬅️</span>
              <span>Back to Main Games</span>
            </Link>
          </div>
        </div>
      </main>

    </Layout>
  );
}

