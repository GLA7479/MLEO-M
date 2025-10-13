// ============================================================================
// MLEO Baccarat - Card Game
// Cost: 1000 MLEO per hand
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_baccarat_v1";
const MIN_BET = 1000; // Minimum bet amount

const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value, emoji: `${value}${suit}` });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getBaccaratValue(card) {
  if (card.value === "A") return 1;
  if (["J", "Q", "K"].includes(card.value)) return 0;
  return parseInt(card.value);
}

function calculateBaccaratValue(hand) {
  let value = 0;
  for (const card of hand) {
    value += getBaccaratValue(card);
  }
  return value % 10; // Only the last digit counts
}

function dealInitialCards(deck) {
  const newDeck = [...deck];
  const playerHand = [newDeck.pop(), newDeck.pop()];
  const bankerHand = [newDeck.pop(), newDeck.pop()];
  
  return {
    playerHand,
    bankerHand,
    deck: newDeck
  };
}

function playBaccarat(playerHand, bankerHand, deck) {
  let newPlayerHand = [...playerHand];
  let newBankerHand = [...bankerHand];
  let newDeck = [...deck];
  
  const playerValue = calculateBaccaratValue(newPlayerHand);
  const bankerValue = calculateBaccaratValue(newBankerHand);
  
  // Natural win (8 or 9)
  if (playerValue >= 8 || bankerValue >= 8) {
    return { playerHand: newPlayerHand, bankerHand: newBankerHand, deck: newDeck };
  }
  
  // Player draws third card if value is 0-5
  if (playerValue <= 5) {
    newPlayerHand.push(newDeck.pop());
  }
  
  // Banker draws third card based on rules
  const finalPlayerValue = calculateBaccaratValue(newPlayerHand);
  const currentBankerValue = calculateBaccaratValue(newBankerHand);
  
  let shouldBankerDraw = false;
  
  if (newPlayerHand.length === 2) {
    // Player didn't draw third card
    shouldBankerDraw = currentBankerValue <= 5;
  } else {
    // Player drew third card
    const playerThirdCard = getBaccaratValue(newPlayerHand[2]);
    
    if (currentBankerValue <= 2) {
      shouldBankerDraw = true;
    } else if (currentBankerValue === 3) {
      shouldBankerDraw = playerThirdCard !== 8;
    } else if (currentBankerValue === 4) {
      shouldBankerDraw = [2, 3, 4, 5, 6, 7].includes(playerThirdCard);
    } else if (currentBankerValue === 5) {
      shouldBankerDraw = [4, 5, 6, 7].includes(playerThirdCard);
    } else if (currentBankerValue === 6) {
      shouldBankerDraw = [6, 7].includes(playerThirdCard);
    }
  }
  
  if (shouldBankerDraw) {
    newBankerHand.push(newDeck.pop());
  }
  
  return { playerHand: newPlayerHand, bankerHand: newBankerHand, deck: newDeck };
}

function determineWinner(playerHand, bankerHand) {
  const playerValue = calculateBaccaratValue(playerHand);
  const bankerValue = calculateBaccaratValue(bankerHand);
  
  if (playerValue > bankerValue) return "player";
  if (bankerValue > playerValue) return "banker";
  return "tie";
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function BaccaratPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [playing, setPlaying] = useState(false);
  const [playerHand, setPlayerHand] = useState([]);
  const [bankerHand, setBankerHand] = useState([]);
  const [deck, setDeck] = useState([]);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [betType, setBetType] = useState("player"); // player, banker, tie
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalHands: 0, totalBet: 0, totalWon: 0, biggestWin: 0, wins: 0, lastBet: MIN_BET })
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

  // Auto-hide result popup after 4 seconds
  useEffect(() => {
    if (gameResult && !gameResult.error) {
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
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/baccarat', undefined, { shallow: true });
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
      
      if (currentVault < bet) {
        setGameResult({ error: true, message: "Not enough MLEO!" });
        return;
      }

      const newVault = currentVault - bet;
      setVault(newVault);
      setVaultState(newVault);
    }
    
    setCurrentBet(bet);
    setGameActive(true);
    setGameResult(null);
    
    // Create and shuffle deck
    const newDeck = shuffleDeck(createDeck());
    setDeck(newDeck);
    
    // Deal initial cards
    const { playerHand: newPlayerHand, bankerHand: newBankerHand, deck: remainingDeck } = dealInitialCards(newDeck);
    setPlayerHand(newPlayerHand);
    setBankerHand(newBankerHand);
    setDeck(remainingDeck);
    
    // Play the game
    setTimeout(() => {
      const { playerHand: finalPlayerHand, bankerHand: finalBankerHand, deck: finalDeck } = playBaccarat(newPlayerHand, newBankerHand, remainingDeck);
      setPlayerHand(finalPlayerHand);
      setBankerHand(finalBankerHand);
      setDeck(finalDeck);
      
      const winner = determineWinner(finalPlayerHand, finalBankerHand);
      endGame(winner, finalPlayerHand, finalBankerHand);
    }, 2000);
  };

  const endGame = (winner, finalPlayerHand, finalBankerHand) => {
    setGameActive(false);
    
    const playerValue = calculateBaccaratValue(finalPlayerHand);
    const bankerValue = calculateBaccaratValue(finalBankerHand);
    
    let prize = 0;
    let isWin = false;
    let message = '';

    if (winner === betType) {
      if (winner === "player") {
        prize = Math.floor(currentBet * 2);
        isWin = true;
        message = "🎉 Player Wins!";
      } else if (winner === "banker") {
        prize = Math.floor(currentBet * 1.95);
        isWin = true;
        message = "🎉 Banker Wins!";
      } else if (winner === "tie") {
        prize = Math.floor(currentBet * 8);
        isWin = true;
        message = "🎉 Tie!";
      }
    } else {
      if (winner === "tie" && betType !== "tie") {
        message = "🤝 Tie - Bet Returned";
        prize = currentBet; // Return bet
      } else {
        message = `💥 ${winner === "player" ? "Player" : "Banker"} Wins!`;
      }
    }

    if (isWin || winner === "tie") {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: isWin,
      winner: winner,
      playerValue: playerValue,
      bankerValue: bankerValue,
      prize: prize,
      betType: betType
    };

    setGameResult(resultData);

    // Update stats
    const newStats = {
      ...stats,
      totalHands: stats.totalHands + 1,
      totalBet: stats.totalBet + currentBet,
      wins: isWin ? stats.wins + 1 : stats.wins,
      totalWon: isWin ? stats.totalWon + prize : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, isWin ? prize : 0),
      lastBet: currentBet
    };
    setStats(newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setPlayerHand([]);
    setBankerHand([]);
    setDeck([]);
    setGameActive(false);
    
    // Start new game immediately
    setTimeout(() => {
      startGame();
    }, 100);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const playerValue = calculateBaccaratValue(playerHand);
  const bankerValue = calculateBaccaratValue(bankerHand);

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
                🃏 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                MLEO Baccarat
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "Bet on Player, Banker, or Tie!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Game Table */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🃏 Baccarat Table</h2>
              
              {/* Player Section */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-blue-400">Player</h3>
                  <div className="text-sm opacity-70">
                    Value: {playerValue}
                  </div>
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {playerHand.map((card, index) => (
                    <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                      {card.emoji}
                    </div>
                  ))}
                </div>
              </div>

              {/* Banker Section */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-red-400">Banker</h3>
                  <div className="text-sm opacity-70">
                    Value: {bankerValue}
                  </div>
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {bankerHand.map((card, index) => (
                    <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                      {card.emoji}
                    </div>
                  ))}
                </div>
              </div>
            </div>


            {/* Game Controls */}
            <div className="text-center mb-6">
              {!gameActive && !gameResult && (
                <>
                  {/* Bet Type Selection */}
                  <div className="mb-6">
                    <div className="text-sm text-zinc-400 mb-3">Choose Your Bet</div>
                    <div className="flex gap-3 justify-center flex-wrap">
                      <button
                        onClick={() => setBetType("player")}
                        className={`px-6 py-3 rounded-xl font-bold text-lg transition-all ${
                          betType === "player"
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Player (×2)
                      </button>
                      <button
                        onClick={() => setBetType("banker")}
                        className={`px-6 py-3 rounded-xl font-bold text-lg transition-all ${
                          betType === "banker"
                            ? "bg-red-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Banker (×1.95)
                      </button>
                      <button
                        onClick={() => setBetType("tie")}
                        className={`px-6 py-3 rounded-xl font-bold text-lg transition-all ${
                          betType === "tie"
                            ? "bg-yellow-600 text-white"
                            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        }`}
                      >
                        Tie (×8)
                      </button>
                    </div>
                  </div>

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
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 hover:scale-105"
                  >
                    🃏 DEAL CARDS ({fmt(Number(betAmount) || MIN_BET)})
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
                      Max win: {((Number(betAmount) || MIN_BET) * (betType === "tie" ? 8 : betType === "banker" ? 1.95 : 2)).toLocaleString()} MLEO
                    </div>
                  </div>
                </>
              )}

              {gameActive && !gameResult && (
                <div className="text-center">
                  <div className="text-xl text-yellow-400 mb-4">Dealing cards...</div>
                </div>
              )}

              {gameResult && (
                <>
                  <button
                    onClick={resetGame}
                    className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-600 hover:from-green-500 hover:via-emerald-400 hover:to-teal-500 hover:scale-105"
                  >
                    🃏 New Game ({fmt(Number(betAmount) || MIN_BET)})
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
                      Max win: {((Number(betAmount) || MIN_BET) * (betType === "tie" ? 8 : betType === "banker" ? 1.95 : 2)).toLocaleString()} MLEO
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
              <div className="text-xs opacity-70 mb-1">Total Hands</div>
              <div className="text-lg font-bold text-blue-400">{stats.totalHands}</div>
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
              <p><strong>Player:</strong> Bet on player to win (×2 payout)</p>
              <p><strong>Banker:</strong> Bet on banker to win (×1.95 payout)</p>
              <p><strong>Tie:</strong> Bet on exact tie (×8 payout)</p>
              <p><strong>Card Values:</strong> A=1, 2-9=face value, 10/J/Q/K=0</p>
              <p><strong>Winning:</strong> Closest to 9 wins (only last digit counts)</p>
            </div>
          </div>
        </div>

        {/* FLOATING RESULT POPUP - Small compact display */}
        {gameResult && !gameResult.error && showResultPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div 
              className={`text-center p-4 rounded-xl border-2 transition-all duration-500 transform pointer-events-auto max-w-sm mx-4 ${
                showResultPopup ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
              } ${
                gameResult.win
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : gameResult.winner === "tie"
                  ? "bg-gradient-to-br from-yellow-600 to-orange-600 border-yellow-300 shadow-2xl shadow-yellow-500/70"
                  : "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {gameResult.win ? "🎉 You Win! 🎉" : gameResult.winner === "tie" ? "🤝 Tie! 🤝" : "💥 You Lose! 💥"}
              </div>
              <div className="text-base mb-2 text-white/90 font-semibold">
                Player: {gameResult.playerValue} | Banker: {gameResult.bankerValue}
              </div>
              {gameResult.win && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(gameResult.prize)} MLEO
                  </div>
                  <div className="text-sm font-bold text-white/80">
                    ({gameResult.betType === "tie" ? "8x" : gameResult.betType === "banker" ? "1.95x" : "2x"})
                  </div>
                </div>
              )}
              {gameResult.winner === "tie" && !gameResult.win && (
                <div className="text-lg font-bold text-white">
                  Bet Returned: {fmt(gameResult.prize)} MLEO
                </div>
              )}
              {!gameResult.win && gameResult.winner !== "tie" && (
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
