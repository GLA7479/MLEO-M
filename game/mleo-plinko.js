// ============================================================================
// MLEO Plinko - Classic Ball Drop Game
// Cost: 1000 MLEO per drop
// ============================================================================

import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import Link from "next/link";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_plinko_v1";
const DROP_COST = 1000;

const MULTIPLIERS = [10, 5, 3, 1.5, 0.5, 0.3, 0, 0.3, 0.5, 1.5, 3, 5, 10];
const MULTIPLIER_COLORS = [
  "#FFD700", "#FFA500", "#32CD32", "#00CED1", "#808080", "#696969", "#DC2626",
  "#696969", "#808080", "#00CED1", "#32CD32", "#FFA500", "#FFD700"
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

// ============================================================================
// PLINKO SIMULATION
// ============================================================================
function simulatePlinko() {
  // Simulate ball dropping through pegs
  // Start at middle, each row goes left or right randomly
  const rows = 12;
  let position = 6; // Start in middle (0-12 range)
  
  for (let i = 0; i < rows; i++) {
    // Random bounce left or right
    if (Math.random() < 0.5) {
      position = Math.max(0, position - 1);
    } else {
      position = Math.min(12, position + 1);
    }
  }
  
  return position;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PlinkoPage() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [ballPosition, setBallPosition] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalDrops: 0, totalWon: 0, biggestWin: 0, history: [] })
  );

  const dropSound = useRef(null);
  const winSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    if (typeof Audio !== "undefined") {
      dropSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
  }, []);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const dropBall = async () => {
    if (dropping) return;

    const currentVault = getVault();
    if (currentVault < DROP_COST) {
      setResult({ error: true, message: "Not enough MLEO!" });
      return;
    }

    // Deduct cost
    setVault(currentVault - DROP_COST);
    setVaultState(currentVault - DROP_COST);

    setDropping(true);
    setResult(null);
    
    if (dropSound.current) {
      dropSound.current.currentTime = 0;
      dropSound.current.play().catch(() => {});
    }

    // Simulate ball drop
    const finalPosition = simulatePlinko();
    
    // Animate ball falling
    for (let i = 0; i <= 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      setBallPosition(i);
    }

    setBallPosition(finalPosition);
    
    // Calculate prize
    const multiplier = MULTIPLIERS[finalPosition];
    const prize = Math.floor(DROP_COST * multiplier);
    
    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      const newHistory = [
        { mult: multiplier, prize, timestamp: Date.now() },
        ...stats.history.slice(0, 9)
      ];
      
      setStats(s => ({
        totalDrops: s.totalDrops + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        history: newHistory
      }));

      setResult({ 
        win: true, 
        message: `×${multiplier}`, 
        prize,
        multiplier
      });
      
      if (winSound.current && multiplier >= 1.5) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
    } else {
      setStats(s => ({
        ...s,
        totalDrops: s.totalDrops + 1,
        history: [
          { mult: 0, prize: 0, timestamp: Date.now() },
          ...s.history.slice(0, 9)
        ]
      }));
      setResult({ 
        win: false, 
        message: "No win"
      });
    }

    setDropping(false);
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Plinko</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout isGame={true} title="MLEO Plinko 🎯">
      <main className="min-h-[100svh] bg-gradient-to-b from-blue-950 via-indigo-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                🎯 MLEO Plinko
              </h1>
              <div className="text-sm opacity-70 mt-1">Drop the ball and win!</div>
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
              <div className="text-xs opacity-70 mb-1">Total Drops</div>
              <div className="text-lg font-bold">{stats.totalDrops}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Biggest Win</div>
              <div className="text-lg font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
            </div>
          </div>

          {/* PLINKO BOARD */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-blue-900/30 via-indigo-900/20 to-cyan-900/30 border-4 border-blue-600/50 shadow-2xl mb-6">
            
            {/* Board */}
            <div className="relative bg-gradient-to-b from-indigo-900/50 to-black/50 rounded-2xl p-4 mb-6 min-h-[400px]">
              {/* Pegs (visual only) */}
              <div className="grid gap-4 mb-8">
                {[...Array(12)].map((_, row) => (
                  <div key={row} className="flex justify-center gap-8" style={{ marginLeft: `${(row % 2) * 20}px` }}>
                    {[...Array(13 - row)].map((_, col) => (
                      <div key={col} className="w-2 h-2 rounded-full bg-white/30" />
                    ))}
                  </div>
                ))}
              </div>

              {/* Ball animation placeholder */}
              {ballPosition !== null && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 animate-bounce" />
                </div>
              )}
            </div>

            {/* Multipliers */}
            <div className="grid grid-cols-13 gap-1 mb-6">
              {MULTIPLIERS.map((mult, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg text-center font-bold text-xs border-2 ${
                    ballPosition === idx ? 'animate-pulse scale-110' : ''
                  }`}
                  style={{
                    backgroundColor: `${MULTIPLIER_COLORS[idx]}20`,
                    borderColor: MULTIPLIER_COLORS[idx],
                    color: MULTIPLIER_COLORS[idx]
                  }}
                >
                  {mult > 0 ? `×${mult}` : '×0'}
                </div>
              ))}
            </div>

            {/* Result */}
            {result && (
              <div className={`text-center mb-6 p-4 rounded-xl border-2 ${
                result.error
                  ? "bg-red-900/30 border-red-500"
                  : result.win
                  ? "bg-green-900/30 border-green-500 animate-pulse"
                  : "bg-zinc-800/50 border-zinc-600"
              }`}>
                {result.win ? (
                  <>
                    <div className="text-3xl font-bold mb-2">{result.message}</div>
                    <div className="text-3xl font-bold text-green-400">
                      +{fmt(result.prize)} MLEO
                    </div>
                  </>
                ) : (
                  <div className="text-xl font-bold">{result.message}</div>
                )}
              </div>
            )}

            {/* Drop Button */}
            <div className="text-center">
              <button
                onClick={dropBall}
                disabled={dropping || vault < DROP_COST}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  dropping
                    ? "bg-zinc-700 cursor-wait"
                    : vault < DROP_COST
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-600 hover:from-blue-500 hover:via-cyan-400 hover:to-teal-500 hover:scale-105"
                }`}
              >
                {dropping ? "🎯 DROPPING..." : `🎯 DROP (${fmt(DROP_COST)})`}
              </button>
              <div className="text-sm opacity-60 mt-3">
                {fmt(DROP_COST)} MLEO per drop
              </div>
            </div>
          </div>

          {/* RECENT HISTORY */}
          {stats.history.length > 0 && (
            <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
              <h3 className="text-lg font-bold mb-4">📊 Recent Drops</h3>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {stats.history.map((drop, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg text-center font-bold text-xs border ${
                      drop.mult >= 3 ? 'bg-green-500/20 border-green-500' :
                      drop.mult >= 1 ? 'bg-blue-500/20 border-blue-500' :
                      'bg-zinc-800/50 border-zinc-600'
                    }`}
                  >
                    ×{drop.mult}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm opacity-70">Total Drops</div>
                <div className="text-2xl font-bold">{stats.totalDrops}</div>
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
                <div className="text-sm opacity-70">Win Rate</div>
                <div className="text-2xl font-bold text-blue-400">
                  {stats.totalDrops > 0 ? `${((stats.totalWon / (stats.totalDrops * DROP_COST)) * 100).toFixed(1)}%` : "0%"}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}

