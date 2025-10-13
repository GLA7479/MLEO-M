// ============================================================================
// MLEO Plinko — Continuous Physics (Canvas Edition)
// Cost: 1000 MLEO per drop
// Requirements: Tailwind present, /sounds optional
// ============================================================================

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Link from "next/link";
import { useFreePlayToken, getFreePlayStatus } from "../lib/free-play-system";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_plinko_v2_physics";
const MIN_BET = 1000; // Minimum bet amount

// 15 buckets (13 original + 2 zero buckets at edges)
const MULTIPLIERS = [0, 10, 1.5, 3, 1, 0.5, 0.2, 0, 0.2, 0.5, 1, 3, 1.5, 10, 0];
const BUCKET_COLORS = [
  "from-gray-700 to-gray-800",       // 0x (edge)
  "from-yellow-400 to-amber-500",    // 10x
  "from-orange-500 to-orange-600",   // 1.5x
  "from-green-500 to-emerald-500",   // 3x
  "from-blue-500 to-cyan-500",       // 1x
  "from-purple-500 to-purple-600",   // 0.5x
  "from-red-500 to-red-600",         // 0.2x
  "from-gray-700 to-gray-800",       // 0x
  "from-red-500 to-red-600",         // 0.2x
  "from-purple-500 to-purple-600",   // 0.5x
  "from-blue-500 to-cyan-500",       // 1x
  "from-green-500 to-emerald-500",   // 3x
  "from-orange-500 to-orange-600",   // 1.5x
  "from-yellow-400 to-amber-500",    // 10x
  "from-gray-700 to-gray-800",       // 0x (edge)
];

// Peg grid
const ROWS = 10;     // peg rows (triangle: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
const COLS = 15;     // peg columns (also number of buckets)
const OFFSET_ROWS = true; // stagger every other row for zigzag pattern

// Physics tunables - RESPONSIVE
const PHYS_WIDE = {  // Desktop/Wide screens
  gravity: 1200,
  airDrag: 0.012,
  restitution: 0.45,
  wallRestitution: 0.35,
  pegRadius: 8,           // Larger pegs for wide screens
  ballRadius: 6,          // Larger ball for wide screens
  maxVel: 2200,
  spawnJitterX: 14,
  spawnVy: 30,
  centerBias: 0.0008,
  bucketCaptureVy: 150,
};

const PHYS_NARROW = {  // Mobile/Narrow screens
  gravity: 1000,          // Slower gravity for mobile
  airDrag: 0.015,         // More damping for mobile
  restitution: 0.4,       // Less bouncy for mobile
  wallRestitution: 0.3,
  pegRadius: 4,           // Smaller pegs for mobile
  ballRadius: 3,          // Much smaller ball for mobile
  maxVel: 1800,           // Lower max velocity
  spawnJitterX: 10,       // Less jitter on mobile
  spawnVy: 25,
  centerBias: 0.001,
  bucketCaptureVy: 120,   // Lower capture speed
};

// Board layout - RESPONSIVE
const BOARD_WIDE = {
  marginX: 20,
  marginTop: 20,
  marginBottom: 40,
  pegGapX: 42,        // Larger gaps for wide screens
  pegGapY: 44,        // Larger gaps for wide screens
};

const BOARD_NARROW = {
  marginX: 15,        // Smaller margins for mobile
  marginTop: 15,
  marginBottom: 35,
  pegGapX: 28,        // Smaller gaps for mobile
  pegGapY: 32,        // Smaller gaps for mobile
};

// Sounds (optional)
const SOUND = {
  bounce: "/sounds/click.mp3",
  drop: "/sounds/click.mp3",
  win: "/sounds/success.mp3",
};

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

// Reuse vault from your existing Rush storage
function getVault() {
  const rushData = safeRead("mleo_rush_core_v4", {});
  return rushData.vault || 0;
}
function setVault(amount) {
  const rushData = safeRead("mleo_rush_core_v4", {});
  rushData.vault = amount;
  safeWrite("mleo_rush_core_v4", rushData);
}

// Formatting
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

// Seeded RNG for stable feel
let RNG = (() => {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0] || 2463534242;
  }
  return Math.floor(Math.random() * 0xffffffff) || 2463534242;
})();
function rand01() {
  // xorshift32
  let x = RNG;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  RNG = x >>> 0;
  return (RNG % 1e9) / 1e9;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PlinkoPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);
  
  // Screen detection
  const [isWideScreen, setIsWideScreen] = useState(true);
  const [screenWidth, setScreenWidth] = useState(0);

  const [result, setResult] = useState(null);
  const [finalBuckets, setFinalBuckets] = useState([]); // recent landings visual
  const [betAmount, setBetAmount] = useState("1000"); // Default bet amount
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [freePlayTokens, setFreePlayTokens] = useState(0);
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalDrops: 0, totalBet: 0, totalWon: 0, biggestWin: 0, history: [], lastBet: MIN_BET })
  );

  // Sounds
  const dropSound = useRef(null);
  const winSound = useRef(null);
  const bounceSound = useRef(null);

  // Canvas & Physics state
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);

  // Get responsive config based on screen size
  const PHYS = useMemo(() => isWideScreen ? PHYS_WIDE : PHYS_NARROW, [isWideScreen]);
  const BOARD = useMemo(() => isWideScreen ? BOARD_WIDE : BOARD_NARROW, [isWideScreen]);
  const pegsRef = useRef([]);
  const ballsRef = useRef([]);
  const bucketsRef = useRef([]); // {x, width, index}
  const boardRef = useRef(null); // dimensions & helpers

  // Timing
  const lastTsRef = useRef(0);
  const accumulatorRef = useRef(0);
  const FIXED_DT = 1 / 120; // 120 Hz physics

  // Screen detection effect
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setScreenWidth(width);
      // Consider wide screen if width > 768px or aspect ratio > 1.2
      const isWide = width > 768 || (width / window.innerHeight) > 1.2;
      setIsWideScreen(isWide);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    window.addEventListener('orientationchange', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
      window.removeEventListener('orientationchange', checkScreenSize);
    };
  }, []);

  // Init
  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());

    const isFree = router.query.freePlay === 'true';
    setIsFreePlay(isFree);
    
    const freePlayStatus = getFreePlayStatus();
    setFreePlayTokens(freePlayStatus.tokens);

    // Load last bet amount
    const savedStats = safeRead(LS_KEY, { lastBet: MIN_BET });
    if (savedStats.lastBet) {
      setBetAmount(String(savedStats.lastBet));
    }
    
    const interval = setInterval(() => {
      const status = getFreePlayStatus();
      setFreePlayTokens(status.tokens);
    }, 2000);

    if (typeof Audio !== "undefined") {
      try {
        dropSound.current = new Audio(SOUND.drop);
        winSound.current = new Audio(SOUND.win);
        bounceSound.current = new Audio(SOUND.bounce);
      } catch {}
    }
    
    return () => clearInterval(interval);
  }, [router.query]);

  // Persist stats
  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

  // Auto-hide result popup
  useEffect(() => {
    if (result) {
      setShowResultPopup(true);
      const timer = setTimeout(() => {
        setShowResultPopup(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [result]);

  const resetToSetup = () => {
    setResult(null);
    setShowResultPopup(false);
    setBall(null);
    setAnimating(false);
    setGameActive(false);
  };

  // Canvas init & resize
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const resize = () => {
      const parent = canvas.parentElement;
      const w = Math.min(parent.clientWidth, 880);
      const h = Math.max(520, Math.floor(w * 0.9));

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;

      // Rebuild board geometry
      buildBoardGeometry(w, h);
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [mounted]);

function buildBoardGeometry(w, h) {
  const left = BOARD.marginX;
  const right = w - BOARD.marginX;
  const top = BOARD.marginTop;

  // ---- היה קודם: const bottom = h - BOARD.marginBottom;

  // Fit gaps
  const totalWidth = (COLS - 1) * BOARD.pegGapX;
  const innerWidth = right - left;
  const scaleX = innerWidth / totalWidth;
  const gapX = BOARD.pegGapX * scaleX;
  const gapY = BOARD.pegGapY * Math.max(0.85, Math.min(1.15, scaleX)); // Reduced gap

  const centerX = left + innerWidth * 0.5;
  const totalRows = 13; // Triangle with 13 rows to reach bottom
  const maxPegsInRow = 15; // Make triangle wider to reach edges

  // נחשב איפה נמצאת שורת היתדות האחרונה
  const lastPegY = top + (totalRows - 1) * gapY + 24; // כמו בציור היתדות
  const baseBottom = h - BOARD.marginBottom;     // הרצפה הקבועה המקורית
  const desiredBottom =
    lastPegY + PHYS.pegRadius + Math.max(48, gapY * 0.9); // עוד מרווח לבאקטים

  // הרצפה צריכה להיות מתחת לשורה האחרונה, אבל לא לצאת מהקנבס
  const bottom = Math.min(h - 20, Math.max(baseBottom, desiredBottom));


    // Pegs - Perfect triangle shape
    const pegs = [];
    
    for (let r = 0; r < totalRows; r++) {
      // Calculate pegs in row - triangle that reaches bottom
      let pegsInRow;
      if (r === 0) {
        pegsInRow = 1; // New row 0 with 1 peg
      } else if (r < 9) {
        pegsInRow = r + 1; // Growing: 2, 3, 4, 5, 6, 7, 8, 9
      } else {
        pegsInRow = 10 + (r - 9) * 2; // Growing: 10, 12, 14, 16
      }
      
      // Add extra pegs on sides for row 1 (index 0)
      if (r === 0) {
        pegsInRow += 2; // Add one peg on each side
      }
      
      // Add extra pegs on sides for row 2 (old row 1, index 1)
      if (r === 1) {
        pegsInRow += 2; // Add one peg on each side
      }
      
      // Add extra pegs on sides for rows 3-10 (old rows 2-9, indices 2-9)
      if (r >= 2 && r <= 9) {
        pegsInRow += 2; // Add one peg on each side
      }
      
      // Add one extra peg on right side for row 11 (old row 10, index 10)
      if (r === 10) {
        pegsInRow += 1; // Add one peg on right side
      }
      
      // Perfect staggering offset for zigzag pattern - shift even rows right slightly
      let offset = (r % 2 === 1) ? gapX * 0.05 : 0;
      
      // Special case: row 11 (old row 10) shift right by 0.05
      if (r === 10) { // row 11 (0-indexed)
        offset = gapX * 0.05;
      }
      
      // Special case: row 13 (old row 12) shift left by 0.4
      if (r === 12) { // row 13 (0-indexed)
        offset = -gapX * 0.4;
      }
      
      // Global shift: move all rows 0.1 to the left
      offset -= gapX * 0.1;
      
      // Center the row
      const rowWidth = (pegsInRow - 1) * gapX;
      const startX = centerX - rowWidth / 2 + offset;
      
      for (let c = 0; c < pegsInRow; c++) {
        const x = startX + c * gapX;
        const y = top + r * gapY + 24;
        pegs.push({ x, y, r: PHYS.pegRadius });
      }
    }

    // Buckets: Custom widths - ×10 and ×3 buckets half size, ×0 buckets larger
    // Calculate total flex units: 1.5 + 0.5 + 1 + 0.5 + 1 + 1 + 1 + 2 + 1 + 1 + 1 + 0.5 + 1 + 0.5 + 1.5 = 15
    const totalFlexUnits = 1.5 + 0.5 + 1 + 0.5 + 1 + 1 + 1 + 2 + 1 + 1 + 1 + 0.5 + 1 + 0.5 + 1.5; // = 15
    const unitWidth = innerWidth / totalFlexUnits;
    const buckets = [];
    let currentX = left;
    
    for (let i = 0; i < COLS; i++) {
      let bucketFlex;
      if (i === 0 || i === 14) {
        bucketFlex = 1.5; // ×0 edge buckets larger
      } else if (i === 1 || i === 13 || i === 3 || i === 11) {
        bucketFlex = 0.5; // ×10 and ×3 buckets half size
      } else if (i === 7) {
        bucketFlex = 2; // ×0 center bucket larger
      } else {
        bucketFlex = 1; // Normal buckets
      }
      const bucketWidth = unitWidth * bucketFlex;
      buckets.push({ x: currentX, width: bucketWidth, index: i });
      currentX += bucketWidth;
    }
    
    // For compatibility, store average bucket width
    const avgBucketWidth = innerWidth / COLS;

    boardRef.current = {
      w, h, left, right, top, bottom, centerX,
      gapX, gapY, innerWidth, bucketWidth: avgBucketWidth,
    };
    pegsRef.current = pegs;
    bucketsRef.current = buckets;
  }

  // Physics step
  function step(dt) {
    const ctx = ctxRef.current;
    const board = boardRef.current;
    if (!ctx || !board) return;

    // --- Integrate & Collide
    const balls = ballsRef.current;
    for (let b of balls) {
      // Gravity
      b.vy += PHYS.gravity * dt;

      // Tiny center bias (feels like the board is slightly funneling)
      const towardsCenter = Math.sign(board.centerX - b.x) * PHYS.centerBias * PHYS.gravity;
      b.vx += towardsCenter;

      // Air drag
      b.vx *= (1 - PHYS.airDrag);
      b.vy *= (1 - PHYS.airDrag);

      // Clamp vel
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > PHYS.maxVel * PHYS.maxVel) {
        const s = Math.sqrt(sp2);
        b.vx = (b.vx / s) * PHYS.maxVel;
        b.vy = (b.vy / s) * PHYS.maxVel;
      }

      // Integrate
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Collide walls - REMOVED side walls to allow balls to exit
      const R = PHYS.ballRadius;
      // Side walls removed - balls can now exit from sides

      if (b.y < board.top + R) {
        b.y = board.top + R;
        b.vy = -b.vy * PHYS.wallRestitution;
      }

      // Collide pegs (simple circle-circle; impulse along normal)
      for (let p of pegsRef.current) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const rr = R + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.max(0.0001, Math.sqrt(d2));
          const nx = dx / d, ny = dy / d;

          // Separate
          const overlap = rr - d;
          b.x += nx * overlap;
          b.y += ny * overlap;

          // Reflect velocity on normal
          const vn = b.vx * nx + b.vy * ny;           // normal component
          const vtX = b.vx - vn * nx;                 // tangential component (x)
          const vtY = b.vy - vn * ny;                 // tangential component (y)
          let bounce = -vn * PHYS.restitution;        // reverse with restitution
          // Add micro random jitter to avoid lock-in
          const jitter = (rand01() - 0.5) * 30;
          const jx = nx * bounce + (vtX + jitter * 0.02);
          const jy = ny * bounce + (vtY - jitter * 0.02);
          b.vx = jx;
          b.vy = jy;

          // Audio
          if (bounceSound.current) {
            try {
              const speed = Math.min(1, Math.abs(vn) / 800);
              bounceSound.current.volume = 0.06 + 0.22 * speed;
              bounceSound.current.currentTime = 0;
              bounceSound.current.play().catch(() => {});
            } catch {}
          }
        }
      }

      // Floor & bucket capture
      const floorY = board.bottom - R;
      if (b.y >= floorY) {
        // If slow enough vertically → capture
        if (Math.abs(b.vy) < PHYS.bucketCaptureVy) {
          // Snap to floor, lock
          b.y = floorY;

          // Resolve which bucket
          const idx = Math.max(
            0,
            Math.min(
              COLS - 1,
              Math.floor((b.x - board.left) / board.bucketWidth)
            )
          );
          landInBucket(idx, b);
        } else {
          // Bounce upward a bit, with damping
          b.y = floorY;
          b.vy = -Math.abs(b.vy) * PHYS.wallRestitution * 0.8;
          b.vx *= 0.98;
        }
      }
    }

    // Remove landed balls
    ballsRef.current = ballsRef.current.filter(b => !b._landed);
  }

  function landInBucket(idx, ball) {
    ball._landed = true;

    // Visual highlight
    setFinalBuckets(prev => [...prev, idx]);
    setTimeout(() => {
      setFinalBuckets(prev => prev.filter(i => i !== idx));
    }, 1500);

    // Prize
    const mult = MULTIPLIERS[idx] ?? 0;
    const prize = Math.floor(ball.betAmount * mult);
    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

      setStats(s => ({
        totalDrops: s.totalDrops + 1,
        totalBet: (s.totalBet || 0) + ball.betAmount,
        totalWon: s.totalWon + prize,
        biggestWin: Math.max(s.biggestWin, prize),
        history: [
          { mult, prize, bucket: idx, timestamp: Date.now() },
          ...s.history.slice(0, 9)
        ],
        lastBet: ball.betAmount
      }));

    setResult({
      win: mult >= 1,
      message: `×${mult}`,
      prize,
      multiplier: mult
    });

    if (winSound.current && mult >= 2) {
      try {
        winSound.current.volume = 0.32;
        winSound.current.currentTime = 0;
        winSound.current.play().catch(() => {});
      } catch {}
    }
  }

  // RAF loop (fixed timestep)
  useEffect(() => {
    if (!mounted) return;
    let running = true;
    lastTsRef.current = performance.now();
    accumulatorRef.current = 0;

    const loop = (ts) => {
      if (!running) return;

      const dtMs = ts - lastTsRef.current;
      lastTsRef.current = ts;

      // cap large frame jumps
      const frame = Math.min(0.05, dtMs / 1000);
      accumulatorRef.current += frame;

      // multiple fixed steps
      while (accumulatorRef.current >= FIXED_DT) {
        step(FIXED_DT);
        accumulatorRef.current -= FIXED_DT;
      }

      render();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [mounted]);

  // Render canvas
  function render() {
    const ctx = ctxRef.current;
    const board = boardRef.current;
    if (!ctx || !board) return;

    const { w, h, left, right, top, bottom, innerWidth, bucketWidth } = board;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // BG
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(18, 24, 40, 0.95)");
    g.addColorStop(1, "rgba(8, 12, 24, 0.98)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Board walls (glow)
    ctx.save();
    // Side borders removed - balls can now exit from sides
    ctx.restore();

    // Buckets background - use custom widths from buckets array
    const buckets = bucketsRef.current || [];
    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      ctx.fillStyle = i % 2 === 0 ? "rgba(30,58,138,0.24)" : "rgba(6,78,59,0.22)";
      ctx.fillRect(bucket.x + 1, bottom, bucket.width - 2, 18);
    }

    // Pegs
    const balls = ballsRef.current;
    for (let p of pegsRef.current) {
      // check if ball is near to light up
      let glow = false;
      for (let b of balls) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy < (p.r + PHYS.ballRadius + 6) ** 2) {
          glow = true; break;
        }
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      if (glow) {
        ctx.fillStyle = "#f8d34b";
        ctx.shadowColor = "rgba(250,204,21,0.9)";
        ctx.shadowBlur = 20;
      } else {
        ctx.fillStyle = "#5aa3ff";
        ctx.shadowColor = "rgba(59,130,246,0.5)";
        ctx.shadowBlur = 8;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Balls
    for (let b of balls) {
      ctx.save();
      ctx.translate(b.x, b.y);
      // subtle rotation by velocity direction
      const ang = Math.atan2(b.vy, b.vx);
      ctx.rotate(ang);

      // Body
      const r = PHYS.ballRadius;
      const grd = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.2, 0, 0, r);
      grd.addColorStop(0, "rgba(255,240,200,1)");
      grd.addColorStop(0.4, "rgba(253,186,116,1)");
      grd.addColorStop(1, "rgba(244,63,94,1)");
      ctx.fillStyle = grd;
      ctx.strokeStyle = "rgba(252,211,77,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Glow
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(250,204,21,0.22)";
      ctx.fill();
      ctx.restore();
    }

    // Bottom line
    ctx.save();
    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.restore();
  }

  const startFreePlay = () => {
    setBetAmount("1000");
    dropBall(true);
  };

  // Drop ball
  function dropBall(isFreePlayParam = false) {
    let bet = Number(betAmount) || MIN_BET;
    
    if (isFreePlay || isFreePlayParam) {
      const result = useFreePlayToken();
      if (result.success) {
        bet = result.amount;
        setIsFreePlay(false);
        router.replace('/plinko', undefined, { shallow: true });
      } else {
        setResult({ error: true, message: 'No free play tokens available!' });
        setIsFreePlay(false);
        return;
      }
    } else {
      if (bet < MIN_BET) {
        setResult({ error: true, message: `Minimum bet is ${fmt(MIN_BET)} MLEO!` });
        return;
      }
      
      const currentVault = getVault();
      if (currentVault < bet) {
        setResult({ error: true, message: `Need ${fmt(bet)} MLEO!` });
        return;
      }
      // Deduct cost
      setVault(currentVault - bet);
      setVaultState(currentVault - bet);
    }

    const board = boardRef.current;
    if (!board) return;

    const x0 = board.centerX + (rand01() * 2 - 1) * PHYS.spawnJitterX;
    const y0 = board.top - 20; // Start above the pyramid top
    const ball = {
      x: x0,
      y: y0,
      vx: (rand01() * 2 - 1) * 40,
      vy: PHYS.spawnVy + rand01() * 40,
      _landed: false,
      betAmount: bet, // Store bet amount with ball
    };
    ballsRef.current.push(ball);

    if (dropSound.current) {
      try {
        dropSound.current.volume = 0.25;
        dropSound.current.currentTime = 0;
        dropSound.current.play().catch(() => {});
      } catch {}
    }
  }

  const refreshVault = () => setVaultState(getVault());

  // Active balls count (render-only)
  const activeCount = useMemo(() => ballsRef.current.length, [ballsRef.current.length, result]);
  // For bucket display highlighting balls “currently landing” — we approximate
  const landingNow = useMemo(() => {
    const board = boardRef.current;
    if (!board) return [];
    const floorY = board.bottom - PHYS.ballRadius;
    const arr = [];
    for (let b of ballsRef.current) {
      if (b.y >= floorY - 6 && Math.abs(b.vy) < PHYS.bucketCaptureVy * 1.2) {
        const idx = Math.max(0, Math.min(COLS - 1, Math.floor((b.x - board.left) / board.bucketWidth)));
        arr.push(idx);
      }
    }
    return arr;
  }, [result, ballsRef.current.length]);

  if (!mounted) {
    return (
      <Layout>
        <main className="min-h-[100svh] bg-gradient-to-b from-zinc-950 to-black text-zinc-100">
          <div className="max-w-4xl mx-auto p-4">
            <h1 className="text-2xl font-bold">MLEO Plinko</h1>
            <div className="opacity-60 text-sm">Loading…</div>
          </div>
        </main>
      </Layout>
    );
  }



  return (
    <Layout vault={vault} refreshVault={refreshVault}>
      <main className="min-h-[100svh] bg-gradient-to-b from-blue-950 via-indigo-950 to-black text-zinc-100">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            {gameActive || result ? (
              <button 
                onClick={resetToSetup}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
              >
                BACK
              </button>
            ) : (
              <Link href="/arcade">
                <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                  BACK
                </button>
              </Link>
            )}
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🎯</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  {isFreePlay && <span className="text-amber-400">🎁 </span>}
                  MLEO Plinko
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">
                {isFreePlay ? "Playing with a free token - good luck!" : "Real physics • Watch the ball dance on pegs"}
                <span className={`ml-2 px-2 py-1 rounded text-xs ${isWideScreen ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                  {isWideScreen ? '🖥️ Wide' : '📱 Narrow'}
                </span>
              </div>
            </div>
            
            <div className="w-[88px]"></div>
          </header>

          {/* PLINKO BOARD (CANVAS) - Main Window */}
          <div className="rounded-3xl p-3 sm:p-6 bg-gradient-to-br from-blue-900/30 via-indigo-900/20 to-cyan-900/30 border-2 sm:border-4 border-blue-600/50 shadow-2xl mb-6">
            <div className="relative bg-gradient-to-b from-indigo-900/50 to-blue-950/80 rounded-2xl p-2 sm:p-4 mb-6 overflow-hidden" style={{ minHeight: 420 }}>
              <div className="relative mx-auto max-w-2xl">
                <canvas ref={canvasRef} className="w-full h-[420px] rounded-xl outline-none select-none" />
              </div>
            </div>

            {/* Buckets display */}
            <div className="relative -mt-2 sm:-mt-3">
              <div className="flex gap-0 sm:gap-0.5 mb-4 sm:mb-6 max-w-2xl mx-auto">
                {MULTIPLIERS.map((mult, idx) => {
                  const landed = finalBuckets.filter(i => i === idx).length;
                  const isHighlighted = landed > 0 || landingNow.includes(idx);
                  // Make ×10 buckets (index 1 and 13) half size, ×0 edge buckets (index 0 and 14) larger
                  // Make ×3 buckets (index 3 and 11) half size, ×0 center bucket (index 7) larger
                  let widthClass;
                  if (idx === 1 || idx === 13 || idx === 3 || idx === 11) {
                    widthClass = "flex-[0.5]"; // ×10 and ×3 buckets half size
                  } else if (idx === 0 || idx === 14) {
                    widthClass = "flex-[1.5]"; // ×0 edge buckets larger
                  } else if (idx === 7) {
                    widthClass = "flex-[2]"; // ×0 center bucket larger
                  } else {
                    widthClass = "flex-1"; // Normal buckets
                  }
                  return (
                    <div
                      key={idx}
                      className={`relative p-1 sm:p-2 rounded text-center font-bold text-[8px] sm:text-[10px] transition-all ${widthClass} ${
                        isHighlighted ? "scale-105 shadow-lg ring-1 sm:ring-2 ring-white/30" : ""
                      }`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-b ${BUCKET_COLORS[idx]} rounded`}></div>
                      <div className="relative text-white whitespace-nowrap">×{mult}</div>
                      {isHighlighted && (
                        <div className="absolute -top-8 sm:-top-12 left-1/2 transform -translate-x-1/2 animate-bounce">
                          <div className="text-2xl sm:text-4xl">⬇️</div>
                        </div>
                      )}
                      {landed > 1 && (
                        <div className="absolute -top-3 right-0 bg-green-500 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-xs font-bold">
                          {landed}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drop Button & Bet Amount */}
            <div className="text-center mb-6">
              {freePlayTokens > 0 && (
                <button
                  onClick={startFreePlay}
                  className="px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:via-orange-400 hover:to-yellow-400 hover:scale-105"
                >
                  🎁 FREE PLAY ({freePlayTokens}/5)
                </button>
              )}
              
              <button
                onClick={() => dropBall(false)}
                disabled={vault < (Number(betAmount) || MIN_BET)}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl mb-6 ${
                  vault < (Number(betAmount) || MIN_BET)
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-600 hover:from-blue-500 hover:via-cyan-400 hover:to-teal-500 hover:scale-105 active:scale-95"
                }`}
              >
                🎯 DROP BALL ({fmt(Number(betAmount) || MIN_BET)})
              </button>
              <div className="text-sm opacity-70 mb-4">
                Real physics • Multiple balls supported • Max win: {fmt((Number(betAmount) || MIN_BET) * 10)}
              </div>
              
              <div className="max-w-sm mx-auto">
                <label className="block text-sm text-zinc-400 mb-2">Bet Amount (MLEO)</label>
                <input 
                  type="number" 
                  min={MIN_BET} 
                  step="100" 
                  value={betAmount} 
                  onChange={(e) => setBetAmount(e.target.value)} 
                  className="rounded-lg bg-zinc-950/70 border border-zinc-800 px-4 py-2 text-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  placeholder="1000" 
                />
                <div className="flex gap-2 mt-2 justify-center flex-wrap">
                  {[1000, 2500, 5000, 10000].map((v) => (
                    <button 
                      key={v} 
                      onClick={() => setBetAmount(String(v))} 
                      className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-700"
                    >
                      {fmt(v)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active & Result */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-3xl mx-auto">
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                <div className="text-sm opacity-70 mb-1">Active Balls</div>
                <div className="text-3xl font-bold text-cyan-400">{activeCount}</div>
              </div>

            </div>
          </div>

          {/* STATS - 4 Windows below game */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-lg p-2 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-lg font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-lg p-2 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Drops</div>
              <div className="text-lg font-bold">{stats.totalDrops}</div>
            </div>

            <div className="rounded-lg p-2 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-lg p-2 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Biggest Win</div>
              <div className="text-lg font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
            </div>
          </div>

          {/* MULTIPLIER INFO */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">🎯 Multiplier Buckets</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: "×10", desc: "JACKPOT!", color: "yellow" },
                { label: "×5", desc: "Big Win", color: "orange" },
                { label: "×3", desc: "Great", color: "green" },
                { label: "×2", desc: "Good", color: "blue" },
                { label: "×0.5", desc: "Small Loss", color: "purple" },
                { label: "×0.2", desc: "Big Loss", color: "red" },
                { label: "×0", desc: "Total Loss", color: "gray" },
              ].map((item, idx) => (
                <div key={idx} className={`p-3 rounded-lg border-2 border-${item.color}-500 bg-${item.color}-500/20`}>
                  <div className={`font-bold text-lg text-${item.color}-400`}>{item.label}</div>
                  <div className="text-xs opacity-70 mt-1">{item.desc}</div>
                </div>
              ))}
            </div>
            <div className="text-xs opacity-60 text-center mt-4">
              💡 Edge buckets (×10) are rarest • Center has mix of wins and losses
            </div>
          </div>

          {/* RECENT HISTORY */}
          {stats.history.length > 0 && (
            <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
              <h3 className="text-lg font-bold mb-4">📊 Last 10 Drops</h3>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {stats.history.map((drop, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg text-center font-bold border-2 ${
                      drop.mult >= 5 ? "bg-yellow-500/20 border-yellow-500 text-yellow-400" :
                      drop.mult >= 2 ? "bg-green-500/20 border-green-500 text-green-400" :
                      drop.mult >= 1 ? "bg-blue-500/20 border-blue-500 text-blue-400" :
                      drop.mult >= 0.5 ? "bg-purple-500/20 border-purple-500 text-purple-400" :
                      "bg-red-500/20 border-red-500 text-red-400"
                    }`}
                  >
                    ×{drop.mult}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HOW TO PLAY */}
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 mb-6">
            <h3 className="text-lg font-bold mb-4">📖 How to Play</h3>
            <ul className="text-sm space-y-2 text-zinc-300">
              <li>• <strong>Click DROP BALL:</strong> Costs 1,000 MLEO per ball</li>
              <li>• <strong>Real physics:</strong> Gravity, elastic bounces, air drag & walls</li>
              <li>• <strong>Multiple balls:</strong> Drop as many as you want simultaneously</li>
              <li>• <strong>Instant payout:</strong> Prize is awarded upon bucket capture</li>
            </ul>
          </div>

          {/* STATS */}
          <div className="rounded-2xl p-6 bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/30">
            <h3 className="text-xl font-bold mb-4">📊 Your Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm opacity-70">Total Drops</div>
                <div className="text-2xl font-bold">{stats.totalDrops}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Total Won</div>
                <div className="text-2xl font-bold text-green-400">{fmt(stats.totalWon)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Biggest Win</div>
                <div className="text-2xl font-bold text-amber-400">{fmt(stats.biggestWin)}</div>
              </div>
              <div>
                <div className="text-sm opacity-70">Return Rate</div>
                <div className="text-2xl font-bold text-blue-400">
                  {stats.totalDrops > 0 ? `${((stats.totalWon / stats.totalBet) * 100).toFixed(1)}%` : "0%"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-sm opacity-70">Net Profit/Loss</div>
                <div className={`text-3xl font-bold ${
                  stats.totalWon >= stats.totalBet ? "text-green-400" : "text-red-400"
                }`}>
                  {stats.totalDrops > 0
                    ? `${stats.totalWon >= stats.totalBet ? "+" : ""}${fmt(stats.totalWon - stats.totalBet)}`
                    : "0"}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* FLOATING RESULT POPUP */}
        {result && showResultPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div 
              className={`text-center p-4 rounded-xl border-2 transition-all duration-500 transform pointer-events-auto max-w-sm mx-4 ${
                showResultPopup ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
              } ${
                result.error
                  ? "bg-gradient-to-br from-red-600 to-rose-700 border-red-300 shadow-2xl shadow-red-500/70"
                  : result.win && result.prize > 0
                  ? "bg-gradient-to-br from-green-600 to-emerald-700 border-green-300 shadow-2xl shadow-green-500/70"
                  : "bg-gradient-to-br from-zinc-600 to-zinc-700 border-zinc-300 shadow-2xl shadow-zinc-500/70"
              }`}
            >
              <div className="text-2xl font-black mb-2 animate-pulse text-white drop-shadow-lg">
                {result.error ? "⚠️ Error" : 
                 result.win && result.prize > 0 ? "🎯 Winner! 🎯" : 
                 "⚪ No Win"}
              </div>
              {result.multiplier !== undefined && (
                <div className="text-base mb-2 text-white/90 font-semibold">
                  Multiplier: ×{result.multiplier}
                </div>
              )}
              {result.prize && result.prize > 0 && (
                <div className="space-y-1">
                  <div className="text-3xl font-black text-white animate-bounce drop-shadow-2xl">
                    +{fmt(result.prize)} MLEO
                  </div>
                </div>
              )}
              {result.error && (
                <div className="text-base font-bold text-white">
                  {result.message}
                </div>
              )}
              {!result.error && !result.win && (
                <div className="text-lg font-bold text-white">
                  Better luck next time!
                </div>
              )}
              <div className="mt-2 text-xs text-white/70 animate-pulse">
                Auto-closing...
              </div>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}
