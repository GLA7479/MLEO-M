// ============================================================================
// MLEO Hi-Lo - Card Prediction Game
// Cost: 1000 MLEO per game
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_hilo_v1";
const MIN_BET = 1000; // Minimum bet amount

const CARD_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const CARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const CARD_SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': 'black', '♥': 'red', '♦': 'red', '♣': 'black' };

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
function drawCard() {
  const rank = CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)];
  const suit = CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)];
  return { rank, suit, value: CARD_VALUES[rank] };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function HiLoPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [playing, setPlaying] = useState(false);
  const [currentCard, setCurrentCard] = useState(null);
  const [nextCard, setNextCard] = useState(null);
  const [streak, setStreak] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [result, setResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalGames: 0, totalBet: 0, totalWon: 0, biggestWin: 0, longestStreak: 0, lastBet: MIN_BET })
  );

  const correctSound = useRef(null);
  const wrongSound = useRef(null);
  const winSound = useRef(null);

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    // Load last bet amount
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) {
      setBetAmount(String(savedStats.lastBet));
    }
    
    if (typeof Audio !== "undefined") {
      correctSound.current = new Audio("/sounds/success.mp3");
      wrongSound.current = new Audio("/sounds/click.mp3");
      winSound.current = new Audio("/sounds/success.mp3");
    }
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startGame = () => {
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/hilo', undefined, { shallow: true });
      } else {
        setResult({ error: true, message: 'No free play tokens available!' });
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        setResult({ error: true, message: `Minimum bet is ${MIN_BET} MLEO!` });
        return;
      }
      
      const currentVault = getVault();
      if (currentVault < bet) {
        setResult({ error: true, message: "Not enough MLEO!" });
        return;
      }

      // Deduct cost
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setCurrentBet(bet); // Store bet amount for prize calculations

    // Start game
    const card = drawCard();
    setCurrentCard(card);
    setNextCard(null);
    setStreak(0);
    setMultiplier(1);
    setPlaying(true);
    setResult(null);
  };

  const makeGuess = async (isHigher) => {
    if (!playing) return;

    const next = drawCard();
    setNextCard(next);

    // Wait for card flip animation
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check guess
    let correct = false;
    if (isHigher && next.value > currentCard.value) {
      correct = true;
    } else if (!isHigher && next.value < currentCard.value) {
      correct = true;
    } else if (next.value === currentCard.value) {
      // Equal - player gets to continue (considered correct)
      correct = true;
    }

    if (correct) {
      if (correctSound.current) {
        correctSound.current.currentTime = 0;
        correctSound.current.play().catch(() => {});
      }

      const newStreak = streak + 1;
      const newMultiplier = 1 + (newStreak * 0.3); // +30% per correct guess
      
      setStreak(newStreak);
      setMultiplier(newMultiplier);
      setCurrentCard(next);
      setNextCard(null);
      
      setResult({ 
        correct: true, 
        message: "Correct!", 
        streak: newStreak,
        multiplier: newMultiplier
      });
    } else {
      if (wrongSound.current) {
        wrongSound.current.currentTime = 0;
        wrongSound.current.play().catch(() => {});
      }

      setPlaying(false);
      setResult({ 
        correct: false, 
        message: "Wrong!", 
        finalStreak: streak
      });
      
      setStats(s => ({
        ...s,
        totalGames: s.totalGames + 1,
        totalBet: (s.totalBet || 0) + currentBet,
        longestStreak: Math.max(s.longestStreak, streak),
        lastBet: currentBet
      }));
    }
  };

  const cashout = () => {
    if (!playing || streak === 0) return;

    if (winSound.current) {
      winSound.current.currentTime = 0;
      winSound.current.play().catch(() => {});
    }

    const prize = Math.floor(currentBet * multiplier);
    const newVault = getVault() + prize;
    setVault(newVault);
    setVaultState(newVault);
    
    setPlaying(false);
    setResult({ 
      cashout: true, 
      prize,
      finalStreak: streak
    });
    
    setStats(s => ({
      totalGames: s.totalGames + 1,
      totalBet: (s.totalBet || 0) + currentBet,
      totalWon: s.totalWon + prize,
      biggestWin: Math.max(s.biggestWin, prize),
      longestStreak: Math.max(s.longestStreak, streak),
      lastBet: currentBet
    }));
  };

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Hi-Lo</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout isGame={true} title="MLEO Hi-Lo 🃏">
      <main className="min-h-[100svh] bg-gradient-to-b from-green-950 via-emerald-950 to-black text-zinc-100">
        <div className="max-w-4xl mx-auto p-4 pb-20">
          
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🃏</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  MLEO Hi-Lo
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Guess Higher or Lower!</div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* HI-LO GAME - Main Window */}
          <div className="rounded-3xl p-8 bg-gradient-to-br from-green-900/30 via-emerald-900/20 to-teal-900/30 border-4 border-green-600/50 shadow-2xl mb-6">
            
            {!playing && !currentCard ? (
              // Start Screen
              <div className="text-center py-12">
                <div className="text-6xl mb-6">🃏</div>
                <h2 className="text-2xl font-bold mb-4">Ready to play?</h2>
                <p className="text-sm opacity-70 mb-6">
                  Guess if the next card is Higher or Lower!<br/>
                  Each correct guess increases your multiplier by 30%
                </p>

                <button
                  onClick={() => startGame(false)}
                  disabled={vault < (Number(betAmount) || MIN_BET)}
                  className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 ${
                    vault < (Number(betAmount) || MIN_BET)
                      ? "bg-zinc-700 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 hover:scale-105"
                  }`}
                >
                  🃏 START ({fmt(Number(betAmount) || MIN_BET)})
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
                    Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Current Prize */}
                <div className="text-center mb-6">
                  <div className="text-sm opacity-70 mb-1">Current Prize</div>
                  <div className="text-4xl font-bold text-green-400">
                    {fmt(Math.floor(currentBet * multiplier))} MLEO
                  </div>
                  <div className="text-lg opacity-70">×{multiplier.toFixed(2)} • Streak: {streak}</div>
                </div>

                {/* Cards */}
                <div className="flex justify-center gap-8 mb-8">
                  {/* Current Card */}
                  {currentCard && (
                    <div className="relative">
                      <div className="w-32 h-44 rounded-xl bg-white border-4 border-gray-300 flex flex-col items-center justify-center text-center shadow-2xl">
                        <div className={`text-6xl font-bold ${SUIT_COLORS[currentCard.suit] === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
                          {currentCard.rank}
                        </div>
                        <div className={`text-4xl ${SUIT_COLORS[currentCard.suit] === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
                          {currentCard.suit}
                        </div>
                      </div>
                      <div className="text-center mt-2 text-sm opacity-70">Current</div>
                    </div>
                  )}

                  {/* Next Card (or back) */}
                  <div className="relative">
                    {nextCard ? (
                      <div className="w-32 h-44 rounded-xl bg-white border-4 border-gray-300 flex flex-col items-center justify-center text-center shadow-2xl animate-flip">
                        <div className={`text-6xl font-bold ${SUIT_COLORS[nextCard.suit] === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
                          {nextCard.rank}
                        </div>
                        <div className={`text-4xl ${SUIT_COLORS[nextCard.suit] === 'red' ? 'text-red-600' : 'text-gray-900'}`}>
                          {nextCard.suit}
                        </div>
                      </div>
                    ) : (
                      <div className="w-32 h-44 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 border-4 border-blue-500 flex items-center justify-center shadow-2xl">
                        <div className="text-4xl">🃏</div>
                      </div>
                    )}
                    <div className="text-center mt-2 text-sm opacity-70">Next</div>
                  </div>
                </div>

                {/* Result Message */}
                {result && (
                  <div className={`text-center mb-6 p-4 rounded-xl border-2 ${
                    result.error
                      ? "bg-red-900/30 border-red-500"
                      : result.cashout
                      ? "bg-green-900/30 border-green-500"
                      : result.correct
                      ? "bg-blue-900/30 border-blue-500"
                      : "bg-red-900/30 border-red-500"
                  }`}>
                    <div className="text-2xl font-bold mb-2">{result.message}</div>
                    {result.prize && (
                      <div className="text-3xl font-bold text-green-400">
                        +{fmt(result.prize)} MLEO
                      </div>
                    )}
                    {result.finalStreak !== undefined && (
                      <div className="text-sm opacity-70 mt-1">
                        Final Streak: {result.finalStreak}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {playing ? (
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => makeGuess(false)}
                      className="px-8 py-4 rounded-xl font-bold text-xl text-white bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 shadow-lg"
                    >
                      ⬇️ LOWER
                    </button>
                    
                    {streak > 0 && (
                      <button
                        onClick={cashout}
                        className="px-6 py-4 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 shadow-lg"
                      >
                        💰 CASH OUT
                      </button>
                    )}
                    
                    <button
                      onClick={() => makeGuess(true)}
                      className="px-8 py-4 rounded-xl font-bold text-xl text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 shadow-lg"
                    >
                      ⬆️ HIGHER
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <button
                      onClick={() => startGame(false)}
                      disabled={vault < (Number(betAmount) || MIN_BET)}
                      className={`px-8 py-3 rounded-xl font-bold text-lg text-white transition-all mb-6 ${
                        vault < (Number(betAmount) || MIN_BET)
                          ? "bg-zinc-700 cursor-not-allowed opacity-50"
                          : "bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400"
                      }`}
                    >
                      🔄 Play Again ({fmt(Number(betAmount) || MIN_BET)})
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
                        Max win: {((Number(betAmount) || MIN_BET) * 10).toLocaleString()} MLEO
                      </div>
                    </div>
                  </div>
                )}
              </>
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
              <div className="text-xs opacity-70 mb-1">Current Streak</div>
              <div className="text-lg font-bold text-amber-400">{streak}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Longest Streak</div>
              <div className="text-lg font-bold text-purple-400">{stats.longestStreak}</div>
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• A card is shown - guess if the next card is Higher or Lower</li>
              <li>• Each correct guess increases your multiplier by 30%</li>
              <li>• If cards are equal, you automatically win</li>
              <li>• Cash out anytime to collect your current prize</li>
              <li>• Wrong guess = lose everything</li>
              <li>• Build long streaks for massive multipliers!</li>
            </ul>
          </div>

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-emerald-900/20 to-green-900/20 border border-emerald-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm opacity-70">Games Played</div>
                <div className="text-2xl font-bold">{stats.totalGames}</div>
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
                <div className="text-sm opacity-70">Longest Streak</div>
                <div className="text-2xl font-bold text-purple-400">{stats.longestStreak}</div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}

