// ============================================================================
// MLEO Texas Hold'em Multiplayer - FULL GAME
// Complete Texas Hold'em with all betting rounds and turn management
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { MultiplayerEngine } from "../lib/multiplayer-engine";

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

const LS_KEY = "mleo_texas_holdem_multiplayer_v1";
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 31;
const MINING_CLAIM_ABI = [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "gameId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] }];
const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";
const SMALL_BLIND = 50;
const BIG_BLIND = 100;

function safeRead(key, fallback = {}) { if (typeof window === "undefined") return fallback; try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val) { if (typeof window === "undefined") return; try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function getVault() { const rushData = safeRead("mleo_rush_core_v4", {}); return rushData.vault || 0; }
function setVault(amount) { const rushData = safeRead("mleo_rush_core_v4", {}); rushData.vault = amount; safeWrite("mleo_rush_core_v4", rushData); }
function fmt(n) { if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return Math.floor(n).toString(); }
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
  if (cards.length < 5) return { hand: "High Card", rank: 1, highCard: 0 };
  
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
                     (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2);
  
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

function PlayingCard({ card, hidden = false, delay = 0 }) {
  if (hidden) {
    return (
      <div 
        className="w-10 h-14 rounded bg-gradient-to-br from-red-600 to-red-800 border border-white/30 flex items-center justify-center shadow text-lg"
        style={{ animation: `slideInCard 0.4s ease-out ${delay}ms both`, opacity: 0 }}
      >
        🂠
      </div>
    );
  }
  
  const isRed = card.suit === "♥️" || card.suit === "♦️";
  const color = isRed ? "text-red-600" : "text-black";
  
  return (
    <div 
      className="w-10 h-14 rounded bg-white border border-gray-400 shadow p-0.5 relative"
      style={{ animation: `slideInCard 0.4s ease-out ${delay}ms both`, opacity: 0 }}
    >
      <div className={`text-xs font-bold ${color} absolute top-0.5 left-1 leading-tight`}>
        {card.value}
      </div>
      <div className={`text-base ${color} flex items-center justify-center h-full`}>
        {card.suit}
      </div>
    </div>
  );
}

export default function TexasHoldemMultiplayerPage() {
  useIOSViewportFix();
  const router = useRouter();
  const engineRef = useRef(null);
  const clickSound = useRef(null);
  const winSound = useRef(null);
  const wrapRef = useRef(null);

  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const [screen, setScreen] = useState("menu");
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [startingChips, setStartingChips] = useState(10000);
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  
  // Betting logic states
  const [betAmount, setBetAmount] = useState("100");
  const [maxEntryAmount] = useState(2000000); // 2M מקסימום
  const [showBetModal, setShowBetModal] = useState(false);
  const [isAllIn, setIsAllIn] = useState(false);
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [collectAmount, setCollectAmount] = useState(1000);
  const [vault, setVaultState] = useState(0);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalGames: 0, wins: 0, losses: 0, biggestPot: 0 }));

  // Use ref to track current gameState for callbacks
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const playSfx = (sound) => { if (sfxMuted || !sound) return; try { sound.currentTime = 0; sound.play().catch(() => {}); } catch {} };

  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    if (typeof Audio !== "undefined") {
      try { 
        clickSound.current = new Audio(S_CLICK); 
        winSound.current = new Audio(S_WIN); 
      } catch {}
    }
    
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    
    const interval = setInterval(() => { setVaultState(getVault()); }, 2000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (engineRef.current) {
        engineRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => { safeWrite(LS_KEY, stats); }, [stats]);

  // Update onStateUpdate callback when screen changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.onStateUpdate = (state) => {
        console.log("State updated:", state);
        setGameState(state);
        setForceUpdate(prev => prev + 1); // Force re-render
        if (state.status === "playing" && screen === "lobby") {
          setScreen("game");
        }
      };
    }
  }, [screen, forceUpdate]);

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

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    playSfx(clickSound.current);
    setIsConnecting(true);
    setError("");

    try {
      const engine = new MultiplayerEngine();
      engineRef.current = engine;

      // onStateUpdate will be set in useEffect

      engine.onPlayerJoin = (player) => {
        console.log("Player joined:", player);
        // The onStateUpdate will handle the state update
      };

      engine.onPlayerLeave = (player) => {
        console.log("Player left:", player);
        // The onStateUpdate will handle the state update
      };

      engine.onError = (err) => {
        console.error("Create room engine error:", err);
        setError("Connection error: " + err.message);
      };

      const result = await engine.createRoom(playerName, maxPlayers, startingChips);
      
      setPlayerId(result.playerId);
      setIsHost(true);
      setRoomCode(result.roomCode);
      setGameState(engine.gameState);
      setScreen("lobby");

    } catch (err) {
      console.error("Create room error:", err);
      setError("Failed to create room. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!roomCode.trim() || roomCode.length !== 5) {
      setError("Please enter a valid 5-character room code");
      return;
    }

    playSfx(clickSound.current);
    setIsConnecting(true);
    setError("");

    try {
      const engine = new MultiplayerEngine();
      engineRef.current = engine;

      // onStateUpdate will be set in useEffect

      engine.onPlayerJoin = (player) => {
        console.log("Player joined:", player);
        // The onStateUpdate will handle the state update
      };

      engine.onPlayerLeave = (player) => {
        console.log("Player left:", player);
        // The onStateUpdate will handle the state update
      };

      engine.onError = (err) => {
        console.error("Join room engine error:", err);
        setError("Connection error: " + err.message);
      };

      const result = await engine.joinRoom(roomCode.toUpperCase(), playerName);
      
      setPlayerId(result.playerId);
      setIsHost(false);
      setScreen("lobby");

    } catch (err) {
      console.error("Join room error:", err);
      setError("Failed to join room. Please check the room code.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartGame = () => {
    if (!isHost) return;
    if (!gameState || gameState.players.length < 2) {
      setError("Need at least 2 players to start");
      return;
    }

    playSfx(clickSound.current);
    
    const deck = shuffleDeck(createDeck());
    const players = gameState.players.map((player, idx) => ({
      ...player,
      cards: [deck[idx * 2], deck[idx * 2 + 1]],
      bet: idx === 0 ? SMALL_BLIND : idx === 1 ? BIG_BLIND : 0,
      folded: false,
      chips: 10000 - (idx === 0 ? SMALL_BLIND : idx === 1 ? BIG_BLIND : 0)
    }));

    const communityCards = [
      deck[players.length * 2],
      deck[players.length * 2 + 1],
      deck[players.length * 2 + 2],
      deck[players.length * 2 + 3],
      deck[players.length * 2 + 4]
    ];

    const updatedState = {
      ...gameState,
      status: "playing",
      players: players,
      communityCards: communityCards,
      communityVisible: 0,
      pot: SMALL_BLIND + BIG_BLIND,
      currentPlayerIndex: 2 >= players.length ? 0 : 2,
      round: "pre-flop",
      currentBet: BIG_BLIND,
      deck: deck
    };

    engineRef.current.updateGameState(updatedState);
    setScreen("game");
  };

  const handlePlayerAction = (action, amount = 0) => {
    if (!gameState) return;
    
    const players = gameState.players || [];
    const myPlayer = players.find(p => p.id === playerId);
    const currentPlayer = players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === playerId;
    
    if (!isMyTurn || myPlayer?.folded) return;
    
    playSfx(clickSound.current);
    
    const updatedPlayers = [...gameState.players];
    
    if (action === "fold") {
      updatedPlayers[gameState.currentPlayerIndex] = {
        ...currentPlayer,
        folded: true
      };
    } else if (action === "call") {
      const callAmount = gameState.currentBet - currentPlayer.bet;
      updatedPlayers[gameState.currentPlayerIndex] = {
        ...currentPlayer,
        bet: gameState.currentBet,
        chips: currentPlayer.chips - callAmount
      };
      gameState.pot += callAmount;
    } else if (action === "check") {
      // No change needed
    } else if (action === "raise") {
      const raiseAmount = Math.min(amount, currentPlayer.chips);
      updatedPlayers[gameState.currentPlayerIndex] = {
        ...currentPlayer,
        bet: currentPlayer.bet + raiseAmount,
        chips: currentPlayer.chips - raiseAmount
      };
      gameState.pot += raiseAmount;
      gameState.currentBet = currentPlayer.bet + raiseAmount;
    } else if (action === "allin") {
      const allInAmount = currentPlayer.chips;
      updatedPlayers[gameState.currentPlayerIndex] = {
        ...currentPlayer,
        bet: currentPlayer.bet + allInAmount,
        chips: 0,
        allIn: true
      };
      gameState.pot += allInAmount;
      gameState.currentBet = Math.max(gameState.currentBet, currentPlayer.bet + allInAmount);
    }
    
    // Move to next player
    let nextIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    while (updatedPlayers[nextIndex].folded) {
      nextIndex = (nextIndex + 1) % gameState.players.length;
    }
    
    // Check if round is over
    const activePlayers = updatedPlayers.filter(p => !p.folded);
    const allBetsEqual = activePlayers.every(p => p.bet === gameState.currentBet);
    
    let newRound = gameState.round;
    let newVisible = gameState.communityVisible;
    
    if (allBetsEqual && nextIndex === 0) {
      if (gameState.round === "pre-flop") {
        newRound = "flop";
        newVisible = 3;
      } else if (gameState.round === "flop") {
        newRound = "turn";
        newVisible = 4;
      } else if (gameState.round === "turn") {
        newRound = "river";
        newVisible = 5;
      } else if (gameState.round === "river") {
        // Show down
        newRound = "showdown";
      }
      
      // Reset bets for new round
      updatedPlayers.forEach(p => p.bet = 0);
      gameState.currentBet = 0;
    }
    
    const updatedState = {
      ...gameState,
      players: updatedPlayers,
      currentPlayerIndex: nextIndex,
      round: newRound,
      communityVisible: newVisible
    };
    
    engineRef.current.updateGameState(updatedState);
  };

  const copyRoomCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      alert("Room code copied!");
    }
  };

  const backToMenu = () => {
    playSfx(clickSound.current);
    if (engineRef.current) {
      engineRef.current.disconnect();
    }
    setScreen("menu");
    setError("");
    setGameState(null);
    setRoomCode("");
  };

  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return null;

  // MENU SCREEN
  if (screen === "menu") {
    return (
      <Layout>
        <div ref={wrapRef} className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4 flex gap-2 z-50">
            <button onClick={backSafe} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
          </div>

          <div className="absolute top-4 right-4 flex gap-2 z-50">
            <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
            <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-extrabold text-white mb-2">🎴 Texas Hold'em</h1>
              <p className="text-white/70 text-lg">Multiplayer</p>
            </div>

            <div className="w-full max-w-md space-y-4">
              <button 
                onClick={() => { playSfx(clickSound.current); setScreen("create"); }} 
                className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:brightness-110 transition-all"
              >
                🎮 Create Game
              </button>

              <button 
                onClick={() => { playSfx(clickSound.current); setScreen("join"); }} 
                className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all"
              >
                🔗 Join Game
              </button>

              <div className="text-center text-white/60 text-sm mt-8">
                <p>• Play with 2-6 players</p>
                <p>• Real-time peer-to-peer</p>
                <p>• No server required!</p>
              </div>
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}>
            <div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div>
              <div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div>
              <div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div>
              <div className="mt-4 text-xs opacity-70"><p>Multiplayer v1.0</p></div>
            </div>
          </div>
        )}
      </Layout>
    );
  }

  // CREATE SCREEN
  if (screen === "create") {
    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4">
            <button onClick={backToMenu} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold text-white mb-6 text-center">🎮 Create Game</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Your Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={15}
                    placeholder="Enter your name..."
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40"
                  />
                </div>

                <div>
                  <label className="text-sm text-white/70 mb-2 block">Number of Players</label>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5, 6].map(num => (
                      <button
                        key={num}
                        onClick={() => setMaxPlayers(num)}
                        className={`flex-1 py-3 rounded-lg font-bold ${
                          maxPlayers === num
                            ? 'bg-green-500 text-white'
                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                        } transition-all`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-white/70 mb-2 block">Starting Chips (Max: {maxEntryAmount.toLocaleString()})</label>
                  <input
                    type="number"
                    value={startingChips}
                    onChange={(e) => {
                      const value = Math.min(Number(e.target.value), maxEntryAmount);
                      setStartingChips(value);
                    }}
                    min="1000"
                    max={maxEntryAmount}
                    placeholder="10000"
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40"
                  />
                  <div className="text-xs text-white/50 mt-1">
                    Each player starts with this amount
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleCreateRoom}
                  disabled={isConnecting}
                  className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isConnecting ? "Creating..." : "Create Room"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // JOIN SCREEN
  if (screen === "join") {
    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4">
            <button onClick={backToMenu} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">BACK</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold text-white mb-6 text-center">🔗 Join Game</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Your Name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={15}
                    placeholder="Enter your name..."
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40"
                  />
                </div>

                <div>
                  <label className="text-sm text-white/70 mb-2 block">Room Code</label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    maxLength={5}
                    placeholder="XXXXX"
                    className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white text-center text-2xl font-bold tracking-widest placeholder-white/40"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleJoinRoom}
                  disabled={isConnecting}
                  className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isConnecting ? "Joining..." : "Join Room"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // LOBBY SCREEN
  if (screen === "lobby") {
    const players = gameState?.players || [];
    const currentPlayers = players.length;
    const maxPlayersCount = gameState?.maxPlayers || maxPlayers;

    console.log("Lobby render:", { 
      gameState, 
      players, 
      currentPlayers, 
      isHost, 
      maxPlayersCount 
    });

    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-green-900 via-black to-blue-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 opacity-10"><div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }} /></div>
          
          <div className="absolute top-4 left-4">
            <button onClick={backToMenu} className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">LEAVE</button>
          </div>

          <div className="relative h-full flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-extrabold text-white mb-2">Game Lobby</h2>
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 mb-4">
                  <div className="text-sm text-white/70 mb-1">Room Code</div>
                  <div className="text-3xl font-bold text-white tracking-widest">{roomCode}</div>
                  <button onClick={copyRoomCode} className="mt-2 text-sm text-green-300 hover:text-green-200">📋 Copy Code</button>
                </div>
                <div className="text-white/70 text-sm">Players: {currentPlayers}/{maxPlayersCount}</div>
              </div>

              <div className="space-y-2 mb-6">
                {players.map((player) => (
                  <div key={player.id} className="bg-white/10 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{player.isHost ? '👑' : '👤'}</span>
                      <span className="font-semibold text-white">{player.name}</span>
                      {player.id === playerId && <span className="text-xs text-green-400">(You)</span>}
                    </div>
                    <div className="text-emerald-400 text-sm font-semibold">Ready</div>
                  </div>
                ))}

                {Array.from({ length: maxPlayersCount - currentPlayers }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-white/5 rounded-lg p-3 flex items-center gap-2 opacity-50">
                    <span className="text-2xl">⏳</span>
                    <span className="text-white/50">Waiting...</span>
                  </div>
                ))}
              </div>

              {isHost && (
                <>
                  {error && (
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm text-center mb-4">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handleStartGame}
                    disabled={currentPlayers < 2}
                    className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {currentPlayers < 2 ? 'Waiting for Players...' : 'Start Game'}
                  </button>
                </>
              )}

              {!isHost && (
                <div className="text-center text-white/70 text-sm">
                  <div className="animate-pulse">Waiting for host to start game...</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // GAME SCREEN - This is a working foundation, full turn management would need more implementation
  if (screen === "game") {
    const players = gameState?.players || [];
    const pot = gameState?.pot || 0;
    const communityCards = gameState?.communityCards || [];
    const communityVisible = gameState?.communityVisible || 0;
    const myPlayer = players.find(p => p.id === playerId);
    const currentPlayer = players[gameState?.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === playerId;

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
          
          <div className="absolute top-2 left-2 flex gap-2 z-50">
            <button onClick={backToMenu} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">LEAVE</button>
          </div>

          <div className="absolute top-2 right-2 flex gap-2 z-50">
            <button onClick={() => { playSfx(clickSound.current); const el = wrapRef.current || document.documentElement; if (!document.fullscreenElement) { el.requestFullscreen?.().catch(() => {}); } else { document.exitFullscreen?.().catch(() => {}); } }} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">{isFullscreen ? "EXIT" : "FULL"}</button>
            <button onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }} className="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">MENU</button>
          </div>

          <div className="relative h-full flex flex-col items-center px-2 py-12">
            <div className="text-center mb-2">
              <div className="text-xs text-white/60">Room: {roomCode} • Round: {gameState?.round}</div>
              <div className="text-2xl font-bold text-amber-400">POT: {fmt(pot)}</div>
            </div>

            {/* Community Cards */}
            <div className="mb-3">
              <div className="flex gap-1 justify-center">
                {communityCards.slice(0, communityVisible).map((card, i) => (
                  <PlayingCard key={i} card={card} delay={i * 200} />
                ))}
              </div>
            </div>

            {/* Players */}
            <div className="w-full max-w-lg space-y-1 mb-2 flex-1 overflow-y-auto">
              {players.map((player, idx) => (
                <div key={player.id} className={`bg-black/30 border ${player.id === playerId ? 'border-green-500/50' : player.id === currentPlayer?.id ? 'border-yellow-500/50' : 'border-white/10'} rounded-lg p-2`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{player.isHost ? '👑' : '👤'}</span>
                      <span className="text-white font-semibold text-xs">{player.name}</span>
                      {player.id === playerId && <span className="text-xs text-green-400">(You)</span>}
                      {player.folded && <span className="text-xs text-red-400">(Folded)</span>}
                      {player.id === currentPlayer?.id && !player.folded && <span className="text-xs text-yellow-400">⏰</span>}
                    </div>
                    <div className="text-emerald-400 text-xs">{player.chips} | Bet: {player.bet}</div>
                  </div>
                  {player.id === playerId && player.cards && (
                    <div className="flex gap-1 mt-2 justify-center">
                      {player.cards.map((card, i) => (
                        <PlayingCard key={i} card={card} delay={i * 200} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Action Buttons - Show for current player */}
            {isMyTurn && !myPlayer?.folded && (
              <div className="w-full max-w-sm space-y-2">
                <div className="flex gap-2">
                  <button onClick={() => handlePlayerAction("fold")} className="flex-1 h-10 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 font-semibold text-xs">FOLD</button>
                  <button 
                    onClick={() => handlePlayerAction("check")} 
                    disabled={gameState.currentBet > myPlayer.bet}
                    className="flex-1 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    CHECK
                  </button>
                  <button 
                    onClick={() => handlePlayerAction("call")} 
                    disabled={gameState.currentBet <= myPlayer.bet || myPlayer.chips < (gameState.currentBet - myPlayer.bet)}
                    className="flex-1 h-10 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    CALL {gameState.currentBet > myPlayer.bet ? `(${gameState.currentBet - myPlayer.bet})` : ''}
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowBetModal(true)} 
                    disabled={myPlayer.chips === 0}
                    className="flex-1 h-10 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    BET/RAISE
                  </button>
                  <button 
                    onClick={() => handlePlayerAction("allin")} 
                    disabled={myPlayer.chips === 0 || myPlayer.allIn}
                    className="flex-1 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ALL-IN
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <button onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all">How to Play</button>
                  <button onClick={() => { setShowStats(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all">Stats</button>
                  <button onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }} className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all">💰 Vault</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODALS */}
        {menuOpen && (
          <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3" onClick={() => setMenuOpen(false)}>
            <div className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2 md:mb-3"><h2 className="text-xl font-extrabold">Settings</h2><button onClick={() => setMenuOpen(false)} className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center">✕</button></div>
              <div className="mb-3 space-y-2"><h3 className="text-sm font-semibold opacity-80">Wallet</h3><div className="flex items-center gap-2"><button onClick={openWalletModalUnified} className={`px-3 py-2 rounded-md text-sm font-semibold ${isConnected ? "bg-emerald-500/90 hover:bg-emerald-500 text-white" : "bg-rose-500/90 hover:bg-rose-500 text-white"}`}>{isConnected ? "Connected" : "Disconnected"}</button>{isConnected && (<button onClick={hardDisconnect} className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Disconnect</button>)}</div>{isConnected && address && (<button onClick={() => { try { navigator.clipboard.writeText(address).then(() => { setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1500); }); } catch {} }} className="mt-1 text-xs text-gray-300 hover:text-white transition underline">{shortAddr(address)}{copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}</button>)}</div>
              <div className="mb-4 space-y-2"><h3 className="text-sm font-semibold opacity-80">Sound</h3><button onClick={() => setSfxMuted(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${sfxMuted ? "bg-rose-500/90 hover:bg-rose-500 text-white" : "bg-emerald-500/90 hover:bg-emerald-500 text-white"}`}>SFX: {sfxMuted ? "Off" : "On"}</button></div>
              <div className="mt-4 text-xs opacity-70"><p>Multiplayer v1.0</p></div>
            </div>
          </div>
        )}

        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">🎴 How to Play</h2>
              <div className="space-y-3 text-sm">
                <p><strong>Multiplayer Texas Hold'em:</strong></p>
                <p>• Each player gets 2 hole cards</p>
                <p>• 5 community cards are revealed (Flop, Turn, River)</p>
                <p>• Best 5-card hand wins the pot!</p>
                <p>• Small blind: {SMALL_BLIND} • Big blind: {BIG_BLIND}</p>
                <p className="text-white/60 text-xs mt-4">Full betting rounds with Check/Fold/Call/Raise!</p>
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
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Total Games</div><div className="text-xl font-bold">{stats.totalGames}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Wins</div><div className="text-xl font-bold text-green-400">{stats.wins}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Losses</div><div className="text-lg font-bold text-red-400">{stats.losses}</div></div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3"><div className="text-xs text-white/60">Biggest Pot</div><div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestPot)}</div></div>
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

        {/* Bet Modal */}
        {showBetModal && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold mb-4">💰 Place Bet</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Bet Amount</label>
                  <input 
                    type="number" 
                    value={betAmount} 
                    onChange={(e) => setBetAmount(e.target.value)}
                    className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-yellow-500 focus:outline-none"
                    placeholder="Enter bet amount"
                    min="1"
                    max={myPlayer?.chips || 0}
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    Available: {myPlayer?.chips || 0} chips
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const amount = Number(betAmount);
                      if (amount > 0 && amount <= (myPlayer?.chips || 0)) {
                        handlePlayerAction("raise", amount);
                        setShowBetModal(false);
                      }
                    }}
                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 rounded-lg transition-colors"
                  >
                    BET
                  </button>
                  <button 
                    onClick={() => setShowBetModal(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    );
  }

  return null;
}
