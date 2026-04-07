/**
 * Goal Duel — canvas presentation only (no physics / RPC changes).
 *
 * ART DIRECTION: “MLEO Park” mini-stadium — sunset arcade, dog-park turf, proper goals,
 * readable tennis ball with fuzz + seam. Both seats use the **same hero-dog build** (fair
 * hitbox); seat 0 = home kit, seat 1 = away kit (cooler + bandana). Tune palettes to your
 * dog’s real coat colors.
 *
 * REFERENCE COAT: pass `opts.coatImage` (loaded HTMLImageElement / ImageBitmap). Optional
 * static file: place `public/images/goal-duel/mleo-coat.png` — Ov2GoalDuelScreen loads it.
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

  const sky = ctx.createLinearGradient(0, 0, W, horizon);
  sky.addColorStop(0, "#1e0f3d");
  sky.addColorStop(0.35, "#4a2d7a");
  sky.addColorStop(0.62, "#c45c2a");
  sky.addColorStop(0.88, "#f4a84a");
  sky.addColorStop(1, "#ffd8a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);

  const sunG = ctx.createRadialGradient(W * 0.78, horizon * 0.55, 0, W * 0.78, horizon * 0.55, W * 0.35);
  sunG.addColorStop(0, "rgba(255,220,140,0.55)");
  sunG.addColorStop(0.5, "rgba(255,160,80,0.12)");
  sunG.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = sunG;
  ctx.fillRect(0, 0, W, horizon);

  ctx.fillStyle = "rgba(15,8,35,0.55)";
  ctx.beginPath();
  ctx.moveTo(0, horizon * 0.92);
  for (let i = 0; i <= 24; i++) {
    const x = (i / 24) * W;
    const y = horizon * 0.88 + Math.sin(i * 0.7) * 3 * sy + (i % 3) * 2;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, horizon);
  ctx.lineTo(0, horizon);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 6; i++) {
    const lx = (0.08 + i * 0.17) * W;
    const cone = ctx.createLinearGradient(lx - 30, 0, lx, horizon);
    cone.addColorStop(0, "rgba(255,255,200,0.08)");
    cone.addColorStop(1, "rgba(255,255,220,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lx - 25 * sx, 0);
    ctx.lineTo(lx + 25 * sx, 0);
    ctx.lineTo(lx + 80 * sx, horizon * 0.95);
    ctx.lineTo(lx - 80 * sx, horizon * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,250,220,0.85)";
    ctx.beginPath();
    ctx.arc(lx, horizon * 0.08, 4 * sx, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(12,10,22,0.75)";
  const crowdH = 14 * sy;
  ctx.fillRect(0, horizon - crowdH, W, crowdH);
  for (let x = 4; x < W; x += 5) {
    const h = 3 + (x % 7);
    ctx.fillStyle = `rgba(${120 + (x % 40)},${90 + (x % 30)},${140 + (x % 50)},0.35)`;
    ctx.fillRect(x, horizon - crowdH - h, 3, h);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  const fenceY = groundY * 0.48;
  for (let x = 0; x < W; x += 28 * sx) {
    ctx.beginPath();
    ctx.moveTo(x, fenceY - 20 * sy);
    ctx.lineTo(x, fenceY);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, fenceY - 8 * sy);
  ctx.lineTo(W, fenceY - 8 * sy);
  ctx.stroke();

  const grassTop = groundY * 0.5;
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
  const fieldTop = 78 * sy;
  const fieldW = fieldRight - fieldLeft;
  const fieldH = groundY - fieldTop;

  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.shadowColor = "rgba(255,255,255,0.15)";
  ctx.shadowBlur = 4;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(fieldLeft + 1, fieldTop + 1, fieldW - 2, fieldH - 2);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.lineWidth = 2;
  ctx.setLineDash([12 * sx, 10 * sx]);
  ctx.beginPath();
  ctx.moveTo((aw / 2) * sx, fieldTop);
  ctx.lineTo((aw / 2) * sx, groundY);
  ctx.stroke();
  ctx.setLineDash([]);

  const midX = (aw / 2) * sx;
  const midCy = fieldTop + fieldH * 0.5;
  const circleR = Math.min(48 * sx, 40 * sy);
  ctx.strokeStyle = "rgba(255,255,255,0.36)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(midX, midCy, circleR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(midX, midCy, 3 * sx, 0, Math.PI * 2);
  ctx.fill();

  const spotY = groundY - 4 * sy;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(midX, spotY + 2 * sy, fieldW * 0.42, 5 * sy, 0, 0, Math.PI * 2);
  ctx.fill();

  drawStadiumGoal(ctx, fieldLeft, groundY, 132 * sy, sx, sy, "left");
  drawStadiumGoal(ctx, fieldRight, groundY, 132 * sy, sx, sy, "right");

  ctx.fillStyle = "rgba(255,200,100,0.08)";
  ctx.fillRect(fieldLeft + fieldW * 0.15, fieldTop + 4, fieldW * 0.7, 10 * sy);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.font = `bold ${Math.max(8, 9 * sx)}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("MLEO PARK — TENNIS CUP", midX, fieldTop + 10 * sy);

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
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} r
 */
function roundRect(ctx, x0, y0, x1, y1, r) {
  const w = x1 - x0;
  const h = y1 - y0;
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x0 + rr, y0);
  ctx.lineTo(x1 - rr, y0);
  ctx.quadraticCurveTo(x1, y0, x1, y0 + rr);
  ctx.lineTo(x1, y1 - rr);
  ctx.quadraticCurveTo(x1, y1, x1 - rr, y1);
  ctx.lineTo(x0 + rr, y1);
  ctx.quadraticCurveTo(x0, y1, x0, y1 - rr);
  ctx.lineTo(x0, y0 + rr);
  ctx.quadraticCurveTo(x0, y0, x0 + rr, y0);
  ctx.closePath();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} px
 * @param {number} py
 * @param {number} hw
 * @param {number} hh
 * @param {number} sx
 * @param {number} sy
 * @param {GoalDuelDogPalette} palette
 * @param {object} anim
 * @param {number} anim.facing
 * @param {boolean} anim.jumping
 * @param {boolean} anim.running
 * @param {boolean} anim.kicking
 * @param {number} anim.runPhase
 * @param {{ variant?: 'star'|'rival', coatImage?: CanvasImageSource|null }} [opts]
 */
export function drawGoalDuelDog(ctx, px, py, hw, hh, sx, sy, palette, anim, opts = {}) {
  const variant = opts.variant === "rival" ? "rival" : "star";
  const coat = opts.coatImage ?? null;

  const cx = px * sx;
  const cy = py * sy;
  const w = hw * sx;
  const h = hh * sy;
  const facing = anim.facing >= 0 ? 1 : -1;
  const m = Math.min(sx, sy);

  const squash = anim.kicking ? 0.9 : anim.jumping ? 1.04 : 1;
  const stretchY = anim.jumping ? 0.9 : 1;
  const bodyTilt = anim.jumping ? -0.14 : anim.running ? 0.06 : 0;
  const bob = anim.running ? Math.sin(anim.runPhase * Math.PI * 2) * 2 * sy : 0;

  const legSwing = anim.running ? Math.sin(anim.runPhase * Math.PI * 2) : 0;
  const kickLift = anim.kicking ? 1 : 0;

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.rotate(bodyTilt * facing);
  ctx.scale(facing * squash, stretchY);

  const feetY = h * 0.42;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, feetY + 2 * sy, w * 1.1, 4 * sy, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyOx = -w * 0.08;
  const bodyOy = -h * 0.02;
  const bodyRx = w * 0.95;
  const bodyRy = h * 0.38;

  const backThigh = legSwing * 0.45;
  const frontThigh = -legSwing * 0.45;
  const legW = 7 * m;
  const legLen = h * 0.5;

  function drawLeg(ax, topY, thigh, isFront) {
    const tuck = anim.jumping ? (isFront ? -0.25 : 0.15) : 0;
    const kick = isFront && kickLift ? 0.85 : 0;
    const lx = ax + thigh * w * 0.35;
    const ly = topY + tuck * h;
    roundRect(ctx, lx - legW / 2, ly, lx + legW / 2, ly + legLen * (1 - kick * 0.35), legW * 0.35);
    ctx.fillStyle = palette.bodyDark;
    ctx.fill();
    ctx.fillStyle = palette.sock;
    ctx.globalAlpha = variant === "star" ? 0.92 : 0.8;
    roundRect(ctx, lx - legW / 2, ly + legLen * 0.58, lx + legW / 2, ly + legLen, legW * 0.3);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.bodyDark;
    ctx.beginPath();
    ctx.ellipse(lx, ly + legLen + 1 * sy, legW * 0.55, 3 * m, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tailWave = anim.jumping ? -0.9 : anim.running ? 0.65 : 0.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.bodyDark;
  ctx.lineWidth = 6 * m;
  ctx.beginPath();
  ctx.moveTo(bodyOx - bodyRx * 0.85, bodyOy);
  ctx.bezierCurveTo(
    bodyOx - bodyRx * 1.45 - h * tailWave,
    bodyOy - h * 0.25,
    bodyOx - bodyRx * 1.2,
    bodyOy - h * 0.55,
    bodyOx - bodyRx * 0.75,
    bodyOy - h * 0.72
  );
  ctx.stroke();
  ctx.strokeStyle = palette.tailTip || "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3 * m;
  ctx.beginPath();
  ctx.moveTo(bodyOx - bodyRx * 0.78, bodyOy - h * 0.02);
  ctx.quadraticCurveTo(bodyOx - bodyRx * 1.15 - h * tailWave * 0.8, bodyOy - h * 0.35, bodyOx - bodyRx * 0.72, bodyOy - h * 0.58);
  ctx.stroke();

  const grd = ctx.createLinearGradient(bodyOx - bodyRx, bodyOy - bodyRy, bodyOx + bodyRx * 1.1, bodyOy + bodyRy);
  grd.addColorStop(0, palette.bodyLight);
  grd.addColorStop(0.45, palette.body);
  grd.addColorStop(1, palette.bodyDark);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.ellipse(bodyOx, bodyOy, bodyRx, bodyRy, -0.06, 0, Math.PI * 2);
  ctx.fill();

  if (coat && typeof coat === "object" && "width" in coat && /** @type {{ width: number }} */ (coat).width > 0) {
    try {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(bodyOx, bodyOy, bodyRx * 0.9, bodyRy * 0.88, -0.06, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = variant === "rival" ? 0.5 : 0.78;
      ctx.drawImage(/** @type {CanvasImageSource} */ (coat), bodyOx - bodyRx * 1.05, bodyOy - bodyRy * 1.1, bodyRx * 2.2, bodyRy * 2.3);
      ctx.globalAlpha = 1;
      ctx.restore();
    } catch {
      /* optional */
    }
  } else if (palette.brindle) {
    ctx.strokeStyle = palette.brindle;
    ctx.lineWidth = 1.2 * m;
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      ctx.beginPath();
      ctx.moveTo(bodyOx - bodyRx * 0.7 + t * bodyRx * 0.5, bodyOy - bodyRy * 0.5);
      ctx.quadraticCurveTo(bodyOx - bodyRx * 0.2 + t * bodyRx * 0.3, bodyOy + bodyRy * 0.1, bodyOx + bodyRx * 0.2, bodyOy + bodyRy * 0.45);
      ctx.stroke();
    }
  }

  ctx.fillStyle = palette.chestBlaze;
  ctx.beginPath();
  ctx.ellipse(bodyOx + bodyRx * 0.32, bodyOy + bodyRy * 0.12, bodyRx * 0.42, bodyRy * 0.58, 0.12, 0, Math.PI * 2);
  ctx.fill();

  const neckX = bodyOx + bodyRx * 0.72;
  const neckY = bodyOy - bodyRy * 0.35;
  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.ellipse(neckX, neckY, w * 0.22, h * 0.2, 0.35, 0, Math.PI * 2);
  ctx.fill();

  const hx = bodyOx + bodyRx * 1.05;
  const hy = bodyOy - bodyRy * 0.35;
  const headR = h * 0.34;

  ctx.fillStyle = palette.bodyLight;
  ctx.beginPath();
  ctx.ellipse(hx, hy, headR * 1.05, headR * 0.95, 0.08, 0, Math.PI * 2);
  ctx.fill();

  if (palette.muzzleMask) {
    ctx.fillStyle = palette.muzzleMask;
    ctx.beginPath();
    ctx.ellipse(hx + headR * 0.35, hy + headR * 0.12, headR * 0.5, headR * 0.38, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = palette.ear;
  ctx.beginPath();
  ctx.moveTo(hx - headR * 0.15, hy - headR * 0.65);
  ctx.bezierCurveTo(hx - headR * 0.75, hy - headR * 1.05, hx - headR * 0.55, hy - headR * 0.15, hx - headR * 0.12, hy - headR * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + headR * 0.25, hy - headR * 0.55);
  ctx.bezierCurveTo(hx + headR * 0.72, hy - headR * 0.95, hx + headR * 0.68, hy - headR * 0.2, hx + headR * 0.38, hy - headR * 0.12);
  ctx.closePath();
  ctx.fill();

  const snoutX = hx + headR * 0.72;
  const snoutY = hy + headR * 0.14;
  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.ellipse(snoutX, snoutY, headR * 0.48, headR * 0.32, 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.nose;
  ctx.beginPath();
  ctx.ellipse(snoutX + headR * 0.32, snoutY + headR * 0.04, headR * 0.12, headR * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.8 * m;
  ctx.beginPath();
  ctx.moveTo(snoutX + headR * 0.15, snoutY + headR * 0.22);
  ctx.quadraticCurveTo(snoutX, snoutY + headR * 0.32, snoutX - headR * 0.2, snoutY + headR * 0.2);
  ctx.stroke();

  const eyeGleam = variant === "rival" ? "rgba(180,220,255,0.75)" : "rgba(255,255,255,0.9)";
  ctx.fillStyle = "rgba(15,10,8,0.92)";
  ctx.beginPath();
  ctx.ellipse(hx + headR * 0.32, hy - headR * 0.08, headR * 0.11, headR * 0.13, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eyeGleam;
  ctx.beginPath();
  ctx.arc(hx + headR * 0.36, hy - headR * 0.11, headR * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1 * m;
  ctx.beginPath();
  ctx.moveTo(hx + headR * 0.08, hy - headR * 0.28);
  ctx.quadraticCurveTo(hx + headR * 0.35, hy - headR * 0.32, hx + headR * 0.55, hy - headR * 0.22);
  ctx.stroke();

  ctx.fillStyle = palette.collar;
  const colL = bodyOx + bodyRx * 0.05;
  const colT = bodyOy - bodyRy * 0.52;
  roundRect(ctx, colL, colT, colL + w * 0.38, colT + h * 0.09, 4 * m);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(bodyOx + bodyRx * 0.28, bodyOy - bodyRy * 0.48, 2 * m, 0, Math.PI * 2);
  ctx.fill();

  if (variant === "rival" && "bandana" in palette && palette.bandana) {
    ctx.fillStyle = palette.bandana;
    ctx.beginPath();
    ctx.moveTo(hx - headR * 0.1, hy + headR * 0.35);
    ctx.lineTo(hx + headR * 0.5, hy + headR * 0.42);
    ctx.lineTo(hx + headR * 0.25, hy + headR * 0.62);
    ctx.closePath();
    ctx.fill();
  }

  drawLeg(bodyOx - bodyRx * 0.32, bodyOy + bodyRy * 0.22, backThigh, false);
  drawLeg(bodyOx + bodyRx * 0.12, bodyOy + bodyRy * 0.3, frontThigh + kickLift * 0.5, true);

  ctx.restore();
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
 */
export function drawGoalDuelTennisBall(ctx, bx, by, br, sx, sy, vx, vy) {
  const cx = bx * sx;
  const cy = by * sy;
  const r = br * Math.min(sx, sy);
  const speed = Math.hypot(vx, vy);
  const ang = Math.atan2(vy, vx);

  const blur = Math.min(1, speed / 180);
  if (blur > 0.08) {
    for (let i = 3; i >= 1; i--) {
      const o = i * r * 0.22 * blur;
      ctx.fillStyle = `rgba(200,220,80,${0.06 * blur * i})`;
      ctx.beginPath();
      ctx.arc(cx - Math.cos(ang) * o * 2, cy - Math.sin(ang) * o * 2, r * (0.92 + blur * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.14, cy + r * 0.92, r * 1.05, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
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
  if (!prev || dtSec <= 0) return { facing: 1, running: false, vx: 0 };
  const opx = seat === "p0" ? prev.p0x : prev.p1x;
  const vx = (px - opx) / dtSec;
  const running = Math.abs(vx) > 8;
  const facing = Math.abs(vx) < 2 ? 1 : vx >= 0 ? 1 : -1;
  return { facing, running, vx };
}
