// ============================================================================
// MLEO Pai Gow Poker - Card Game
// Cost: 1000 MLEO per hand
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken as consumeFreePlayToken } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_pai_gow_v1";
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

// Two Card hand rankings
const TWO_CARD_RANKINGS = {
  "Pair": 2,
  "High Card": 1
};

// Payout multipliers - Pai Gow typically pays 1:1 if you win both hands
const PAYOUTS = {
  "Win Both": 2,    // Win both hands = x2
  "Win One": 0,     // Win one hand = push (return bet)
  "Lose Both": 0    // Lose both = lose bet
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

function evaluateFiveCardHand(cards) {
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
    return { hand: "Royal Flush", rank: 10, cards: cards, values: values };
  }
  
  // Straight Flush
  if (isFlush && isStraight) {
    return { hand: "Straight Flush", rank: 9, cards: cards, values: values };
  }
  
  // Four of a Kind
  if (countsArray[0] === 4) {
    return { hand: "Four of a Kind", rank: 8, cards: cards, values: values };
  }
  
  // Full House
  if (countsArray[0] === 3 && countsArray[1] === 2) {
    return { hand: "Full House", rank: 7, cards: cards, values: values };
  }
  
  // Flush
  if (isFlush) {
    return { hand: "Flush", rank: 6, cards: cards, values: values };
  }
  
  // Straight
  if (isStraight) {
    return { hand: "Straight", rank: 5, cards: cards, values: values };
  }
  
  // Three of a Kind
  if (countsArray[0] === 3) {
    return { hand: "Three of a Kind", rank: 4, cards: cards, values: values };
  }
  
  // Two Pair
  if (countsArray[0] === 2 && countsArray[1] === 2) {
    return { hand: "Two Pair", rank: 3, cards: cards, values: values };
  }
  
  // One Pair
  if (countsArray[0] === 2) {
    return { hand: "One Pair", rank: 2, cards: cards, values: values };
  }
  
  // High Card
  return { hand: "High Card", rank: 1, cards: cards, values: values };
}

function evaluateTwoCardHand(cards) {
  if (cards.length !== 2) return { hand: "High Card", rank: 1, cards: cards };
  
  const values = cards.map(card => getCardValue(card)).sort((a, b) => b - a);
  
  // Pair
  if (values[0] === values[1]) {
    return { hand: "Pair", rank: 2, cards: cards, values: values };
  }
  
  // High Card
  return { hand: "High Card", rank: 1, cards: cards, values: values };
}

function compareHands(hand1, hand2) {
  if (hand1.rank > hand2.rank) return 1;
  if (hand2.rank > hand1.rank) return -1;
  
  // If same rank, compare high cards
  for (let i = 0; i < hand1.values.length; i++) {
    if (hand1.values[i] > hand2.values[i]) return 1;
    if (hand2.values[i] > hand1.values[i]) return -1;
  }
  
  return 0; // Tie
}

// House Way - Basic strategy for dealer
function houseWay(cards) {
  // Try to make the best 5-card hand and put the rest in 2-card hand
  // For simplicity, we'll just put the two highest cards in the low hand
  const sorted = [...cards].sort((a, b) => getCardValue(b) - getCardValue(a));
  const lowHand = [sorted[0], sorted[1]];
  const highHand = sorted.slice(2);
  
  return { highHand, lowHand };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PaiGowPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [currentBet, setCurrentBet] = useState(MIN_BET); // Track current game bet
  const [playing, setPlaying] = useState(false);
  const [playerCards, setPlayerCards] = useState([]);
  const [playerHighHand, setPlayerHighHand] = useState([]);
  const [playerLowHand, setPlayerLowHand] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [dealerHighHand, setDealerHighHand] = useState([]);
  const [dealerLowHand, setDealerLowHand] = useState([]);
  const [deck, setDeck] = useState([]);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [gamePhase, setGamePhase] = useState("dealing"); // dealing, arranging, showdown
  const [selectedCards, setSelectedCards] = useState([]);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [stats, setStats] = useState(() => 
    safeRead(LS_KEY, { totalHands: 0, totalBet: 0, totalWon: 0, biggestWin: 0, wins: 0, lastBet: MIN_BET })
  );

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
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startGame = () => {
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay) {
      const result = consumeFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/pai-gow', undefined, { shallow: true });
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
    setPlayerHighHand([]);
    setPlayerLowHand([]);
    setDealerCards([]);
    setDealerHighHand([]);
    setDealerLowHand([]);
    setSelectedCards([]);
    setGamePhase("dealing");
    
    // Create and shuffle deck
    const newDeck = shuffleDeck(createDeck());
    setDeck(newDeck);
    
    // Deal 7 cards to player and dealer
    const playerHand = [];
    const dealerHand = [];
    for (let i = 0; i < 7; i++) {
      playerHand.push(newDeck.pop());
      dealerHand.push(newDeck.pop());
    }
    
    setPlayerCards(playerHand);
    setDealerCards(dealerHand);
    
    // Dealer arranges cards using house way
    const dealerArrangement = houseWay(dealerHand);
    setDealerHighHand(dealerArrangement.highHand);
    setDealerLowHand(dealerArrangement.lowHand);
    
    // Auto-arrange player cards using house way after a short delay
    setTimeout(() => {
      setGamePhase("arranging");
      const playerArrangement = houseWay(playerHand);
      setPlayerHighHand(playerArrangement.highHand);
      setPlayerLowHand(playerArrangement.lowHand);
      
      // Auto-play after arrangement
      setTimeout(() => {
        setGamePhase("showdown");
        playHand(playerArrangement.highHand, playerArrangement.lowHand, dealerArrangement.highHand, dealerArrangement.lowHand);
      }, 1500);
    }, 2000);
  };

  const playHand = (pHighHand, pLowHand, dHighHand, dLowHand) => {
    // Evaluate hands
    const playerHighEval = evaluateFiveCardHand(pHighHand);
    const playerLowEval = evaluateTwoCardHand(pLowHand);
    const dealerHighEval = evaluateFiveCardHand(dHighHand);
    const dealerLowEval = evaluateTwoCardHand(dLowHand);
    
    // Compare hands
    const highResult = compareHands(playerHighEval, dealerHighEval);
    const lowResult = compareHands(playerLowEval, dealerLowEval);
    
    let handsWon = 0;
    if (highResult > 0) handsWon++;
    if (lowResult > 0) handsWon++;
    
    let handsLost = 0;
    if (highResult < 0) handsLost++;
    if (lowResult < 0) handsLost++;
    
    endGame(playerHighEval, playerLowEval, dealerHighEval, dealerLowEval, handsWon, handsLost);
  };

  const endGame = (playerHigh, playerLow, dealerHigh, dealerLow, handsWon, handsLost) => {
    setGameActive(false);
    
    let prize = 0;
    let netProfit = 0;
    let message = '';
    let outcome = '';
    
    if (handsWon === 2) {
      // Win both hands
      prize = currentBet * 2;
      netProfit = prize - currentBet;
      message = `🎉 You Win Both Hands!`;
      outcome = 'win';
    } else if (handsWon === 1 && handsLost === 1) {
      // Push - return bet
      prize = currentBet;
      netProfit = 0;
      message = `🤝 Push! One Hand Each`;
      outcome = 'push';
    } else {
      // Lose both hands
      prize = 0;
      netProfit = -currentBet;
      message = `💥 Dealer Wins Both Hands!`;
      outcome = 'lose';
    }

    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: outcome === 'win',
      push: outcome === 'push',
      playerHigh: playerHigh,
      playerLow: playerLow,
      dealerHigh: dealerHigh,
      dealerLow: dealerLow,
      handsWon: handsWon,
      handsLost: handsLost,
      prize: prize,
      netProfit: netProfit,
      totalBet: currentBet,
      message: message,
      currentBet: currentBet,
      outcome: outcome
    };

    setGameResult(resultData);

    // Update stats
    const newStats = {
      ...stats,
      totalHands: stats.totalHands + 1,
      totalBet: stats.totalBet + currentBet,
      wins: outcome === 'win' ? stats.wins + 1 : stats.wins,
      totalWon: outcome === 'win' ? stats.totalWon + netProfit : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, outcome === 'win' ? netProfit : 0),
      lastBet: currentBet
    };
    setStats(newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setPlayerCards([]);
    setPlayerHighHand([]);
    setPlayerLowHand([]);
    setDealerCards([]);
    setDealerHighHand([]);
    setDealerLowHand([]);
    setDeck([]);
    setGameActive(false);
    setGamePhase("dealing");
    setSelectedCards([]);
    
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
                MLEO Pai Gow Poker
              </h1>
              <p className="text-zinc-400 text-sm">
                {isFreePlay ? "Playing with a free token - good luck!" : "7 cards split into 5+2 - beat dealer on both!"}
              </p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Poker Table */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🃏 Pai Gow Table</h2>
              
              {/* Dealer Hands */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-red-400">Dealer</h3>
                </div>
                
                {/* Dealer High Hand (5 cards) */}
                <div className="mb-4">
                  <div className="text-center mb-2 text-sm opacity-70">
                    High Hand (5 cards)
                    {gameResult && (
                      <span className="ml-2 font-bold">- {gameResult.dealerHigh.hand}</span>
                    )}
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {dealerHighHand.map((card, index) => (
                      <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                        {card.emoji}
                      </div>
                    ))}
                    {dealerHighHand.length < 5 && (
                      Array.from({ length: 5 - dealerHighHand.length }).map((_, index) => (
                        <div key={`empty-${index}`} className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-500">
                          ?
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                {/* Dealer Low Hand (2 cards) */}
                <div className="mb-4">
                  <div className="text-center mb-2 text-sm opacity-70">
                    Low Hand (2 cards)
                    {gameResult && (
                      <span className="ml-2 font-bold">- {gameResult.dealerLow.hand}</span>
                    )}
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {dealerLowHand.map((card, index) => (
                      <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                        {card.emoji}
                      </div>
                    ))}
                    {dealerLowHand.length < 2 && (
                      Array.from({ length: 2 - dealerLowHand.length }).map((_, index) => (
                        <div key={`empty-${index}`} className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-500">
                          ?
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Player Hands */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-green-400">Your Cards</h3>
                </div>
                
                {/* Player High Hand (5 cards) */}
                <div className="mb-4">
                  <div className="text-center mb-2 text-sm opacity-70">
                    High Hand (5 cards)
                    {gameResult && (
                      <span className="ml-2 font-bold">- {gameResult.playerHigh.hand}</span>
                    )}
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {playerHighHand.map((card, index) => (
                      <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                        {card.emoji}
                      </div>
                    ))}
                    {playerHighHand.length < 5 && (
                      Array.from({ length: 5 - playerHighHand.length }).map((_, index) => (
                        <div key={`empty-${index}`} className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-500">
                          ?
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                {/* Player Low Hand (2 cards) */}
                <div className="mb-4">
                  <div className="text-center mb-2 text-sm opacity-70">
                    Low Hand (2 cards)
                    {gameResult && (
                      <span className="ml-2 font-bold">- {gameResult.playerLow.hand}</span>
                    )}
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {playerLowHand.map((card, index) => (
                      <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                        {card.emoji}
                      </div>
                    ))}
                    {playerLowHand.length < 2 && (
                      Array.from({ length: 2 - playerLowHand.length }).map((_, index) => (
                        <div key={`empty-${index}`} className="w-16 h-20 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-500">
                          ?
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Result Display */}
            {gameResult && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                gameResult.win
                  ? "bg-green-900/30 border-green-500"
                  : gameResult.push
                  ? "bg-yellow-900/30 border-yellow-500"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">
                  {gameResult.message}
                </div>
                <div className="text-xl mb-2">
                  You won {gameResult.handsWon}/2 hands
                </div>
                <div className="text-sm mb-3 opacity-80">
                  <div>Your High: {gameResult.playerHigh.hand} vs Dealer: {gameResult.dealerHigh.hand}</div>
                  <div>Your Low: {gameResult.playerLow.hand} vs Dealer: {gameResult.dealerLow.hand}</div>
                </div>
                {gameResult.win && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(gameResult.netProfit)} MLEO Profit
                  </div>
                )}
                {gameResult.push && (
                  <div className="text-2xl font-bold text-yellow-400">
                    Push - Bet Returned
                  </div>
                )}
                {!gameResult.win && !gameResult.push && (
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
                  <button
                    onClick={startGame}
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
                      Max win: {((Number(betAmount) || MIN_BET) * 2).toLocaleString()} MLEO
                    </div>
                  </div>
                </>
              )}

              {gameActive && !gameResult && (
                <div className="text-center">
                  <div className="text-xl text-yellow-400 mb-4">
                    {gamePhase === "dealing" && "Dealing 7 cards..."}
                    {gamePhase === "arranging" && "Arranging hands..."}
                    {gamePhase === "showdown" && "Comparing hands..."}
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
              <p><strong>Pai Gow Poker:</strong> Split your 7 cards into a 5-card high hand and 2-card low hand</p>
              <p><strong>Rules:</strong> Your high hand (5 cards) must be stronger than your low hand (2 cards)</p>
              <p><strong>Winning:</strong> Beat the dealer on BOTH hands to win! Win one hand each = push (bet returned)</p>
              <p><strong>Payouts:</strong> Win both hands = ×2 (double your bet), Win one = push (return bet), Lose both = lose bet</p>
              <p><strong>Strategy:</strong> The game auto-arranges your cards using "House Way" - the best balanced strategy</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
