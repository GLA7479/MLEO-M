// ============================================================================
// MLEO Crash2 - Full-Screen Professional Crash Game (No-Scroll Auto-Scale)
// Live multiplier chart • Provably Fair • Cash out before crash!
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useDisconnect,
  useSwitchChain,
  useWriteContract,
  usePublicClient,
  useChainId,
} from "wagmi";
import { parseUnits } from "viem";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ===== viewport fix =====
function useIOSViewportFix() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const setVH = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
      root.style.setProperty(
        "--satb",
        getComputedStyle(root).getPropertyValue("env(safe-area-inset-bottom,0px)")
      );
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

const LS_KEY = "mleo_crash2_v1";
const MIN_BET = 1000;
const ROUND = {
  bettingSeconds: 10,
  intermissionMs: 3000,
  fps: 60,
  minCrash: 1.01,
  maxCrash: 10.0,
  growth: (elapsedMs) => {
    const t = elapsedMs / 1000;
    const rate = 0.85;
    const m = Math.exp(rate * t * 0.6);
    return Math.max(1, m);
  },
};
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 25;
const MINING_CLAIM_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];
const S_CLICK = "/sounds/click.mp3";
const S_WIN = "/sounds/gift.mp3";

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

// Provably Fair helpers
async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function hashToUnitFloat(hex) {
  const slice = hex.slice(0, 13);
  const int = parseInt(slice, 16);
  const max = Math.pow(16, slice.length);
  return int / max;
}
function hashToCrash(hex, minCrash, maxCrash) {
  const u = hashToUnitFloat(hex);
  const k = 1.45;
  const skew = Math.pow(u, k);
  const v = minCrash + (maxCrash - minCrash) * skew;
  return Math.max(minCrash, Math.min(maxCrash, Math.round(v * 100) / 100));
}

export default function Crash2Page() {
  useIOSViewportFix();
  const router = useRouter();

  // Layout refs
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
  const [autoCashOut, setAutoCashOut] = useState("2.00");
  const [enableAutoCashOut, setEnableAutoCashOut] = useState(false);

  // Game state
  const [phase, setPhase] = useState("betting");
  const [countdown, setCountdown] = useState(ROUND.bettingSeconds);
  const [playerBet, setPlayerBet] = useState(null);
  const [canCashOut, setCanCashOut] = useState(false);
  const [cashedOutAt, setCashedOutAt] = useState(null);
  const [payoutAmount, setPayoutAmount] = useState(null);

  // Provably Fair
  const [serverSeed, setServerSeed] = useState("");
  const [serverSeedHash, setServerSeedHash] = useState("");
  const [clientSeed, setClientSeed] = useState(() =>
    Math.random().toString(36).slice(2)
  );
  const [nonce, setNonce] = useState(0);
  const [crashPoint, setCrashPoint] = useState(null);

  // Live chart
  const [multiplier, setMultiplier] = useState(1.0);
  const startTimeRef = useRef(0);
  const rafRef = useRef(0);
  const dataRef = useRef([]);
  const [chartData, setChartData] = useState([]);

  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [gameResult, setGameResult] = useState(null);
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

  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalBet: 0,
      totalWon: 0,
      biggestWin: 0,
      biggestMultiplier: 0,
      lastBet: MIN_BET,
    })
  );

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
    const isFree = router.query.freePlay === "true";
    setIsFreePlay(isFree);
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) setBetAmount(String(savedStats.lastBet));
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
    const handleFullscreenChange = () =>
      setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  useEffect(() => {
    if (gameResult) {
      setShowResultPopup(true);
      const timer = setTimeout(() => setShowResultPopup(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [gameResult]);

  // Dynamic chart scaling
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
      const freeH = Math.max(150, rootH - used);
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

  // Round lifecycle
  useEffect(() => {
    if (phase === "betting") {
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            startNextRound();
            return ROUND.bettingSeconds;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [phase]);

  const startNextRound = async () => {
    const seed = Math.random().toString(36).slice(2, 12);
    setServerSeed(seed);
    const hash = await sha256Hex(seed + clientSeed + nonce);
    setServerSeedHash(hash);
    const crash = hashToCrash(hash, ROUND.minCrash, ROUND.maxCrash);
    setCrashPoint(crash);
    setPhase("running");
    setMultiplier(1.0);
    dataRef.current = [[0, 1.0]];
    setChartData([[0, 1.0]]);
    startTimeRef.current = Date.now();
    takeoff(crash);
  };

  const takeoff = (crash) => {
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const m = ROUND.growth(elapsed);
      setMultiplier(m);
      dataRef.current.push([elapsed, m]);
      if (dataRef.current.length % 3 === 0) {
        setChartData([...dataRef.current]);
      }

      // Auto cash out
      if (
        enableAutoCashOut &&
        playerBet &&
        canCashOut &&
        !cashedOutAt &&
        m >= Number(autoCashOut)
      ) {
        cashOut();
      }

      if (m >= crash) {
        setPhase("crashed");
        setMultiplier(crash);
        dataRef.current.push([elapsed, crash]);
        setChartData([...dataRef.current]);
        endRound(false);
      } else {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  const placeBet = (isFreePlayParam = false) => {
    playSfx(clickSound.current);
    if (phase !== "betting") return;
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace("/crash2", undefined, { shallow: true });
      } else {
        alert("No free play tokens available!");
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        alert(`Minimum bet is ${MIN_BET} MLEO`);
        return;
      }
      if (currentVault < bet) {
        alert("Insufficient MLEO in vault");
        return;
      }
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }
    setBetAmount(String(bet));
    setPlayerBet({ amount: bet, accepted: true });
    setCanCashOut(false);
    setCashedOutAt(null);
    setPayoutAmount(null);
    setGameResult(null);
  };

  useEffect(() => {
    if (phase === "running" && playerBet && !cashedOutAt) {
      setCanCashOut(true);
    }
  }, [phase, playerBet, cashedOutAt]);

  const cashOut = () => {
    if (!canCashOut || !playerBet || cashedOutAt) return;
    playSfx(clickSound.current);
    setCashedOutAt(multiplier);
    setCanCashOut(false);
    const payout = Math.floor(playerBet.amount * multiplier);
    setPayoutAmount(payout);
    const newVault = getVault() + payout;
    setVault(newVault);
    setVaultState(newVault);
    playSfx(winSound.current);
  };

  const endRound = (won) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    
    if (playerBet) {
      const bet = playerBet.amount;
      const cashed = cashedOutAt;
      const prize = cashed ? Math.floor(bet * cashed) : 0;
      const win = prize > 0;

      const resultData = {
        win,
        crashedAt: crashPoint,
        cashedAt: cashed,
        prize,
        profit: win ? prize - bet : -bet,
      };
      setGameResult(resultData);

      const newStats = {
        ...stats,
        totalGames: stats.totalGames + 1,
        wins: win ? stats.wins + 1 : stats.wins,
        losses: win ? stats.losses : stats.losses + 1,
        totalBet: stats.totalBet + bet,
        totalWon: win ? stats.totalWon + prize : stats.totalWon,
        biggestWin: Math.max(stats.biggestWin, win ? prize : 0),
        biggestMultiplier: Math.max(
          stats.biggestMultiplier,
          cashed || 0
        ),
        lastBet: bet,
      };
      setStats(newStats);
    }

    setTimeout(() => {
      setPhase("revealing");
      setTimeout(() => {
        setPhase("intermission");
        setTimeout(() => {
          resetRound();
        }, ROUND.intermissionMs);
      }, 2000);
    }, 1000);
  };

  const resetRound = () => {
    setPhase("betting");
    setCountdown(ROUND.bettingSeconds);
    setPlayerBet(null);
    setCanCashOut(false);
    setCashedOutAt(null);
    setPayoutAmount(null);
    setMultiplier(1.0);
    setServerSeed("");
    setNonce((n) => n + 1);
    dataRef.current = [];
    setChartData([]);
  };

  const backSafe = () => {
    playSfx(clickSound.current);
    router.push("/arcade");
  };

  const openWalletModalUnified = () =>
    isConnected ? openAccountModal?.() : openConnectModal?.();
  const hardDisconnect = () => {
    disconnect?.();
    setMenuOpen(false);
  };

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

  if (!mounted)
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-900 via-black to-red-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  const potentialWin = playerBet
    ? Math.floor(playerBet.amount * multiplier)
    : 0;
  
  // Chart SVG generation
  const maxY = Math.max(...chartData.map((d) => d[1]), 2);
  const maxX = Math.max(...chartData.map((d) => d[0]), 1000);
  const chart = chartData.map((d, i) => {
    const x = (d[0] / maxX) * 280;
    const y = 180 - ((d[1] - 1) / (maxY - 1)) * 160;
    return i === 0 ? `M${x},${y}` : `L${x},${y}`;
  }).join(" ");

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-gradient-to-br from-orange-900 via-black to-red-900"
        style={{ height: "100svh" }}
      >
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          />
        </div>

        {/* HEADER */}
        <div
          ref={headerRef}
          className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
        >
          <div
            className="relative px-2 py-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
          >
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button
                onClick={backSafe}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
              >
                BACK
              </button>
              {freePlayTokens > 0 && (
                <button
                  onClick={() => placeBet(true)}
                  disabled={phase !== "betting" || playerBet}
                  className="relative px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all disabled:opacity-50"
                  title={`${freePlayTokens} Free Play${
                    freePlayTokens > 1 ? "s" : ""
                  } Available`}
                >
                  <span className="text-base">🎁</span>
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {freePlayTokens}
                  </span>
                </button>
              )}
            </div>
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
              >
                {isFullscreen ? "EXIT" : "FULL"}
              </button>
              <button
                onClick={() => {
                  playSfx(clickSound.current);
                  setMenuOpen(true);
                }}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
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
              🚀 Crash
            </h1>
            <p className="text-white/70 text-xs">
              {phase === "betting"
                ? `Betting ${countdown}s`
                : phase === "running"
                ? "Flying..."
                : phase === "crashed"
                ? `Crashed at ${crashPoint?.toFixed(2)}x`
                : "Next round..."}
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
                {fmt(playerBet ? playerBet.amount : Number(betAmount))}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Win</div>
              <div className="text-sm font-bold text-green-400">
                {fmt(payoutAmount || potentialWin)}
              </div>
            </div>
          </div>

          {/* CHART */}
          <div
            id="crash-chart-wrap"
            className="mb-1 w-full max-w-md"
            style={{ height: "var(--chart-h, 200px)" }}
          >
            <div className="relative w-full h-full bg-black/30 border border-white/10 rounded-lg p-2 pb-1 flex flex-col">
              <div className="relative flex-1 w-full">
                <div 
                  className="absolute top-2 left-2 z-10 text-4xl font-bold text-white"
                  style={{ opacity: phase === "betting" ? 0 : 1, transition: "opacity 0.3s" }}
                >
                  {multiplier.toFixed(2)}x
                </div>
                <div 
                  className="absolute inset-0 flex items-center justify-center text-white/50 text-sm"
                  style={{ opacity: phase === "betting" ? 1 : 0, transition: "opacity 0.3s" }}
                >
                  Waiting for round to start...
                </div>
                <svg
                  viewBox="0 0 300 200"
                  className="w-full h-full"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ opacity: phase === "betting" ? 0 : 1, transition: "opacity 0.3s" }}
                >
                  <path
                    d={chart || "M0,180 L300,180"}
                    stroke={phase === "crashed" ? "#ef4444" : "#10b981"}
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-center text-xs text-white/60 -mt-4">
                Round #{nonce} • {phase === "betting" ? "Placing bets..." : phase === "running" ? `Flying ${multiplier.toFixed(2)}x` : `Crashed @ ${crashPoint?.toFixed(2)}x`}
              </div>
            </div>
          </div>

          <div ref={betRef} className="w-full max-w-md mb-1 space-y-2">
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <button
                onClick={() => {
                  const current = Number(betAmount) || MIN_BET;
                  const newBet = current === MIN_BET 
                    ? Math.min(vault, 1000)
                    : Math.min(vault, current + 1000);
                  setBetAmount(String(newBet));
                  playSfx(clickSound.current);
                }}
                disabled={phase !== "betting" || playerBet}
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
                disabled={phase !== "betting" || playerBet}
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
                disabled={phase !== "betting" || playerBet}
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
                disabled={phase !== "betting" || playerBet}
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
                disabled={phase !== "betting" || playerBet}
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
                disabled={phase !== "betting" || playerBet}
                className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-xs"
              />
              <button
                onClick={() => {
                  const current = Number(betAmount) || MIN_BET;
                  const newBet = Math.min(vault, current + 1000);
                  setBetAmount(String(newBet));
                  playSfx(clickSound.current);
                }}
                disabled={phase !== "betting" || playerBet}
                className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50"
              >
                +
              </button>
              <button
                onClick={() => {
                  setBetAmount(String(MIN_BET));
                  playSfx(clickSound.current);
                }}
                disabled={phase !== "betting" || playerBet}
                className="h-8 w-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs disabled:opacity-50"
                title="Reset to minimum bet"
              >
                ↺
              </button>
            </div>
            <div className="flex items-center justify-center gap-2">
              <input
                type="checkbox"
                checked={enableAutoCashOut}
                onChange={(e) => setEnableAutoCashOut(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-white text-xs">Auto Cash Out @</span>
              <input
                type="number"
                value={autoCashOut}
                onChange={(e) => setAutoCashOut(e.target.value)}
                className="w-20 h-8 bg-black/30 border border-white/20 rounded text-center text-white text-xs"
                step="0.1"
                min="1.01"
              />
              <span className="text-white text-xs">x</span>
            </div>
          </div>

          <div
            ref={ctaRef}
            className="flex flex-col gap-3 w-full max-w-sm"
            style={{ minHeight: "140px" }}
          >
            <button
              onClick={
                phase === "running" && canCashOut
                  ? cashOut
                  : () => placeBet(false)
              }
              disabled={
                (phase === "betting" && (playerBet || Number(betAmount) < MIN_BET)) ||
                (phase === "running" && !canCashOut) ||
                (phase !== "betting" && phase !== "running")
              }
              className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              {phase === "running" && canCashOut
                ? `💰 CASH OUT ${fmt(potentialWin)}`
                : playerBet
                ? "✅ BET PLACED"
                : `🎲 JOIN ROUND`}
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

        {showResultPopup && gameResult && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div
              className={`${
                gameResult.win ? "bg-green-500" : "bg-red-500"
              } text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`}
              style={{ animation: "fadeIn 0.3s ease-in-out" }}
            >
              <div className="text-4xl mb-2">
                {gameResult.win ? "🚀" : "💥"}
              </div>
              <div className="text-2xl font-bold mb-1">
                {gameResult.win ? "CASHED OUT!" : "CRASHED!"}
              </div>
              <div className="text-lg">
                {gameResult.win
                  ? `+${fmt(gameResult.prize)} MLEO`
                  : `-${fmt(Math.abs(gameResult.profit))} MLEO`}
              </div>
              <div className="text-sm opacity-80 mt-2">
                {gameResult.win
                  ? `@ ${gameResult.cashedAt?.toFixed(2)}x`
                  : `Crashed @ ${gameResult.crashedAt?.toFixed(2)}x`}
              </div>
            </div>
          </div>
        )}

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
                    {copiedAddr && (
                      <span className="ml-2 text-emerald-400">Copied!</span>
                    )}
                  </button>
                )}
              </div>
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-semibold opacity-80">Sound</h3>
                <button
                  onClick={() => setSfxMuted((v) => !v)}
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
                <p>Crash v2.0</p>
              </div>
            </div>
          </div>
        )}

        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">🚀 How to Play</h2>
              <div className="space-y-3 text-sm">
                <p>
                  <strong>1. Place Your Bet:</strong> Join the round during betting phase (10s)
                </p>
                <p>
                  <strong>2. Watch It Rise:</strong> The multiplier grows from 1.00x
                </p>
                <p>
                  <strong>3. Cash Out:</strong> Click Cash Out before it crashes!
                </p>
                <p>
                  <strong>4. Auto Cash Out:</strong> Set automatic cash out at your target
                </p>
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                  <p className="text-orange-300 font-semibold">
                    ⚠️ If you don't cash out before crash, you lose!
                  </p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <p className="text-blue-300 font-semibold text-xs">
                    🔒 Provably Fair: Hash shown before each round
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="w-full mt-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showStats && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">
                📊 Your Statistics
              </h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Total Rounds</div>
                    <div className="text-xl font-bold">{stats.totalGames}</div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Win Rate</div>
                    <div className="text-xl font-bold text-green-400">
                      {stats.totalGames > 0
                        ? ((stats.wins / stats.totalGames) * 100).toFixed(1)
                        : 0}
                      %
                    </div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Total Bet</div>
                    <div className="text-lg font-bold text-amber-400">
                      {fmt(stats.totalBet)}
                    </div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Total Won</div>
                    <div className="text-lg font-bold text-emerald-400">
                      {fmt(stats.totalWon)}
                    </div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Biggest Win</div>
                    <div className="text-lg font-bold text-yellow-400">
                      {fmt(stats.biggestWin)}
                    </div>
                  </div>
                  <div className="bg-black/30 border border-white/10 rounded-lg p-3">
                    <div className="text-xs text-white/60">Best Multi</div>
                    <div className="text-lg font-bold text-purple-400">
                      {(stats.biggestMultiplier || 0).toFixed(2)}x
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

        {showVaultModal && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">💰 MLEO Vault</h2>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 text-center">
                <div className="text-sm text-white/60 mb-1">
                  Current Balance
                </div>
                <div className="text-3xl font-bold text-emerald-400">
                  {fmt(vault)} MLEO
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-white/70 mb-2 block">
                    Collect to Wallet
                  </label>
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
                    disabled={
                      collectAmount <= 0 || collectAmount > vault || claiming
                    }
                    className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claiming
                      ? "Collecting..."
                      : `Collect ${fmt(collectAmount)} MLEO`}
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
