/**
 * Presentation-only: Community Cards seat ring positions (% of the felt box).
 * Seat 0 = bottom center (hero); indices increase clockwise on screen.
 *
 * Breakpoints (pass from viewport):
 * - `xs`  — very small mobile (&lt; 400px)
 * - `mo`  — regular mobile [400, 640)
 * - `pad` — sm–md / tablet [640, 1024)
 * - `dk`  — desktop (≥ 1024px)
 *
 * @typedef {'xs' | 'mo' | 'pad' | 'dk'} Ov2CcSeatRingBreakpoint
 */

/** @type {Ov2CcSeatRingBreakpoint[]} */
export const OV2_CC_SEAT_RING_BREAKPOINTS = ["xs", "mo", "pad", "dk"];

/**
 * Map innerWidth to ring breakpoint (call from client only).
 * @param {number} width
 * @returns {Ov2CcSeatRingBreakpoint}
 */
export function ov2CcSeatRingBreakpointFromWidth(width) {
  const w = Number(width) || 0;
  if (w < 400) return "xs";
  if (w < 640) return "mo";
  if (w < 1024) return "pad";
  return "dk";
}

/**
 * Ellipse params: center (cx,cy)%, radii rx/ry%, angle θ = 2π·i/n
 * left = cx - rx·sin(θ), top = cy + ry·cos(θ)  → seat 0 at bottom.
 * @typedef {{ cx: number, cy: number, rx: number, ry: number }} EllipseParams
 */

/** @type {Record<Ov2CcSeatRingBreakpoint, EllipseParams>} */
const ELLIPSE_5 = {
  /* Seat 0 at bottom: top ≈ cy+ry — xs/mo: wider ring + slightly higher cy to clear center text/board */
  xs: { cx: 50, cy: 45.8, rx: 35.2, ry: 34.2 },
  mo: { cx: 50, cy: 45.8, rx: 37.8, ry: 35.5 },
  pad: { cx: 50, cy: 47.5, rx: 38.5, ry: 35 },
  dk: { cx: 50, cy: 47.6, rx: 41.8, ry: 37.2 },
};

/** @type {Record<Ov2CcSeatRingBreakpoint, EllipseParams>} */
const ELLIPSE_6 = {
  xs: { cx: 50, cy: 45.9, rx: 36.2, ry: 34.5 },
  mo: { cx: 50, cy: 45.9, rx: 38.8, ry: 36 },
  pad: { cx: 50, cy: 47.5, rx: 39.5, ry: 35.5 },
  dk: { cx: 50, cy: 47.6, rx: 42.8, ry: 37.8 },
};

/** @type {Record<Ov2CcSeatRingBreakpoint, EllipseParams>} */
const ELLIPSE_789 = {
  xs: { cx: 50, cy: 46.2, rx: 36.2, ry: 35.2 },
  mo: { cx: 50, cy: 46, rx: 38.8, ry: 36.2 },
  pad: { cx: 50, cy: 47.6, rx: 40, ry: 36.2 },
  dk: { cx: 50, cy: 47.5, rx: 43.8, ry: 38.5 },
};

/**
 * Explicit % pairs [left, top] for tiny tables (cleaner than a forced ellipse).
 * @type {Record<number, Record<Ov2CcSeatRingBreakpoint, [number, number][]>>}
 */
const EXPLICIT_RING = {
  1: {
    xs: [[50, 81]],
    mo: [[50, 82]],
    pad: [[50, 84]],
    dk: [[50, 86]],
  },
  2: {
    xs: [
      [50, 81],
      [50, 22],
    ],
    mo: [
      [50, 82.5],
      [50, 20.5],
    ],
    pad: [
      [50, 85],
      [50, 17.5],
    ],
    dk: [
      [50, 87],
      [50, 15],
    ],
  },
  3: {
    xs: [
      [50, 81.5],
      [24, 36.5],
      [76, 36.5],
    ],
    mo: [
      [50, 82.5],
      [23, 34.5],
      [77, 34.5],
    ],
    pad: [
      [50, 85],
      [20, 29.5],
      [80, 29.5],
    ],
    dk: [
      [50, 86.5],
      [18, 26.5],
      [82, 26.5],
    ],
  },
  4: {
    /* bottom → left → top → right (clockwise from seat 0) — pad+ : classic ring */
    xs: [
      [50, 84.5],
      [13.5, 50],
      [50, 17.5],
      [86.5, 50],
    ],
    mo: [
      [50, 85],
      [12.5, 50],
      [50, 16],
      [87.5, 50],
    ],
    pad: [
      [50, 85],
      [13.5, 50],
      [50, 16.5],
      [86.5, 50],
    ],
    dk: [
      [50, 86.5],
      [11.5, 50],
      [50, 14],
      [88.5, 50],
    ],
  },
};

/**
 * Mobile (xs/mo): keep seat index order but avoid the lower felt band so the hero hand can sit there.
 * All anchor tops stay ≤ ~58% so capsules clear the bottom card zone.
 * @type {Record<number, Record<'xs' | 'mo', [number, number][]>>}
 */
const MOBILE_NO_LOWER_FELT_RING = {
  1: {
    xs: [[50, 44]],
    mo: [[50, 43]],
  },
  2: {
    xs: [
      [20, 52],
      [80, 52],
    ],
    mo: [
      [19, 52],
      [81, 52],
    ],
  },
  3: {
    xs: [
      [16, 50],
      [84, 50],
      [50, 14],
    ],
    mo: [
      [15, 50],
      [85, 50],
      [50, 13],
    ],
  },
  4: {
    xs: [
      [13, 56],
      [10, 34],
      [50, 11],
      [90, 34],
    ],
    mo: [
      [12, 56],
      [9, 33],
      [50, 10],
      [91, 33],
    ],
  },
  5: {
    xs: [
      [11, 54],
      [7, 32],
      [50, 10],
      [93, 32],
      [89, 54],
    ],
    mo: [
      [10, 54],
      [6, 31],
      [50, 9],
      [94, 31],
      [90, 54],
    ],
  },
  6: {
    xs: [
      [10, 56],
      [6, 36],
      [24, 16],
      [76, 16],
      [94, 36],
      [90, 56],
    ],
    mo: [
      [9, 56],
      [5, 35],
      [23, 15],
      [77, 15],
      [95, 35],
      [91, 56],
    ],
  },
};

/** Wider, flatter upper arc for 7–9 seats on mobile (no bottom wedge). */
const MOBILE_ARC_EL = {
  xs: { cx: 50, cy: 40.5, rx: 45, ry: 29 },
  mo: { cx: 50, cy: 40.5, rx: 46, ry: 30 },
};

/**
 * @param {EllipseParams} e
 * @param {number} i
 * @param {number} n
 */
function ellipsePercentUpperArcNoBottom(e, i, n) {
  const nn = Math.max(1, Math.floor(n) || 1);
  const ii = Math.max(0, Math.min(nn - 1, Math.floor(i) || 0));
  const gap = Math.PI / 2.65;
  const span = 2 * Math.PI - 2 * gap;
  const theta = nn === 1 ? Math.PI : gap + (span * (ii + 0.5)) / nn;
  const leftPct = e.cx - e.rx * Math.sin(theta);
  const topPct = e.cy + e.ry * Math.cos(theta);
  return { leftPct, topPct };
}

/**
 * @param {EllipseParams} e
 * @param {number} i
 * @param {number} n
 */
function ellipsePercent(e, i, n) {
  const theta = (2 * Math.PI * i) / n;
  const leftPct = e.cx - e.rx * Math.sin(theta);
  const topPct = e.cy + e.ry * Math.cos(theta);
  return { leftPct, topPct };
}

function pickEllipse(maxSeats, bp) {
  if (maxSeats <= 5) return ELLIPSE_5[bp];
  if (maxSeats === 6) return ELLIPSE_6[bp];
  return ELLIPSE_789[bp];
}

/**
 * @param {number} maxSeats
 * @param {number} seatIndex
 * @param {Ov2CcSeatRingBreakpoint} [breakpoint='mo'] — from `ov2CcSeatRingBreakpointFromWidth`
 * @returns {{ top: string, left: string }}
 */
export function ov2CcSeatRingPercent(maxSeats, seatIndex, breakpoint = "mo") {
  const n = Math.max(1, Math.floor(Number(maxSeats) || 9));
  const i = Math.floor(Number(seatIndex) || 0);
  if (i < 0 || i >= n) return { top: "50%", left: "50%" };

  const bp = OV2_CC_SEAT_RING_BREAKPOINTS.includes(breakpoint) ? breakpoint : "mo";

  if ((bp === "xs" || bp === "mo") && MOBILE_NO_LOWER_FELT_RING[n]) {
    const row = MOBILE_NO_LOWER_FELT_RING[n][bp];
    const [leftPct, topPct] = row[i] ?? row[0];
    return {
      left: `${Math.round(leftPct * 100) / 100}%`,
      top: `${Math.round(topPct * 100) / 100}%`,
    };
  }

  if ((bp === "xs" || bp === "mo") && n >= 7) {
    const e = MOBILE_ARC_EL[bp];
    const { leftPct, topPct } = ellipsePercentUpperArcNoBottom(e, i, n);
    return {
      left: `${Math.round(leftPct * 100) / 100}%`,
      top: `${Math.round(topPct * 100) / 100}%`,
    };
  }

  if (n <= 4 && EXPLICIT_RING[n]) {
    const row = EXPLICIT_RING[n][bp];
    const [leftPct, topPct] = row[i] ?? row[0];
    return {
      left: `${Math.round(leftPct * 100) / 100}%`,
      top: `${Math.round(topPct * 100) / 100}%`,
    };
  }

  const e = pickEllipse(n, bp);
  const { leftPct, topPct } = ellipsePercent(e, i, n);
  return {
    left: `${Math.round(leftPct * 100) / 100}%`,
    top: `${Math.round(topPct * 100) / 100}%`,
  };
}
