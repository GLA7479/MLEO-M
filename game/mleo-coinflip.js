// ============================================================================
// MLEO Coin Flip - Simple 50/50 Game with Multipliers
// Cost: 1000 MLEO per flip
// ============================================================================

import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import Link from "next/link";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_coinflip_v1";
const MIN_BET = 1000; // Minimum bet amount

const MULTIPLIERS = [
  { label: "×1.5", value: 1.5, chance: 0.6 },
  { label: "×2", value: 2, chance: 0.3 },
  { label: "×3", value: 3, chance: 0.15 },
  { label: "×5", value: 5, chance: 0.05 },
  { label: "×10", value: 10, chance: 0.01 },
];

// ============================================================================
// STORAGE
// ============================================================================
function safeRead(key, fallback = {}) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
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
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

// ============================================================================
// GAME LOGIC
// ============================================================================
function flipCoin() {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

function getRandomMultiplier() {
  const rand = Math.random();
  let cumulativeChance = 0;
  
  for (const mult of MULTIPLIERS) {
    cumulativeChance += mult.chance;
    if (rand < cumulativeChance) {
      return mult;
    }
  }
  
  return MULTIPLIERS[0]; // Fallback
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CoinFlipPage() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [flipping, setFlipping] = useState(false);
  const [choice, setChoice] = useState(null);
  const [result, setResult] = useState(null);
  const [coinSide, setCoinSide] = useState('heads');
  const [selectedMultiplier, setSelectedMultiplier] = useState(MULTIPLIERS[0]);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalFlips: 0, totalBet: 0, wins: 0, totalWon: 0, biggestWin: 0, streak: 0, bestStreak: 0, lastBet: MIN_BET })
  );

  const flipSound = useRef(null);
  const winSound = useRef(null);
  const loseSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    // Load last bet amount
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) {
      setBetAmount(String(savedStats.lastBet));
    }
    
    if (typeof Audio !== "undefined") {
      flipSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
      loseSound.current = new Audio("/sounds/click.mp3");
    }
  }, []);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const makeFlip = async (chosenSide) => {
    if (flipping) return;

    const currentVault = getVault();
    const bet = Number(betAmount) || MIN_BET;
    if (bet < MIN_BET) {
      setResult({ error: true, message: `Minimum bet is ${MIN_BET} MLEO!` });
      return;
    }
    
    if (currentVault < bet) {
      setResult({ error: true, message: "Not enough MLEO!" });
      return;
    }

    // Deduct cost
    setVault(currentVault - bet);
    setVaultState(currentVault - bet);
    setCurrentBet(bet); // Store bet amount for prize calculations

    setChoice(chosenSide);
    setFlipping(true);
    setResult(null);
    
    if (flipSound.current) {
      flipSound.current.currentTime = 0;
      flipSound.current.play().catch(() => {});
    }

    // Animate coin flip
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      setCoinSide(i % 2 === 0 ? 'heads' : 'tails');
    }

    // Final result
    const finalSide = flipCoin();
    setCoinSide(finalSide);
    
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if won
    if (finalSide === chosenSide) {
      // Win - get multiplier
      const mult = getRandomMultiplier();
      const prize = Math.floor(currentBet * mult.value);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      if (winSound.current) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }

      const newStreak = stats.streak + 1;
      setStats(s => ({
        totalFlips: s.totalFlips + 1,
        totalBet: (s.totalBet || 0) + currentBet,
        wins: s.wins + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        streak: newStreak,
        bestStreak: Math.max(s.bestStreak, newStreak),
        lastBet: currentBet
      }));

      setResult({ 
        win: true, 
        message: `You Win!`, 
        prize,
        multiplier: mult.label,
        side: finalSide
      });
    } else {
      // Lose
      if (loseSound.current) {
        loseSound.current.currentTime = 0;
        loseSound.current.play().catch(() => {});
      }

      setStats(s => ({
        ...s,
        totalFlips: s.totalFlips + 1,
        totalBet: (s.totalBet || 0) + currentBet,
        streak: 0,
        lastBet: currentBet
      }));

      setResult({ 
        win: false, 
        message: "You Lose!", 
        side: finalSide
      });
    }

    setFlipping(false);
    setChoice(null);
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Coin Flip</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout isGame={true} title="MLEO Coin Flip 🪙">
      <main className="min-h-[100svh] bg-gradient-to-b from-yellow-950 via-amber-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🪙</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 bg-clip-text text-transparent">
                  MLEO Coin Flip
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">50/50 chance with multipliers!</div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* COIN FLIP GAME - Main Window */}
          <div className="rounded-3xl p-8 bg-gradient-to-br from-yellow-900/30 via-amber-900/20 to-orange-900/30 border-4 border-yellow-600/50 shadow-2xl mb-6">
            
            {/* Coin */}
            <div className="flex justify-center mb-8">
              <div className={`relative w-48 h-48 ${flipping ? 'animate-spin' : ''}`}>
                <div className="w-full h-full rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 border-8 border-yellow-500 flex items-center justify-center text-6xl font-bold shadow-2xl">
                  {coinSide === 'heads' ? '👑' : '⭐'}
                </div>
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center">
                  <div className="text-sm opacity-70">
                    {coinSide === 'heads' ? 'HEADS' : 'TAILS'}
                  </div>
                </div>
              </div>
            </div>

            {/* Result */}
            {result && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                result.error
                  ? "bg-red-900/30 border-red-500"
                  : result.win
                  ? "bg-green-900/30 border-green-500 animate-pulse"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">{result.message}</div>
                {result.win && (
                  <>
                    <div className="text-5xl font-bold text-green-400 mb-2">
                      +{fmt(result.prize)} MLEO
                    </div>
                    <div className="text-2xl text-amber-400 font-bold">
                      Multiplier: {result.multiplier}
                    </div>
                  </>
                )}
                <div className="text-sm opacity-70 mt-2">
                  Coin landed on: {result.side.toUpperCase()}
                </div>
              </div>
            )}

            {/* Flip Buttons */}
            <div className="flex gap-4 justify-center mb-6">
              <button
                onClick={() => makeFlip('heads')}
                disabled={flipping || vault < (Number(betAmount) || MIN_BET)}
                className={`px-12 py-6 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  flipping || vault < (Number(betAmount) || MIN_BET)
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : choice === 'heads'
                    ? "bg-gradient-to-r from-yellow-500 to-amber-400 scale-105"
                    : "bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 hover:scale-105"
                }`}
              >
                👑 HEADS
              </button>
              
              <button
                onClick={() => makeFlip('tails')}
                disabled={flipping || vault < (Number(betAmount) || MIN_BET)}
                className={`px-12 py-6 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  flipping || vault < (Number(betAmount) || MIN_BET)
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : choice === 'tails'
                    ? "bg-gradient-to-r from-orange-500 to-red-400 scale-105"
                    : "bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 hover:scale-105"
                }`}
              >
                ⭐ TAILS
              </button>
            </div>

            {/* Bet Amount Input */}
            <div className="max-w-sm mx-auto mb-8">
              <label className="block text-sm text-zinc-400 mb-2">Bet Amount (MLEO)</label>
              <input 
                type="number" 
                min={MIN_BET} 
                step="100" 
                value={betAmount} 
                onChange={(e) => setBetAmount(e.target.value)} 
                className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" 
                placeholder="1000" 
              />
              <div className="flex gap-2 mt-2 justify-center flex-wrap">
                {[1000, 2500, 5000, 10000].map((v) => (
                  <button 
                    key={v} 
                    onClick={() => setBetAmount(String(v))} 
                    className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
                  >
                    {v >= 1000 ? `${v/1000}K` : v}
                  </button>
                ))}
              </div>
              <div className="text-xs text-zinc-500 mt-2 text-center">
                Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
              </div>
            </div>

            <div className="text-center text-sm opacity-60">
              {fmt(Number(betAmount) || MIN_BET)} MLEO per flip
            </div>
          </div>

          {/* STATS - 4 Windows below game */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Win Streak</div>
              <div className="text-lg font-bold text-amber-400">{stats.streak}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Win Rate</div>
              <div className="text-lg font-bold text-blue-400">
                {stats.totalFlips > 0 ? `${((stats.wins / stats.totalFlips) * 100).toFixed(1)}%` : "0%"}
              </div>
            </div>
          </div>

          {/* MULTIPLIER TABLE */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">🎯 Win Multipliers</h3>
            <div className="grid grid-cols-5 gap-3">
              {MULTIPLIERS.map((mult, idx) => (
                <div 
                  key={idx}
                  className="rounded-lg p-3 bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 text-center"
                >
                  <div className="text-xl font-bold text-yellow-400">{mult.label}</div>
                  <div className="text-xs opacity-70 mt-1">{(mult.chance * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
            <div className="text-xs opacity-60 text-center mt-4">
              💡 Win multiplier is randomly selected when you win!
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• Choose HEADS (👑) or TAILS (⭐)</li>
              <li>• Win = get random multiplier (×1.5 to ×10!)</li>
              <li>• 50/50 chance - pure luck!</li>
              <li>• Build win streaks for bragging rights</li>
              <li>• Simple, fast, and exciting!</li>
            </ul>
          </div>

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-amber-900/20 to-yellow-900/20 border border-amber-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm opacity-70">Total Flips</div>
                <div className="text-2xl font-bold">{stats.totalFlips}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Wins</div>
                <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Total Won</div>
                <div className="text-2xl font-bold text-emerald-400">{fmt(stats.totalWon)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Biggest Win</div>
                <div className="text-2xl font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Current Streak</div>
                <div className="text-2xl font-bold text-blue-400">{stats.streak}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Best Streak</div>
                <div className="text-2xl font-bold text-purple-400">{stats.bestStreak}</div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}

