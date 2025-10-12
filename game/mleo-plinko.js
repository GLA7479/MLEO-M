// ============================================================================
// MLEO Plinko - Classic Ball Drop Game with Real Animation
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

// 15 buckets for better variety
const MULTIPLIERS = [10, 5, 3, 2, 0.5, 0.2, 0, 0.2, 0.5, 2, 3, 5, 10];
const BUCKET_COLORS = [
  "from-yellow-400 to-amber-500",    // 10x
  "from-orange-500 to-orange-600",   // 5x
  "from-green-500 to-emerald-500",   // 3x
  "from-blue-500 to-cyan-500",       // 2x
  "from-purple-500 to-purple-600",   // 0.5x
  "from-red-500 to-red-600",         // 0.2x
  "from-gray-700 to-gray-800",       // 0x
  "from-red-500 to-red-600",         // 0.2x
  "from-purple-500 to-purple-600",   // 0.5x
  "from-blue-500 to-cyan-500",       // 2x
  "from-green-500 to-emerald-500",   // 3x
  "from-orange-500 to-orange-600",   // 5x
  "from-yellow-400 to-amber-500",    // 10x
];

const ROWS = 12; // Number of peg rows

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
// PLINKO PATH GENERATOR
// ============================================================================
function generatePath() {
  const path = [];
  let position = 6; // Start at middle (0-12 range for 13 buckets)
  
  path.push({ row: 0, pos: position });
  
  for (let row = 1; row <= ROWS; row++) {
    // Random direction
    const direction = Math.random() < 0.5 ? -1 : 1;
    position = Math.max(0, Math.min(12, position + direction));
    path.push({ row, pos: position });
  }
  
  return path;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PlinkoPage() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [ballPath, setBallPath] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [finalBucket, setFinalBucket] = useState(null);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalDrops: 0, totalWon: 0, biggestWin: 0, history: [] })
  );

  const dropSound = useRef(null);
  const winSound = useRef(null);
  const bounceSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    if (typeof Audio !== "undefined") {
      dropSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
      bounceSound.current = new Audio("/sounds/click.mp3");
    }
  }, []);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  // Animate ball dropping
  useEffect(() => {
    if (dropping && ballPath.length > 0 && currentStep < ballPath.length) {
      const timer = setTimeout(() => {
        setCurrentStep(currentStep + 1);
        
        // Play bounce sound on impact
        if (bounceSound.current && currentStep > 0 && currentStep < ballPath.length - 1) {
          bounceSound.current.currentTime = 0;
          bounceSound.current.volume = 0.2;
          bounceSound.current.play().catch(() => {});
        }
      }, 280); // Slightly slower for better physics feel
      
      return () => clearTimeout(timer);
    } else if (dropping && currentStep >= ballPath.length) {
      // Ball finished dropping
      finalizeDrop();
    }
  }, [dropping, currentStep, ballPath]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const finalizeDrop = async () => {
    const finalPos = ballPath[ballPath.length - 1].pos;
    setFinalBucket(finalPos);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Calculate prize
    const multiplier = MULTIPLIERS[finalPos];
    const prize = Math.floor(DROP_COST * multiplier);
    
    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      
      const newHistory = [
        { mult: multiplier, prize, bucket: finalPos, timestamp: Date.now() },
        ...stats.history.slice(0, 9)
      ];
      
      setStats(s => ({
        totalDrops: s.totalDrops + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        history: newHistory
      }));

      setResult({ 
        win: multiplier >= 1, 
        message: multiplier >= 1 ? `Win ×${multiplier}!` : `×${multiplier}`,
        prize,
        multiplier
      });
      
      if (winSound.current && multiplier >= 2) {
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      }
    } else {
      setStats(s => ({
        ...s,
        totalDrops: s.totalDrops + 1,
        history: [
          { mult: 0, prize: 0, bucket: finalPos, timestamp: Date.now() },
          ...s.history.slice(0, 9)
        ]
      }));
      setResult({ 
        win: false, 
        message: "No win",
        prize: 0
      });
    }

    setDropping(false);
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

    // Generate path and start drop
    const path = generatePath();
    setBallPath(path);
    setCurrentStep(0);
    setFinalBucket(null);
    setResult(null);
    setDropping(true);
    
    if (dropSound.current) {
      dropSound.current.currentTime = 0;
      dropSound.current.play().catch(() => {});
    }
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

  // Calculate ball position for rendering
  const ballPos = currentStep < ballPath.length ? ballPath[currentStep] : null;

  return (
    <Layout isGame={true} title="MLEO Plinko 🎯">
      <style jsx>{`
        @keyframes bounce-ball {
          0% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.2) rotate(180deg); }
          100% { transform: scale(1) rotate(360deg); }
        }
      `}</style>
      <main className="min-h-[100svh] bg-gradient-to-b from-blue-950 via-indigo-950 to-black text-zinc-100">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                🎯 MLEO Plinko
              </h1>
              <div className="text-sm opacity-70 mt-1">Watch the ball drop through pegs!</div>
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
            
            {/* Visual Plinko Board with Pegs */}
            <div className="relative bg-gradient-to-b from-indigo-900/50 to-blue-950/80 rounded-2xl p-6 mb-6 overflow-hidden" style={{ minHeight: '520px' }}>
              {/* Draw Pegs in Zigzag Pattern */}
              <div className="relative" style={{ height: '480px' }}>
                {[...Array(ROWS)].map((_, rowIndex) => {
                  const pegsInRow = rowIndex % 2 === 0 ? 13 : 12; // Alternate between 13 and 12 pegs
                  const rowY = ((rowIndex + 0.5) / (ROWS + 1)) * 100;
                  const isEvenRow = rowIndex % 2 === 0;
                  
                  return (
                    <div key={rowIndex} className="absolute w-full" style={{ top: `${rowY}%` }}>
                      <div className="flex justify-around px-8" style={{ 
                        paddingLeft: isEvenRow ? '32px' : '60px',
                        paddingRight: isEvenRow ? '32px' : '60px'
                      }}>
                        {[...Array(pegsInRow)].map((_, pegIndex) => (
                          <div
                            key={pegIndex}
                            className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-300 to-blue-500 shadow-lg border border-blue-200"
                            style={{
                              boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                
                {/* Animated Ball */}
                {ballPos && (
                  <div
                    className="absolute"
                    style={{
                      top: `${(ballPos.row / ROWS) * 100}%`,
                      left: `${((ballPos.pos / 12) * 100)}%`,
                      transform: 'translate(-50%, -50%)',
                      transition: 'top 0.25s cubic-bezier(0.4, 0, 0.2, 1), left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      zIndex: 10
                    }}
                  >
                    <div 
                      className="relative"
                      style={{
                        animation: 'bounce-ball 0.25s ease-in-out'
                      }}
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-300 via-orange-400 to-red-500 shadow-xl border border-yellow-200"
                           style={{
                             boxShadow: '0 0 15px rgba(255, 215, 0, 0.6), 0 0 25px rgba(255, 165, 0, 0.3)'
                           }}>
                        <div className="w-full h-full rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent"></div>
                      </div>
                      {/* Trail effect */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 opacity-25 blur-sm"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Multiplier Buckets */}
            <div className="grid gap-1 mb-6" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
              {MULTIPLIERS.map((mult, idx) => (
                <div
                  key={idx}
                  className={`relative p-2 rounded-lg text-center font-bold text-xs transition-all ${
                    finalBucket === idx ? 'scale-110 shadow-2xl ring-4 ring-white/50' : ''
                  }`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-b ${BUCKET_COLORS[idx]} rounded-lg`}></div>
                  <div className="relative text-white">
                    {mult >= 1 ? `×${mult}` : `×${mult}`}
                  </div>
                  {finalBucket === idx && (
                    <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 animate-bounce">
                      <div className="text-4xl">⬇️</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Result */}
            {result && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                result.error
                  ? "bg-red-900/30 border-red-500"
                  : result.win
                  ? "bg-green-900/30 border-green-500 animate-pulse"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">{result.message}</div>
                <div className={`text-5xl font-bold ${result.win ? 'text-green-400' : 'text-red-400'}`}>
                  {result.prize > 0 ? `+${fmt(result.prize)} MLEO` : 'Lost'}
                </div>
              </div>
            )}

            {/* Drop Button */}
            <div className="text-center">
              <button
                onClick={dropBall}
                disabled={dropping || vault < DROP_COST}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  dropping
                    ? "bg-zinc-700 cursor-wait opacity-70"
                    : vault < DROP_COST
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-600 hover:from-blue-500 hover:via-cyan-400 hover:to-teal-500 hover:scale-105"
                }`}
              >
                {dropping ? "🎯 DROPPING..." : `🎯 DROP BALL (${fmt(DROP_COST)})`}
              </button>
              <div className="text-sm opacity-60 mt-3">
                {fmt(DROP_COST)} MLEO per drop
              </div>
            </div>
          </div>

          {/* MULTIPLIER INFO */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">🎯 Multiplier Buckets</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: "×10", desc: "JACKPOT!", color: "yellow" },
                { label: "×5", desc: "Big Win", color: "orange" },
                { label: "×3", desc: "Great", color: "green" },
                { label: "×2", desc: "Good", color: "blue" },
                { label: "×0.5", desc: "Small Loss", color: "purple" },
                { label: "×0.2", desc: "Big Loss", color: "red" },
                { label: "×0", desc: "Total Loss", color: "gray" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border-2 border-${item.color}-500 bg-${item.color}-500/20`}
                >
                  <div className={`font-bold text-lg text-${item.color}-400`}>{item.label}</div>
                  <div className="text-xs opacity-70 mt-1">{item.desc}</div>
                </div>
              ))}
            </div>
            <div className="text-xs opacity-60 text-center mt-4">
              💡 Edge buckets (×10) are rarest • Center has mix of wins and losses
            </div>
          </div>

          {/* RECENT HISTORY */}
          {stats.history.length > 0 && (
            <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
              <h3 className="text-lg font-bold mb-4">📊 Last 10 Drops</h3>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {stats.history.map((drop, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg text-center font-bold border-2 ${
                      drop.mult >= 5 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' :
                      drop.mult >= 2 ? 'bg-green-500/20 border-green-500 text-green-400' :
                      drop.mult >= 1 ? 'bg-blue-500/20 border-blue-500 text-blue-400' :
                      drop.mult >= 0.5 ? 'bg-purple-500/20 border-purple-500 text-purple-400' :
                      'bg-red-500/20 border-red-500 text-red-400'
                    }`}
                  >
                    ×{drop.mult}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• Click DROP BALL to start the game</li>
              <li>• Watch the ball fall with realistic physics through the pegs</li>
              <li>• Ball bounces left or right randomly at each peg with smooth animation</li>
              <li>• Ball lands in a bucket at the bottom (takes ~3.5 seconds)</li>
              <li>• Edge buckets (×10, ×5) are hardest to hit but pay big!</li>
              <li>• Center has mix: some good (×2, ×3) and some losses (×0.5, ×0.2, ×0)</li>
              <li>• Pure luck and physics - no skill required!</li>
            </ul>
          </div>

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
                <div className="text-sm opacity-70">Return Rate</div>
                <div className="text-2xl font-bold text-blue-400">
                  {stats.totalDrops > 0 ? `${((stats.totalWon / (stats.totalDrops * DROP_COST)) * 100).toFixed(1)}%` : "0%"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-sm opacity-70">Net Profit/Loss</div>
                <div className={`text-3xl font-bold ${
                  stats.totalWon >= stats.totalDrops * DROP_COST ? 'text-green-400' : 'text-red-400'
                }`}>
                  {stats.totalDrops > 0 
                    ? `${stats.totalWon >= stats.totalDrops * DROP_COST ? '+' : ''}${fmt(stats.totalWon - (stats.totalDrops * DROP_COST))}` 
                    : '0'}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}
