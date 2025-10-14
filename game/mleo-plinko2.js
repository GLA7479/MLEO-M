// ============================================================================
// MLEO Plinko2 - Full-Screen Professional Plinko Game (No-Scroll Auto-Scale)
// Live physics simulation • Multi-ball drop • Responsive canvas!
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

const LS_KEY = "mleo_plinko2_v1";
const MIN_BET = 1000;

// Risk levels with different multipliers
const RISK_LEVELS = {
  low: {
    name: "Low Risk",
    multipliers: [1.1, 1.3, 1, 0.7, 0.5, 0.3, 0.2, 0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.3, 1.1],
    colors: ["from-blue-500 to-cyan-500", "from-green-400 to-emerald-500", "from-blue-400 to-blue-500", "from-purple-400 to-purple-500", "from-gray-500 to-gray-600", "from-gray-600 to-gray-700", "from-gray-700 to-gray-800", "from-gray-800 to-black", "from-gray-700 to-gray-800", "from-gray-600 to-gray-700", "from-gray-500 to-gray-600", "from-purple-400 to-purple-500", "from-blue-400 to-blue-500", "from-green-400 to-emerald-500", "from-blue-500 to-cyan-500"],
  },
  medium: {
    name: "Medium Risk",
    multipliers: [3, 1.5, 1.1, 1, 0.5, 0.3, 0.2, 0, 0.2, 0.3, 0.5, 1, 1.1, 1.5, 3],
    colors: ["from-yellow-400 to-amber-500", "from-orange-500 to-orange-600", "from-green-500 to-green-600", "from-blue-500 to-cyan-500", "from-purple-400 to-purple-500", "from-gray-500 to-gray-600", "from-red-500 to-red-600", "from-gray-800 to-black", "from-red-500 to-red-600", "from-gray-500 to-gray-600", "from-purple-400 to-purple-500", "from-blue-500 to-cyan-500", "from-green-500 to-green-600", "from-orange-500 to-orange-600", "from-yellow-400 to-amber-500"],
  },
  high: {
    name: "High Risk",
    multipliers: [10, 3, 1.5, 1, 0.5, 0.3, 0.1, 0, 0.1, 0.3, 0.5, 1, 1.5, 3, 10],
    colors: ["from-yellow-300 to-yellow-500", "from-orange-400 to-orange-600", "from-green-500 to-emerald-500", "from-blue-500 to-cyan-500", "from-purple-500 to-purple-600", "from-gray-600 to-gray-700", "from-red-600 to-red-700", "from-black to-gray-900", "from-red-600 to-red-700", "from-gray-600 to-gray-700", "from-purple-500 to-purple-600", "from-blue-500 to-cyan-500", "from-green-500 to-emerald-500", "from-orange-400 to-orange-600", "from-yellow-300 to-yellow-500"],
  },
};

const ROWS = 13;
const CLAIM_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CLAIM_CHAIN_ID || 97);
const CLAIM_ADDRESS = (process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS || "").trim();
const MLEO_DECIMALS = Number(process.env.NEXT_PUBLIC_MLEO_DECIMALS || 18);
const GAME_ID = 26;
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
function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function Plinko2Page() {
  useIOSViewportFix();
  const router = useRouter();

  // Layout refs
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const metersRef = useRef(null);
  const betRef = useRef(null);
  const ctaRef = useRef(null);
  const canvasRef = useRef(null);

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
  const [riskLevel, setRiskLevel] = useState("medium");
  const [ballsDropping, setBallsDropping] = useState(0);

  // Game state
  const ballsRef = useRef([]);
  const pegsRef = useRef([]);
  const bucketsRef = useRef([]);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);

  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [lastResult, setLastResult] = useState(null);
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

  // Canvas setup and physics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mounted) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      buildBoard();
    };

    const buildBoard = () => {
      const w = canvas.width;
      const h = canvas.height;
      const multipliers = RISK_LEVELS[riskLevel].multipliers;
      const bucketCount = multipliers.length;

      // Build pegs
      const pegs = [];
      const pegGapX = (w - 40) / (ROWS + 2);
      const pegGapY = (h - 100) / (ROWS + 2);

      for (let row = 0; row < ROWS; row++) {
        const pegCount = row + 2;
        const rowY = 60 + row * pegGapY;
        for (let col = 0; col < pegCount; col++) {
          const rowWidth = pegCount * pegGapX;
          const startX = (w - rowWidth) / 2 + pegGapX / 2;
          const pegX = startX + col * pegGapX;
          pegs.push({ x: pegX, y: rowY, r: 4 });
        }
      }

      // Build buckets
      const buckets = [];
      const bucketWidth = (w - 40) / bucketCount;
      for (let i = 0; i < bucketCount; i++) {
        buckets.push({
          x: 20 + i * bucketWidth,
          y: h - 60,
          w: bucketWidth,
          h: 40,
          multiplier: multipliers[i],
          index: i,
        });
      }

      pegsRef.current = pegs;
      bucketsRef.current = buckets;
    };

    resize();
    window.addEventListener("resize", resize);

    // Physics loop
    const step = (time) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.033) : 0.016;
      lastTimeRef.current = time;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw pegs
      pegsRef.current.forEach((peg) => {
        ctx.fillStyle = "#555";
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw buckets
      const colors = RISK_LEVELS[riskLevel].colors;
      bucketsRef.current.forEach((bucket, i) => {
        const grad = ctx.createLinearGradient(
          bucket.x,
          bucket.y,
          bucket.x,
          bucket.y + bucket.h
        );
        const colorClass = colors[i] || "from-gray-700 to-gray-800";
        // Simple color extraction (not perfect but works)
        if (colorClass.includes("yellow")) {
          grad.addColorStop(0, "#facc15");
          grad.addColorStop(1, "#f59e0b");
        } else if (colorClass.includes("orange")) {
          grad.addColorStop(0, "#f97316");
          grad.addColorStop(1, "#ea580c");
        } else if (colorClass.includes("green")) {
          grad.addColorStop(0, "#10b981");
          grad.addColorStop(1, "#059669");
        } else if (colorClass.includes("blue")) {
          grad.addColorStop(0, "#3b82f6");
          grad.addColorStop(1, "#06b6d4");
        } else if (colorClass.includes("purple")) {
          grad.addColorStop(0, "#a855f7");
          grad.addColorStop(1, "#9333ea");
        } else if (colorClass.includes("red")) {
          grad.addColorStop(0, "#ef4444");
          grad.addColorStop(1, "#dc2626");
        } else {
          grad.addColorStop(0, "#6b7280");
          grad.addColorStop(1, "#374151");
        }
        ctx.fillStyle = grad;
        ctx.fillRect(bucket.x, bucket.y, bucket.w, bucket.h);

        // Multiplier text
        ctx.fillStyle = "white";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `${bucket.multiplier}x`,
          bucket.x + bucket.w / 2,
          bucket.y + bucket.h / 2 + 4
        );
      });

      // Update and draw balls
      const balls = ballsRef.current;
      for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];

        // Gravity
        ball.vy += 800 * dt;

        // Drag
        ball.vx *= 0.995;
        ball.vy *= 0.995;

        // Max velocity
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (speed > 1500) {
          ball.vx *= 1500 / speed;
          ball.vy *= 1500 / speed;
        }

        // Update position
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Wall collision
        if (ball.x - ball.r < 0) {
          ball.x = ball.r;
          ball.vx *= -0.5;
        }
        if (ball.x + ball.r > canvas.width) {
          ball.x = canvas.width - ball.r;
          ball.vx *= -0.5;
        }

        // Peg collision
        pegsRef.current.forEach((peg) => {
          const dx = ball.x - peg.x;
          const dy = ball.y - peg.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < ball.r + peg.r) {
            const angle = Math.atan2(dy, dx);
            const overlap = ball.r + peg.r - dist;
            ball.x += Math.cos(angle) * overlap;
            ball.y += Math.sin(angle) * overlap;
            const dvx = ball.vx;
            const dvy = ball.vy;
            const dot = dvx * Math.cos(angle) + dvy * Math.sin(angle);
            ball.vx = (dvx - 2 * dot * Math.cos(angle)) * 0.6;
            ball.vy = (dvy - 2 * dot * Math.sin(angle)) * 0.6;
          }
        });

        // Bucket collision
        let landed = false;
        bucketsRef.current.forEach((bucket) => {
          if (
            ball.y + ball.r >= bucket.y &&
            ball.x >= bucket.x &&
            ball.x <= bucket.x + bucket.w &&
            ball.vy > 0
          ) {
            landed = true;
            landInBucket(ball, bucket);
            balls.splice(i, 1);
          }
        });

        // Draw ball
        if (!landed) {
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      setBallsDropping(balls.length);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mounted, riskLevel]);

  const landInBucket = (ball, bucket) => {
    const bet = ball.bet;
    const multiplier = bucket.multiplier;
    const prize = Math.floor(bet * multiplier);
    const win = prize > 0;

    if (win && prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
      playSfx(winSound.current);
    }

    const result = {
      win,
      multiplier,
      prize,
      profit: win ? prize - bet : -bet,
      bucketIndex: bucket.index,
    };

    setLastResult(result);
    setShowResultPopup(true);
    setTimeout(() => setShowResultPopup(false), 3000);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      wins: win ? stats.wins + 1 : stats.wins,
      losses: win ? stats.losses : stats.losses + 1,
      totalBet: stats.totalBet + bet,
      totalWon: win ? stats.totalWon + prize : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, win ? prize : 0),
      biggestMultiplier: Math.max(stats.biggestMultiplier, multiplier),
      lastBet: bet,
    };
    setStats(newStats);
  };

  const dropBall = (isFreePlayParam = false) => {
    playSfx(clickSound.current);
    const currentVault = getVault();
    let bet = Number(betAmount) || MIN_BET;
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace("/plinko2", undefined, { shallow: true });
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

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ball = {
      x: canvas.width / 2 + (Math.random() - 0.5) * 20,
      y: 20,
      vx: (Math.random() - 0.5) * 50,
      vy: 50,
      r: 5,
      bet,
    };

    ballsRef.current.push(ball);
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
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-gradient-to-br from-purple-900 via-black to-blue-900"
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
                  onClick={() => dropBall(true)}
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
          className="relative h-full flex flex-col items-center justify-center px-4 pb-16 mt-8"
          style={{
            minHeight: "100%",
            paddingTop: "calc(var(--head-h, 56px) + 8px)",
          }}
        >
          <div className="text-center mb-3">
            <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-1">
              🎯 Plinko
            </h1>
            <p className="text-white/70 text-sm">
              Balls Dropping: {ballsDropping}
            </p>
          </div>

          <div
            ref={metersRef}
            className="grid grid-cols-3 gap-2 mb-3 w-full max-w-md"
          >
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center">
              <div className="text-xs text-white/60 mb-1">Vault</div>
              <div className="text-lg font-bold text-emerald-400">
                {fmt(vault)}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center">
              <div className="text-xs text-white/60 mb-1">Bet</div>
              <div className="text-lg font-bold text-amber-400">
                {fmt(Number(betAmount))}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3 text-center">
              <div className="text-xs text-white/60 mb-1">Risk</div>
              <div className="text-lg font-bold text-purple-400">
                {RISK_LEVELS[riskLevel].name}
              </div>
            </div>
          </div>

          {/* CANVAS */}
          <div
            id="plinko-canvas-wrap"
            className="mb-3 w-full max-w-md"
            style={{ height: "var(--chart-h, 300px)" }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full rounded-lg border-2 border-white/10"
            />
          </div>

          {/* RISK SELECTOR */}
          <div className="mb-3 w-full max-w-md">
            <div className="flex gap-2 justify-center">
              {Object.entries(RISK_LEVELS).map(([key, data]) => (
                <button
                  key={key}
                  onClick={() => {
                    setRiskLevel(key);
                    playSfx(clickSound.current);
                  }}
                  disabled={ballsDropping > 0}
                  className={`px-3 py-2 rounded text-xs font-bold transition-all ${
                    riskLevel === key
                      ? "bg-purple-500 text-white ring-2 ring-purple-300"
                      : "bg-white/10 text-white hover:bg-white/20"
                  } disabled:opacity-50`}
                >
                  {data.name}
                </button>
              ))}
            </div>
          </div>

          <div ref={betRef} className="flex items-center gap-2 mb-3">
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = Math.max(MIN_BET, current - 1000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50"
            >
              −
            </button>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-32 h-12 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-sm"
              min={MIN_BET}
            />
            <button
              onClick={() => {
                const current = Number(betAmount) || MIN_BET;
                const newBet = Math.min(vault, current + 1000);
                setBetAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              className="h-12 w-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold disabled:opacity-50"
            >
              +
            </button>
          </div>

          <div
            ref={ctaRef}
            className="flex flex-col gap-3 w-full max-w-sm"
            style={{ minHeight: "140px" }}
          >
            <button
              onClick={() => dropBall(false)}
              disabled={Number(betAmount) < MIN_BET}
              className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-purple-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              🎯 DROP BALL
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

        {showResultPopup && lastResult && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div
              className={`${
                lastResult.win ? "bg-green-500" : "bg-red-500"
              } text-white px-8 py-6 rounded-2xl shadow-2xl text-center pointer-events-auto`}
              style={{ animation: "fadeIn 0.3s ease-in-out" }}
            >
              <div className="text-4xl mb-2">
                {lastResult.win ? "🎯" : "💥"}
              </div>
              <div className="text-2xl font-bold mb-1">
                {lastResult.win ? `${lastResult.multiplier}x!` : "BETTER LUCK!"}
              </div>
              <div className="text-lg">
                {lastResult.win
                  ? `+${fmt(lastResult.prize)} MLEO`
                  : `-${fmt(Math.abs(lastResult.profit))} MLEO`}
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
                <p>Plinko v2.0</p>
              </div>
            </div>
          </div>
        )}

        {showHowToPlay && (
          <div className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-zinc-900 text-white max-w-md w-full rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-auto">
              <h2 className="text-2xl font-extrabold mb-4">🎯 How to Play</h2>
              <div className="space-y-3 text-sm">
                <p>
                  <strong>1. Choose Risk:</strong> Low, Medium, or High risk levels
                </p>
                <p>
                  <strong>2. Set Your Bet:</strong> Choose your MLEO amount
                </p>
                <p>
                  <strong>3. Drop Ball:</strong> Watch it bounce through pegs!
                </p>
                <p>
                  <strong>4. Land in Bucket:</strong> Win based on multiplier
                </p>
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <p className="text-purple-300 font-semibold">
                    🎯 Higher risk = bigger multipliers!
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
                    <div className="text-xs text-white/60">Total Drops</div>
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
                      {stats.biggestMultiplier.toFixed(1)}x
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
