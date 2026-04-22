"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * @param {{
 *   snapshot: object | null,
 *   aimAngleDeg?: number,
 *   mySeat?: number | null,
 *   className?: string,
 * }} props
 */
export default function Ov2TanksBattleCanvas({ snapshot, aimAngleDeg = 55, mySeat = null, className }) {
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

    const cssW = Math.max(320, wrap.clientWidth || 640);
    const cssH = Math.round((cssW * mapH) / mapW);
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const sx = x => (x / mapW) * cssW;
    const sy = y => (y / mapH) * cssH;
    const px = (n, axis) => (axis === "x" ? (n / mapW) * cssW : (n / mapH) * cssH);

    const skyTop = ctx.createLinearGradient(0, 0, 0, cssH * 0.55);
    skyTop.addColorStop(0, "#1a2744");
    skyTop.addColorStop(0.45, "#243352");
    skyTop.addColorStop(1, "#0d1526");
    ctx.fillStyle = skyTop;
    ctx.fillRect(0, 0, cssW, cssH * 0.58);

    const haze = ctx.createLinearGradient(0, cssH * 0.35, 0, cssH);
    haze.addColorStop(0, "rgba(15,23,42,0)");
    haze.addColorStop(1, "rgba(8,12,22,0.92)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, cssH * 0.35, cssW, cssH * 0.65);

    ctx.fillStyle = "rgba(30,41,59,0.55)";
    ctx.fillRect(0, sy(mapH * 0.22), cssW, sy(mapH * 0.38) - sy(mapH * 0.22));

    ctx.fillStyle = "rgba(226,232,240,0.35)";
    for (let s = 0; s < 42; s += 1) {
      const sx0 = ((s * 97 + 13) % 1000) / 1000;
      const sy0 = ((s * 53 + 7) % 600) / 1000;
      if (sy0 > 0.35) continue;
      ctx.fillRect(sx0 * cssW, sy0 * cssH * 0.5, 1.2, 1.2);
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

    ctx.beginPath();
    ctx.moveTo(0, cssH);
    for (let i = 0; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y) + 4);
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, cssH);
    for (let i = 0; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y));
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    const soil = ctx.createLinearGradient(0, sy(mapH * 0.35), 0, cssH);
    soil.addColorStop(0, "#5c4a32");
    soil.addColorStop(0.35, "#4a3d28");
    soil.addColorStop(0.7, "#2d2418");
    soil.addColorStop(1, "#1a1510");
    ctx.fillStyle = soil;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx(ridge[0].x), sy(ridge[0].y));
    for (let i = 1; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y));
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y) + px(10, "y"));
    }
    ctx.closePath();
    const grass = ctx.createLinearGradient(0, 0, 0, cssH);
    grass.addColorStop(0, "rgba(52,120,62,0.55)");
    grass.addColorStop(0.4, "rgba(42,90,48,0.35)");
    grass.addColorStop(1, "rgba(42,90,48,0)");
    ctx.fillStyle = grass;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sx(ridge[0].x), sy(ridge[0].y));
    for (let i = 1; i < n; i += 1) {
      ctx.lineTo(sx(ridge[i].x), sy(ridge[i].y));
    }
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const parity = snapshot?.parity && typeof snapshot.parity === "object" ? snapshot.parity : {};
    const activePk = String(parity.activeParticipantKey || "").trim();
    const parts = Array.isArray(parity.participants) ? parity.participants : [];
    const pk0 = String(parts[0] || "").trim();
    const pk1 = String(parts[1] || "").trim();
    const isMyTurn = Boolean(snapshot?.isMyTurn);
    const phase = String(snapshot?.phase || "");

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

    function drawTank(tx, ty, seat) {
      const cx = sx(tx);
      const cy = sy(ty);
      const hullW = Math.max(34, px(40, "x"));
      const hullH = Math.max(14, px(18, "y"));
      const treadH = Math.max(5, px(7, "y"));
      const colHull = seat === 0 ? "#3b82f6" : "#ea580c";
      const colHullDark = seat === 0 ? "#1e40af" : "#9a3412";
      const colTread = "#1c1917";

      const pkSeat = seat === 0 ? pk0 : pk1;
      const isActiveSeat = Boolean(activePk && pkSeat === activePk);
      const turretY = -hullH * 0.55;
      const barrelLen = Math.max(26, px(44, "x"));

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

      ctx.save();
      ctx.translate(cx, cy);

      ctx.fillStyle = colTread;
      ctx.fillRect(-hullW * 0.52, hullH * 0.1, hullW * 1.04, treadH);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.strokeRect(-hullW * 0.52, hullH * 0.1, hullW * 1.04, treadH);

      const hg = ctx.createLinearGradient(-hullW * 0.5, -hullH, hullW * 0.5, hullH * 0.2);
      hg.addColorStop(0, colHull);
      hg.addColorStop(1, colHullDark);
      ctx.fillStyle = hg;
      fillRoundRect(-hullW * 0.5, -hullH * 0.85, hullW, hullH, 5);
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1.25;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(-hullW * 0.5, -hullH * 0.85, hullW, hullH, 5);
        ctx.stroke();
      } else {
        ctx.strokeRect(-hullW * 0.5, -hullH * 0.85, hullW, hullH);
      }

      const tr = Math.min(hullW, hullH) * 0.28;
      ctx.beginPath();
      ctx.arc(0, turretY, tr, 0, Math.PI * 2);
      ctx.fillStyle = "#334155";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.stroke();

      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, turretY);
      ctx.lineTo(bx, turretY + by);
      ctx.stroke();
      ctx.strokeStyle = "rgba(148,163,184,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo((bx / barrelLen) * 3, turretY + (by / barrelLen) * 3);
      ctx.lineTo(bx * 0.96, turretY + by * 0.96);
      ctx.stroke();

      ctx.restore();
    }

    for (let ti = 0; ti < tanks.length; ti += 1) {
      const t = tanks[ti];
      const seat = Number(t?.seat);
      const tx = Number(t?.x);
      const ty = Number(t?.y);
      if (!Number.isFinite(tx) || !Number.isFinite(ty) || (seat !== 0 && seat !== 1)) continue;
      drawTank(tx, ty, seat);
    }

    const last = parity.lastEvent;
    if (last && typeof last === "object" && last.impact && typeof last.impact === "object") {
      const ix = Number(last.impact.x);
      const iy = Number(last.impact.y);
      const kind = String(last.kind || "");
      if (Number.isFinite(ix) && Number.isFinite(iy)) {
        const px0 = sx(ix);
        const py0 = sy(iy);
        const rBase = kind === "miss_oob" ? 10 : kind === "tank_direct" ? 22 : 18;

        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = kind === "miss_oob" ? "rgba(148,163,184,0.4)" : "rgba(30,22,12,0.65)";
        ctx.beginPath();
        ctx.arc(px0, py0, rBase * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = kind === "miss_oob" ? "rgba(226,232,240,0.5)" : "rgba(250,204,21,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px0, py0, rBase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(254,243,199,0.35)";
        ctx.beginPath();
        ctx.arc(px0, py0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }, [snapshot, aimAngleDeg, mySeat]);

  useEffect(() => {
    draw();
  }, [draw]);

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
        "relative w-full overflow-hidden rounded-2xl border border-amber-900/25 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_40px_rgba(0,0,0,0.45)]"
      }
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-amber-500/5 to-transparent"
        aria-hidden
      />
      <canvas ref={canvasRef} className="relative z-[1] block w-full max-w-full" />
    </div>
  );
}
