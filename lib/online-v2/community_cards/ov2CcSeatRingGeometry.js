/**
 * Presentation-only: Community Cards seat ring positions (% of the felt box).
 * Seat 0 = bottom center (hero); indices increase clockwise on screen.
 *
 * Layout rule: **active / in-hand** ring math is the default baseline. **Idle / opening**
 * applies a small optional override to seat % only — it does not define felt, cards, or actions.
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
 * Active / in-hand mobile only (xs/mo): fixed % anchors — wide spread, no seats in the lower hero-hand band.
 * Idle/opening uses {@link MOBILE_IDLE_OPENING_RING} instead; do not merge these tables.
 * @type {Record<number, Record<'xs' | 'mo', [number, number][]>>}
 */
const MOBILE_NO_LOWER_FELT_RING = {
  1: {
    xs: [[50, 40]],
    mo: [[50, 38]],
  },
  2: {
    xs: [
      [11, 48],
      [89, 48],
    ],
    mo: [
      [8, 46],
      [92, 46],
    ],
  },
  3: {
    xs: [
      [7, 44],
      [93, 44],
      [50, 6],
    ],
    mo: [
      [5, 42],
      [95, 42],
      [50, 5],
    ],
  },
  4: {
    xs: [
      [6, 45],
      [2, 20],
      [50, 4],
      [98, 20],
    ],
    mo: [
      [5, 44],
      [1, 18],
      [50, 3],
      [99, 18],
    ],
  },
  5: {
    xs: [
      [7, 44],
      [2, 21],
      [50, 4],
      [98, 21],
      [93, 44],
    ],
    mo: [
      [6, 42],
      [1, 20],
      [50, 4],
      [99, 20],
      [94, 42],
    ],
  },
  6: {
    xs: [
      [4, 42],
      [1, 22],
      [14, 8],
      [86, 8],
      [99, 22],
      [96, 42],
    ],
    mo: [
      [3, 40],
      [1, 20],
      [12, 7],
      [88, 7],
      [99, 20],
      [97, 40],
    ],
  },
};

/** Active / in-hand 7–9 on mobile: wide upper arc only (no bottom wedge). */
const MOBILE_ARC_EL = {
  xs: { cx: 50, cy: 34.5, rx: 49, ry: 32.5 },
  mo: { cx: 50, cy: 34, rx: 50.5, ry: 33.5 },
};

/**
 * Mobile idle/opening only: seats use the full felt height (incl. lower arc). Not used during live betting streets.
 * @type {Record<number, Record<'xs' | 'mo', [number, number][]>>}
 */
const MOBILE_IDLE_OPENING_RING = {
  1: {
    xs: [[50, 48]],
    mo: [[50, 47]],
  },
  2: {
    xs: [
      [50, 78],
      [50, 14],
    ],
    mo: [
      [50, 77],
      [50, 13],
    ],
  },
  3: {
    xs: [
      [50, 76],
      [9, 31],
      [91, 31],
    ],
    mo: [
      [50, 75],
      [7, 30],
      [93, 30],
    ],
  },
  4: {
    xs: [
      [50, 78],
      [6, 48],
      [50, 11],
      [94, 48],
    ],
    mo: [
      [50, 77],
      [5, 48],
      [50, 10],
      [95, 48],
    ],
  },
  5: {
    xs: [
      [50, 80],
      [6, 59],
      [13, 21],
      [87, 21],
      [94, 59],
    ],
    mo: [
      [50, 79],
      [5, 58],
      [12, 20],
      [88, 20],
      [95, 58],
    ],
  },
  6: {
    xs: [
      [50, 82],
      [6, 63],
      [9, 27],
      [91, 27],
      [94, 63],
      [50, 8],
    ],
    mo: [
      [50, 81],
      [5, 62],
      [8, 26],
      [92, 26],
      [95, 62],
      [50, 7],
    ],
  },
};

/** Full ellipse (seat 0 at bottom) for 7–9 on mobile when idle/opening. */
const MOBILE_IDLE_FULL_ELLIPSE = {
  xs: { cx: 50, cy: 51, rx: 43.5, ry: 40 },
  mo: { cx: 50, cy: 51, rx: 45.5, ry: 41.5 },
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
 * Active / in-hand baseline: mobile clears lower felt for hero cards; tablet/desktop use explicit/ellipse.
 * @returns {{ leftPct: number, topPct: number }}
 */
function activeInHandSeatPercentCore(n, i, bp) {
  if ((bp === "xs" || bp === "mo") && MOBILE_NO_LOWER_FELT_RING[n]) {
    const row = MOBILE_NO_LOWER_FELT_RING[n][bp];
    const [leftPct, topPct] = row[i] ?? row[0];
    return { leftPct, topPct };
  }

  if ((bp === "xs" || bp === "mo") && n >= 7) {
    const e = MOBILE_ARC_EL[bp];
    return ellipsePercentUpperArcNoBottom(e, i, n);
  }

  if (n <= 4 && EXPLICIT_RING[n]) {
    const row = EXPLICIT_RING[n][bp];
    const [leftPct, topPct] = row[i] ?? row[0];
    return { leftPct, topPct };
  }

  const e = pickEllipse(n, bp);
  return ellipsePercent(e, i, n);
}

/**
 * Idle/opening only: alternate seat spread. Returns null → caller uses {@link activeInHandSeatPercentCore}.
 * @returns {({ leftPct: number, topPct: number }) | null}
 */
function idleOpeningSeatSpreadOverride(n, i, bp) {
  if ((bp === "xs" || bp === "mo") && MOBILE_IDLE_OPENING_RING[n]) {
    const row = MOBILE_IDLE_OPENING_RING[n][bp];
    const [leftPct, topPct] = row[i] ?? row[0];
    return { leftPct, topPct };
  }

  if ((bp === "xs" || bp === "mo") && n >= 7) {
    const e = MOBILE_IDLE_FULL_ELLIPSE[bp];
    return ellipsePercent(e, i, n);
  }

  if ((bp === "pad" || bp === "dk") && n > 4) {
    const e = pickEllipse(n, bp);
    const widen = { cx: e.cx, cy: Math.min(52, e.cy + 1.5), rx: e.rx * 1.06, ry: e.ry * 1.08 };
    return ellipsePercent(widen, i, n);
  }

  return null;
}

function formatSeatPct(leftPct, topPct) {
  return {
    left: `${Math.round(leftPct * 100) / 100}%`,
    top: `${Math.round(topPct * 100) / 100}%`,
  };
}

/**
 * @param {number} maxSeats
 * @param {number} seatIndex
 * @param {Ov2CcSeatRingBreakpoint} [breakpoint='mo'] — from `ov2CcSeatRingBreakpointFromWidth`
 * @param {{ idleSeatSpreadOverride?: boolean, idleOpening?: boolean }} [options] — `idleSeatSpreadOverride` or legacy `idleOpening`: seat % only, when not in live betting streets (caller-driven).
 * @returns {{ top: string, left: string }}
 */
export function ov2CcSeatRingPercent(maxSeats, seatIndex, breakpoint = "mo", options) {
  const idleSeatSpreadOnly = Boolean(
    options && (options.idleSeatSpreadOverride === true || options.idleOpening === true),
  );
  const n = Math.max(1, Math.floor(Number(maxSeats) || 9));
  const i = Math.floor(Number(seatIndex) || 0);
  if (i < 0 || i >= n) return { top: "50%", left: "50%" };

  const bp = OV2_CC_SEAT_RING_BREAKPOINTS.includes(breakpoint) ? breakpoint : "mo";

  if (idleSeatSpreadOnly) {
    const alt = idleOpeningSeatSpreadOverride(n, i, bp);
    if (alt) return formatSeatPct(alt.leftPct, alt.topPct);
  }

  const base = activeInHandSeatPercentCore(n, i, bp);
  return formatSeatPct(base.leftPct, base.topPct);
}
