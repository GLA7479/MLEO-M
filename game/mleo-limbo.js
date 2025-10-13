// ============================================================================
// MLEO Limbo - How High Can You Go?
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
const LS_KEY = "mleo_limbo_v1";
const MIN_BET = 1000;
const HOUSE_EDGE = 0.02; // 2% house edge

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

// Calculate win chance based on target multiplier
function calculateWinChance(targetMultiplier) {
  return ((1 - HOUSE_EDGE) / targetMultiplier) * 100;
}

// Generate random result
function generateResult() {
  // Generate number between 1.00 and 1000.00
  const random = Math.random();
  const result = (1 - HOUSE_EDGE) / random;
  return Math.min(result, 1000); // Cap at 1000x
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function LimboPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [targetMultiplier, setTargetMultiplier] = useState(2);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, highestMultiplier: 0, lastBet: MIN_BET })
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
    playLimbo(true);
  };

  const playLimbo = (isFreePlayParam = false) => {
    if (rolling) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/limbo', undefined, { shallow: true });
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
    setRolling(true);
    setGameResult(null);
    setResult(null);

    // Animate rolling
    let count = 0;
    const rollInterval = setInterval(() => {
      setResult((Math.random() * 100 + 1).toFixed(2));
      count++;
      
      if (count >= 15) {
        clearInterval(rollInterval);
        const finalResult = generateResult();
        setResult(finalResult.toFixed(2));
        setRolling(false);
        checkWin(finalResult);
      }
    }, 50);
  };

  const checkWin = (finalResult) => {
    const won = finalResult >= targetMultiplier;
    const prize = won ? Math.floor(currentBet * targetMultiplier) : 0;

    if (won && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: won,
      result: finalResult,
      target: targetMultiplier,
      prize: prize,
      profit: won ? prize - currentBet : -currentBet
    };

    setGameResult(resultData);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      totalBet: stats.totalBet + currentBet,
      wins: won ? stats.wins + 1 : stats.wins,
      totalWon: won ? stats.totalWon + prize : stats.totalWon,
      totalLost: !won ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, won ? prize : 0),
      highestMultiplier: Math.max(stats.highestMultiplier, won ? finalResult : 0),
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setResult(null);
    setRolling(false);
    
    setTimeout(() => {
      playLimbo();
    }, 100);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-black to-purple-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const winChance = calculateWinChance(targetMultiplier);
  const potentialWin = Math.floor(currentBet * targetMultiplier);

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-black to-purple-900 text-white">
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
                🎰 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                LIMBO
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Go big or go home - unlimited multipliers!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Result Display */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold mb-6">🎲 Result</h2>
              
              <div className={`text-8xl font-black mb-4 transition-all duration-300 ${
                rolling ? 'animate-pulse text-purple-400' :
                result && gameResult ? 
                  gameResult.win ? 'text-green-400' : 'text-red-400'
                : 'text-zinc-600'
              }`}>
                {result ? `${result}×` : '0.00×'}
              </div>

              {gameResult && (
                <div className={`text-2xl font-bold ${gameResult.win ? 'text-green-400' : 'text-red-400'}`}>
                  {gameResult.win ? `✅ WIN! Target: ${targetMultiplier}×` : `❌ LOSE! Target: ${targetMultiplier}×`}
                </div>
              )}
            </div>

            {/* Target Multiplier Selection */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🎯 Target Multiplier</h2>
              
              <div className="max-w-2xl mx-auto mb-4">
                <div className="flex items-center gap-4">
                  <div className="text-6xl font-black text-purple-400">
                    {targetMultiplier.toFixed(2)}×
                  </div>
                  <div className="flex-1">
                    <input
                      type="range"
                      min="1.01"
                      max="100"
                      step="0.01"
                      value={targetMultiplier}
                      onChange={(e) => setTargetMultiplier(parseFloat(e.target.value))}
                      className="w-full h-3 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      disabled={rolling}
                    />
                    <div className="flex justify-between text-xs opacity-60 mt-1">
                      <span>1.01×</span>
                      <span>100×</span>
                    </div>
                  </div>
                </div>

                {/* Quick Select Buttons */}
                <div className="flex gap-2 mt-4 justify-center flex-wrap">
                  {[1.5, 2, 5, 10, 25, 50, 100].map((mult) => (
                    <button
                      key={mult}
                      onClick={() => setTargetMultiplier(mult)}
                      disabled={rolling}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        targetMultiplier === mult
                          ? 'bg-purple-600 border-2 border-purple-400'
                          : 'bg-zinc-800 border border-zinc-600 hover:bg-zinc-700'
                      }`}
                    >
                      {mult}×
                    </button>
                  ))}
                </div>

                {/* Win Chance Display */}
                <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-sm opacity-70 mb-1">Win Chance</div>
                      <div className="text-2xl font-bold text-green-400">
                        {winChance.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm opacity-70 mb-1">Potential Win</div>
                      <div className="text-2xl font-bold text-amber-400">
                        {fmt(potentialWin)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Probability Bar */}
                  <div className="mt-3">
                    <div className="h-2 bg-red-900/30 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300"
                        style={{ width: `${Math.min(winChance, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!rolling && !gameResult && (
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
                    onClick={() => playLimbo(false)}
                    disabled={false}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-600 hover:from-indigo-500 hover:via-purple-400 hover:to-indigo-500 hover:scale-105"
                  >
                    🎲 PLAY LIMBO ({fmt(Number(betAmount) || MIN_BET)})
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
                      Potential: {potentialWin.toLocaleString()} MLEO
                    </div>
                  </div>
                </>
              )}

              {rolling && (
                <div className="text-2xl font-bold text-purple-400 animate-pulse">
                  Rolling...
                </div>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-indigo-600 to-purple-500 hover:from-indigo-500 hover:to-purple-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Set target multiplier • Higher target = lower chance • Unlimited potential!
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
              <div className="text-xs opacity-70 mb-1">🔥 Highest ×</div>
              <div className="text-lg font-bold text-amber-400">×{stats.highestMultiplier.toFixed(2)}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Choose Target:</strong> Set your target multiplier (1.01× to 100×+)</li>
              <li>• <strong>Place Bet:</strong> Decide how much to bet</li>
              <li>• <strong>Roll:</strong> Game generates a random multiplier</li>
              <li>• <strong>Win If:</strong> Result is EQUAL or HIGHER than your target!</li>
              <li>• <strong>Examples:</strong></li>
              <li className="ml-4">- Target 2× = 49% chance (easy win, low payout)</li>
              <li className="ml-4">- Target 10× = 9.8% chance (harder, bigger payout)</li>
              <li className="ml-4">- Target 100× = 0.98% chance (very rare, huge payout!)</li>
              <li>• <strong>Strategy:</strong> Higher target = bigger prize but lower chance</li>
              <li>• <strong>House Edge:</strong> 2% (fair odds)</li>
              <li>• <strong>Unlimited:</strong> No maximum multiplier - go for 1000× if you dare!</li>
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
                {gameResult.win ? "🎉 You Win! 🎉" : "😞 You Lose"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Result: {gameResult.result}× | Target: {gameResult.target}×
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    (×{gameResult.target})
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

