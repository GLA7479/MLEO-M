// ============================================================================
// MLEO Scratch Card - Interactive Scratch-to-Win Game
// Cost: 1000 MLEO per card
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_scratch_card_v1";
const MIN_BET = 1000; // Minimum bet amount

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
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [playing, setPlaying] = useState(false);
  const [cells, setCells] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [result, setResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalCards: 0, totalBet: 0, totalWon: 0, biggestWin: 0, wins: 0, lastBet: MIN_BET })
  );
  const [autoReveal, setAutoReveal] = useState(false);

  const scratchSound = useRef(null);
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
      scratchSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
    
    return () => clearInterval(interval);
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    buyCard(true);
  };

  const buyCard = (isFreePlayParam = false) => {
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/scratch', undefined, { shallow: true });
      } else {
        setResult({ error: true, message: 'No free play tokens available!' });
        setIsFreePlay(false);
        return;
      }
    } else {
      const currentVault = getVault();
      if (bet < MIN_BET) {
        setResult({ error: true, message: `Minimum bet is ${MIN_BET} MLEO!` });
        return;
      }
      
      if (currentVault < bet) {
        setResult({ error: true, message: "Not enough MLEO!" });
        return;
      }

      // Deduct cost
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setCurrentBet(bet); // Store bet amount for prize calculations

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
      const prize = Math.floor(currentBet * win.mult);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      setStats(s => ({
        totalCards: s.totalCards + 1,
        totalBet: (s.totalBet || 0) + currentBet,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        wins: s.wins + 1,
        lastBet: currentBet
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
      setStats(s => ({ ...s, totalCards: s.totalCards + 1, totalBet: (s.totalBet || 0) + currentBet, lastBet: currentBet }));
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
      const prize = Math.floor(currentBet * win.mult);
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      setStats(s => ({
        totalCards: s.totalCards + 1,
        totalBet: (s.totalBet || 0) + currentBet,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        wins: s.wins + 1,
        lastBet: currentBet
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
      setStats(s => ({ ...s, totalCards: s.totalCards + 1, totalBet: (s.totalBet || 0) + currentBet, lastBet: currentBet }));
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
          
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🃏</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Scratch Card
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Scratch 3 matching symbols to win!</div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* SCRATCH CARD - Main Window */}
          <div className="rounded-3xl p-8 bg-gradient-to-br from-teal-900/30 via-cyan-900/20 to-blue-900/30 border-4 border-cyan-600/50 shadow-2xl mb-6">
            {!playing && cells.length === 0 ? (
              // Initial state - Buy card
              <div className="text-center py-12">
                <div className="text-6xl mb-6">🃏</div>
                <h2 className="text-2xl font-bold mb-4">Ready to play?</h2>
                <p className="text-sm opacity-70 mb-6">
                  Scratch 3 matching symbols to win!<br/>
                  Match 3 identical symbols for prizes up to ×10 multiplier!
                </p>

                {freePlayTokens > 0 && (
                  <button
                    onClick={startFreePlay}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                  >
                    🎁 FREE PLAY ({freePlayTokens}/5)
                  </button>
                )}

                <button
                  onClick={() => buyCard(false)}
                  disabled={vault < (Number(betAmount) || MIN_BET)}
                  className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                    vault < (Number(betAmount) || MIN_BET)
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-teal-600 via-cyan-500 to-blue-600 hover:from-teal-500 hover:via-cyan-400 hover:to-blue-500 hover:scale-105"
                  }`}
                >
                  🃏 BUY CARD ({fmt(Number(betAmount) || MIN_BET)})
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
                    Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
                  </div>
                </div>
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
                      onClick={() => buyCard(false)}
                      disabled={vault < (Number(betAmount) || MIN_BET)}
                      className={`px-8 py-3 rounded-xl font-bold text-lg text-white transition-all mb-6 ${
                        vault < (Number(betAmount) || MIN_BET)
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-r from-teal-600 to-cyan-500 hover:from-teal-500 hover:to-cyan-400"
                      }`}
                    >
                      🃏 New Card ({fmt(Number(betAmount) || MIN_BET)})
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
                        Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
                      </div>
                    </div>
                  </div>
                )}
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
                  <div className="font-bold text-green-400">{fmt((Number(betAmount) || MIN_BET) * data.mult)}</div>
                  <div className="text-amber-400">×{data.mult}</div>
                </div>
              ))}
              
              <div className="text-xs opacity-60 text-center mt-4">
                💡 Match 3 identical symbols to win!
              </div>
            </div>
          </div>


        </div>
      </main>
    </Layout>
  );
}

