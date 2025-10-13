// ============================================================================
// MLEO Craps - Dice Game
// Cost: 1000 MLEO per roll
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_craps_v1";
const MIN_BET = 1000; // Minimum bet amount

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
function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1
  ];
}

function getDiceSum(dice) {
  return dice[0] + dice[1];
}

function isNatural(sum) {
  return [7, 11].includes(sum);
}

function isCraps(sum) {
  return [2, 3, 12].includes(sum);
}

function isPoint(sum) {
  return [4, 5, 6, 8, 9, 10].includes(sum);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CrapsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [playing, setPlaying] = useState(false);
  const [dice, setDice] = useState([1, 1]);
  const [diceSum, setDiceSum] = useState(2);
  const [point, setPoint] = useState(null);
  const [rollCount, setRollCount] = useState(0);
  const [result, setResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalRounds: 0, totalBet: 0, totalWon: 0, biggestWin: 0, wins: 0, lastBet: MIN_BET })
  );

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
    startGame(true);
  };

  const startGame = (isFreePlayParam = false) => {
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/craps', undefined, { shallow: true });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        setResult({ error: true, message: `Minimum bet is ${MIN_BET} MLEO!` });
        return;
      }
      
      if (currentVault < bet) {
        setResult({ error: true, message: "Not enough MLEO!" });
        return;
      }

      const newVault = currentVault - bet;
      setVault(newVault);
      setVaultState(newVault);
    }
    
    setCurrentBet(bet);
    setPlaying(true);
    setResult(null);
    setPoint(null);
    setRollCount(0);
    setDice([1, 1]);
    setDiceSum(2);

    // Roll dice
    setTimeout(() => {
      performRoll();
    }, 500);
  };

  const performRoll = () => {
    const newDice = rollDice();
    const newSum = getDiceSum(newDice);
    
    setDice(newDice);
    setDiceSum(newSum);
    setRollCount(prev => prev + 1);

    // Simple craps logic
    let prize = 0;
    let isWin = false;
    let message = '';

    if (isNatural(newSum)) {
      // Win on 7 or 11
      prize = currentBet * 2;
      isWin = true;
      message = `🎉 Natural Win! (${newSum})`;
      endGame(isWin, newSum, prize, message);
    } else if (isCraps(newSum)) {
      // Lose on 2, 3, or 12
      message = `💥 Craps! You Lose (${newSum})`;
      endGame(false, newSum, 0, message);
    } else {
      // Point numbers - need to roll again
      setPoint(newSum);
      message = `🎯 Point: ${newSum} - Roll Again!`;
      
      // End game after 3 rolls max
      if (rollCount >= 2) {
        if (newSum === point) {
          prize = currentBet * 2;
          isWin = true;
          message = `🎉 Point Made! (${newSum})`;
        } else {
          message = `💥 Point Missed! (${newSum})`;
        }
        endGame(isWin, newSum, prize, message);
      }
    }
  };

  const endGame = (isWin, sum, prize, message) => {
    setPlaying(false);

    if (isWin) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: isWin,
      message: message,
      dice: dice,
      sum: sum,
      prize: prize,
      point: point
    };

    setResult(resultData);

    // Update stats
    const newStats = {
      ...stats,
      totalRounds: stats.totalRounds + 1,
      totalBet: stats.totalBet + currentBet,
      wins: isWin ? stats.wins + 1 : stats.wins,
      totalWon: isWin ? stats.totalWon + prize : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, isWin ? prize : 0),
      lastBet: currentBet
    };
    setStats(newStats);
  };

  const resetGame = () => {
    setResult(null);
    setPlaying(false);
    setDice([1, 1]);
    setDiceSum(2);
    setPoint(null);
    setRollCount(0);
    startGame();
  };

  const quickBet = (amount) => {
    setBetAmount(amount.toString());
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
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>

            <div className="text-center">
              <h1 className="text-3xl font-bold mb-1">
                🎲 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                MLEO Craps
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Roll the dice and win big!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Game Table */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🎲 Craps Table</h2>
              
              {/* Dice Display */}
              <div className="text-center mb-8">
                <div className="text-6xl mb-4">
                  {dice[0]} {dice[1]}
                </div>
                <div className="text-3xl font-bold text-white">
                  Sum: {diceSum}
                </div>
                {point && (
                  <div className="text-xl text-yellow-400 mt-2">
                    Point: {point}
                  </div>
                )}
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
                  {result.message}
                </div>
                <div className="text-xl mb-2">
                  Dice: {result.dice[0]} + {result.dice[1]} = {result.sum}
                </div>
                {result.win && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(result.prize)} MLEO
                  </div>
                )}
                {!result.win && (
                  <div className="text-xl text-red-400">
                    Lost {fmt(currentBet)} MLEO
                  </div>
                )}
              </div>
            )}

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!playing && !result && (
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
                    onClick={startGame}
                    disabled={false}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 hover:scale-105"
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
                      Max win: {((Number(betAmount) || MIN_BET) * 2).toLocaleString()} MLEO
                    </div>
                  </div>
                </>
              )}

              {playing && !result && (
                <div className="flex gap-3 justify-center mb-6 flex-wrap">
                  <button
                    onClick={performRoll}
                    className="px-8 py-3 rounded-xl font-bold text-lg text-white transition-all bg-green-600 hover:bg-green-700"
                  >
                    ROLL AGAIN
                  </button>
                </div>
              )}

              {result && (
                <>
                  <button
                    onClick={resetGame}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 hover:scale-105"
                  >
                    🎲 New Game ({fmt(Number(betAmount) || MIN_BET)})
                  </button>
                  
                  {/* Bet Amount Input after game */}
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
                      Max win: {((Number(betAmount) || MIN_BET) * 2).toLocaleString()} MLEO
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* STATS WINDOWS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-lg font-bold text-emerald-400">{fmt(vault)} MLEO</div>
              <button 
                onClick={refreshVault}
                className="text-emerald-400 hover:text-emerald-300 text-xs underline"
              >
                Refresh
              </button>
            </div>
            
            <div className="rounded-xl p-4 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/30">
              <div className="text-xs opacity-70 mb-1">Total Rounds</div>
              <div className="text-lg font-bold text-blue-400">{stats.totalRounds}</div>
            </div>
            
            <div className="rounded-xl p-4 bg-gradient-to-br from-green-600/20 to-emerald-600/20 border border-green-500/30">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)} MLEO</div>
            </div>
            
            <div className="rounded-xl p-4 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 border border-yellow-500/30">
              <div className="text-xs opacity-70 mb-1">Wins</div>
              <div className="text-lg font-bold text-yellow-400">{stats.wins}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-xl p-6 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 border border-yellow-500/30">
            <h3 className="text-lg font-bold text-yellow-300 mb-4">How to Play</h3>
            <div className="text-sm text-zinc-300 space-y-2">
              <p><strong>Natural Win:</strong> Roll 7 or 11 for immediate win (×2 payout)</p>
              <p><strong>Craps:</strong> Roll 2, 3, or 12 for immediate loss</p>
              <p><strong>Point Numbers:</strong> Roll 4, 5, 6, 8, 9, or 10 to establish a point</p>
              <p><strong>Point Win:</strong> Roll the same number again before rolling 7 (×2 payout)</p>
              <p><strong>Point Loss:</strong> Roll 7 before matching the point number</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}