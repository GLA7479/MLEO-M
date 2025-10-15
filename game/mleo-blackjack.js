// ============================================================================
// MLEO Blackjack - Full Professional Blackjack
// Complete with Double Down, Split, Insurance, Surrender
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

const LS_KEY = "mleo_blackjack_v3";
const MIN_BET = 1000;
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 2;
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
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function canSplitCards(hand) {
  if (hand.length !== 2) return false;
  const val1 = getCardValue(hand[0]);
  const val2 = getCardValue(hand[1]);
  return val1 === val2;
}

function PlayingCard({ card, hidden = false }) {
  if (hidden) {
    return (
      <div className="w-10 h-14 rounded bg-gradient-to-br from-blue-600 to-blue-800 border border-white/30 flex items-center justify-center shadow">
        <span className="text-lg">🂠</span>
      </div>
    );
  }
  
  const isRed = card.suit === "♥️" || card.suit === "♦️";
  const color = isRed ? "text-red-600" : "text-black";
  
  return (
    <div className="w-10 h-14 rounded bg-white border border-gray-400 shadow p-0.5 relative">
      <div className={`text-[7px] font-bold ${color} absolute top-0 left-0.5 leading-tight`}>
        {card.value}
      </div>
      <div className={`text-base ${color} flex items-center justify-center h-full`}>
        {card.suit}
      </div>
    </div>
  );
}

export default function BlackjackPage() {
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
  const [deck, setDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [gameState, setGameState] = useState("betting");
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

  // Professional Blackjack Features
  const [canDouble, setCanDouble] = useState(false);
  const [canSplit, setCanSplit] = useState(false);
  const [canSurrender, setCanSurrender] = useState(false);
  const [showInsurance, setShowInsurance] = useState(false);
  const [insuranceBet, setInsuranceBet] = useState(0);
  const [hasDoubled, setHasDoubled] = useState(false);
  const [hasSurrendered, setHasSurrendered] = useState(false);
  const [splitHands, setSplitHands] = useState([]);
  const [currentSplitIndex, setCurrentSplitIndex] = useState(0);
  const [isSplitGame, setIsSplitGame] = useState(false);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { 
    totalHands: 0, wins: 0, losses: 0, pushes: 0, totalBet: 0, totalWon: 0, 
    biggestWin: 0, blackjacks: 0, doubles: 0, splits: 0, surrenders: 0, 
    insuranceWins: 0, insuranceLosses: 0, lastBet: MIN_BET 
  }));

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

  const checkDealerBlackjack = (dealer, player, bet) => {
    const dealerVal = calculateHandValue(dealer);
    if (dealerVal === 21) {
      const playerVal = calculateHandValue(player);
      if (playerVal === 21) {
        // Both have blackjack - push
        const newVault = getVault() + bet;
        setVault(newVault); setVaultState(newVault);
        setGameResult({ win: false, push: true, playerValue: 21, dealerValue: 21, prize: bet, profit: 0, blackjack: false });
        const newStats = { ...stats, totalHands: stats.totalHands + 1, pushes: stats.pushes + 1, totalBet: stats.totalBet + bet, totalWon: stats.totalWon + bet, lastBet: bet };
        setStats(newStats);
        setGameState("finished");
        return true;
      } else {
        // Dealer has blackjack, player doesn't - dealer wins
        setGameResult({ win: false, push: false, playerValue: playerVal, dealerValue: 21, prize: 0, profit: -bet, blackjack: false });
        const newStats = { ...stats, totalHands: stats.totalHands + 1, losses: stats.losses + 1, totalBet: stats.totalBet + bet, lastBet: bet };
        setStats(newStats);
        setGameState("finished");
        return true;
    }
    }
    return false;
  };

  const dealCards = (isFreePlayParam = false) => {
    if (gameState !== "betting") return;
    playSfx(clickSound.current);
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) { bet = result.amount; setIsFreePlay(false); router.replace('/blackjack', undefined, { shallow: true }); }
      else { alert('No free play tokens available!'); setIsFreePlay(false); return; }
    } else {
      if (bet < MIN_BET) { alert(`Minimum bet is ${MIN_BET} MLEO`); return; }
      if (currentVault < bet) { alert('Insufficient MLEO in vault'); return; }
      setVault(currentVault - bet); setVaultState(currentVault - bet);
    }
    setBetAmount(String(bet));

    // Reset all states
    setHasDoubled(false);
    setHasSurrendered(false);
    setShowInsurance(false);
    setInsuranceBet(0);
    setIsSplitGame(false);
    setSplitHands([]);
    setCurrentSplitIndex(0);

    const newDeck = shuffleDeck(createDeck());
    const player = [newDeck[0], newDeck[2]];
    const dealer = [newDeck[1], newDeck[3]];
    setDeck(newDeck.slice(4));
    setPlayerHand(player);
    setDealerHand(dealer);
    setGameResult(null);

    const playerValue = calculateHandValue(player);
    const dealerUpCard = dealer[0];

    // Check for natural blackjack
    if (playerValue === 21) {
      // Check if dealer also has blackjack
      if (checkDealerBlackjack(dealer, player, bet)) {
        return;
      }
      // Player blackjack wins
      setTimeout(() => finishGame(player, dealer, bet, true), 500);
      setGameState("finished");
        return;
      }

    // Check if dealer has Ace showing - offer insurance
    if (dealerUpCard.value === "A") {
      setShowInsurance(true);
      setGameState("insurance");
        return;
      }
      
    // Check if dealer has 10/J/Q/K - check for blackjack immediately
    if (getCardValue(dealerUpCard) === 10) {
      if (checkDealerBlackjack(dealer, player, bet)) {
        return;
      }
    }

    // Enable player options
    setCanDouble(true);
    setCanSplit(canSplitCards(player));
    setCanSurrender(true);
    setGameState("playing");
  };

  const takeInsurance = () => {
    playSfx(clickSound.current);
    const bet = Number(betAmount);
    const insuranceAmount = Math.floor(bet / 2);
    const currentVault = getVault();
    
    if (currentVault < insuranceAmount) {
      alert('Insufficient MLEO for insurance!');
      setShowInsurance(false);
      setGameState("playing");
      setCanDouble(true);
      setCanSplit(canSplitCards(playerHand));
      setCanSurrender(true);
      return;
    }

    setVault(currentVault - insuranceAmount);
    setVaultState(currentVault - insuranceAmount);
    setInsuranceBet(insuranceAmount);
    setShowInsurance(false);

    // Check for dealer blackjack
    const dealerVal = calculateHandValue(dealerHand);
    if (dealerVal === 21) {
      // Insurance pays 2:1
      const insurancePayout = insuranceAmount * 3; // bet + 2x win
      const newVault = getVault() + insurancePayout;
      setVault(newVault); setVaultState(newVault);
      
      // Player loses main bet but wins insurance
      const playerVal = calculateHandValue(playerHand);
      setGameResult({ 
        win: false, 
        push: false, 
        playerValue: playerVal, 
        dealerValue: 21, 
        prize: insurancePayout, 
        profit: insuranceAmount - bet, // Insurance win - main bet loss
        blackjack: false,
        insurance: true
      });
      const newStats = { ...stats, totalHands: stats.totalHands + 1, losses: stats.losses + 1, totalBet: stats.totalBet + bet + insuranceAmount, totalWon: stats.totalWon + insurancePayout, insuranceWins: stats.insuranceWins + 1, lastBet: bet };
      setStats(newStats);
      setGameState("finished");
      return;
    } else {
      // No blackjack - insurance lost
      const newStats = { ...stats, insuranceLosses: stats.insuranceLosses + 1 };
      setStats(newStats);
    }

    setGameState("playing");
    setCanDouble(true);
    setCanSplit(canSplitCards(playerHand));
    setCanSurrender(true);
  };

  const declineInsurance = () => {
    playSfx(clickSound.current);
    setShowInsurance(false);
    
    // Check for dealer blackjack anyway
    if (checkDealerBlackjack(dealerHand, playerHand, Number(betAmount))) {
      return;
    }

    setGameState("playing");
    setCanDouble(true);
    setCanSplit(canSplitCards(playerHand));
    setCanSurrender(true);
  };

  const doubleDown = () => {
    if (!canDouble || gameState !== "playing") return;
    playSfx(clickSound.current);

    const bet = Number(betAmount);
    const currentVault = getVault();
    
    if (currentVault < bet) {
      alert('Insufficient MLEO to double down!');
      return;
    }

    setVault(currentVault - bet);
    setVaultState(currentVault - bet);
    setBetAmount(String(bet * 2));
    setHasDoubled(true);
    setCanDouble(false);
    setCanSplit(false);
    setCanSurrender(false);

    // Draw one card and stand
    const newCard = deck[0];
    const newHand = [...playerHand, newCard];
    setPlayerHand(newHand);
    setDeck(deck.slice(1));

    const value = calculateHandValue(newHand);
    if (value > 21) {
      setGameState("finished");
      finishGame(newHand, dealerHand, bet * 2, false);
    } else {
      // Automatically stand after double down
      stand(newHand, bet * 2);
    }

    const newStats = { ...stats, doubles: stats.doubles + 1 };
    setStats(newStats);
  };

  const split = () => {
    if (!canSplit || gameState !== "playing") return;
    playSfx(clickSound.current);

    const bet = Number(betAmount);
    const currentVault = getVault();
    
    if (currentVault < bet) {
      alert('Insufficient MLEO to split!');
      return;
    }

    setVault(currentVault - bet);
    setVaultState(currentVault - bet);
    setCanDouble(false);
    setCanSplit(false);
    setCanSurrender(false);
    setIsSplitGame(true);

    // Split into two hands
    const card1 = playerHand[0];
    const card2 = playerHand[1];
    const newCard1 = deck[0];
    const newCard2 = deck[1];
    
    const hand1 = [card1, newCard1];
    const hand2 = [card2, newCard2];
    
    setSplitHands([
      { cards: hand1, bet: bet, finished: false, result: null },
      { cards: hand2, bet: bet, finished: false, result: null }
    ]);
    setCurrentSplitIndex(0);
    setPlayerHand(hand1);
    setDeck(deck.slice(2));

    // Check if split aces - only one card each
    if (card1.value === "A") {
      // Split aces get only one card each - finish both hands
      setTimeout(() => finishSplitHands([
        { cards: hand1, bet: bet, finished: true, result: null },
        { cards: hand2, bet: bet, finished: true, result: null }
      ], bet), 500);
    }

    const newStats = { ...stats, splits: stats.splits + 1 };
    setStats(newStats);
  };

  const finishSplitHands = (hands, individualBet) => {
    setGameState("dealer");
    let currentDealerHand = [...dealerHand];
    let currentDeck = [...deck];

    // Dealer plays
    let dealerValue = calculateHandValue(currentDealerHand);
    while (dealerValue < 17) {
      currentDealerHand.push(currentDeck[0]);
      currentDeck = currentDeck.slice(1);
      dealerValue = calculateHandValue(currentDealerHand);
    }
    setDealerHand(currentDealerHand);
    setDeck(currentDeck);

    // Evaluate each hand
    let totalPrize = 0;
    let wins = 0;
    let losses = 0;
    let pushes = 0;

    hands.forEach(hand => {
      const playerValue = calculateHandValue(hand.cards);
      let win = false;
      let push = false;
      let prize = 0;

      if (playerValue > 21) {
        win = false;
      } else if (dealerValue > 21) {
        win = true;
        prize = individualBet * 2;
      } else if (playerValue > dealerValue) {
        win = true;
        prize = individualBet * 2;
      } else if (playerValue === dealerValue) {
        push = true;
        prize = individualBet;
      }

      if (win) wins++;
      else if (push) pushes++;
      else losses++;

      totalPrize += prize;
    });

    if (totalPrize > 0) {
      const newVault = getVault() + totalPrize;
      setVault(newVault); setVaultState(newVault);
      if (wins > 0) playSfx(winSound.current);
    }

    const totalBet = individualBet * 2;
    const profit = totalPrize - totalBet;

    setGameResult({ 
      win: wins > losses, 
      push: wins === 0 && losses === 0, 
      prize: totalPrize, 
      profit: profit,
      split: true,
      splitWins: wins,
      splitLosses: losses,
      splitPushes: pushes
    });

    const newStats = { 
      ...stats, 
      totalHands: stats.totalHands + 2, // Split counts as 2 hands
      wins: stats.wins + wins,
      losses: stats.losses + losses,
      pushes: stats.pushes + pushes,
      totalBet: stats.totalBet + totalBet,
      totalWon: stats.totalWon + totalPrize,
      biggestWin: Math.max(stats.biggestWin, totalPrize),
      lastBet: individualBet
    };
    setStats(newStats);
    setGameState("finished");
  };

  const surrender = () => {
    if (!canSurrender || gameState !== "playing") return;
    playSfx(clickSound.current);
    
    const bet = Number(betAmount);
    const refund = Math.floor(bet / 2);
    
    // Refund half the bet
    const newVault = getVault() + refund;
    setVault(newVault); setVaultState(newVault);
    
    setHasSurrendered(true);
    setCanDouble(false);
    setCanSplit(false);
    setCanSurrender(false);

    setGameResult({ 
      win: false, 
      push: false, 
      playerValue: calculateHandValue(playerHand), 
      dealerValue: 0, 
      prize: refund, 
      profit: -Math.floor(bet / 2),
      surrender: true
    });

    const newStats = {
      ...stats,
      totalHands: stats.totalHands + 1,
      losses: stats.losses + 1,
      surrenders: stats.surrenders + 1,
      totalBet: stats.totalBet + bet,
      totalWon: stats.totalWon + refund,
      lastBet: bet
    };
    setStats(newStats);
    setGameState("finished");
  };

  const hit = () => {
    if (gameState !== "playing") return;
    playSfx(clickSound.current);
    
    // Disable special actions after first hit
    setCanDouble(false);
    setCanSurrender(false);

    if (isSplitGame) {
      const currentHand = splitHands[currentSplitIndex];
      const newCard = deck[0];
      const newCards = [...currentHand.cards, newCard];
      const newHands = [...splitHands];
      newHands[currentSplitIndex].cards = newCards;
      setSplitHands(newHands);
      setPlayerHand(newCards);
      setDeck(deck.slice(1));

      const value = calculateHandValue(newCards);
      if (value > 21) {
        // This hand busted, move to next
        newHands[currentSplitIndex].finished = true;
        if (currentSplitIndex < splitHands.length - 1) {
          const nextIndex = currentSplitIndex + 1;
          setCurrentSplitIndex(nextIndex);
          setPlayerHand(splitHands[nextIndex].cards);
        } else {
          // All hands finished
          finishSplitHands(newHands, splitHands[0].bet);
        }
      } else if (value === 21) {
        // Stand automatically on 21
        standSplitHand();
      }
    } else {
      const newCard = deck[0];
      const newHand = [...playerHand, newCard];
      setPlayerHand(newHand);
      setDeck(deck.slice(1));

      const value = calculateHandValue(newHand);
      if (value > 21) {
        setGameState("finished");
        finishGame(newHand, dealerHand, Number(betAmount), false);
      } else if (value === 21) {
        stand(newHand);
      }
    }
  };

  const standSplitHand = () => {
    const newHands = [...splitHands];
    newHands[currentSplitIndex].finished = true;
    setSplitHands(newHands);

    if (currentSplitIndex < splitHands.length - 1) {
      const nextIndex = currentSplitIndex + 1;
      setCurrentSplitIndex(nextIndex);
      setPlayerHand(splitHands[nextIndex].cards);
    } else {
      // All hands finished
      finishSplitHands(newHands, splitHands[0].bet);
    }
  };

  const stand = (hand = null, customBet = null) => {
    if (gameState !== "playing") return;
    playSfx(clickSound.current);
    
    if (isSplitGame) {
      standSplitHand();
      return;
    }

    setGameState("dealer");
    setCanDouble(false);
    setCanSplit(false);
    setCanSurrender(false);

    const currentPlayerHand = hand || playerHand;
    const bet = customBet || Number(betAmount);
    let currentDealerHand = [...dealerHand];
    let currentDeck = [...deck];

    const dealerPlay = () => {
      let dealerValue = calculateHandValue(currentDealerHand);
      while (dealerValue < 17) {
        currentDealerHand.push(currentDeck[0]);
        currentDeck = currentDeck.slice(1);
        dealerValue = calculateHandValue(currentDealerHand);
      }
      setDealerHand(currentDealerHand);
      setDeck(currentDeck);
      setGameState("finished");
      setTimeout(() => finishGame(currentPlayerHand, currentDealerHand, bet, false), 500);
    };

    setTimeout(dealerPlay, 500);
  };

  const finishGame = (player, dealer, bet, isBlackjack) => {
    const playerValue = calculateHandValue(player);
    const dealerValue = calculateHandValue(dealer);
    let win = false;
    let push = false;
    let prize = 0;

    if (isBlackjack) {
      win = true;
      prize = Math.floor(bet * 2.5);
    } else if (playerValue > 21) {
      win = false;
    } else if (dealerValue > 21) {
      win = true;
      prize = bet * 2;
    } else if (playerValue > dealerValue) {
      win = true;
      prize = bet * 2;
    } else if (playerValue === dealerValue) {
      push = true;
      prize = bet;
    }

    if (win || push) {
      const newVault = getVault() + prize;
      setVault(newVault); setVaultState(newVault);
      if (win) playSfx(winSound.current);
    }

    const resultData = { win, push, playerValue, dealerValue, prize, profit: win ? prize - bet : push ? 0 : -bet, blackjack: isBlackjack };
    setGameResult(resultData);

    const newStats = { ...stats, totalHands: stats.totalHands + 1, wins: win ? stats.wins + 1 : stats.wins, losses: (!win && !push) ? stats.losses + 1 : stats.losses, pushes: push ? stats.pushes + 1 : stats.pushes, totalBet: stats.totalBet + bet, totalWon: (win || push) ? stats.totalWon + prize : stats.totalWon, biggestWin: Math.max(stats.biggestWin, win ? prize : 0), blackjacks: isBlackjack ? stats.blackjacks + 1 : stats.blackjacks, lastBet: bet };
    setStats(newStats);
  };

  const newHand = () => { 
    setGameState("betting"); 
    setPlayerHand([]);
    setDealerHand([]);
    setGameResult(null); 
    setShowResultPopup(false);
    setCanDouble(false);
    setCanSplit(false);
    setCanSurrender(false);
    setShowInsurance(false);
    setInsuranceBet(0);
    setHasDoubled(false);
    setHasSurrendered(false);
    setIsSplitGame(false);
    setSplitHands([]);
    setCurrentSplitIndex(0);
  };

  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return <div className="min-h-screen bg-gradient-to-br from-red-900 via-black to-green-900 flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>;

  const playerValue = calculateHandValue(playerHand);
  const dealerValue = calculateHandValue(dealerHand);
  const potentialWin = Math.floor(Number(betAmount) * 2);

  return (
    <Layout>
      <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-red-900 via-black to-green-900" style={{ height: '100svh' }}>
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
            <h1 className="text-2xl font-extrabold text-white mb-0.5">♠️ Blackjack Pro</h1>
            <p className="text-white/70 text-xs">Professional Blackjack • All Features!</p>
          </div>
          <div ref={metersRef} className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Vault</div>
              <div className="text-sm font-bold text-emerald-400">{fmt(vault)}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Bet</div>
              <div className="text-sm font-bold text-amber-400">{fmt(Number(betAmount))}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Win</div>
              <div className="text-sm font-bold text-green-400">{fmt(potentialWin)}</div>
            </div>
          </div>

          <div className="mb-1 w-full max-w-md flex flex-col items-center justify-center" style={{ height: "var(--chart-h, 300px)" }}>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3 mb-2" style={{ minHeight: '90px' }}>
              <div className="text-xs text-white/60 mb-1">Dealer {gameState !== "betting" && gameState !== "insurance" && `(${dealerValue})`}</div>
              <div className="flex gap-1 flex-wrap min-h-[60px]">
                {dealerHand.map((card, i) => (
                  <PlayingCard key={i} card={card} hidden={(gameState === "playing" || gameState === "insurance") && i === 1} />
                  ))}
                </div>
                            </div>
            <div className="bg-black/20 border border-white/10 rounded-lg p-3" style={{ minHeight: '90px' }}>
              <div className="text-xs text-white/60 mb-1">You {gameState !== "betting" && gameState !== "insurance" && `(${playerValue})`} {isSplitGame && `- Hand ${currentSplitIndex + 1}/2`}</div>
              <div className="flex gap-1 flex-wrap min-h-[60px]">
                {playerHand.map((card, i) => (
                  <PlayingCard key={i} card={card} />
                          ))}
                          </div>
                        </div>
            <div className="text-center mt-2" style={{ height: '28px' }}>
              <div className={`text-base font-bold transition-opacity ${gameResult ? 'opacity-100' : 'opacity-0'} ${gameResult?.win ? 'text-green-400' : gameResult?.push ? 'text-yellow-400' : 'text-red-400'}`}>
                {gameResult ? (
                  gameResult.surrender ? 'SURRENDERED' :
                  gameResult.split ? `${gameResult.splitWins}W ${gameResult.splitLosses}L ${gameResult.splitPushes}P` :
                  gameResult.blackjack ? 'BLACKJACK!' : 
                  gameResult.push ? 'PUSH' : 
                  gameResult.win ? 'YOU WIN!' : 
                  'DEALER WINS'
                ) : 'waiting'}
                  </div>
              </div>
            </div>
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap" style={{ minHeight: '48px' }}>
            {gameState === "betting" ? (
              <>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 1000) : Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">1K</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 10000) : Math.min(vault, current + 10000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">10K</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 100000) : Math.min(vault, current + 100000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">100K</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = current === MIN_BET ? Math.min(vault, 1000000) : Math.min(vault, current + 1000000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs">1M</button>
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.max(MIN_BET, current - 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm">−</button>
                <input type="text" value={isEditingBet ? betAmount : formatBetDisplay(betAmount)} onFocus={() => setIsEditingBet(true)} onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setBetAmount(val || '0'); }} onBlur={() => { setIsEditingBet(false); const current = Number(betAmount) || MIN_BET; setBetAmount(String(Math.max(MIN_BET, current))); }} className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold text-xs" />
                <button onClick={() => { const current = Number(betAmount) || MIN_BET; const newBet = Math.min(vault, current + 1000); setBetAmount(String(newBet)); playSfx(clickSound.current); }} className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm">+</button>
                <button onClick={() => { setBetAmount(String(MIN_BET)); playSfx(clickSound.current); }} className="h-8 w-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs" title="Reset to minimum bet">↺</button>
              </>
            ) : (
              <div className="flex gap-2 w-full max-w-sm justify-center">
                <button onClick={hit} className="w-24 py-3 rounded-lg font-bold text-base bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110">HIT</button>
                <button onClick={() => stand()} className="w-24 py-3 rounded-lg font-bold text-base bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg hover:brightness-110">STAND</button>
              </div>
            )}
          </div>

          <div ref={ctaRef} className="flex flex-col gap-3 w-full max-w-sm" style={{ minHeight: '140px' }}>
            {gameState === "playing" && (
              <div className="flex gap-2">
                <button onClick={hit} className="flex-1 py-2 rounded-lg font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110">HIT</button>
                <button onClick={() => stand()} className="flex-1 py-2 rounded-lg font-bold text-sm bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg hover:brightness-110">STAND</button>
              </div>
            )}
            {gameState === "playing" && (canDouble || canSplit || canSurrender) && (
              <div className="flex gap-2">
                {canDouble && <button onClick={doubleDown} className="flex-1 py-2 rounded-lg font-bold text-xs bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg hover:brightness-110">DOUBLE</button>}
                {canSplit && <button onClick={split} className="flex-1 py-2 rounded-lg font-bold text-xs bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg hover:brightness-110">SPLIT</button>}
                {canSurrender && <button onClick={surrender} className="flex-1 py-2 rounded-lg font-bold text-xs bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-lg hover:brightness-110">SURRENDER</button>}
              </div>
            )}
            {(gameState === "betting" || gameState === "finished" || gameState === "dealer") && (
              <button onClick={gameState === "betting" ? () => dealCards(false) : newHand} disabled={gameState === "dealer"} className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-red-500 to-green-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50">
                {gameState === "dealer" ? "Dealing..." : gameState === "finished" ? "NEW HAND" : "DEAL"}
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
              <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
              <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
            </div>
          </div>
        </div>

        {showResultPopup && gameResult && (<div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"><div className={`${gameResult.win ? 'bg-green-500' : gameResult.push ? 'bg-yellow-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}><div className="text-4xl mb-2">{gameResult.blackjack ? '💎' : gameResult.surrender ? '🏳️' : gameResult.split ? '✂️' : gameResult.win ? '🎉' : gameResult.push ? '🤝' : '😔'}</div><div className="text-2xl font-bold mb-1">{gameResult.surrender ? 'SURRENDERED' : gameResult.split ? `SPLIT: ${gameResult.splitWins}W ${gameResult.splitLosses}L` : gameResult.blackjack ? 'BLACKJACK!' : gameResult.win ? 'YOU WIN!' : gameResult.push ? 'PUSH' : 'DEALER WINS'}</div><div className="text-lg">{gameResult.win || gameResult.push ? `+${fmt(gameResult.prize)} MLEO` : `-${fmt(Math.abs(gameResult.profit))} MLEO`}</div>{!gameResult.surrender && !gameResult.split && <div className="text-sm opacity-80 mt-2">You: {gameResult.playerValue} • Dealer: {gameResult.dealerValue}</div>}{gameResult.insurance && <div className="text-sm opacity-80 mt-1">🛡️ Insurance Paid!</div>}</div></div>)}

        {menuOpen && (<div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}><div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div><div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div><div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div><div className="mt-4 text-xs opacity-70"><p>Blackjack Pro v3.0</p></div></div></div>)}

        {showHowToPlay && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">♠️ How to Play</h2><div className="space-y-3 text-sm"><p><strong>Basic Rules:</strong></p><p>• Get closer to 21 than dealer without busting</p><p>• Dealer hits until 17+</p><p><strong>Actions:</strong></p><p>• <strong>HIT:</strong> Take another card</p><p>• <strong>STAND:</strong> Keep your hand</p><p>• <strong>DOUBLE:</strong> Double bet, get 1 card</p><p>• <strong>SPLIT:</strong> Split pairs into 2 hands</p><p>• <strong>SURRENDER:</strong> Forfeit & get ½ bet back</p><p>• <strong>INSURANCE:</strong> Protect vs dealer Ace</p><div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3"><p className="text-red-300 font-semibold">Payouts:</p><div className="text-xs text-white/80 mt-2 space-y-1"><p>• Blackjack: ×2.5 💎</p><p>• Win: ×2</p><p>• Push: Money back</p><p>• Insurance: ×2 (if dealer BJ)</p></div></div></div><button onClick={() => setShowHowToPlay(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showStats && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Hands</div><div className="text-xl font-bold">{stats.totalHands}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Win Rate</div><div className="text-xl font-bold text-green-400">{stats.totalHands > 0 ? ((stats.wins / stats.totalHands) * 100).toFixed(1) : 0}%</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Blackjacks</div><div className="text-lg font-bold text-yellow-400">{stats.blackjacks} 💎</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Doubles</div><div className="text-lg font-bold text-purple-400">{stats.doubles}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Splits</div><div className="text-lg font-bold text-pink-400">{stats.splits}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Surrenders</div><div className="text-lg font-bold text-gray-400">{stats.surrenders}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Bet</div><div className="text-lg font-bold text-amber-400">{fmt(stats.totalBet)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Won</div><div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Win</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div></div><div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Net Profit</div><div className={`text-lg font-bold ${stats.totalWon - stats.totalBet >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(stats.totalWon - stats.totalBet)}</div></div></div><div className="bg-gradient-to-r from-blue-500/10 to-yellow-500/10 border border-blue-500/30 rounded-lg p-4"><div className="text-sm font-semibold mb-2">🛡️ Insurance</div><div className="text-center"><div className="text-2xl font-bold text-blue-300">{stats.insuranceWins}W / {stats.insuranceLosses}L</div><div className="text-xs text-white/60 mt-1">Insurance Bets</div></div></div></div><button onClick={() => setShowStats(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showVaultModal && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto"><h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2><div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center"><div className="text-sm text-white/60 mb-1">Current Balance</div><div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div></div><div className="space-y-4"><div><label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label><div className="flex gap-2 mb-2"><input type="number" value={collectAmount} onChange={(e) => setCollectAmount(Number(e.target.value))} className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white" min="1" max={vault} /><button onClick={() => setCollectAmount(vault)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold">MAX</button></div><button onClick={collectToWallet} disabled={collectAmount <= 0 || collectAmount > vault || claiming} className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed">{claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}</button></div><div className="text-xs text-white/60"><p>• Your vault is shared across all MLEO games</p><p>• Collect earnings to your wallet anytime</p><p>• Network: BSC Testnet (TBNB)</p></div></div><button onClick={() => setShowVaultModal(false)} className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold">Close</button></div></div>)}

        {showInsurance && (<div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"><div className="bg-yellow-500/20 border-2 border-yellow-500/50 rounded-xl p-6 text-center max-w-md w-full shadow-2xl animate-pulse"><div className="text-2xl font-bold text-yellow-300 mb-3">🛡️ Insurance?</div><div className="text-base text-white/90 mb-3">Dealer has Ace. Protect against Blackjack?</div><div className="text-sm text-white/70 mb-4">Cost: {fmt(Math.floor(Number(betAmount) / 2))} MLEO</div><div className="flex gap-3"><button onClick={takeInsurance} className="flex-1 py-3 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold">YES</button><button onClick={declineInsurance} className="flex-1 py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold">NO</button></div></div></div>)}
      </div>
    </Layout>
  );
}
