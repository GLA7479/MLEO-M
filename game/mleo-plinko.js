// ============================================================================
// MLEO Plinko — Continuous Physics (Canvas Edition)
// Cost: 1000 MLEO per drop
// Requirements: Tailwind present, /sounds optional
// ============================================================================

import { useEffect, useRef, useState, useMemo } from "react";
import Layout from "../components/Layout";
import Link from "next/link";

// ============================================================================
// CONFIG
// ============================================================================
const LS_KEY = "mleo_plinko_v2_physics";
const DROP_COST = 1000;

// 13 buckets (aligned with 13 columns)
const MULTIPLIERS = [10, 5, 3, 2, 0.5, 0.2, 0, 0.2, 0.5, 2, 3, 5, 10];
const BUCKET_COLORS = [
  "from-yellow-400 to-amber-500",    // 10x
  "from-orange-500 to-orange-600",   // 5x
  "from-green-500 to-emerald-500",   // 3x
  "from-blue-500 to-cyan-500",       // 2x
  "from-purple-500 to-purple-600",   // 0.5x
  "from-red-500 to-red-600",         // 0.2x
  "from-gray-700 to-gray-800",       // 0x
  "from-red-500 to-red-600",         // 0.2x
  "from-purple-500 to-purple-600",   // 0.5x
  "from-blue-500 to-cyan-500",       // 2x
  "from-green-500 to-emerald-500",   // 3x
  "from-orange-500 to-orange-600",   // 5x
  "from-yellow-400 to-amber-500",    // 10x
];

// Peg grid
const ROWS = 12;     // peg rows
const COLS = 13;     // peg columns (also number of buckets)
const OFFSET_ROWS = true; // stagger every other row

// Physics tunables
const PHYS = {
  gravity: 1800,          // px/s^2 downward
  airDrag: 0.010,         // linear damping per step (0..~0.02)
  restitution: 0.45,      // bounciness on pegs
  wallRestitution: 0.35,  // side walls bounciness
  pegRadius: 7,           // visual peg radius (collision uses this)
  ballRadius: 7.5,        // ball radius
  maxVel: 2600,           // clamp extreme velocities
  spawnJitterX: 14,       // horizontal random spawn jitter (px)
  spawnVy: 40,            // initial downward velocity
  centerBias: 0.0008,     // tiny horizontal drift towards board center (feel)
  bucketCaptureVy: 180,   // below this vertical speed near floor → snap/capture
};

// Board layout
const BOARD = {
  marginX: 36,        // left/right inner margin inside canvas
  marginTop: 36,      // top margin
  marginBottom: 140,  // bottom space for buckets
  pegGapX: 44,        // horizontal distance between peg columns
  pegGapY: 46,        // vertical distance between peg rows
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
  const [mounted, setMounted] = useState(false);
  const [vault, setVaultState] = useState(0);

  const [result, setResult] = useState(null);
  const [finalBuckets, setFinalBuckets] = useState([]); // recent landings visual
  const [stats, setStats] = useState(() =>
    safeRead(LS_KEY, { totalDrops: 0, totalWon: 0, biggestWin: 0, history: [] })
  );

  // Sounds
  const dropSound = useRef(null);
  const winSound = useRef(null);
  const bounceSound = useRef(null);

  // Canvas & Physics state
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);
  const pegsRef = useRef([]);
  const ballsRef = useRef([]);
  const bucketsRef = useRef([]); // {x, width, index}
  const boardRef = useRef(null); // dimensions & helpers

  // Timing
  const lastTsRef = useRef(0);
  const accumulatorRef = useRef(0);
  const FIXED_DT = 1 / 120; // 120 Hz physics

  // Init
  useEffect(() => {
    setMounted(true);
    setVaultState(getVault());

    if (typeof Audio !== "undefined") {
      try {
        dropSound.current = new Audio(SOUND.drop);
        winSound.current = new Audio(SOUND.win);
        bounceSound.current = new Audio(SOUND.bounce);
      } catch {}
    }
  }, []);

  // Persist stats
  useEffect(() => {
    safeWrite(LS_KEY, stats);
  }, [stats]);

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
  const gapY = BOARD.pegGapY * Math.max(0.9, Math.min(1.2, scaleX)); 

  const centerX = left + innerWidth * 0.5;

  // נחשב איפה נמצאת שורת היתדות האחרונה
  const lastPegY = top + (ROWS - 1) * gapY + 24; // כמו בציור היתדות
  const baseBottom = h - BOARD.marginBottom;     // הרצפה הקבועה המקורית
  const desiredBottom =
    lastPegY + PHYS.pegRadius + Math.max(48, gapY * 0.9); // עוד מרווח לבאקטים

  // הרצפה צריכה להיות מתחת לשורה האחרונה, אבל לא לצאת מהקנבס
  const bottom = Math.min(h - 20, Math.max(baseBottom, desiredBottom));


    // Pegs
    const pegs = [];
    for (let r = 0; r < ROWS; r++) {
      const offset = OFFSET_ROWS && (r % 2 === 1) ? 0.5 : 0;
      for (let c = 0; c < COLS - (OFFSET_ROWS && (r % 2 === 1) ? 1 : 0); c++) {
        const x = left + (c + offset) * gapX;
        const y = top + r * gapY + 24; // small extra spacing
        pegs.push({ x, y, r: PHYS.pegRadius });
      }
    }

    // Buckets: 13 equal spans along width
    const bucketWidth = innerWidth / COLS;
    const buckets = [];
    for (let i = 0; i < COLS; i++) {
      const bx = left + i * bucketWidth;
      buckets.push({ x: bx, width: bucketWidth, index: i });
    }

    boardRef.current = {
      w, h, left, right, top, bottom, centerX,
      gapX, gapY, innerWidth, bucketWidth,
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

      // Collide walls
      const R = PHYS.ballRadius;
      if (b.x < board.left + R) {
        b.x = board.left + R;
        b.vx = -b.vx * PHYS.wallRestitution;
      } else if (b.x > board.right - R) {
        b.x = board.right - R;
        b.vx = -b.vx * PHYS.wallRestitution;
      }

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
    const prize = Math.floor(DROP_COST * mult);
    if (prize > 0) {
      const newVault = getVault() + prize;
      setVault(newVault);
      setVaultState(newVault);
    }

    setStats(s => ({
      totalDrops: s.totalDrops + 1,
      totalWon: s.totalWon + prize,
      biggestWin: Math.max(s.biggestWin, prize),
      history: [
        { mult, prize, bucket: idx, timestamp: Date.now() },
        ...s.history.slice(0, 9)
      ]
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
    ctx.strokeStyle = "rgba(59,130,246,0.35)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(56,189,248,0.35)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.moveTo(right, top);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.restore();

    // Buckets background
    for (let i = 0; i < COLS; i++) {
      const x = left + i * bucketWidth;
      ctx.fillStyle = i % 2 === 0 ? "rgba(30,58,138,0.24)" : "rgba(6,78,59,0.22)";
      ctx.fillRect(x + 1, bottom, bucketWidth - 2, 18);
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

  // Drop ball
  function dropBall() {
    const currentVault = getVault();
    if (currentVault < DROP_COST) {
      setResult({ error: true, message: `Need ${fmt(DROP_COST)} MLEO!` });
      return;
    }
    // Deduct cost
    setVault(currentVault - DROP_COST);
    setVaultState(currentVault - DROP_COST);

    const board = boardRef.current;
    if (!board) return;

    const x0 = board.centerX + (rand01() * 2 - 1) * PHYS.spawnJitterX;
    const y0 = board.top + 2; // just below top
    const ball = {
      x: x0,
      y: y0,
      vx: (rand01() * 2 - 1) * 40,
      vy: PHYS.spawnVy + rand01() * 40,
      _landed: false,
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
    <Layout isGame={true} title="MLEO Plinko 🎯">
      <main className="min-h-[100svh] bg-gradient-to-b from-blue-950 via-indigo-950 to-black text-zinc-100">
        <div className="max-w-6xl mx-auto p-4 pb-20">
          {/* HEADER - Centered */}
          <header className="flex items-center justify-between mb-6">
            <Link href="/arcade">
              <button className="px-4 py-2 rounded-xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10">
                BACK
              </button>
            </Link>
            
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="text-5xl">🎯</span>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  MLEO Plinko
                </h1>
              </div>
              <div className="text-sm opacity-70 mt-1">Real physics • Watch the ball dance on pegs</div>
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
            <div className="relative">
              <div className="grid gap-0.5 sm:gap-1 mb-4 sm:mb-6 max-w-2xl mx-auto" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                {MULTIPLIERS.map((mult, idx) => {
                  const landed = finalBuckets.filter(i => i === idx).length;
                  const isHighlighted = landed > 0 || landingNow.includes(idx);
                  return (
                    <div
                      key={idx}
                      className={`relative p-1 sm:p-2 rounded text-center font-bold text-[9px] sm:text-xs transition-all ${
                        isHighlighted ? "scale-110 shadow-2xl ring-2 sm:ring-4 ring-white/50" : ""
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

            {/* Drop Button */}
            <div className="text-center mb-6">
              <button
                onClick={dropBall}
                disabled={vault < DROP_COST}
                className={`px-12 py-4 rounded-2xl font-bold text-2xl text-white transition-all shadow-2xl ${
                  vault < DROP_COST
                    ? "bg-zinc-700 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-600 hover:from-blue-500 hover:via-cyan-400 hover:to-teal-500 hover:scale-105 active:scale-95"
                }`}
              >
                🎯 DROP BALL ({fmt(DROP_COST)})
              </button>
              <div className="text-sm opacity-70 mt-3">
                Real physics • Multiple balls supported
              </div>
            </div>

            {/* Active & Result */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-3xl mx-auto">
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                <div className="text-sm opacity-70 mb-1">Active Balls</div>
                <div className="text-3xl font-bold text-cyan-400">{activeCount}</div>
              </div>

              {result && !result.error && (
                <div className={`p-4 rounded-xl border-2 ${
                  result.win ? "bg-green-900/30 border-green-500" : "bg-red-900/30 border-red-500"
                }`}>
                  <div className="text-sm font-bold mb-1">{result.message}</div>
                  <div className={`text-2xl font-bold ${result.win && result.prize > 0 ? "text-green-400" : "text-red-400"}`}>
                    {result.prize > 0 ? `+${fmt(result.prize)}` : "No Win"}
                  </div>
                </div>
              )}

              {result && result.error && (
                <div className="p-4 rounded-xl border-2 bg-red-900/30 border-red-500">
                  <div className="text-sm font-bold text-red-400">{result.message}</div>
                </div>
              )}
            </div>
          </div>

          {/* STATS - 4 Windows below game */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-600/20 to-green-600/20 border border-emerald-500/30">
              <div className="text-xs opacity-70 mb-1">Your Vault</div>
              <div className="text-xl font-bold text-emerald-400">{fmt(vault)}</div>
              <button onClick={refreshVault} className="text-xs opacity-60 hover:opacity-100 mt-1">↻ Refresh</button>
            </div>
            
            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Drops</div>
              <div className="text-lg font-bold">{stats.totalDrops}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
              <div className="text-xs opacity-70 mb-1">Total Won</div>
              <div className="text-lg font-bold text-green-400">{fmt(stats.totalWon)}</div>
            </div>

            <div className="rounded-xl p-3 bg-white/5 border border-white/10">
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
                  {stats.totalDrops > 0 ? `${((stats.totalWon / (stats.totalDrops * DROP_COST)) * 100).toFixed(1)}%` : "0%"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-sm opacity-70">Net Profit/Loss</div>
                <div className={`text-3xl font-bold ${
                  stats.totalWon >= stats.totalDrops * DROP_COST ? "text-green-400" : "text-red-400"
                }`}>
                  {stats.totalDrops > 0
                    ? `${stats.totalWon >= stats.totalDrops * DROP_COST ? "+" : ""}${fmt(stats.totalWon - (stats.totalDrops * DROP_COST))}`
                    : "0"}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
}
