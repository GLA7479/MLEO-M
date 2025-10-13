// ============================================================================
// MLEO Tower - Risk Climbing Game
// Cost: 1000 MLEO per climb
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken as consumeFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_tower_v1";
const MIN_BET = 1000; // Minimum bet amount
const MAX_FLOORS = 10;
const MULTIPLIER_PER_FLOOR = 1.3;

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
function simulateClimb(currentFloor) {
  const nextFloor = currentFloor + 1;
  const newMultiplier = Math.pow(MULTIPLIER_PER_FLOOR, nextFloor - 1);
  
  // Check if tower collapses (random chance increases with each floor)
  const collapseChance = Math.min(0.8, (nextFloor - 1) * 0.1 + 0.1);
  const random = Math.random();
  
  return {
    success: random >= collapseChance,
    floor: nextFloor,
    multiplier: newMultiplier
  };
}

function calculatePrize(bet, multiplier) {
  return Math.floor(bet * multiplier);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MLEOTowerPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [gameActive, setGameActive] = useState(false);
  const [currentFloor, setCurrentFloor] = useState(1);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [canCashOut, setCanCashOut] = useState(false);
  const [result, setResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, history: [], lastBet: MIN_BET })
  );

  // ----------------------- Mount -------------------
  useEffect(() => {
    setMounted(true);
    const currentVault = getVault();
    setVaultState(currentVault);
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    
    // Load last bet amount
    const savedLastBet = safeRead(LS_KEY, { lastBet: MIN_BET }).lastBet;
    setBetAmount(savedLastBet.toString());
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [router.query]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setIsFreePlay(true);
    setBetAmount("1000");
    setTimeout(() => startGame(), 100);
  };

  const startGame = async () => {
    if (gameActive) return;

    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay) {
      const result = consumeFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/tower', undefined, { shallow: true });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      const currentVault = getVault();
      if (bet < MIN_BET) {
        alert(`Minimum bet is ${MIN_BET} MLEO`);
        return;
      }
      if (currentVault < bet) {
        alert('Insufficient MLEO in vault');
        return;
      }

      // Deduct bet
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setCurrentBet(bet);
    setGameActive(true);
    setCurrentFloor(1);
    setCurrentMultiplier(1.0);
    setCanCashOut(true);
    setResult(null);
  };

  const climbFloor = () => {
    if (!gameActive || !canCashOut) return;

    const climbResult = simulateClimb(currentFloor);
    
    if (climbResult.success) {
      setCurrentFloor(climbResult.floor);
      setCurrentMultiplier(climbResult.multiplier);
      
      if (climbResult.floor >= MAX_FLOORS) {
        // Reached top floor - auto cash out
        cashOut();
      }
    } else {
      // Tower collapses!
      setGameActive(false);
      setCanCashOut(false);
      setCurrentFloor(climbResult.floor);
      setCurrentMultiplier(climbResult.multiplier);

      const resultData = {
        win: false,
        floor: climbResult.floor,
        multiplier: climbResult.multiplier,
        prize: 0,
        collapsed: true
      };

      setResult(resultData);

      // Update stats
      const newStats = {
        ...stats,
        totalGames: stats.totalGames + 1,
        totalBet: stats.totalBet + currentBet,
        totalLost: stats.totalLost + currentBet,
        history: [{ ...resultData, bet: currentBet, timestamp: Date.now() }, ...stats.history.slice(0, 9)],
        lastBet: currentBet
      };
      setStats(newStats);
      safeWrite(LS_KEY, newStats);
    }
  };

  const cashOut = () => {
    if (!gameActive || !canCashOut) return;

    const prize = calculatePrize(currentBet, currentMultiplier);
    const currentVault = getVault();
    const newVault = currentVault + prize;

    setVault(newVault);
    setVaultState(newVault);
    setGameActive(false);
    setCanCashOut(false);

    const resultData = {
      win: true,
      floor: currentFloor,
      multiplier: currentMultiplier,
      prize: prize,
      collapsed: false
    };

    setResult(resultData);

    // Update stats
    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      totalBet: stats.totalBet + currentBet,
      wins: stats.wins + 1,
      totalWon: stats.totalWon + prize,
      biggestWin: Math.max(stats.biggestWin, prize),
      history: [{ ...resultData, bet: currentBet, timestamp: Date.now() }, ...stats.history.slice(0, 9)],
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setResult(null);
    setCurrentFloor(1);
    setCurrentMultiplier(1.0);
    setGameActive(false);
    setCanCashOut(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">⚖️ MLEO Tower</h1>
              <p className="text-zinc-400 text-sm">Climb the tower and cash out before it collapses!</p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Tower Display */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🏗️ Tower</h2>
              <div className="flex flex-col-reverse items-center max-w-md mx-auto">
                {Array.from({ length: MAX_FLOORS }, (_, i) => {
                  const floorNum = i + 1;
                  const isActive = floorNum === currentFloor;
                  const isCompleted = floorNum < currentFloor;
                  const multiplier = Math.pow(MULTIPLIER_PER_FLOOR, floorNum - 1);

                  return (
                    <div
                      key={floorNum}
                      className={`w-full h-12 mb-2 rounded-lg border-2 flex items-center justify-between px-4 transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 border-purple-400 shadow-lg scale-105"
                          : isCompleted
                          ? "bg-gradient-to-r from-green-600 to-emerald-600 border-green-400"
                          : "bg-gradient-to-r from-gray-700 to-gray-800 border-gray-600"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">
                          {isActive ? "🏗️" : isCompleted ? "✅" : "🏗️"}
                        </span>
                        <span className="font-bold">
                          Floor {floorNum}
                        </span>
                      </div>
                      <div className="text-sm font-bold">
                        ×{multiplier.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Current Status */}
            {gameActive && (
              <div className="text-center mb-6 p-4 rounded-xl bg-purple-900/30 border border-purple-500">
                <div className="text-2xl font-bold mb-2">
                  Floor {currentFloor} • ×{currentMultiplier.toFixed(2)}
                </div>
                <div className="text-lg text-purple-300">
                  Current Prize: {fmt(calculatePrize(currentBet, currentMultiplier))} MLEO
                </div>
                <div className="text-sm text-zinc-400 mt-2">
                  Collapse Risk: {Math.min(80, (currentFloor - 1) * 10 + 10)}%
                </div>
              </div>
            )}

            {/* Result Display */}
            {result && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                result.win
                  ? "bg-green-900/30 border-green-500"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">
                  {result.win ? "🏆 Cash Out!" : "💥 Tower Collapsed!"}
                </div>
                <div className="text-xl mb-2">
                  Reached Floor {result.floor}
                </div>
                {result.win && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(result.prize)} MLEO ({result.multiplier.toFixed(2)}x)
                  </div>
                )}
                {!result.win && (
                  <div className="text-xl text-red-400">
                    Lost {fmt(currentBet)} MLEO
                  </div>
                )}
              </div>
            )}

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!gameActive && !result && (
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
                    onClick={startGame}
                    disabled={false}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 hover:from-purple-500 hover:via-pink-400 hover:to-indigo-500 hover:scale-105"
                  >
                    🏗️ START CLIMBING ({fmt(Number(betAmount) || MIN_BET)})
                  </button>
                </>
              )}

              {gameActive && canCashOut && (
                <div className="flex gap-4 justify-center mb-6">
                  <button
                    onClick={cashOut}
                    className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 transition-all"
                  >
                    💰 Cash Out ({fmt(calculatePrize(currentBet, currentMultiplier))})
                  </button>
                  <button
                    onClick={climbFloor}
                    className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 transition-all"
                  >
                    ⬆️ Climb Floor
                  </button>
                </div>
              )}

              {result && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 transition-all mb-6"
                >
                  🔄 Play Again ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Risk increases with each floor • Max win: {fmt((Number(betAmount) || MIN_BET) * 10)}
              </div>
            </div>

            {/* Bet Amount Input - Only after result */}
            {result && (
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
                  Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
                </div>
              </div>
            )}
          </div>

          {/* STATS - 4 Windows below game */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Games</div>
              <div className="text-lg font-bold">
                {stats.totalGames.toLocaleString()}
              </div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Wins</div>
              <div className="text-lg font-bold text-amber-400">{stats.wins}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Start climbing:</strong> Begin at Floor 1 with ×1.00 multiplier</li>
              <li>• <strong>Each floor:</strong> Multiplier increases by ×1.3, but collapse risk increases</li>
              <li>• <strong>Cash out:</strong> Take your winnings at any time, or risk climbing higher</li>
              <li>• <strong>Tower collapse:</strong> If it collapses, you lose everything</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per game</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}