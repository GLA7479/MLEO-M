"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * @param {{
 *   snapshot: object | null,
 *   aimAngleDeg?: number,
 *   mySeat?: number | null,
 *   isMyTurn?: boolean,
 *   activeTurnSeat?: number | null,
 *   className?: string,
 * }} props
 */
export default function Ov2TanksBattleCanvas({
  snapshot,
  aimAngleDeg = 55,
  mySeat = null,
  isMyTurn = false,
  activeTurnSeat = null,
  className,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const pub = snapshot?.public;
    const samples = pub && Array.isArray(pub.samples) ? pub.samples : null;
    const mapW = pub && Number.isFinite(Number(pub.mapW)) ? Number(pub.mapW) : 960;
    const mapH = pub && Number.isFinite(Number(pub.mapH)) ? Number(pub.mapH) : 540;
    const tanks = pub && Array.isArray(pub.tanks) ? pub.tanks : [];

    const availW = Math.max(1, wrap.clientWidth || 320);
    const availH = Math.max(1, wrap.clientHeight || Math.round((availW * mapH) / mapW));
    /** Cover: fill the battle panel so there is no empty band under the canvas. */
    const scale = Math.max(availW / mapW, availH / mapH);
    const cssW = Math.max(160, Math.round(mapW * scale));
    const cssH = Math.round(mapH * scale);
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const mobileBoost = availW < 480 ? 1.12 : 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    /** Vertical camera: stretch combat band so the frame is not mostly empty sky/soil. */
    const viewY0 = mapH * 0.08;
    const viewY1 = mapH * 0.92;
    const viewH = Math.max(1, viewY1 - viewY0);
    const sx = x => (Number(x) / mapW) * cssW;
    const sy = y => {
      const t = (Number(y) - viewY0) / viewH;
      return Math.min(cssH, Math.max(0, t * cssH));
    };
    const px = (n, axis) => (axis === "x" ? (n / mapW) * cssW : (n / viewH) * cssH);

    const skyTop = ctx.createLinearGradient(0, 0, 0, cssH * 0.55);
    skyTop.addColorStop(0, "#152238");
    skyTop.addColorStop(0.4, "#1e2f4a");
    skyTop.addColorStop(1, "#0c1424");
    ctx.fillStyle = skyTop;
    ctx.fillRect(0, 0, cssW, cssH * 0.58);

    const haze = ctx.createLinearGradient(0, cssH * 0.32, 0, cssH);
    haze.addColorStop(0, "rgba(15,23,42,0)");
    haze.addColorStop(1, "rgba(6,10,20,0.94)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, cssH * 0.32, cssW, cssH * 0.68);

    ctx.fillStyle = "rgba(24,36,58,0.5)";
    ctx.fillRect(0, sy(mapH * 0.2), cssW, sy(mapH * 0.4) - sy(mapH * 0.2));

    ctx.fillStyle = "rgba(226,232,240,0.28)";
    for (let s = 0; s < 48; s += 1) {
      const sx0 = ((s * 97 + 13) % 1000) / 1000;
      const sy0 = ((s * 53 + 7) % 600) / 1000;
      if (sy0 > 0.34) continue;
      ctx.fillRect(sx0 * cssW, sy0 * cssH * 0.48, 1.4, 1.4);
    }

    if (!samples || samples.length < 2) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px system-ui,sans-serif";
      ctx.fillText("No terrain", 12, 22);
      return;
    }

    const n = samples.length;
    /** @type {{x:number,y:number}[]} */
    const ridge = [];
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1)) * mapW;
      const y = Number(samples[i]);
      ridge.push({ x, y: Number.isFinite(y) ? y : mapH * 0.55 });
    }

    function terrainYAt(worldX) {
      const t = (worldX / mapW) * (n - 1);
      if (t <= 0) return ridge[0].y;
      if (t >= n - 1) return ridge[n - 1].y;
      const i0 = Math.floor(t);
      const i1 = Math.min(i0 + 1, n - 1);
      const f = t - i0;
      return ridge[i0].y * (1 - f) + ridge[i1].y * f;
    }

    ctx.beginPath();
    ctx.moveTo(0, cssH);
    for (let i = 0; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y) + px(6 * mobileBoost, "y"));
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, cssH);
    for (let i = 0; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y));
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    const soil = ctx.createLinearGradient(0, sy(mapH * 0.32), 0, cssH);
    soil.addColorStop(0, "#6b5340");
    soil.addColorStop(0.25, "#4d3f2e");
    soil.addColorStop(0.55, "#352a1f");
    soil.addColorStop(1, "#14110c");
    ctx.fillStyle = soil;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx(ridge[0].x), sy(ridge[0].y));
    for (let i = 1; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y));
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y) + px(12 * mobileBoost, "y"));
    }
    ctx.closePath();
    const grass = ctx.createLinearGradient(0, 0, 0, cssH);
    grass.addColorStop(0, "rgba(72,140,82,0.65)");
    grass.addColorStop(0.35, "rgba(48,110,58,0.45)");
    grass.addColorStop(1, "rgba(48,110,58,0)");
    ctx.fillStyle = grass;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx(ridge[0].x), sy(ridge[0].y));
    for (let i = 1; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y));
    }
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = Math.max(2, 2.2 * mobileBoost);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1.25;
    ctx.stroke();

    for (let gi = 0; gi < 5; gi += 1) {
      const gx = ((gi + 1) / 6) * cssW;
      ctx.strokeStyle = "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, sy(mapH * 0.15));
      ctx.lineTo(gx, cssH);
      ctx.stroke();
    }

    const parity = snapshot?.parity && typeof snapshot.parity === "object" ? snapshot.parity : {};
    const activePk = String(parity.activeParticipantKey || "").trim();
    const parts = Array.isArray(parity.participants) ? parity.participants : [];
    const pk0 = String(parts[0] || "").trim();
    const pk1 = String(parts[1] || "").trim();
    const phase = String(snapshot?.phase || "");
    const serverNow = Number(snapshot?.serverNowMs) || 0;

    /** @type {{seat:number,x:number,y:number}|null} */
    let other = null;
    for (let ti = 0; ti < tanks.length; ti += 1) {
      const t = tanks[ti];
      const seat = Number(t?.seat);
      const tx = Number(t?.x);
      const ty = Number(t?.y);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
      if (mySeat != null && seat !== mySeat && Number.isInteger(seat)) {
        other = { seat, x: tx, y: ty };
        break;
      }
    }
    if (!other && tanks.length >= 2) {
      const t0 = tanks[0];
      const t1 = tanks[1];
      if (mySeat === 0 && t1) other = { seat: 1, x: Number(t1.x), y: Number(t1.y) };
      else if (mySeat === 1 && t0) other = { seat: 0, x: Number(t0.x), y: Number(t0.y) };
      else if (t0 && t1) other = { seat: 1, x: Number(t1.x), y: Number(t1.y) };
    }

    const last = parity.lastEvent;
    let impactX = NaN;
    let impactY = NaN;
    let lastKind = "";
    if (last && typeof last === "object" && last.impact && typeof last.impact === "object") {
      impactX = Number(last.impact.x);
      impactY = Number(last.impact.y);
      lastKind = String(last.kind || "");
    }
    const lastAt = last && typeof last === "object" ? Number(last.at) : 0;
    const shotFresh = serverNow > 0 && lastAt > 0 && serverNow - lastAt < 4000;

    /** Heuristic: shooter is the tank farther horizontally from impact (cross-map shot reads clearly). */
    function pickShooterSeatForTracer() {
      if (!Number.isFinite(impactX)) return null;
      const placed = tanks
        .map(t => ({
          seat: Number(t?.seat),
          x: Number(t?.x),
          y: Number(t?.y),
        }))
        .filter(t => (t.seat === 0 || t.seat === 1) && Number.isFinite(t.x) && Number.isFinite(t.y));
      if (placed.length < 2) return placed[0]?.seat ?? null;
      const [a, b] = placed[0].x < placed[1].x ? [placed[0], placed[1]] : [placed[1], placed[0]];
      const da = Math.abs(a.x - impactX);
      const db = Math.abs(b.x - impactX);
      return da >= db ? a.seat : b.seat;
    }

    function fillRoundRect(x, y, w, h, r) {
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
      }
    }

    function barrelVector(tx, ty, seat) {
      const pkSeat = seat === 0 ? pk0 : pk1;
      const isActiveSeat = Boolean(activePk && pkSeat === activePk);
      const hullW = Math.max(34, px(40, "x") * mobileBoost);
      const hullH = Math.max(14, px(18, "y") * mobileBoost);
      const turretY = -hullH * 0.55;
      const barrelLen = Math.max(28, px(48, "x") * mobileBoost);
      let bx = 0;
      let by = 0;
      if (phase === "playing" && isActiveSeat && isMyTurn && mySeat === seat && Number.isFinite(aimAngleDeg)) {
        const ar = (aimAngleDeg * Math.PI) / 180;
        bx = Math.cos(ar) * barrelLen;
        by = -Math.sin(ar) * barrelLen;
      } else if (other && Number.isFinite(other.x) && Number.isFinite(other.y)) {
        const dx = other.x - tx;
        const dy = other.y - ty;
        const len = Math.hypot(dx, dy) || 1;
        bx = (dx / len) * barrelLen;
        by = (dy / len) * barrelLen;
      } else {
        bx = seat === 0 ? barrelLen * 0.85 : -barrelLen * 0.85;
        by = -barrelLen * 0.2;
      }
      return { turretY, bx, by, barrelLen };
    }

    if (Number.isFinite(impactX) && Number.isFinite(impactY) && phase === "playing") {
      const shooterSeat = pickShooterSeatForTracer();
      const st = tanks.find(t => Number(t?.seat) === shooterSeat);
      if (st) {
        const tx = Number(st.x);
        const ty = Number(st.y);
        const { turretY, bx, by, barrelLen } = barrelVector(tx, ty, shooterSeat);
        const cx = sx(tx);
        const cy = sy(ty);
        const mzx = cx + (bx / barrelLen) * (barrelLen + px(8, "x"));
        const mzy = cy + turretY + (by / barrelLen) * (barrelLen + px(5, "y"));
        const ix = sx(impactX);
        const iy = sy(impactY);
        const mx = (mzx + ix) / 2;
        const lift = Math.min(cssH * 0.22, Math.abs(ix - mzx) * 0.35 + px(40, "y"));
        const my = Math.min(mzy, iy) - lift;

        ctx.save();
        ctx.globalAlpha = shotFresh ? 0.95 : 0.42;
        ctx.strokeStyle = lastKind === "miss_oob" ? "rgba(148,163,184,0.9)" : "rgba(251,191,36,0.95)";
        ctx.lineWidth = shotFresh ? 4 : 2.5;
        ctx.lineCap = "round";
        ctx.shadowColor = lastKind === "miss_oob" ? "rgba(148,163,184,0.6)" : "rgba(251,191,36,0.55)";
        ctx.shadowBlur = shotFresh ? 14 : 6;
        ctx.beginPath();
        ctx.moveTo(mzx, mzy);
        ctx.quadraticCurveTo(mx, my, ix, iy);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([7, 5]);
        ctx.globalAlpha = shotFresh ? 0.55 : 0.28;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mzx, mzy);
        ctx.quadraticCurveTo(mx, my, ix, iy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        const steps = 10;
        for (let s = 0; s <= steps; s += 1) {
          const u = s / steps;
          const ox = (1 - u) * (1 - u) * mzx + 2 * (1 - u) * u * mx + u * u * ix;
          const oy = (1 - u) * (1 - u) * mzy + 2 * (1 - u) * u * my + u * u * iy;
          ctx.fillStyle = lastKind === "miss_oob" ? "rgba(226,232,240,0.45)" : "rgba(254,215,170,0.75)";
          ctx.beginPath();
          ctx.arc(ox, oy, shotFresh ? 2.2 : 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const tyGround = terrainYAt(impactX);
      const pyG = sy(tyGround);
      const pxI = sx(impactX);
      const craterRx = Math.max(14, px(22, "x") * mobileBoost);
      const craterRy = Math.max(5, px(9, "y") * mobileBoost);
      ctx.save();
      ctx.translate(pxI, pyG);
      ctx.scale(1, 0.55);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, px(4, "y"), craterRx * 1.1, craterRy * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(20,14,8,0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 0, craterRx, craterRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(250,204,21,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    const resolvedActiveSeat =
      activeTurnSeat === 0 || activeTurnSeat === 1
        ? activeTurnSeat
        : activePk && pk0 && activePk === pk0
          ? 0
          : activePk && pk1 && activePk === pk1
            ? 1
            : null;

    function drawTank(tx, ty, seat) {
      const cx = sx(tx);
      const cy = sy(ty);
      const hullW = Math.max(38, px(44, "x") * mobileBoost);
      const hullH = Math.max(16, px(20, "y") * mobileBoost);
      const treadH = Math.max(6, px(8, "y") * mobileBoost);
      const colHull = seat === 0 ? "#4f8cff" : "#ff7a33";
      const colHullDark = seat === 0 ? "#1e3a8a" : "#9a3412";
      const colTread = "#0f0d0b";

      const pkSeat = seat === 0 ? pk0 : pk1;
      const isActiveSeat = Boolean(activePk && pkSeat === activePk);
      const isMySeat = mySeat != null && seat === mySeat;
      const turretY = -hullH * 0.55;
      const barrelLen = Math.max(30, px(52, "x") * mobileBoost);

      let bx = 0;
      let by = 0;
      if (phase === "playing" && isActiveSeat && isMyTurn && isMySeat && Number.isFinite(aimAngleDeg)) {
        const ar = (aimAngleDeg * Math.PI) / 180;
        bx = Math.cos(ar) * barrelLen;
        by = -Math.sin(ar) * barrelLen;
      } else if (other && Number.isFinite(other.x) && Number.isFinite(other.y)) {
        const dx = other.x - tx;
        const dy = other.y - ty;
        const len = Math.hypot(dx, dy) || 1;
        bx = (dx / len) * barrelLen;
        by = (dy / len) * barrelLen;
      } else {
        bx = seat === 0 ? barrelLen * 0.85 : -barrelLen * 0.85;
        by = -barrelLen * 0.2;
      }

      const inactiveDim = phase === "playing" && resolvedActiveSeat != null && seat !== resolvedActiveSeat;

      ctx.save();
      ctx.translate(cx, cy);

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, hullH * 0.35, hullW * 0.62, px(10, "y"), 0, 0, Math.PI * 2);
      ctx.fill();

      if (phase === "playing" && isActiveSeat) {
        const pulse = shotFresh ? 1 : 0.65 + 0.12 * Math.sin(Date.now() / 420);
        ctx.strokeStyle =
          isMySeat && isMyTurn ? "rgba(52,211,153,0.85)" : "rgba(251,191,36,0.88)";
        ctx.lineWidth = 3 + pulse * 2;
        ctx.beginPath();
        ctx.arc(0, -hullH * 0.35, hullW * 0.85 + pulse * px(6, "x"), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, -hullH * 0.35, hullW * 0.92 + pulse * px(8, "x"), 0, Math.PI * 2);
        ctx.stroke();
      }

      if (inactiveDim) {
        ctx.globalAlpha = 0.52;
      }

      ctx.fillStyle = colTread;
      ctx.fillRect(-hullW * 0.52, hullH * 0.1, hullW * 1.04, treadH);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-hullW * 0.52, hullH * 0.1, hullW * 1.04, treadH);

      const hg = ctx.createLinearGradient(-hullW * 0.5, -hullH, hullW * 0.5, hullH * 0.2);
      hg.addColorStop(0, colHull);
      hg.addColorStop(1, colHullDark);
      ctx.fillStyle = hg;
      fillRoundRect(-hullW * 0.5, -hullH * 0.85, hullW, hullH, 6);
      ctx.strokeStyle = inactiveDim ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.55)";
      ctx.lineWidth = inactiveDim ? 1 : 2;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(-hullW * 0.5, -hullH * 0.85, hullW, hullH, 6);
        ctx.stroke();
      } else {
        ctx.strokeRect(-hullW * 0.5, -hullH * 0.85, hullW, hullH);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(-hullW * 0.5 - 0.5, -hullH * 0.85 + 0.5, hullW + 1, hullH + 0.5, 6);
        ctx.stroke();
      }

      const tr = Math.min(hullW, hullH) * 0.3;
      ctx.beginPath();
      ctx.arc(0, turretY, tr, 0, Math.PI * 2);
      ctx.fillStyle = inactiveDim ? "#475569" : "#1e293b";
      ctx.fill();
      ctx.strokeStyle = inactiveDim ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const boreOuter = inactiveDim ? 4.5 : 6.5;
      const boreInner = inactiveDim ? 2.5 : 3.5;
      ctx.strokeStyle = "#020617";
      ctx.lineWidth = boreOuter;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, turretY);
      ctx.lineTo(bx, turretY + by);
      ctx.stroke();
      ctx.strokeStyle = inactiveDim ? "rgba(148,163,184,0.75)" : "rgba(248,250,252,0.95)";
      ctx.lineWidth = boreInner;
      ctx.beginPath();
      ctx.moveTo((bx / barrelLen) * 4, turretY + (by / barrelLen) * 4);
      ctx.lineTo(bx * 0.97, turretY + by * 0.97);
      ctx.stroke();

      if (isActiveSeat && isMySeat && isMyTurn && phase === "playing") {
        ctx.fillStyle = "rgba(254,240,138,0.95)";
        ctx.beginPath();
        ctx.arc(bx * 0.98, turretY + by * 0.98, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    const tankList = tanks
      .map(t => ({
        seat: Number(t?.seat),
        x: Number(t?.x),
        y: Number(t?.y),
      }))
      .filter(t => (t.seat === 0 || t.seat === 1) && Number.isFinite(t.x) && Number.isFinite(t.y));

    const activeDrawFirst = resolvedActiveSeat === 0 || resolvedActiveSeat === 1;
    const ordered = [...tankList].sort((a, b) => {
      if (!activeDrawFirst) return 0;
      if (a.seat === resolvedActiveSeat) return 1;
      if (b.seat === resolvedActiveSeat) return -1;
      return 0;
    });
    for (let ti = 0; ti < ordered.length; ti += 1) {
      const t = ordered[ti];
      drawTank(t.x, t.y, t.seat);
    }

    if (last && typeof last === "object" && last.impact && typeof last.impact === "object") {
      const ix = Number(last.impact.x);
      const iy = Number(last.impact.y);
      const kind = String(last.kind || "");
      if (Number.isFinite(ix) && Number.isFinite(iy)) {
        const px0 = sx(ix);
        const py0 = sy(iy);
        const rBase = kind === "miss_oob" ? 12 : kind === "tank_direct" ? 26 : 20;
        const pulse = shotFresh ? 1.15 : 0.85;

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = kind === "miss_oob" ? "rgba(148,163,184,0.45)" : "rgba(30,22,12,0.75)";
        ctx.beginPath();
        ctx.arc(px0, py0, rBase * 1.6 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = kind === "miss_oob" ? "rgba(226,232,240,0.65)" : "rgba(250,204,21,0.75)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px0, py0, rBase * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = kind === "miss_oob" ? "rgba(241,245,249,0.5)" : "rgba(254,243,199,0.55)";
        ctx.beginPath();
        ctx.arc(px0, py0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px0, py0, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [snapshot, aimAngleDeg, mySeat, isMyTurn, activeTurnSeat]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const id = window.setInterval(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const parity = snapshot?.parity;
      const last = parity && typeof parity === "object" ? parity.lastEvent : null;
      const at = last && typeof last === "object" ? Number(last.at) : 0;
      const serverNow = Number(snapshot?.serverNowMs) || 0;
      if (serverNow > 0 && at > 0 && serverNow - at < 4000) draw();
    }, 180);
    return () => window.clearInterval(id);
  }, [draw, snapshot]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div
      ref={wrapRef}
      className={
        className ||
        "relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-2xl border border-amber-900/25 bg-[#0b0f18] bg-gradient-to-b from-slate-900 to-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_40px_rgba(0,0,0,0.45)]"
      }
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-10 bg-gradient-to-b from-amber-500/5 to-transparent sm:h-14"
        aria-hidden
      />
      <canvas ref={canvasRef} className="relative z-[1] shrink-0" />
    </div>
  );
}
