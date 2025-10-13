// ============================================================================
// MLEO Slots Upgraded - 5 Reels, Massive Wins!
// Cost: 1000 MLEO per spin
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_slots_upgraded_v1";
const MIN_BET = 1000;

// Slot symbols
const SYMBOLS = ['💎', '⭐', '🍒', '🍋', '🍊', '🍉', '🎰', '7️⃣', '🔔'];

// Payouts (5 reels)
const PAYOUTS = {
  '💎': { 5: 500, 4: 100, 3: 20 },   // Diamond - Best
  '7️⃣': { 5: 200, 4: 50, 3: 15 },   // Seven
  '⭐': { 5: 100, 4: 30, 3: 10 },    // Star
  '🔔': { 5: 80, 4: 20, 3: 8 },      // Bell
  '🎰': { 5: 60, 4: 15, 3: 6 },      // Slot Machine
  '🍒': { 5: 40, 4: 10, 3: 5 },      // Cherry
  '🍉': { 5: 30, 4: 8, 3: 4 },       // Watermelon
  '🍊': { 5: 20, 4: 6, 3: 3 },       // Orange
  '🍋': { 5: 15, 4: 5, 3: 2 }        // Lemon
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

// Generate random reels
function spinReels() {
  return [
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  ];
}

// Check for wins
function checkWin(reels) {
  const firstSymbol = reels[0];
  let matchCount = 1;
  
  for (let i = 1; i < reels.length; i++) {
    if (reels[i] === firstSymbol) {
      matchCount++;
    } else {
      break;
    }
  }

  if (matchCount >= 3 && PAYOUTS[firstSymbol]) {
    return {
      win: true,
      symbol: firstSymbol,
      count: matchCount,
      multiplier: PAYOUTS[firstSymbol][matchCount] || 0
    };
  }

  return { win: false, multiplier: 0 };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function SlotsUpgradedPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [reels, setReels] = useState(['🎰', '🎰', '🎰', '🎰', '🎰']);
  const [spinning, setSpinning] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalSpins: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, jackpots: 0, lastBet: MIN_BET })
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
    startSpin(true);
  };

  const startSpin = (isFreePlayParam = false) => {
    if (spinning) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/slots-upgraded', undefined, { shallow: true });
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
    setSpinning(true);
    setGameResult(null);

    // Spinning animation
    let spinCount = 0;
    const spinInterval = setInterval(() => {
      setReels(spinReels());
      spinCount++;
      if (spinCount >= 15) {
        clearInterval(spinInterval);
        const finalReels = spinReels();
        setReels(finalReels);
        setSpinning(false);
        checkGameResult(finalReels);
      }
    }, 100);
  };

  const checkGameResult = (finalReels) => {
    const winCheck = checkWin(finalReels);

    let prize = 0;
    if (winCheck.win) {
      prize = currentBet * winCheck.multiplier;
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: winCheck.win,
      symbol: winCheck.symbol,
      count: winCheck.count,
      multiplier: winCheck.multiplier,
      prize: prize,
      profit: winCheck.win ? prize - currentBet : -currentBet,
      jackpot: winCheck.symbol === '💎' && winCheck.count === 5
    };

    setGameResult(resultData);

    const newStats = {
      ...stats,
      totalSpins: stats.totalSpins + 1,
      totalBet: stats.totalBet + currentBet,
      wins: winCheck.win ? stats.wins + 1 : stats.wins,
      totalWon: winCheck.win ? stats.totalWon + prize : stats.totalWon,
      totalLost: !winCheck.win ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, winCheck.win ? prize : 0),
      jackpots: resultData.jackpot ? stats.jackpots + 1 : stats.jackpots,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setSpinning(false);
    
    setTimeout(() => {
      startSpin();
    }, 100);
  };

  const resetToSetup = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setSpinning(false);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-yellow-900 via-black to-amber-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-yellow-900 via-black to-amber-900 text-white">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-6">
            {spinning || gameResult ? (
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
                🎰 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Slots Upgraded
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "5 Reels of Fortune!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Slot Machine Display */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold mb-6">🎰 The Reels</h2>
              
              {/* 5 Reels */}
              <div className="flex justify-center gap-2 mb-6 max-w-3xl mx-auto">
                {reels.map((symbol, idx) => (
                  <div 
                    key={idx} 
                    className={`flex-1 aspect-square max-w-28 rounded-2xl border-4 border-yellow-600 bg-gradient-to-br from-zinc-900 to-black flex items-center justify-center ${
                      spinning ? 'animate-pulse' : ''
                    }`}
                  >
                    <div className="text-6xl">{symbol}</div>
                  </div>
                ))}
              </div>

              {/* Win Line */}
              {gameResult && gameResult.win && (
                <div className="text-center mb-4">
                  <div className="text-2xl font-bold text-yellow-400 animate-pulse">
                    {gameResult.symbol} × {gameResult.count} = ×{gameResult.multiplier}!
                  </div>
                </div>
              )}

              {spinning && (
                <div className="text-xl font-bold text-yellow-400 animate-pulse">
                  🎰 Spinning...
                </div>
              )}
            </div>

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!spinning && !gameResult && (
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
                    onClick={() => startSpin(false)}
                    disabled={false}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600 hover:from-yellow-500 hover:via-amber-400 hover:to-yellow-500 hover:scale-105"
                  >
                    🎰 SPIN ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" 
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
                      Jackpot: {((Number(betAmount) || MIN_BET) * 500).toLocaleString()} MLEO (💎💎💎💎💎)
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 Spin Again ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Match 3, 4 or 5 symbols • Left to right • Jackpot: 5 Diamonds!
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-yellow-500" 
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

          {/* PAYTABLE */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">💰 Paytable (Multipliers)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              {Object.entries(PAYOUTS).map(([symbol, pays]) => (
                <div key={symbol} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                  <div className="text-2xl mb-2">{symbol}</div>
                  <div className="space-y-1 text-xs">
                    <div>5 in row: <span className="text-yellow-400 font-bold">×{pays[5]}</span></div>
                    <div>4 in row: <span className="text-green-400 font-bold">×{pays[4]}</span></div>
                    <div>3 in row: <span className="text-blue-400 font-bold">×{pays[3]}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Spins</div>
              <div className="text-lg font-bold">{stats.totalSpins.toLocaleString()}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">💎 Jackpots</div>
              <div className="text-lg font-bold text-amber-400">{stats.jackpots}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>5 Reels:</strong> Advanced slot machine with 5 symbol reels</li>
              <li>• <strong>Match Symbols:</strong> Get 3, 4 or 5 matching symbols left-to-right</li>
              <li>• <strong>Bigger Matches:</strong> More symbols = bigger multipliers!</li>
              <li>• <strong>💎 Diamond:</strong> Best symbol - 5 diamonds = ×500 JACKPOT!</li>
              <li>• <strong>7️⃣ Lucky Seven:</strong> Second best - up to ×200</li>
              <li>• <strong>⭐ Star & 🔔 Bell:</strong> Premium symbols - up to ×100</li>
              <li>• <strong>🎰 & Fruits:</strong> Regular symbols with good payouts</li>
              <li>• <strong>Pure Chance:</strong> Every spin is random and fair</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per spin</li>
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
                gameResult.jackpot
                  ? "bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.jackpot ? "💎 JACKPOT! 💎" : gameResult.win ? "🎰 Winner! 🎰" : "🎰 No Match"}
              </div>
              {gameResult.win && (
                <>
                  <div className="text-base mb-2 text-white/90 font-semibold">
                    {gameResult.symbol} × {gameResult.count} = ×{gameResult.multiplier}
                  </div>
                  <div className="space-y-1">
                    <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                      +{fmt(gameResult.prize)} MLEO
                    </div>
                  </div>
                </>
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

