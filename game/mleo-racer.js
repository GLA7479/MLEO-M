// ============================================================================
// MLEO Racer - Car Racing Game
// Cost: 1000 MLEO per race
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_racer_v1";
const MIN_BET = 1000; // Minimum bet amount

const CARS = [
  { id: 1, name: "Red Lightning", emoji: "🏎️", color: "from-red-600 to-red-800" },
  { id: 2, name: "Blue Thunder", emoji: "🚗", color: "from-blue-600 to-blue-800" },
  { id: 3, name: "Green Speed", emoji: "🏁", color: "from-green-600 to-green-800" },
  { id: 4, name: "Yellow Flash", emoji: "🚙", color: "from-yellow-600 to-yellow-800" },
  { id: 5, name: "Purple Storm", emoji: "🚕", color: "from-purple-600 to-purple-800" }
];

const MULTIPLIERS = {
  1: 6.0, // Winner
  2: 4.0, // Second place
  3: 2.5, // Third place
  4: 1.5, // Fourth place
  5: 1.0  // Last place (break even)
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
function simulateRace() {
  // Simulate race results with random positions
  const results = CARS.map(car => ({
    ...car,
    progress: Math.random() * 100,
    position: 0
  })).sort((a, b) => b.progress - a.progress);
  
  // Assign positions
  results.forEach((car, index) => {
    car.position = index + 1;
  });
  
  return results;
}

function checkWin(selectedCarId, results) {
  const selectedCarResult = results.find(car => car.id === selectedCarId);
  const position = selectedCarResult.position;
  const multiplier = MULTIPLIERS[position];
  const isWin = position <= 3; // Top 3 positions win
  
  return {
    win: isWin,
    position: position,
    multiplier: multiplier,
    selectedCar: selectedCarResult,
    results: results
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MLEORacerPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [selectedCar, setSelectedCar] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState(null);
  const [raceResults, setRaceResults] = useState([]);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalRaces: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, history: [], lastBet: MIN_BET })
  );

  // ----------------------- Mount -------------------
  useEffect(() => {
    setMounted(true);
    const currentVault = getVault();
    setVaultState(currentVault);
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    
    // Load last bet amount
    const savedLastBet = safeRead(LS_KEY, { lastBet: MIN_BET }).lastBet;
    setBetAmount(savedLastBet.toString());
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [router.query]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startFreePlay = () => {
    setBetAmount("1000");
    if (!selectedCar) setSelectedCar(0);
    startRace(true);
  };

  const startRace = async (isFreePlayParam = false) => {
    if (playing || !selectedCar) return;

    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/racer', undefined, { shallow: true });
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
    setPlaying(true);
    setResult(null);

    // Simulate race
    const results = simulateRace();
    setRaceResults(results);

    // Check win
    const winResult = checkWin(selectedCar.id, results);
    const prize = Math.floor(bet * winResult.multiplier);

    if (winResult.win) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: winResult.win,
      position: winResult.position,
      multiplier: winResult.multiplier,
      prize: winResult.win ? prize : 0,
      selectedCar: winResult.selectedCar.name,
      results: results
    };

    setResult(resultData);
    setPlaying(false);

    // Update stats
    const newStats = {
      ...stats,
      totalRaces: stats.totalRaces + 1,
      totalBet: stats.totalBet + bet,
      wins: winResult.win ? stats.wins + 1 : stats.wins,
      totalWon: winResult.win ? stats.totalWon + prize : stats.totalWon,
      totalLost: winResult.win ? stats.totalLost : stats.totalLost + bet,
      biggestWin: Math.max(stats.biggestWin, winResult.win ? prize : 0),
      history: [{ ...resultData, bet, timestamp: Date.now() }, ...stats.history.slice(0, 9)],
      lastBet: bet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-red-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-red-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">🏁 MLEO Racer</h1>
              <p className="text-zinc-400 text-sm">Bet on your favorite car and watch them race!</p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Race Track */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🏁 Race Track</h2>
              <div className="space-y-4">
                {raceResults.map((car, index) => (
                  <div key={car.id} className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{car.emoji}</span>
                        <span className="font-bold text-lg">{car.name}</span>
                        {result && (
                          <span className="text-2xl font-bold text-yellow-400">
                            #{car.position}
                          </span>
                        )}
                      </div>
                      <div className="text-lg font-bold">
                        {result ? `${fmt(Math.floor(currentBet * MULTIPLIERS[car.position]))}` : '0'} MLEO
                      </div>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-8 relative overflow-hidden">
                      <div 
                        className={`h-full bg-gradient-to-r ${car.color} rounded-full transition-all duration-200 flex items-center justify-end pr-4`}
                        style={{ width: `${car.progress}%` }}
                      >
                        {car.progress > 20 && (
                          <span className="text-white font-bold text-lg">{car.emoji}</span>
                        )}
                      </div>
                    </div>
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
                  {result.win ? "🏆 You Won!" : "💥 You Lost!"}
                </div>
                <div className="text-xl mb-2">
                  {result.selectedCar} finished #{result.position}
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

            {/* Car Selection */}
            {!playing && !result && (
              <div className="text-center mb-6">
                <h3 className="text-lg font-bold mb-4">Choose Your Car</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-4xl mx-auto">
                  {CARS.map((car) => (
                    <button
                      key={car.id}
                      onClick={() => setSelectedCar(car)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        selectedCar?.id === car.id
                          ? "border-yellow-500 bg-yellow-500/20 scale-105"
                          : "border-zinc-700 hover:border-zinc-500"
                      }`}
                    >
                      <div className="text-4xl mb-2">{car.emoji}</div>
                      <div className="font-bold text-sm">{car.name}</div>
                    </button>
                  ))}
                </div>
                {!selectedCar && (
                  <div className="text-red-400 text-sm mt-4">
                    Please select a car to start racing!
                  </div>
                )}
              </div>
            )}

            {/* START RACE BUTTON */}
            <div className="text-center mb-6">
              {freePlayTokens > 0 && !playing && (
                <button
                  onClick={startFreePlay}
                  className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                >
                  🎁 FREE PLAY ({freePlayTokens}/5)
                </button>
              )}
              
              <button
                onClick={() => startRace(false)}
                disabled={playing}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                  playing
                    ? "bg-zinc-700 cursor-wait"
                    : "bg-gradient-to-r from-red-600 via-orange-500 to-yellow-600 hover:from-red-500 hover:via-orange-400 hover:to-yellow-500 hover:scale-105"
                }`}
              >
                {playing ? "🏁 RACING..." : `🏁 START RACE (${fmt(Number(betAmount) || MIN_BET)})`}
              </button>
              <div className="text-sm opacity-70 mb-4">
                Real racing simulation • Win up to ×6 multiplier • Max win: {fmt((Number(betAmount) || MIN_BET) * 6)}
              </div>
            </div>

            {/* Play Again Button */}
            {result && (
              <div className="text-center">
                <button
                  onClick={() => {
                    setResult(null);
                    setRaceResults([]);
                    setSelectedCar(null);
                  }}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 transition-all mb-6"
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
              <div className="text-xs opacity-70 mb-1">Total Races</div>
              <div className="text-lg font-bold">
                {stats.totalRaces.toLocaleString()}
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
              <li>• <strong>Choose a car:</strong> Pick your favorite racing car</li>
              <li>• <strong>Watch the race:</strong> Cars race automatically with realistic physics</li>
              <li>• <strong>Win multipliers:</strong> 1st place ×6, 2nd place ×4, 3rd place ×2.5</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per race</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}