import { useCallback, useEffect, useRef, useState } from "react";
import {
  DROP_RUN_BAY_MULTIPLIERS,
  DROP_RUN_DRIFT_ROWS,
  DROP_RUN_GATES,
  DROP_RUN_PEG_ROWS,
} from "../../lib/solo-v2/dropRunConfig";

/**
 * 9 gates, 15 peg rows — same board geometry as before.
 * Playback: server path → waypoints → small quadratic Bézier arcs → dense polyline → arc-length motion.
 * Ease only time (easeOutQuad); last polyline point = target bucket center — no end snap.
 */

const PEG_ROWS = DROP_RUN_PEG_ROWS;
const REF_PAD_LR = 20;
const REF_H_INSET = 40;

const LAND_HOLD_MS = 480;
const DROP_FALL_DURATION_MS = 2800;
const MAX_FALL_MS = 8500;

function formatMult(m) {
  const x = Number(m);
  if (!Number.isFinite(x)) return "0";
  if (x < 1 && x > 0) return String(Math.round(x * 100) / 100).replace(/\.?0+$/, "");
  return String(x);
}

function xForAuthColumn(col, w, gates) {
  const c = Math.max(1, Math.min(gates, Math.floor(Number(col)) || 1));
  const inner = w - REF_H_INSET;
  return REF_PAD_LR + (c - 0.5) * (inner / gates);
}

/**
 * Peg lattice like mleo-plinko-v2: pegCount = row + 2, pegGapX = (w-40)/(PEG_ROWS+2),
 * pegGapY = (pegFieldBottom - topY) / (PEG_ROWS + 2) — tighter silhouette than (PEG_ROWS-1).
 */
function buildReferencePegLayout(w, h, bucketY) {
  const pegGapX = (w - REF_H_INSET) / (PEG_ROWS + 2);
  const topY = Math.max(10, Math.min(40, Math.round(h * 0.07)));
  const gapAboveBuckets = Math.max(16, Math.min(40, Math.round(h * 0.048)));
  const pegFieldBottom = bucketY - gapAboveBuckets;
  const pegSpan = Math.max(1, pegFieldBottom - topY);
  const pegGapY = pegSpan / (PEG_ROWS + 2);
  const pr = Math.max(2.4, Math.min(3, Math.min(pegGapX * 0.055, 3)));

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
  return { pegs, pegGapX, pegGapY, topY, pegFieldBottom };
}

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

function bucketGradStops(i, count) {
  const mid = (count - 1) / 2;
  const d = Math.abs(i - mid);
  if (d > mid - 0.1) return ["#6b7280", "#374151"];
  if (d > mid - 1.1) return ["#facc15", "#f59e0b"];
  if (d > mid - 2.1) return ["#f97316", "#ea580c"];
  if (d > 0.4) return ["#3b82f6", "#06b6d4"];
  return ["#10b981", "#059669"];
}

function easeOutQuad(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - (1 - t) * (1 - t);
}

function quadBezierPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

const SAMPLES_PER_BEZIER_SEGMENT = 8;

/**
 * Waypoints: one per server path index; last = exact authoritative bucket center.
 */
function buildPathWaypoints(pathPositions, w, gates, topY, pegFieldBottom, targetBucket) {
  const n = pathPositions.length;
  const yTop = topY - 12;
  const cx = targetBucket.x + targetBucket.w / 2;
  const cy = targetBucket.y + targetBucket.h / 2;
  const waypoints = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      waypoints.push({ x: cx, y: cy });
      continue;
    }
    const x = xForAuthColumn(pathPositions[i], w, gates);
    const y =
      n <= 2 ? (i === 0 ? yTop : cy) : yTop + ((pegFieldBottom - yTop) * i) / (n - 2);
    waypoints.push({ x, y });
  }
  return waypoints;
}

/**
 * Quadratic arcs between adjacent waypoints; control.x = midpoint of segment (x stays in-column between endpoints).
 * 8 samples per segment (t = 0, 1/7, …, 1); skip duplicate joint points.
 */
function buildArcLengthPolyline(waypoints) {
  const n = waypoints.length;
  const pts = [];
  if (n === 0) return { points: [], cum: [], totalLength: 0 };
  if (n === 1) {
    pts.push({ x: waypoints[0].x, y: waypoints[0].y });
  } else {
    for (let i = 0; i < n - 1; i++) {
      const start = waypoints[i];
      const end = waypoints[i + 1];
      const control = {
        x: (start.x + end.x) / 2,
        y: start.y + (end.y - start.y) * 0.35,
      };
      const jStart = i === 0 ? 0 : 1;
      for (let j = jStart; j < SAMPLES_PER_BEZIER_SEGMENT; j++) {
        const t = j / (SAMPLES_PER_BEZIER_SEGMENT - 1);
        pts.push(quadBezierPoint(start, control, end, t));
      }
    }
  }

  const m = pts.length;
  const cum = new Array(m);
  cum[0] = 0;
  let totalLength = 0;
  for (let k = 1; k < m; k++) {
    const dx = pts[k].x - pts[k - 1].x;
    const dy = pts[k].y - pts[k - 1].y;
    totalLength += Math.hypot(dx, dy);
    cum[k] = totalLength;
  }
  return { points: pts, cum, totalLength };
}

function positionAtArcLength(points, cum, totalLength, d) {
  const m = points.length;
  if (m === 0) return { x: 0, y: 0 };
  if (m === 1 || totalLength <= 0) return { x: points[0].x, y: points[0].y };
  if (d <= 0) return { x: points[0].x, y: points[0].y };
  if (d >= totalLength) return { x: points[m - 1].x, y: points[m - 1].y };

  let lo = 0;
  let hi = m - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const segLen = cum[lo + 1] - cum[lo];
  if (segLen <= 1e-9) return { x: points[lo + 1].x, y: points[lo + 1].y };
  const f = (d - cum[lo]) / segLen;
  const a = points[lo];
  const b = points[lo + 1];
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
  };
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
  const ballRef = useRef({ x: 0, y: 0, r: 3 });
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

    const { w, h, topY, pegFieldBottom } = layoutRef.current;
    if (!w || !h) return;

    const buckets = bucketsRef.current;
    const targetBoxIndex = Math.max(0, Math.min(DROP_RUN_GATES - 1, Math.floor(Number(finalBay)) - 1));
    const targetBucket = buckets[targetBoxIndex];
    if (!targetBucket) {
      draw();
      return;
    }

    const path = pathRef.current.map(p => Math.floor(Number(p)) || 1);
    const waypoints = buildPathWaypoints(path, w, DROP_RUN_GATES, topY, pegFieldBottom, targetBucket);
    const { points: polyPoints, cum, totalLength } = buildArcLengthPolyline(waypoints);

    const pegGapX = (w - REF_H_INSET) / (PEG_ROWS + 2);
    const br = Math.max(2.4, Math.min(4, pegGapX * 0.065));
    const startPos = positionAtArcLength(polyPoints, cum, totalLength, 0);
    ballRef.current = { x: startPos.x, y: startPos.y, r: br };

    const runId = (animRunRef.current += 1);
    let cancelled = false;
    let completed = false;
    let landTime = 0;
    const startTime = performance.now();

    const enterLandHold = timeNow => {
      landRef.current = true;
      landTime = timeNow;
    };

    const tick = now => {
      if (cancelled || animRunRef.current !== runId) return;
      if (completed) return;

      if (!landRef.current) {
        const elapsed = now - startTime;
        if (elapsed >= MAX_FALL_MS) {
          const endPos = positionAtArcLength(polyPoints, cum, totalLength, totalLength);
          ballRef.current.x = endPos.x;
          ballRef.current.y = endPos.y;
          enterLandHold(now);
          draw();
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const rawT = Math.min(1, elapsed / DROP_FALL_DURATION_MS);
        const easedT = easeOutQuad(rawT);
        const dist = easedT * totalLength;
        const p = positionAtArcLength(polyPoints, cum, totalLength, dist);
        ballRef.current.x = p.x;
        ballRef.current.y = p.y;
        draw();
        if (rawT >= 1) {
          enterLandHold(now);
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
