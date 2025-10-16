// ============================================================================
// MLEO Texas Hold'em vs Dealer - Full-Screen Game Template
// Classic Texas Hold'em! Beat the dealer!
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

const LS_KEY = "mleo_texas_holdem_v1";
const MIN_BET = 1000;
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 30;
const MINING_CLAIM_ABI = [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] }];
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
      deck.push({ suit, value, display: `${value}${suit}` });
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
  if (cards.length < 5) return { hand: "High Card", rank: 1, highCard: 0 };
  
  // Generate all possible 5-card combinations from 7 cards
  const combinations = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        for (let l = k + 1; l < cards.length; l++) {
          for (let m = l + 1; m < cards.length; m++) {
            combinations.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
          }
        }
      }
    }
  }
  
  let bestHand = { hand: "High Card", rank: 1, highCard: 0 };
  
  for (const combo of combinations) {
    const evaluated = evaluateFiveCards(combo);
    if (evaluated.rank > bestHand.rank || (evaluated.rank === bestHand.rank && evaluated.highCard > bestHand.highCard)) {
      bestHand = evaluated;
    }
  }
  
  return bestHand;
}

function evaluateFiveCards(cards) {
  const values = cards.map(card => getCardValue(card)).sort((a, b) => b - a);
  const suits = cards.map(card => card.suit);
  const isFlush = suits.every(suit => suit === suits[0]);
  const isStraight = values.every((val, i) => i === 0 || val === values[i-1] - 1) || 
                     (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2); // A-2-3-4-5
  
  const counts = {};
  values.forEach(val => counts[val] = (counts[val] || 0) + 1);
  const countsArray = Object.values(counts).sort((a, b) => b - a);
  const highCard = values[0];
  
  if (isFlush && isStraight && values[0] === 14 && values[1] === 13) return { hand: "Royal Flush", rank: 10, highCard };
  if (isFlush && isStraight) return { hand: "Straight Flush", rank: 9, highCard };
  if (countsArray[0] === 4) return { hand: "Four of a Kind", rank: 8, highCard };
  if (countsArray[0] === 3 && countsArray[1] === 2) return { hand: "Full House", rank: 7, highCard };
  if (isFlush) return { hand: "Flush", rank: 6, highCard };
  if (isStraight) return { hand: "Straight", rank: 5, highCard };
  if (countsArray[0] === 3) return { hand: "Three of a Kind", rank: 4, highCard };
  if (countsArray[0] === 2 && countsArray[1] === 2) return { hand: "Two Pair", rank: 3, highCard };
  if (countsArray[0] === 2) return { hand: "One Pair", rank: 2, highCard };
  return { hand: "High Card", rank: 1, highCard };
}

function compareHands(playerHand, dealerHand) {
  if (playerHand.rank > dealerHand.rank) return "player";
  if (dealerHand.rank > playerHand.rank) return "dealer";
  if (playerHand.highCard > dealerHand.highCard) return "player";
  if (dealerHand.highCard > playerHand.highCard) return "dealer";
  return "tie";
}

function PlayingCard({ card, hidden = false, delay = 0 }) {
  if (hidden) {
    return (
      <div 
        className="w-12 h-16 rounded bg-gradient-to-br from-red-600 to-red-800 border border-white/30 flex items-center justify-center shadow text-xl"
        style={{
          animation: `slideInCard 0.4s ease-out ${delay}ms both`,
          opacity: 0
        }}
      >
        🂠
      </div>
    );
  }
  
  const isRed = card.suit === "♥️" || card.suit === "♦️";
  const color = isRed ? "text-red-600" : "text-black";
  
  return (
    <div 
      className="w-12 h-16 rounded bg-white border border-gray-400 shadow p-0.5 relative"
      style={{
        animation: `slideInCard 0.4s ease-out ${delay}ms both`,
        opacity: 0
      }}
    >
      <div className={`text-sm font-bold ${color} absolute top-0.5 left-1 leading-tight`}>
        {card.value}
      </div>
      <div className={`text-lg ${color} flex items-center justify-center h-full`}>
        {card.suit}
      </div>
    </div>
  );
}

export default function TexasHoldemPage() {
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
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [isEditingBet, setIsEditingBet] = useState(false);
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
  const [gameState, setGameState] = useState("betting"); // betting, pre-flop, flop, turn, river, showdown, finished
  const [pot, setPot] = useState(0);
  const [playerBetThisRound, setPlayerBetThisRound] = useState(0);
  const [dealerBetThisRound, setDealerBetThisRound] = useState(0);
  const [totalPlayerBet, setTotalPlayerBet] = useState(0);
  const [playerHand, setPlayerHand] = useState(null);
  const [dealerHand, setDealerHand] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [collectAmount, setCollectAmount] = useState(1000);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const clickSound = useRef(null);
  const winSound = useRef(null);
  const [deck, setDeck] = useState([]);
  const [baseBet, setBaseBet] = useState(0);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalHands: 0, wins: 0, losses: 0, ties: 0, totalBet: 0, totalWon: 0, biggestWin: 0, folds: 0, lastBet: MIN_BET }));

  const playSfx = (sound) => { if (sfxMuted || !sound) return; try { sound.currentTime = 0; sound.play().catch(() => {}); } catch {} };

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) setBetAmount(String(savedStats.lastBet));
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

  const collectToWallet = async () => {
    if (!isConnected) { openConnectModal?.(); return; }
    if (chainId !== CLAIM_CHAIN_ID) { try { await switchChain?.({ chainId: CLAIM_CHAIN_ID }); } catch { alert("Switch to BSC Testnet"); return; } }
    if (!CLAIM_ADDRESS) { alert("Missing CLAIM address"); return; }
    if (collectAmount <= 0 || collectAmount > vault) { alert("Invalid amount!"); return; }
    setClaiming(true);
    try {
      const amountUnits = parseUnits(Number(collectAmount).toFixed(Math.min(2, MLEO_DECIMALS)), MLEO_DECIMALS);
      const hash = await writeContractAsync({ address: CLAIM_ADDRESS, abi: MINING_CLAIM_ABI, functionName: "claim", args: [BigInt(GAME_ID), amountUnits], chainId: CLAIM_CHAIN_ID, account: address });
      await publicClient.waitForTransactionReceipt({ hash });
      const newVault = Math.max(0, vault - collectAmount);
      setVault(newVault); setVaultState(newVault);
      alert(`✅ Sent ${fmt(collectAmount)} MLEO to wallet!`);
      setShowVaultModal(false);
    } catch (err) { console.error(err); alert("Claim failed or rejected"); } finally { setClaiming(false); }
  };

  const dealCards = (isFreePlayParam = false) => {
    if (gameState !== "betting") return;
    playSfx(clickSound.current);
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) { bet = result.amount; setIsFreePlay(false); router.replace('/texas-holdem', undefined, { shallow: true }); }
      else { alert('No free play tokens available!'); setIsFreePlay(false); return; }
    } else {
      if (bet < MIN_BET) { alert(`Minimum bet is ${MIN_BET} MLEO`); return; }
      if (currentVault < bet) { alert('Insufficient MLEO in vault'); return; }
      setVault(currentVault - bet); setVaultState(currentVault - bet);
    }
    setBetAmount(String(bet));
    setBaseBet(bet);

    const newDeck = shuffleDeck(createDeck());
    const player = [newDeck[0], newDeck[2]];
    const dealer = [newDeck[1], newDeck[3]];
    setDeck(newDeck.slice(4));
    
    // Clear everything
    setPlayerCards([]);
    setDealerCards([]);
    setCommunityCards([]);
    setPlayerHand(null);
    setDealerHand(null);
    setGameResult(null);
    // Initial pot: player ante + dealer ante
    setPot(bet * 2);
    setPlayerBetThisRound(bet);
    setDealerBetThisRound(bet);
    setTotalPlayerBet(bet);
    
    // Deal cards one by one: Player → Dealer → Player → Dealer
    setTimeout(() => setPlayerCards([player[0]]), 300);
    setTimeout(() => setDealerCards([dealer[0]]), 600);
    setTimeout(() => setPlayerCards(player), 900);
    setTimeout(() => {
      setDealerCards(dealer);
      setGameState("pre-flop");
    }, 1200);
  };

  const fold = () => {
    playSfx(clickSound.current);
    // Player loses what they've bet so far
    setGameResult({ win: false, tie: false, playerHand: null, dealerHand: null, prize: 0, profit: -totalPlayerBet, fold: true });
    const newStats = { ...stats, totalHands: stats.totalHands + 1, losses: stats.losses + 1, folds: stats.folds + 1, totalBet: stats.totalBet + totalPlayerBet, lastBet: baseBet };
    setStats(newStats);
    setGameState("finished");
  };

  const call = () => {
    playSfx(clickSound.current);
    const currentVault = getVault();
    const callAmount = baseBet;
    
    if (currentVault < callAmount) {
      alert('Insufficient MLEO!');
      return;
    }
    
    setVault(currentVault - callAmount);
    setVaultState(currentVault - callAmount);
    // Player bet + dealer match = pot grows by 2x
    setPot(pot + callAmount * 2);
    setPlayerBetThisRound(playerBetThisRound + callAmount);
    setTotalPlayerBet(totalPlayerBet + callAmount);
    
    // Dealer also matches (from pot perspective, dealer's bet is virtual)
    setDealerBetThisRound(dealerBetThisRound + callAmount);
    
    // Move to next stage
    if (gameState === "pre-flop") {
      dealFlop();
    }
  };

  const check = () => {
    playSfx(clickSound.current);
    
    // Move to next stage
    if (gameState === "flop") {
      dealTurn();
    } else if (gameState === "turn") {
      dealRiver();
    } else if (gameState === "river") {
      showdown();
    }
  };

  const bet = () => {
    playSfx(clickSound.current);
    const currentVault = getVault();
    const betAmount = baseBet;
    
    if (currentVault < betAmount) {
      alert('Insufficient MLEO!');
      return;
    }
    
    setVault(currentVault - betAmount);
    setVaultState(currentVault - betAmount);
    // Player bet + dealer match = pot grows by 2x
    setPot(pot + betAmount * 2);
    setPlayerBetThisRound(playerBetThisRound + betAmount);
    setTotalPlayerBet(totalPlayerBet + betAmount);
    
    // Dealer also matches
    setDealerBetThisRound(dealerBetThisRound + betAmount);
    
    // Move to next stage
    if (gameState === "flop") {
      dealTurn();
    } else if (gameState === "turn") {
      dealRiver();
    } else if (gameState === "river") {
      showdown();
    }
  };

  const dealFlop = () => {
    setGameState("dealing");
    const newDeck = [...deck];
    const flop = [newDeck[0], newDeck[1], newDeck[2]];
    setDeck(newDeck.slice(3));
    
    setTimeout(() => setCommunityCards([flop[0]]), 400);
    setTimeout(() => setCommunityCards([flop[0], flop[1]]), 700);
    setTimeout(() => {
      setCommunityCards(flop);
      setTimeout(() => {
        setPlayerBetThisRound(0);
        setDealerBetThisRound(0);
        setGameState("flop");
      }, 600);
    }, 1000);
  };

  const dealTurn = () => {
    setGameState("dealing");
    const newDeck = [...deck];
    const turn = newDeck[0];
    setDeck(newDeck.slice(1));
    
    setTimeout(() => {
      setCommunityCards([...communityCards, turn]);
      setTimeout(() => {
        setPlayerBetThisRound(0);
        setDealerBetThisRound(0);
        setGameState("turn");
      }, 600);
    }, 400);
  };

  const dealRiver = () => {
    setGameState("dealing");
    const newDeck = [...deck];
    const river = newDeck[0];
    setDeck(newDeck.slice(1));
    
    setTimeout(() => {
      setCommunityCards([...communityCards, river]);
      setTimeout(() => {
        setPlayerBetThisRound(0);
        setDealerBetThisRound(0);
        setGameState("river");
      }, 600);
    }, 400);
  };

  const showdown = () => {
    setGameState("showdown");
    
    setTimeout(() => {
      // Reveal dealer cards and evaluate
      const allPlayerCards = [...playerCards, ...communityCards];
      const allDealerCards = [...dealerCards, ...communityCards];
      
      const playerEval = evaluateHand(allPlayerCards);
      const dealerEval = evaluateHand(allDealerCards);
      
      setPlayerHand(playerEval);
      setDealerHand(dealerEval);
      
      setTimeout(() => {
        const result = compareHands(playerEval, dealerEval);
        let win = result === "player";
        let tie = result === "tie";
        let prize = 0;
        
        if (tie) {
          prize = pot;
        } else if (win) {
          prize = pot;
        }
        
        if (win || tie) {
          const newVault = getVault() + prize;
          setVault(newVault); setVaultState(newVault);
          if (win) playSfx(winSound.current);
        }
        
        const resultData = { win, tie, playerHand: playerEval.hand, dealerHand: dealerEval.hand, prize, profit: win ? prize - totalPlayerBet : tie ? 0 : -totalPlayerBet };
        setGameResult(resultData);
        setGameState("finished");
        
        const newStats = { ...stats, totalHands: stats.totalHands + 1, wins: win ? stats.wins + 1 : stats.wins, losses: (!win && !tie) ? stats.losses + 1 : stats.losses, ties: tie ? stats.ties + 1 : stats.ties, totalBet: stats.totalBet + totalPlayerBet, totalWon: (win || tie) ? stats.totalWon + prize : stats.totalWon, biggestWin: Math.max(stats.biggestWin, win ? prize : 0), lastBet: baseBet };
        setStats(newStats);
      }, 1200);
    }, 800);
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
    setPot(0);
    setPlayerBetThisRound(0);
    setDealerBetThisRound(0);
    setTotalPlayerBet(0);
    setBaseBet(0);
  };

  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-blue-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  const currentStage = gameState === "pre-flop" ? "PRE-FLOP" : 
                       gameState === "flop" ? "FLOP" : 
                       gameState === "turn" ? "TURN" : 
                       gameState === "river" ? "RIVER" : 
                       gameState === "showdown" ? "SHOWDOWN" : "";

  return (
    <Layout>
      <style jsx>{`
        @keyframes slideInCard {
          from {
            opacity: 0;
            transform: translateY(-30px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
        <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
        <div ref={headerRef} className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={backSafe} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
              {freePlayTokens > 0 && (<button onClick={() => dealCards(true)} disabled={gameState !== "betting"} className="relative px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all disabled:opacity-50" title={`${freePlayTokens} Free Play${freePlayTokens > 1 ? 's' : ''} Available`}><span className="text-base">🎁</span><span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{freePlayTokens}</span></button>)}
            </div>
            <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
              <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
              <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
            </div>
          </div>
        </div>

        <div className="relative h-full flex flex-col items-center justify-start px-4 pb-4" style={{ minHeight: "100%", paddingTop: "calc(var(--head-h, 56px) + 8px)" }}>
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">🎴 Texas Hold'em</h1>
            <p className="text-white/70 text-xs">vs Dealer • Best hand wins!</p>
          </div>
          <div ref={metersRef} className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Vault</div>
              <div className="text-sm font-bold text-emerald-400">{fmt(vault)}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Pot</div>
              <div className="text-sm font-bold text-amber-400">{fmt(pot)}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Stage</div>
              <div className="text-[10px] font-bold text-blue-400">{currentStage || "BETTING"}</div>
            </div>
          </div>

          <div className="mb-1 w-full max-w-md flex flex-col items-center justify-center" style={{ height: "var(--chart-h, 300px)" }}>
            {/* Dealer */}
            <div className="bg-black/20 border border-white/10 rounded-lg p-2 mb-2 w-full" style={{ minHeight: '90px' }}>
              <div className="text-xs text-white/60 mb-1 text-center">{dealerHand && `${dealerHand.hand}`}</div>
              <div className="flex gap-1 justify-center flex-wrap min-h-[64px]">
                {dealerCards.map((card, i) => (
                  <PlayingCard key={i} card={card} hidden={gameState !== "showdown" && gameState !== "finished"} delay={i * 300} />
                ))}
              </div>
            </div>
            
            {/* Community Cards */}
            <div className="bg-black/20 border border-yellow-500/20 rounded-lg p-2 mb-2 w-full" style={{ minHeight: '90px' }}>
              <div className="flex gap-1 justify-center flex-wrap min-h-[64px] pt-2">
                {communityCards.map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 300} />
                ))}
              </div>
            </div>
            
            {/* Player */}
            <div className="bg-black/20 border border-white/10 rounded-lg p-2 w-full" style={{ minHeight: '90px' }}>
              <div className="text-xs text-white/60 mb-1 text-center">{playerHand && `${playerHand.hand}`}</div>
              <div className="flex gap-1 justify-center flex-wrap min-h-[64px]">
                {playerCards.map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 300} />
                ))}
              </div>
            </div>
            
            <div className="text-center mt-2" style={{ height: '24px' }}>
              <div className={`text-sm font-bold transition-opacity ${gameResult ? 'opacity-100' : 'opacity-0'} ${gameResult?.win ? 'text-green-400' : gameResult?.tie ? 'text-yellow-400' : 'text-red-400'}`}>
                {gameResult ? (gameResult.fold ? 'FOLDED' : gameResult.tie ? 'TIE - PUSH' : gameResult.win ? 'YOU WIN!' : 'DEALER WINS') : 'waiting'}
              </div>
            </div>
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap" style={{ minHeight: '48px' }}>
            {gameState === "betting" && (
              <>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">1K</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 10000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">10K</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 100000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">100K</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">1M</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.max(MIN_BET, current - 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm">−</button>
                <input type="text" value={isEditingBet ? betAmount : formatBetDisplay(betAmount)} onFocus={() => setIsEditingBet(true)} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setBetAmount(val || '0'); }} onBlur={() => { setIsEditingBet(false); const current = Number(betAmount) || MIN_BET; setBetAmount(String(Math.max(MIN_BET, current))); }} className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold text-xs" />
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm">+</button>
                <button onClick={() => { setBetAmount(String(MIN_BET)); playSfx(clickSound.current); }} className="h-8 w-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs" title="Reset to minimum bet">↺</button>
              </>
            )}
          </div>

          <div ref={ctaRef} className="flex flex-col gap-3 w-full max-w-sm" style={{ minHeight: '140px' }}>
            {gameState === "betting" ? (
              <button onClick={() => dealCards(false)} className="w-full h-12 rounded-lg font-bold text-base bg-gradient-to-r from-green-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all">DEAL</button>
            ) : gameState === "pre-flop" ? (
              <div className="flex gap-2">
                <button onClick={fold} className="flex-1 h-12 rounded-lg font-bold text-sm bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:brightness-110">FOLD</button>
                <button onClick={call} className="flex-1 h-12 rounded-lg font-bold text-sm bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:brightness-110">CALL (×1)</button>
              </div>
            ) : (gameState === "flop" || gameState === "turn" || gameState === "river") ? (
              <div className="flex gap-2">
                <button onClick={check} className="flex-1 h-12 rounded-lg font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110">CHECK</button>
                <button onClick={bet} className="flex-1 h-12 rounded-lg font-bold text-sm bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg hover:brightness-110">BET (×1)</button>
              </div>
            ) : gameState === "finished" ? (
              <button onClick={newHand} className="w-full h-12 rounded-lg font-bold text-base bg-gradient-to-r from-green-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all">NEW HAND</button>
            ) : (
              <div className="w-full h-12 flex items-center justify-center text-white/60 text-sm font-bold">Dealing...</div>
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
              <div className="text-4xl mb-2">{gameResult.fold ? '🏳️' : gameResult.win ? '🎉' : gameResult.tie ? '🤝' : '😔'}</div>
              <div className="text-2xl font-bold mb-1">{gameResult.fold ? 'FOLDED' : gameResult.tie ? 'TIE!' : gameResult.win ? 'YOU WIN!' : 'DEALER WINS'}</div>
              <div className="text-lg">{gameResult.win || gameResult.tie ? `+${fmt(gameResult.prize)} MLEO` : `-${fmt(Math.abs(gameResult.profit))} MLEO`}</div>
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
              <div className="mt-4 text-xs opacity-70"><p>Texas Hold'em v1.0</p></div>
            </div>
          </div>
        )}

        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">🎴 How to Play</h2>
              <div className="space-y-3 text-sm">
                <p><strong>Game Flow:</strong></p>
                <p>• <strong>PRE-FLOP:</strong> Get 2 cards, choose FOLD or CALL (bet ×1)</p>
                <p>• <strong>FLOP:</strong> 3 community cards revealed, CHECK or BET (×1)</p>
                <p>• <strong>TURN:</strong> 4th community card, CHECK or BET (×1)</p>
                <p>• <strong>RIVER:</strong> 5th community card, CHECK or BET (×1)</p>
                <p>• <strong>SHOWDOWN:</strong> Best 5-card hand wins!</p>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                  <p className="text-green-300 font-semibold">Hand Rankings (High to Low):</p>
                  <div className="text-xs text-white/80 mt-2 space-y-1">
                    <p>1. Royal Flush 👑</p>
                    <p>2. Straight Flush</p>
                    <p>3. Four of a Kind</p>
                    <p>4. Full House</p>
                    <p>5. Flush</p>
                    <p>6. Straight</p>
                    <p>7. Three of a Kind</p>
                    <p>8. Two Pair</p>
                    <p>9. One Pair</p>
                    <p>10. High Card</p>
                  </div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-blue-300 font-semibold">Strategy Tips:</p>
                  <div className="text-xs text-white/80 mt-2 space-y-1">
                    <p>• FOLD weak hands pre-flop to save MLEO</p>
                    <p>• BET when you have strong hands</p>
                    <p>• CHECK to see free cards with medium hands</p>
                    <p>• Pot grows with each bet - risk vs reward!</p>
                  </div>
                </div>
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
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Wins</div><div className="text-lg font-bold text-green-400">{stats.wins}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Losses</div><div className="text-lg font-bold text-red-400">{stats.losses}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Ties</div><div className="text-lg font-bold text-yellow-400">{stats.ties}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Folds</div><div className="text-lg font-bold text-gray-400">{stats.folds}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Bet</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalBet)}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Net Profit</div><div className={`text-lg font-bold ${stats.totalWon - stats.totalBet >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(stats.totalWon - stats.totalBet)}</div></div>
                </div>
              </div>
              <button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button>
            </div>
          </div>
        )}

        {showVaultModal && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center"><div className="text-sm text-white/60 mb-1">Current Balance</div><div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div></div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label>
                  <div className="flex gap-2 mb-2">
                    <input type="number" value={collectAmount} onChange={(e) => setCollectAmount(Number(e.target.value))} className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white" min="1" max={vault} />
                    <button onClick={() => setCollectAmount(vault)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">MAX</button>
                  </div>
                  <button onClick={collectToWallet} disabled={collectAmount <= 0 || collectAmount > vault || claiming} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">{claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}</button>
                </div>
                <div className="text-xs text-white/60"><p>• Your vault is shared across all MLEO games</p><p>• Collect earnings to your wallet anytime</p><p>• Network: BSC Testnet (TBNB)</p></div>
              </div>
              <button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

