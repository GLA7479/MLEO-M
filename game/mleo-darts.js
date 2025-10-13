// ============================================================================
// MLEO Darts - Dart Throwing Game
// Cost: 1000 MLEO per throw
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken as consumeFreePlayToken } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_darts_v1";
const MIN_BET = 1000; // Minimum bet amount

const ZONES = [
  { name: "Bullseye", multiplier: 10.0, color: "from-red-600 to-red-800", emoji: "🎯", probability: 0.05 },
  { name: "Inner Ring", multiplier: 5.0, color: "from-yellow-600 to-yellow-800", emoji: "🟡", probability: 0.15 },
  { name: "Outer Ring", multiplier: 3.0, color: "from-green-600 to-green-800", emoji: "🟢", probability: 0.25 },
  { name: "Middle Ring", multiplier: 1.5, color: "from-blue-600 to-blue-800", emoji: "🔵", probability: 0.35 },
  { name: "Miss", multiplier: 0.0, color: "from-gray-600 to-gray-800", emoji: "❌", probability: 0.20 }
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
// GAME LOGIC
// ============================================================================
function simulateDartThrow() {
  // Random zone selection based on probability
  const random = Math.random();
  let cumulativeProb = 0;
  
  for (const zone of ZONES) {
    cumulativeProb += zone.probability;
    if (random <= cumulativeProb) {
      return zone;
    }
  }
  
  return ZONES[ZONES.length - 1]; // Fallback to miss
}

function calculatePrize(bet, zone) {
  return Math.floor(bet * zone.multiplier);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MLEODartsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [throwing, setThrowing] = useState(false);
  const [result, setResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalThrows: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, history: [], lastBet: MIN_BET })
  );

  // ----------------------- Mount -------------------
  useEffect(() => {
    setMounted(true);
    const currentVault = getVault();
    setVaultState(currentVault);
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    // Load last bet amount
    const savedLastBet = safeRead(LS_KEY, { lastBet: MIN_BET }).lastBet;
    setBetAmount(savedLastBet.toString());
  }, [router.query]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const throwDart = async () => {
    if (throwing) return;

    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay) {
      const result = consumeFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/darts', undefined, { shallow: true });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      const currentVault = getVault();
      if (bet < MIN_BET) {
        alert(`Minimum bet is ${MIN_BET} MLEO`);
        return;
      }
      if (currentVault < bet) {
        alert('Insufficient MLEO in vault');
        return;
      }

      // Deduct bet
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setCurrentBet(bet);
    setThrowing(true);
    setResult(null);

    // Simulate dart throw
    setTimeout(() => {
      const hitZone = simulateDartThrow();
      const prize = calculatePrize(bet, hitZone);
      const isWin = hitZone.multiplier > 0;

      if (isWin) {
        const newVault = currentVault - bet + prize;
        setVault(newVault);
        setVaultState(newVault);
      }

      const resultData = {
        win: isWin,
        zone: hitZone.name,
        multiplier: hitZone.multiplier,
        prize: isWin ? prize : 0,
        emoji: hitZone.emoji
      };

      setResult(resultData);
      setThrowing(false);

      // Update stats
      const newStats = {
        ...stats,
        totalThrows: stats.totalThrows + 1,
        totalBet: stats.totalBet + bet,
        wins: isWin ? stats.wins + 1 : stats.wins,
        totalWon: isWin ? stats.totalWon + prize : stats.totalWon,
        totalLost: isWin ? stats.totalLost : stats.totalLost + bet,
        biggestWin: Math.max(stats.biggestWin, isWin ? prize : 0),
        history: [{ ...resultData, bet, timestamp: Date.now() }, ...stats.history.slice(0, 9)],
        lastBet: bet
      };
      setStats(newStats);
      safeWrite(LS_KEY, newStats);
    }, 1000);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-orange-900 via-black to-orange-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-orange-900 via-black to-orange-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">🎯 MLEO Darts</h1>
              <p className="text-zinc-400 text-sm">Throw darts and hit the bullseye for massive wins!</p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Dart Board */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🎯 Dart Board</h2>
              <div className="relative w-80 h-80 mx-auto mb-6">
                {/* Dart Board Circles */}
                <div className="absolute inset-0 rounded-full border-8 border-gray-800 bg-gradient-to-br from-gray-700 to-gray-900">
                  {/* Outer ring */}
                  <div className="absolute inset-4 rounded-full border-4 border-blue-600 bg-gradient-to-br from-blue-600 to-blue-800">
                    {/* Middle ring */}
                    <div className="absolute inset-4 rounded-full border-4 border-green-600 bg-gradient-to-br from-green-600 to-green-800">
                      {/* Inner ring */}
                      <div className="absolute inset-4 rounded-full border-4 border-yellow-600 bg-gradient-to-br from-yellow-600 to-yellow-800">
                        {/* Bullseye */}
                        <div className="absolute inset-4 rounded-full border-4 border-red-600 bg-gradient-to-br from-red-600 to-red-800">
                          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center">
                            <span className="text-4xl">🎯</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Zone Legend */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto">
                {ZONES.map((zone, index) => (
                  <div key={index} className="text-center">
                    <div className={`w-12 h-12 rounded-full mx-auto mb-2 bg-gradient-to-br ${zone.color} flex items-center justify-center text-xl`}>
                      {zone.emoji}
                    </div>
                    <div className="text-sm font-bold">{zone.name}</div>
                    <div className="text-xs text-zinc-400">×{zone.multiplier}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Result Display */}
            {result && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                result.win
                  ? "bg-green-900/30 border-green-500"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">
                  {result.win ? "🎯 Bullseye!" : "❌ Miss!"}
                </div>
                <div className="text-xl mb-2">
                  Hit: {result.zone}
                </div>
                {result.win && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(result.prize)} MLEO ({result.multiplier}x)
                  </div>
                )}
                {!result.win && (
                  <div className="text-xl text-red-400">
                    Lost {fmt(currentBet)} MLEO
                  </div>
                )}
              </div>
            )}

            {/* THROW DART BUTTON */}
            <div className="text-center mb-6">
              <button
                onClick={throwDart}
                disabled={throwing}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                  throwing
                    ? "bg-zinc-700 cursor-wait"
                    : "bg-gradient-to-r from-orange-600 via-red-500 to-pink-600 hover:from-orange-500 hover:via-red-400 hover:to-pink-500 hover:scale-105"
                }`}
              >
                {throwing ? "🎯 THROWING..." : `🎯 THROW DART (${fmt(Number(betAmount) || MIN_BET)})`}
              </button>
              <div className="text-sm opacity-70 mb-4">
                Hit the bullseye for ×10 multiplier! • Max win: {fmt((Number(betAmount) || MIN_BET) * 10)}
              </div>
            </div>

            {/* Play Again Button */}
            {result && (
              <div className="text-center">
                <button
                  onClick={() => {
                    setResult(null);
                  }}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 transition-all mb-6"
                >
                  🔄 Play Again ({fmt(Number(betAmount) || MIN_BET)})
                </button>
                
                {/* Bet Amount Input - Only after result */}
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
                    Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
                  </div>
                </div>
              </div>
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
              <div className="text-xs opacity-70 mb-1">Total Throws</div>
              <div className="text-lg font-bold">
                {stats.totalThrows.toLocaleString()}
              </div>
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

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Throw dart:</strong> Click to throw and watch it fly to the dart board</li>
              <li>• <strong>Hit zones:</strong> Bullseye ×10, Inner Ring ×5, Outer Ring ×3, Middle Ring ×1.5</li>
              <li>• <strong>Miss:</strong> If you miss the board, you lose your bet</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per throw</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}