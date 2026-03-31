"use client";

/**
 * Compact status / announcement row for OV2 game bodies (no scroll).
 */

/** @param {{ title?: string, subtitle?: string, tone?: "neutral"|"amber"|"emerald"|"red" }} props */
export default function Ov2GameStatusStrip({ title, subtitle, tone = "neutral" }) {
  const border =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-950/25 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-100"
        : tone === "red"
          ? "border-red-500/30 bg-red-950/25 text-red-100"
          : "border-white/10 bg-black/35 text-zinc-200";

  return (
    <div className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] leading-tight sm:text-[11px] ${border}`}>
      {title ? <div className="font-semibold">{title}</div> : null}
      {subtitle ? <div className="mt-0.5 text-zinc-400">{subtitle}</div> : null}
    </div>
  );
}
