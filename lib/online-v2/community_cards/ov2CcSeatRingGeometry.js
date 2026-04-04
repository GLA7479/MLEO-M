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
 * ─── Where to move seat windows (all % are of the green felt box; higher `top` = lower on screen) ───
 * 1. **shiftSeatTopDown()** — one vertical nudge added to **every** seat after layout (xs/mo vs pad/dk).
 * 2. **MOBILE_NO_LOWER_FELT_RING** — in-hand **mobile** (xs/mo), **1–6** seats: explicit `[left, top]` per seat index.
 * 3. **MOBILE_ARC_EL** — in-hand **mobile**, **7–9** seats: ellipse `cx,cy,rx,ry` (upper arc math).
 * 4. **MOBILE_IDLE_OPENING_RING** / **MOBILE_IDLE_FULL_ELLIPSE** — not used on mobile idle (override returns null); same ring as live.
 * 5. **EXPLICIT_RING** — in-hand, **≤4** seats, all breakpoints: `[left, top]` tables.
 * 6. **ELLIPSE_5** / **ELLIPSE_6** / **ELLIPSE_789** — in-hand **5–9** when not using mobile NO_LOWER (e.g. pad/dk or fallback).
 * 7. **idleOpeningSeatSpreadOverride** — idle **pad/dk**, n&gt;4: widened ellipse (see `widen` inside). **Ov2CcScreen** keeps this off on pad/dk so seats do not jump after the hand.
 * 8. **Hero seat 0 (pad/dk, n≥6)** — after ring/idle %: **left stays 50%**; **top** is derived from **server** seats at indices **4 &amp; 5** (ellipse neighbors at the upper arc for 7–9-max).
 * 9. **Desktop (`dk`) only** — presentation remaps (labels still `seatIndex + 1`): **n=2** — swap **0↔1**; **n=3** — cycle mod 3; **n=4** — cycle **0→1→2→3→0**; **n≥5** — first five slots cycle **0→1→2→3→4→0**; seats **6+** unchanged. **n=5 + `dk`** additionally **mirrors seat `top` around ellipse `cy`** (ellipse “flipped” vertically) so no capsule sits on the lower felt over hero cards. Tablet (`pad`) and mobile unchanged.
 * UI seat chip labels use **server `seatIndex + 1`** (same on mobile and desktop).
 * Applied on screen: `Ov2CcScreen.js` → `renderSeatNode` → `style.left` / `style.top` from **ov2CcSeatRingPercent()**.
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
 * Idle/opening on **pad/dk** may still widen ellipse; on **xs/mo** idle uses this same table as live (override null).
 * @type {Record<number, Record<'xs' | 'mo', [number, number][]>>}
 */
const MOBILE_NO_LOWER_FELT_RING = {
  1: {
    xs: [[50, 40]],
    mo: [[50, 38]],
  },
  2: {
    xs: [
      [14, 48],
      [86, 48],
    ],
    mo: [
      [12, 46],
      [88, 46],
    ],
  },
  3: {
    xs: [
      [10, 44],
      [90, 44],
      [50, 7],
    ],
    mo: [
      [8, 42],
      [92, 42],
      [50, 6],
    ],
  },
  4: {
    xs: [
      [8, 46],
      [5, 21],
      [50, 5],
      [95, 21],
    ],
    mo: [
      [7, 44],
      [4, 19],
      [50, 4],
      [96, 19],
    ],
  },
  5: {
    xs: [
      [14, 57],
      [13, 24],
      [50, 5],
      [87, 24],
      [86, 57],
    ],
    mo: [
      [12, 56],
      [10, 22],
      [50, 4],
      [90, 22],
      [88, 56],
    ],
  },
  6: {
    xs: [
      [6, 42],
      [3, 23],
      [17, 9],
      [83, 9],
      [97, 23],
      [94, 42],
    ],
    mo: [
      [5, 40],
      [2, 21],
      [15, 8],
      [85, 8],
      [98, 21],
      [95, 40],
    ],
  },
  9: {
    xs: [
      [13, 66],
      [9, 48],
      [9, 29],
      [25, 11],
      [50, 4],
      [75, 11],
      [91, 29],
      [91, 48],
      [87, 66],
    ],
    mo: [
      [12, 65],
      [8, 46],
      [8, 27],
      [23, 9],
      [50, 3],
      [77, 9],
      [92, 27],
      [92, 46],
      [88, 65],
    ],
  },
};

/** Active / in-hand 7–9 on mobile: wide upper arc only (no bottom wedge). */
const MOBILE_ARC_EL = {
  xs: { cx: 50, cy: 35.5, rx: 47.5, ry: 31.5 },
  mo: { cx: 50, cy: 35, rx: 48.5, ry: 32.5 },
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
 * 5-max + desktop: mirror vertical position around ellipse center `cy` (same as θ += π for this parametrization).
 * Frees the bottom of the felt for hero hole cards while keeping the dk seat-index cycle.
 * @param {number} n
 * @param {Ov2CcSeatRingBreakpoint} bp
 * @param {EllipseParams} e
 * @param {number} leftPct
 * @param {number} topPct
 */
function ov2CcMirrorSeatTopForDkFiveMax(n, bp, e, leftPct, topPct) {
  if (n !== 5 || bp !== "dk") return { leftPct, topPct };
  return { leftPct, topPct: 2 * e.cy - topPct };
}

/**
 * Seat 0 = bottom-center in ellipse math; on pad/dk that sits on the hero hole-card strip.
 * Keep **left 50%**; set **top** from seats 5 & 6 (indices 4 & 5) on the in-hand ellipse — between them on Y,
 * slightly higher when both sit on the same upper row (7–9-max).
 * @returns {{ leftPct: number, topPct: number }}
 */
function adjustHeroSeat0PadDk(n, seatIndex, bp, leftPct, topPct) {
  if (seatIndex !== 0 || n < 6 || (bp !== "pad" && bp !== "dk")) {
    return { leftPct, topPct };
  }
  const e = pickEllipse(n, bp);
  const t4 = ellipsePercent(e, 4, n).topPct;
  const t5 = ellipsePercent(e, 5, n).topPct;
  const mid = (t4 + t5) / 2;
  const sameUpperRow = Math.abs(t4 - t5) < 5;
  const liftTowardTop = sameUpperRow ? 3.2 : 2;
  return { leftPct: 50, topPct: Math.max(3.5, mid - liftTowardTop) };
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
  const raw = ellipsePercent(e, i, n);
  return ov2CcMirrorSeatTopForDkFiveMax(n, bp, e, raw.leftPct, raw.topPct);
}

/**
 * Idle/opening only: alternate seat spread. Returns null → caller uses {@link activeInHandSeatPercentCore}.
 * On **xs/mo** always returns null so opening/idle matches live/in-hand ring (no separate mobile idle tables).
 * @returns {({ leftPct: number, topPct: number }) | null}
 */
function idleOpeningSeatSpreadOverride(n, i, bp) {
  if (bp === "xs" || bp === "mo") return null;

  if ((bp === "pad" || bp === "dk") && n > 4) {
    const e = pickEllipse(n, bp);
    const widen = { cx: e.cx, cy: Math.min(52, e.cy + 1.5), rx: e.rx * 1.06, ry: e.ry * 1.08 };
    const raw = ellipsePercent(widen, i, n);
    return ov2CcMirrorSeatTopForDkFiveMax(n, bp, widen, raw.leftPct, raw.topPct);
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
 * Global vertical offset for **all** seats (after ring math). Increase to move every capsule down on the felt.
 * Does not change `left`; only `top` (see file header “Where to move seat windows”).
 */
function shiftSeatTopDown(topPct, bp) {
  if (bp === "xs" || bp === "mo") return topPct + 6;
  if (bp === "pad" || bp === "dk") return topPct + 4;
  return topPct;
}

/**
 * Desktop (`dk`) only: which ring index’s % to use for server seat `i`.
 * Composed UI swaps (1↔2 … 4↔5): n=2 → mod 2; n=3 → mod 3; n=4 → mod 4 on 0–3; n≥5 → mod 5 on 0–4 (5-max dk also uses vertical mirror of ellipse, see {@link ov2CcMirrorSeatTopForDkFiveMax}).
 * @param {number} seatIndex
 * @param {number} n
 * @returns {number}
 */
function ov2CcDkSeatRingIndexRemap(seatIndex, n) {
  if (n < 2) return seatIndex;
  if (n === 2) return (seatIndex + 1) % 2;
  if (n === 3) return (seatIndex + 1) % 3;
  if (n === 4) {
    if (seatIndex <= 3) return (seatIndex + 1) % 4;
    return seatIndex;
  }
  if (seatIndex <= 4) return (seatIndex + 1) % 5;
  return seatIndex;
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

  const ringI = bp === "dk" ? ov2CcDkSeatRingIndexRemap(i, n) : i;

  let leftPct;
  let topPct;
  if (idleSeatSpreadOnly) {
    const alt = idleOpeningSeatSpreadOverride(n, ringI, bp);
    if (alt) {
      leftPct = alt.leftPct;
      topPct = alt.topPct;
    } else {
      const base = activeInHandSeatPercentCore(n, ringI, bp);
      leftPct = base.leftPct;
      topPct = base.topPct;
    }
  } else {
    const base = activeInHandSeatPercentCore(n, ringI, bp);
    leftPct = base.leftPct;
    topPct = base.topPct;
  }

  const adj = adjustHeroSeat0PadDk(n, ringI, bp, leftPct, topPct);
  return formatSeatPct(adj.leftPct, shiftSeatTopDown(adj.topPct, bp));
}
