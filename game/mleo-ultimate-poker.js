// ============================================================================
// MLEO Ultimate Texas Hold'em - Casino-Style Poker
// Play against the dealer with strategic raising decisions!
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

function useIOSViewportFix() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const setVH = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
    };
    const onOrient = () => requestAnimationFrame(() => setTimeout(setVH, 250));
    setVH();
    if (vv) {
      vv.addEventListener("resize", setVH);
      vv.addEventListener("scroll", setVH);
    }
    window.addEventListener("orientationchange", onOrient);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", setVH);
        vv.removeEventListener("scroll", setVH);
      }
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);
}

const LS_KEY = "mleo_ultimate_poker_v1";
const MIN_BET = 1000;
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Blind Bonus Payouts (standard Ultimate Texas Hold'em)
const BLIND_BONUS = {
  "Royal Flush": 500,
  "Straight Flush": 50,
  "Four of a Kind": 10,
  "Full House": 3,
  "Flush": 1.5,
  "Straight": 1
};

const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";

function safeRead(key, fallback = {}) { if (typeof window === "undefined") return fallback; try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val) { if (typeof window === "undefined") return; try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function getVault() { const rushData = safeRead("mleo_rush_core_v4", {}); return rushData.vault || 0; }
function setVault(amount) { const rushData = safeRead("mleo_rush_core_v4", {}); rushData.vault = amount; safeWrite("mleo_rush_core_v4", rushData); }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return Math.floor(n).toString(); }
function formatBetDisplay(n) { const num = Number(n) || 0; if (num >= 1e6) return (num / 1e6).toFixed(num % 1e6 === 0 ? 0 : 2) + "M"; if (num >= 1e3) return (num / 1e3).toFixed(num % 1e3 === 0 ? 0 : 2) + "K"; return num.toString(); }
function shortAddr(addr) { if (!addr || addr.length < 10) return addr || ""; return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
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
  const values = cards.map(c => getCardValue(c)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const valueCounts = {};
  values.forEach(v => valueCounts[v] = (valueCounts[v] || 0) + 1);
  const counts = Object.values(valueCounts).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = values.every((v, i) => i === 0 || v === values[i - 1] - 1) || 
                     (values[0] === 14 && values[1] === 5 && values[4] === 2);
  
  let highCards = [];
  
  if (isFlush && isStraight && values[0] === 14) {
    highCards = [14, 13, 12, 11, 10];
    return { hand: "Royal Flush", rank: 10, highCards };
  }
  if (isFlush && isStraight) {
    highCards = [...values];
    return { hand: "Straight Flush", rank: 9, highCards };
  }
  if (counts[0] === 4) {
    // Four of a Kind: [quad_value, kicker]
    const quad = Object.keys(valueCounts).find(v => valueCounts[v] === 4);
    const kicker = Object.keys(valueCounts).find(v => valueCounts[v] === 1);
    highCards = [parseInt(quad), parseInt(kicker)];
    return { hand: "Four of a Kind", rank: 8, highCards };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    // Full House: [trips_value, pair_value]
    const trips = Object.keys(valueCounts).find(v => valueCounts[v] === 3);
    const pair = Object.keys(valueCounts).find(v => valueCounts[v] === 2);
    highCards = [parseInt(trips), parseInt(pair)];
    return { hand: "Full House", rank: 7, highCards };
  }
  if (isFlush) {
    highCards = [...values];
    return { hand: "Flush", rank: 6, highCards };
  }
  if (isStraight) {
    highCards = [...values];
    return { hand: "Straight", rank: 5, highCards };
  }
  if (counts[0] === 3) {
    // Three of a Kind: [trips_value, kicker1, kicker2]
    const trips = Object.keys(valueCounts).find(v => valueCounts[v] === 3);
    const kickers = Object.keys(valueCounts)
      .filter(v => valueCounts[v] === 1)
      .map(v => parseInt(v))
      .sort((a, b) => b - a);
    highCards = [parseInt(trips), ...kickers];
    return { hand: "Three of a Kind", rank: 4, highCards };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    // Two Pair: [high_pair, low_pair, kicker]
    const pairs = Object.keys(valueCounts)
      .filter(v => valueCounts[v] === 2)
      .map(v => parseInt(v))
      .sort((a, b) => b - a);
    const kicker = Object.keys(valueCounts).find(v => valueCounts[v] === 1);
    highCards = [...pairs, parseInt(kicker)];
    return { hand: "Two Pair", rank: 3, highCards };
  }
  if (counts[0] === 2) {
    // One Pair: [pair_value, kicker1, kicker2, kicker3]
    const pair = Object.keys(valueCounts).find(v => valueCounts[v] === 2);
    const kickers = Object.keys(valueCounts)
      .filter(v => valueCounts[v] === 1)
      .map(v => parseInt(v))
      .sort((a, b) => b - a);
    highCards = [parseInt(pair), ...kickers];
    return { hand: "One Pair", rank: 2, highCards };
  }
  // High Card
  highCards = [...values];
  return { hand: "High Card", rank: 1, highCards };
}

function PlayingCard({ card, delay = 0, hidden = false }) {
  if (hidden) {
  return (
    <div 
      className="w-12 h-[72px] rounded bg-gradient-to-br from-indigo-600 to-purple-800 border border-white/30 flex items-center justify-center shadow"
      style={{
        animation: `slideInCard 0.4s ease-out ${delay}ms both`,
        opacity: 0
      }}
    >
      <span className="text-xl">🂠</span>
    </div>
  );
  }
  
  const isRed = card.suit === "♥️" || card.suit === "♦️";
  const color = isRed ? "text-red-600" : "text-black";
  
  return (
    <div 
      className="w-12 h-[72px] rounded bg-white border border-gray-400 shadow p-1 relative"
      style={{
        animation: `slideInCard 0.4s ease-out ${delay}ms both`,
        opacity: 0
      }}
    >
      <div className={`text-lg font-bold ${color} absolute top-1 left-1.5 leading-tight`}>
        {card.value}
      </div>
      <div className={`text-xl ${color} flex items-center justify-center h-full`}>
        {card.suit}
      </div>
    </div>
  );
}

export default function UltimatePokerPage() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const metersRef = useRef(null);
  const betRef = useRef(null);
  const ctaRef = useRef(null);

  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [isEditingBet, setIsEditingBet] = useState(false);
  
  // Game state
  const [gameState, setGameState] = useState("betting"); // betting, preflop, flop, river, showdown, finished
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
  const [playerHand, setPlayerHand] = useState(null);
  const [dealerHand, setDealerHand] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  
  // Betting
  const [anteBet, setAnteBet] = useState(0);
  const [blindBet, setBlindBet] = useState(0);
  const [playBet, setPlayBet] = useState(0);
  const [canRaise4x, setCanRaise4x] = useState(false);
  const [canRaise2x, setCanRaise2x] = useState(false);
  const [canRaise1x, setCanRaise1x] = useState(false);
  
  // UI
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const clickSound = useRef(null);
  const winSound = useRef(null);
  
  // Stats
  const [stats, setStats] = useState(() => safeRead(LS_KEY, { 
    totalHands: 0, wins: 0, losses: 0, ties: 0, totalBet: 0, totalWon: 0, 
    biggestWin: 0, royalFlushes: 0, raise4x: 0, raise2x: 0, raise1x: 0, folds: 0
  }));

  const playSfx = (audio) => { if (!sfxMuted && audio) { audio.currentTime = 0; audio.play().catch(() => {}); } };

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    const isFree = router.query.freeplay === "true";
    setIsFreePlay(isFree);
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    const interval = setInterval(() => { const status = getFreePlayStatus(); setFreePlayTokens(status.tokens); setVaultState(getVault()); }, 2000);
    if (typeof Audio !== "undefined") {
      try { clickSound.current = new Audio(S_CLICK); winSound.current = new Audio(S_WIN); } catch {}
    }
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => { clearInterval(interval); document.removeEventListener("fullscreenchange", handleFullscreenChange); };
  }, [router.query]);

  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);
  useEffect(() => { if (!wrapRef.current) return; const calc = () => { const rootH = window.visualViewport?.height ?? window.innerHeight; const safeBottom = Number(getComputedStyle(document.documentElement).getPropertyValue("--satb").replace("px", "")) || 0; const headH = headerRef.current?.offsetHeight || 0; document.documentElement.style.setProperty("--head-h", headH + "px"); const topPad = headH + 8; const used = headH + (metersRef.current?.offsetHeight || 0) + (betRef.current?.offsetHeight || 0) + (ctaRef.current?.offsetHeight || 0) + topPad + 48 + safeBottom + 24; const freeH = Math.max(200, rootH - used); document.documentElement.style.setProperty("--chart-h", freeH + "px"); }; calc(); window.addEventListener("resize", calc); window.visualViewport?.addEventListener("resize", calc); return () => { window.removeEventListener("resize", calc); window.visualViewport?.removeEventListener("resize", calc); }; }, [mounted]);
  useEffect(() => { if (gameResult) { setShowResultPopup(true); const timer = setTimeout(() => setShowResultPopup(false), 4000); return () => clearTimeout(timer); } }, [gameResult]);

  const openWalletModalUnified = () => isConnected ? openAccountModal?.() : openConnectModal?.();
  const hardDisconnect = () => { disconnect?.(); setMenuOpen(false); };
  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  const dealHand = (isFreePlayParam = false) => {
    playSfx(clickSound.current);
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) { bet = result.amount; setIsFreePlay(false); router.replace('/ultimate-poker', undefined, { shallow: true }); }
      else { alert('No free play tokens available!'); setIsFreePlay(false); return; }
    } else {
      if (bet < MIN_BET) { alert(`Minimum bet is ${MIN_BET} MLEO`); return; }
      if (currentVault < bet * 2) { alert('Insufficient MLEO in vault (need 2x bet for Ante + Blind)'); return; }
      setVault(currentVault - bet); setVaultState(currentVault - bet);
    }
    
    setAnteBet(bet);
    setBlindBet(0);
    setPlayBet(0);
    setGameResult(null);
    
    const deck = shuffleDeck(createDeck());
    const player = [deck[0], deck[2]];
    const dealer = [deck[1], deck[3]];
    const community = [deck[4], deck[5], deck[6], deck[7], deck[8]];
    
    // Clear cards
    setPlayerCards([]);
    setDealerCards([]);
    setCommunityCards([]);
    setPlayerHand(null);
    setDealerHand(null);
    setGameState("dealing");
    
    // Deal player cards one by one
    setTimeout(() => setPlayerCards([player[0]]), 400);
    setTimeout(() => setPlayerCards(player), 800);
    setTimeout(() => {
      setDealerCards(dealer);
      setCanRaise4x(true);
      setCanRaise2x(false);
      setCanRaise1x(false);
      setGameState("preflop");
    }, 1200);
  };

  const raise4x = () => {
    playSfx(clickSound.current);
    const raiseBet = anteBet * 4;
    const currentVault = getVault();
    if (currentVault < raiseBet) { alert('Insufficient MLEO in vault!'); return; }
    setVault(currentVault - raiseBet); setVaultState(currentVault - raiseBet);
    setPlayBet(playBet + raiseBet);
    setCanRaise4x(false);
    setCanRaise2x(false);
    setCanRaise1x(false);
    const newStats = { ...stats, raise4x: stats.raise4x + 1 };
    setStats(newStats);
    dealCommunity();
  };

  const check = () => {
    playSfx(clickSound.current);
    if (gameState === "preflop") {
      dealCommunity();
    } else if (gameState === "flop") {
      dealTurn();
    } else if (gameState === "turn") {
      dealRiver();
    }
  };

  const raise2x = () => {
    playSfx(clickSound.current);
    const raiseBet = anteBet * 2;
    const currentVault = getVault();
    if (currentVault < raiseBet) { alert('Insufficient MLEO in vault!'); return; }
    setVault(currentVault - raiseBet); setVaultState(currentVault - raiseBet);
    setPlayBet(playBet + raiseBet);
    setCanRaise4x(false);
    setCanRaise2x(false);
    setCanRaise1x(false);
    const newStats = { ...stats, raise2x: stats.raise2x + 1 };
    setStats(newStats);
    dealTurn();
  };

  const raise1x = () => {
    playSfx(clickSound.current);
    const raiseBet = anteBet;
    const currentVault = getVault();
    if (currentVault < raiseBet) { alert('Insufficient MLEO in vault!'); return; }
    setVault(currentVault - raiseBet); setVaultState(currentVault - raiseBet);
    setPlayBet(playBet + raiseBet);
    setCanRaise4x(false);
    setCanRaise2x(false);
    setCanRaise1x(false);
    const newStats = { ...stats, raise1x: stats.raise1x + 1 };
    setStats(newStats);
    
    // If we're at Turn, deal River. If we're at River, finish game.
    if (gameState === "turn") {
      dealRiver();
    } else if (gameState === "river") {
      setTimeout(() => finishGame(), 600);
    }
  };

  const fold = () => {
    playSfx(clickSound.current);
    setCanRaise4x(false);
    setCanRaise2x(false);
    setCanRaise1x(false);
    setGameState("finished");
    const newStats = { 
      ...stats, 
      totalHands: stats.totalHands + 1,
      losses: stats.losses + 1,
      folds: stats.folds + 1,
      totalBet: stats.totalBet + anteBet + playBet
    };
    setStats(newStats);
    setGameResult({ 
      win: false, 
      fold: true,
      profit: -(anteBet + playBet),
      message: "FOLDED"
    });
  };

  const dealCommunity = () => {
    setGameState("dealing_flop");
    const deck = shuffleDeck(createDeck());
    const community = [deck[0], deck[1], deck[2], deck[3], deck[4]];
    
    setTimeout(() => setCommunityCards([community[0]]), 400);
    setTimeout(() => setCommunityCards([community[0], community[1]]), 600);
    setTimeout(() => {
      setCommunityCards([community[0], community[1], community[2]]);
      setCanRaise2x(true);
      setGameState("flop");
    }, 800);
  };

  const dealTurn = () => {
    setGameState("dealing_turn");
    const current = [...communityCards];
    const deck = shuffleDeck(createDeck());
    
    setTimeout(() => {
      current.push(deck[0]);
      setCommunityCards([...current]);
      setCanRaise1x(true);
      setGameState("turn");
    }, 400);
  };

  const dealRiver = () => {
    setGameState("dealing_river");
    const current = [...communityCards];
    const deck = shuffleDeck(createDeck());
    
    setTimeout(() => {
      current.push(deck[0]);
      setCommunityCards([...current]);
      setCanRaise1x(true);
      setGameState("river");
    }, 400);
  };

  const finishGame = () => {
    setGameState("showdown");
    
    setTimeout(() => {
      const playerBest = evaluateHand([...playerCards, ...communityCards]);
      const dealerBest = evaluateHand([...dealerCards, ...communityCards]);
      setPlayerHand(playerBest);
      setDealerHand(dealerBest);
      
      setTimeout(() => {
        let totalPrize = 0;
        let profit = 0;
        let win = false;
        let tie = false;
        
        // Check dealer qualification (pair or better)
        const dealerQualifies = dealerBest.rank >= 2;
        
        if (!dealerQualifies) {
          // Dealer doesn't qualify - Player wins
          totalPrize = (anteBet + playBet) * 2;
          win = true;
        } else {
          // Dealer qualifies - compare hands
          if (playerBest.rank > dealerBest.rank) {
            // Player wins
            totalPrize = (anteBet + playBet) * 2;
            win = true;
          } else if (playerBest.rank === dealerBest.rank) {
            // Same rank - compare high cards
            const playerCards = playerBest.highCards || [];
            const dealerCards = dealerBest.highCards || [];
            
            let playerWins = false;
            let dealerWins = false;
            
            // Compare cards one by one
            for (let i = 0; i < Math.min(playerCards.length, dealerCards.length); i++) {
              if (playerCards[i] > dealerCards[i]) {
                playerWins = true;
                break;
              } else if (dealerCards[i] > playerCards[i]) {
                dealerWins = true;
                break;
              }
              // If equal, continue to next card
            }
            
            if (playerWins) {
              // Player wins on high card comparison
              totalPrize = (anteBet + playBet) * 2;
              win = true;
            } else if (dealerWins) {
              // Dealer wins on high card comparison - no prize
            } else {
              // Complete tie - all bets push
              totalPrize = anteBet + playBet;
              tie = true;
            }
          }
          // else: Player loses - totalPrize stays 0
        }
        
        profit = totalPrize - (anteBet + playBet);
        const totalBetAmount = anteBet + playBet;
        
        if (totalPrize > 0) {
          const newVault = getVault() + totalPrize;
          setVault(newVault);
          setVaultState(newVault);
          if (win) playSfx(winSound.current);
        }
        
        const newStats = {
          ...stats,
          totalHands: stats.totalHands + 1,
          wins: win ? stats.wins + 1 : stats.wins,
          losses: (!win && !tie) ? stats.losses + 1 : stats.losses,
          ties: tie ? stats.ties + 1 : stats.ties,
          totalBet: stats.totalBet + anteBet + blindBet + playBet,
          totalWon: stats.totalWon + totalPrize,
          biggestWin: Math.max(stats.biggestWin, profit),
          royalFlushes: playerBest.hand === "Royal Flush" ? stats.royalFlushes + 1 : stats.royalFlushes
        };
        setStats(newStats);
        
        setGameResult({
          win,
          tie,
          profit,
          totalPrize,
          totalBetAmount,
          playerHand: playerBest.hand,
          dealerHand: dealerBest.hand,
          dealerQualifies,
          message: tie ? "TIE - PUSH" : win ? "YOU WIN!" : "DEALER WINS"
        });
        
        setGameState("finished");
      }, 1200);
    }, 600);
  };

  const newHand = () => {
    setGameState("betting");
    setPlayerCards([]);
    setDealerCards([]);
    setCommunityCards([]);
    setPlayerHand(null);
    setDealerHand(null);
    setGameResult(null);
    setShowResultPopup(false);
    setAnteBet(0);
    setBlindBet(0);
    setPlayBet(0);
    setCanRaise4x(false);
    setCanRaise2x(false);
    setCanRaise1x(false);
  };

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-black to-purple-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  const totalBetAmount = anteBet + playBet;
  const potentialWin = totalBetAmount * 2;

  return (
    <Layout>
      <style jsx>{`
        @keyframes slideInCard {
          from {
            opacity: 0;
            transform: translateX(-50px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-indigo-900 via-black to-purple-900" style={{ height: '100svh' }}>
        <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
        <div ref={headerRef} className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={backSafe} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              {freePlayTokens > 0 && (<button onClick={() => dealHand(true)} disabled={gameState !== "betting"} className="relative px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all disabled:opacity-50" title={`${freePlayTokens} Free Play${freePlayTokens > 1 ? 's' : ''} Available`}><span className="text-base">🎁</span><span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{freePlayTokens}</span></button>)}
            </div>
            <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
              <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
            </div>
          </div>
        </div>

        <div className="relative h-full flex flex-col items-center justify-start px-4 pb-4" style={{ minHeight: "100%", paddingTop: "calc(var(--head-h, 56px) + 8px)" }}>
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">🃏 Ultimate Texas Hold'em</h1>
            <p className="text-white/70 text-xs">Strategic poker against the dealer!</p>
          </div>
          <div ref={metersRef} className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Vault</div>
              <div className="text-sm font-bold text-emerald-400">{fmt(vault)}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Bet</div>
          <div className="text-sm font-bold text-amber-400">
            {gameState !== "betting" && totalBetAmount > 0 ? fmt(totalBetAmount) : "0"}
          </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Pot Win</div>
              <div className="text-sm font-bold text-green-400">{fmt(potentialWin)}</div>
            </div>
          </div>

          <div className="mb-1 w-full max-w-md flex flex-col items-center justify-start pt-6" style={{ height: "var(--chart-h, 300px)" }}>
            <div className="bg-black/20 border border-white/10 rounded-lg p-2 mb-2" style={{ minHeight: '95px' }}>
              <div className="flex gap-1 flex-wrap min-h-[72px]">
                {dealerCards.map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 200} hidden={gameState !== "finished" && gameState !== "showdown"} />
                ))}
              </div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-2 mb-2" style={{ minHeight: '95px' }}>
              <div className="flex gap-1 flex-wrap min-h-[72px] justify-center">
                {communityCards.map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 200} />
                ))}
              </div>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-2" style={{ minHeight: '95px' }}>
              <div className="flex gap-1 flex-wrap min-h-[72px]">
                {playerCards.map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 200} />
                ))}
              </div>
            </div>
            {(anteBet > 0 || blindBet > 0 || playBet > 0) && (
              <div className="mt-2 flex gap-2 text-xs text-white/80">
                {anteBet > 0 && <div>Ante: {fmt(anteBet)}</div>}
                {blindBet > 0 && <div>Blind: {fmt(blindBet)}</div>}
                {playBet > 0 && <div className="text-yellow-400">Play: {fmt(playBet)}</div>}
              </div>
            )}
            <div className="text-center mt-2" style={{ height: '28px' }}>
              <div className={`text-base font-bold transition-opacity ${gameResult ? 'opacity-100' : 'opacity-0'} ${gameResult?.win ? 'text-green-400' : gameResult?.tie ? 'text-yellow-400' : 'text-red-400'}`}>
                {gameResult ? gameResult.message : 'waiting'}
              </div>
            </div>
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap">
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 1000) : Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">1K</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 10000) : Math.min(vault, current + 10000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">10K</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 100000) : Math.min(vault, current + 100000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">100K</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 1000000) : Math.min(vault, current + 1000000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameState !== "betting"} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50">1M</button>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.max(MIN_BET, current - 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameState !== "betting"} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">−</button>
            <div className="relative">
              <input type="text" value={isEditingBet ? betAmount : formatBetDisplay(betAmount)} onFocus={() => setIsEditingBet(true)} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setBetAmount(val || '0'); }} onBlur={() => { setIsEditingBet(false); const current = Number(betAmount) || MIN_BET; setBetAmount(String(Math.max(MIN_BET, current))); }} disabled={gameState !== "betting"} className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold text-xs disabled:opacity-50 pr-6" />
              <button onClick={() => { setBetAmount(String(MIN_BET)); playSfx(clickSound.current); }} disabled={gameState !== "betting"} className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs disabled:opacity-50 flex items-center justify-center" title="Reset to minimum bet">↺</button>
            </div>
            <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} disabled={gameState !== "betting"} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50">+</button>
          </div>

          <div ref={ctaRef} className="flex flex-col gap-3 w-full max-w-sm" style={{ minHeight: '140px' }}>
            {gameState === "betting" ? (
              <button onClick={() => dealHand(false)} className="w-full h-12 rounded-lg font-bold text-base bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:brightness-110">DEAL</button>
            ) : gameState === "preflop" ? (
              <div className="w-full flex gap-1">
                <button onClick={raise4x} disabled={!canRaise4x} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:brightness-110 disabled:opacity-30">RAISE 4X</button>
                <button onClick={check} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110">CHECK</button>
                <button onClick={fold} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:brightness-110">FOLD</button>
              </div>
            ) : gameState === "flop" ? (
              <div className="w-full flex gap-1">
                <button onClick={raise2x} disabled={!canRaise2x} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:brightness-110 disabled:opacity-30">RAISE 2X</button>
                <button onClick={check} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110">CHECK</button>
                <button onClick={fold} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:brightness-110">FOLD</button>
              </div>
            ) : gameState === "turn" ? (
              <div className="w-full flex gap-1">
                <button onClick={raise1x} disabled={!canRaise1x} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:brightness-110 disabled:opacity-30">RAISE 1X</button>
                <button onClick={check} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110">CHECK</button>
                <button onClick={fold} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:brightness-110">FOLD</button>
              </div>
            ) : gameState === "river" ? (
              <div className="w-full flex gap-1">
                <button onClick={raise1x} disabled={!canRaise1x} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:brightness-110 disabled:opacity-30">RAISE 1X</button>
                <button onClick={fold} className="flex-1 h-12 rounded-lg font-bold text-xs bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:brightness-110">FOLD</button>
              </div>
            ) : gameState === "finished" ? (
              <button onClick={newHand} className="w-full h-12 rounded-lg font-bold text-base bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:brightness-110">NEW HAND</button>
            ) : (
              <div className="w-full h-12 flex items-center justify-center text-white/60 text-sm">Dealing...</div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
              <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
              <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
            </div>
          </div>
        </div>

        {showResultPopup && gameResult && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div className={`${gameResult.win ? 'bg-green-500' : gameResult.tie ? 'bg-yellow-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
              <div className="text-4xl mb-2">{gameResult.win ? '🎉' : gameResult.tie ? '🤝' : '😔'}</div>
              <div className="text-2xl font-bold mb-1">{gameResult.message}</div>
              {!gameResult.fold && <div className="text-lg">{gameResult.win ? `+${fmt(gameResult.profit)} MLEO` : gameResult.tie ? 'All Bets Pushed' : `${fmt(gameResult.profit)} MLEO`}</div>}
              {!gameResult.fold && <div className="text-sm opacity-80 mt-2">You: {gameResult.playerHand} • Dealer: {gameResult.dealerHand}</div>}
            </div>
          </div>
        )}

        {menuOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}>
            <div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div>
              <div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div>
              <div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div>
              <div className="mt-4 text-xs opacity-70"><p>Ultimate Texas Hold'em v1.0</p></div>
            </div>
          </div>
        )}

        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">🃏 How to Play</h2>
              <div className="space-y-3 text-sm">
                <p><strong>Game Flow:</strong></p>
                <p>1. <strong>Ante + Blind:</strong> Place equal bets (2x total)</p>
                <p>2. <strong>Get 2 cards</strong>, dealer gets 2 cards (hidden)</p>
                <p>3. <strong>Pre-Flop:</strong> RAISE 4X or CHECK</p>
                <p>4. <strong>Flop (3 cards):</strong> RAISE 2X or CHECK</p>
                <p>5. <strong>River (5 cards):</strong> RAISE 1X or FOLD</p>
                <p>6. <strong>Showdown:</strong> Best 5-card hand wins!</p>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mt-3">
                  <p className="text-blue-300 font-semibold mb-2">Blind Bonus Payouts:</p>
                  <div className="text-xs text-white/80 space-y-1">
                    <p>• Royal Flush: 500:1</p>
                    <p>• Straight Flush: 50:1</p>
                    <p>• Four of a Kind: 10:1</p>
                    <p>• Full House: 3:1</p>
                    <p>• Flush: 1.5:1</p>
                    <p>• Straight: 1:1</p>
                  </div>
                </div>
                <p className="text-yellow-300 text-xs mt-3"><strong>Tip:</strong> Raise 4X with strong hands (pairs, high cards)!</p>
              </div>
              <button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button>
            </div>
          </div>
        )}

        {showStats && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Hands</div><div className="text-xl font-bold">{stats.totalHands}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Win Rate</div><div className="text-xl font-bold text-green-400">{stats.totalHands > 0 ? ((stats.wins / stats.totalHands) * 100).toFixed(1) : 0}%</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Bet</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalBet)}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Royal Flushes</div><div className="text-lg font-bold text-purple-400">{stats.royalFlushes}</div></div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-blue-300 font-semibold mb-2">Strategy Stats:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>4X Raises: <span className="text-white font-bold">{stats.raise4x}</span></div>
                    <div>2X Raises: <span className="text-white font-bold">{stats.raise2x}</span></div>
                    <div>1X Raises: <span className="text-white font-bold">{stats.raise1x}</span></div>
                    <div>Folds: <span className="text-white font-bold">{stats.folds}</span></div>
                  </div>
                </div>
              </div>
              <button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button>
            </div>
          </div>
        )}

        {showVaultModal && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold mb-4">💰 Your Vault</h2>
              <div className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/50 rounded-xl p-4 mb-4">
                <div className="text-sm text-white/70 mb-1">Total Balance</div>
                <div className="text-4xl font-extrabold text-emerald-400">{fmt(vault)}</div>
                <div className="text-xs text-white/60 mt-1">MLEO</div>
              </div>
              <div className="space-y-3 text-sm text-white/80">
                <p>• Your vault holds your MLEO tokens</p>
                <p>• Winnings are added automatically</p>
                <p>• Claim anytime to your wallet</p>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-3">
                  <p className="text-yellow-300 text-xs">🔐 Blockchain Info:</p>
                  <p className="text-xs text-white/60 mt-1">• Network: BSC Testnet (TBNB)</p>
                </div>
              </div>
              <button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

