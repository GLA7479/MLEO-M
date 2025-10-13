// ============================================================================
// MLEO Bomb Squad - Defuse the Bomb!
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
const LS_KEY = "mleo_bomb_v1";
const MIN_BET = 1000;
const TOTAL_LEVELS = 5;
const WIRES = ['red', 'blue', 'green', 'yellow'];
const WIRE_COLORS = {
  red: { bg: 'from-red-600 to-red-700', border: 'border-red-400', emoji: '🔴' },
  blue: { bg: 'from-blue-600 to-blue-700', border: 'border-blue-400', emoji: '🔵' },
  green: { bg: 'from-green-600 to-green-700', border: 'border-green-400', emoji: '🟢' },
  yellow: { bg: 'from-yellow-600 to-yellow-700', border: 'border-yellow-400', emoji: '🟡' }
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
export default function BombPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [gameActive, setGameActive] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [correctWire, setCorrectWire] = useState(null);
  const [cutWires, setCutWires] = useState([]);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, bombsDefused: 0, lastBet: MIN_BET })
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
        router.replace('/bomb', undefined, { shallow: true });
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
    setCurrentLevel(0);
    setCutWires([]);
    setCorrectWire(WIRES[Math.floor(Math.random() * WIRES.length)]);
  };

  const cutWire = (wire) => {
    if (!gameActive || gameResult) return;

    const newCutWires = [...cutWires, { level: currentLevel, wire }];
    setCutWires(newCutWires);

    if (wire === correctWire) {
      // Correct wire - advance to next level
      const newLevel = currentLevel + 1;
      
      if (newLevel >= TOTAL_LEVELS) {
        // Defused all bombs!
        endGame(true, newLevel);
      } else {
        setCurrentLevel(newLevel);
        setCorrectWire(WIRES[Math.floor(Math.random() * WIRES.length)]);
      }
    } else {
      // Wrong wire - BOOM!
      endGame(false, currentLevel);
    }
  };

  const cashOut = () => {
    if (!gameActive || gameResult || currentLevel === 0) return;
    endGame(true, currentLevel);
  };

  const endGame = (win, level) => {
    setGameActive(false);

    const multiplier = win ? Math.pow(2, level) : 0;
    const prize = win ? Math.floor(currentBet * multiplier) : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: win,
      level: level,
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
      bombsDefused: win ? stats.bombsDefused + 1 : stats.bombsDefused,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setCurrentLevel(0);
    setCorrectWire(null);
    setCutWires([]);
    setGameActive(false);
    
    setTimeout(() => {
      startGame();
    }, 100);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setCurrentLevel(0);
    setCorrectWire(null);
    setCutWires([]);
    setGameActive(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-red-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const currentMultiplier = currentLevel > 0 ? Math.pow(2, currentLevel) : 1;

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-red-900 text-white">
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
                💣 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Bomb Squad
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Cut the right wire to defuse the bomb!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Current Progress */}
            {gameActive && !gameResult && (
              <div className="text-center mb-6">
                <div className="text-6xl mb-3 animate-pulse">💣</div>
                <div className="text-sm opacity-70 mb-2">Level {currentLevel + 1}/{TOTAL_LEVELS}</div>
                <div className="text-lg font-bold text-red-400">
                  Current: {fmt(Math.floor(currentBet * currentMultiplier))} MLEO (×{currentMultiplier})
                </div>
              </div>
            )}

            {/* Game Area */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">
                {gameActive && !gameResult ? "✂️ Choose a Wire to Cut!" : "💣 Bomb Defusal"}
              </h2>
              
              {/* Wires Display */}
              {gameActive && !gameResult && (
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  {WIRES.map((wire) => (
                    <button
                      key={wire}
                      onClick={() => cutWire(wire)}
                      className={`p-6 rounded-xl font-bold text-xl border-2 transition-all hover:scale-105 bg-gradient-to-br ${WIRE_COLORS[wire].bg} ${WIRE_COLORS[wire].border}`}
                    >
                      {WIRE_COLORS[wire].emoji} {wire.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}

              {/* Cut Wires History */}
              {cutWires.length > 0 && gameActive && (
                <div className="mt-6 text-center">
                  <div className="text-sm opacity-70 mb-2">Defused Levels:</div>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {cutWires.map((cut, idx) => (
                      <div key={idx} className="text-xs px-3 py-1 rounded-lg bg-green-900/30 border border-green-600">
                        L{cut.level + 1}: {WIRE_COLORS[cut.wire].emoji}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cash Out Button - During Game */}
              {gameActive && !gameResult && currentLevel > 0 && (
                <div className="mt-6 text-center">
                  <button
                    onClick={cashOut}
                    className="px-6 py-2 rounded-lg font-bold text-base text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 transition-all hover:scale-105"
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
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 hover:from-red-500 hover:via-orange-400 hover:to-red-500 hover:scale-105"
                  >
                    💣 START DEFUSING ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-red-500" 
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
                      Max win: {((Number(betAmount) || MIN_BET) * 32).toLocaleString()} MLEO (×32)
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Cut the correct wire at each level • Wrong wire = BOOM! • Defuse all 5 for ×32!
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-red-500" 
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
              <div className="text-xs opacity-70 mb-1">Bombs Defused</div>
              <div className="text-lg font-bold text-amber-400">{stats.bombsDefused}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Mission:</strong> Defuse 5 bombs by cutting the correct wire</li>
              <li>• <strong>Wires:</strong> Each level has 4 wires - Red, Blue, Green, Yellow</li>
              <li>• <strong>Choice:</strong> Only ONE wire is correct - choose wisely!</li>
              <li>• <strong>Wrong Wire:</strong> Cut the wrong wire and the bomb explodes - lose everything</li>
              <li>• <strong>Correct Wire:</strong> Advances to next level and doubles your prize (×2)</li>
              <li>• <strong>Cash Out:</strong> Take your winnings anytime after level 1!</li>
              <li>• <strong>Win Big:</strong> Defuse all 5 bombs for ×32 multiplier!</li>
              <li>• <strong>Multipliers:</strong> Level 1: ×2, Level 2: ×4, Level 3: ×8, Level 4: ×16, Level 5: ×32</li>
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
                {gameResult.win ? "✅ Bomb Defused! ✅" : "💥 BOOM! 💥"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Defused {gameResult.level}/{TOTAL_LEVELS} Bombs
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

