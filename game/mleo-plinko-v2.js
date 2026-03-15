// ============================================================================
// MLEO Drop Run X - Full-Screen Professional Plinko Game (No-Scroll Auto-Scale)
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
import { getFreePlayStatus } from "../lib/free-play-system";
import {
  finishArcadeSession,
  startFreeplayArcadeSession,
  startPaidArcadeSession,
} from "../lib/arcadeSessionClient";
import {
  debitSharedVault,
  initSharedVault,
  peekSharedVault,
  readSharedVault,
  subscribeSharedVault,
} from "../lib/sharedVault";

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
const MIN_PLAY = 100;

// EXTREME Plinko - 0 center and corners (Custom Probabilities!)
// High multipliers at edges for big wins, but low probability!
const MULTIPLIERS = [0, 40, 18, 5, 2, 1.5, 1, 0.5, 0, 0.5, 1, 1.5, 2, 5, 18, 40, 0];

// Adjusted probabilities for RTP ~99%
const CUSTOM_PROBABILITIES = [
  0.0002,   // 0.02% - corner ×0
  0.0001,   // 0.01% - ×40 (big win but rare!)
  0.003,    // 0.3% - ×2
  0.0015,   // 0.15% - ×18
  0.015,    // 1.5% - ×1.5
  0.04,     // 4% - ×5
  0.09,     // 9% - ×1
  0.12,     // 12% - ×0.5
  0.5,      // 50% - center ×0 (most common)
  0.12,     // 12% - ×0.5
  0.09,     // 9% - ×1
  0.04,     // 4% - ×5
  0.015,    // 1.5% - ×1.5
  0.0015,   // 0.15% - ×18
  0.003,    // 0.3% - ×2
  0.0001,   // 0.01% - ×40 (big win but rare!)
  0.0002    // 0.02% - corner ×0
];
const BUCKET_COLORS = ["from-black to-gray-900", "from-yellow-300 to-yellow-500", "from-orange-400 to-orange-600", "from-green-500 to-emerald-500", "from-blue-500 to-cyan-500", "from-purple-500 to-purple-600", "from-gray-600 to-gray-700", "from-red-600 to-red-700", "from-black to-gray-900", "from-red-600 to-red-700", "from-gray-600 to-gray-700", "from-purple-500 to-purple-600", "from-blue-500 to-cyan-500", "from-green-500 to-emerald-500", "from-orange-400 to-orange-600", "from-yellow-300 to-yellow-500", "from-black to-gray-900"];

const ROWS = 18;
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
function normalizeWholeAmount(value) {
  const num = Number(value);
  return Math.floor(Number.isFinite(num) ? num : 0);
}
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

function formatPlayDisplay(n) {
  const num = Number(n) || 0;
  if (num >= 1e6) return (num / 1e6).toFixed(num % 1e6 === 0 ? 0 : 2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(num % 1e3 === 0 ? 0 : 2) + "K";
  return num.toString();
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
  const [playAmount, setPlayAmount] = useState("100");
  const [activeAmountButton, setActiveAmountButton] = useState("100"); // Track which amount button is active
  const [isEditingPlay, setIsEditingPlay] = useState(false);
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
  const [collectAmount, setCollectAmount] = useState(100);
  const [sessionError, setSessionError] = useState("");
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
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
      biggestMultiplier: 0,
      lastPlay: MIN_PLAY,
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
    let cancelled = false;
    setMounted(true);
    initSharedVault();
    readSharedVault()
      .then(snapshot => {
        if (!cancelled) setVaultState(snapshot.balance);
      })
      .catch(() => {
        if (!cancelled) setVaultState(peekSharedVault().balance);
      });

    const isFree = router.query.freePlay === "true";
    setIsFreePlay(isFree);
    const gameId = router.pathname.replace('/', '') || 'plinko';
    getFreePlayStatus().then(status => {
      if (!cancelled) setFreePlayTokens(status.tokens);
    }).catch(err => console.error('Failed to get free play status:', err));
    // Always set initial bet to 100 on game entry
    setPlayAmount("100");
    setActiveAmountButton("100");

    const unsubscribeVault = subscribeSharedVault(snapshot => {
      if (!cancelled) setVaultState(snapshot.balance);
    });

    const interval = setInterval(() => {
      getFreePlayStatus().then(status => {
        if (!cancelled) setFreePlayTokens(status.tokens);
      }).catch(err => console.error('Failed to get free play status:', err));
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
      cancelled = true;
      unsubscribeVault();
      clearInterval(interval);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [router.query]);

  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  // Dynamic canvas scaling
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
      const bucketCount = MULTIPLIERS.length;

      // Build pegs - more rows, tighter spacing
      const pegs = [];
      const pegGapX = (w - 40) / (ROWS + 2);
      const pegGapY = (h - 50) / (ROWS + 2);

      for (let row = 0; row < ROWS; row++) {
        const pegCount = row + 2;
        const rowY = 40 + row * pegGapY;
        for (let col = 0; col < pegCount; col++) {
          const rowWidth = pegCount * pegGapX;
          const startX = (w - rowWidth) / 2 + pegGapX / 2;
          const pegX = startX + col * pegGapX;
          pegs.push({ x: pegX, y: rowY, r: 3 });
        }
      }

      // Build buckets - 50% smaller height
      const buckets = [];
      const bucketWidth = (w - 40) / bucketCount;
      for (let i = 0; i < bucketCount; i++) {
        buckets.push({
          x: 20 + i * bucketWidth,
          y: h - 50,
          w: bucketWidth,
          h: 20,
          multiplier: MULTIPLIERS[i],
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
      bucketsRef.current.forEach((bucket, i) => {
        const grad = ctx.createLinearGradient(
          bucket.x,
          bucket.y,
          bucket.x,
          bucket.y + bucket.h
        );
        const colorClass = BUCKET_COLORS[i] || "from-gray-700 to-gray-800";
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

        // Multiplier text - smaller for smaller buckets
        ctx.fillStyle = "white";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `${bucket.multiplier}x`,
          bucket.x + bucket.w / 2,
          bucket.y + bucket.h / 2 + 3
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
        
        // Gentle center bias - barely noticeable but keeps RTP balanced
        const centerX = canvas.width / 2;
        const centerBias = 0.05; // Very light - keeps balls more to center
        const biasForce = (centerX - ball.x) * centerBias * dt * 60;
        ball.vx += biasForce;

        if (Number.isInteger(ball.targetBucketIndex)) {
          const targetBucket = bucketsRef.current[ball.targetBucketIndex];
          if (targetBucket) {
            const targetCenterX = targetBucket.x + targetBucket.w / 2;
            const steerStrength = ball.y >= canvas.height * 0.55 ? 0.14 : 0.03;
            ball.vx += (targetCenterX - ball.x) * steerStrength * dt * 60;
          }
        }

        // Wall collision - REMOVE ball if hits walls (0x multiplier)
        if (ball.x - ball.r < 0 || ball.x + ball.r > canvas.width) {
          const fallbackBucket = Number.isInteger(ball.targetBucketIndex)
            ? bucketsRef.current[ball.targetBucketIndex]
            : { multiplier: 0, index: 8 };
          landInBucket(ball, fallbackBucket);
          balls.splice(i, 1);
          continue;
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

        // Bucket collision - only check if ball reached buckets area
        let landed = false;
        if (ball.y >= canvas.height - 80 && ball.vy > 0) {
          const targetBucket = Number.isInteger(ball.targetBucketIndex)
            ? bucketsRef.current[ball.targetBucketIndex]
            : null;
          const bucketWidth = canvas.width / MULTIPLIERS.length;
          let bucketIndex = Math.floor(ball.x / bucketWidth);
          bucketIndex = Math.max(0, Math.min(bucketIndex, bucketsRef.current.length - 1));
          const bucket = targetBucket || bucketsRef.current[bucketIndex];
          if (bucket && ball.y + ball.r >= bucket.y && ball.x >= bucket.x - 10 && ball.x <= bucket.x + bucket.w + 10) {
            landed = true;
            ball.x = bucket.x + bucket.w / 2;
            landInBucket(ball, bucket);
            balls.splice(i, 1);
          }
        }

        // Draw ball - smaller for better physics
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
  }, [mounted]);

  const landInBucket = async (ball, bucket) => {
    const play = ball.play;
    const payload = ball.finishResult?.serverPayload || {};
    const bucketIndex = Number.isInteger(payload.bucketIndex) ? payload.bucketIndex : bucket.index;
    const multiplier = Number(payload.multiplier ?? MULTIPLIERS[bucketIndex] ?? 0);
    const prize = Math.max(0, Number(ball.finishResult?.approvedReward ?? Math.floor(play * multiplier)));
    const win = Boolean(payload.won ?? (prize > 0));

    if (Number.isFinite(ball.finishResult?.balanceAfter)) {
      setVaultState(ball.finishResult.balanceAfter);
    }
    if (win && prize > 0) {
      playSfx(winSound.current);
    }

    const result = {
      win,
      multiplier,
      prize,
      profit: win ? prize - play : -play,
      bucketIndex: bucketIndex,
    };

    setLastResult(result);
    setShowResultPopup(true);
    setTimeout(() => setShowResultPopup(false), 3000);

    const newStats = {
      ...stats,
      totalGames: stats.totalGames + 1,
      wins: win ? stats.wins + 1 : stats.wins,
      losses: win ? stats.losses : stats.losses + 1,
      totalPlay: stats.totalPlay + play,
      totalWon: win ? stats.totalWon + prize : stats.totalWon,
      biggestWin: Math.max(stats.biggestWin, win ? prize : 0),
      biggestMultiplier: Math.max(stats.biggestMultiplier, multiplier),
      lastPlay: play,
    };
    setStats(newStats);
  };

  // Handle amount button clicks
  const handleAmountButtonClick = (amountValue) => {
    if (ballsDropping > 0) return;
    playSfx(clickSound.current);
    
    const currentAmount = Number(playAmount) || MIN_PLAY;
    const amountStr = String(amountValue);
    
    if (activeAmountButton === amountStr) {
      // Same button clicked - add the amount
      const newAmount = Math.min(vault, currentAmount + amountValue);
      setPlayAmount(String(newAmount));
    } else {
      // Different button clicked - switch to that amount
      setActiveAmountButton(amountStr);
      const newAmount = Math.min(vault, amountValue);
      setPlayAmount(String(newAmount));
    }
  };

  const dropBall = async (isFreePlayParam = false) => {
    if (ballsDropping > 0) return; // Prevent double clicks
    playSfx(clickSound.current);
    setSessionError("");
    try {
      let play = Number(playAmount) || MIN_PLAY;
      let finishResult;
      if (isFreePlay || isFreePlayParam) {
        const gameId = router.pathname.replace('/', '') || 'plinko';
        try {
          const startResult = await startFreeplayArcadeSession(gameId);
          if (startResult.success) {
            play = startResult.amount;
            setFreePlayTokens(startResult.remainingTokens);
            setIsFreePlay(false);
            router.replace("/plinko", undefined, { shallow: true });
            finishResult = await finishArcadeSession(startResult.sessionId, {});
          } else {
            alert(startResult.message || "No free play tokens available!");
            setIsFreePlay(false);
            return;
          }
        } catch (error) {
          console.error('Free play error:', error);
          alert('Failed to use free play token. Please try again.');
          setIsFreePlay(false);
          return;
        }
      } else {
        if (play < MIN_PLAY) {
          alert(`Minimum play is ${MIN_PLAY} MLEO`);
          return;
        }
        const startResult = await startPaidArcadeSession("plinko", play);
        if (!startResult.success) {
          alert(startResult.message || "Failed to start session");
          return;
        }
        setVaultState(startResult.balanceAfter);
        finishResult = await finishArcadeSession(startResult.sessionId, {});
      }
      if (!finishResult?.success) {
        setSessionError("Session failed to finish");
        alert(finishResult?.message || "Failed to finish session");
        return;
      }
      setPlayAmount(String(play));

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ball = {
        x: canvas.width / 2 + (Math.random() - 0.5) * 20,
        y: 20,
        vx: (Math.random() - 0.5) * 50,
        vy: 50,
        r: 3,
        play,
        finishResult,
        targetBucketIndex: Number(finishResult?.serverPayload?.bucketIndex),
      };

      ballsRef.current.push(ball);
    } catch (error) {
      console.error("Plinko session error:", error);
      setSessionError("Session failed to finish");
      alert("Failed to finish session. Please refresh vault and try again.");
    }
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
    const wholeAmount = normalizeWholeAmount(collectAmount);
    if (wholeAmount <= 0 || wholeAmount > vault) {
      alert("Invalid amount!");
      return;
    }
    setClaiming(true);
    try {
      const amountUnits = parseUnits(String(wholeAmount), MLEO_DECIMALS);
      const hash = await writeContractAsync({
        address: CLAIM_ADDRESS,
        abi: MINING_CLAIM_ABI,
        functionName: "claim",
        args: [BigInt(GAME_ID), amountUnits],
        chainId: CLAIM_CHAIN_ID,
        account: address,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const debitResult = await debitSharedVault(wholeAmount, "plinko-v2");
      setVaultState(debitResult.balance);
      alert(`✅ Sent ${fmt(wholeAmount)} MLEO to wallet!`);
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
          className="relative h-full flex flex-col items-center justify-start px-4 pb-4"
          style={{
            minHeight: "100%",
            paddingTop: "calc(var(--head-h, 56px) + 8px)",
          }}
        >
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">
              🎯 Drop Run
            </h1>
            <p className="text-white/70 text-xs">
              EXTREME MODE • ×40 GrandPrize!
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
              <div className="text-[10px] text-white/60">Play</div>
              <div className="text-sm font-bold text-amber-400">
                {fmt(Number(playAmount))}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Balls</div>
              <div className="text-sm font-bold text-purple-400">
                {ballsDropping}
              </div>
            </div>
          </div>

          {/* CANVAS */}
          <div
            id="plinko-canvas-wrap"
            className="mb-1 w-full max-w-md relative"
            style={{ height: "var(--chart-h, 300px)" }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full rounded-lg border-2 border-white/10"
            />
            
            {/* RESULT POPUP - Inside game area */}
            {showResultPopup && lastResult && (
              <div className={`absolute top-2 z-[9999] pointer-events-none ${
                lastResult.win ? "right-2" : "left-2"
              }`}>
                <div
                  className={`${
                    lastResult.win ? "bg-green-500" : "bg-red-500"
                  } text-white px-3 py-2 rounded-lg shadow-2xl text-center pointer-events-auto max-w-[200px]`}
                  style={{ animation: "fadeIn 0.3s ease-in-out" }}
                >
                  <div className="text-lg mb-1">
                    {lastResult.win ? "🎯" : "💥"}
                  </div>
                  <div className="text-sm font-bold mb-1">
                    {lastResult.win ? `${lastResult.multiplier}x!` : "BETTER LUCK!"}
                  </div>
                  <div className="text-xs font-bold">
                    {lastResult.win
                      ? `+${fmt(lastResult.prize)} MLEO`
                      : `-${fmt(Math.abs(lastResult.profit))} MLEO`}
                  </div>
                  {lastResult.win && lastResult.multiplier && (
                    <div className="text-[10px] opacity-90 mt-0.5">
                      Prize: {fmt(lastResult.prize)} MLEO (×{lastResult.multiplier.toFixed(2)})
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={betRef} className="flex items-center justify-center gap-1 mb-1 flex-wrap">
            <button
              onClick={() => handleAmountButtonClick(100)}
              disabled={ballsDropping > 0}
              className={`w-12 h-8 rounded-lg font-bold text-xs disabled:opacity-50 transition-all ${
                activeAmountButton === "100"
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg ring-2 ring-yellow-300'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              100
            </button>
            <button
              onClick={() => handleAmountButtonClick(1000)}
              disabled={ballsDropping > 0}
              className={`w-12 h-8 rounded-lg font-bold text-xs disabled:opacity-50 transition-all ${
                activeAmountButton === "1000"
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg ring-2 ring-yellow-300'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              1K
            </button>
            <button
              onClick={() => handleAmountButtonClick(10000)}
              disabled={ballsDropping > 0}
              className={`w-12 h-8 rounded-lg font-bold text-xs disabled:opacity-50 transition-all ${
                activeAmountButton === "10000"
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg ring-2 ring-yellow-300'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              10K
            </button>
            <button
              onClick={() => handleAmountButtonClick(100000)}
              disabled={ballsDropping > 0}
              className={`w-12 h-8 rounded-lg font-bold text-xs disabled:opacity-50 transition-all ${
                activeAmountButton === "100000"
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black shadow-lg ring-2 ring-yellow-300'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              100K
            </button>
            <button
              onClick={() => {
                const current = Number(playAmount) || MIN_PLAY;
                const newBet = Math.max(MIN_PLAY, current - 100);
                setPlayAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50"
            >
              −
            </button>
            <div className="relative">
              <input
                type="text"
                value={isEditingPlay ? playAmount : formatPlayDisplay(playAmount)}
                onFocus={() => setIsEditingPlay(true)}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setPlayAmount(val || '0');
                  // Clear active button when manually editing
                  setActiveAmountButton(null);
                }}
                onBlur={() => {
                  setIsEditingPlay(false);
                  const current = Number(playAmount) || MIN_PLAY;
                  setPlayAmount(String(Math.max(MIN_PLAY, current)));
                }}
                className="w-20 h-8 bg-black/30 border border-white/20 rounded-lg text-center text-white font-bold disabled:opacity-50 text-xs pr-6"
              />
              <button
                onClick={() => {
                  setPlayAmount(String(MIN_PLAY));
                  setActiveAmountButton("100");
                  playSfx(clickSound.current);
                }}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs disabled:opacity-50 flex items-center justify-center"
                title="Reset to minimum play"
              >
                ↺
              </button>
            </div>
            <button
              onClick={() => {
                const current = Number(playAmount) || MIN_PLAY;
                const newBet = Math.min(vault, current + 1000);
                setPlayAmount(String(newBet));
                playSfx(clickSound.current);
              }}
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm disabled:opacity-50"
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
              disabled={ballsDropping > 0 || Number(playAmount) < MIN_PLAY}
              className="w-full py-3 rounded-lg font-bold text-base bg-gradient-to-r from-purple-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ballsDropping > 0 ? "🎯 Dropping..." : "🎯 DROP BALL"}
            </button>
            {sessionError ? <div className="text-center text-xs text-red-300">{sessionError}</div> : null}
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
                <p>Plinko2 v2.0</p>
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
                  <strong>1. Set Your Play:</strong> Choose your MLEO amount
                </p>
                <p>
                  <strong>2. Drop Ball:</strong> Click "DROP BALL" to play!
                </p>
                <p>
                  <strong>3. Watch:</strong> Ball bounces through pegs
                </p>
                <p>
                  <strong>4. Win:</strong> Land in a bucket with a multiplier!
                </p>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-yellow-300 font-semibold mb-2">💥 EXTREME Prizes!</p>
                  <div className="text-xs space-y-1">
                    <p className="text-white/80">🚀 <span className="text-yellow-300 font-bold text-base">×40</span> - Ultra rare grandPrize!</p>
                    <p className="text-white/80">🔥 Great prizes: <span className="text-orange-300 font-bold">×18, ×2</span></p>
                    <p className="text-white/80">💎 Middle prizes: <span className="text-green-300 font-bold">×5, ×1.5</span></p>
                    <p className="text-white/80">⭐ Small prizes: <span className="text-blue-300">×1, ×0.5</span></p>
                    <p className="text-white/80">💀 <span className="text-red-400 font-bold">Center & Corners: ×0</span></p>
                    <p className="text-yellow-200 mt-1 italic font-semibold">Aim for the middle zones!</p>
                  </div>
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
                    <div className="text-xs text-white/60">Total Play</div>
                    <div className="text-lg font-bold text-amber-400">
                      {fmt(stats.totalPlay)}
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
                      step="1"
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(normalizeWholeAmount(e.target.value))}
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

