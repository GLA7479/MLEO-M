// pages/arcade.js - MLEO Arcade/Casino Hub
import { useState } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const ARCADE_BG = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

function GameCard({ title, emoji, description, prize, href, color }) {
  return (
    <article 
      className="rounded-2xl border border-white/10 backdrop-blur-md shadow-xl p-6 flex flex-col h-full transition-all hover:scale-105 hover:border-white/30"
      style={{
        background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
      }}
    >
      <div className="text-center mb-4">
        <div className="text-6xl mb-3">{emoji}</div>
        <h2 className="text-2xl font-extrabold mb-2">{title}</h2>
        <p className="text-sm text-zinc-300 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="mt-auto">
        <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-4">
          <div className="text-xs opacity-70 mb-1">Cost per Play</div>
          <div className="text-2xl font-bold text-amber-400">1,000 MLEO</div>
        </div>

        <div className="rounded-xl bg-black/30 border border-white/10 p-3 mb-4">
          <div className="text-xs opacity-70 mb-1">Max Win</div>
          <div className="text-xl font-bold text-green-400">{prize}</div>
        </div>

        <Link
          href={href}
          className="block w-full text-center px-5 py-3 rounded-xl font-extrabold text-white shadow-lg transition-all"
          style={{
            background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
          }}
        >
          PLAY NOW
        </Link>
      </div>
    </article>
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
  const [infoModal, setInfoModal] = useState(false);

  const games = [
    {
      title: "Slot Machine",
      emoji: "🎰",
      description: "Classic 3-reel slots with matching symbols. Land 3 diamonds for the JACKPOT!",
      prize: "10,000 MLEO",
      href: "/slots",
      color: "#FBBF24",
    },
    {
      title: "Dice Roller",
      emoji: "🎲",
      description: "Roll 3 dice and match combinations. Triple six wins big!",
      prize: "10,000 MLEO",
      href: "/dice",
      color: "#EF4444",
    },
    {
      title: "Wheel of Fortune",
      emoji: "🎡",
      description: "Spin the wheel and land on prizes. Watch out for free spins!",
      prize: "10,000 MLEO",
      href: "/wheel",
      color: "#8B5CF6",
    },
    {
      title: "Scratch Card",
      emoji: "🃏",
      description: "Scratch to reveal 9 symbols. Match 3 identical symbols to win!",
      prize: "10,000 MLEO",
      href: "/scratch",
      color: "#14B8A6",
    },
    {
      title: "Plinko",
      emoji: "🎯",
      description: "Drop the ball through pegs! Land on high multipliers for massive wins!",
      prize: "10,000 MLEO",
      href: "/plinko",
      color: "#3B82F6",
    },
    {
      title: "Mines",
      emoji: "💣",
      description: "Minesweeper-style risk game. Find safe tiles and cash out before hitting a mine!",
      prize: "6,000 MLEO",
      href: "/mines",
      color: "#6B7280",
    },
    {
      title: "Hi-Lo Cards",
      emoji: "🃏",
      description: "Guess if the next card is higher or lower. Build streaks for huge multipliers!",
      prize: "Unlimited",
      href: "/hilo",
      color: "#10B981",
    },
    {
      title: "Coin Flip",
      emoji: "🪙",
      description: "Classic 50/50! Choose heads or tails with random win multipliers up to ×10!",
      prize: "10,000 MLEO",
      href: "/coinflip",
      color: "#F59E0B",
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
            <Link
              href="/mining"
              className="rounded-full px-4 py-2 text-sm font-bold bg-white/10 border border-white/20 hover:bg-white/20"
            >
              ← BACK
            </Link>

            <ConnectButton
              chainStatus="none"
              accountStatus="avatar"
              showBalance={false}
              label="CONNECT"
            />
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
            
            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-6">
              Play mini-games and win MLEO tokens! Each game costs 1,000 MLEO per round.
              Win prizes, free spins, and multipliers up to 10x!
            </p>

            <button
              onClick={() => setInfoModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 font-semibold"
            >
              <span>ℹ️</span>
              <span>How to Play</span>
            </button>
          </header>

          {/* Important Notice */}
          <div className="max-w-4xl mx-auto mb-8 rounded-2xl bg-yellow-500/10 border-2 border-yellow-500/30 p-6">
            <div className="flex items-start gap-4">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-xl font-bold text-yellow-300 mb-2">Important Information</h3>
                <ul className="text-sm text-white/90 space-y-2">
                  <li>• <strong>Cost:</strong> Each game costs 1,000 MLEO per play</li>
                  <li>• <strong>Source:</strong> MLEO is deducted from your RUSH game vault</li>
                  <li>• <strong>Prizes:</strong> All winnings are added back to your vault</li>
                  <li>• <strong>Fair Play:</strong> All games use random outcomes with balanced odds</li>
                  <li>• <strong>Statistics:</strong> Track your wins and losses in each game</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Games Grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {games.map((game, idx) => (
              <GameCard key={idx} {...game} />
            ))}
          </section>
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/40">
              <span className="text-2xl">🎮</span>
              <span className="font-bold text-purple-300">8 Exciting Games to Play!</span>
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

      {/* Info Modal */}
      <Modal open={infoModal} onClose={() => setInfoModal(false)}>
        <div className="space-y-6">
          <section>
            <h4 className="text-lg font-bold text-white mb-2">💰 How It Works</h4>
            <p>
              Each arcade game costs <strong className="text-amber-400">1,000 MLEO</strong> per play.
              The MLEO is taken from your <strong>RUSH game vault</strong>. When you win, 
              the prize is added back to your vault.
            </p>
          </section>

          <section>
            <h4 className="text-lg font-bold text-white mb-2">🎰 Slot Machine</h4>
            <p>
              Spin 3 reels and match symbols. Get 3 identical symbols for big wins!
              <br />• Triple Diamond 💎 = 10,000 MLEO (×10)
              <br />• Triple Crown 👑 = 8,000 MLEO (×8)
              <br />• Two matching = smaller prizes
              <br />• 5% chance for random free spin
            </p>
          </section>

          <section>
            <h4 className="text-lg font-bold text-white mb-2">🎲 Dice Roller</h4>
            <p>
              Roll 3 dice and match conditions:
              <br />• Triple Six (666) = 10,000 MLEO (×10)
              <br />• Any Triple = 6,000 MLEO (×6)
              <br />• Sum 18, 17, 16 = various multipliers
              <br />• All Even/Odd = 1,500 MLEO (×1.5)
            </p>
          </section>

          <section>
            <h4 className="text-lg font-bold text-white mb-2">🎡 Wheel of Fortune</h4>
            <p>
              Spin the wheel and land on a prize segment:
              <br />• 10,000 MLEO jackpot segment
              <br />• Various prize amounts (500-5,000)
              <br />• Free spin segments
              <br />• "LOSE" segments (try again!)
            </p>
          </section>

          <section>
            <h4 className="text-lg font-bold text-white mb-2">🃏 Scratch Card</h4>
            <p>
              Scratch 9 covered symbols. Match 3 identical symbols to win!
              <br />• Diamond 💎 = 10,000 MLEO (×10)
              <br />• Crown 👑 = 8,000 MLEO (×8)
              <br />• Fire 🔥 = 6,000 MLEO (×6)
              <br />• Various other symbols with smaller prizes
            </p>
          </section>

          <section>
            <h4 className="text-lg font-bold text-white mb-2">📊 Statistics</h4>
            <p>
              Each game tracks your personal stats:
              <br />• Total plays
              <br />• Total won
              <br />• Biggest win
              <br />• Win rate
              <br />• Net profit/loss
            </p>
          </section>

          <section className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <h4 className="text-lg font-bold text-amber-300 mb-2">⚠️ Fair Play Notice</h4>
            <p className="text-sm">
              All games use random number generation for fair outcomes. The house edge is balanced
              to provide entertainment while maintaining the in-game economy. Play responsibly and
              remember this is for fun with in-game tokens you've earned!
            </p>
          </section>
        </div>
      </Modal>
    </Layout>
  );
}

