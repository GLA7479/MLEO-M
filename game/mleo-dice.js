// ============================================================================
// MLEO Dice Over/Under - Full-Screen Game Template
// Combining all game features + MINERS-style UI
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect, useSwitchChain, useWriteContract, usePublicClient, useChainId } from "wagmi";
import { parseUnits } from "viem";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// iOS 100vh FIX
// ============================================================================
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

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_dice_v2";
const MIN_BET = 1000;
const HOUSE_EDGE = 0.01; // 1% house edge

// On-chain Claim Config
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 17; // Dice Over/Under game ID

const MINING_CLAIM_ABI = [{
  type: "function",
  name: "claim",
  stateMutability: "nonpayable",
  inputs: [
    { name: "gameId", type: "uint256" },
    { name: "amount", type: "uint256" }
  ],
  outputs: []
}];

// Sounds
const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";

// ============================================================================
// STORAGE HELPERS
// ============================================================================
function safeRead(key, fallback = {}) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
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
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Calculate multiplier and win chance
function calculateStats(target, isOver) {
  const winChance = isOver ? (100 - target) : target;
  const multiplier = ((100 - HOUSE_EDGE) / winChance) * 100;
  return { winChance, multiplier };
}

// Generate random result (0-100)
function rollDice() {
  return (Math.random() * 100).toFixed(2);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function DicePage() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);

  // Wallet
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // State
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  const [betAmount, setBetAmount] = useState("1000");
  const [target, setTarget] = useState(50);
  const [isOver, setIsOver] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [collectAmount, setCollectAmount] = useState(1000);

  // Modals
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);

  // Sound
  const [sfxMuted, setSfxMuted] = useState(false);
  const clickSound = useRef(null);
  const winSound = useRef(null);

  // Stats
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalBet: 0,
      totalWon: 0,
      biggestWin: 0,
      highestResult: 0,
      lowestResult: 100,
      lastBet: MIN_BET,
      overWins: 0,
      underWins: 0
    })
  );

  // Play sound helper
  const playSfx = (sound) => {
    if (sfxMuted || !sound) return;
    try {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    } catch {}
  };

  // Init
  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());
    
    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) {
      setBetAmount(String(savedStats.lastBet));
    }
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
      setVaultState(getVault());
    }, 2000);
    
    if (typeof Audio !== "undefined") {
      try {
        clickSound.current = new Audio(S_CLICK);
        winSound.current = new Audio(S_WIN);
      } catch {}
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [router.query]);

  // Persist stats
  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  // Auto-hide result popup
  useEffect(() => {
    if (gameResult) {
      setShowResultPopup(true);
      const timer = setTimeout(() => {
        setShowResultPopup(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [gameResult]);

  // Wallet actions
  const openWalletModalUnified = () => {
    if (isConnected) {
      openAccountModal?.();
    } else {
      openConnectModal?.();
    }
  };

  const hardDisconnect = () => {
    disconnect?.();
    setMenuOpen(false);
  };

  // Claim to wallet
  const collectToWallet = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (chainId !== CLAIM_CHAIN_ID) {
      try {
        await switchChain?.({ chainId: CLAIM_CHAIN_ID });
      } catch {
        alert("Switch to BSC Testnet");
        return;
      }
    }

    if (!CLAIM_ADDRESS) {
      alert("Missing CLAIM address");
      return;
    }

    if (collectAmount <= 0 || collectAmount > vault) {
      alert("Invalid amount!");
      return;
    }

    setClaiming(true);
    try {
      const amountUnits = parseUnits(
        Number(collectAmount).toFixed(Math.min(2, MLEO_DECIMALS)),
        MLEO_DECIMALS
      );

      const hash = await writeContractAsync({
        address: CLAIM_ADDRESS,
        abi: MINING_CLAIM_ABI,
        functionName: "claim",
        args: [BigInt(GAME_ID), amountUnits],
        chainId: CLAIM_CHAIN_ID,
        account: address,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      const newVault = Math.max(0, vault - collectAmount);
      setVault(newVault);
      setVaultState(newVault);

      alert(`✅ Sent ${fmt(collectAmount)} MLEO to wallet!`);
      setShowVaultModal(false);
    } catch (err) {
      console.error(err);
      alert("Claim failed or rejected");
    } finally {
      setClaiming(false);
    }
  };

  // Game logic
  const playDice = (isFreePlayParam = false) => {
    if (rolling) return;
    playSfx(clickSound.current);

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/dice-over-under', undefined, { shallow: true });
      } else {
        alert('No free play tokens available!');
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        alert(`Minimum bet is ${MIN_BET} MLEO`);
        return;
      }
      if (currentVault < bet) {
        alert('Insufficient MLEO in vault');
        return;
      }
      
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    
    setRolling(true);
    setGameResult(null);
    setResult(null);

    // Animate rolling
    let count = 0;
    const rollInterval = setInterval(() => {
      setResult(rollDice());
      count++;
      
      if (count >= 20) {
        clearInterval(rollInterval);
        const finalResult = parseFloat(rollDice());
        setResult(finalResult.toFixed(2));
        setRolling(false);
        checkWin(finalResult, bet);
      }
    }, 40);
  };

  const checkWin = (finalResult, bet) => {
    const won = isOver ? finalResult > target : finalResult < target;
    const { multiplier } = calculateStats(target, isOver);
    const prize = won ? Math.floor(bet * (multiplier / 100)) : 0;

    if (won && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      playSfx(winSound.current);
    }

    const resultData = {
      win: won,
      result: finalResult,
      target: target,
      isOver: isOver,
      multiplier: multiplier / 100,
      prize: prize,
      profit: won ? prize - bet : -bet
    };

    setGameResult(resultData);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      wins: won ? stats.wins + 1 : stats.wins,
      losses: won ? stats.losses : stats.losses + 1,
      totalBet: stats.totalBet + bet,
      totalWon: won ? stats.totalWon + prize : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, won ? prize : 0),
      highestResult: Math.max(stats.highestResult, finalResult),
      lowestResult: Math.min(stats.lowestResult, finalResult),
      lastBet: bet,
      overWins: (won && isOver) ? stats.overWins + 1 : stats.overWins,
      underWins: (won && !isOver) ? stats.underWins + 1 : stats.underWins
    };
    setStats(newStats);
  };

  const backSafe = () => {
    playSfx(clickSound.current);
    router.push('/arcade');
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-black to-teal-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  const { winChance, multiplier } = calculateStats(target, isOver);
  const potentialWin = Math.floor(Number(betAmount) * (multiplier / 100));

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-gradient-to-br from-emerald-900 via-black to-teal-900"
        style={{ height: 'var(--app-100vh, 100vh)' }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }} />
        </div>

        {/* Top HUD Bar */}
        <div className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
          <div className="relative px-2 py-3">
            {/* Left: Back + Free Play */}
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button 
                onClick={backSafe}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
                title="Back to Arcade"
              >
                BACK
              </button>

              {/* Free Play Indicator */}
              {freePlayTokens > 0 && (
                <button
                  onClick={() => playDice(true)}
                  disabled={rolling}
                  className="relative px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all disabled:opacity-50"
                  title={`${freePlayTokens} Free Play${freePlayTokens > 1 ? 's' : ''} Available`}
                >
                  <span className="text-base">🎁</span>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {freePlayTokens}
                  </span>
                </button>
              )}
            </div>

            {/* Right: Fullscreen + Menu */}
            <div className="absolute right-2 top-2 flex gap-2 pointer-events-auto">
              <button
                onClick={() => {
                  playSfx(clickSound.current);
                  const el = wrapRef.current || document.documentElement;
                  if (!document.fullscreenElement) {
                    el.requestFullscreen?.().catch(() => {});
                  } else {
                    document.exitFullscreen?.().catch(() => {});
                  }
                }}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                {isFullscreen ? "EXIT" : "FULL"}
              </button>

              <button
                onClick={() => { playSfx(clickSound.current); setMenuOpen(true); }}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
                title="Menu"
              >
                MENU
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative h-full flex flex-col items-center justify-center px-4 pb-20 pt-16" style={{ minHeight: '600px' }}>
          {/* Game Title */}
          <div className="text-center mb-4">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2">
              ⚄ Dice Over/Under
            </h1>
            <p className="text-white/70">Set your target • Over or Under • Win up to ×99!</p>
          </div>

          {/* Stats Display */}
          <div className="grid grid-cols-3 gap-3 mb-4 w-full max-w-md">
            <div className="bg-black/30 border border-white/10 rounded-lg p-2 text-center">
              <div className="text-xs text-white/60 mb-1">Vault</div>
              <div className="text-base font-bold text-emerald-400">{fmt(vault)}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-2 text-center">
              <div className="text-xs text-white/60 mb-1">Bet</div>
              <div className="text-base font-bold text-amber-400">{fmt(Number(betAmount))}</div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-2 text-center">
              <div className="text-xs text-white/60 mb-1">Win</div>
              <div className="text-base font-bold text-green-400">{fmt(potentialWin)}</div>
            </div>
          </div>

            {/* Result Display */}
          <div className="mb-4">
            <div className={`text-7xl font-black transition-all duration-200 ${
              rolling ? 'animate-pulse text-teal-400' :
                result && gameResult ? 
                  gameResult.win ? 'text-green-400' : 'text-red-400'
                : 'text-zinc-600'
              }`}>
                {result || '0.00'}
              </div>
              {gameResult && (
              <div className={`text-center text-lg font-bold mt-2 ${gameResult.win ? 'text-green-400' : 'text-red-400'}`}>
                  {gameResult.win ? 
                    `✅ WIN! ${gameResult.isOver ? 'OVER' : 'UNDER'} ${gameResult.target}` : 
                    `❌ LOSE! ${gameResult.isOver ? 'OVER' : 'UNDER'} ${gameResult.target}`
                  }
                </div>
              )}
            </div>
              
              {/* Over/Under Toggle */}
          <div className="flex gap-3 mb-4">
                <button
              onClick={() => { setIsOver(true); playSfx(clickSound.current); }}
                  disabled={rolling}
              className={`px-6 py-2 rounded-lg font-bold transition-all ${
                    isOver
                      ? 'bg-gradient-to-r from-green-600 to-emerald-500 text-white scale-105'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              } disabled:opacity-50`}
                >
                  🔼 OVER {target}
                </button>
                <button
              onClick={() => { setIsOver(false); playSfx(clickSound.current); }}
                  disabled={rolling}
              className={`px-6 py-2 rounded-lg font-bold transition-all ${
                    !isOver
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white scale-105'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              } disabled:opacity-50`}
                >
                  🔽 UNDER {target}
                </button>
              </div>

              {/* Slider */}
          <div className="w-full max-w-md mb-4">
            <div className="relative mb-2">
              <div className="h-12 rounded-lg overflow-hidden border-2 border-white/20 relative bg-black/20">
                <div
                  className={`absolute top-0 h-full transition-all duration-200 ${
                        isOver ? 'bg-gradient-to-r from-green-600/40 to-emerald-500/40' : 'bg-gradient-to-r from-blue-600/40 to-cyan-500/40'
                      }`}
                      style={{ 
                        left: isOver ? `${target}%` : '0%',
                        width: isOver ? `${100 - target}%` : `${target}%`
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {isOver ? `>${target}` : `<${target}`}
                  </span>
                    </div>
                  </div>
                  <input
                    type="range"
                min="1"
                max="99"
                    value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                    disabled={rolling}
                className="w-full h-2 bg-transparent appearance-none cursor-pointer disabled:opacity-50 mt-2"
                    style={{
                  background: 'linear-gradient(to right, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.1) 100%)'
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
              <div>Win Chance: {winChance.toFixed(2)}%</div>
              <div className="text-right">Multiplier: ×{(multiplier / 100).toFixed(2)}</div>
                  </div>
                </div>

          {/* Bet Controls */}
          <div className="flex items-center gap-2 mb-4">
                  <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = Math.max(MIN_BET, current - 1000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
                    disabled={rolling}
              className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50"
                  >
              −
                  </button>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              disabled={rolling}
              className="w-28 h-10 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-sm"
              min={MIN_BET}
            />
                  <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = Math.min(vault, current + 1000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
                    disabled={rolling}
              className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50"
                  >
              +
                  </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 w-full max-w-sm">
                  <button
              onClick={() => playDice(false)}
                    disabled={rolling}
              className="w-full py-3 rounded-lg font-bold text-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
            >
              {rolling ? "Rolling..." : "ROLL DICE"}
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowHowToPlay(true); playSfx(clickSound.current); }}
                className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs"
              >
                How to Play
              </button>
              <button
                onClick={() => { setShowStats(true); playSfx(clickSound.current); }}
                className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs"
              >
                Stats
              </button>
              <button
                onClick={() => { setShowVaultModal(true); playSfx(clickSound.current); }}
                className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs"
              >
                💰 Vault
              </button>
            </div>
                    </div>
                  </div>

        {/* Result Popup */}
        {showResultPopup && gameResult && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div className={`${gameResult.win ? 'bg-green-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
              <div className="text-4xl mb-2">{gameResult.win ? '🎉' : '😔'}</div>
              <div className="text-2xl font-bold mb-1">
                {gameResult.win ? 'YOU WIN!' : 'YOU LOSE'}
                    </div>
              <div className="text-lg">
                {gameResult.win ? `+${fmt(gameResult.prize)} MLEO` : `-${fmt(Math.abs(gameResult.profit))} MLEO`}
                  </div>
              <div className="text-sm opacity-80 mt-2">
                Result: {gameResult.result}
                    </div>
                  </div>
                </div>
        )}

        {/* Menu Modal */}
        {menuOpen && (
          <div
            className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-3"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="w-[86vw] max-w-[250px] max-h-[70vh] bg-[#0b1220] text-white shadow-2xl rounded-2xl p-4 md:p-5 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <h2 className="text-xl font-extrabold">Settings</h2>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center"
                >
                  ✕
                </button>
              </div>

              {/* Wallet */}
              <div className="mb-3 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Wallet</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={openWalletModalUnified}
                    className={`px-3 py-2 rounded-md text-sm font-semibold ${
                      isConnected
                        ? "bg-emerald-500/90 hover:bg-emerald-500 text-white"
                        : "bg-rose-500/90 hover:bg-rose-500 text-white"
                    }`}
                  >
                    {isConnected ? "Connected" : "Disconnected"}
                  </button>

                  {isConnected && (
                    <button
                      onClick={hardDisconnect}
                      className="px-3 py-2 rounded-md text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
                  
                {isConnected && address && (
                  <button
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(address).then(() => {
                          setCopiedAddr(true);
                          setTimeout(() => setCopiedAddr(false), 1500);
                        });
                      } catch {}
                    }}
                    className="mt-1 text-xs text-gray-300 hover:text-white transition underline"
                  >
                    {shortAddr(address)}
                    {copiedAddr && <span className="ml-2 text-emerald-400">Copied!</span>}
                  </button>
                )}
                </div>

              {/* Sound */}
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Sound</h3>
                <button
                  onClick={() => setSfxMuted(v => !v)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                    sfxMuted
                      ? "bg-rose-500/90 hover:bg-rose-500 text-white"
                      : "bg-emerald-500/90 hover:bg-emerald-500 text-white"
                  }`}
                >
                  SFX: {sfxMuted ? "Off" : "On"}
                </button>
              </div>

              <div className="mt-4 text-xs opacity-70">
                <p>Dice Over/Under v2.0</p>
              </div>
            </div>
          </div>
        )}

        {/* How to Play Modal */}
        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">⚄ How to Play</h2>
              <div className="space-y-3 text-sm">
                <p><strong>1. Set Target:</strong> Choose a number from 1-99 using the slider</p>
                <p><strong>2. Choose Over/Under:</strong> Predict if the roll will be higher or lower than your target</p>
                <p><strong>3. Set Bet:</strong> Minimum bet is {MIN_BET} MLEO. Use +/- to adjust.</p>
                <p><strong>4. Roll:</strong> Click "ROLL DICE" to play</p>
                <p><strong>5. Win:</strong> If your prediction is correct, you win based on the multiplier!</p>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mt-4">
                  <p className="text-emerald-300 font-semibold">💡 Strategy Tips</p>
                  <p className="text-xs text-white/80 mt-1">• Higher risk = Higher multiplier</p>
                  <p className="text-xs text-white/80">• 50/50 odds = ~×1.98 multiplier</p>
                  <p className="text-xs text-white/80">• 1% win chance = ~×99 multiplier</p>
                </div>
              </div>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
              >
                Got It!
              </button>
            </div>
          </div>
        )}

        {/* Stats Modal */}
        {showStats && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">📊 Your Statistics</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Total Games</div>
                    <div className="text-xl font-bold">{stats.totalGames}</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Win Rate</div>
                    <div className="text-xl font-bold text-green-400">
                      {stats.totalGames > 0 ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : 0}%
                    </div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Total Bet</div>
                    <div className="text-lg font-bold text-amber-400">{fmt(stats.totalBet)}</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Total Won</div>
                    <div className="text-lg font-bold text-emerald-400">{fmt(stats.totalWon)}</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Biggest Win</div>
                    <div className="text-lg font-bold text-yellow-400">{fmt(stats.biggestWin)}</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Net Profit</div>
                    <div className={`text-lg font-bold ${stats.totalWon - stats.totalBet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmt(stats.totalWon - stats.totalBet)}
                    </div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Highest Roll</div>
                    <div className="text-lg font-bold">{stats.highestResult.toFixed(2)}</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Lowest Roll</div>
                    <div className="text-lg font-bold">{stats.lowestResult.toFixed(2)}</div>
                  </div>
            </div>
            
                <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/30 rounded-lg p-4">
                  <div className="text-sm font-semibold mb-2">Strategy Performance</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <div className="text-2xl mb-1">🔼</div>
                      <div className="text-xs text-white/60">Over Wins</div>
                      <div className="text-lg font-bold">{stats.overWins}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl mb-1">🔽</div>
                      <div className="text-xs text-white/60">Under Wins</div>
                      <div className="text-lg font-bold">{stats.underWins}</div>
                    </div>
            </div>
            </div>
              </div>
              <button
                onClick={() => setShowStats(false)}
                className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* MLEO Vault Modal */}
        {showVaultModal && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2>

              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center">
                <div className="text-sm text-white/60 mb-1">Current Balance</div>
                <div className="text-3xl font-bold text-emerald-400">{fmt(vault)} MLEO</div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">Collect to Wallet</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="number"
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(Number(e.target.value))}
                      className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-white"
                      min="1"
                      max={vault}
                    />
                    <button
                      onClick={() => setCollectAmount(vault)}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={collectToWallet}
                    disabled={collectAmount <= 0 || collectAmount > vault || claiming}
                    className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claiming ? "Collecting..." : `Collect ${fmt(collectAmount)} MLEO`}
                  </button>
                </div>

                <div className="text-xs text-white/60">
                  <p>• Your vault is shared across all MLEO games</p>
                  <p>• Collect earnings to your wallet anytime</p>
                  <p>• Network: BSC Testnet (TBNB)</p>
                </div>
              </div>

              <button
                onClick={() => setShowVaultModal(false)}
                className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
