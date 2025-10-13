// ============================================================================
// MLEO Caribbean Stud Poker - Card Game
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
const LS_KEY = "mleo_caribbean_stud_v1";
const MIN_BET = 1000; // Minimum bet amount

const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Five Card Poker hand rankings
const HAND_RANKINGS = {
  "Royal Flush": 10,
  "Straight Flush": 9,
  "Four of a Kind": 8,
  "Full House": 7,
  "Flush": 6,
  "Straight": 5,
  "Three of a Kind": 4,
  "Two Pair": 3,
  "One Pair": 2,
  "High Card": 1
};

// Payout multipliers
const PAYOUTS = {
  "Royal Flush": 100,
  "Straight Flush": 50,
  "Four of a Kind": 20,
  "Full House": 7,
  "Flush": 5,
  "Straight": 4,
  "Three of a Kind": 3,
  "Two Pair": 2,
  "One Pair": 1,
  "High Card": 0
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
  if (isNaN(n) || n === null || n === undefined) return "0";
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

function getCardValue(card) {
  if (card.value === "A") return 14;
  if (card.value === "K") return 13;
  if (card.value === "Q") return 12;
  if (card.value === "J") return 11;
  return parseInt(card.value);
}

function evaluateHand(cards) {
  if (cards.length !== 5) return { hand: "High Card", rank: 1, cards: cards };
  
  const values = cards.map(card => getCardValue(card)).sort((a, b) => b - a);
  const suits = cards.map(card => card.suit);
  const isFlush = suits.every(suit => suit === suits[0]);
  const isStraight = values.every((val, i) => i === 0 || val === values[i-1] - 1);
  
  // Count occurrences of each value
  const counts = {};
  values.forEach(val => counts[val] = (counts[val] || 0) + 1);
  const countsArray = Object.values(counts).sort((a, b) => b - a);
  
  // Royal Flush
  if (isFlush && isStraight && values[0] === 14) {
    return { hand: "Royal Flush", rank: 10, cards: cards };
  }
  
  // Straight Flush
  if (isFlush && isStraight) {
    return { hand: "Straight Flush", rank: 9, cards: cards };
  }
  
  // Four of a Kind
  if (countsArray[0] === 4) {
    return { hand: "Four of a Kind", rank: 8, cards: cards };
  }
  
  // Full House
  if (countsArray[0] === 3 && countsArray[1] === 2) {
    return { hand: "Full House", rank: 7, cards: cards };
  }
  
  // Flush
  if (isFlush) {
    return { hand: "Flush", rank: 6, cards: cards };
  }
  
  // Straight
  if (isStraight) {
    return { hand: "Straight", rank: 5, cards: cards };
  }
  
  // Three of a Kind
  if (countsArray[0] === 3) {
    return { hand: "Three of a Kind", rank: 4, cards: cards };
  }
  
  // Two Pair
  if (countsArray[0] === 2 && countsArray[1] === 2) {
    return { hand: "Two Pair", rank: 3, cards: cards };
  }
  
  // One Pair
  if (countsArray[0] === 2) {
    return { hand: "One Pair", rank: 2, cards: cards };
  }
  
  // High Card
  return { hand: "High Card", rank: 1, cards: cards };
}

function compareHands(playerHand, dealerHand) {
  if (playerHand.rank > dealerHand.rank) return "player";
  if (dealerHand.rank > playerHand.rank) return "dealer";
  
  // If same rank, compare high cards
  const playerValues = playerHand.cards.map(card => getCardValue(card)).sort((a, b) => b - a);
  const dealerValues = dealerHand.cards.map(card => getCardValue(card)).sort((a, b) => b - a);
  
  for (let i = 0; i < 5; i++) {
    if (playerValues[i] > dealerValues[i]) return "player";
    if (dealerValues[i] > playerValues[i]) return "dealer";
  }
  
  return "tie";
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CaribbeanStudPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [playing, setPlaying] = useState(false);
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [deck, setDeck] = useState([]);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [gamePhase, setGamePhase] = useState("dealing"); // dealing, showdown
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
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
        router.replace('/caribbean-stud', undefined, { shallow: true });
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
    setPlayerCards([]);
    setDealerCards([]);
    setGamePhase("dealing");
    
    // Create and shuffle deck
    const newDeck = shuffleDeck(createDeck());
    setDeck(newDeck);
    
    // Deal cards
    const playerHand = [newDeck.pop(), newDeck.pop(), newDeck.pop(), newDeck.pop(), newDeck.pop()];
    const dealerHand = [newDeck.pop(), newDeck.pop(), newDeck.pop(), newDeck.pop(), newDeck.pop()];
    
    setPlayerCards(playerHand);
    setDealerCards(dealerHand);
    
    // Evaluate hands after dealing
    setTimeout(() => {
      setGamePhase("showdown");
      
      const playerHandEval = evaluateHand(playerHand);
      const dealerHandEval = evaluateHand(dealerHand);
      const winner = compareHands(playerHandEval, dealerHandEval);
      
      endGame(playerHandEval, dealerHandEval, winner);
    }, 2000);
  };

  const endGame = (playerHand, dealerHand, winner) => {
    setGameActive(false);
    
    let prize = 0;
    let netProfit = 0;
    let message = '';
    
    if (winner === "player") {
      const multiplier = PAYOUTS[playerHand.hand] || 0;
      prize = Math.floor(currentBet * multiplier);
      netProfit = prize - currentBet;
      message = `🎉 You Win! ${playerHand.hand} beats ${dealerHand.hand}`;
    } else if (winner === "dealer") {
      netProfit = -currentBet;
      message = `💥 Dealer Wins! ${dealerHand.hand} beats ${playerHand.hand}`;
    } else {
      message = `🤝 Push! Both have ${playerHand.hand}`;
    }

    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: winner === "player",
      playerHand: playerHand,
      dealerHand: dealerHand,
      winner: winner,
      prize: prize,
      netProfit: netProfit,
      totalBet: currentBet,
      message: message,
      currentBet: currentBet
    };

    setGameResult(resultData);

    // Update stats
    const newStats = {
      ...stats,
      totalHands: stats.totalHands + 1,
      totalBet: stats.totalBet + currentBet,
      wins: winner === "player" ? stats.wins + 1 : stats.wins,
      totalWon: winner === "player" ? stats.totalWon + netProfit : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, winner === "player" ? netProfit : 0),
      lastBet: currentBet
    };
    setStats(newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setPlayerCards([]);
    setDealerCards([]);
    setDeck([]);
    setGameActive(false);
    setGamePhase("dealing");
    
    // Start new game immediately
    startGame();
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
                🃏 {isFreePlay && <span className="text-amber-400">🎁 FREE PLAY - </span>}
                MLEO Caribbean Stud
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "5 cards vs dealer - best hand wins!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Poker Table */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🃏 Caribbean Stud Table</h2>
              
              {/* Dealer Cards */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-red-400">Dealer</h3>
                  {gameResult && (
                    <div className="text-sm opacity-70">
                      {gameResult.dealerHand.hand}
                    </div>
                  )}
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {dealerCards.map((card, index) => (
                    <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                      {card.emoji}
                    </div>
                  ))}
                  {dealerCards.length < 5 && (
                    Array.from({ length: 5 - dealerCards.length }).map((_, index) => (
                      <div key={`empty-${index}`} className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-500">
                        ?
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Player Cards */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-green-400">Your Cards</h3>
                  {gameResult && (
                    <div className="text-sm opacity-70">
                      {gameResult.playerHand.hand}
                    </div>
                  )}
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {playerCards.map((card, index) => (
                    <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                      {card.emoji}
                    </div>
                  ))}
                  {playerCards.length < 5 && (
                    Array.from({ length: 5 - playerCards.length }).map((_, index) => (
                      <div key={`empty-${index}`} className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-500">
                        ?
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Result Display */}
            {gameResult && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                gameResult.win
                  ? "bg-green-900/30 border-green-500"
                  : gameResult.winner === "tie"
                  ? "bg-yellow-900/30 border-yellow-500"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">
                  {gameResult.message}
                </div>
                <div className="text-xl mb-2">
                  You: {gameResult.playerHand.hand} vs Dealer: {gameResult.dealerHand.hand}
                </div>
                {gameResult.win && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(gameResult.netProfit)} MLEO Profit
                  </div>
                )}
                {gameResult.winner === "tie" && (
                  <div className="text-2xl font-bold text-yellow-400">
                    Push - Bet Returned
                  </div>
                )}
                {!gameResult.win && gameResult.winner !== "tie" && (
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
                      Max win: {((Number(betAmount) || MIN_BET) * 100).toLocaleString()} MLEO
                    </div>
                  </div>
                </>
              )}

              {gameActive && !gameResult && (
                <div className="text-center">
                  <div className="text-xl text-yellow-400 mb-4">
                    {gamePhase === "dealing" && "Dealing cards..."}
                    {gamePhase === "showdown" && "Evaluating hands..."}
                  </div>
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
                      Max win: {((Number(betAmount) || MIN_BET) * 100).toLocaleString()} MLEO
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

          {/* PRIZES */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">🏆 Prize List</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {Object.entries(PAYOUTS).map(([hand, multiplier]) => (
                <div 
                  key={hand}
                  className="rounded-lg p-3 border-2 text-center bg-gradient-to-br from-purple-600/20 to-indigo-600/20 border-purple-500/30"
                >
                  <div className="font-bold text-sm text-purple-300 mb-1">
                    {hand}
                  </div>
                  <div className="text-lg font-bold text-white">
                    ×{multiplier}
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    {multiplier === 100 ? 'Royal!' : multiplier >= 20 ? 'Rare!' : multiplier >= 5 ? 'Good!' : multiplier >= 1 ? 'Common' : 'No Win'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* HOW TO PLAY */}
          <div className="rounded-xl p-6 bg-gradient-to-br from-yellow-600/20 to-orange-600/20 border border-yellow-500/30">
            <h3 className="text-lg font-bold text-yellow-300 mb-4">How to Play</h3>
            <div className="text-sm text-zinc-300 space-y-2">
              <p><strong>Caribbean Stud:</strong> Get 5 cards and beat the dealer's hand</p>
              <p><strong>Hand Rankings:</strong> Royal Flush (100x) &gt; Straight Flush (50x) &gt; Four of a Kind (20x) &gt; Full House (7x) &gt; Flush (5x) &gt; Straight (4x) &gt; Three of a Kind (3x) &gt; Two Pair (2x) &gt; One Pair (1x) &gt; High Card (0x)</p>
              <p><strong>Winning:</strong> Beat the dealer to win your bet plus bonus! Tie = push (bet returned)</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
