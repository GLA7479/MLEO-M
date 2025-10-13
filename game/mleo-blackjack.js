// ============================================================================
// MLEO Blackjack - Card Game
// Cost: 1000 MLEO per hand
// ============================================================================

import { useEffect, useState, useRef } from "react";
import Layout from "../components/Layout";
import Link from "next/link";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_blackjack_v1";
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

function getCardValue(card) {
  if (card.value === "A") return 11;
  if (["J", "Q", "K"].includes(card.value)) return 10;
  return parseInt(card.value);
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;
  
  for (const card of hand) {
    const cardValue = getCardValue(card);
    if (card.value === "A") aces++;
    value += cardValue;
  }
  
  // Adjust for aces
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  
  return value;
}

function dealInitialCards(deck) {
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  
  return { playerHand, dealerHand, remainingDeck: deck };
}

function dealerPlay(dealerHand, deck) {
  const newDealerHand = [...dealerHand];
  let currentDeck = [...deck];
  
  while (calculateHandValue(newDealerHand) < 17) {
    newDealerHand.push(currentDeck.pop());
  }
  
  return { dealerHand: newDealerHand, remainingDeck: currentDeck };
}

function determineWinner(playerValue, dealerValue, playerHand = [], dealerHand = []) {
  // Check for Blackjack (21 with 2 cards)
  const playerBlackjack = playerValue === 21 && playerHand.length === 2;
  const dealerBlackjack = dealerValue === 21 && dealerHand.length === 2;
  
  if (playerBlackjack && dealerBlackjack) return "push";
  if (playerBlackjack) return "player";
  if (dealerBlackjack) return "dealer";
  
  if (playerValue > 21) return "dealer";
  if (dealerValue > 21) return "player";
  if (playerValue === dealerValue) return "push";
  return playerValue > dealerValue ? "player" : "dealer";
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MLEOBlackjackPage() {
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [currentBet, setCurrentBet] = useState(MIN_BET);
  const [gameActive, setGameActive] = useState(false);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [deck, setDeck] = useState([]);
  const [gameResult, setGameResult] = useState(null);
  const [canDoubleDown, setCanDoubleDown] = useState(false);
  const [canSplit, setCanSplit] = useState(false);
  const [doubledDown, setDoubledDown] = useState(false);
  const [splitHands, setSplitHands] = useState([]);
  const [currentSplitHand, setCurrentSplitHand] = useState(0);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalHands: 0, totalBet: 0, wins: 0, totalWon: 0, totalLost: 0, biggestWin: 0, history: [], lastBet: MIN_BET })
  );

  // ----------------------- Mount -------------------
  useEffect(() => {
    setMounted(true);
    const currentVault = getVault();
    setVaultState(currentVault);
    
    // Load last bet amount
    const savedLastBet = safeRead(LS_KEY, { lastBet: MIN_BET }).lastBet;
    setBetAmount(savedLastBet.toString());
  }, []);

  const refreshVault = () => {
    setVaultState(getVault());
  };

  const startGame = async () => {
    if (gameActive) return;

    const currentVault = getVault();
    const bet = Number(betAmount) || MIN_BET;
    if (bet < MIN_BET) {
      alert(`Minimum bet is ${MIN_BET} MLEO`);
      return;
    }
    if (currentVault < bet) {
      alert('Insufficient MLEO in vault');
      return;
    }

    // Deduct bet
    setVault(currentVault - bet);
    setVaultState(currentVault - bet);
    setCurrentBet(bet);
    setGameActive(true);
    setGameResult(null);

    // Create and shuffle deck
    const newDeck = shuffleDeck(createDeck());
    const { playerHand: newPlayerHand, dealerHand: newDealerHand, remainingDeck } = dealInitialCards(newDeck);
    
    setPlayerHand(newPlayerHand);
    setDealerHand(newDealerHand);
    setDeck(remainingDeck);
    
    // Check for double down and split options
    const playerValue = calculateHandValue(newPlayerHand);
    setCanDoubleDown(playerValue >= 9 && playerValue <= 11);
    setCanSplit(newPlayerHand.length === 2 && newPlayerHand[0].value === newPlayerHand[1].value);
    setDoubledDown(false);

    // Check for automatic Blackjack (21 with 2 cards)
    if (playerValue === 21 && newPlayerHand.length === 2) {
      // Automatic Blackjack - give triple prize
      setTimeout(() => {
        // Update dealer hand state
        setDealerHand(newDealerHand);
        
        // Use endGame function for consistency
        endGame("player", newDealerHand, newPlayerHand);
      }, 1000); // Small delay for dramatic effect
    }
  };

  const hit = () => {
    if (!gameActive || gameResult) return;

    const newPlayerHand = [...playerHand, deck[deck.length - 1]];
    const newDeck = deck.slice(0, -1);
    
    setPlayerHand(newPlayerHand);
    setDeck(newDeck);
    setCanDoubleDown(false);
    setCanSplit(false);

    // Update split hands if we're playing split
    if (splitHands.length > 0) {
      const newSplitHands = [...splitHands];
      newSplitHands[currentSplitHand] = newPlayerHand;
      setSplitHands(newSplitHands);
    }

    const playerValue = calculateHandValue(newPlayerHand);
    
    if (playerValue > 21) {
      // Player busts
      endGame("dealer", null, newPlayerHand);
    }
  };

  const doubleDown = () => {
    if (!gameActive || gameResult || !canDoubleDown) return;

    // Double the bet
    const currentVault = getVault();
    if (currentVault < currentBet) {
      alert('Insufficient MLEO to double down');
      return;
    }

    setVault(currentVault - currentBet);
    setVaultState(currentVault - currentBet);
    setCurrentBet(currentBet * 2);
    setDoubledDown(true);

    // Take one card and stand
    const newPlayerHand = [...playerHand, deck[deck.length - 1]];
    const newDeck = deck.slice(0, -1);
    
    setPlayerHand(newPlayerHand);
    setDeck(newDeck);
    setCanDoubleDown(false);
    setCanSplit(false);

    const playerValue = calculateHandValue(newPlayerHand);
    
    if (playerValue > 21) {
      // Player busts
      endGame("dealer", null, newPlayerHand);
    } else {
      // Automatically stand after double down
      // Dealer plays
      const { dealerHand: finalDealerHand } = dealerPlay(dealerHand, newDeck);
      
      const dealerValue = calculateHandValue(finalDealerHand);
      
      const winner = determineWinner(playerValue, dealerValue, newPlayerHand, finalDealerHand);
      
      // Update dealer hand state and end game
      setDealerHand(finalDealerHand);
      endGame(winner, finalDealerHand, newPlayerHand);
    }
  };

  const split = () => {
    if (!gameActive || gameResult || !canSplit) return;

    const currentVault = getVault();
    if (currentVault < currentBet) {
      alert('Insufficient MLEO to split');
      return;
    }

    // Deduct additional bet for split
    setVault(currentVault - currentBet);
    setVaultState(currentVault - currentBet);
    setCurrentBet(currentBet * 2);
    setCanDoubleDown(false);
    setCanSplit(false);

    // Create two separate hands from the split cards
    const firstCard = playerHand[0];
    const secondCard = playerHand[1];
    
    // Create two hands with one card each
    const hand1 = [firstCard];
    const hand2 = [secondCard];
    
    // Add one card to each hand
    hand1.push(deck[deck.length - 1]);
    hand2.push(deck[deck.length - 2]);
    
    const newDeck = deck.slice(0, -2);
    
    setSplitHands([hand1, hand2]);
    setCurrentSplitHand(0);
    setPlayerHand(hand1);
    setDeck(newDeck);
    setCanDoubleDown(false);
    setCanSplit(false);
  };

  const stand = () => {
    if (!gameActive || gameResult) return;

    // If we're playing split hands, move to next hand
    if (splitHands.length > 0 && currentSplitHand < splitHands.length - 1) {
      const nextHand = currentSplitHand + 1;
      setCurrentSplitHand(nextHand);
      setPlayerHand(splitHands[nextHand]);
      return;
    }

    // Dealer plays
    const { dealerHand: finalDealerHand } = dealerPlay(dealerHand, deck);
    
    const playerValue = calculateHandValue(playerHand);
    const dealerValue = calculateHandValue(finalDealerHand);
    
    const winner = determineWinner(playerValue, dealerValue, playerHand, finalDealerHand);
    
    // Update dealer hand state and end game
    setDealerHand(finalDealerHand);
    endGame(winner, finalDealerHand, playerHand);
  };

  const endGame = (winner, finalDealerHand = null, finalPlayerHand = null) => {
    setGameActive(false);

    // Use the final hands that were passed to determineWinner
    const playerValue = calculateHandValue(finalPlayerHand || playerHand);
    const dealerValue = calculateHandValue(finalDealerHand || dealerHand);
    
    // Check for Blackjack
    const playerBlackjack = playerValue === 21 && (finalPlayerHand || playerHand).length === 2;
    
    let prize = 0;
    let isWin = false;

    if (winner === "player") {
      prize = Math.floor(currentBet * (playerBlackjack ? 3 : 2)); // 3x for Blackjack, 2x for regular win
      isWin = true;
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    } else if (winner === "push") {
      prize = currentBet;
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    const resultData = {
      win: isWin,
      winner: winner,
      playerValue: playerValue,
      dealerValue: dealerValue,
      prize: prize,
      blackjack: playerBlackjack
    };

    // Set the result data
    setGameResult(resultData);

    // Update stats
    const newStats = {
      ...stats,
      totalHands: stats.totalHands + 1,
      totalBet: stats.totalBet + currentBet,
      wins: isWin ? stats.wins + 1 : stats.wins,
      totalWon: isWin ? stats.totalWon + prize : stats.totalWon,
      totalLost: winner === "dealer" ? stats.totalLost + currentBet : stats.totalLost,
      biggestWin: Math.max(stats.biggestWin, isWin ? prize : 0),
      history: [{ ...resultData, bet: currentBet, timestamp: Date.now() }, ...stats.history.slice(0, 9)],
      lastBet: currentBet
    };
    setStats(newStats);
    safeWrite(LS_KEY, newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setPlayerHand([]);
    setDealerHand([]);
    setDeck([]);
    setGameActive(false);
    setCanDoubleDown(false);
    setCanSplit(false);
    setDoubledDown(false);
    setSplitHands([]);
    setCurrentSplitHand(0);
    
    // Start new game immediately
    startGame();
  };

  if (!mounted) {
    return <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>;
  }

  const playerValue = calculateHandValue(playerHand);
  const dealerValue = calculateHandValue(dealerHand);

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
              <h1 className="text-3xl font-bold mb-1">🎰 MLEO Blackjack</h1>
              <p className="text-zinc-400 text-sm">Beat the dealer to 21 and win big!</p>
            </div>

            <div className="w-16"></div>
          </header>

          {/* GAME WINDOW */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            {/* Game Table */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-center">🃏 Blackjack Table</h2>
              
              {/* Dealer Section */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-red-400">Dealer</h3>
                  <div className="text-sm opacity-70">
                    {gameActive && !gameResult ? "???" : `Value: ${dealerValue}`}
                  </div>
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {dealerHand.map((card, index) => (
                    <div key={index} className={`w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold ${
                      gameActive && !gameResult && index === 1
                        ? "bg-gradient-to-br from-red-600 to-red-800 border-red-400"
                        : "bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black"
                    }`}>
                      {gameActive && !gameResult && index === 1 ? "🂠" : card.emoji}
                    </div>
                  ))}
                </div>
              </div>

              {/* Player Section */}
              <div className="mb-8">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-blue-400">
                    Player {splitHands.length > 0 && `(Hand ${currentSplitHand + 1}/${splitHands.length})`}
                  </h3>
                  <div className="text-sm opacity-70">
                    Value: {playerValue} {playerValue > 21 && <span className="text-red-400">BUST!</span>}
                  </div>
                </div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {playerHand.map((card, index) => (
                    <div key={index} className="w-16 h-20 rounded-lg border-2 flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                      {card.emoji}
                    </div>
                  ))}
                </div>
                
                {/* Show other split hands if they exist */}
                {splitHands.length > 0 && (
                  <div className="mt-4">
                    <div className="text-center text-sm opacity-70 mb-2">Other Hands:</div>
                    {splitHands.map((hand, handIndex) => (
                      handIndex !== currentSplitHand && (
                        <div key={handIndex} className="flex justify-center gap-2 flex-wrap mb-2">
                          {hand.map((card, cardIndex) => (
                            <div key={cardIndex} className="w-12 h-16 rounded-lg border-2 flex items-center justify-center text-lg font-bold bg-gradient-to-br from-white to-gray-100 border-gray-300 text-black">
                              {card.emoji}
                            </div>
                          ))}
                          <div className="text-xs opacity-70 mt-2">
                            Value: {calculateHandValue(hand)}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Result Display */}
            {gameResult && (
              <div className={`text-center mb-6 p-6 rounded-xl border-2 ${
                gameResult.winner === "player"
                  ? "bg-green-900/30 border-green-500"
                  : gameResult.winner === "push"
                  ? "bg-yellow-900/30 border-yellow-500"
                  : "bg-red-900/30 border-red-500"
              }`}>
                <div className="text-3xl font-bold mb-2">
                  {gameResult.winner === "player" ? 
                    (gameResult.blackjack ? "🎉 BLACKJACK!" : "🎉 You Win!") : 
                    gameResult.winner === "push" ? "🤝 Push!" : "💥 Dealer Wins!"}
                </div>
                <div className="text-xl mb-2">
                  Player: {gameResult.playerValue} | Dealer: {gameResult.dealerValue}
                </div>
                {gameResult.winner === "player" && (
                  <div className="text-3xl font-bold text-green-400">
                    +{fmt(gameResult.prize)} MLEO ({gameResult.blackjack ? "3x BLACKJACK!" : doubledDown ? "4x" : "2x"})
                  </div>
                )}
                {gameResult.winner === "push" && (
                  <div className="text-xl text-yellow-400">
                    Refund: {fmt(gameResult.prize)} MLEO
                  </div>
                )}
                {gameResult.winner === "dealer" && (
                  <div className="text-xl text-red-400">
                    Lost {fmt(currentBet)} MLEO
                  </div>
                )}
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
                <div className="flex gap-3 justify-center mb-6 flex-wrap">
                  <button
                    onClick={stand}
                    className="px-6 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-red-600 to-pink-500 hover:from-red-500 hover:to-pink-400 transition-all"
                  >
                    ✋ Stand
                  </button>
                  <button
                    onClick={hit}
                    className="px-6 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-blue-600 to-indigo-500 hover:from-blue-500 hover:to-indigo-400 transition-all"
                  >
                    🃏 Hit
                  </button>
                  {canDoubleDown && (
                    <button
                      onClick={doubleDown}
                      className="px-6 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-500 hover:to-orange-400 transition-all"
                    >
                      💰 Double Down
                    </button>
                  )}
                  {canSplit && (
                    <button
                      onClick={split}
                      className="px-6 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 transition-all"
                    >
                      ✂️ Split
                    </button>
                  )}
                </div>
              )}

              {gameResult && (
                <button
                  onClick={resetGame}
                  className="px-8 py-3 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 transition-all mb-6"
                >
                  🔄 New Game ({fmt(Number(betAmount) || MIN_BET)})
                </button>
              )}

              <div className="text-sm opacity-70 mb-4">
                Get closer to 21 than the dealer • Win 2x your bet • Blackjack = 3x • Push = refund
              </div>
            </div>

            {/* Bet Amount Input - Only after result */}
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
                <div className="text-xs text-zinc-500 mt-2 text-center">
                  Max win: {((Number(betAmount) || MIN_BET) * 3).toLocaleString()} MLEO (Blackjack)
                </div>
              </div>
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
              <div className="text-xs opacity-70 mb-1">Total Hands</div>
              <div className="text-lg font-bold">
                {stats.totalHands.toLocaleString()}
              </div>
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
              <li>• <strong>Deal cards:</strong> Start with 2 cards each, dealer shows one card</li>
              <li>• <strong>Hit:</strong> Take another card to get closer to 21</li>
              <li>• <strong>Stand:</strong> Keep your current hand and let dealer play</li>
              <li>• <strong>Double Down:</strong> Double your bet and take exactly one more card (9-11 only)</li>
              <li>• <strong>Split:</strong> Split identical cards into two hands (double your bet)</li>
              <li>• <strong>Win:</strong> Get closer to 21 than dealer (without going over) to win 2x bet</li>
              <li>• <strong>Blackjack:</strong> Get 21 with first 2 cards = automatic 3x prize!</li>
              <li>• <strong>Push:</strong> Same value as dealer = refund</li>
              <li>• <strong>Minimum bet:</strong> {MIN_BET.toLocaleString()} MLEO per hand</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
