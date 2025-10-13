// ============================================================================
// MLEO Wheel of Fortune - Spinning Wheel Game
// Cost: 1000 MLEO per spin
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_wheel_fortune_v1";
const MIN_BET = 1000; // Minimum bet amount

const WHEEL_SEGMENTS = [
  { label: "10,000", value: 10000, color: "#FFD700", mult: 10 },
  { label: "LOSE", value: 0, color: "#DC2626", mult: 0 },
  { label: "2,000", value: 2000, color: "#10B981", mult: 2 },
  { label: "500", value: 500, color: "#3B82F6", mult: 0.5 },
  { label: "5,000", value: 5000, color: "#8B5CF6", mult: 5 },
  { label: "LOSE", value: 0, color: "#DC2626", mult: 0 },
  { label: "1,500", value: 1500, color: "#F59E0B", mult: 1.5 },
  { label: "FREE", value: -1, color: "#EC4899", mult: 0, freeSpin: true },
  { label: "3,000", value: 3000, color: "#14B8A6", mult: 3 },
  { label: "LOSE", value: 0, color: "#DC2626", mult: 0 },
  { label: "1,000", value: 1000, color: "#06B6D4", mult: 1 },
  { label: "LOSE", value: 0, color: "#DC2626", mult: 0 },
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
// MAIN COMPONENT
// ============================================================================
export default function WheelFortunePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalSpins: 0, totalBet: 0, totalWon: 0, biggestWin: 0, freeSpins: 0, lastBet: MIN_BET })
  );
  const [freeSpinsAvailable, setFreeSpinsAvailable] = useState(0);

  const spinSound = useRef(null);
  const winSound = useRef(null);
  const wheelRef = useRef(null);

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
    const cost = freeSpinsAvailable > 0 ? 0 : bet;
    
    if ((isFreePlay || isFreePlayParam) && cost > 0) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/wheel', undefined, { shallow: true });
        setCurrentBet(bet);
      } else {
        setResult({ error: true, message: 'No free play tokens available!' });
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET && cost > 0) {
        setResult({ error: true, message: `Minimum bet is ${MIN_BET} MLEO!` });
        return;
      }
      
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
        setFreeSpinsAvailable(freeSpinsAvailable - 1);
      }
    }

    setSpinning(true);
    setResult(null);
    
    if (spinSound.current) {
      spinSound.current.currentTime = 0;
      spinSound.current.play().catch(() => {});
    }

    // Calculate random winning segment
    const winningIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const segmentAngle = 360 / WHEEL_SEGMENTS.length;
    
    // Calculate final rotation (multiple full spins + landing position)
    const spins = 5 + Math.random() * 3; // 5-8 full rotations
    const baseRotation = spins * 360;
    const segmentOffset = (winningIndex * segmentAngle) + (segmentAngle / 2);
    const finalRotation = baseRotation + (360 - segmentOffset);
    
    // Animate wheel
    setRotation(rotation + finalRotation);

    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 4000));

    const winner = WHEEL_SEGMENTS[winningIndex];
    
    if (winner.freeSpin) {
      setFreeSpinsAvailable(f => f + 1);
      setStats(s => ({ ...s, totalSpins: s.totalSpins + 1, freeSpins: s.freeSpins + 1, lastBet: currentBet }));
      setResult({ 
        win: true, 
        message: "FREE SPIN!", 
        prize: 0, 
        freeSpin: true 
      });
    } else if (winner.value > 0) {
      const prize = Math.floor(currentBet * winner.mult);
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

      setResult({ 
        win: true, 
        message: `You won ${fmt(prize)} MLEO!`, 
        prize,
        color: winner.color
      });
      
      if (winSound.current) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
    } else {
      setStats(s => ({ ...s, totalSpins: s.totalSpins + 1, lastBet: currentBet }));
      setResult({ 
        win: false, 
        message: "Better luck next time!" 
      });
    }

    setSpinning(false);
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Wheel of Fortune</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout isGame={true} title="MLEO Wheel of Fortune 🎡">
      <main className="min-h-[100svh] bg-gradient-to-b from-indigo-950 via-purple-950 to-black text-zinc-100">
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
                <span className="text-5xl">🎡</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                  Wheel of Fortune
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Spin the wheel and win prizes!</div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* WHEEL GAME - Main Window */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-purple-900/30 via-indigo-900/20 to-pink-900/30 border-4 border-purple-600/50 shadow-2xl mb-6">
            <div className="flex flex-col items-center">
              <div className="relative w-full max-w-md aspect-square">
              {/* Pointer */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 -mt-4">
                <div className="w-0 h-0 border-l-[20px] border-r-[20px] border-t-[40px] border-l-transparent border-r-transparent border-t-red-500 drop-shadow-lg" />
              </div>

              {/* Wheel */}
              <div 
                ref={wheelRef}
                className="relative w-full h-full rounded-full border-8 border-yellow-500 shadow-2xl overflow-hidden"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none'
                }}
              >
                {WHEEL_SEGMENTS.map((segment, index) => {
                  const angle = (360 / WHEEL_SEGMENTS.length) * index;
                  return (
                    <div
                      key={index}
                      className="absolute w-full h-full origin-center"
                      style={{
                        transform: `rotate(${angle}deg)`,
                        clipPath: `polygon(50% 50%, 100% 0%, 100% ${100 / WHEEL_SEGMENTS.length}%)`
                      }}
                    >
                      <div 
                        className="w-full h-full flex items-start justify-end pr-4 pt-2"
                        style={{ backgroundColor: segment.color }}
                      >
                        <div 
                          className="text-white font-bold text-sm drop-shadow-lg"
                          style={{ transform: `rotate(${360 / WHEEL_SEGMENTS.length / 2}deg)` }}
                        >
                          {segment.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Center circle */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border-4 border-white shadow-xl flex items-center justify-center">
                  <span className="text-2xl">🎡</span>
                </div>
              </div>
            </div>

            {/* RESULT */}
            {result && (
              <div className={`mt-6 w-full max-w-md text-center p-6 rounded-xl border-2 ${
                result.error
                  ? "bg-red-900/30 border-red-500"
                  : result.win
                  ? "bg-green-900/30 border-green-500 animate-pulse"
                  : "bg-zinc-800/50 border-zinc-600"
              }`}>
                <div className="text-2xl font-bold mb-2">{result.message}</div>
                {result.prize > 0 && (
                  <div className="text-4xl font-bold text-green-400">
                    +{fmt(result.prize)} MLEO
                  </div>
                )}
                {result.freeSpin && (
                  <div className="text-xl font-bold text-pink-400 mt-2">
                    🎁 You got a free spin!
                  </div>
                )}
              </div>
            )}

            {/* SPIN BUTTON */}
            <div className="text-center mb-6">
              {freePlayTokens > 0 && !spinning && freeSpinsAvailable === 0 && (
                <button
                  onClick={startFreePlay}
                  className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                >
                  🎁 FREE PLAY ({freePlayTokens}/5)
                </button>
              )}
              
              <button
                onClick={spin}
                disabled={spinning || (vault < (Number(betAmount) || MIN_BET) && freeSpinsAvailable === 0)}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  spinning
                    ? "bg-zinc-700 cursor-wait"
                    : vault < (Number(betAmount) || MIN_BET) && freeSpinsAvailable === 0
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-pink-600 via-purple-500 to-indigo-600 hover:from-pink-500 hover:via-purple-400 hover:to-indigo-500 hover:scale-105"
                }`}
              >
                {spinning ? "🎡 SPINNING..." : freeSpinsAvailable > 0 ? "🎁 FREE SPIN!" : `🎡 SPIN (${fmt(Number(betAmount) || MIN_BET)})`}
              </button>
            </div>
            <div className="text-sm opacity-60 mb-6">
              {freeSpinsAvailable > 0 ? `${freeSpinsAvailable} free spins available` : `${fmt(Number(betAmount) || MIN_BET)} MLEO per spin`}
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
                className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-pink-500" 
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
            </div>
          </div>

          {/* STATS - 4 Windows below game */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-gradient-to-br from-pink-600/20 to-purple-600/20 border border-pink-500/30">
              <div className="text-xs opacity-70 mb-1">Free Spins</div>
              <div className="text-xl font-bold text-pink-400">{freeSpinsAvailable}</div>
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

          {/* PRIZES */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">🏆 Prize List</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {WHEEL_SEGMENTS.map((segment, idx) => (
                <div 
                  key={idx}
                  className="rounded-lg p-3 border-2 text-center"
                  style={{ 
                    borderColor: segment.color,
                    backgroundColor: `${segment.color}20`
                  }}
                >
                  <div className="font-bold text-lg" style={{ color: segment.color }}>
                    {segment.label}
                  </div>
                  {segment.mult > 0 && (
                    <div className="text-xs opacity-70 mt-1">×{segment.mult}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border border-purple-500/30">
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
                <div className="text-sm opacity-70">Free Spins Won</div>
                <div className="text-2xl font-bold text-pink-400">{stats.freeSpins}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Win Rate</div>
                <div className="text-2xl font-bold text-blue-400">
                  {stats.totalSpins > 0 ? `${((stats.totalWon / stats.totalBet) * 100).toFixed(1)}%` : "0%"}
                </div>
              </div>
              <div>
                <div className="text-sm opacity-70">Net Profit</div>
                <div className={`text-2xl font-bold ${
                  stats.totalWon - stats.totalBet >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {fmt(stats.totalWon - stats.totalBet)}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}

