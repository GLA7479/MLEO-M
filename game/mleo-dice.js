// ============================================================================
// MLEO Dice - Over/Under Classic
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
const LS_KEY = "mleo_dice_v1";
const MIN_BET = 1000;
const HOUSE_EDGE = 0.01; // 1% house edge

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

// Calculate multiplier and win chance
function calculateStats(target, isOver) {
  const winChance = isOver ? (100 - target) : target;
  const multiplier = ((100 - HOUSE_EDGE) / winChance);
  return { winChance, multiplier };
}

// Generate random result (0-100)
function rollDice() {
  return (Math.random() * 100).toFixed(2);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function DicePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [target, setTarget] = useState(50);
  const [isOver, setIsOver] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, highestResult: 0, lowestResult: 100, lastBet: MIN_BET })
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
    playDice(true);
  };

  const playDice = (isFreePlayParam = false) => {
    if (rolling) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/dice', undefined, { shallow: true });
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
      setResult(rollDice());
      count++;
      
      if (count >= 20) {
        clearInterval(rollInterval);
        const finalResult = parseFloat(rollDice());
        setResult(finalResult.toFixed(2));
        setRolling(false);
        checkWin(finalResult);
      }
    }, 40);
  };

  const checkWin = (finalResult) => {
    const won = isOver ? finalResult > target : finalResult < target;
    const { multiplier } = calculateStats(target, isOver);
    const prize = won ? Math.floor(currentBet * multiplier) : 0;

    if (won && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: won,
      result: finalResult,
      target: target,
      isOver: isOver,
      multiplier: multiplier,
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
      highestResult: Math.max(stats.highestResult, finalResult),
      lowestResult: Math.min(stats.lowestResult, finalResult),
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
      playDice();
    }, 100);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setResult(null);
    setRolling(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-black to-teal-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const { winChance, multiplier } = calculateStats(target, isOver);
  const potentialWin = Math.floor(currentBet * multiplier);

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-black to-teal-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            {rolling || result || gameResult ? (
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
                🎲 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                DICE
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Over or Under - the ultimate classic!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Result Display */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold mb-6">🎲 Roll Result</h2>
              
              <div className={`text-9xl font-black mb-4 transition-all duration-200 ${
                rolling ? 'animate-spin text-teal-400' :
                result && gameResult ? 
                  gameResult.win ? 'text-green-400' : 'text-red-400'
                : 'text-zinc-600'
              }`}>
                {result || '0.00'}
              </div>

              {gameResult && (
                <div className={`text-2xl font-bold ${gameResult.win ? 'text-green-400' : 'text-red-400'}`}>
                  {gameResult.win ? 
                    `✅ WIN! ${gameResult.isOver ? 'OVER' : 'UNDER'} ${gameResult.target}` : 
                    `❌ LOSE! ${gameResult.isOver ? 'OVER' : 'UNDER'} ${gameResult.target}`
                  }
                </div>
              )}
            </div>

            {/* Target Selection */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🎯 Set Your Target</h2>
              
              {/* Over/Under Toggle */}
              <div className="flex gap-3 justify-center mb-6">
                <button
                  onClick={() => setIsOver(true)}
                  disabled={rolling}
                  className={`px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                    isOver
                      ? 'bg-gradient-to-r from-green-600 to-emerald-500 text-white scale-105'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  🔼 OVER {target}
                </button>
                <button
                  onClick={() => setIsOver(false)}
                  disabled={rolling}
                  className={`px-8 py-3 rounded-xl font-bold text-lg transition-all ${
                    !isOver
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white scale-105'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  🔽 UNDER {target}
                </button>
              </div>

              {/* Slider */}
              <div className="max-w-2xl mx-auto">
                <div className="relative mb-6">
                  {/* Visual Range Display */}
                  <div className="h-16 rounded-xl overflow-hidden border-2 border-white/20 mb-3 relative">
                    <div 
                      className={`absolute top-0 left-0 h-full transition-all duration-200 ${
                        isOver ? 'bg-gradient-to-r from-green-600/40 to-emerald-500/40' : 'bg-gradient-to-r from-blue-600/40 to-cyan-500/40'
                      }`}
                      style={{ 
                        left: isOver ? `${target}%` : '0%',
                        width: isOver ? `${100 - target}%` : `${target}%`
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-4xl font-black text-white drop-shadow-lg">
                        {target.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0.01"
                    max="99.99"
                    step="0.01"
                    value={target}
                    onChange={(e) => setTarget(parseFloat(e.target.value))}
                    className="w-full h-4 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    disabled={rolling}
                    style={{
                      background: `linear-gradient(to right, 
                        ${isOver ? '#10b981' : '#06b6d4'} 0%, 
                        ${isOver ? '#10b981' : '#06b6d4'} ${target}%, 
                        #3f3f46 ${target}%, 
                        #3f3f46 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs opacity-60 mt-1">
                    <span>0.01</span>
                    <span>50.00</span>
                    <span>99.99</span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <button
                    onClick={() => { setTarget(50); setIsOver(true); }}
                    disabled={rolling}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-bold"
                  >
                    🔼 50 (×2)
                  </button>
                  <button
                    onClick={() => { setTarget(66); setIsOver(true); }}
                    disabled={rolling}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-bold"
                  >
                    🔼 66 (×3)
                  </button>
                  <button
                    onClick={() => { setTarget(90); setIsOver(true); }}
                    disabled={rolling}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-bold"
                  >
                    🔼 90 (×10)
                  </button>
                  <button
                    onClick={() => { setTarget(98); setIsOver(true); }}
                    disabled={rolling}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-bold"
                  >
                    🔼 98 (×50)
                  </button>
                </div>

                {/* Stats Display */}
                <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-center">
                    <div className="text-xs opacity-70 mb-1">Win Chance</div>
                    <div className="text-xl font-bold text-green-400">
                      {winChance.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs opacity-70 mb-1">Multiplier</div>
                    <div className="text-xl font-bold text-purple-400">
                      {multiplier.toFixed(2)}×
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs opacity-70 mb-1">Potential</div>
                    <div className="text-xl font-bold text-amber-400">
                      {fmt(potentialWin)}
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
                    onClick={() => playDice(false)}
                    disabled={false}
                    className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                      isOver
                        ? 'bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500'
                        : 'bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 hover:from-blue-500 hover:via-cyan-400 hover:to-blue-500'
                    } hover:scale-105`}
                  >
                    🎲 ROLL DICE ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-teal-500" 
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
                <div className="text-2xl font-bold text-teal-400 animate-pulse">
                  🎲 Rolling...
                </div>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Roll 0-100 • Choose Over or Under • Adjust target for risk vs reward!
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-teal-500" 
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
              <div className="text-xs opacity-70 mb-1">🎯 Win Rate</div>
              <div className="text-lg font-bold text-amber-400">
                {stats.totalGames > 0 ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Choose Mode:</strong> OVER (result above target) or UNDER (result below target)</li>
              <li>• <strong>Set Target:</strong> Slide to any number between 0.01 and 99.99</li>
              <li>• <strong>Roll:</strong> Game generates random number from 0 to 100</li>
              <li>• <strong>Win If:</strong> 
                <ul className="ml-4 mt-1">
                  <li>- OVER: Result &gt; Target</li>
                  <li>- UNDER: Result &lt; Target</li>
                </ul>
              </li>
              <li>• <strong>Examples:</strong></li>
              <li className="ml-4">- OVER 50 = 49.5% chance = ×2 payout (safe)</li>
              <li className="ml-4">- OVER 90 = 9.9% chance = ×10 payout (risky)</li>
              <li className="ml-4">- UNDER 10 = 9.9% chance = ×10 payout (risky)</li>
              <li className="ml-4">- OVER 98 = 1.98% chance = ×50 payout (very risky!)</li>
              <li>• <strong>House Edge:</strong> Only 1% (fair odds!)</li>
              <li>• <strong>Strategy:</strong> Lower target for OVER / Higher target for UNDER = bigger multipliers!</li>
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
                Rolled: {gameResult.result} | {gameResult.isOver ? 'OVER' : 'UNDER'} {gameResult.target}
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    (×{gameResult.multiplier.toFixed(2)})
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

