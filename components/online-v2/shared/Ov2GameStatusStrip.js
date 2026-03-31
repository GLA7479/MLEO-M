"use client";

/**
 * Compact status / announcement row for OV2 game bodies (no scroll).
 */

/** @param {{ title?: string, subtitle?: string, tone?: "neutral"|"amber"|"emerald"|"red", compact?: boolean }} props */
export default function Ov2GameStatusStrip({ title, subtitle, tone = "neutral", compact = false }) {
  const border =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-950/25 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-100"
        : tone === "red"
          ? "border-red-500/30 bg-red-950/25 text-red-100"
          : "border-white/10 bg-black/35 text-zinc-200";

  const pad = compact ? "px-1.5 py-0.5 sm:px-2 sm:py-1" : "px-2 py-1";
  const text = compact ? "text-[9px] leading-tight sm:text-[11px]" : "text-[10px] leading-tight sm:text-[11px]";
  const subMargin = compact ? "mt-0 sm:mt-0.5" : "mt-0.5";

  return (
    <div className={`shrink-0 rounded-lg border ${pad} ${text} ${border}`}>
      {title ? <div className="font-semibold">{title}</div> : null}
      {subtitle ? <div className={`${subMargin} text-zinc-400 ${compact ? "line-clamp-2 sm:line-clamp-none" : ""}`}>{subtitle}</div> : null}
    </div>
  );
}
