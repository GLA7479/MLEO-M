/**
 * Goal Duel — canvas presentation only (no physics / RPC changes).
 *
 * PLAYERS: raster dog sprites (`opts.sprite`) are the primary art — assets should face **right**.
 * Hitbox unchanged: sprite is scaled to match `2*hh` tall and anchored to feet at `py + hh`.
 * Horizontal mirror uses `anim.facing`. If no sprite loads, a minimal shadow-only fallback draws.
 *
 * Ball: optional raster `opts.sprite` in `drawGoalDuelTennisBall`; else procedural fallback.
 */

/** @typedef {{
 *   p0x: number, p0y: number, p1x: number, p1y: number, bx: number, by: number, t: number
 * }} PrevFrame */

/** @typedef {typeof TEAM_STAR_DOG} GoalDuelDogPalette */

/** Home side — warm natural coat (tune hex to match your dog). */
export const TEAM_STAR_DOG = {
  body: "#b86a32",
  bodyLight: "#e8a86e",
  bodyDark: "#5c2e12",
  ear: "#8b4518",
  nose: "#1a0f08",
  collar: "#f59e0b",
  chestBlaze: "rgba(255,250,245,0.94)",
  sock: "rgba(255,252,248,0.9)",
  tailTip: "rgba(255,255,255,0.45)",
  muzzleMask: "rgba(40,28,18,0.35)",
  brindle: "rgba(45,25,12,0.22)",
};

/** Away side — same silhouette, night kit + bandana accent. */
export const TEAM_RIVAL_DOG = {
  body: "#3d4f62",
  bodyLight: "#6b7f96",
  bodyDark: "#1e2835",
  ear: "#2d3a4a",
  nose: "#0a1018",
  collar: "#38bdf8",
  chestBlaze: "rgba(200,220,240,0.4)",
  sock: "rgba(200,215,235,0.5)",
  tailTip: "rgba(180,200,230,0.45)",
  muzzleMask: "rgba(20,35,55,0.4)",
  brindle: "rgba(15,25,40,0.25)",
  bandana: "#2563eb",
};

/** @deprecated Use TEAM_STAR_DOG */
export const TEAM_WARM = TEAM_STAR_DOG;
/** @deprecated Use TEAM_RIVAL_DOG */
export const TEAM_COOL = TEAM_RIVAL_DOG;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {number} aw
 * @param {number} ah
 * @param {number} gy
 * @param {number} gm
 * @param {number} sx
 * @param {number} sy
 */
export function drawGoalDuelArena(ctx, W, H, aw, ah, gy, gm, sx, sy) {
  const groundY = gy * sy;
  const horizon = groundY * 0.42;
  /** Grass band starts here — pitch markings use this so lines never sit in the sky layer */
  const grassTop = groundY * 0.5;

  const sky = ctx.createLinearGradient(0, 0, W, horizon);
  sky.addColorStop(0, "#1e0f3d");
  sky.addColorStop(0.35, "#4a2d7a");
  sky.addColorStop(0.62, "#c45c2a");
  sky.addColorStop(0.88, "#f4a84a");
  sky.addColorStop(1, "#ffd8a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  const sunG = ctx.createRadialGradient(W * 0.78, horizon * 0.55, 0, W * 0.78, horizon * 0.55, W * 0.38);
  sunG.addColorStop(0, "rgba(255,230,160,0.62)");
  sunG.addColorStop(0.45, "rgba(255,170,90,0.16)");
  sunG.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = sunG;
  ctx.fillRect(0, 0, W, horizon);

  const cornerL = ctx.createLinearGradient(0, 0, W * 0.45, horizon * 0.85);
  cornerL.addColorStop(0, "rgba(120,180,255,0.12)");
  cornerL.addColorStop(1, "rgba(80,40,120,0)");
  ctx.fillStyle = cornerL;
  ctx.fillRect(0, 0, W * 0.5, horizon);
  const cornerR = ctx.createLinearGradient(W, 0, W * 0.55, horizon * 0.85);
  cornerR.addColorStop(0, "rgba(255,160,90,0.1)");
  cornerR.addColorStop(1, "rgba(120,60,40,0)");
  ctx.fillStyle = cornerR;
  ctx.fillRect(W * 0.5, 0, W * 0.5, horizon);

  const glowMid = ctx.createRadialGradient(W * 0.5, horizon * 0.12, 0, W * 0.5, horizon * 0.28, W * 0.42);
  glowMid.addColorStop(0, "rgba(255,250,235,0.09)");
  glowMid.addColorStop(1, "rgba(255,200,140,0)");
  ctx.fillStyle = glowMid;
  ctx.fillRect(0, 0, W, horizon);

  /* Stadium floodlights — sky / horizon band only (never on grass); not pitch geometry */
  for (let i = 0; i < 6; i++) {
    const lx = (0.03 + i * 0.158) * W;
    const beamH = horizon * 0.88;
    const cone = ctx.createLinearGradient(lx - 55, 0, lx, beamH);
    cone.addColorStop(0, "rgba(255,255,245,0.2)");
    cone.addColorStop(0.35, "rgba(255,235,190,0.09)");
    cone.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lx - 28 * sx, 0);
    ctx.lineTo(lx + 28 * sx, 0);
    ctx.lineTo(lx + 115 * sx, beamH);
    ctx.lineTo(lx - 115 * sx, beamH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,252,220,0.65)";
    ctx.beginPath();
    ctx.arc(lx, horizon * 0.06, 4 * sx, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const lx = (0.08 + i * 0.168) * W;
    const beamH = horizon * 0.72;
    const cone = ctx.createLinearGradient(lx - 30, horizon * 0.08, lx, beamH);
    cone.addColorStop(0, "rgba(255,255,255,0.06)");
    cone.addColorStop(1, "rgba(255,220,160,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lx - 18 * sx, horizon * 0.06);
    ctx.lineTo(lx + 18 * sx, horizon * 0.06);
    ctx.lineTo(lx + 72 * sx, beamH);
    ctx.lineTo(lx - 72 * sx, beamH);
    ctx.closePath();
    ctx.fill();
  }

  const skyWash = ctx.createRadialGradient(W * 0.5, horizon * 0.18, 0, W * 0.5, horizon * 0.38, W * 0.58);
  skyWash.addColorStop(0, "rgba(255,248,210,0.12)");
  skyWash.addColorStop(1, "rgba(255,180,100,0)");
  ctx.fillStyle = skyWash;
  ctx.fillRect(0, 0, W, horizon);

  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let s = 0; s < 90; s++) {
    const sparkX = ((s * 97.3) % W);
    const sparkY = ((s * 53.7) % (horizon * 0.32));
    ctx.fillStyle = s % 4 === 0 ? "rgba(255,255,255,0.5)" : "rgba(255,230,180,0.35)";
    ctx.fillRect(sparkX, sparkY, 1.1, 1.1);
  }
  ctx.restore();

  ctx.fillStyle = "rgba(15,8,35,0.42)";
  ctx.beginPath();
  ctx.moveTo(0, horizon * 0.94);
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * W;
    const y = horizon * 0.9 + Math.sin(i * 0.7) * 2 * sy;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, horizon);
  ctx.lineTo(0, horizon);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(12,10,22,0.75)";
  const crowdH = 14 * sy;
  ctx.fillRect(0, horizon - crowdH, W, crowdH);
  for (let x = 4; x < W; x += 5) {
    const h = 3 + (x % 7);
    ctx.fillStyle = `rgba(${120 + (x % 40)},${90 + (x % 30)},${140 + (x % 50)},0.35)`;
    ctx.fillRect(x, horizon - crowdH - h, 3, h);
  }

  /* Soft rim where stands meet grass — gradient only, no hard line (avoids “pitch line in the sky” read) */
  const rimGrad = ctx.createLinearGradient(0, grassTop - 5, 0, grassTop + 4);
  rimGrad.addColorStop(0, "rgba(0,0,0,0)");
  rimGrad.addColorStop(0.45, "rgba(255,210,150,0.045)");
  rimGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, grassTop - 5, W, 10);

  const grassH = H - grassTop;
  const stripeW = 22 * sx;
  for (let x = 0; x < W + stripeW; x += stripeW * 2) {
    const g = ctx.createLinearGradient(x, grassTop, x + stripeW, grassTop + grassH);
    g.addColorStop(0, "#1e5c32");
    g.addColorStop(0.4, "#2a7a42");
    g.addColorStop(1, "#1a4d28");
    ctx.fillStyle = g;
    ctx.fillRect(x, grassTop, stripeW, grassH);
  }

  const overlay = ctx.createLinearGradient(0, grassTop, 0, H);
  overlay.addColorStop(0, "rgba(55,140,75,0.5)");
  overlay.addColorStop(1, "rgba(25,70,38,0.65)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, grassTop, W, grassH);

  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 400; i++) {
    const rx = (Math.sin(i * 12.9898) * 0.5 + 0.5) * W;
    const ry = grassTop + (Math.cos(i * 78.233) * 0.5 + 0.5) * grassH;
    ctx.fillStyle = i % 3 === 0 ? "#1a3d24" : "#3d9e58";
    ctx.fillRect(rx, ry, 1.2, 1.2);
  }
  ctx.restore();

  const fieldLeft = gm * sx;
  const fieldRight = W - gm * sx;
  /** Pitch markings must sit on grass only — old `78 * sy` sat above `grassTop` and drew lines into the sky. */
  const fieldTop = grassTop + 12 * sy;
  const fieldW = fieldRight - fieldLeft;
  const fieldH = groundY - fieldTop;

  const midX = (aw / 2) * sx;
  const midCy = fieldTop + fieldH * 0.52;
  /** Start center line lower — no long vertical “stem” into the upper grass band */
  const lineTop = fieldTop + fieldH * 0.28;
  ctx.strokeStyle = "rgba(255,255,255,0.17)";
  ctx.lineWidth = 1.25;
  ctx.setLineDash([10 * sx, 8 * sx]);
  ctx.beginPath();
  ctx.moveTo(midX, lineTop);
  ctx.lineTo(midX, groundY);
  ctx.stroke();
  ctx.setLineDash([]);

  const circleR = Math.min(36 * sx, 32 * sy);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(midX, midCy, circleR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(midX, midCy, 2.5 * sx, 0, Math.PI * 2);
  ctx.fill();

  const spotY = groundY - 4 * sy;
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.ellipse(midX, spotY + 2 * sy, fieldW * 0.38, 4 * sy, 0, 0, Math.PI * 2);
  ctx.fill();

  drawStadiumGoal(ctx, fieldLeft, groundY, 132 * sy, sx, sy, "left");
  drawStadiumGoal(ctx, fieldRight, groundY, 132 * sy, sx, sy, "right");

  ctx.strokeStyle = "rgba(20,40,25,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();

  const vignette = ctx.createRadialGradient(W / 2, groundY * 0.55, W * 0.1, W / 2, groundY * 0.55, W * 0.85);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(10,5,30,0.35)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} gx
 * @param {number} groundY
 * @param {number} goalH
 * @param {number} sx
 * @param {number} sy
 * @param {"left"|"right"} side
 */
function drawStadiumGoal(ctx, gx, groundY, goalH, sx, sy, side) {
  const depth = 28 * sx;
  const postW = 5 * sx;
  const inner = gx;
  const back = side === "left" ? gx - depth : gx + depth;
  const left = Math.min(inner, back);
  const w = Math.abs(inner - back);

  const shade = ctx.createLinearGradient(left, groundY - goalH, left + w, groundY);
  shade.addColorStop(0, "rgba(15,25,20,0.75)");
  shade.addColorStop(1, "rgba(35,50,45,0.45)");
  ctx.fillStyle = shade;
  ctx.fillRect(left, groundY - goalH, w, goalH);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(side === "left" ? inner - 2 : inner - postW, groundY - goalH, postW + 2, goalH);

  ctx.strokeStyle = "rgba(248,250,252,0.92)";
  ctx.lineWidth = postW;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(inner, groundY);
  ctx.lineTo(inner, groundY - goalH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(back, groundY);
  ctx.lineTo(back, groundY - goalH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(Math.min(inner, back), groundY - goalH);
  ctx.lineTo(Math.max(inner, back), groundY - goalH);
  ctx.stroke();

  ctx.strokeStyle = "rgba(200,220,255,0.2)";
  ctx.lineWidth = 1;
  const step = 11 * sy;
  for (let y = groundY - goalH + 8; y < groundY - 6; y += step) {
    ctx.beginPath();
    ctx.moveTo(left + 3, y);
    ctx.lineTo(left + w - 3, y);
    ctx.stroke();
  }
  for (let x = left + 6; x < left + w - 4; x += 9 * sx) {
    ctx.beginPath();
    ctx.moveTo(x, groundY - goalH + 6);
    ctx.lineTo(x, groundY - 6);
    ctx.stroke();
  }
}

/**
 * @param {unknown} s
 * @returns {s is CanvasImageSource}
 */
function isDrawableImage(s) {
  return (
    s != null &&
    typeof s === "object" &&
    "width" in s &&
    typeof /** @type {{ width: number }} */ (s).width === "number" &&
    /** @type {{ width: number }} */ (s).width > 0
  );
}

/**
 * Sprite faces **right**. Feet sit at arena (px, py+hh); scaled to ~2*hh canvas height.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} hw
 * @param {number} hh
 * @param {number} sx
 * @param {number} sy
 * @param {object} anim
 * @param {CanvasImageSource} img
 */
function drawGoalDuelDogSprite(ctx, px, py, hw, hh, sx, sy, anim, img) {
  const facing = anim.facing >= 0 ? 1 : -1;
  const bob = anim.running ? Math.sin(anim.runPhase * Math.PI * 2) * 2 * sy : 0;
  const squash = anim.kicking ? 0.92 : anim.jumping ? 1.03 : 1;
  const stretchY = anim.jumping ? 0.92 : 1;
  const tilt = (anim.jumping ? -0.11 : anim.running ? 0.055 : 0) * facing;

  const footX = px * sx;
  const footY = (py + hh) * sy + bob;
  const targetH = 2 * hh * sy * 1.02;
  const iw = /** @type {{ width: number }} */ (img).width;
  const ih = /** @type {{ height: number }} */ (img).height;
  const ar = iw / Math.max(ih, 1);
  const dh = targetH;
  const dw = dh * ar;

  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(footX, footY + 2 * sy, Math.max(dw * 0.35, hw * sx * 0.95), 4 * Math.min(sx, sy), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(footX, footY);
  ctx.rotate(tilt);
  ctx.scale(facing * squash, stretchY);
  try {
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
  } catch {
    /* decode / draw race */
  }
  ctx.restore();
}

/**
 * No sprite yet: ground shadow only (no placeholder character art).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} hw
 * @param {number} hh
 * @param {number} sx
 * @param {number} sy
 */
function drawGoalDuelDogPlaceholder(ctx, px, py, hw, hh, sx, sy) {
  const footX = px * sx;
  const footY = (py + hh) * sy;
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.ellipse(footX, footY + 2 * sy, hw * sx * 1.15, 3.5 * Math.min(sx, sy), 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} hw
 * @param {number} hh
 * @param {number} sx
 * @param {number} sy
 * @param {GoalDuelDogPalette} _palette
 * @param {object} anim
 * @param {number} anim.facing
 * @param {boolean} anim.jumping
 * @param {boolean} anim.running
 * @param {boolean} anim.kicking
 * @param {number} anim.runPhase
 * @param {{ variant?: 'star'|'rival', sprite?: CanvasImageSource|null, coatImage?: CanvasImageSource|null }} [opts]
 */
export function drawGoalDuelDog(ctx, px, py, hw, hh, sx, sy, _palette, anim, opts = {}) {
  const sprite = opts.sprite ?? opts.coatImage ?? null;
  if (isDrawableImage(sprite)) {
    drawGoalDuelDogSprite(ctx, px, py, hw, hh, sx, sy, anim, /** @type {CanvasImageSource} */ (sprite));
    return;
  }
  drawGoalDuelDogPlaceholder(ctx, px, py, hw, hh, sx, sy);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} bx
 * @param {number} by
 * @param {number} br
 * @param {number} sx
 * @param {number} sy
 * @param {number} vx
 * @param {number} vy
 * @param {{ sprite?: CanvasImageSource|null }} [opts]
 */
export function drawGoalDuelTennisBall(ctx, bx, by, br, sx, sy, vx, vy, opts = {}) {
  const cx = bx * sx;
  const cy = by * sy;
  const r = br * Math.min(sx, sy);
  const speed = Math.hypot(vx, vy);
  const ang = Math.atan2(vy, vx);
  const blur = Math.min(1, speed / 180);
  const sprite = opts.sprite ?? null;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.14, cy + r * 0.92, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isDrawableImage(sprite)) {
    const rot = ang * 0.35 + speed * 0.0012;
    if (blur > 0.08) {
      for (let i = 2; i >= 1; i--) {
        const o = i * r * 0.18 * blur;
        ctx.fillStyle = `rgba(255,255,220,${0.04 * blur * i})`;
        ctx.beginPath();
        ctx.arc(cx - Math.cos(ang) * o * 2.2, cy - Math.sin(ang) * o * 2.2, r * 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    try {
      ctx.drawImage(/** @type {CanvasImageSource} */ (sprite), -r * 1.08, -r * 1.08, r * 2.16, r * 2.16);
    } catch {
      /* decode race */
    }
    ctx.restore();
    if (speed > 40) {
      ctx.strokeStyle = `rgba(255,255,200,${0.12 + Math.min(0.3, speed / 400)})`;
      ctx.lineWidth = r * 0.45;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(ang) * r * 2.2, cy - Math.sin(ang) * r * 2.2);
      ctx.lineTo(cx - Math.cos(ang) * r * (2.9 + blur * 1.8), cy - Math.sin(ang) * r * (2.9 + blur * 1.8));
      ctx.stroke();
    }
    return;
  }

  if (blur > 0.08) {
    for (let i = 3; i >= 1; i--) {
      const o = i * r * 0.22 * blur;
      ctx.fillStyle = `rgba(200,220,80,${0.06 * blur * i})`;
      ctx.beginPath();
      ctx.arc(cx - Math.cos(ang) * o * 2, cy - Math.sin(ang) * o * 2, r * (0.92 + blur * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.18, cy + r * 0.95, r * 1.15, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  const ballGrad = ctx.createRadialGradient(cx - r * 0.42, cy - r * 0.42, r * 0.05, cx + r * 0.08, cy + r * 0.12, r * 1.15);
  ballGrad.addColorStop(0, "#ffffcc");
  ballGrad.addColorStop(0.35, "#e8f040");
  ballGrad.addColorStop(0.7, "#b8c818");
  ballGrad.addColorStop(1, "#5a7010");
  ctx.fillStyle = ballGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.96, 0, Math.PI * 2);
  ctx.clip();
  const fuzzA = (ang + speed * 0.002) % (Math.PI * 2);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + fuzzA;
    const len = r * (0.08 + (i % 5) * 0.015);
    ctx.strokeStyle = `rgba(90,110,20,${0.12 + (i % 3) * 0.04})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75);
    ctx.lineTo(cx + Math.cos(a) * (r * 0.75 + len), cy + Math.sin(a) * (r * 0.75 + len));
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, -0.25 + ang * 0.15, 1.35 + ang * 0.15);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.35, r * 0.55, 0.2, 1.1);
  ctx.stroke();

  if (speed > 40) {
    ctx.strokeStyle = `rgba(255,255,200,${0.15 + Math.min(0.35, speed / 400)})`;
    ctx.lineWidth = r * 0.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * r * 2.4, cy - Math.sin(ang) * r * 2.4);
    ctx.lineTo(cx - Math.cos(ang) * r * (3.2 + blur * 2), cy - Math.sin(ang) * r * (3.2 + blur * 2));
    ctx.stroke();
  }
}

/**
 * @param {number} px
 * @param {number} py
 * @param {number} hh
 * @param {number} groundY
 */
export function inferDogJumping(px, py, hh, groundY) {
  const feet = py + hh;
  return feet < groundY - 4;
}

/**
 * @param {PrevFrame|null} prev
 * @param {number} px
 * @param {number} py
 * @param {"p0"|"p1"} seat
 * @param {number} dtSec
 */
export function inferDogMotion(prev, px, py, seat, dtSec) {
  /** p0 default faces +x (right); p1 default faces −x (left toward play). Must match server `face` at rest. */
  const idleFacing = seat === "p1" ? -1 : 1;
  if (!prev || dtSec <= 0) return { facing: idleFacing, running: false, vx: 0 };
  const opx = seat === "p0" ? prev.p0x : prev.p1x;
  const vx = (px - opx) / dtSec;
  const running = Math.abs(vx) > 8;
  const facing = Math.abs(vx) < 2 ? idleFacing : vx >= 0 ? 1 : -1;
  return { facing, running, vx };
}
