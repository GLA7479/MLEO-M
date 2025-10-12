// ============================================================================
// MLEO Mines - Minesweeper-style Risk Game
// Cost: 1000 MLEO per game
// ============================================================================

import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import Link from "next/link";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_mines_v1";
const GAME_COST = 1000;
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

function calculateMultiplier(revealed, totalSafe) {
  // Progressive multiplier based on how many safe tiles revealed
  // Each safe tile increases the multiplier
  const progress = revealed / totalSafe;
  return 1 + (progress * 5); // Up to 6x when all safe tiles revealed
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MinesPage() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [difficulty, setDifficulty] = useState(1); // 0=easy, 1=medium, 2=hard
  const [playing, setPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [mines, setMines] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalGames: 0, totalWon: 0, biggestWin: 0, cashouts: 0 })
  );

  const clickSound = useRef(null);
  const mineSound = useRef(null);
  const winSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    if (typeof Audio !== "undefined") {
      clickSound.current = new Audio("/sounds/click.mp3");
      mineSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
  }, []);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startGame = () => {
    const currentVault = getVault();
    if (currentVault < GAME_COST) {
      alert("Not enough MLEO!");
      return;
    }

    // Deduct cost
    setVault(currentVault - GAME_COST);
    setVaultState(currentVault - GAME_COST);

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
        totalGames: s.totalGames + 1
      }));
      
      return;
    }

    // Calculate new multiplier
    const totalSafe = GRID_SIZE - MINE_COUNTS[difficulty];
    const mult = calculateMultiplier(newRevealed.length, totalSafe);
    setCurrentMultiplier(mult);

    // Check if won (revealed all safe tiles)
    if (newRevealed.length === totalSafe) {
      if (winSound.current) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
      
      const prize = Math.floor(GAME_COST * mult);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      setGameOver(true);
      setPlaying(false);
      setWon(true);
      
      setStats(s => ({
        totalGames: s.totalGames + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        cashouts: s.cashouts + 1
      }));
    }
  };

  const cashout = () => {
    if (!playing || gameOver || revealed.length === 0) return;

    if (winSound.current) {
      winSound.current.currentTime = 0;
      winSound.current.play().catch(() => {});
    }

    const prize = Math.floor(GAME_COST * currentMultiplier);
    const newVault = getVault() + prize;
    setVault(newVault);
    setVaultState(newVault);
    
    setGameOver(true);
    setPlaying(false);
    setWon(true);
    
    setStats(s => ({
      totalGames: s.totalGames + 1,
      totalWon: s.totalWon + prize,
      biggestWin: Math.max(s.biggestWin, prize),
      cashouts: s.cashouts + 1
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

  return (
    <Layout isGame={true} title="MLEO Mines 💣">
      <main className="min-h-[100svh] bg-gradient-to-b from-gray-950 via-zinc-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-400 via-zinc-400 to-slate-400 bg-clip-text text-transparent">
                💣 MLEO Mines
              </h1>
              <div className="text-sm opacity-70 mt-1">Find safe tiles and cash out!</div>
            </div>
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                ← BACK
              </button>
            </Link>
          </header>

          {/* VAULT & STATS */}
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
              <div className="text-xs opacity-70 mb-1">Successful Cashouts</div>
              <div className="text-lg font-bold text-amber-400">{stats.cashouts}</div>
            </div>
          </div>

          {/* GAME AREA */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-gray-900/30 via-zinc-900/20 to-slate-900/30 border-4 border-gray-600/50 shadow-2xl mb-6">
            
            {!playing && !gameOver ? (
              // Start Screen
              <div className="text-center py-8">
                <div className="text-6xl mb-6">💣</div>
                <h2 className="text-2xl font-bold mb-4">Choose Difficulty</h2>
                
                <div className="flex flex-col gap-3 max-w-xs mx-auto mb-6">
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
                      <span className={difficultyColors[idx]}>{name}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={startGame}
                  disabled={vault < GAME_COST}
                  className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                    vault < GAME_COST
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-gray-600 via-zinc-500 to-slate-600 hover:from-gray-500 hover:via-zinc-400 hover:to-slate-500 hover:scale-105"
                  }`}
                >
                  💣 START ({fmt(GAME_COST)})
                </button>
              </div>
            ) : (
              <>
                {/* Current Multiplier */}
                <div className="text-center mb-6">
                  <div className="text-sm opacity-70 mb-1">Current Prize</div>
                  <div className="text-4xl font-bold text-green-400">
                    {fmt(Math.floor(GAME_COST * currentMultiplier))} MLEO
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

                {/* Game Over Message */}
                {gameOver && (
                  <div className={`text-center mb-6 p-4 rounded-xl border-2 ${
                    won
                      ? "bg-green-900/30 border-green-500"
                      : "bg-red-900/30 border-red-500"
                  }`}>
                    {won ? (
                      <>
                        <div className="text-2xl font-bold mb-2">💎 Success!</div>
                        <div className="text-3xl font-bold text-green-400">
                          +{fmt(Math.floor(GAME_COST * currentMultiplier))} MLEO
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold mb-2">💣 Hit a Mine!</div>
                        <div className="text-lg text-red-400">Better luck next time</div>
                      </>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 justify-center">
                  {playing && !gameOver && revealed.length > 0 && (
                    <button
                      onClick={cashout}
                      className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400"
                    >
                      💰 Cash Out ({fmt(Math.floor(GAME_COST * currentMultiplier))})
                    </button>
                  )}
                  
                  {gameOver && (
                    <button
                      onClick={startGame}
                      disabled={vault < GAME_COST}
                      className={`px-8 py-3 rounded-xl font-bold text-lg text-white transition-all ${
                        vault < GAME_COST
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-r from-gray-600 to-zinc-500 hover:from-gray-500 hover:to-zinc-400"
                      }`}
                    >
                      🔄 Play Again ({fmt(GAME_COST)})
                    </button>
                  )}
                </div>
              </>
            )}
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
      </main>
    </Layout>
  );
}

