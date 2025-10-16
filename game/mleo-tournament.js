// ============================================================================
// Texas Hold'em Tournament Game
// Multiplayer tournament with automatic game progression
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { TournamentEngine } from "../lib/tournament-engine";

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

const LS_KEY = "mleo_tournament_v1";
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 32;
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

  if (isStraight && isFlush) {
    if (highCard === 14) return { hand: "Royal Flush", rank: 10, highCard };
    return { hand: "Straight Flush", rank: 9, highCard };
  }
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
  if (playerHand.rank > dealerHand.rank) return 1;
  if (dealerHand.rank > playerHand.rank) return -1;
  if (playerHand.highCard > dealerHand.highCard) return 1;
  if (dealerHand.highCard > playerHand.highCard) return -1;
  return 0;
}

export default function TournamentPage() {
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
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [startingChips, setStartingChips] = useState(10000);
  const [tournamentName, setTournamentName] = useState("Texas Hold'em Tournament");
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [tournamentState, setTournamentState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);

  // Game states
  const [currentGame, setCurrentGame] = useState(null);
  const [gameCountdown, setGameCountdown] = useState(0);
  const [isSpectating, setIsSpectating] = useState(false);

  // Betting states
  const [betAmount, setBetAmount] = useState("100");
  const [showBetModal, setShowBetModal] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [collectAmount, setCollectAmount] = useState(1000);
  const [vault, setVaultState] = useState(0);

  const [stats, setStats] = useState(() => safeRead(LS_KEY, { totalTournaments: 0, wins: 0, topFinishes: 0, totalChipsWon: 0 }));

  // Use ref to track current tournamentState for callbacks
  const tournamentStateRef = useRef(tournamentState);
  tournamentStateRef.current = tournamentState;

  const playSfx = (sound) => {
    if (sfxMuted) return;
    try {
      sound.volume = 0.32;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    } catch {}
  };

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
        console.log("Tournament state updated:", state);
        setTournamentState(state);
        setForceUpdate(prev => prev + 1);
        
        // Handle game transitions
        if (state.status === "playing" && screen === "lobby") {
          setScreen("game");
        } else if (state.status === "finished" && screen === "game") {
          setScreen("results");
        }
      };
      
      // Handle game messages
      engineRef.current.onMessage = (message) => {
        console.log("Received tournament message:", message);
        if (message.type === 'game_action') {
          handleGameAction(message);
        }
      };
    }
  }, [screen, forceUpdate]);

  const openWalletModalUnified = () => isConnected ? openAccountModal?.() : openConnectModal?.();
  const hardDisconnect = () => { disconnect?.(); setMenuOpen(false); };

  const collectToWallet = async () => {
    playSfx(clickSound.current);
    if (!isConnected || !address) {
      alert("Please connect your wallet first.");
      return;
    }
    if (chainId !== CLAIM_CHAIN_ID) {
      try {
        await switchChain?.({ chainId: CLAIM_CHAIN_ID });
      } catch (error) {
        console.error("Failed to switch chain:", error);
        alert("Failed to switch to the required network.");
        return;
      }
    }
    if (collectAmount <= 0 || collectAmount > vault) {
      alert("Invalid amount to collect.");
      return;
    }
    setClaiming(true);
    try {
      const amountWei = parseUnits(String(collectAmount), MLEO_DECIMALS);
      const tx = await writeContractAsync({
        address: CLAIM_ADDRESS,
        abi: MINING_CLAIM_ABI,
        functionName: "claim",
        args: [GAME_ID, amountWei],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status === "success") {
        setVault(vault - collectAmount);
        setVaultState(vault - collectAmount);
        alert(`${collectAmount} MLEO collected to your wallet!`);
      } else {
        alert("Transaction failed.");
      }
    } catch (error) {
      console.error("Collection error:", error);
      alert("Failed to collect MLEO. See console for details.");
    } finally {
      setClaiming(false);
    }
  };

  const handleCreateTournament = async () => {
    playSfx(clickSound.current);
    if (!playerName) {
      setError("Please enter your name.");
      return;
    }
    if (!tournamentName) {
      setError("Please enter tournament name.");
      return;
    }
    setIsConnecting(true);
    setError("");
    try {
      engineRef.current = new TournamentEngine();
      engineRef.current.onStateUpdate = (state) => {
        console.log("Tournament state updated:", state);
        setTournamentState(state);
        setForceUpdate(prev => prev + 1);
        if (state.status === "playing" && screen === "lobby") {
          setScreen("game");
        }
      };
      engineRef.current.onPlayerJoin = (player) => {
        console.log("Player joined:", player);
      };
      engineRef.current.onPlayerLeave = (playerId) => {
        console.log("Player left:", playerId);
      };
      engineRef.current.onError = (err) => {
        console.error("Create tournament engine error:", err);
        setError("Connection error: " + err.message);
      };

      const result = await engineRef.current.createTournament(playerName, maxPlayers, startingChips, tournamentName);

      setPlayerId(result.playerId);
      setIsHost(true);
      setRoomCode(result.roomCode);
      setTournamentState(engineRef.current.tournamentState);
      setScreen("lobby");
    } catch (err) {
      console.error("Failed to create tournament:", err);
      setError(err.message || "Failed to create tournament.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoinTournament = async () => {
    playSfx(clickSound.current);
    if (!playerName) {
      setError("Please enter your name.");
      return;
    }
    if (!roomCode) {
      setError("Please enter a room code.");
      return;
    }
    setIsConnecting(true);
    setError("");
    try {
      engineRef.current = new TournamentEngine();
      engineRef.current.onStateUpdate = (state) => {
        console.log("Tournament state updated:", state);
        setTournamentState(state);
        setForceUpdate(prev => prev + 1);
        if (state.status === "playing" && screen === "lobby") {
          setScreen("game");
        }
      };
      engineRef.current.onPlayerJoin = (player) => {
        console.log("Player joined:", player);
      };
      engineRef.current.onPlayerLeave = (playerId) => {
        console.log("Player left:", playerId);
      };
      engineRef.current.onError = (err) => {
        console.error("Join tournament engine error:", err);
        setError("Connection error: " + err.message);
      };

      const result = await engineRef.current.joinTournament(playerName, roomCode);

      setPlayerId(result.playerId);
      setIsHost(false);
      setTournamentState(engineRef.current.tournamentState);
      setScreen("lobby");
    } catch (err) {
      console.error("Failed to join tournament:", err);
      setError(err.message || "Failed to join tournament.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartTournament = () => {
    playSfx(clickSound.current);
    if (!engineRef.current || !tournamentState) return;

    try {
      engineRef.current.startTournament();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGameAction = (action, amount = 0) => {
    if (!tournamentState || !currentGame) return;

    const players = currentGame.players || [];
    const myPlayer = players.find(p => p.id === playerId);
    const currentPlayer = players[currentGame.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === playerId;

    if (!isMyTurn || myPlayer?.folded || isSpectating) return;

    playSfx(clickSound.current);

    const updatedPlayers = [...currentGame.players];

    if (action === "fold") {
      updatedPlayers[currentGame.currentPlayerIndex] = {
        ...currentPlayer,
        folded: true
      };
    } else if (action === "call") {
      const callAmount = currentGame.currentBet - currentPlayer.bet;
      updatedPlayers[currentGame.currentPlayerIndex] = {
        ...currentPlayer,
        bet: currentGame.currentBet,
        chips: currentPlayer.chips - callAmount
      };
      currentGame.pot += callAmount;
    } else if (action === "check") {
      // No change needed
    } else if (action === "raise") {
      const raiseAmount = Math.min(amount, currentPlayer.chips);
      updatedPlayers[currentGame.currentPlayerIndex] = {
        ...currentPlayer,
        bet: currentPlayer.bet + raiseAmount,
        chips: currentPlayer.chips - raiseAmount
      };
      currentGame.pot += raiseAmount;
      currentGame.currentBet = currentPlayer.bet + raiseAmount;
    } else if (action === "allin") {
      const allInAmount = currentPlayer.chips;
      updatedPlayers[currentGame.currentPlayerIndex] = {
        ...currentPlayer,
        bet: currentPlayer.bet + allInAmount,
        chips: 0,
        allIn: true
      };
      currentGame.pot += allInAmount;
      currentGame.currentBet = Math.max(currentGame.currentBet, currentPlayer.bet + allInAmount);
    }

    // Move to next player
    let nextIndex = (currentGame.currentPlayerIndex + 1) % currentGame.players.length;
    while (updatedPlayers[nextIndex].folded) {
      nextIndex = (nextIndex + 1) % currentGame.players.length;
    }

    // Check if round is over
    const activePlayers = updatedPlayers.filter(p => !p.folded);
    const allBetsEqual = activePlayers.every(p => p.bet === currentGame.currentBet);

    let newRound = currentGame.round;
    let newVisible = currentGame.communityVisible;

    if (activePlayers.length === 1) {
      // Only one player left, they win by fold
      finishGame(activePlayers[0]);
    } else if (allBetsEqual && nextIndex === 0) {
      if (currentGame.round === "pre-flop") {
        newRound = "flop";
        newVisible = 3;
      } else if (currentGame.round === "flop") {
        newRound = "turn";
        newVisible = 4;
      } else if (currentGame.round === "turn") {
        newRound = "river";
        newVisible = 5;
      } else if (currentGame.round === "river") {
        // Show down
        newRound = "showdown";
        setTimeout(() => finishGame(), 1000);
      }

      // Reset bets for new round
      updatedPlayers.forEach(p => p.bet = 0);
      currentGame.currentBet = 0;
    }

    const updatedGame = {
      ...currentGame,
      players: updatedPlayers,
      currentPlayerIndex: nextIndex,
      round: newRound,
      communityVisible: newVisible
    };

    setCurrentGame(updatedGame);
    
    // Send to host
    if (engineRef.current) {
      engineRef.current.sendToHost({
        type: 'game_action',
        action: 'update_game',
        game: updatedGame
      });
    }
  };

  const finishGame = (winner = null) => {
    if (!currentGame) return;

    const activePlayers = currentGame.players.filter(p => !p.folded);
    
    let gameWinner, prize, hand;
    
    if (winner) {
      gameWinner = winner;
      prize = currentGame.pot;
      hand = "Won by fold";
    } else {
      // Evaluate hands and determine winner
      const hands = activePlayers.map(player => ({
        player,
        hand: evaluateHand([...player.cards, ...currentGame.communityCards])
      }));
      
      hands.sort((a, b) => compareHands(b.hand, a.hand));
      
      gameWinner = hands[0];
      prize = currentGame.pot;
      hand = gameWinner.hand.hand;
    }
    
    // Update player chips
    const updatedPlayers = currentGame.players.map(p => 
      p.id === gameWinner.player.id 
        ? { ...p, chips: p.chips + prize }
        : p
    );

    // Check for elimination
    const eliminatedPlayers = updatedPlayers.filter(p => p.chips === 0 && !p.eliminated);
    
    if (eliminatedPlayers.length > 0) {
      eliminatedPlayers.forEach(player => {
        if (engineRef.current) {
          engineRef.current.eliminatePlayer(player.id);
        }
      });
    }

    // Check if tournament should continue
    const remainingPlayers = updatedPlayers.filter(p => p.chips > 0);
    
    if (remainingPlayers.length === 1) {
      // Tournament over
      if (engineRef.current) {
        engineRef.current.endTournament(remainingPlayers[0]);
      }
    } else {
      // Start next game after 10 seconds
      setGameCountdown(10);
      const countdownInterval = setInterval(() => {
        setGameCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            startNextGame(updatedPlayers);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const startNextGame = (players) => {
    const activePlayers = players.filter(p => p.chips > 0);
    if (activePlayers.length < 2) return;

    const deck = shuffleDeck(createDeck());
    const communityCards = deck.slice(0, 5);
    const newPlayers = activePlayers.map((player, index) => ({
      ...player,
      cards: [deck[5 + index * 2], deck[6 + index * 2]],
      bet: 0,
      folded: false,
      allIn: false
    }));

    const newGame = {
      round: "pre-flop",
      pot: SMALL_BLIND + BIG_BLIND,
      currentPlayerIndex: 0,
      currentBet: BIG_BLIND,
      communityCards: communityCards,
      communityVisible: 0,
      players: newPlayers,
      gameNumber: (currentGame?.gameNumber || 0) + 1
    };

    setCurrentGame(newGame);
    
    // Send to host
    if (engineRef.current) {
      engineRef.current.sendToHost({
        type: 'game_action',
        action: 'start_new_game',
        game: newGame
      });
    }
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
    setTournamentState(null);
    setRoomCode("");
    setCurrentGame(null);
    setIsSpectating(false);
  };

  const backSafe = () => { playSfx(clickSound.current); router.push('/arcade'); };

  if (!mounted) return null;

  // MENU SCREEN
  if (screen === "menu") {
    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-purple-900 via-black to-red-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <h1 className="text-5xl font-extrabold text-white mb-8 tracking-tight">
              <span className="text-purple-400">Tournament</span> <span className="text-red-400">Texas Hold'em</span>
            </h1>
            <div className="w-full max-w-sm bg-black/50 rounded-2xl p-6 shadow-xl space-y-4">
              <button onClick={() => { setScreen("create"); playSfx(clickSound.current); }} className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg hover:brightness-110 transition-all">
                Create Tournament 🏆
              </button>
              <button onClick={() => { setScreen("join"); playSfx(clickSound.current); }} className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg hover:brightness-110 transition-all">
                Join Tournament 👥
              </button>
              <button onClick={backSafe} className="w-full py-4 rounded-lg font-bold text-lg bg-white/10 text-white/70 shadow-lg hover:bg-white/20 transition-all">
                ← Back to Arcade
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // CREATE TOURNAMENT SCREEN
  if (screen === "create") {
    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-purple-900 via-black to-red-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl font-extrabold text-white mb-6 tracking-tight">
              Create Tournament 🏆
            </h1>
            <div className="w-full max-w-sm bg-black/50 rounded-2xl p-6 shadow-xl space-y-4">
              <div>
                <label className="text-sm text-white/70 mb-2 block">Tournament Name</label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  maxLength={30}
                  placeholder="Enter tournament name..."
                  className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40"
                />
              </div>
              
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
                          ? 'bg-purple-500 text-white'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      } transition-all`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm text-white/70 mb-2 block">Starting Chips per Player</label>
                <input
                  type="number"
                  value={startingChips}
                  onChange={(e) => {
                    const value = Math.min(Number(e.target.value), 1000000);
                    setStartingChips(value);
                  }}
                  min="1000"
                  max="1000000"
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

              <button onClick={handleCreateTournament} disabled={isConnecting} className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50">
                {isConnecting ? 'Creating Tournament...' : 'Create Tournament'}
              </button>
              <button onClick={() => { setScreen("menu"); playSfx(clickSound.current); }} className="w-full py-4 rounded-lg font-bold text-lg bg-white/10 text-white/70 shadow-lg hover:bg-white/20 transition-all">
                ← Back
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // JOIN TOURNAMENT SCREEN
  if (screen === "join") {
    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-purple-900 via-black to-red-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl font-extrabold text-white mb-6 tracking-tight">
              Join Tournament 👥
            </h1>
            <div className="w-full max-w-sm bg-black/50 rounded-2xl p-6 shadow-xl space-y-4">
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
                <label className="text-sm text-white/70 mb-2 block">Tournament Code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  placeholder="Enter 5-letter code"
                  className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/20 text-white placeholder-white/40 uppercase"
                />
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm text-center">
                  {error}
                </div>
              )}

              <button onClick={handleJoinTournament} disabled={isConnecting} className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50">
                {isConnecting ? 'Joining Tournament...' : 'Join Tournament'}
              </button>
              <button onClick={() => { setScreen("menu"); playSfx(clickSound.current); }} className="w-full py-4 rounded-lg font-bold text-lg bg-white/10 text-white/70 shadow-lg hover:bg-white/20 transition-all">
                ← Back
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // LOBBY SCREEN
  if (screen === "lobby") {
    const players = tournamentState?.players || [];
    const currentPlayers = players.length;
    const maxPlayersCount = tournamentState?.maxPlayers || maxPlayers;

    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-purple-900 via-black to-red-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl font-extrabold text-white mb-6 tracking-tight">
              Tournament Lobby 🏆
            </h1>
            <div className="w-full max-w-sm bg-black/50 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg p-3 mb-4">
                <div className="text-sm text-white/70 mb-1">Tournament Code</div>
                <div className="text-3xl font-bold text-white tracking-widest">{roomCode}</div>
                <button onClick={copyRoomCode} className="mt-2 text-sm text-purple-300 hover:text-purple-200">📋 Copy Code</button>
              </div>
              <div className="text-white/70 text-sm">Players: {currentPlayers}/{maxPlayersCount}</div>
              <div className="text-white/70 text-sm">Starting Chips: {tournamentState?.startingChips?.toLocaleString()}</div>
            </div>

            <div className="space-y-2 mb-6">
              {players.map((player) => (
                <div key={player.id} className="bg-white/10 rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{player.isHost ? '👑' : '👤'}</span>
                    <span className="text-white font-semibold text-sm">{player.name}</span>
                    {player.id === playerId && <span className="text-xs text-purple-400">(You)</span>}
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

            {isHost ? (
              <>
                <button
                  onClick={handleStartTournament}
                  disabled={currentPlayers < 2}
                  className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {currentPlayers < 2 ? 'Need at least 2 players' : 'Start Tournament'}
                </button>
                <button onClick={backToMenu} className="w-full py-4 rounded-lg font-bold text-lg bg-white/10 text-white/70 shadow-lg hover:bg-white/20 transition-all">
                  ← Back to Menu
                </button>
              </>
            ) : (
              <button onClick={backToMenu} className="w-full py-4 rounded-lg font-bold text-lg bg-white/10 text-white/70 shadow-lg hover:bg-white/20 transition-all">
                ← Back to Menu
              </button>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // GAME SCREEN
  if (screen === "game") {
    const players = currentGame?.players || [];
    const myPlayer = players.find(p => p.id === playerId);
    const currentPlayer = players[currentGame?.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === playerId;

    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-purple-900 via-black to-red-900" style={{ height: '100svh' }}>
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 p-4">
            <div className="flex justify-between items-center">
              <button onClick={backToMenu} className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/30 font-semibold text-sm">
                LEAVE
              </button>
              <div className="text-center">
                <div className="text-white font-bold text-lg">{tournamentState?.tournamentName}</div>
                <div className="text-white/70 text-sm">Game #{currentGame?.gameNumber || 1}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsFullscreen(!isFullscreen)} className="px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-300 rounded-lg hover:bg-blue-500/30 font-semibold text-sm">
                  FULL
                </button>
                <button onClick={() => setMenuOpen(true)} className="px-4 py-2 bg-gray-500/20 border border-gray-500/30 text-gray-300 rounded-lg hover:bg-gray-500/30 font-semibold text-sm">
                  MENU
                </button>
              </div>
            </div>
          </div>

          {/* Game Countdown */}
          {gameCountdown > 0 && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
              <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-8 shadow-2xl text-center">
                <h2 className="text-4xl font-extrabold mb-4">Next Game Starting</h2>
                <div className="text-6xl font-bold text-purple-400 mb-4">{gameCountdown}</div>
                <div className="text-lg text-gray-300">Get ready for the next round!</div>
              </div>
            </div>
          )}

          {/* Spectator Mode */}
          {isSpectating && (
            <div className="absolute top-20 left-4 right-4 z-20">
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 text-center">
                <div className="text-yellow-300 font-semibold">👀 Spectator Mode</div>
                <div className="text-yellow-200 text-sm">You've been eliminated. You can watch or leave.</div>
              </div>
            </div>
          )}

          {/* Game Area */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 pt-20">
            {/* Pot */}
            <div className="mb-8 text-center">
              <div className="text-white/70 text-sm mb-1">POT</div>
              <div className="text-4xl font-bold text-emerald-400">{currentGame?.pot || 0}</div>
            </div>

            {/* Community Cards */}
            <div className="mb-8 flex gap-2">
              {currentGame?.communityCards?.slice(0, currentGame?.communityVisible || 0).map((card, index) => (
                <div key={index} className="w-12 h-16 bg-white rounded-lg flex flex-col items-center justify-center text-black font-bold text-xs">
                  <div>{card.value}</div>
                  <div className="text-lg">{card.suit}</div>
                </div>
              ))}
              {Array.from({ length: 5 - (currentGame?.communityVisible || 0) }).map((_, index) => (
                <div key={`back-${index}`} className="w-12 h-16 bg-gray-600 rounded-lg flex items-center justify-center">
                  <div className="text-white text-xs">?</div>
                </div>
              ))}
            </div>

            {/* Player Cards */}
            {myPlayer && !isSpectating && (
              <div className="mb-8 flex gap-2">
                {myPlayer.cards?.map((card, index) => (
                  <div key={index} className="w-12 h-16 bg-white rounded-lg flex flex-col items-center justify-center text-black font-bold text-xs">
                    <div>{card.value}</div>
                    <div className="text-lg">{card.suit}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Player List */}
            <div className="w-full max-w-2xl space-y-2 mb-6">
              {players.map((player, index) => (
                <div key={player.id} className={`bg-white/10 rounded-lg p-3 flex items-center justify-between ${
                  player.id === playerId ? 'ring-2 ring-purple-400' : ''
                } ${player.folded ? 'opacity-50' : ''} ${currentPlayer?.id === player.id ? 'bg-purple-500/20' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{player.isHost ? '👑' : '👤'}</span>
                    <span className="text-white font-semibold text-sm">{player.name}</span>
                    {player.id === playerId && <span className="text-xs text-purple-400">(You)</span>}
                    {player.folded && <span className="text-xs text-red-400">FOLDED</span>}
                    {player.allIn && <span className="text-xs text-yellow-400">ALL-IN</span>}
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-400 text-sm font-semibold">{player.chips} chips</div>
                    {player.bet > 0 && <div className="text-yellow-400 text-xs">Bet: {player.bet}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            {isMyTurn && !myPlayer?.folded && !isSpectating && (
              <div className="w-full max-w-sm space-y-2">
                <div className="flex gap-2">
                  <button onClick={() => handleGameAction("fold")} className="flex-1 h-10 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 font-semibold text-xs">FOLD</button>
                  <button
                    onClick={() => handleGameAction("check")}
                    disabled={currentGame?.currentBet > myPlayer.bet}
                    className="flex-1 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    CHECK
                  </button>
                  <button
                    onClick={() => handleGameAction("call")}
                    disabled={currentGame?.currentBet <= myPlayer.bet || myPlayer.chips < (currentGame?.currentBet - myPlayer.bet)}
                    className="flex-1 h-10 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    CALL {currentGame?.currentBet > myPlayer.bet ? `(${currentGame.currentBet - myPlayer.bet})` : ''}
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
                    onClick={() => handleGameAction("allin")}
                    disabled={myPlayer.chips === 0 || myPlayer.allIn}
                    className="flex-1 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ALL-IN
                  </button>
                </div>
              </div>
            )}

            {/* Spectator Actions */}
            {isSpectating && (
              <div className="w-full max-w-sm space-y-2">
                <button
                  onClick={() => {
                    setIsSpectating(false);
                    backToMenu();
                  }}
                  className="w-full h-10 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 font-semibold text-xs"
                >
                  Leave Tournament
                </button>
              </div>
            )}
          </div>

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
                          handleGameAction("raise", amount);
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
        </div>
      </Layout>
    );
  }

  // RESULTS SCREEN
  if (screen === "results") {
    const winner = tournamentState?.winner;
    const eliminatedPlayers = tournamentState?.eliminatedPlayers || [];

    return (
      <Layout>
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-purple-900 via-black to-red-900" style={{ height: '100svh' }}>
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl font-extrabold text-white mb-8 tracking-tight">
              Tournament Results 🏆
            </h1>
            
            {winner && (
              <div className="w-full max-w-md bg-black/50 rounded-2xl p-6 shadow-xl space-y-4 mb-6">
                <div className="text-center">
                  <div className="text-6xl mb-4">🏆</div>
                  <div className="text-2xl font-bold text-yellow-400 mb-2">{winner.name}</div>
                  <div className="text-lg text-white/70">Tournament Winner!</div>
                  <div className="text-emerald-400 text-xl font-bold">{winner.chips} chips</div>
                </div>
              </div>
            )}

            <div className="w-full max-w-md bg-black/50 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-xl font-bold text-white text-center mb-4">Final Standings</h2>
              <div className="space-y-2">
                {eliminatedPlayers.map((player, index) => (
                  <div key={player.id} className="flex items-center justify-between bg-white/10 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">#{player.position}</span>
                      <span className="text-white font-semibold">{player.name}</span>
                      {player.id === playerId && <span className="text-xs text-purple-400">(You)</span>}
                    </div>
                    <div className="text-emerald-400 text-sm font-semibold">{player.chips} chips</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={backToMenu}
                className="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 rounded-lg"
              >
                New Tournament
              </button>
              <button
                onClick={backSafe}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 rounded-lg"
              >
                Back to Arcade
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return null;
}
