// ============================================================================
// MLEO Blackjack - Simplified Version (Build-Safe)
// Basic Blackjack without advanced features
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
const LS_KEY = "mleo_blackjack_v1";
const MIN_BET = 1000;
const WIN_MULTIPLIER = 1.95; // 2.5% house edge

// On-chain Claim Config
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 25; // Coin Flip game ID

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

function formatBetDisplay(n) {
  const num = Number(n) || 0;
  if (num >= 1e6) return (num / 1e6).toFixed(num % 1e6 === 0 ? 0 : 2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(num % 1e3 === 0 ? 0 : 2) + "K";
  return num.toString();
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CoinFlipPage() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const metersRef = useRef(null);
  const betRef = useRef(null);
  const ctaRef = useRef(null);

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
  const [isEditingBet, setIsEditingBet] = useState(false);
  const [choice, setChoice] = useState("heads"); // heads or tails
  const [flipping, setFlipping] = useState(false);
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
      lastBet: MIN_BET,
      headsWins: 0,
      tailsWins: 0
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

  // Dynamic layout calculation
  useEffect(() => {
    if (!wrapRef.current) return;
    const calc = () => {
      const rootH = window.visualViewport?.height ?? window.innerHeight;
      const safeBottom =
        Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--satb")
            .replace("px", "")
        ) || 0;
      const headH = headerRef.current?.offsetHeight || 0;
      document.documentElement.style.setProperty("--head-h", headH + "px");
      const topPad = headH + 8;
      const used =
        headH +
        (metersRef.current?.offsetHeight || 0) +
        (betRef.current?.offsetHeight || 0) +
        (ctaRef.current?.offsetHeight || 0) +
        topPad +
        48 +
        safeBottom +
        24;
      const freeH = Math.max(200, rootH - used);
      document.documentElement.style.setProperty("--chart-h", freeH + "px");
    };
    calc();
    window.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("resize", calc);
    return () => {
      window.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("resize", calc);
    };
  }, [mounted]);

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
  const flipCoin = (isFreePlayParam = false) => {
    if (flipping) return;
    playSfx(clickSound.current);

    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;

    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/coin-flip', undefined, { shallow: true });
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

    setFlipping(true);
    setGameResult(null);
    setResult(null);

    // Animate flip
    let count = 0;
    const flipInterval = setInterval(() => {
      setResult(Math.random() > 0.5 ? "heads" : "tails");
      count++;

      if (count >= 15) {
        clearInterval(flipInterval);
        const finalResult = Math.random() > 0.5 ? "heads" : "tails";
        setResult(finalResult);
        setFlipping(false);
        checkWin(finalResult, bet);
      }
    }, 80);
  };

  const checkWin = (finalResult, bet) => {
    const won = finalResult === choice;
    const prize = won ? Math.floor(bet * WIN_MULTIPLIER) : 0;

    if (won && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      playSfx(winSound.current);
    }

    const resultData = {
      win: won,
      result: finalResult,
      choice: choice,
      multiplier: WIN_MULTIPLIER,
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
      lastBet: bet,
      headsWins: (won && finalResult === "heads") ? stats.headsWins + 1 : stats.headsWins,
      tailsWins: (won && finalResult === "tails") ? stats.tailsWins + 1 : stats.tailsWins
    };
    setStats(newStats);
  };

  const resetGame = () => {
    setGameResult(null);
    setShowResultPopup(false);
    setResult(null);
    setFlipping(false);
  };

  const backSafe = () => {
    playSfx(clickSound.current);
    router.push('/arcade');
  };

  if (!mounted)
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-black to-yellow-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  const potentialWin = Math.floor(Number(betAmount) * WIN_MULTIPLIER);

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-gradient-to-br from-amber-900 via-black to-yellow-900"
        style={{ height: '100svh' }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }} />
        </div>

        {/* Top HUD Bar */}
        <div
          ref={headerRef}
          className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
        >
          <div className="relative px-2 py-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
            {/* Left: Back + Free Play */}
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button
                onClick={backSafe}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
                title="Back to Arcade"
              >
                BACK
              </button>

              {/* Free Play Indicator - Small Icon */}
              {freePlayTokens > 0 && (
                <button
                  onClick={() => flipCoin(true)}
                  disabled={flipping}
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

        {/* MAIN BODY */}
        <div
          className="relative h-full flex flex-col items-center justify-start px-4 pb-4"
          style={{
            minHeight: "100%",
            paddingTop: "calc(var(--head-h, 56px) + 8px)",
          }}
        >
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">
              🪙 Coin Flip
            </h1>
            <p className="text-white/70 text-xs">
              Choose Heads or Tails • Win ×{WIN_MULTIPLIER}
            </p>
          </div>

          <div
            ref={metersRef}
            className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md"
          >
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Vault</div>
              <div className="text-sm font-bold text-emerald-400">
                {fmt(vault)}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Bet</div>
              <div className="text-sm font-bold text-amber-400">
                {fmt(Number(betAmount))}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Win</div>
              <div className="text-sm font-bold text-green-400">
                {fmt(potentialWin)}
              </div>
            </div>
          </div>

          {/* GAME AREA */}
          <div
            className="mb-1 w-full max-w-md flex flex-col items-center justify-center"
            style={{ height: "var(--chart-h, 300px)" }}
          >
            {/* Coin Display */}
            <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 shadow-2xl flex items-center justify-center text-6xl transition-transform duration-200 ${flipping ? 'animate-spin' : ''}`}>
              {result ? (result === "heads" ? "👑" : "⚡") : "🪙"}
            </div>
            <div className="text-center mt-3" style={{ height: '28px' }}>
              <div className={`text-lg font-bold text-white capitalize transition-opacity duration-300 ${result && !flipping ? 'opacity-100' : 'opacity-0'}`}>
                {result || 'waiting'}
              </div>
            </div>

            {/* Choice Selector */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setChoice("heads"); playSfx(clickSound.current); }}
                disabled={flipping}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                  choice === "heads"
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg ring-2 ring-yellow-300'
                    : 'bg-white/10 text-white hover:bg-white/20'
                } disabled:opacity-50`}
              >
                👑 Heads
              </button>
              <button
                onClick={() => { setChoice("tails"); playSfx(clickSound.current); }}
                disabled={flipping}
                className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                  choice === "tails"
                    ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg ring-2 ring-yellow-300'
                    : 'bg-white/10 text-white hover:bg-white/20'
                } disabled:opacity-50`}
              >
                ⚡ Tails
              </button>
            </div>
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap">
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = current === MIN_BET 
                  ? Math.min(vault, 1000)
                  : Math.min(vault, current + 1000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              disabled={flipping}
              className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50"
            >
              1K
            </button>
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = current === MIN_BET 
                  ? Math.min(vault, 10000)
                  : Math.min(vault, current + 10000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              disabled={flipping}
              className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50"
            >
              10K
            </button>
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = current === MIN_BET 
                  ? Math.min(vault, 100000)
                  : Math.min(vault, current + 100000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              disabled={flipping}
              className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50"
            >
              100K
            </button>
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = current === MIN_BET 
                  ? Math.min(vault, 1000000)
                  : Math.min(vault, current + 1000000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              disabled={flipping}
              className="w-12 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs disabled:opacity-50"
            >
              1M
            </button>
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = Math.max(MIN_BET, current - 1000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              disabled={flipping}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50"
            >
              −
            </button>
            <input
              type="text"
              value={isEditingBet ? betAmount : formatBetDisplay(betAmount)}
              onFocus={() => setIsEditingBet(true)}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                setBetAmount(val || '0');
              }}
              onBlur={() => {
                setIsEditingBet(false);
                const current = Number(betAmount) || MIN_BET;
                setBetAmount(String(Math.max(MIN_BET, current)));
              }}
              disabled={flipping}
              className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-xs"
            />
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = Math.min(vault, current + 1000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              disabled={flipping}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50"
            >
              +
            </button>
            <button
              onClick={() => {
                setBetAmount(String(MIN_BET));
                playSfx(clickSound.current);
              }}
              disabled={flipping}
              className="h-8 w-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs disabled:opacity-50"
              title="Reset to minimum bet"
            >
              ↺
            </button>
          </div>

          <div
            ref={ctaRef}
            className="flex flex-col gap-3 w-full max-w-sm"
            style={{ minHeight: "140px" }}
          >
            <button
              onClick={() => flipCoin(false)}
              disabled={flipping || Number(betAmount) < MIN_BET}
              className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              {flipping ? "🪙 Flipping..." : "🪙 FLIP COIN"}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowHowToPlay(true);
                  playSfx(clickSound.current);
                }}
                className="flex-1 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 font-semibold text-xs transition-all"
              >
                How to Play
              </button>
              <button
                onClick={() => {
                  setShowStats(true);
                  playSfx(clickSound.current);
                }}
                className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 font-semibold text-xs transition-all"
              >
                Stats
              </button>
              <button
                onClick={() => {
                  setShowVaultModal(true);
                  playSfx(clickSound.current);
                }}
                className="flex-1 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 font-semibold text-xs transition-all"
              >
                💰 Vault
              </button>
            </div>
          </div>
        </div>

        {/* Result Popup */}
        {showResultPopup && gameResult && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div className={`${gameResult.win ? 'bg-green-500' : 'bg-red-500'} text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto animate-fade-in`} style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
              <div className="text-4xl mb-2">{gameResult.win ? '🎉' : '😔'}</div>
              <div className="text-2xl font-bold mb-1">
                {gameResult.win ? 'YOU WIN!' : 'YOU LOSE'}
              </div>
              <div className="text-lg">
                {gameResult.win ? `+${fmt(gameResult.prize)} MLEO` : `-${fmt(Math.abs(gameResult.profit))} MLEO`}
              </div>
              <div className="text-sm opacity-80 mt-2">
                Result: {gameResult.result.toUpperCase()}
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
                <p>Coin Flip v1.0</p>
              </div>
            </div>
          </div>
        )}

        {/* How to Play Modal */}
        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl">
              <h2 className="text-2xl font-extrabold mb-4">🪙 How to Play</h2>
              <div className="space-y-3 text-sm">
                <p><strong>1. Choose Your Side:</strong> Select Heads (👑) or Tails (⚡)</p>
                <p><strong>2. Set Your Bet:</strong> Minimum bet is {MIN_BET} MLEO. Use +/- to adjust.</p>
                <p><strong>3. Flip:</strong> Click "FLIP COIN" to start the game</p>
                <p><strong>4. Win:</strong> If your choice matches, you win ×{WIN_MULTIPLIER} your bet!</p>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-4">
                  <p className="text-amber-300 font-semibold">💡 Fair Play</p>
                  <p className="text-xs text-white/80 mt-1">Each flip uses cryptographically secure random generation for fair results.</p>
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
                </div>

                <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="text-sm font-semibold mb-2">Side Performance</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <div className="text-2xl mb-1">👑</div>
                      <div className="text-xs text-white/60">Heads Wins</div>
                      <div className="text-lg font-bold">{stats.headsWins}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl mb-1">⚡</div>
                      <div className="text-xs text-white/60">Tails Wins</div>
                      <div className="text-lg font-bold">{stats.tailsWins}</div>
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

