"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * @param {{ snapshot: object | null, className?: string }} props
 */
export default function Ov2TanksBattleCanvas({ snapshot, className }) {
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

    const sky = ctx.createLinearGradient(0, 0, 0, cssH);
    sky.addColorStop(0, "#0f172a");
    sky.addColorStop(1, "#1e293b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssW, cssH);

    if (!samples || samples.length < 2) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px system-ui,sans-serif";
      ctx.fillText("No terrain", 8, 18);
      return;
    }

    const n = samples.length;
    ctx.beginPath();
    ctx.moveTo(0, cssH);
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1)) * mapW;
      const y = Number(samples[i]);
      ctx.lineTo(sx(x), sy(Number.isFinite(y) ? y : mapH * 0.55));
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    ctx.fillStyle = "#3f2e1a";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    for (let ti = 0; ti < tanks.length; ti += 1) {
      const t = tanks[ti];
      const tx = Number(t?.x);
      const ty = Number(t?.y);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
      const cx = sx(tx);
      const cy = sy(ty);
      const seat = Number(t?.seat);
      ctx.fillStyle = seat === 0 ? "#38bdf8" : "#f97316";
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.stroke();
    }

    const last = snapshot?.parity?.lastEvent;
    if (last && typeof last === "object" && last.impact && typeof last.impact === "object") {
      const ix = Number(last.impact.x);
      const iy = Number(last.impact.y);
      if (Number.isFinite(ix) && Number.isFinite(iy)) {
        ctx.strokeStyle = "rgba(250,204,21,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx(ix), sy(iy), 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [snapshot]);

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
    <div ref={wrapRef} className={className || "w-full"}>
      <canvas ref={canvasRef} className="block max-w-full rounded border border-white/10 bg-slate-950" />
    </div>
  );
}
