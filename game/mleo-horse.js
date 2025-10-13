// ============================================================================
// MLEO Horse Racing - Bet on Your Favorite!
// Cost: 1000 MLEO per race
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_horse_v1";
const MIN_BET = 1000;
const HORSES = [
  { name: "Thunder", emoji: "🐴", color: "red" },
  { name: "Lightning", emoji: "🏇", color: "blue" },
  { name: "Storm", emoji: "🐎", color: "green" },
  { name: "Blaze", emoji: "🦄", color: "yellow" },
  { name: "Spirit", emoji: "🐴", color: "purple" }
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
// MAIN COMPONENT
// ============================================================================
export default function HorseRacePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [racing, setRacing] = useState(false);
  const [raceProgress, setRaceProgress] = useState([0, 0, 0, 0, 0]);
  const [winner, setWinner] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalRaces: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, lastBet: MIN_BET })
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
    startRace(true);
  };

  const startRace = (isFreePlayParam = false) => {
    if (selectedHorse === null) {
      alert('Please select a horse first!');
      return;
    }

    if (racing) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/horse', undefined, { shallow: true });
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
    setRacing(true);
    setGameResult(null);
    setRaceProgress([0, 0, 0, 0, 0]);
    setWinner(null);

    // Simulate race
    const raceInterval = setInterval(() => {
      setRaceProgress(prev => {
        const newProgress = prev.map(p => p + Math.random() * 5);
        
        // Check if anyone finished (>= 100)
        const maxProgress = Math.max(...newProgress);
        if (maxProgress >= 100) {
          clearInterval(raceInterval);
          const winnerIndex = newProgress.indexOf(Math.max(...newProgress));
          setWinner(winnerIndex);
          endRace(winnerIndex);
        }
        
        return newProgress;
      });
    }, 100);
  };

  const endRace = (winnerIndex) => {
    setRacing(false);

    const win = winnerIndex === selectedHorse;
    const prize = win ? currentBet * 5 : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: win,
      winnerIndex: winnerIndex,
      winnerName: HORSES[winnerIndex].name,
      selectedName: HORSES[selectedHorse].name,
      prize: prize,
      profit: win ? prize - currentBet : -currentBet
    };

    setGameResult(resultData);

    const newStats = {
      ...stats,
      totalRaces: stats.totalRaces + 1,
      totalBet: stats.totalBet + currentBet,
      wins: win ? stats.wins + 1 : stats.wins,
      totalWon: win ? stats.totalWon + prize : stats.totalWon,
      totalLost: !win ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, win ? prize : 0),
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setSelectedHorse(null);
    setRacing(false);
    setRaceProgress([0, 0, 0, 0, 0]);
    setWinner(null);
    
    setTimeout(() => {
      // Don't auto-start, let user select horse again
    }, 100);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">
                🏇 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Horse Racing
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Bet on your favorite horse and win!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Horse Selection */}
            {!racing && !gameResult && (
              <div className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-center">🏇 Choose Your Horse</h2>
                <div className="grid grid-cols-1 gap-3 max-w-md mx-auto">
                  {HORSES.map((horse, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedHorse(index)}
                      className={`p-4 rounded-xl font-bold text-lg border-2 transition-all ${
                        selectedHorse === index
                          ? 'bg-green-600/30 border-green-400 scale-105'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:scale-102'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{horse.emoji}</span>
                        <span>{horse.name}</span>
                        <span className="text-sm opacity-70">#{index + 1}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Race Track */}
            {(racing || winner !== null) && (
              <div className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-center">
                  {racing ? "🏁 Racing..." : "🏆 Race Finished!"}
                </h2>
                <div className="space-y-3">
                  {HORSES.map((horse, index) => {
                    const progress = Math.min(raceProgress[index], 100);
                    const isWinner = winner === index;
                    const isSelected = selectedHorse === index;
                    
                    return (
                      <div key={index} className="relative">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{horse.emoji}</span>
                          <span className="text-sm font-bold">{horse.name}</span>
                          {isWinner && <span className="text-yellow-400">👑</span>}
                          {isSelected && <span className="text-green-400">⭐</span>}
                        </div>
                        <div className="h-8 bg-zinc-800 rounded-lg overflow-hidden border border-white/10">
                          <div 
                            className={`h-full transition-all duration-100 ${
                              isWinner ? 'bg-gradient-to-r from-yellow-500 to-amber-500' :
                              isSelected ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                              'bg-gradient-to-r from-zinc-600 to-zinc-700'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!racing && !gameResult && (
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
                    onClick={() => startRace(false)}
                    disabled={selectedHorse === null}
                    className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                      selectedHorse === null
                        ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                        : 'bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 hover:from-green-500 hover:via-emerald-400 hover:to-green-500 hover:scale-105'
                    }`}
                  >
                    🏁 START RACE ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
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
                      Max win: {((Number(betAmount) || MIN_BET) * 5).toLocaleString()} MLEO (×5)
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Race ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Pick your horse • Watch the race • Win ×5 if your horse wins!
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-green-500" 
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
              <div className="text-xs opacity-70 mb-1">Total Races</div>
              <div className="text-lg font-bold">{stats.totalRaces.toLocaleString()}</div>
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
              <li>• <strong>Choose Horse:</strong> Select which horse you think will win (1-5)</li>
              <li>• <strong>Place Bet:</strong> Set your bet amount and start the race</li>
              <li>• <strong>Watch Race:</strong> All 5 horses race to the finish line</li>
              <li>• <strong>Win:</strong> If your horse wins, get ×5 your bet!</li>
              <li>• <strong>Lose:</strong> If another horse wins, you lose your bet</li>
              <li>• <strong>Fair Racing:</strong> Each horse has equal chance - pure luck!</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per race</li>
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
                {gameResult.win ? "🏆 You Win! 🏆" : "😞 You Lose"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Winner: {HORSES[gameResult.winnerIndex].emoji} {gameResult.winnerName}
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    (×5)
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

