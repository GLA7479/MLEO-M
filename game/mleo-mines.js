// ============================================================================
// MLEO Mines - Minesweeper-style Risk Game
// Cost: 1000 MLEO per game
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_mines_v1";
const MIN_BET = 1000; // Minimum bet amount
const GRID_SIZE = 25; // 5x5 grid
const MINE_COUNTS = [3, 5, 7]; // Easy, Medium, Hard

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
function generateMines(mineCount) {
  const mines = new Set();
  while (mines.size < mineCount) {
    mines.add(Math.floor(Math.random() * GRID_SIZE));
  }
  return Array.from(mines);
}

function calculateMultiplier(revealed, totalSafe, difficulty) {
  // Progressive multiplier based on how many safe tiles revealed and difficulty level
  // Max multipliers: Easy (3 mines) = 4x, Medium (5 mines) = 7x, Hard (7 mines) = 10x
  const progress = revealed / totalSafe;
  const maxMultipliers = [4, 7, 10]; // Easy, Medium, Hard
  return 1 + (progress * (maxMultipliers[difficulty] - 1));
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MinesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [difficulty, setDifficulty] = useState(1); // 0=easy, 1=medium, 2=hard
  const [playing, setPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [mines, setMines] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, totalWon: 0, biggestWin: 0, cashouts: 0, lastBet: MIN_BET })
  );

  const clickSound = useRef(null);
  const mineSound = useRef(null);
  const winSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    
    // Load last bet amount
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) {
      setBetAmount(String(savedStats.lastBet));
    }
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
    }, 2000);
    
    if (typeof Audio !== "undefined") {
      clickSound.current = new Audio("/sounds/click.mp3");
      mineSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
    
    return () => clearInterval(interval);
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  // Auto-hide result popup after 4 seconds
  useEffect(() => {
    if (gameOver) {
      setShowResultPopup(true);
      const timer = setTimeout(() => {
        setShowResultPopup(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [gameOver]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    startGame(true);
  };

  const startGame = (isFreePlayParam = false) => {
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/mines', undefined, { shallow: true });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        alert(`Minimum bet is ${MIN_BET} MLEO!`);
        return;
      }
      
      const currentVault = getVault();
      if (currentVault < bet) {
        alert("Not enough MLEO!");
        return;
      }

      // Deduct cost
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setCurrentBet(bet); // Store bet amount for prize calculations

    // Initialize game
    const minePositions = generateMines(MINE_COUNTS[difficulty]);
    setMines(minePositions);
    setRevealed([]);
    setPlaying(true);
    setGameOver(false);
    setWon(false);
    setCurrentMultiplier(1);
  };

  const revealTile = (index) => {
    if (!playing || gameOver || revealed.includes(index)) return;

    if (clickSound.current) {
      clickSound.current.currentTime = 0;
      clickSound.current.play().catch(() => {});
    }

    const newRevealed = [...revealed, index];
    setRevealed(newRevealed);

    // Check if hit mine
    if (mines.includes(index)) {
      // Hit a mine - game over
      if (mineSound.current) {
        mineSound.current.currentTime = 0;
        mineSound.current.play().catch(() => {});
      }
      
      setGameOver(true);
      setPlaying(false);
      setWon(false);
      
      setStats(s => ({
        ...s,
        totalGames: s.totalGames + 1,
        totalBet: (s.totalBet || 0) + currentBet,
        lastBet: currentBet
      }));
      
      return;
    }

    // Calculate new multiplier
    const totalSafe = GRID_SIZE - MINE_COUNTS[difficulty];
    const mult = calculateMultiplier(newRevealed.length, totalSafe, difficulty);
    setCurrentMultiplier(mult);

    // Check if won (revealed all safe tiles)
    if (newRevealed.length === totalSafe) {
      if (winSound.current) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
      
      const prize = Math.floor(currentBet * mult);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      setGameOver(true);
      setPlaying(false);
      setWon(true);
      
      setStats(s => ({
        totalGames: s.totalGames + 1,
        totalBet: (s.totalBet || 0) + currentBet,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        cashouts: s.cashouts + 1,
        lastBet: currentBet
      }));
    }
  };

  const cashout = () => {
    if (!playing || gameOver || revealed.length === 0) return;

    if (winSound.current) {
      winSound.current.currentTime = 0;
      winSound.current.play().catch(() => {});
    }

    const prize = Math.floor(currentBet * currentMultiplier);
    const newVault = getVault() + prize;
    setVault(newVault);
    setVaultState(newVault);
    
    setGameOver(true);
    setPlaying(false);
    setWon(true);
    
    setStats(s => ({
      totalGames: s.totalGames + 1,
      totalBet: (s.totalBet || 0) + currentBet,
      totalWon: s.totalWon + prize,
      biggestWin: Math.max(s.biggestWin, prize),
      cashouts: s.cashouts + 1,
      lastBet: currentBet
    }));
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Mines</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  const difficultyNames = ["Easy (3 mines)", "Medium (5 mines)", "Hard (7 mines)"];
  const difficultyColors = ["text-green-400", "text-yellow-400", "text-red-400"];
  const maxPrizes = [4000, 7000, 10000]; // Easy, Medium, Hard

  return (
    <Layout isGame={true} title="MLEO Mines 💣">
      <main className="min-h-[100svh] bg-gradient-to-b from-gray-950 via-zinc-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">💣</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-400 via-zinc-400 to-slate-400 bg-clip-text text-transparent">
                  MLEO Mines
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Find safe tiles and cash out!</div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* MINES GAME - Main Window */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-gray-900/30 via-zinc-900/20 to-slate-900/30 border-4 border-gray-600/50 shadow-2xl mb-6">
            
            {!playing && !gameOver ? (
              // Start Screen
              <div className="text-center py-8">
                <div className="text-6xl mb-6">💣</div>
                <h2 className="text-2xl font-bold mb-4">Choose Difficulty</h2>
                
                <div className="flex flex-col gap-3 max-w-sm mx-auto mb-6">
                  {difficultyNames.map((name, idx) => (
                    <button
                      key={idx}
                      onClick={() => setDifficulty(idx)}
                      className={`p-4 rounded-xl font-bold transition-all border-2 ${
                        difficulty === idx
                          ? 'bg-white/20 border-white/40 scale-105'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex flex-col items-center">
                        <span className={difficultyColors[idx]}>{name}</span>
                        <span className="text-xs opacity-70 mt-1">Max Prize: {fmt(maxPrizes[idx])} MLEO</span>
                      </div>
                    </button>
                  ))}
                </div>

                {freePlayTokens > 0 && (
                  <button
                    onClick={startFreePlay}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-3 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                  >
                    🎁 FREE PLAY ({freePlayTokens}/5)
                  </button>
                )}

                <button
                  onClick={() => startGame(false)}
                  disabled={vault < (Number(betAmount) || MIN_BET)}
                  className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 ${
                    vault < (Number(betAmount) || MIN_BET)
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-gray-600 via-zinc-500 to-slate-600 hover:from-gray-500 hover:via-zinc-400 hover:to-slate-500 hover:scale-105"
                  }`}
                >
                  💣 START ({fmt(Number(betAmount) || MIN_BET)})
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
                    className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-gray-500" 
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
              </div>
            ) : (
              <>
                {/* Current Multiplier */}
                <div className="text-center mb-6">
                  <div className="text-sm opacity-70 mb-1">Current Prize</div>
                  <div className="text-4xl font-bold text-green-400">
                    {fmt(Math.floor(currentBet * currentMultiplier))} MLEO
                  </div>
                  <div className="text-lg opacity-70">×{currentMultiplier.toFixed(2)}</div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-5 gap-2 max-w-md mx-auto mb-6">
                  {[...Array(GRID_SIZE)].map((_, idx) => {
                    const isRevealed = revealed.includes(idx);
                    const isMine = mines.includes(idx);
                    const showMine = gameOver && isMine;
                    const showSafe = isRevealed && !isMine;

                    return (
                      <button
                        key={idx}
                        onClick={() => revealTile(idx)}
                        disabled={!playing || gameOver || isRevealed}
                        className={`aspect-square rounded-xl font-bold text-2xl transition-all border-2 ${
                          showMine
                            ? 'bg-red-900/50 border-red-500 animate-pulse'
                            : showSafe
                            ? 'bg-green-900/50 border-green-500'
                            : 'bg-zinc-800 border-zinc-600 hover:bg-zinc-700 hover:scale-105 cursor-pointer'
                        } ${!playing || gameOver ? 'cursor-not-allowed' : ''}`}
                      >
                        {showMine ? '💣' : showSafe ? '💎' : '?'}
                      </button>
                    );
                  })}
                </div>


                {/* Action Buttons */}
                <div className="flex gap-3 justify-center">
                  {playing && !gameOver && revealed.length > 0 && (
                    <button
                      onClick={cashout}
                      className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400"
                    >
                      💰 Cash Out ({fmt(Math.floor(currentBet * currentMultiplier))})
                    </button>
                  )}
                  
                  {gameOver && (
                    <button
                      onClick={() => {
                        setShowResultPopup(false);
                        setTimeout(() => startGame(false), 100);
                      }}
                      disabled={vault < (Number(betAmount) || MIN_BET)}
                      className={`px-8 py-3 rounded-xl font-bold text-lg text-white transition-all ${
                        vault < (Number(betAmount) || MIN_BET)
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-r from-gray-600 to-zinc-500 hover:from-gray-500 hover:to-zinc-400"
                      }`}
                    >
                      🔄 Play Again ({fmt(Number(betAmount) || MIN_BET)})
                    </button>
                  )}
                </div>
              </>
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
              <div className="text-xs opacity-70 mb-1">Games Played</div>
              <div className="text-lg font-bold">{stats.totalGames}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Cashouts</div>
              <div className="text-lg font-bold text-amber-400">{stats.cashouts}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• Click tiles to reveal them - avoid the mines!</li>
              <li>• Each safe tile increases your multiplier</li>
              <li>• Cash out anytime to collect your current prize</li>
              <li>• Hit a mine and lose everything</li>
              <li>• Reveal all safe tiles for maximum prize</li>
            </ul>
          </div>

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-zinc-900/20 to-gray-900/20 border border-zinc-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm opacity-70">Games Played</div>
                <div className="text-2xl font-bold">{stats.totalGames}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Total Won</div>
                <div className="text-2xl font-bold text-green-400">{fmt(stats.totalWon)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Biggest Win</div>
                <div className="text-2xl font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Cashouts</div>
                <div className="text-2xl font-bold text-blue-400">{stats.cashouts}</div>
              </div>
            </div>
          </div>

        </div>

        {/* FLOATING RESULT POPUP - Small compact display */}
        {gameOver && showResultPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div 
              className={`text-center p-4 rounded-xl border-2 transition-all duration-500 transform pointer-events-auto max-w-sm mx-4 ${
                showResultPopup ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
              } ${
                won
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {won ? "💎 Success! 💎" : "💣 Hit a Mine! 💣"}
              </div>
              {won && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(Math.floor(currentBet * currentMultiplier))} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    (×{currentMultiplier.toFixed(2)})
                  </div>
                </div>
              )}
              {!won && (
                <div className="text-lg font-bold text-white">
                  Better luck next time
                </div>
              )}
              <div className="mt-2 text-xs text-white/70 animate-pulse">
                Auto-closing...
              </div>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}

