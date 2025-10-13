// ============================================================================
// MLEO Target Shooter - Click Fast, Win Big!
// Cost: 1000 MLEO per game
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_shooter_v1";
const MIN_BET = 1000;
const TOTAL_TARGETS = 10;
const TIME_LIMIT = 20; // seconds

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
export default function ShooterPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [gameActive, setGameActive] = useState(false);
  const [targets, setTargets] = useState([]);
  const [hitTargets, setHitTargets] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, perfectGames: 0, lastBet: MIN_BET })
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

  // Timer countdown
  useEffect(() => {
    if (gameActive && !gameResult && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timer);
            endGame();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameActive, gameResult, timeLeft]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    startGame(true);
  };

  const startGame = (isFreePlayParam = false) => {
    if (gameActive) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/shooter', undefined, { shallow: true });
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
    setGameActive(true);
    setGameResult(null);
    setHitTargets([]);
    setTimeLeft(TIME_LIMIT);
    
    // Generate random target positions
    const newTargets = [];
    for (let i = 0; i < TOTAL_TARGETS; i++) {
      newTargets.push({
        id: i,
        x: Math.random() * 80 + 10, // 10-90%
        y: Math.random() * 70 + 10  // 10-80%
      });
    }
    setTargets(newTargets);
  };

  const hitTarget = (targetId) => {
    if (!gameActive || gameResult || hitTargets.includes(targetId)) return;
    
    const newHits = [...hitTargets, targetId];
    setHitTargets(newHits);

    if (newHits.length >= TOTAL_TARGETS) {
      // Hit all targets!
      endGame();
    }
  };

  const endGame = () => {
    setGameActive(false);

    const accuracy = hitTargets.length / TOTAL_TARGETS;
    const multiplier = 1 + (accuracy * 14); // 1x to 15x based on accuracy
    const win = accuracy >= 0.5; // Need at least 50% to win
    const prize = win ? Math.floor(currentBet * multiplier) : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: win,
      targetsHit: hitTargets.length,
      accuracy: accuracy * 100,
      multiplier: multiplier,
      prize: prize,
      profit: win ? prize - currentBet : -currentBet,
      perfect: hitTargets.length === TOTAL_TARGETS
    };

    setGameResult(resultData);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      totalBet: stats.totalBet + currentBet,
      wins: win ? stats.wins + 1 : stats.wins,
      totalWon: win ? stats.totalWon + prize : stats.totalWon,
      totalLost: !win ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, win ? prize : 0),
      perfectGames: resultData.perfect ? stats.perfectGames + 1 : stats.perfectGames,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setHitTargets([]);
    setTargets([]);
    setTimeLeft(TIME_LIMIT);
    setGameActive(false);
    
    setTimeout(() => {
      startGame();
    }, 100);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-orange-900 via-black to-orange-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-orange-900 via-black to-orange-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">
                🎯 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Target Shooter
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Hit all targets quickly to win!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Timer and Score */}
            {gameActive && !gameResult && (
              <div className="flex justify-between items-center mb-6 max-w-md mx-auto">
                <div className="text-center">
                  <div className="text-sm opacity-70">Time Left</div>
                  <div className={`text-3xl font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-blue-400'}`}>
                    {timeLeft}s
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm opacity-70">Targets Hit</div>
                  <div className="text-3xl font-bold text-green-400">
                    {hitTargets.length}/{TOTAL_TARGETS}
                  </div>
                </div>
              </div>
            )}

            {/* Shooting Range */}
            {gameActive && (
              <div className="relative bg-gradient-to-b from-sky-900/20 to-green-900/20 border-2 border-white/10 rounded-xl h-96 mb-6">
                {targets.map((target) => {
                  const isHit = hitTargets.includes(target.id);
                  return (
                    <button
                      key={target.id}
                      onClick={() => hitTarget(target.id)}
                      disabled={isHit}
                      className={`absolute w-12 h-12 rounded-full font-bold text-xl border-2 transition-all ${
                        isHit
                          ? 'bg-green-600 border-green-400 opacity-30'
                          : 'bg-red-600 border-red-400 hover:scale-125 cursor-crosshair animate-pulse'
                      }`}
                      style={{
                        left: `${target.x}%`,
                        top: `${target.y}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      {isHit ? '✓' : '🎯'}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!gameActive && !gameResult && (
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
                    onClick={() => startGame(false)}
                    disabled={false}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-orange-600 via-red-500 to-orange-600 hover:from-orange-500 hover:via-red-400 hover:to-orange-500 hover:scale-105"
                  >
                    🎯 START SHOOTING ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-orange-500" 
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
                      Max win: {((Number(betAmount) || MIN_BET) * 15).toLocaleString()} MLEO (×15)
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Hit targets within {TIME_LIMIT}s • More hits = bigger prize • Perfect = ×15!
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-orange-500" 
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
              <div className="text-xs opacity-70 mb-1">Total Games</div>
              <div className="text-lg font-bold">{stats.totalGames.toLocaleString()}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">🎯 Perfect</div>
              <div className="text-lg font-bold text-amber-400">{stats.perfectGames}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Objective:</strong> Click on all 10 targets within {TIME_LIMIT} seconds</li>
              <li>• <strong>Scoring:</strong> Prize based on how many targets you hit</li>
              <li>• <strong>Accuracy Multipliers:</strong> 5 hits: ×8, 7 hits: ×11, 10 hits: ×15</li>
              <li>• <strong>Win Condition:</strong> Need at least 5 targets (50%) to win</li>
              <li>• <strong>Perfect Game:</strong> Hit all 10 targets for maximum ×15 multiplier!</li>
              <li>• <strong>Time Limit:</strong> {TIME_LIMIT} seconds - be fast!</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per game</li>
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
                gameResult.perfect
                  ? "bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.perfect ? "🎯 Perfect! 🎯" : gameResult.win ? "🎉 Nice Shooting! 🎉" : "😞 Try Again"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Hit {gameResult.targetsHit}/{TOTAL_TARGETS} Targets ({gameResult.accuracy.toFixed(0)}%)
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    (×{gameResult.multiplier.toFixed(1)})
                  </div>
                </div>
              )}
              {!gameResult.win && (
                <div className="text-lg font-bold text-white">
                  Lost {fmt(currentBet)} MLEO
                </div>
              )}
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

