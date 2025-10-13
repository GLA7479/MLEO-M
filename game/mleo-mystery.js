// ============================================================================
// MLEO Mystery Box - Choose Your Fortune!
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
const LS_KEY = "mleo_mystery_v1";
const MIN_BET = 1000;
const TOTAL_BOXES = 10;

// Prize distribution in boxes (multipliers)
const PRIZES = [0, 0.5, 1, 1, 2, 2, 5, 5, 10, 50];

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
export default function MysteryBoxPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [gameActive, setGameActive] = useState(false);
  const [boxes, setBoxes] = useState([]);
  const [selectedBox, setSelectedBox] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, jackpots: 0, lastBet: MIN_BET })
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
    startGame(true);
  };

  const startGame = (isFreePlayParam = false) => {
    if (gameActive) return;

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/mystery', undefined, { shallow: true });
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
    setGameActive(true);
    setGameResult(null);
    setSelectedBox(null);
    
    // Shuffle prizes into boxes
    const shuffledPrizes = [...PRIZES].sort(() => Math.random() - 0.5);
    setBoxes(shuffledPrizes);
  };

  const chooseBox = (index) => {
    if (!gameActive || gameResult || selectedBox !== null) return;

    setSelectedBox(index);
    const multiplier = boxes[index];
    const prize = Math.floor(currentBet * multiplier);
    const win = multiplier > 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: multiplier >= 1,
      multiplier: multiplier,
      prize: prize,
      profit: prize - currentBet,
      jackpot: multiplier === 50
    };

    setGameResult(resultData);
    setGameActive(false);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      totalBet: stats.totalBet + currentBet,
      wins: multiplier >= 1 ? stats.wins + 1 : stats.wins,
      totalWon: stats.totalWon + prize,
      totalLost: multiplier === 0 ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, prize),
      jackpots: multiplier === 50 ? stats.jackpots + 1 : stats.jackpots,
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setSelectedBox(null);
    setBoxes([]);
    setGameActive(false);
    
    setTimeout(() => {
      startGame();
    }, 100);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-amber-900 via-black to-amber-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-black to-amber-900 text-white">
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
                🎁 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                Mystery Box
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Choose a box and reveal your prize!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Game Area */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">
                {gameActive && !gameResult ? "🎁 Choose Your Mystery Box!" : "🎁 Mystery Boxes"}
              </h2>
              
              {/* Boxes Display */}
              {gameActive && (
                <div className="grid grid-cols-5 gap-3 max-w-2xl mx-auto">
                  {boxes.map((prize, index) => {
                    const isSelected = selectedBox === index;
                    const showPrize = gameResult && isSelected;
                    
                    return (
                      <button
                        key={index}
                        onClick={() => chooseBox(index)}
                        disabled={selectedBox !== null}
                        className={`aspect-square rounded-xl font-bold text-4xl border-2 transition-all ${
                          showPrize
                            ? prize >= 10 ? 'bg-gradient-to-br from-yellow-600 to-amber-700 border-yellow-400 animate-pulse'
                            : prize > 0 ? 'bg-gradient-to-br from-green-600 to-emerald-700 border-green-400'
                            : 'bg-gradient-to-br from-red-600 to-rose-700 border-red-400'
                            : isSelected 
                            ? 'bg-gradient-to-br from-amber-600 to-orange-700 border-amber-400 scale-110'
                            : 'bg-gradient-to-br from-purple-600 to-indigo-700 border-purple-400 hover:scale-105 cursor-pointer'
                        }`}
                      >
                        {showPrize ? (prize === 50 ? '💎' : prize >= 10 ? '🎉' : prize > 0 ? '✨' : '💀') : '🎁'}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Prize Reveal */}
              {gameResult && (
                <div className="mt-6 text-center">
                  <div className="text-sm opacity-70 mb-2">All Box Contents:</div>
                  <div className="flex justify-center gap-2 flex-wrap max-w-2xl mx-auto">
                    {boxes.map((prize, index) => (
                      <div key={index} className={`text-xs px-3 py-1 rounded-lg ${
                        selectedBox === index 
                          ? 'bg-amber-600/50 border-2 border-amber-400 font-bold'
                          : 'bg-zinc-800/30 border border-zinc-600'
                      }`}>
                        {prize === 50 ? '💎×50' : prize >= 10 ? `🎉×${prize}` : prize > 0 ? `×${prize}` : '💀×0'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Game Controls */}
            <div className="text-center mb-6">
              {!gameActive && !gameResult && (
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
                    onClick={() => startGame(false)}
                    disabled={false}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 hover:from-amber-500 hover:via-orange-400 hover:to-amber-500 hover:scale-105"
                  >
                    🎁 CHOOSE BOX ({fmt(Number(betAmount) || MIN_BET)})
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
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-amber-500" 
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
                      Max win: {((Number(betAmount) || MIN_BET) * 50).toLocaleString()} MLEO (💎 Jackpot!)
                    </div>
                  </div>
                </>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 transition-all mb-6 shadow-lg hover:scale-105 transform"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Pick 1 box from 10 • Prizes: ×0, ×0.5, ×1, ×2, ×5, ×10, 💎×50 Jackpot!
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
                  className="w-full rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-amber-500" 
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
              <div className="text-xs opacity-70 mb-1">💎 Jackpots</div>
              <div className="text-lg font-bold text-amber-400">{stats.jackpots}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Choose:</strong> Pick 1 mystery box from 10 available boxes</li>
              <li>• <strong>Prizes:</strong> Each box contains a different prize multiplier</li>
              <li>• <strong>Distribution:</strong> 2× ×0 (nothing), 2× ×0.5, 2× ×1, 2× ×2, 2× ×5, 1× ×10, 1× 💎×50 (JACKPOT!)</li>
              <li>• <strong>Instant Win:</strong> Prize is revealed immediately after choosing</li>
              <li>• <strong>All Boxes Shown:</strong> After picking, all box contents are revealed</li>
              <li>• <strong>Jackpot:</strong> 10% chance to find the ×50 diamond jackpot!</li>
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
                gameResult.jackpot
                  ? "bg-gradient-to-br from-yellow-500 to-amber-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.jackpot ? "💎 JACKPOT! 💎" : gameResult.win ? "🎉 You Win! 🎉" : gameResult.multiplier === 0.5 ? "😐 Half Back" : "💀 Nothing! 💀"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Multiplier: ×{gameResult.multiplier}
              </div>
              {gameResult.prize > 0 && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  {gameResult.profit > 0 && (
                    <div className="text-sm font-bold text-white/80">
                      Profit: +{fmt(gameResult.profit)} MLEO
                    </div>
                  )}
                </div>
              )}
              {gameResult.multiplier === 0 && (
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

