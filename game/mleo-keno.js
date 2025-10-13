// ============================================================================
// MLEO Keno - Classic Lottery Game!
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
const LS_KEY = "mleo_keno_v1";
const MIN_BET = 1000;
const TOTAL_NUMBERS = 40;
const DRAW_COUNT = 20;
const MIN_SELECT = 1;
const MAX_SELECT = 10;

// Payouts based on matches (for 10 selections)
const PAYOUTS = {
  10: { 10: 1000, 9: 200, 8: 50, 7: 15, 6: 5, 5: 2, 0: 2 },      // 10 picks
  9: { 9: 500, 8: 100, 7: 30, 6: 10, 5: 3 },                      // 9 picks
  8: { 8: 250, 7: 50, 6: 15, 5: 4 },                              // 8 picks
  7: { 7: 100, 6: 20, 5: 5, 4: 2 },                               // 7 picks
  6: { 6: 50, 5: 10, 4: 3 },                                      // 6 picks
  5: { 5: 20, 4: 5, 3: 2 },                                       // 5 picks
  4: { 4: 10, 3: 3 },                                             // 4 picks
  3: { 3: 5, 2: 2 },                                              // 3 picks
  2: { 2: 3 },                                                    // 2 picks
  1: { 1: 2 }                                                     // 1 pick
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
// MAIN COMPONENT
// ============================================================================
export default function KenoPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [drawnNumbers, setDrawnNumbers] = useState([]);
  const [gameActive, setGameActive] = useState(false);
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

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const toggleNumber = (num) => {
    if (gameActive || drawnNumbers.length > 0) return;
    
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== num));
    } else {
      if (selectedNumbers.length < MAX_SELECT) {
        setSelectedNumbers([...selectedNumbers, num]);
      }
    }
  };

  const quickPick = () => {
    if (gameActive || drawnNumbers.length > 0) return;
    
    const count = Math.floor(Math.random() * (MAX_SELECT - MIN_SELECT + 1)) + MIN_SELECT;
    const numbers = [];
    while (numbers.length < count) {
      const num = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    setSelectedNumbers(numbers.sort((a, b) => a - b));
  };

  const clearSelection = () => {
    if (gameActive || drawnNumbers.length > 0) return;
    setSelectedNumbers([]);
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    if (selectedNumbers.length === 0) {
      quickPick();
      setTimeout(() => startGame(true), 100);
    } else {
      startGame(true);
    }
  };

  const startGame = (isFreePlayParam = false) => {
    if (gameActive || selectedNumbers.length < MIN_SELECT) {
      if (selectedNumbers.length < MIN_SELECT) {
        alert('Please select at least 1 number');
      }
      return;
    }

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/keno', undefined, { shallow: true });
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
    setDrawnNumbers([]);

    // Draw numbers one by one
    const numbers = [];
    while (numbers.length < DRAW_COUNT) {
      const num = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }

    // Animate drawing
    let currentIndex = 0;
    const drawInterval = setInterval(() => {
      setDrawnNumbers(numbers.slice(0, currentIndex + 1));
      currentIndex++;
      
      if (currentIndex >= DRAW_COUNT) {
        clearInterval(drawInterval);
        setTimeout(() => {
          checkResult(numbers);
        }, 500);
      }
    }, 100);
  };

  const checkResult = (drawn) => {
    const matches = selectedNumbers.filter(num => drawn.includes(num));
    const matchCount = matches.length;
    const pickCount = selectedNumbers.length;

    const payoutTable = PAYOUTS[pickCount] || {};
    const multiplier = payoutTable[matchCount] || 0;
    const prize = multiplier > 0 ? currentBet * multiplier : 0;

    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: multiplier > 0,
      matches: matchCount,
      picked: pickCount,
      multiplier: multiplier,
      prize: prize,
      profit: prize - currentBet,
      perfect: matchCount === pickCount && pickCount === MAX_SELECT
    };

    setGameResult(resultData);
    setGameActive(false);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      totalBet: stats.totalBet + currentBet,
      wins: multiplier > 0 ? stats.wins + 1 : stats.wins,
      totalWon: multiplier > 0 ? stats.totalWon + prize : stats.totalWon,
      totalLost: multiplier === 0 ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, multiplier > 0 ? prize : 0),
      perfectGames: resultData.perfect ? stats.perfectGames + 1 : stats.perfectGames,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setDrawnNumbers([]);
    setSelectedNumbers([]);
    setGameActive(false);
    
    setTimeout(() => {
      quickPick();
      setTimeout(() => startGame(), 200);
    }, 100);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setDrawnNumbers([]);
    setSelectedNumbers([]);
    setGameActive(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-black to-violet-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const isNumberDrawn = (num) => drawnNumbers.includes(num);
  const isNumberMatched = (num) => selectedNumbers.includes(num) && isNumberDrawn(num);

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-black to-violet-900 text-white">
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
                🎱 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Keno
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Classic lottery - pick your lucky numbers!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Selection Info */}
            <div className="text-center mb-6">
              <div className="text-sm opacity-70 mb-2">
                {selectedNumbers.length === 0 ? 'Pick 1-10 Numbers' : `${selectedNumbers.length} Number${selectedNumbers.length > 1 ? 's' : ''} Selected`}
              </div>
              {selectedNumbers.length > 0 && !gameActive && drawnNumbers.length === 0 && (
                <div className="flex gap-2 justify-center">
                  <button 
                    onClick={quickPick}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold"
                  >
                    🎲 Quick Pick
                  </button>
                  <button 
                    onClick={clearSelection}
                    className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm font-bold"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Number Grid */}
            <div className="mb-8">
              <div className="grid grid-cols-8 gap-2 max-w-3xl mx-auto mb-6">
                {[...Array(TOTAL_NUMBERS)].map((_, idx) => {
                  const num = idx + 1;
                  const isSelected = selectedNumbers.includes(num);
                  const isDrawn = isNumberDrawn(num);
                  const isMatch = isNumberMatched(num);

                  return (
                    <button
                      key={num}
                      onClick={() => toggleNumber(num)}
                      disabled={gameActive || drawnNumbers.length > 0}
                      className={`aspect-square rounded-lg font-bold text-sm border-2 transition-all ${
                        isMatch
                          ? 'bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 animate-pulse'
                          : isSelected && isDrawn
                          ? 'bg-gradient-to-br from-red-600 to-rose-700 border-red-300'
                          : isSelected
                          ? 'bg-gradient-to-br from-indigo-600 to-violet-700 border-indigo-400'
                          : isDrawn
                          ? 'bg-gradient-to-br from-yellow-600 to-amber-700 border-yellow-400'
                          : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 cursor-pointer'
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>

              {/* Draw Progress */}
              {drawnNumbers.length > 0 && (
                <div className="text-center mb-4">
                  <div className="text-sm opacity-70 mb-2">
                    Drawing: {drawnNumbers.length}/{DRAW_COUNT}
                  </div>
                  <div className="text-xs opacity-60">
                    Drawn: {drawnNumbers.join(', ')}
                  </div>
                </div>
              )}
            </div>

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!gameActive && !gameResult && drawnNumbers.length === 0 && (
                <>
                  {selectedNumbers.length === 0 && (
                    <button
                      onClick={quickPick}
                      className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-violet-600 via-purple-500 to-violet-600 hover:from-violet-500 hover:via-purple-400 hover:to-violet-500 hover:scale-105"
                    >
                      🎲 Quick Pick Numbers
                    </button>
                  )}

                  {freePlayTokens > 0 && selectedNumbers.length > 0 && (
                    <button
                      onClick={startFreePlay}
                      className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                    >
                      🎁 FREE PLAY ({freePlayTokens}/5)
                    </button>
                  )}
                  
                  {selectedNumbers.length > 0 && (
                    <button
                      onClick={() => startGame(false)}
                      disabled={false}
                      className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-600 hover:from-indigo-500 hover:via-violet-400 hover:to-indigo-500 hover:scale-105"
                    >
                      🎱 PLAY KENO ({fmt(Number(betAmount) || MIN_BET)})
                    </button>
                  )}
                  
                  {/* Bet Amount Input */}
                  <div className="max-w-sm mx-auto">
                    <label className="block text-sm text-zinc-400 mb-2">Bet Amount (MLEO)</label>
                    <input 
                      type="number" 
                      min={MIN_BET} 
                      step="100" 
                      value={betAmount} 
                      onChange={(e) => setBetAmount(e.target.value)} 
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
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
                    {selectedNumbers.length === MAX_SELECT && (
                      <div className="text-xs text-zinc-500 mt-2 text-center">
                        Max win: {((Number(betAmount) || MIN_BET) * 1000).toLocaleString()} MLEO (10/10 match!)
                      </div>
                    )}
                  </div>
                </>
              )}

              {gameActive && (
                <div className="text-2xl font-bold text-indigo-400 animate-pulse">
                  🎱 Drawing numbers...
                </div>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 Play Again ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                {drawnNumbers.length === 0 ? 'Pick numbers • 20 balls drawn • Match to win!' : 'Yellow = Drawn • Green = Matched!'}
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" 
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

          {/* PAYTABLE */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">💰 Paytable (10 picks example)</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <div className="p-2 rounded-lg bg-yellow-900/30 border border-yellow-700">
                <div className="font-bold">10/10</div>
                <div className="text-xs text-yellow-400">×1000!</div>
              </div>
              <div className="p-2 rounded-lg bg-green-900/30 border border-green-700">
                <div className="font-bold">9/10</div>
                <div className="text-xs text-green-400">×200</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-900/30 border border-emerald-700">
                <div className="font-bold">8/10</div>
                <div className="text-xs text-emerald-400">×50</div>
              </div>
              <div className="p-2 rounded-lg bg-cyan-900/30 border border-cyan-700">
                <div className="font-bold">7/10</div>
                <div className="text-xs text-cyan-400">×15</div>
              </div>
              <div className="p-2 rounded-lg bg-blue-900/30 border border-blue-700">
                <div className="font-bold">6/10</div>
                <div className="text-xs text-blue-400">×5</div>
              </div>
              <div className="p-2 rounded-lg bg-indigo-900/30 border border-indigo-700">
                <div className="font-bold">5/10</div>
                <div className="text-xs text-indigo-400">×2</div>
              </div>
              <div className="p-2 rounded-lg bg-purple-900/30 border border-purple-700">
                <div className="font-bold">0/10</div>
                <div className="text-xs text-purple-400">×2</div>
              </div>
            </div>
            <div className="text-xs opacity-60 mt-3 text-center">
              Note: Payouts vary based on how many numbers you pick (1-10)
            </div>
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
              <div className="text-xs opacity-70 mb-1">🎱 Perfect</div>
              <div className="text-lg font-bold text-amber-400">{stats.perfectGames}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Pick Numbers:</strong> Select 1-10 numbers from 1-40</li>
              <li>• <strong>Quick Pick:</strong> Let the computer randomly select for you</li>
              <li>• <strong>Draw:</strong> 20 numbers are drawn randomly</li>
              <li>• <strong>Match & Win:</strong> More matches = bigger payouts!</li>
              <li>• <strong>10 Picks Special:</strong> Match all 10 = ×1000! Match 0 = ×2!</li>
              <li>• <strong>Different Paytables:</strong> Each pick count (1-10) has unique payouts</li>
              <li>• <strong>Pure Luck:</strong> Classic lottery-style game of chance</li>
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
                {gameResult.perfect ? "🎱 PERFECT! 🎱" : gameResult.win ? "🎱 Winner! 🎱" : "🎱 No Win"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Matched {gameResult.matches}/{gameResult.picked}
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    (×{gameResult.multiplier})
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

