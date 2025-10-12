// ============================================================================
// MLEO Scratch Card - Interactive Scratch-to-Win Game
// Cost: 1000 MLEO per card
// ============================================================================

import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import Link from "next/link";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_scratch_card_v1";
const CARD_COST = 1000;

const SYMBOLS = ["💎", "🪙", "⭐", "🎁", "🔥", "👑", "🍀", "💰"];

const WIN_TABLE = {
  "💎": { mult: 10, label: "Diamond", color: "#60A5FA" },
  "👑": { mult: 8, label: "Crown", color: "#FBBF24" },
  "🔥": { mult: 6, label: "Fire", color: "#EF4444" },
  "⭐": { mult: 5, label: "Star", color: "#A78BFA" },
  "💰": { mult: 4, label: "Money Bag", color: "#10B981" },
  "🪙": { mult: 3, label: "Coin", color: "#F59E0B" },
  "🎁": { mult: 2, label: "Gift", color: "#EC4899" },
  "🍀": { mult: 1.5, label: "Clover", color: "#14B8A6" },
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
function generateCard() {
  // Generate 9 cells with some matching symbols
  const cells = [];
  const winChance = Math.random();
  
  if (winChance < 0.40) {
    // 40% chance: 3 matching symbols (WIN)
    const winSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    
    // Randomly place 3 winning symbols
    for (let i = 0; i < 3; i++) {
      const randomIndex = Math.floor(Math.random() * positions.length);
      const position = positions.splice(randomIndex, 1)[0];
      cells[position] = winSymbol;
    }
    
    // Fill remaining with random symbols (no duplicates of win symbol)
    const otherSymbols = SYMBOLS.filter(s => s !== winSymbol);
    for (let i = 0; i < 9; i++) {
      if (!cells[i]) {
        cells[i] = otherSymbols[Math.floor(Math.random() * otherSymbols.length)];
      }
    }
  } else {
    // 60% chance: No match (LOSE)
    for (let i = 0; i < 9; i++) {
      cells[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    }
    // Ensure no 3 matches
    const symbolCounts = {};
    cells.forEach(s => symbolCounts[s] = (symbolCounts[s] || 0) + 1);
    const maxCount = Math.max(...Object.values(symbolCounts));
    if (maxCount >= 3) {
      // Force diversity by replacing duplicates
      const seenTwice = {};
      for (let i = 0; i < cells.length; i++) {
        if (symbolCounts[cells[i]] >= 3) {
          if (seenTwice[cells[i]]) {
            // Replace this one
            const replacement = SYMBOLS.find(s => !cells.includes(s) || symbolCounts[s] < 2);
            cells[i] = replacement || SYMBOLS[0];
          } else {
            seenTwice[cells[i]] = true;
          }
        }
      }
    }
  }
  
  return cells;
}

function checkWin(revealed, cells) {
  if (revealed.length < 3) return null;
  
  // Count symbol occurrences in revealed cells
  const counts = {};
  revealed.forEach(idx => {
    const symbol = cells[idx];
    counts[symbol] = (counts[symbol] || 0) + 1;
  });
  
  // Check for 3 or more matching
  for (const [symbol, count] of Object.entries(counts)) {
    if (count >= 3) {
      return { symbol, count, ...WIN_TABLE[symbol] };
    }
  }
  
  return null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function ScratchCardPage() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [cells, setCells] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalCards: 0, totalWon: 0, biggestWin: 0, wins: 0 })
  );
  const [autoReveal, setAutoReveal] = useState(false);

  const scratchSound = useRef(null);
  const winSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    if (typeof Audio !== "undefined") {
      scratchSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
  }, []);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const buyCard = () => {
    const currentVault = getVault();
    if (currentVault < CARD_COST) {
      setResult({ error: true, message: "Not enough MLEO!" });
      return;
    }

    // Deduct cost
    setVault(currentVault - CARD_COST);
    setVaultState(currentVault - CARD_COST);

    // Generate new card
    const newCells = generateCard();
    setCells(newCells);
    setRevealed([]);
    setResult(null);
    setPlaying(true);
  };

  const revealCell = (index) => {
    if (!playing || revealed.includes(index)) return;
    
    if (scratchSound.current) {
      scratchSound.current.currentTime = 0;
      scratchSound.current.play().catch(() => {});
    }

    const newRevealed = [...revealed, index];
    setRevealed(newRevealed);

    // Check for win after revealing
    const win = checkWin(newRevealed, cells);
    
    if (win) {
      const prize = Math.floor(CARD_COST * win.mult);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      setStats(s => ({
        totalCards: s.totalCards + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        wins: s.wins + 1
      }));

      setResult({ 
        win: true, 
        message: `${win.label} Match!`, 
        prize,
        symbol: win.symbol,
        mult: win.mult,
        color: win.color
      });
      
      setPlaying(false);
      
      if (winSound.current) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
      
      // Auto-reveal all
      setTimeout(() => setRevealed([0,1,2,3,4,5,6,7,8]), 500);
    } else if (newRevealed.length === 9) {
      // All revealed, no win
      setStats(s => ({ ...s, totalCards: s.totalCards + 1 }));
      setResult({ 
        win: false, 
        message: "No match. Try again!" 
      });
      setPlaying(false);
    }
  };

  const revealAll = () => {
    if (!playing) return;
    
    setRevealed([0,1,2,3,4,5,6,7,8]);
    
    const win = checkWin([0,1,2,3,4,5,6,7,8], cells);
    
    if (win) {
      const prize = Math.floor(CARD_COST * win.mult);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      setStats(s => ({
        totalCards: s.totalCards + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        wins: s.wins + 1
      }));

      setResult({ 
        win: true, 
        message: `${win.label} Match!`, 
        prize,
        symbol: win.symbol,
        mult: win.mult,
        color: win.color
      });
      
      if (winSound.current) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
    } else {
      setStats(s => ({ ...s, totalCards: s.totalCards + 1 }));
      setResult({ 
        win: false, 
        message: "No match. Try again!" 
      });
    }
    
    setPlaying(false);
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Scratch Card</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout isGame={true} title="MLEO Scratch Card 🃏">
      <main className="min-h-[100svh] bg-gradient-to-b from-teal-950 via-cyan-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                🃏 Scratch Card
              </h1>
              <div className="text-sm opacity-70 mt-1">Scratch 3 matching symbols to win!</div>
            </div>
            <Link href="/play">
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
              <div className="text-xs opacity-70 mb-1">Cards Played</div>
              <div className="text-lg font-bold">{stats.totalCards}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Wins</div>
              <div className="text-lg font-bold text-amber-400">{stats.wins}</div>
            </div>
          </div>

          {/* SCRATCH CARD */}
          <div className="rounded-3xl p-8 bg-gradient-to-br from-teal-900/30 via-cyan-900/20 to-blue-900/30 border-4 border-cyan-600/50 shadow-2xl mb-6">
            
            {!playing && cells.length === 0 ? (
              // Initial state - Buy card
              <div className="text-center py-12">
                <div className="text-6xl mb-6">🃏</div>
                <h2 className="text-2xl font-bold mb-4">Ready to play?</h2>
                <p className="text-sm opacity-70 mb-6">
                  Scratch 3 matching symbols to win!<br/>
                  Match 3 identical symbols for prizes up to 10,000 MLEO!
                </p>
                <button
                  onClick={buyCard}
                  disabled={vault < CARD_COST}
                  className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                    vault < CARD_COST
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-teal-600 via-cyan-500 to-blue-600 hover:from-teal-500 hover:via-cyan-400 hover:to-blue-500 hover:scale-105"
                  }`}
                >
                  🃏 BUY CARD ({fmt(CARD_COST)})
                </button>
              </div>
            ) : (
              <>
                {/* Grid */}
                <div className="grid grid-cols-3 gap-4 mb-6 max-w-md mx-auto">
                  {cells.map((symbol, idx) => (
                    <button
                      key={idx}
                      onClick={() => revealCell(idx)}
                      disabled={!playing || revealed.includes(idx)}
                      className={`aspect-square rounded-2xl border-4 flex items-center justify-center text-5xl font-bold transition-all ${
                        revealed.includes(idx)
                          ? "bg-gradient-to-br from-white to-zinc-200 border-cyan-500 shadow-lg"
                          : "bg-gradient-to-br from-zinc-700 to-zinc-800 border-zinc-600 hover:border-cyan-400 hover:scale-105 cursor-pointer"
                      }`}
                    >
                      {revealed.includes(idx) ? symbol : "?"}
                    </button>
                  ))}
                </div>

                {/* Controls */}
                {playing && (
                  <div className="text-center mb-4">
                    <button
                      onClick={revealAll}
                      className="px-6 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400"
                    >
                      ⚡ Reveal All
                    </button>
                    <div className="text-xs opacity-60 mt-2">
                      Click cells to scratch or reveal all at once
                    </div>
                  </div>
                )}

                {/* Result */}
                {result && (
                  <div className={`text-center p-6 rounded-xl border-2 ${
                    result.error
                      ? "bg-red-900/30 border-red-500"
                      : result.win
                      ? "bg-green-900/30 border-green-500 animate-pulse"
                      : "bg-zinc-800/50 border-zinc-600"
                  }`}>
                    {result.win ? (
                      <>
                        <div className="text-5xl mb-3">{result.symbol}</div>
                        <div className="text-2xl font-bold mb-2">{result.message}</div>
                        <div className="text-4xl font-bold text-green-400 mb-2">
                          +{fmt(result.prize)} MLEO
                        </div>
                        <div className="text-sm opacity-70">×{result.mult} multiplier</div>
                      </>
                    ) : (
                      <div className="text-xl font-bold">{result.message}</div>
                    )}
                  </div>
                )}

                {/* New Card Button */}
                {!playing && (
                  <div className="text-center mt-6">
                    <button
                      onClick={buyCard}
                      disabled={vault < CARD_COST}
                      className={`px-8 py-3 rounded-xl font-bold text-lg text-white transition-all ${
                        vault < CARD_COST
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-r from-teal-600 to-cyan-500 hover:from-teal-500 hover:to-cyan-400"
                      }`}
                    >
                      🃏 New Card ({fmt(CARD_COST)})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* WIN TABLE */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">🏆 Prize Table</h3>
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 text-center font-semibold text-sm border-b border-white/20 pb-2">
                <div>Symbol</div>
                <div>Name</div>
                <div>Prize</div>
                <div>Mult</div>
              </div>
              
              {Object.entries(WIN_TABLE).map(([symbol, data]) => (
                <div key={symbol} className="grid grid-cols-4 gap-2 text-center text-sm py-2 border-b border-white/10 items-center">
                  <div className="text-3xl">{symbol}</div>
                  <div className="font-semibold">{data.label}</div>
                  <div className="font-bold text-green-400">{fmt(CARD_COST * data.mult)}</div>
                  <div className="text-amber-400">×{data.mult}</div>
                </div>
              ))}
              
              <div className="text-xs opacity-60 text-center mt-4">
                💡 Match 3 identical symbols to win!
              </div>
            </div>
          </div>

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-cyan-900/20 to-teal-900/20 border border-cyan-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm opacity-70">Cards Played</div>
                <div className="text-2xl font-bold">{stats.totalCards}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Total Wins</div>
                <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Total Won</div>
                <div className="text-2xl font-bold text-emerald-400">{fmt(stats.totalWon)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Biggest Win</div>
                <div className="text-2xl font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Win Rate</div>
                <div className="text-2xl font-bold text-blue-400">
                  {stats.totalCards > 0 ? `${((stats.wins / stats.totalCards) * 100).toFixed(1)}%` : "0%"}
                </div>
              </div>
              <div>
                <div className="text-sm opacity-70">Net Profit</div>
                <div className={`text-2xl font-bold ${
                  stats.totalWon - (stats.totalCards * CARD_COST) >= 0 ? "text-green-400" : "text-red-400"
                }`}>
                  {fmt(stats.totalWon - (stats.totalCards * CARD_COST))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}

