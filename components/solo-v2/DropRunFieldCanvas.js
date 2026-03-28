import { useCallback, useEffect, useRef, useState } from "react";
import {
  DROP_RUN_BAY_MULTIPLIERS,
  DROP_RUN_DRIFT_ROWS,
  DROP_RUN_GATES,
  DROP_RUN_PEG_ROWS,
} from "../../lib/solo-v2/dropRunConfig";

/**
 * Peg lattice from mleo-plinko-v2 (pegGapX, row+2 pegs). PEG_ROWS from config = DROP_RUN_PEG_ROWS (15).
 * Fall playback: requestAnimationFrame + continuous integration only (no step/lerp targets).
 * finalBay → targetBoxIndex = finalBay - 1; snap ball center to that bucket center; highlight matches payout.
 */

const PEG_ROWS = DROP_RUN_PEG_ROWS;
const REF_PAD_LR = 20;
const REF_H_INSET = 40;

const GRAVITY = 800;
const DRAG = 0.995;
const MAX_SPEED = 1500;
const PEG_RESTITUTION = 0.6;
const CENTER_BIAS = 0.05;
/** Target steering: shallower above 55% board height, stronger at/after 55%. */
const STEER_SHALLOW = 0.03;
const STEER_DEEP = 0.14;
const STEER_SPLIT_Y_FRAC = 0.55;

const LAND_HOLD_MS = 480;
const MAX_FALL_MS = 9000;

function formatMult(m) {
  const x = Number(m);
  if (!Number.isFinite(x)) return "0";
  if (x < 1 && x > 0) return String(Math.round(x * 100) / 100).replace(/\.?0+$/, "");
  return String(x);
}

/** Same peg lattice as mleo-plinko-v2: pegCount = row + 2, pegGapX = (w-40)/(PEG_ROWS+2), centered rows. */
function buildReferencePegLayout(w, h, bucketY) {
  const pegGapX = (w - REF_H_INSET) / (PEG_ROWS + 2);
  const topY = Math.max(6, Math.min(36, Math.round(h * 0.062)));
  /** End peg field well above payout row so the bottom peg row is not crowded against the boxes. */
  const gapAboveBuckets = Math.max(18, Math.min(44, Math.round(h * 0.052)));
  const pegFieldBottom = bucketY - gapAboveBuckets;
  const pegGapY = (pegFieldBottom - topY) / Math.max(1, PEG_ROWS - 1);
  const pr = Math.max(2.2, Math.min(3.6, pegGapX * 0.052));

  const pegs = [];
  for (let row = 0; row < PEG_ROWS; row++) {
    const pegCount = row + 2;
    const rowY = topY + row * pegGapY;
    const rowWidth = pegCount * pegGapX;
    const startX = (w - rowWidth) / 2 + pegGapX / 2;
    for (let col = 0; col < pegCount; col++) {
      pegs.push({ x: startX + col * pegGapX, y: rowY, r: pr });
    }
  }
  return { pegs, pegGapX, topY, pegGapY, pegFieldBottom };
}

/**
 * Payout strip — reserve space from canvas bottom so the full row stays visible (desktop + mobile).
 * bucketY + bucketH + bottomPad <= h always.
 */
function buildReferenceBuckets(w, h, bucketCount) {
  const bottomPad = Math.max(6, Math.min(12, Math.round(h * 0.022)));
  const bucketH = Math.max(20, Math.min(28, Math.round(h * 0.056)));
  const bucketY = h - bottomPad - bucketH;
  const bucketWidth = (w - REF_H_INSET) / bucketCount;
  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      x: REF_PAD_LR + i * bucketWidth,
      y: bucketY,
      w: bucketWidth,
      h: bucketH,
      index: i,
    });
  }
  return { buckets, bucketY, bucketH, bucketWidth, bottomPad };
}

/** Symmetric strip — center emphasis like reference multi-color buckets. */
function bucketGradStops(i, count) {
  const mid = (count - 1) / 2;
  const d = Math.abs(i - mid);
  if (d > mid - 0.1) return ["#6b7280", "#374151"];
  if (d > mid - 1.1) return ["#facc15", "#f59e0b"];
  if (d > mid - 2.1) return ["#f97316", "#ea580c"];
  if (d > 0.4) return ["#3b82f6", "#06b6d4"];
  return ["#10b981", "#059669"];
}

function hashRunKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * One physics step — continuous RAF playback (gravity, drag, center bias, target steering, peg bounce).
 * No discrete step/lerp between path waypoints; landing snaps to authoritative targetBoxIndex only.
 */
function stepPlaybackBall(ball, pegs, buckets, w, h, dt, targetBoxIndex) {
  ball.vy += GRAVITY * dt;
  ball.vx *= DRAG;
  ball.vy *= DRAG;

  let speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_SPEED) {
    ball.vx *= MAX_SPEED / speed;
    ball.vy *= MAX_SPEED / speed;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  const centerX = w / 2;
  ball.vx += (centerX - ball.x) * CENTER_BIAS * dt * 60;

  const targetBucket = buckets[targetBoxIndex];
  if (targetBucket) {
    const tcx = targetBucket.x + targetBucket.w / 2;
    const steer = ball.y < h * STEER_SPLIT_Y_FRAC ? STEER_SHALLOW : STEER_DEEP;
    ball.vx += (tcx - ball.x) * steer * dt * 60;
  }

  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx) * 0.45;
  } else if (ball.x + ball.r > w) {
    ball.x = w - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.45;
  }

  for (let p = 0; p < pegs.length; p++) {
    const peg = pegs[p];
    const dx = ball.x - peg.x;
    const dy = ball.y - peg.y;
    const dist = Math.hypot(dx, dy);
    if (dist < ball.r + peg.r && dist > 1e-6) {
      const angle = Math.atan2(dy, dx);
      const overlap = ball.r + peg.r - dist;
      ball.x += Math.cos(angle) * overlap;
      ball.y += Math.sin(angle) * overlap;
      const dvx = ball.vx;
      const dvy = ball.vy;
      const dot = dvx * Math.cos(angle) + dvy * Math.sin(angle);
      ball.vx = (dvx - 2 * dot * Math.cos(angle)) * PEG_RESTITUTION;
      ball.vy = (dvy - 2 * dot * Math.sin(angle)) * PEG_RESTITUTION;
    }
  }

  /** Authoritative landing only: when the ball reaches the payout band, snap to server bucket center (no horizontal hit-test). */
  if (targetBucket && ball.y + ball.r >= targetBucket.y) {
    ball.x = targetBucket.x + targetBucket.w / 2;
    ball.y = targetBucket.y + targetBucket.h / 2;
    ball.vx = 0;
    ball.vy = 0;
    return true;
  }

  return false;
}

export default function DropRunFieldCanvas({
  pathPositions = [],
  finalBay = null,
  boardActive = false,
  runKey = "",
  onAnimationComplete,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const pegsRef = useRef([]);
  const bucketsRef = useRef([]);
  const layoutRef = useRef({
    w: 0,
    h: 0,
    topY: 0,
    pegFieldBottom: 0,
    bucketY: 0,
    bucketH: 0,
  });
  const ballRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, r: 3 });
  const landRef = useRef(false);
  const completeRef = useRef(onAnimationComplete);
  completeRef.current = onAnimationComplete;
  const pathRef = useRef(pathPositions);
  pathRef.current = pathPositions;
  const rafRef = useRef(0);
  const animRunRef = useRef(0);
  const [layoutGen, setLayoutGen] = useState(0);

  const expectedPathLen = DROP_RUN_DRIFT_ROWS + 1;

  const buildBoard = useCallback((w, h) => {
    const { buckets, bucketY, bucketH: bh, bottomPad } = buildReferenceBuckets(w, h, DROP_RUN_GATES);
    const { pegs, topY, pegFieldBottom } = buildReferencePegLayout(w, h, bucketY);

    pegsRef.current = pegs;
    bucketsRef.current = buckets;
    layoutRef.current = {
      w,
      h,
      topY,
      pegFieldBottom,
      bucketY,
      bucketH: bh,
      bottomPad,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = layoutRef.current;
    if (!w || !h) return;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    const pegs = pegsRef.current;
    const buckets = bucketsRef.current;
    const mults = DROP_RUN_BAY_MULTIPLIERS;

    pegs.forEach(peg => {
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      ctx.fill();
    });

    const showLand = landRef.current;
    const fb = finalBay != null ? Math.floor(Number(finalBay)) : null;

    buckets.forEach((bucket, i) => {
      const cellIndex = i + 1;
      const land = showLand && fb === cellIndex;
      const [c0, c1] = bucketGradStops(i, DROP_RUN_GATES);
      const grad = ctx.createLinearGradient(bucket.x, bucket.y, bucket.x, bucket.y + bucket.h);
      if (land) {
        grad.addColorStop(0, "#fde68a");
        grad.addColorStop(1, "#d97706");
      } else {
        grad.addColorStop(0, c0);
        grad.addColorStop(1, c1);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(bucket.x + 0.5, bucket.y, Math.max(1, bucket.w - 1), bucket.h);
      if (land) {
        ctx.strokeStyle = "rgba(254, 240, 138, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bucket.x + 0.5, bucket.y, bucket.w - 1, bucket.h);
      }

      const fs = Math.max(6, Math.min(10, bucket.w * 0.2));
      ctx.fillStyle = land ? "#1c1917" : "#fafafa";
      ctx.font = `bold ${fs}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const m = mults[i] ?? 0;
      ctx.fillText(`${formatMult(m)}×`, bucket.x + bucket.w / 2, bucket.y + bucket.h * 0.42);
      ctx.font = `${Math.max(5, fs * 0.55)}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = land ? "rgba(28,25,23,0.65)" : "rgba(250,250,250,0.45)";
      ctx.fillText(String(cellIndex), bucket.x + bucket.w / 2, bucket.y + bucket.h * 0.72);
    });

    const pathOk = pathRef.current.length === expectedPathLen;
    const showBall = boardActive && pathOk;
    if (showBall) {
      const b = ballRef.current;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  }, [boardActive, expectedPathLen, finalBay]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(120, Math.floor(rect.width));
      const minH = rect.width >= 640 ? 228 : 168;
      const h = Math.max(minH, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildBoard(w, h);
      draw();
      setLayoutGen(g => g + 1);
    });

    ro.observe(wrap);
    return () => ro.disconnect();
  }, [buildBoard, draw]);

  useEffect(() => {
    landRef.current = false;
    if (!boardActive || pathRef.current.length !== expectedPathLen || !runKey) {
      draw();
      return;
    }

    const { w, h, topY } = layoutRef.current;
    if (!w || !h) return;

    const pegs = pegsRef.current;
    const buckets = bucketsRef.current;
    const targetBoxIndex = Math.max(0, Math.min(DROP_RUN_GATES - 1, Math.floor(Number(finalBay)) - 1));
    const seed = hashRunKey(runKey);
    const jx = ((seed % 41) / 41 - 0.5) * 18;
    const jvx = ((seed >>> 8) % 41) / 41 - 0.5;
    const pegGapX = (w - REF_H_INSET) / (PEG_ROWS + 2);
    const br = Math.max(2.4, Math.min(4, pegGapX * 0.065));

    ballRef.current = {
      x: w / 2 + jx,
      y: Math.max(10, topY - 12),
      vx: jvx * 55,
      vy: 50,
      r: br,
    };

    const runId = (animRunRef.current += 1);
    let cancelled = false;
    let completed = false;
    let landTime = 0;
    let last = performance.now();
    const startTime = last;
    function snapBallToTargetBucket(timeNow) {
      landRef.current = true;
      landTime = timeNow;
      const bucket = buckets[targetBoxIndex];
      if (bucket) {
        ballRef.current.x = bucket.x + bucket.w / 2;
        ballRef.current.y = bucket.y + bucket.h / 2;
        ballRef.current.vx = 0;
        ballRef.current.vy = 0;
      }
    }

    const tick = now => {
      if (cancelled || animRunRef.current !== runId) return;

      if (completed) return;

      if (!landRef.current) {
        if (now - startTime > MAX_FALL_MS || ballRef.current.y > h + 40) {
          snapBallToTargetBucket(now);
          draw();
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        let dt = (now - last) / 1000;
        last = now;
        if (dt > 0.034) dt = 0.034;
        if (dt <= 0) dt = 0.016;

        const landed = stepPlaybackBall(ballRef.current, pegs, buckets, w, h, dt, targetBoxIndex);
        draw();
        if (landed) {
          landRef.current = true;
          landTime = now;
        }
      } else {
        draw();
        if (now - landTime >= LAND_HOLD_MS) {
          completed = true;
          completeRef.current?.();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    draw();
    last = performance.now();
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [boardActive, runKey, layoutGen, draw, expectedPathLen, finalBay]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full min-h-0 w-full min-w-0 flex-1 [min-height:clamp(14rem,46vmin,20rem)] sm:[min-height:clamp(17rem,42vmin,26rem)]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none" aria-hidden />
    </div>
  );
}
