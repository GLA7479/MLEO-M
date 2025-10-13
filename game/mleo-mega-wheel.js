// ============================================================================
// MLEO Mega Wheel - Spin to Win Big!
// Cost: 1000 MLEO per spin
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_mega_wheel_v1";
const MIN_BET = 1000;

// Wheel segments (40 total)
const WHEEL_SEGMENTS = [
  1, 1.5, 1, 2, 1, 1.5, 1, 3, 1, 2, 1, 1.5, 1, 5, 1, 2, 1, 1.5, 1, 3,
  1, 2, 1, 1.5, 1, 10, 1, 2, 1, 1.5, 1, 3, 1, 2, 1, 1.5, 1, 20, 1, 50
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
export default function MegaWheelPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalSpins: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, jackpots: 0, lastBet: MIN_BET })
  );

  useEffect(() => {
    setMounted(true);
    const currentVault = getVault();
    setVaultState(currentVault);
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    
    const savedLastBet = safeRead(LS_KEY, { lastBet: MIN_BET }).lastBet;
    setBetAmount(savedLastBet.toString());
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [router.query]);

  useEffect(() => {
    if (gameResult) {
      setShowResultPopup(true);
      const timer = setTimeout(() => {
        setShowResultPopup(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [gameResult]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    spinWheel(true);
  };

  const spinWheel = (isFreePlayParam = false) => {
    if (spinning) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/mega-wheel', undefined, { shallow: true });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        alert(`Minimum bet is ${MIN_BET} MLEO`);
        return;
      }
      if (currentVault < bet) {
        alert('Insufficient MLEO in vault');
        return;
      }
      
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setCurrentBet(bet);
    setSpinning(true);
    setGameResult(null);
    setResult(null);

    // Random result
    const resultIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const multiplier = WHEEL_SEGMENTS[resultIndex];
    
    // Calculate rotation (multiple full spins + final position)
    const degreesPerSegment = 360 / WHEEL_SEGMENTS.length;
    const finalRotation = rotation + 360 * 5 + (resultIndex * degreesPerSegment);
    
    setRotation(finalRotation);

    // Wait for spin animation
    setTimeout(() => {
      setResult(multiplier);
      setSpinning(false);
      checkWin(multiplier);
    }, 3000);
  };

  const checkWin = (multiplier) => {
    const prize = Math.floor(currentBet * multiplier);

    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: multiplier >= 1,
      multiplier: multiplier,
      prize: prize,
      profit: prize - currentBet,
      jackpot: multiplier >= 20
    };

    setGameResult(resultData);

    const newStats = {
      ...stats,
      totalSpins: stats.totalSpins + 1,
      totalBet: stats.totalBet + currentBet,
      wins: multiplier >= 1 ? stats.wins + 1 : stats.wins,
      totalWon: stats.totalWon + prize,
      totalLost: stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, prize),
      jackpots: multiplier >= 20 ? stats.jackpots + 1 : stats.jackpots,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setResult(null);
    setSpinning(false);
    
    setTimeout(() => {
      spinWheel();
    }, 100);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setResult(null);
    setSpinning(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-fuchsia-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            {spinning || result || gameResult ? (
              <button 
                onClick={resetToSetup}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
              >
                BACK
              </button>
            ) : (
              <Link href="/arcade">
                <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                  BACK
                </button>
              </Link>
            )}

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">
                🎡 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Mega Wheel
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Spin the mega wheel and win big!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Wheel Display */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold mb-6">🎡 The Mega Wheel</h2>
              
              {/* Wheel Visualization */}
              <div className="relative max-w-md mx-auto mb-6">
                <div 
                  className={`w-64 h-64 mx-auto rounded-full border-8 border-purple-500 bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center transition-transform duration-3000 ease-out ${
                    spinning ? '' : ''
                  }`}
                  style={{ transform: `rotate(${rotation}deg)` }}
                >
                  <div className="text-8xl animate-spin-slow">🎡</div>
                </div>
                
                {/* Pointer */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4">
                  <div className="text-4xl">⬇️</div>
                </div>
              </div>

              {/* Result */}
              {result !== null && !spinning && (
                <div className="text-6xl font-black mb-4 text-amber-400 animate-pulse">
                  ×{result}
                </div>
              )}

              {/* Segment Distribution */}
              <div className="text-xs opacity-70 mb-4">
                Segments: ×1 (20) • ×1.5 (8) • ×2 (6) • ×3 (3) • ×5 (1) • ×10 (1) • ×20 (1) • 💎×50 (1)
              </div>
            </div>

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!spinning && !gameResult && (
                <>
                  {freePlayTokens > 0 && (
                    <button
                      onClick={startFreePlay}
                      className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                    >
                      🎁 FREE PLAY ({freePlayTokens}/5)
                    </button>
                  )}
                  
                  <button
                    onClick={() => spinWheel(false)}
                    disabled={false}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 hover:from-purple-500 hover:via-fuchsia-400 hover:to-purple-500 hover:scale-105"
                  >
                    🎡 SPIN WHEEL ({fmt(Number(betAmount) || MIN_BET)})
                  </button>
                  
                  {/* Bet Amount Input */}
                  <div className="max-w-sm mx-auto">
                    <label className="block text-sm text-zinc-400 mb-2">Bet Amount (MLEO)</label>
                    <input 
                      type="number" 
                      min={MIN_BET} 
                      step="100" 
                      value={betAmount} 
                      onChange={(e) => setBetAmount(e.target.value)} 
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-purple-500" 
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
                      Max: {((Number(betAmount) || MIN_BET) * 50).toLocaleString()} MLEO (💎 Jackpot!)
                    </div>
                  </div>
                </>
              )}

              {spinning && (
                <div className="text-2xl font-bold text-purple-400 animate-pulse">
                  🎡 Spinning...
                </div>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 to-fuchsia-500 hover:from-purple-500 hover:to-fuchsia-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 Spin Again ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Spin the wheel • Land on multipliers • Jackpot: ×50!
              </div>
            </div>

            {/* Bet Amount Input after game */}
            {gameResult && (
              <div className="max-w-sm mx-auto">
                <label className="block text-sm text-zinc-400 mb-2">Bet Amount (MLEO)</label>
                <input 
                  type="number" 
                  min={MIN_BET} 
                  step="100" 
                  value={betAmount} 
                  onChange={(e) => setBetAmount(e.target.value)} 
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-purple-500" 
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
            )}
          </div>

          {/* STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Spins</div>
              <div className="text-lg font-bold">{stats.totalSpins.toLocaleString()}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">💎 Jackpots</div>
              <div className="text-lg font-bold text-amber-400">{stats.jackpots}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>40 Segments:</strong> Wheel has 40 different multiplier segments</li>
              <li>• <strong>Spin:</strong> Place bet and spin the mega wheel</li>
              <li>• <strong>Win Prize:</strong> Wheel stops on a multiplier - you win that amount!</li>
              <li>• <strong>Multipliers:</strong></li>
              <li className="ml-4">- ×1 (50% chance) - Get your bet back</li>
              <li className="ml-4">- ×1.5 (20% chance) - Small profit</li>
              <li className="ml-4">- ×2 to ×3 (15% chance) - Nice wins</li>
              <li className="ml-4">- ×5 to ×10 (7.5% chance) - Big wins!</li>
              <li className="ml-4">- ×20 (2.5% chance) - Huge win!</li>
              <li className="ml-4">- 💎×50 (2.5% chance) - JACKPOT!</li>
              <li>• <strong>Pure Luck:</strong> Every spin is random - no strategy needed!</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per spin</li>
            </ul>
          </div>
        </div>

        {/* FLOATING RESULT POPUP */}
        {gameResult && showResultPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div 
              className={`text-center p-4 rounded-xl border-2 transition-all duration-500 transform pointer-events-auto max-w-sm mx-4 ${
                showResultPopup ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
              } ${
                gameResult.jackpot
                  ? "bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : gameResult.multiplier >= 5
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-blue-600 to-cyan-700 border-blue-300 shadow-2xl shadow-blue-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.jackpot ? "💎 JACKPOT! 💎" : gameResult.multiplier >= 10 ? "🎉 Big Win! 🎉" : "🎡 Spin Result"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Landed on ×{gameResult.multiplier}
              </div>
              <div className="space-y-1">
                <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                  +{fmt(gameResult.prize)} MLEO
                </div>
                {gameResult.profit > 0 && (
                  <div className="text-sm font-bold text-white/80">
                    Profit: +{fmt(gameResult.profit)} MLEO
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-white/70 animate-pulse">
                Auto-closing...
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

