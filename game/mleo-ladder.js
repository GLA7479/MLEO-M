// ============================================================================
// MLEO Multiplier Ladder - Climb the Ladder & Cash Out
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
const LS_KEY = "mleo_ladder_v1";
const MIN_BET = 1000;
const LADDER_STEPS = 10;
const MULTIPLIERS = [1.2, 1.5, 2, 2.5, 3.5, 5, 7, 10, 15, 20];

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
export default function LadderPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [gameActive, setGameActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [correctSide, setCorrectSide] = useState(null); // 'left' or 'right'
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, highestStep: 0, lastBet: MIN_BET })
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
        router.replace('/ladder', undefined, { shallow: true });
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
    setCurrentStep(0);
    setCorrectSide(Math.random() < 0.5 ? 'left' : 'right');
  };

  const chooseStep = (side) => {
    if (!gameActive || gameResult) return;

    if (side === correctSide) {
      // Correct choice - move up
      const newStep = currentStep + 1;
      
      if (newStep >= LADDER_STEPS) {
        // Reached the top!
        endGame(true, newStep - 1);
      } else {
        setCurrentStep(newStep);
        setCorrectSide(Math.random() < 0.5 ? 'left' : 'right');
      }
    } else {
      // Wrong choice - game over
      endGame(false, currentStep);
    }
  };

  const cashOut = () => {
    if (!gameActive || gameResult || currentStep === 0) return;
    endGame(true, currentStep - 1);
  };

  const endGame = (win, step) => {
    setGameActive(false);

    const multiplier = step >= 0 ? MULTIPLIERS[step] : 0;
    const prize = win ? Math.floor(currentBet * multiplier) : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: win,
      step: step + 1,
      multiplier: multiplier,
      prize: prize,
      profit: win ? prize - currentBet : -currentBet
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
      highestStep: Math.max(stats.highestStep, step + 1),
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setCurrentStep(0);
    setCorrectSide(null);
    setGameActive(false);
    
    setTimeout(() => {
      startGame();
    }, 100);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setCurrentStep(0);
    setCorrectSide(null);
    setGameActive(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const currentMultiplier = currentStep > 0 ? MULTIPLIERS[currentStep - 1] : 1;
  const currentPrize = Math.floor(currentBet * currentMultiplier);

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            {gameActive || gameResult ? (
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
                🪜 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Multiplier Ladder
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Climb the ladder and cash out before you fall!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Current Prize Display - removed from here to prevent layout shift */}

            {/* Ladder Display */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🪜 The Ladder</h2>
              
              <div className="max-w-md mx-auto">
                {[...Array(LADDER_STEPS)].map((_, idx) => {
                  const step = LADDER_STEPS - idx - 1;
                  const isCurrentStep = currentStep === step && gameActive && !gameResult;
                  const isPassed = currentStep > step;
                  
                  return (
                    <div key={step} className="mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-16 text-center text-sm font-bold ${
                          isCurrentStep ? 'text-yellow-400' : isPassed ? 'text-green-400' : 'text-zinc-500'
                        }`}>
                          Step {step + 1}
                        </div>
                        <div className="flex-1 h-12 rounded-lg border-2 flex items-center justify-center font-bold ${
                          isCurrentStep ? 'bg-purple-600/30 border-purple-400 animate-pulse' : 
                          isPassed ? 'bg-green-900/30 border-green-600' :
                          'bg-zinc-800/30 border-zinc-600'
                        }">
                          ×{MULTIPLIERS[step].toFixed(1)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

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
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-purple-600 via-violet-500 to-purple-600 hover:from-purple-500 hover:via-violet-400 hover:to-purple-500 hover:scale-105"
                  >
                    🪜 START CLIMBING ({fmt(Number(betAmount) || MIN_BET)})
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
                      Max win: {((Number(betAmount) || MIN_BET) * 20).toLocaleString()} MLEO
                    </div>
                  </div>
                </>
              )}

              {gameActive && !gameResult && (
                <div className="space-y-4">
                  <div className="text-center text-lg font-bold mb-4">
                    Choose Left or Right to Climb!
                  </div>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => chooseStep('left')}
                      className="px-16 py-6 rounded-xl font-bold text-xl text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all hover:scale-105"
                    >
                      ⬅️ LEFT
                    </button>
                    <button
                      onClick={() => chooseStep('right')}
                      className="px-16 py-6 rounded-xl font-bold text-xl text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 transition-all hover:scale-105"
                    >
                      RIGHT ➡️
                    </button>
                  </div>
                  
                  {currentStep > 0 && (
                    <button
                      onClick={cashOut}
                      className="px-6 py-2 rounded-lg font-bold text-base text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400"
                    >
                      💰 Cash Out
                    </button>
                  )}
                  {/* Current Prize moved below button */}
                  {currentStep > 0 && (
                    <div className="text-center mt-2 text-xs text-purple-400">
                      Current: {fmt(currentPrize)} MLEO (×{currentMultiplier.toFixed(1)})
                    </div>
                  )}
                </div>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 to-violet-500 hover:from-purple-500 hover:to-violet-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Choose the correct path to climb • Cash out anytime • Reach top for ×20!
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
              <div className="text-xs opacity-70 mb-1">Total Games</div>
              <div className="text-lg font-bold">{stats.totalGames.toLocaleString()}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Highest Step</div>
              <div className="text-lg font-bold text-amber-400">{stats.highestStep}/{LADDER_STEPS}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Start:</strong> Place your bet to start climbing the ladder</li>
              <li>• <strong>Choose:</strong> Pick Left or Right at each step - one path goes up, one falls down</li>
              <li>• <strong>Climb:</strong> Each successful step increases your multiplier</li>
              <li>• <strong>Cash Out:</strong> Take your winnings anytime (except on first step)</li>
              <li>• <strong>Win Big:</strong> Reach the top for ×20 multiplier!</li>
              <li>• <strong>Risk:</strong> Wrong choice = lose everything</li>
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
                gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.win ? "🎉 Success! 🎉" : "💥 You Fell! 💥"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Reached Step: {gameResult.step}/{LADDER_STEPS}
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

