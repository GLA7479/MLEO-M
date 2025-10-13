// ============================================================================
// MLEO Dragon Tower - Climb the Dragon's Lair!
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
const LS_KEY = "mleo_dragon_tower_v1";
const MIN_BET = 1000;
const TOTAL_FLOORS = 10;
const CARDS_PER_FLOOR = 4;

// Difficulty modes
const DIFFICULTY = {
  easy: { name: "Easy", dangerCards: 1, maxMultiplier: 20 },
  medium: { name: "Medium", dangerCards: 2, maxMultiplier: 50 },
  hard: { name: "Hard", dangerCards: 3, maxMultiplier: 150 }
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

// Calculate multiplier based on floor and difficulty
function calculateMultiplier(floor, difficulty) {
  const diff = DIFFICULTY[difficulty];
  const safeCards = CARDS_PER_FLOOR - diff.dangerCards;
  const baseChance = safeCards / CARDS_PER_FLOOR;
  const chanceToReachFloor = Math.pow(baseChance, floor);
  return Math.min((0.98 / chanceToReachFloor), diff.maxMultiplier);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function DragonTowerPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [difficulty, setDifficulty] = useState("medium");
  const [gameActive, setGameActive] = useState(false);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [floorData, setFloorData] = useState([]); // Which cards are safe/danger
  const [selectedCard, setSelectedCard] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, topFloor: 0, lastBet: MIN_BET })
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
        router.replace('/dragon-tower', undefined, { shallow: true });
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
    setCurrentFloor(0);
    setFloorData([]);
    setSelectedCard(null);
    generateNewFloor(0);
  };

  const generateNewFloor = (floor) => {
    const dangerCount = DIFFICULTY[difficulty].dangerCards;
    const dangerPositions = [];
    
    // Randomly place danger cards
    while (dangerPositions.length < dangerCount) {
      const pos = Math.floor(Math.random() * CARDS_PER_FLOOR);
      if (!dangerPositions.includes(pos)) {
        dangerPositions.push(pos);
      }
    }
    
    const newFloorData = [...floorData];
    newFloorData[floor] = dangerPositions;
    setFloorData(newFloorData);
    setSelectedCard(null);
  };

  const chooseCard = (cardIndex) => {
    if (!gameActive || gameResult || selectedCard !== null) return;

    setSelectedCard(cardIndex);

    setTimeout(() => {
      const dangerCards = floorData[currentFloor] || [];
      const isDanger = dangerCards.includes(cardIndex);

      if (isDanger) {
        // Hit danger - fall from tower
        endGame(false, currentFloor);
      } else {
        // Safe card - climb up
        const newFloor = currentFloor + 1;
        
        if (newFloor >= TOTAL_FLOORS) {
          // Reached the top!
          endGame(true, newFloor);
        } else {
          setTimeout(() => {
            setCurrentFloor(newFloor);
            generateNewFloor(newFloor);
          }, 800);
        }
      }
    }, 600);
  };

  const cashOut = () => {
    if (!gameActive || gameResult || currentFloor === 0) return;
    endGame(true, currentFloor);
  };

  const endGame = (win, floor) => {
    setGameActive(false);

    const multiplier = win ? calculateMultiplier(floor, difficulty) : 0;
    const prize = win ? Math.floor(currentBet * multiplier) : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: win,
      floor: floor,
      multiplier: multiplier,
      prize: prize,
      profit: win ? prize - currentBet : -currentBet,
      reachedTop: floor >= TOTAL_FLOORS
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
      topFloor: Math.max(stats.topFloor, floor),
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setCurrentFloor(0);
    setFloorData([]);
    setSelectedCard(null);
    setGameActive(false);
    
    setTimeout(() => {
      startGame();
    }, 100);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-orange-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const currentMultiplier = currentFloor > 0 ? calculateMultiplier(currentFloor, difficulty) : 1;
  const currentPrize = Math.floor(currentBet * currentMultiplier);
  const dangerCards = floorData[currentFloor] || [];

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-orange-900 text-white">
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
                🐉 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Dragon Tower
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Climb the dragon's tower - choose wisely!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Current Prize */}
            {gameActive && !gameResult && currentFloor > 0 && (
              <div className="text-center mb-6">
                <div className="text-sm opacity-70 mb-2">Current Prize</div>
                <div className="text-4xl font-bold text-orange-400">
                  {fmt(currentPrize)} MLEO
                </div>
                <div className="text-lg opacity-70">Floor {currentFloor}/{TOTAL_FLOORS} | ×{currentMultiplier.toFixed(2)}</div>
              </div>
            )}

            {/* Tower Display */}
            {!gameActive && !gameResult && (
              <div className="mb-8 text-center">
                <div className="text-8xl mb-4">🐉</div>
                <h2 className="text-2xl font-bold mb-6">Choose Your Difficulty</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-6">
                  {Object.entries(DIFFICULTY).map(([key, diff]) => (
                    <button
                      key={key}
                      onClick={() => setDifficulty(key)}
                      className={`p-6 rounded-xl font-bold text-lg border-2 transition-all ${
                        difficulty === key
                          ? 'bg-orange-600/30 border-orange-400 scale-105'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-2xl mb-2">
                        {key === 'easy' ? '🟢' : key === 'medium' ? '🟡' : '🔴'}
                      </div>
                      <div>{diff.name}</div>
                      <div className="text-sm opacity-70 mt-2">
                        {diff.dangerCards}/{CARDS_PER_FLOOR} Danger Cards
                      </div>
                      <div className="text-xs opacity-60 mt-1">
                        Max: ×{diff.maxMultiplier}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Cards Selection */}
            {gameActive && !gameResult && (
              <div className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-center">
                  🏰 Floor {currentFloor + 1}/{TOTAL_FLOORS}
                </h2>
                
                <div className="grid grid-cols-4 gap-3 max-w-2xl mx-auto mb-6">
                  {[...Array(CARDS_PER_FLOOR)].map((_, index) => {
                    const isSelected = selectedCard === index;
                    const showResult = selectedCard !== null;
                    const isDanger = dangerCards.includes(index);
                    const isSafe = showResult && !isDanger && isSelected;
                    const showDanger = showResult && isDanger;
                    
                    return (
                      <button
                        key={index}
                        onClick={() => chooseCard(index)}
                        disabled={selectedCard !== null}
                        className={`aspect-square rounded-xl font-bold text-4xl border-2 transition-all ${
                          showDanger && isSelected
                            ? 'bg-gradient-to-br from-red-600 to-black border-red-400 animate-pulse'
                            : isSafe
                            ? 'bg-gradient-to-br from-green-600 to-emerald-700 border-green-400'
                            : isSelected
                            ? 'bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-400'
                            : 'bg-gradient-to-br from-orange-700 to-red-800 border-orange-500 hover:scale-105 cursor-pointer'
                        }`}
                      >
                        {showDanger && isSelected ? '🐉' : isSafe ? '✅' : '🃏'}
                      </button>
                    );
                  })}
                </div>

                {/* Floor Progress */}
                {currentFloor > 0 && (
                  <div className="text-center mb-4">
                    <div className="text-sm opacity-70 mb-2">Floors Climbed:</div>
                    <div className="flex justify-center gap-1">
                      {[...Array(TOTAL_FLOORS)].map((_, idx) => (
                        <div key={idx} className={`w-8 h-8 rounded-lg border ${
                          idx < currentFloor ? 'bg-green-600 border-green-400' : 
                          idx === currentFloor ? 'bg-orange-600 border-orange-400 animate-pulse' :
                          'bg-zinc-800 border-zinc-600'
                        }`} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Cash Out Button */}
                {currentFloor > 0 && selectedCard === null && (
                  <div className="text-center mt-6">
                    <button
                      onClick={cashOut}
                      className="px-12 py-3 rounded-xl font-bold text-xl text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 transition-all hover:scale-105 shadow-lg"
                    >
                      💰 Cash Out ({fmt(currentPrize)} MLEO)
                    </button>
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
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-orange-600 via-red-500 to-orange-600 hover:from-orange-500 hover:via-red-400 hover:to-orange-500 hover:scale-105"
                  >
                    🐉 START CLIMBING ({fmt(Number(betAmount) || MIN_BET)})
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
                      Max win ({difficulty}): {((Number(betAmount) || MIN_BET) * DIFFICULTY[difficulty].maxMultiplier).toLocaleString()} MLEO
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
                Choose safe cards • Avoid the dragon • Cash out anytime!
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
              <div className="text-xs opacity-70 mb-1">🏰 Top Floor</div>
              <div className="text-lg font-bold text-amber-400">{stats.topFloor}/{TOTAL_FLOORS}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Dragon Tower:</strong> Climb 10 floors to reach the top</li>
              <li>• <strong>Each Floor:</strong> 4 cards - some safe, some have dragons!</li>
              <li>• <strong>🟢 Easy Mode:</strong> 1 danger card per floor (75% safe) - Max ×20</li>
              <li>• <strong>🟡 Medium Mode:</strong> 2 danger cards per floor (50% safe) - Max ×50</li>
              <li>• <strong>🔴 Hard Mode:</strong> 3 danger cards per floor (25% safe) - Max ×150</li>
              <li>• <strong>Choose Wisely:</strong> Pick a safe card to climb to next floor</li>
              <li>• <strong>Dragon Card:</strong> Pick a danger card and fall from the tower!</li>
              <li>• <strong>Cash Out:</strong> Take your winnings anytime after floor 1</li>
              <li>• <strong>Multiplier Grows:</strong> Higher you climb = bigger multiplier!</li>
              <li>• <strong>Reach Top:</strong> Climb all 10 floors for maximum prize!</li>
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
                gameResult.reachedTop
                  ? "bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.reachedTop ? "🏆 Reached Top! 🏆" : gameResult.win ? "🐉 Success! 🐉" : "🐉 Dragon! 🐉"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Floor {gameResult.floor}/{TOTAL_FLOORS} | ×{gameResult.multiplier.toFixed(2)}
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
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

