// ============================================================================
// MLEO Gold Rush Digger - Dig for Treasure!
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
const LS_KEY = "mleo_goldrush_v1";
const MIN_BET = 1000;
const GRID_SIZE = 25; // 5x5 grid

// Prize distribution (25 cells total: 19 treasures + 6 skulls)
const PRIZES = {
  small_gem: { emoji: '💎', multiplier: 1, count: 8, name: 'Small Gem' },
  medium_gem: { emoji: '💍', multiplier: 3, count: 6, name: 'Medium Gem' },
  large_treasure: { emoji: '👑', multiplier: 5, count: 3, name: 'Large Treasure' },
  jackpot: { emoji: '🌟', multiplier: 10, count: 2, name: 'Jackpot' },
  skull: { emoji: '💀', multiplier: -1, count: 6, name: 'Skull' }
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
// GAME LOGIC
// ============================================================================
function generateMap() {
  const map = [];
  
  // Add all prizes
  for (let i = 0; i < PRIZES.small_gem.count; i++) map.push('small_gem');
  for (let i = 0; i < PRIZES.medium_gem.count; i++) map.push('medium_gem');
  for (let i = 0; i < PRIZES.large_treasure.count; i++) map.push('large_treasure');
  for (let i = 0; i < PRIZES.jackpot.count; i++) map.push('jackpot');
  for (let i = 0; i < PRIZES.skull.count; i++) map.push('skull');
  
  // Shuffle
  return map.sort(() => Math.random() - 0.5);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function GoldRushPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [gameActive, setGameActive] = useState(false);
  const [map, setMap] = useState([]);
  const [dugCells, setDugCells] = useState([]);
  const [totalMultiplier, setTotalMultiplier] = useState(0);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, jackpotsFound: 0, skullsHit: 0, lastBet: MIN_BET })
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
        router.replace('/goldrush', undefined, { shallow: true });
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
    setDugCells([]);
    setTotalMultiplier(0);
    setMap(generateMap());
  };

  const digCell = (index) => {
    if (!gameActive || gameResult || dugCells.includes(index)) return;

    const newDug = [...dugCells, index];
    setDugCells(newDug);

    const cellContent = map[index];
    const prize = PRIZES[cellContent];

    if (cellContent === 'skull') {
      // Hit a skull - lose everything!
      endGame(false, 0, true);
    } else {
      // Found treasure
      const newMultiplier = totalMultiplier + prize.multiplier;
      setTotalMultiplier(newMultiplier);

      // Check if dug all non-skull cells
      const totalSafeCells = GRID_SIZE - PRIZES.skull.count;
      if (newDug.length >= totalSafeCells) {
        // Dug everything safely!
        endGame(true, newMultiplier, false);
      }
    }
  };

  const cashOut = () => {
    if (!gameActive || gameResult || totalMultiplier === 0) return;
    endGame(true, totalMultiplier, false);
  };

  const endGame = (win, finalMultiplier, hitSkull) => {
    setGameActive(false);

    const prize = win ? Math.floor(currentBet * finalMultiplier) : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const jackpotsFound = dugCells.filter(i => map[i] === 'jackpot').length;

    const resultData = {
      win: win,
      hitSkull: hitSkull,
      multiplier: finalMultiplier,
      prize: prize,
      profit: win ? prize - currentBet : -currentBet,
      cellsDug: dugCells.length,
      jackpotsFound: jackpotsFound
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
      jackpotsFound: stats.jackpotsFound + jackpotsFound,
      skullsHit: hitSkull ? stats.skullsHit + 1 : stats.skullsHit,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setDugCells([]);
    setTotalMultiplier(0);
    setMap([]);
    setGameActive(false);
    
    setTimeout(() => {
      startGame();
    }, 100);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setDugCells([]);
    setTotalMultiplier(0);
    setMap([]);
    setGameActive(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-yellow-900 via-black to-amber-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const currentPrize = Math.floor(currentBet * totalMultiplier);

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-yellow-900 via-black to-amber-900 text-white">
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
                ⛏️ {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Gold Rush Digger
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Dig for treasure - avoid the skulls!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Current Progress */}
            {gameActive && !gameResult && totalMultiplier > 0 && (
              <div className="text-center mb-6">
                <div className="text-lg font-bold text-amber-400">
                  Current: {fmt(currentPrize)} MLEO (×{totalMultiplier})
                </div>
                <div className="text-sm opacity-70">Dug {dugCells.length}/25</div>
              </div>
            )}

            {/* Map Grid */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">
                {gameActive && !gameResult ? "⛏️ Dig for Gold!" : "🗺️ Treasure Map"}
              </h2>
              
              <div className="grid grid-cols-5 gap-1.5 max-w-md mx-auto mb-6">
                {[...Array(GRID_SIZE)].map((_, index) => {
                  const isDug = dugCells.includes(index);
                  const cellContent = map[index];
                  const showContent = isDug || gameResult;
                  const prize = PRIZES[cellContent];
                  
                  return (
                    <button
                      key={index}
                      onClick={() => digCell(index)}
                      disabled={isDug || gameResult || !gameActive}
                      className={`aspect-square rounded-md font-bold text-base border transition-all ${
                        showContent && cellContent === 'skull'
                          ? 'bg-gradient-to-br from-red-900 to-black border-red-600 animate-pulse'
                          : showContent && cellContent === 'jackpot'
                          ? 'bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300'
                          : showContent && cellContent === 'large_treasure'
                          ? 'bg-gradient-to-br from-orange-600 to-orange-700 border-orange-400'
                          : showContent && cellContent === 'medium_gem'
                          ? 'bg-gradient-to-br from-green-600 to-emerald-700 border-green-400'
                          : showContent && cellContent === 'small_gem'
                          ? 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-400'
                          : isDug
                          ? 'bg-zinc-900/50 border-zinc-700'
                          : 'bg-gradient-to-br from-amber-800 to-yellow-900 border-amber-600 hover:scale-105 cursor-pointer hover:border-amber-400'
                      } ${(!gameActive || isDug) ? 'cursor-not-allowed' : ''}`}
                    >
                      {showContent ? prize.emoji : '❓'}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-3 flex-wrap text-xs">
                <div className="flex items-center gap-1">
                  <span>💎</span>
                  <span className="opacity-70">×1 (8)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>💍</span>
                  <span className="opacity-70">×3 (6)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>👑</span>
                  <span className="opacity-70">×5 (3)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>🌟</span>
                  <span className="opacity-70">×10 (2)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>💀</span>
                  <span className="text-red-400 font-bold">DANGER! (6)</span>
                </div>
              </div>

              {/* Cash Out Button */}
              {gameActive && !gameResult && totalMultiplier > 0 && (
                <div className="mt-6 text-center">
                  <button
                    onClick={cashOut}
                    className="px-6 py-2 rounded-lg font-bold text-base text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 transition-all hover:scale-105 shadow-lg"
                  >
                    💰 Cash Out
                  </button>
                </div>
              )}
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
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600 hover:from-yellow-500 hover:via-amber-400 hover:to-yellow-500 hover:scale-105"
                  >
                    ⛏️ START DIGGING ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-amber-500" 
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
                      Max possible: {((Number(betAmount) || MIN_BET) * 61).toLocaleString()} MLEO (all treasures!)
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Dig cells to find treasure • Cash out anytime • Avoid 3 skulls! 💀
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-amber-500" 
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
              <div className="text-xs opacity-70 mb-1">🌟 Jackpots Found</div>
              <div className="text-lg font-bold text-amber-400">{stats.jackpotsFound}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">💀 Skulls Hit</div>
              <div className="text-lg font-bold text-red-400">{stats.skullsHit}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Treasure Map:</strong> 25 cells (5×5 grid) containing treasures and dangers</li>
              <li>• <strong>💎 Small Gem:</strong> ×1 multiplier (8 in map)</li>
              <li>• <strong>💍 Medium Gem:</strong> ×3 multiplier (6 in map)</li>
              <li>• <strong>👑 Large Treasure:</strong> ×5 multiplier (3 in map)</li>
              <li>• <strong>🌟 Jackpot:</strong> ×10 multiplier (2 in map - rare!)</li>
              <li>• <strong>💀 Skull:</strong> Game over - lose everything! (6 in map - HIGH RISK!)</li>
              <li>• <strong>Strategy:</strong> Dig cells one by one, multipliers add up</li>
              <li>• <strong>Cash Out:</strong> Take your winnings anytime after finding treasure</li>
              <li>• <strong>Max Prize:</strong> Dig all 19 treasures = ×61 total! (8+18+15+20)</li>
              <li>• <strong>Risk:</strong> 24% chance of skull each dig - dangerous!</li>
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
                gameResult.hitSkull
                  ? "bg-gradient-to-br from-black to-zinc-900 border-red-600 shadow-2xl shadow-red-500/70"
                  : gameResult.jackpotsFound > 0
                  ? "bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.hitSkull ? "💀 Skull! 💀" : 
                 gameResult.jackpotsFound > 0 ? "🌟 Jackpot Found! 🌟" : 
                 gameResult.win ? "⛏️ Success! ⛏️" : "😞 No Luck"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Dug {gameResult.cellsDug} Cells | ×{gameResult.multiplier}
              </div>
              {gameResult.win && gameResult.prize > 0 && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  {gameResult.jackpotsFound > 0 && (
                    <div className="text-sm font-bold text-yellow-300">
                      🌟 Found {gameResult.jackpotsFound} Jackpot{gameResult.jackpotsFound > 1 ? 's' : ''}!
                    </div>
                  )}
                </div>
              )}
              {gameResult.hitSkull && (
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

