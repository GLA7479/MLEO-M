// ============================================================================
// MLEO Roulette - Wheel Game
// Cost: 1000 MLEO per spin
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken as consumeFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_roulette_v1";
const MIN_BET = 1000; // Minimum bet amount

// Roulette numbers with colors
const ROULETTE_NUMBERS = [
  { number: 0, color: "green" },
  { number: 1, color: "red" },
  { number: 2, color: "black" },
  { number: 3, color: "red" },
  { number: 4, color: "black" },
  { number: 5, color: "red" },
  { number: 6, color: "black" },
  { number: 7, color: "red" },
  { number: 8, color: "black" },
  { number: 9, color: "red" },
  { number: 10, color: "black" },
  { number: 11, color: "black" },
  { number: 12, color: "red" },
  { number: 13, color: "black" },
  { number: 14, color: "red" },
  { number: 15, color: "black" },
  { number: 16, color: "red" },
  { number: 17, color: "black" },
  { number: 18, color: "red" },
  { number: 19, color: "red" },
  { number: 20, color: "black" },
  { number: 21, color: "red" },
  { number: 22, color: "black" },
  { number: 23, color: "red" },
  { number: 24, color: "black" },
  { number: 25, color: "red" },
  { number: 26, color: "black" },
  { number: 27, color: "red" },
  { number: 28, color: "black" },
  { number: 29, color: "black" },
  { number: 30, color: "red" },
  { number: 31, color: "black" },
  { number: 32, color: "red" },
  { number: 33, color: "black" },
  { number: 34, color: "red" },
  { number: 35, color: "black" },
  { number: 36, color: "red" }
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
  if (isNaN(n) || n === null || n === undefined) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

// ============================================================================
// GAME LOGIC
// ============================================================================
function spinWheel() {
  const randomIndex = Math.floor(Math.random() * ROULETTE_NUMBERS.length);
  return ROULETTE_NUMBERS[randomIndex];
}

function checkBet(winningNumber, betType, betValue) {
  const number = winningNumber.number;
  const color = winningNumber.color;
  
  let isWin = false;
  let multiplier = 1;
  
  switch (betType) {
    case "number":
      const numValue = parseInt(betValue);
      isWin = !isNaN(numValue) && number === numValue;
      multiplier = 36;
      break;
    case "red":
      isWin = color === "red";
      multiplier = 2;
      break;
    case "black":
      isWin = color === "black";
      multiplier = 2;
      break;
    case "green":
      isWin = color === "green";
      multiplier = 36;
      break;
    case "even":
      isWin = number !== 0 && number % 2 === 0;
      multiplier = 2;
      break;
    case "odd":
      isWin = number !== 0 && number % 2 === 1;
      multiplier = 2;
      break;
    case "low":
      isWin = number >= 1 && number <= 18;
      multiplier = 2;
      break;
    case "high":
      isWin = number >= 19 && number <= 36;
      multiplier = 2;
      break;
    default:
      return { isWin: false, multiplier: 1 };
  }
  
  return { isWin, multiplier };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function RoulettePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [playing, setPlaying] = useState(false);
  const [winningNumber, setWinningNumber] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [betType, setBetType] = useState("red"); // red, black, green, even, odd, low, high, number
  const [betValue, setBetValue] = useState(""); // For number bets
  const [selectedBets, setSelectedBets] = useState([]); // Array of selected bets
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalSpins: 0, totalBet: 0, totalWon: 0, biggestWin: 0, wins: 0, lastBet: MIN_BET })
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
    setIsFreePlay(true);
    setBetAmount("1000");
    setTimeout(() => startGame(), 100);
  };

  const toggleBet = (betType, betValue = null) => {
    // For number bets, validate the value
    if (betType === "number") {
      if (betValue === null || betValue === undefined || isNaN(betValue) || betValue < 0 || betValue > 36) {
        console.log("Invalid number bet:", betValue);
        return; // Don't add invalid number bets
      }
    }
    
    const betKey = betValue !== null ? `${betType}-${betValue}` : betType;
    const existingBet = selectedBets.find(bet => bet.key === betKey);
    
    if (existingBet) {
      // Remove bet
      setSelectedBets(selectedBets.filter(bet => bet.key !== betKey));
    } else {
      // Add bet
      const newBet = {
        key: betKey,
        type: betType,
        value: betValue,
        multiplier: betType === "number" || betType === "green" ? 36 : 2
      };
      setSelectedBets([...selectedBets, newBet]);
    }
  };

  const clearAllBets = () => {
    setSelectedBets([]);
  };

  const startGame = () => {
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (selectedBets.length === 0) {
      setGameResult({ error: true, message: "Please select at least one bet!" });
      return;
    }
    
    // Check if this is a free play
    if (isFreePlay) {
      const result = consumeFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/roulette', undefined, { shallow: true });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        setGameResult({ error: true, message: `Minimum bet is ${MIN_BET} MLEO!` });
        return;
      }
      
      const totalBet = bet * selectedBets.length;
      if (currentVault < totalBet) {
        setGameResult({ error: true, message: `Not enough MLEO! Need ${totalBet} MLEO for ${selectedBets.length} bets.` });
        return;
      }
    }

    // Validate number bets
    const numberBets = selectedBets.filter(bet => bet.type === "number");
    for (const numberBet of numberBets) {
      if (numberBet.value === null || numberBet.value === undefined || numberBet.value === "" || 
          isNaN(numberBet.value) || numberBet.value < 0 || numberBet.value > 36) {
        setGameResult({ error: true, message: "Please enter valid numbers (0-36) for number bets!" });
        return;
      }
    }

    // Deduct cost
    const newVault = currentVault - totalBet;
    setVault(newVault);
    setVaultState(newVault);
    setCurrentBet(bet);
    setGameActive(true);
    setGameResult(null);
    setWinningNumber(null);
    
    // Spin the wheel
    setTimeout(() => {
      const result = spinWheel();
      setWinningNumber(result);
      
      // Check all bets
      const betAmountNum = Number(betAmount) || MIN_BET;
      const betResults = selectedBets.map(bet => {
        const { isWin, multiplier } = checkBet(result, bet.type, bet.value);
        return {
          ...bet,
          isWin,
          multiplier,
          prize: isWin ? Math.floor(betAmountNum * multiplier) : 0
        };
      });
      
      endGame(result, betResults);
    }, 3000);
  };

  const endGame = (result, betResults) => {
    setGameActive(false);
    
    const winningBets = betResults.filter(bet => bet.isWin);
    const totalBet = (Number(betAmount) || 0) * (selectedBets.length || 0);
    const totalPrize = winningBets.reduce((sum, bet) => sum + (bet.prize || 0), 0);
    const netProfit = totalPrize - totalBet; // Net profit/loss
    
    let message = '';
    if (winningBets.length > 0) {
      message = `🎉 You Win! (${result.number}) - ${winningBets.length}/${selectedBets.length} bets won!`;
    } else {
      message = `💥 You Lose! (${result.number}) - 0/${selectedBets.length} bets won!`;
    }

    if (totalPrize > 0) {
      const newVault = getVault() + totalPrize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: winningBets.length > 0,
      winningNumber: result,
      prize: totalPrize,
      netProfit: netProfit,
      totalBet: totalBet,
      winningBets: winningBets,
      allBets: betResults,
      message: message,
      currentBet: currentBet
    };

    setGameResult(resultData);

    // Update stats
    const betAmountNum = Number(betAmount) || MIN_BET;
    const newStats = {
      ...stats,
      totalSpins: stats.totalSpins + 1,
      totalBet: stats.totalBet + totalBet,
      wins: winningBets.length > 0 ? stats.wins + 1 : stats.wins,
      totalWon: winningBets.length > 0 ? stats.totalWon + netProfit : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, winningBets.length > 0 ? netProfit : 0),
      lastBet: betAmountNum
    };
    setStats(newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setWinningNumber(null);
    setGameActive(false);
    // Don't clear selectedBets - keep them for next game
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
                🎯 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                MLEO Roulette
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Spin the wheel and win big!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Roulette Wheel */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🎯 Roulette Wheel</h2>
              
              {/* Wheel Display */}
              <div className="text-center mb-8">
                {/* Main Wheel */}
                <div className="relative mx-auto w-80 h-80 mb-6">
                  {/* Outer ring */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-600 to-yellow-800 p-3 shadow-2xl">
                    {/* Middle ring */}
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-amber-900 to-amber-950 p-4 relative overflow-hidden">
                      {/* Inner wheel with numbers */}
                      <div className={`w-full h-full rounded-full flex items-center justify-center relative transition-all duration-500 ${
                        gameActive ? "animate-spin" : ""
                      }`} style={{
                        animationDuration: gameActive ? "0.5s" : "0s",
                        animationIterationCount: gameActive ? "infinite" : "0",
                        animationTimingFunction: "linear"
                      }}>
                        {/* Number circles around the wheel - simplified layout */}
                        {[0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26].map((num, idx) => {
                          const angle = (idx * 360 / 37) * (Math.PI / 180);
                          const radius = 110;
                          const x = Math.cos(angle) * radius;
                          const y = Math.sin(angle) * radius;
                          const numData = ROULETTE_NUMBERS.find(n => n.number === num);
                          
                          return (
                            <div
                              key={idx}
                              className="absolute w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg border-2 border-white/30"
                              style={{
                                left: `calc(50% + ${x}px - 20px)`,
                                top: `calc(50% + ${y}px - 20px)`,
                                backgroundColor: numData.color === "red" ? "#DC2626" : numData.color === "black" ? "#1F2937" : "#059669",
                                zIndex: 10,
                                transform: `rotate(${angle * 180 / Math.PI}deg)`,
                                transformOrigin: 'center'
                              }}
                            >
                              <span style={{ transform: `rotate(${-angle * 180 / Math.PI}deg)` }}>{num}</span>
                            </div>
                          );
                        })}
                        
                        {/* Center circle */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 border-4 border-zinc-700 flex items-center justify-center shadow-2xl">
                            <span className="text-3xl">🎯</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Pointer arrow at top */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                    <div className="w-0 h-0 border-l-10 border-r-10 border-t-10 border-l-transparent border-r-transparent border-t-white drop-shadow-lg"></div>
                  </div>
                </div>
                
                {/* Winning Number Display */}
                {winningNumber && (
                  <div className="mt-8 mb-4">
                    <div className={`inline-flex items-center justify-center px-8 py-4 rounded-2xl shadow-2xl ${
                      winningNumber.color === "red" ? "bg-gradient-to-br from-red-600 to-red-800" : 
                      winningNumber.color === "black" ? "bg-gradient-to-br from-gray-800 to-black" : 
                      "bg-gradient-to-br from-green-600 to-green-800"
                    }`}>
                      <span className="text-5xl font-bold text-white">{winningNumber.number}</span>
                    </div>
                    <div className="text-xl text-gray-300 mt-3">
                      {winningNumber.color === "red" ? "🔴 Red" : winningNumber.color === "black" ? "⚫ Black" : "🟢 Green"}
                    </div>
                  </div>
                )}
                
                {!winningNumber && !gameActive && (
                  <div className="text-xl text-zinc-400 mt-4">
                    Place your bet and spin!
                  </div>
                )}
                
                {gameActive && (
                  <div className="text-2xl text-yellow-400 mt-4 animate-pulse">
                    🎰 Spinning...
                  </div>
                )}
              </div>
            </div>

            {/* Result Display */}
            {gameResult && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                gameResult.win
                  ? "bg-green-900/30 border-green-500"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">
                  {gameResult.message}
                </div>
                <div className="text-xl mb-2">
                  Total Bet: {fmt(gameResult.totalBet)} MLEO ({selectedBets.length} bets)
                </div>
                {gameResult.winningBets && gameResult.winningBets.length > 0 && (
                  <div className="text-lg mb-2">
                    Winning Bets: {gameResult.winningBets.map(bet => 
                      `${bet.type}${bet.value ? `(${bet.value})` : ''}`
                    ).join(', ')}
                  </div>
                )}
                {gameResult.win && gameResult.netProfit > 0 && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(gameResult.netProfit)} MLEO Profit
                  </div>
                )}
                {gameResult.win && gameResult.netProfit === 0 && (
                  <div className="text-2xl font-bold text-yellow-400">
                    Break Even - {fmt(gameResult.prize)} MLEO Returned
                  </div>
                )}
                {!gameResult.win && (
                  <div className="text-xl text-red-400">
                    Lost {fmt(gameResult.totalBet)} MLEO
                  </div>
                )}
                <div className="text-sm text-gray-400 mt-2">
                  Total Prize: {fmt(gameResult.prize)} MLEO | Net: {gameResult.netProfit >= 0 ? '+' : ''}{fmt(gameResult.netProfit)} MLEO
                </div>
              </div>
            )}

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!gameActive && !gameResult && (
                <>
                  {/* Selected Bets Display */}
                  {selectedBets.length > 0 && (
                    <div className="mb-6">
                      <div className="text-sm text-zinc-400 mb-3">Selected Bets ({selectedBets.length})</div>
                      <div className="flex flex-wrap gap-2 justify-center mb-4">
                        {selectedBets.map((bet, index) => (
                          <div
                            key={bet.key}
                            className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-bold flex items-center gap-2"
                          >
                            <span>{bet.type === "number" ? `Number ${bet.value}` : bet.type.charAt(0).toUpperCase() + bet.type.slice(1)}</span>
                            <span>(×{bet.multiplier})</span>
                            <button
                              onClick={() => toggleBet(bet.type, bet.value)}
                              className="text-red-300 hover:text-red-100"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={clearAllBets}
                        className="text-sm text-red-400 hover:text-red-300 underline"
                      >
                        Clear All
                      </button>
                    </div>
                  )}

                  {/* Bet Type Selection */}
                  <div className="mb-6">
                    <div className="text-sm text-zinc-400 mb-3">Choose Your Bets (Click to Add/Remove)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 justify-center">
                      <button
                        onClick={() => toggleBet("red")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "red")
                            ? "bg-red-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Red (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("black")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "black")
                            ? "bg-black text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Black (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("even")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "even")
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Even (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("odd")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "odd")
                            ? "bg-purple-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Odd (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("low")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "low")
                            ? "bg-green-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        1-18 (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("high")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "high")
                            ? "bg-orange-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        19-36 (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("green")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "green")
                            ? "bg-green-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        0 (×36)
                      </button>
                      <button
                        onClick={() => toggleBet("number")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "number")
                            ? "bg-yellow-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Number (×36)
                      </button>
                    </div>
                    
                    {/* Number Input for number bets - Always show */}
                    {(
                      <div className="mt-4">
                        <div className="text-sm text-zinc-400 mb-2">Enter specific number (0-36):</div>
                        <input
                          type="number"
                          min="0"
                          max="36"
                          value={betValue}
                          onChange={(e) => setBetValue(e.target.value)}
                          placeholder="Enter number (0-36)"
                          className="w-32 mx-auto rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <button
                          onClick={() => {
                            const numValue = parseInt(betValue);
                            if (betValue && !isNaN(numValue) && numValue >= 0 && numValue <= 36) {
                              toggleBet("number", numValue);
                              setBetValue("");
                            } else {
                              alert("Please enter a valid number between 0 and 36");
                            }
                          }}
                          className="ml-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 disabled:bg-gray-500 disabled:cursor-not-allowed"
                          disabled={!betValue || isNaN(parseInt(betValue)) || parseInt(betValue) < 0 || parseInt(betValue) > 36}
                        >
                          Add Number
                        </button>
                      </div>
                    )}
                  </div>

                  {freePlayTokens > 0 && selectedBets.length > 0 && (
                    <button
                      onClick={startFreePlay}
                      className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                    >
                      🎁 FREE PLAY ({freePlayTokens}/5)
                    </button>
                  )}

                  <button
                    onClick={startGame}
                    disabled={selectedBets.length === 0}
                    className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                      selectedBets.length === 0
                        ? "bg-gray-600 cursor-not-allowed"
                        : "bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 hover:scale-105"
                    }`}
                  >
                    🎯 SPIN WHEEL ({fmt(Number(betAmount) || MIN_BET)} × {selectedBets.length})
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
                      Max win: {selectedBets.length > 0 ? 
                        (selectedBets.reduce((sum, bet) => sum + (Number(betAmount) || MIN_BET) * bet.multiplier, 0)).toLocaleString() : 
                        ((Number(betAmount) || MIN_BET) * 2).toLocaleString()
                      } MLEO
                    </div>
                  </div>
                </>
              )}

              {gameActive && !gameResult && (
                <div className="text-center">
                  <div className="text-xl text-yellow-400 mb-4">Spinning the wheel...</div>
                </div>
              )}

              {gameResult && (
                <>
                  {/* Selected Bets Display after game */}
                  {selectedBets.length > 0 && (
                    <div className="mb-6">
                      <div className="text-sm text-zinc-400 mb-3">Selected Bets ({selectedBets.length})</div>
                      <div className="flex flex-wrap gap-2 justify-center mb-4">
                        {selectedBets.map((bet, index) => (
                          <div
                            key={bet.key}
                            className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-bold flex items-center gap-2"
                          >
                            <span>{bet.type === "number" ? `Number ${bet.value}` : bet.type.charAt(0).toUpperCase() + bet.type.slice(1)}</span>
                            <span>(×{bet.multiplier})</span>
                            <button
                              onClick={() => toggleBet(bet.type, bet.value)}
                              className="text-red-300 hover:text-red-100"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={clearAllBets}
                        className="text-sm text-red-400 hover:text-red-300 underline"
                      >
                        Clear All
                      </button>
                    </div>
                  )}

                  {/* Bet Type Selection after game */}
                  <div className="mb-6">
                    <div className="text-sm text-zinc-400 mb-3">Choose Your Bets (Click to Add/Remove)</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 justify-center">
                      <button
                        onClick={() => toggleBet("red")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "red")
                            ? "bg-red-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Red (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("black")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "black")
                            ? "bg-black text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Black (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("even")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "even")
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Even (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("odd")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "odd")
                            ? "bg-purple-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Odd (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("low")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "low")
                            ? "bg-green-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        1-18 (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("high")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "high")
                            ? "bg-orange-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        19-36 (×2)
                      </button>
                      <button
                        onClick={() => toggleBet("green")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "green")
                            ? "bg-green-500 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        0 (×36)
                      </button>
                      <button
                        onClick={() => toggleBet("number")}
                        className={`px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                          selectedBets.some(bet => bet.type === "number")
                            ? "bg-yellow-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Number (×36)
                      </button>
                    </div>
                    
                    {/* Number Input for number bets - Always show */}
                    {(
                      <div className="mt-4">
                        <div className="text-sm text-zinc-400 mb-2">Enter specific number (0-36):</div>
                        <input
                          type="number"
                          min="0"
                          max="36"
                          value={betValue}
                          onChange={(e) => setBetValue(e.target.value)}
                          placeholder="Enter number (0-36)"
                          className="w-32 mx-auto rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <button
                          onClick={() => {
                            const numValue = parseInt(betValue);
                            if (betValue && !isNaN(numValue) && numValue >= 0 && numValue <= 36) {
                              toggleBet("number", numValue);
                              setBetValue("");
                            } else {
                              alert("Please enter a valid number between 0 and 36");
                            }
                          }}
                          className="ml-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 disabled:bg-gray-500 disabled:cursor-not-allowed"
                          disabled={!betValue || isNaN(parseInt(betValue)) || parseInt(betValue) < 0 || parseInt(betValue) > 36}
                        >
                          Add Number
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={startGame}
                    disabled={selectedBets.length === 0}
                    className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                      selectedBets.length === 0
                        ? "bg-gray-600 cursor-not-allowed"
                        : "bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 hover:scale-105"
                    }`}
                  >
                    🎯 SPIN WHEEL ({fmt(Number(betAmount) || MIN_BET)} × {selectedBets.length})
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
                      Max win: {selectedBets.length > 0 ? 
                        (selectedBets.reduce((sum, bet) => sum + (Number(betAmount) || MIN_BET) * bet.multiplier, 0)).toLocaleString() : 
                        ((Number(betAmount) || MIN_BET) * 2).toLocaleString()
                      } MLEO
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
              <div className="text-xs opacity-70 mb-1">Total Spins</div>
              <div className="text-lg font-bold text-blue-400">{stats.totalSpins}</div>
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
              <p><strong>Red/Black:</strong> Bet on color (×2 payout)</p>
              <p><strong>Even/Odd:</strong> Bet on even or odd numbers (×2 payout)</p>
              <p><strong>1-18/19-36:</strong> Bet on low or high numbers (×2 payout)</p>
              <p><strong>0:</strong> Bet on zero (×36 payout)</p>
              <p><strong>Number:</strong> Bet on specific number 0-36 (×36 payout)</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
