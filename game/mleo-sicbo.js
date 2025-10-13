// ============================================================================
// MLEO Sic Bo - Ancient Chinese Dice Game
// Cost: 1000 MLEO per game
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_sicbo_v1";
const MIN_BET = 1000;

// Bet types and their payouts
const BET_TYPES = {
  small: { name: "Small (4-10)", payout: 2, check: (sum) => sum >= 4 && sum <= 10 },
  big: { name: "Big (11-17)", payout: 2, check: (sum) => sum >= 11 && sum <= 17 },
  triple: { name: "Any Triple", payout: 30, check: (dice) => dice[0] === dice[1] && dice[1] === dice[2] },
  specific_triple_6: { name: "Triple 6s", payout: 50, check: (dice) => dice.every(d => d === 6) },
  total_11: { name: "Total 11", payout: 10, check: (sum) => sum === 11 },
  total_10: { name: "Total 10", payout: 12, check: (sum) => sum === 10 }
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
// MAIN COMPONENT
// ============================================================================
export default function SicBoPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [selectedBet, setSelectedBet] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [dice, setDice] = useState([1, 1, 1]);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, triples: 0, lastBet: MIN_BET })
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
    rollDice(true);
  };

  const rollDice = (isFreePlayParam = false) => {
    if (!selectedBet) {
      alert('Please select a bet type first!');
      return;
    }

    if (rolling) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/sicbo', undefined, { shallow: true });
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
    setRolling(true);
    setGameResult(null);

    // Animate dice rolling
    let rollCount = 0;
    const rollInterval = setInterval(() => {
      setDice([
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
      ]);
      rollCount++;
      
      if (rollCount >= 10) {
        clearInterval(rollInterval);
        // Final roll
        const finalDice = [
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1,
          Math.floor(Math.random() * 6) + 1
        ];
        setDice(finalDice);
        setRolling(false);
        checkResult(finalDice);
      }
    }, 100);
  };

  const checkResult = (finalDice) => {
    const sum = finalDice.reduce((a, b) => a + b, 0);
    const betType = BET_TYPES[selectedBet];
    
    let win = false;
    if (selectedBet === 'triple' || selectedBet === 'specific_triple_6') {
      win = betType.check(finalDice);
    } else {
      win = betType.check(sum);
    }

    const prize = win ? currentBet * betType.payout : 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const isTriple = finalDice[0] === finalDice[1] && finalDice[1] === finalDice[2];

    const resultData = {
      win: win,
      dice: finalDice,
      sum: sum,
      betType: betType.name,
      payout: betType.payout,
      prize: prize,
      profit: win ? prize - currentBet : -currentBet,
      triple: isTriple
    };

    setGameResult(resultData);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      totalBet: stats.totalBet + currentBet,
      wins: win ? stats.wins + 1 : stats.wins,
      totalWon: win ? stats.totalWon + prize : stats.totalWon,
      totalLost: !win ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, win ? prize : 0),
      triples: isTriple ? stats.triples + 1 : stats.triples,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setSelectedBet(null);
    setRolling(false);
    setDice([1, 1, 1]);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setSelectedBet(null);
    setRolling(false);
    setDice([1, 1, 1]);
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
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            {selectedBet || rolling || gameResult ? (
              <button 
                onClick={resetToSetup}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
              >
                BACK
              </button>
            ) : (
              <Link href="/arcade">
                <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                  BACK
                </button>
              </Link>
            )}

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">
                🎲 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Sic Bo
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Ancient Chinese dice game - bet and roll!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Dice Display */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold mb-4">🎲 Three Dice</h2>
              <div className="flex justify-center gap-3 mb-4">
                {dice.map((die, index) => (
                  <div key={index} className={`w-20 h-20 rounded-xl border-2 border-white/20 bg-white flex items-center justify-center text-4xl font-bold text-black ${
                    rolling ? 'animate-spin' : ''
                  }`}>
                    {die}
                  </div>
                ))}
              </div>
              {!rolling && gameResult && (
                <div className="text-lg font-bold">
                  Total: {dice.reduce((a, b) => a + b, 0)}
                </div>
              )}
            </div>

            {/* Bet Selection */}
            {!rolling && !gameResult && (
              <div className="mb-8">
                <h2 className="text-xl font-bold mb-4 text-center">Choose Your Bet</h2>
                <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
                  {Object.entries(BET_TYPES).map(([key, bet]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedBet(key)}
                      className={`p-4 rounded-xl font-bold text-base border-2 transition-all ${
                        selectedBet === key
                          ? 'bg-red-600/30 border-red-400 scale-105'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div>{bet.name}</div>
                      <div className="text-sm opacity-70 mt-1">×{bet.payout}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!rolling && !gameResult && (
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
                    onClick={() => rollDice(false)}
                    disabled={!selectedBet}
                    className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                      !selectedBet
                        ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                        : 'bg-gradient-to-r from-red-600 via-orange-500 to-red-600 hover:from-red-500 hover:via-orange-400 hover:to-red-500 hover:scale-105'
                    }`}
                  >
                    🎲 ROLL DICE ({fmt(Number(betAmount) || MIN_BET)})
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
                      Max win: {((Number(betAmount) || MIN_BET) * 50).toLocaleString()} MLEO (Triple 6s!)
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Choose bet type • Roll 3 dice • Match your bet to win!
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
              <div className="text-xs opacity-70 mb-1">Total Games</div>
              <div className="text-lg font-bold">{stats.totalGames.toLocaleString()}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">🎲 Triples</div>
              <div className="text-lg font-bold text-amber-400">{stats.triples}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Choose Bet:</strong> Select what you're betting on before rolling</li>
              <li>• <strong>Small (4-10):</strong> Total of 3 dice is 4-10 = ×2 payout</li>
              <li>• <strong>Big (11-17):</strong> Total of 3 dice is 11-17 = ×2 payout</li>
              <li>• <strong>Total 10/11:</strong> Exact total of 10 or 11 = ×12 or ×10 payout</li>
              <li>• <strong>Any Triple:</strong> All 3 dice show same number = ×30 payout</li>
              <li>• <strong>Triple 6s:</strong> All three 6s = ×50 JACKPOT!</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per game</li>
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
                gameResult.triple && gameResult.win
                  ? "bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.triple && gameResult.win ? "🎉 TRIPLE! 🎉" : gameResult.win ? "✅ You Win! ✅" : "❌ You Lose"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                🎲 {gameResult.dice.join(' + ')} = {gameResult.sum}
              </div>
              <div className="text-sm mb-2 text-white/80">
                Bet: {gameResult.betType}
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    (×{gameResult.payout})
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

