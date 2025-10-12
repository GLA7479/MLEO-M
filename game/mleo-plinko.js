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
// PLINKO PATH GENERATOR - Aligned to actual peg positions
// ============================================================================
function generatePath() {
  const path = [];
  
  // Row 0: Start at middle of top row (13 pegs, position 6 is center)
  let position = 6;
  let pegColumn = 6;
  
  path.push({ row: 0, pegColumn, displayX: pegColumn });
  
  for (let row = 1; row <= ROWS; row++) {
    const isEvenRow = row % 2 === 0;
    const previousIsEven = (row - 1) % 2 === 0;
    
    // Calculate which peg we hit based on previous position
    if (previousIsEven && !isEvenRow) {
      // Going from 13-peg row to 12-peg row (offset row)
      // The ball can go to same column or one left
      const goLeft = Math.random() < 0.5;
      pegColumn = goLeft ? Math.max(0, pegColumn - 1) : Math.min(11, pegColumn);
      
    } else if (!previousIsEven && isEvenRow) {
      // Going from 12-peg row to 13-peg row (normal row)
      // The ball bounces to adjacent peg
      const goRight = Math.random() < 0.5;
      pegColumn = goRight ? Math.min(12, pegColumn + 1) : pegColumn;
      
    } else if (previousIsEven && isEvenRow) {
      // 13-peg to 13-peg
      const direction = Math.random() < 0.5 ? -1 : 1;
      pegColumn = Math.max(0, Math.min(12, pegColumn + direction));
      
    } else {
      // 12-peg to 12-peg
      const direction = Math.random() < 0.5 ? -1 : 1;
      pegColumn = Math.max(0, Math.min(11, pegColumn + direction));
    }
    
    // For display, we need to map the peg position to a consistent X coordinate
    // Offset rows are shifted, so we need to account for that
    const displayX = isEvenRow ? pegColumn : pegColumn + 0.5;
    
    path.push({ row, pegColumn, displayX, isOffset: !isEvenRow });
  }
  
  // Final bucket position (map to 13 buckets)
  const finalBucket = Math.round(path[path.length - 1].displayX);
  
  // Add final landing step - ball falls into bucket
  path.push({ 
    row: ROWS + 1, 
    pegColumn: finalBucket, 
    displayX: finalBucket, 
    isBucket: true 
  });
  
  return { path, finalBucket };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PlinkoPage() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [activeBalls, setActiveBalls] = useState([]); // Array of balls with their paths
  const [finalBuckets, setFinalBuckets] = useState([]); // Array of final bucket positions
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalDrops: 0, totalWon: 0, biggestWin: 0, history: [] })
  );

  const dropSound = useRef(null);
  const winSound = useRef(null);
  const bounceSound = useRef(null);
  const animationFrameRef = useRef(null);

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

  // Animate all active balls continuously
  useEffect(() => {
    if (activeBalls.length === 0) return;
    
    const interval = setInterval(() => {
      setActiveBalls(balls => {
        if (balls.length === 0) return balls;
        
        const updatedBalls = [];
        const finishedBalls = [];
        
        balls.forEach(ball => {
          if (ball.currentStep >= ball.path.length) {
            finishedBalls.push(ball);
          } else {
            // Play bounce sound
            if (bounceSound.current && ball.currentStep > 0 && ball.currentStep < ball.path.length - 1) {
              bounceSound.current.currentTime = 0;
              bounceSound.current.volume = 0.12;
              bounceSound.current.play().catch(() => {});
            }
            
            updatedBalls.push({
              ...ball,
              currentStep: ball.currentStep + 1
            });
          }
        });
        
        // Process finished balls
        if (finishedBalls.length > 0) {
          processFinishedBalls(finishedBalls);
        }
        
        return updatedBalls;
      });
    }, 700); // MUCH SLOWER - 700ms per step
    
    return () => clearInterval(interval);
  }, [activeBalls.length]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const processFinishedBalls = (finishedBalls) => {
    // Add to final buckets display
    const bucketPositions = finishedBalls.map(ball => ball.finalBucket);
    setFinalBuckets(prev => [...prev, ...bucketPositions]);
    
    // Calculate and award prizes immediately
    finishedBalls.forEach(ball => {
      const finalPos = ball.finalBucket;
      const multiplier = MULTIPLIERS[finalPos] || 0;
      const prize = Math.floor(DROP_COST * multiplier);
      
      if (prize > 0) {
        const newVault = getVault() + prize;
        setVault(newVault);
        setVaultState(newVault);
      }
      
      // Update stats
      setStats(s => ({
        totalDrops: s.totalDrops + 1,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        history: [
          { mult: multiplier, prize, bucket: finalPos, timestamp: Date.now() },
          ...s.history.slice(0, 9)
        ]
      }));
      
      // Show result for this ball
      setResult({ 
        win: multiplier >= 1, 
        message: `×${multiplier}`,
        prize,
        multiplier
      });
      
      if (winSound.current && multiplier >= 2) {
        winSound.current.currentTime = 0;
        winSound.current.volume = 0.3;
        winSound.current.play().catch(() => {});
      }
    });
    
    // Clear bucket highlights after delay
    setTimeout(() => {
      setFinalBuckets(prev => prev.filter(b => !bucketPositions.includes(b)));
    }, 2000);
  };

  const dropBall = () => {
    const currentVault = getVault();
    
    if (currentVault < DROP_COST) {
      setResult({ error: true, message: `Need ${fmt(DROP_COST)} MLEO!` });
      return;
    }

    // Deduct cost for ONE ball
    setVault(currentVault - DROP_COST);
    setVaultState(currentVault - DROP_COST);

    // Generate path for ONE ball
    const { path, finalBucket: endBucket } = generatePath();
    const newBall = {
      id: Date.now() + Math.random(), // Unique ID
      path,
      finalBucket: endBucket,
      currentStep: 0
    };
    
    // Add to active balls array
    setActiveBalls(prev => [...prev, newBall]);
    
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

  // Get current positions of all active balls
  const activeBallPositions = activeBalls
    .filter(ball => ball.currentStep < ball.path.length)
    .map(ball => ({
      ...ball.path[ball.currentStep],
      ballId: ball.id
    }));

  return (
    <Layout isGame={true} title="MLEO Plinko 🎯">
      <style jsx>{`
        @keyframes bounce-impact {
          0% { 
            transform: scale(1) translateY(-5px) rotate(0deg); 
          }
          15% { 
            transform: scale(1.1, 0.85) translateY(0) rotate(30deg); 
          }
          30% { 
            transform: scale(0.75, 1.25) translateY(2px) rotate(90deg); 
          }
          45% { 
            transform: scale(1.3, 0.7) translateY(0) rotate(135deg); 
          }
          60% { 
            transform: scale(0.9, 1.1) translateY(-4px) rotate(180deg); 
          }
          75% { 
            transform: scale(1.1, 0.9) translateY(0) rotate(270deg); 
          }
          90% { 
            transform: scale(0.95, 1.05) translateY(-1px) rotate(330deg); 
          }
          100% { 
            transform: scale(1) translateY(0) rotate(360deg); 
          }
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
          <div className="rounded-3xl p-3 sm:p-6 bg-gradient-to-br from-blue-900/30 via-indigo-900/20 to-cyan-900/30 border-2 sm:border-4 border-blue-600/50 shadow-2xl mb-6">
            
            {/* Visual Plinko Board with Pegs */}
            <div className="relative bg-gradient-to-b from-indigo-900/50 to-blue-950/80 rounded-2xl p-4 sm:p-6 mb-6 overflow-hidden" style={{ minHeight: '400px' }}>
              {/* Draw Pegs in Zigzag Pattern with more spacing */}
              <div className="relative mx-auto max-w-2xl" style={{ height: '380px' }}>
                {[...Array(ROWS)].map((_, rowIndex) => {
                  const pegsInRow = rowIndex % 2 === 0 ? 13 : 12; // Alternate between 13 and 12 pegs
                  const rowY = ((rowIndex + 1) / (ROWS + 2)) * 100; // Better vertical spacing
                  const isEvenRow = rowIndex % 2 === 0;
                  
                  return (
                    <div key={rowIndex} className="absolute w-full" style={{ top: `${rowY}%` }}>
                      <div className="flex justify-between px-4 sm:px-8" style={{ 
                        paddingLeft: isEvenRow ? '16px' : '28px',
                        paddingRight: isEvenRow ? '16px' : '28px'
                      }}>
                        {[...Array(pegsInRow)].map((_, pegIndex) => {
                          // Check if ANY ball is hitting this peg
                          const isPegHit = activeBallPositions.some(pos => 
                            pos.row === rowIndex && pos.pegColumn === pegIndex
                          );
                          
                          return (
                            <div
                              key={pegIndex}
                              className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full shadow-lg border transition-all duration-300 ${
                                isPegHit 
                                  ? 'bg-gradient-to-br from-yellow-300 to-orange-400 border-yellow-200 scale-[2]' 
                                  : 'bg-gradient-to-br from-blue-300 to-blue-500 border-blue-200'
                              }`}
                              style={{
                                boxShadow: isPegHit 
                                  ? '0 0 25px rgba(255, 215, 0, 1), 0 0 50px rgba(255, 165, 0, 0.8)'
                                  : '0 0 8px rgba(59, 130, 246, 0.5)'
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                
                {/* Animated Balls */}
                {activeBallPositions.map((ballPos, idx) => {
                  // If ball is in bucket (final position), hide it (we'll show it in the bucket below)
                  if (ballPos.isBucket) return null;
                  
                  return (
                    <div
                      key={ballPos.ballId}
                      className="absolute"
                      style={{
                        top: `${((ballPos.row + 1) / (ROWS + 2)) * 100}%`,
                        left: `${((ballPos.displayX / 12) * 100)}%`,
                        transform: 'translate(-50%, -50%)',
                        transition: 'top 0.7s cubic-bezier(0.33, 1, 0.68, 1), left 0.7s cubic-bezier(0.33, 1, 0.68, 1)',
                        zIndex: 10 + idx
                      }}
                    >
                    <div 
                      className="relative"
                      style={{
                        animation: 'bounce-impact 0.7s ease-in-out infinite'
                      }}
                    >
                      <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gradient-to-br from-yellow-300 via-orange-400 to-red-500 shadow-xl border border-yellow-200"
                           style={{
                             boxShadow: '0 0 15px rgba(255, 215, 0, 0.8), 0 0 25px rgba(255, 165, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)'
                           }}>
                        <div className="w-full h-full rounded-full bg-gradient-to-br from-white/60 via-white/20 to-transparent"></div>
                      </div>
                      {/* Impact ring */}
                      <div className="absolute inset-0 rounded-full bg-yellow-400/40 animate-ping"></div>
                      {/* Glow effect */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 opacity-40 blur-lg scale-110"></div>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Multiplier Buckets with visible balls landing */}
            <div className="relative">
              <div className="grid gap-0.5 sm:gap-1 mb-4 sm:mb-6 max-w-2xl mx-auto" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
                {MULTIPLIERS.map((mult, idx) => {
                  const ballsInBucket = finalBuckets.filter(b => b === idx).length;
                  const isHighlighted = ballsInBucket > 0;
                  
                  // Check if any ball is currently landing in this bucket
                  const ballsLanding = activeBallPositions.filter(pos => 
                    pos.isBucket && pos.pegColumn === idx
                  );
                  
                  return (
                    <div
                      key={idx}
                      className={`relative p-1 sm:p-2 rounded text-center font-bold text-[9px] sm:text-xs transition-all ${
                        isHighlighted ? 'scale-110 shadow-2xl ring-2 sm:ring-4 ring-white/50' : ''
                      }`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-b ${BUCKET_COLORS[idx]} rounded`}></div>
                      <div className="relative text-white whitespace-nowrap">
                        {mult >= 1 ? `×${mult}` : `×${mult}`}
                      </div>
                      
                      {/* Show balls landing in this bucket */}
                      {ballsLanding.length > 0 && (
                        <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
                          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-300 to-orange-500 border-2 border-yellow-200 shadow-2xl animate-bounce"
                               style={{
                                 boxShadow: '0 0 20px rgba(255, 215, 0, 1), 0 0 35px rgba(255, 165, 0, 0.7)'
                               }}>
                          </div>
                        </div>
                      )}
                      
                      {isHighlighted && (
                        <>
                          <div className="absolute -top-8 sm:-top-12 left-1/2 transform -translate-x-1/2 animate-bounce">
                            <div className="text-2xl sm:text-4xl">⬇️</div>
                          </div>
                          {ballsInBucket > 1 && (
                            <div className="absolute -top-4 sm:-top-6 right-0 bg-green-500 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-xs font-bold">
                              {ballsInBucket}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drop Button - Click anytime to add a ball */}
            <div className="text-center mb-6">
              <button
                onClick={dropBall}
                disabled={vault < DROP_COST}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  vault < DROP_COST
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-600 hover:from-blue-500 hover:via-cyan-400 hover:to-teal-500 hover:scale-105 active:scale-95"
                }`}
              >
                🎯 DROP BALL ({fmt(DROP_COST)})
              </button>
              <div className="text-sm opacity-70 mt-3">
                Click to drop a ball anytime! • No limit on active balls
              </div>
            </div>

            {/* Active Balls & Result - Same Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-3xl mx-auto">
              {/* Active Balls */}
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                <div className="text-sm opacity-70 mb-1">Active Balls</div>
                <div className="text-3xl font-bold text-cyan-400">{activeBalls.length}</div>
              </div>
              
              {/* Result */}
              {result && !result.error && (
                <div className={`p-4 rounded-xl border-2 ${
                  result.win
                    ? "bg-green-900/30 border-green-500"
                    : "bg-red-900/30 border-red-500"
                }`}>
                  <div className="text-sm font-bold mb-1">{result.message}</div>
                  <div className={`text-2xl font-bold ${result.win && result.prize > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {result.prize > 0 ? `+${fmt(result.prize)}` : 'No Win'}
                  </div>
                </div>
              )}
              
              {result && result.error && (
                <div className="p-4 rounded-xl border-2 bg-red-900/30 border-red-500">
                  <div className="text-sm font-bold text-red-400">{result.message}</div>
                </div>
              )}
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
              <li>• <strong>Click DROP BALL anytime:</strong> Each click adds a new ball for 1,000 MLEO</li>
              <li>• <strong>Multiple balls:</strong> Click multiple times to drop many balls at once!</li>
              <li>• <strong>No limit:</strong> Drop as many balls as you want simultaneously</li>
              <li>• <strong>Slow physics:</strong> Each ball takes ~8-10 seconds to drop</li>
              <li>• <strong>Peg impacts:</strong> Pegs light up yellow when balls hit them</li>
              <li>• <strong>Edge buckets (×10, ×5):</strong> Hardest to hit but pay big!</li>
              <li>• <strong>Center buckets:</strong> Mix of wins (×2, ×3) and losses (×0.5, ×0.2, ×0)</li>
              <li>• <strong>Instant payout:</strong> Win immediately when each ball lands!</li>
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
