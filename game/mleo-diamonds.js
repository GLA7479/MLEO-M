// ============================================================================
// MLEO Diamonds - Find the Gems!
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
const LS_KEY = "mleo_diamonds_v1";
const MIN_BET = 1000;
const GRID_SIZE = 25; // 5x5 grid

// Difficulty levels (number of bombs)
const DIFFICULTY_LEVELS = [
  { name: "Easy", bombs: 3, maxMultiplier: 5 },
  { name: "Medium", bombs: 5, maxMultiplier: 10 },
  { name: "Hard", bombs: 7, maxMultiplier: 20 },
  { name: "Expert", bombs: 10, maxMultiplier: 50 },
  { name: "Master", bombs: 15, maxMultiplier: 150 }
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

// Calculate multiplier
function calculateMultiplier(revealed, totalSafe, bombs) {
  if (revealed === 0) return 1;
  const progress = revealed / totalSafe;
  const diffLevel = DIFFICULTY_LEVELS.find(d => d.bombs === bombs);
  return 1 + (progress * (diffLevel.maxMultiplier - 1));
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function DiamondsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [difficultyIndex, setDifficultyIndex] = useState(1); // Medium by default
  const [gameActive, setGameActive] = useState(false);
  const [bombs, setBombs] = useState([]);
  const [revealed, setRevealed] = useState([]);
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
        router.replace('/diamonds', undefined, { shallow: true });
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
    setRevealed([]);
    
    // Generate bombs
    const bombCount = DIFFICULTY_LEVELS[difficultyIndex].bombs;
    const bombPositions = new Set();
    while (bombPositions.size < bombCount) {
      bombPositions.add(Math.floor(Math.random() * GRID_SIZE));
    }
    setBombs(Array.from(bombPositions));
  };

  const revealTile = (index) => {
    if (!gameActive || gameResult || revealed.includes(index)) return;

    const newRevealed = [...revealed, index];
    setRevealed(newRevealed);

    if (bombs.includes(index)) {
      // Hit a bomb!
      endGame(false, newRevealed.length - 1);
    } else {
      // Safe - check if won
      const bombCount = DIFFICULTY_LEVELS[difficultyIndex].bombs;
      const totalSafe = GRID_SIZE - bombCount;
      
      if (newRevealed.length >= totalSafe) {
        // Found all diamonds!
        endGame(true, newRevealed.length);
      }
    }
  };

  const cashOut = () => {
    if (!gameActive || gameResult || revealed.length === 0) return;
    endGame(true, revealed.length);
  };

  const endGame = (win, revealedCount) => {
    setGameActive(false);

    const bombCount = DIFFICULTY_LEVELS[difficultyIndex].bombs;
    const totalSafe = GRID_SIZE - bombCount;
    const multiplier = win ? calculateMultiplier(revealedCount, totalSafe, bombCount) : 0;
    const prize = win ? Math.floor(currentBet * multiplier) : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: win,
      revealed: revealedCount,
      totalSafe: totalSafe,
      multiplier: multiplier,
      prize: prize,
      profit: win ? prize - currentBet : -currentBet,
      perfect: revealedCount === totalSafe
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
    setRevealed([]);
    setBombs([]);
    setGameActive(false);
    
    setTimeout(() => {
      startGame();
    }, 100);
  };

  const resetToDifficulty = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setRevealed([]);
    setBombs([]);
    setGameActive(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-cyan-900 via-black to-blue-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const bombCount = DIFFICULTY_LEVELS[difficultyIndex].bombs;
  const totalSafe = GRID_SIZE - bombCount;
  const currentMultiplier = revealed.length > 0 ? calculateMultiplier(revealed.length, totalSafe, bombCount) : 1;
  const currentPrize = Math.floor(currentBet * currentMultiplier);

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-cyan-900 via-black to-blue-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            {gameActive || gameResult ? (
              <button 
                onClick={resetToDifficulty}
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
                💎 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Diamonds
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Find diamonds, avoid bombs!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Current Prize - removed from here to prevent layout shift */}

            {/* Difficulty Selection */}
            {!gameActive && !gameResult && (
              <div className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-center">💎 Choose Difficulty</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 max-w-4xl mx-auto">
                  {DIFFICULTY_LEVELS.map((diff, idx) => (
                    <button
                      key={idx}
                      onClick={() => setDifficultyIndex(idx)}
                      className={`p-3 rounded-xl font-bold text-sm border-2 transition-all ${
                        difficultyIndex === idx
                          ? 'bg-cyan-600/30 border-cyan-400 scale-105'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-lg mb-1">{diff.name}</div>
                      <div className="text-xs opacity-70">{diff.bombs} Bombs</div>
                      <div className="text-xs opacity-60">×{diff.maxMultiplier}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Grid */}
            {gameActive && (
              <div className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-center">💎 Diamond Field</h2>
                
                <div className="grid grid-cols-5 gap-1 max-w-xs mx-auto mb-4">
                  {[...Array(GRID_SIZE)].map((_, index) => {
                    const isRevealed = revealed.includes(index);
                    const isBomb = bombs.includes(index);
                    const showBomb = gameResult && isBomb;
                    const showDiamond = isRevealed && !isBomb;

                    return (
                      <button
                        key={index}
                        onClick={() => revealTile(index)}
                        disabled={isRevealed || gameResult}
                        className={`aspect-square rounded-md font-bold text-base border transition-all ${
                          showBomb
                            ? 'bg-gradient-to-br from-red-900 to-black border-red-600 animate-pulse'
                            : showDiamond
                            ? 'bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-300'
                            : isRevealed
                            ? 'bg-zinc-900/50 border-zinc-700'
                            : 'bg-gradient-to-br from-slate-700 to-zinc-800 border-slate-500 hover:scale-105 cursor-pointer'
                        }`}
                      >
                        {showBomb ? '💣' : showDiamond ? '💎' : '?'}
                      </button>
                    );
                  })}
                </div>

                {/* Cash Out */}
                {revealed.length > 0 && !gameResult && (
                  <div className="text-center">
                    <button
                      onClick={cashOut}
                      className="px-6 py-2 rounded-lg font-bold text-base text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 transition-all hover:scale-105 shadow-lg"
                    >
                      💰 Cash Out
                    </button>
                    {/* Current Prize moved below button */}
                    <div className="text-center mt-2 text-xs text-cyan-400">
                      Current: {fmt(currentPrize)} MLEO (×{currentMultiplier.toFixed(2)})
                    </div>
                  </div>
                )}
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
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-cyan-600 via-blue-500 to-cyan-600 hover:from-cyan-500 hover:via-blue-400 hover:to-cyan-500 hover:scale-105"
                  >
                    💎 START MINING ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-cyan-500" 
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
                      Max: ×{DIFFICULTY_LEVELS[difficultyIndex].maxMultiplier}
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Find diamonds • Avoid bombs • Cash out anytime • Higher difficulty = bigger prizes!
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-cyan-500" 
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
              <div className="text-xs opacity-70 mb-1">💎 Perfect</div>
              <div className="text-lg font-bold text-amber-400">{stats.perfectGames}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Choose Difficulty:</strong> More bombs = higher potential multiplier!</li>
              <li>• <strong>Easy:</strong> 3 bombs, 22 diamonds - Max ×5</li>
              <li>• <strong>Medium:</strong> 5 bombs, 20 diamonds - Max ×10</li>
              <li>• <strong>Hard:</strong> 7 bombs, 18 diamonds - Max ×20</li>
              <li>• <strong>Expert:</strong> 10 bombs, 15 diamonds - Max ×50</li>
              <li>• <strong>Master:</strong> 15 bombs, 10 diamonds - Max ×150!</li>
              <li>• <strong>Click Tiles:</strong> Reveal diamonds to increase multiplier</li>
              <li>• <strong>Hit Bomb:</strong> Game over - lose everything</li>
              <li>• <strong>Cash Out:</strong> Take winnings anytime after first diamond</li>
              <li>• <strong>Find All:</strong> Reveal all diamonds for maximum prize!</li>
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
                {gameResult.perfect ? "💎 Perfect! 💎" : gameResult.win ? "💎 Success! 💎" : "💣 Bomb! 💣"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Found {gameResult.revealed}/{gameResult.totalSafe} Diamonds
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

