// ============================================================================
// MLEO Slot Machine - Classic 3-Reel Slot Game
// Cost: 1000 MLEO per spin
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useAccount } from "wagmi";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_slot_machine_v1";
const MIN_BET = 1000; // Minimum bet amount

const SYMBOLS = ["💎", "🪙", "⭐", "🎁", "🔥", "🍀", "👑"];

const PRIZE_TABLE = {
  "💎💎💎": { mult: 10, label: "JACKPOT!" },
  "👑👑👑": { mult: 8, label: "ROYAL!" },
  "🔥🔥🔥": { mult: 6, label: "HOT!" },
  "⭐⭐⭐": { mult: 5, label: "STAR PRIZE!" },
  "🪙🪙🪙": { mult: 4, label: "COINS!" },
  "🎁🎁🎁": { mult: 3, label: "GIFT!" },
  "🍀🍀🍀": { mult: 3, label: "LUCKY!" },
  "💎💎": { mult: 2, label: "Two Diamonds" },
  "👑👑": { mult: 2, label: "Two Crowns" },
  "🔥🔥": { mult: 1.5, label: "Two Fire" },
  "⭐⭐": { mult: 1.5, label: "Two Stars" },
  "FREE_SPIN": { mult: 0, label: "FREE SPIN!", freeSpin: true },
};

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
function checkWin(reels) {
  const [r1, r2, r3] = reels;
  
  // Check 3 matching
  if (r1 === r2 && r2 === r3) {
    const key = `${r1}${r2}${r3}`;
    return PRIZE_TABLE[key] || { mult: 3, label: "Three Match!" };
  }
  
  // Check 2 matching (first two)
  if (r1 === r2) {
    const key = `${r1}${r2}`;
    return PRIZE_TABLE[key] || { mult: 1.5, label: "Two Match!" };
  }
  
  // Free spin chance (5%)
  if (Math.random() < 0.05) {
    return { mult: 0, label: "FREE SPIN!", freeSpin: true };
  }
  
  return null;
}

function randomSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function SlotMachinePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState([randomSymbol(), randomSymbol(), randomSymbol()]);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalSpins: 0, totalBet: 0, totalWon: 0, biggestWin: 0, lastBet: MIN_BET }));
  const [freeSpins, setFreeSpins] = useState(0);
  const [showPrizeTable, setShowPrizeTable] = useState(false);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);

  const spinSound = useRef(null);
  const winSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    
    // Load last bet amount
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) {
      setBetAmount(String(savedStats.lastBet));
    }
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
    }, 2000);
    
    // Preload sounds
    if (typeof Audio !== "undefined") {
      spinSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
    
    return () => clearInterval(interval);
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    spin(true);
  };

  const spin = async (isFreePlayParam = false) => {
    if (spinning) return;

    let bet = Number(betAmount) || MIN_BET;
    const cost = freeSpins > 0 ? 0 : bet;
    
    if ((isFreePlay || isFreePlayParam) && cost > 0) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/slots', undefined, { shallow: true });
        setCurrentBet(bet);
      } else {
        setResult({ error: true, message: 'No free play tokens available!' });
        setIsFreePlay(false);
        return;
      }
    } else {
      const currentVault = getVault();

      if (cost > 0 && currentVault < cost) {
        setResult({ error: true, message: "Not enough MLEO!" });
        return;
      }

      // Deduct cost
      if (cost > 0) {
        setVault(currentVault - cost);
        setVaultState(currentVault - cost);
        setCurrentBet(bet); // Store bet amount for prize calculations
      } else {
        setFreeSpins(freeSpins - 1);
      }
    }

    setSpinning(true);
    setResult(null);
    
    if (spinSound.current) {
      spinSound.current.currentTime = 0;
      spinSound.current.play().catch(() => {});
    }

    // Animate reels
    const iterations = 20;
    for (let i = 0; i < iterations; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      setReels([randomSymbol(), randomSymbol(), randomSymbol()]);
    }

    // Final result
    const finalReels = [randomSymbol(), randomSymbol(), randomSymbol()];
    setReels(finalReels);

    const win = checkWin(finalReels);
    
    if (win) {
      if (win.freeSpin) {
        setFreeSpins(f => f + 1);
        setResult({ win: true, message: win.label, prize: 0, freeSpin: true });
      } else {
        const prize = Math.floor(currentBet * win.mult);
        const newVault = getVault() + prize;
        setVault(newVault);
        setVaultState(newVault);
        
        setStats(s => ({
          totalSpins: s.totalSpins + 1,
          totalBet: (s.totalBet || 0) + currentBet,
          totalWon: s.totalWon + prize,
          biggestWin: Math.max(s.biggestWin, prize),
          lastBet: currentBet
        }));

        setResult({ win: true, message: win.label, prize });
        
        if (winSound.current) {
          winSound.current.currentTime = 0;
          winSound.current.play().catch(() => {});
        }
      }
    } else {
      setResult({ win: false, message: "Try Again!" });
      setStats(s => ({ ...s, totalSpins: s.totalSpins + 1, totalBet: (s.totalBet || 0) + currentBet, lastBet: currentBet }));
    }

    setSpinning(false);
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Slot Machine</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout isGame={true} title="MLEO Slot Machine 🎰">
      <main className="min-h-[100svh] bg-gradient-to-b from-purple-950 via-indigo-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER - Centered title with BACK on opposite side */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🎰</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-300 bg-clip-text text-transparent">
                  MLEO Slots
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Classic 3-Reel Slot Machine</div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* SLOT MACHINE */}
          <div className="rounded-3xl p-8 bg-gradient-to-br from-amber-900/30 via-yellow-900/20 to-amber-900/30 border-4 border-yellow-600/50 shadow-2xl mb-6">
            
            {/* REELS */}
            <div className="flex justify-center gap-4 mb-8">
              {reels.map((symbol, idx) => (
                <div
                  key={idx}
                  className={`w-32 h-32 rounded-2xl bg-gradient-to-br from-white to-zinc-200 border-4 border-yellow-500 flex items-center justify-center text-7xl shadow-lg ${
                    spinning ? "animate-pulse" : ""
                  }`}
                >
                  {symbol}
                </div>
              ))}
            </div>

            {/* RESULT */}
            {result && (
              <div className={`text-center mb-6 p-4 rounded-xl border-2 ${
                result.error
                  ? "bg-red-900/30 border-red-500"
                  : result.win
                  ? "bg-green-900/30 border-green-500 animate-pulse"
                  : "bg-zinc-800/50 border-zinc-600"
              }`}>
                <div className="text-2xl font-bold mb-2">{result.message}</div>
                {result.prize > 0 && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(result.prize)} MLEO
                  </div>
                )}
                {result.freeSpin && (
                  <div className="text-xl font-bold text-amber-400">
                    🎁 You got a free spin!
                  </div>
                )}
              </div>
            )}

            {/* SPIN BUTTON */}
            <div className="text-center mb-6">
              {freePlayTokens > 0 && !spinning && freeSpins === 0 && (
                <button
                  onClick={startFreePlay}
                  className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                >
                  🎁 FREE PLAY ({freePlayTokens}/5)
                </button>
              )}
              
              <button
                onClick={spin}
                disabled={spinning || (vault < (Number(betAmount) || MIN_BET) && freeSpins === 0)}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  spinning
                    ? "bg-zinc-700 cursor-wait"
                    : vault < (Number(betAmount) || MIN_BET) && freeSpins === 0
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600 hover:from-yellow-500 hover:via-amber-400 hover:to-yellow-500 hover:scale-105"
                }`}
              >
                {spinning ? "🎰 SPINNING..." : freeSpins > 0 ? "🎁 FREE SPIN!" : `🎰 SPIN (${fmt(Number(betAmount) || MIN_BET)})`}
              </button>
              <div className="text-sm opacity-60 mt-3">
                {freeSpins > 0 ? `${freeSpins} free spins available` : `${fmt(Number(betAmount) || MIN_BET)} MLEO per spin`}
              </div>
            </div>

            {/* Bet Amount Input */}
            <div className="max-w-sm mx-auto">
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
            </div>
          </div>

          {/* STATS - Moved below game window */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-gradient-to-br from-amber-600/20 to-yellow-600/20 border border-amber-500/30">
              <div className="text-xs opacity-70 mb-1">Free Spins</div>
              <div className="text-xl font-bold text-amber-400">{freeSpins}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Spins</div>
              <div className="text-lg font-bold">{stats.totalSpins}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>
          </div>

          {/* PRIZE TABLE */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10">
            <button
              onClick={() => setShowPrizeTable(!showPrizeTable)}
              className="w-full flex items-center justify-between text-lg font-bold mb-4"
            >
              <span>🏆 Prize Table</span>
              <span>{showPrizeTable ? "▲" : "▼"}</span>
            </button>
            
            {showPrizeTable && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 text-center font-semibold text-sm border-b border-white/20 pb-2">
                  <div>Combination</div>
                  <div>Prize</div>
                  <div>Multiplier</div>
                </div>
                
                {Object.entries(PRIZE_TABLE).map(([combo, data]) => (
                  <div key={combo} className="grid grid-cols-3 gap-2 text-center text-sm py-2 border-b border-white/10">
                    <div className="text-2xl">{combo === "FREE_SPIN" ? "🎁🎁🎁" : combo}</div>
                    <div className="font-bold text-green-400">
                      {data.freeSpin ? "FREE SPIN" : `${fmt((Number(betAmount) || MIN_BET) * data.mult)}`}
                    </div>
                    <div className="text-amber-400">{data.freeSpin ? "🎁" : `×${data.mult}`}</div>
                  </div>
                ))}
                
                <div className="text-xs opacity-60 text-center mt-4">
                  💡 5% chance for random FREE SPIN on any result!
                </div>
              </div>
            )}
          </div>

          {/* STATS */}
          <div className="mt-6 rounded-2xl p-6 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border border-purple-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm opacity-70">Total Spins</div>
                <div className="text-2xl font-bold">{stats.totalSpins}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Total Won</div>
                <div className="text-2xl font-bold text-green-400">{fmt(stats.totalWon)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Biggest Win</div>
                <div className="text-2xl font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Win Rate</div>
                <div className="text-2xl font-bold text-blue-400">
                  {stats.totalSpins > 0 ? `${((stats.totalWon / stats.totalBet) * 100).toFixed(1)}%` : "0%"}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}

