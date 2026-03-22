/**
 * Visual-only theme tokens for the BASE home flow map (Worlds 2–6).
 * World 1 and unknown orders fall back to DEFAULT_WORLD_MAP_THEME.
 * Use stable Tailwind class strings + inline styles for colors/glows (no dynamic class composition).
 */

const LINK = {
  normal: { stroke: "rgba(34,211,238,0.16)", width: "0.45", dash: "1.2 1.8" },
  warning: { stroke: "rgba(251,191,36,0.18)", width: "0.5", dash: "1.6 1.4" },
  critical: { stroke: "rgba(244,63,94,0.22)", width: "0.58", dash: "2.2 1.3" },
};

const DOT = {
  normal: { fill: "rgba(34,211,238,0.55)", r: "0.7", filter: "" },
  warning: { fill: "rgba(251,191,36,0.55)", r: "0.85", filter: "" },
  critical: { fill: "rgba(244,63,94,0.65)", r: "1.0", filter: "" },
};

export const DEFAULT_WORLD_MAP_THEME = {
  mapShellClassName: "",
  mapShellStyle: undefined,
  mapInnerClassName: "",
  mapInnerStyle: undefined,
  mapBadgeClassName: "",
  mapBadgeText: "",
  labelClassName: "",
  /** When set, HQ uses this instead of selectedRingClassName while selected. */
  selectedRingHqClassName: "",
  selectedRingClassName: "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950 scale-[1.04]",
  hqIconClassName: "text-emerald-300",
  regularIconClassName: "",
  /** Merged onto the active link line when that destination node is selected. */
  linkSelected: null,
  node: {
    regularClassName: "",
    hqClassName: "",
    warningClassName: "",
    criticalClassName: "",
  },
  links: { ...LINK },
  dots: {
    ...DOT,
    selectedFill: "rgba(255,255,255,0.95)",
    /** Merged onto midpoint dot when its link target is selected (r, filter). */
    selectedActive: null,
  },
  overlays: [],
  mobileAdjustments: null,
};

function overlay(key, className, style) {
  return { key, className, style };
}

/** Orbital freight — disciplined logistics grid, amber + cyan corridors */
const WORLD_2_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-amber-950/25 shadow-[inset_0_0_100px_rgba(251,191,36,0.09),inset_0_-40px_80px_rgba(34,211,238,0.05)] ring-1 ring-inset ring-amber-400/35",
  mapInnerClassName:
    "rounded-[1.15rem] ring-1 ring-cyan-400/30 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.06)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-md border border-amber-400/45 bg-amber-950/70 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] text-amber-50 shadow-[0_0_24px_rgba(251,191,36,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]",
  mapBadgeText: "Freight orbit",
  labelClassName: "text-cyan-100/75",
  linkSelected: {
    stroke: "rgba(34,211,238,0.48)",
    width: "0.62",
    dash: "1.1 0.75",
  },
  selectedRingClassName:
    "ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_26px_rgba(34,211,238,0.4),0_0_10px_rgba(251,191,36,0.15)]",
  selectedRingHqClassName:
    "ring-2 ring-amber-200/95 ring-offset-2 ring-offset-slate-950 scale-[1.05] shadow-[0_0_32px_rgba(251,191,36,0.38),0_0_18px_rgba(34,211,238,0.22)]",
  hqIconClassName: "text-amber-100 drop-shadow-[0_0_10px_rgba(251,191,36,0.55)]",
  regularIconClassName: "text-cyan-200 drop-shadow-[0_0_6px_rgba(34,211,238,0.35)]",
  node: {
    regularClassName:
      "ring-1 ring-cyan-400/22 shadow-[0_0_16px_rgba(34,211,238,0.14),inset_0_1px_0_rgba(255,255,255,0.04)]",
    hqClassName:
      "ring-2 ring-amber-400/45 shadow-[0_0_28px_rgba(251,191,36,0.28),0_0_14px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(251,191,36,0.26)", width: "0.52", dash: "1.65 0.95" },
    warning: { stroke: "rgba(251,191,36,0.38)", width: "0.58", dash: "1.15 0.85" },
    critical: { stroke: "rgba(244,63,94,0.36)", width: "0.66", dash: "1.9 1.0" },
  },
  dots: {
    normal: {
      fill: "rgba(34,211,238,0.52)",
      r: "0.78",
      filter: "drop-shadow(0 0 2px rgba(251,191,36,0.75))",
    },
    warning: {
      fill: "rgba(251,191,36,0.62)",
      r: "0.9",
      filter: "drop-shadow(0 0 2px rgba(251,191,36,0.85))",
    },
    critical: {
      fill: "rgba(244,63,94,0.72)",
      r: "1.08",
      filter: "drop-shadow(0 0 2.5px rgba(244,63,94,0.82))",
    },
    selectedFill: "rgba(253,250,232,0.98)",
    selectedActive: {
      r: "1.0",
      filter: "drop-shadow(0 0 4px rgba(34,211,238,0.95)) drop-shadow(0 0 2px rgba(251,191,36,0.8))",
    },
  },
  overlays: [
    overlay(
      "w2-orbit-glow",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.95]",
      {
        background:
          "radial-gradient(ellipse 100% 70% at 50% 112%, rgba(251,191,36,0.18), transparent 55%), radial-gradient(ellipse 55% 40% at 10% 15%, rgba(34,211,238,0.1), transparent 48%)",
      }
    ),
    overlay(
      "w2-traffic-grid",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.4]",
      {
        backgroundImage: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 11px,
          rgba(34,211,238,0.045) 11px,
          rgba(34,211,238,0.045) 12px
        ), repeating-linear-gradient(
          90deg,
          transparent,
          transparent 11px,
          rgba(251,191,36,0.035) 11px,
          rgba(251,191,36,0.035) 12px
        )`,
      }
    ),
    overlay(
      "w2-lanes",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.38]",
      {
        backgroundImage: `repeating-linear-gradient(
          -18deg,
          transparent,
          transparent 8px,
          rgba(34,211,238,0.055) 8px,
          rgba(34,211,238,0.055) 9px
        )`,
      }
    ),
    overlay(
      "w2-arc-hint",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.14]",
      {
        background:
          "radial-gradient(ellipse 120% 55% at 50% 38%, transparent 40%, rgba(34,211,238,0.06) 41%, transparent 42%), radial-gradient(ellipse 90% 50% at 50% 62%, transparent 44%, rgba(251,191,36,0.05) 45%, transparent 46%)",
      }
    ),
  ],
  mobileAdjustments: {
    mapInnerClassName: "ring-cyan-400/18",
    linkSelected: { stroke: "rgba(34,211,238,0.38)", width: "0.54", dash: "1.2 0.85" },
    overlays: [
      overlay(
        "w2-orbit-glow-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.82]",
        {
          background:
            "radial-gradient(ellipse 100% 72% at 50% 100%, rgba(251,191,36,0.14), transparent 54%)",
        }
      ),
      overlay(
        "w2-grid-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.22]",
        {
          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 14px, rgba(34,211,238,0.04) 14px, rgba(34,211,238,0.04) 15px)`,
        }
      ),
    ],
    mapBadgeText: "Freight",
    mapBadgeClassName: "opacity-95",
    links: {
      normal: { stroke: "rgba(251,191,36,0.2)", width: "0.48", dash: "1.5 1.0" },
    },
    dots: {
      normal: { r: "0.7", filter: "drop-shadow(0 0 1px rgba(251,191,36,0.65))" },
      selectedActive: { r: "0.88", filter: "drop-shadow(0 0 2.5px rgba(34,211,238,0.85))" },
    },
  },
};

/** Signal wastes — telemetry traces, interference, signal lock */
const WORLD_3_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-gradient-to-br from-violet-950/50 via-slate-950/85 to-slate-950/90 shadow-[inset_0_0_90px_rgba(167,139,250,0.12),inset_0_0_60px_rgba(34,211,238,0.05)] ring-1 ring-inset ring-violet-400/40",
  mapInnerClassName:
    "rounded-[1.15rem] ring-1 ring-cyan-400/25 shadow-[inset_0_0_32px_rgba(167,139,250,0.06)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-md border border-cyan-400/40 bg-violet-950/65 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.24em] text-cyan-100 shadow-[0_0_22px_rgba(167,139,250,0.28),inset_0_0_12px_rgba(34,211,238,0.08)]",
  mapBadgeText: "Signal scan",
  labelClassName: "text-violet-100/70",
  linkSelected: {
    stroke: "rgba(196,181,253,0.72)",
    width: "0.64",
    dash: "0.35 1.1",
  },
  selectedRingClassName:
    "ring-2 ring-cyan-300/95 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_28px_rgba(34,211,238,0.45),0_0_14px_rgba(167,139,250,0.35)]",
  selectedRingHqClassName:
    "ring-2 ring-violet-200/95 ring-offset-2 ring-offset-violet-950/80 scale-[1.05] shadow-[0_0_34px_rgba(167,139,250,0.42),0_0_12px_rgba(34,211,238,0.3)]",
  hqIconClassName: "text-cyan-200 drop-shadow-[0_0_12px_rgba(34,211,238,0.55)]",
  regularIconClassName: "text-violet-200 drop-shadow-[0_0_8px_rgba(167,139,250,0.4)]",
  node: {
    regularClassName:
      "ring-1 ring-violet-400/28 shadow-[0_0_18px_rgba(167,139,250,0.18),inset_0_0_20px_rgba(34,211,238,0.04)]",
    hqClassName:
      "ring-2 ring-cyan-400/40 shadow-[0_0_26px_rgba(34,211,238,0.25),0_0_16px_rgba(167,139,250,0.2),inset_0_1px_0_rgba(255,255,255,0.05)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(167,139,250,0.3)", width: "0.48", dash: "0.65 1.35" },
    warning: { stroke: "rgba(34,211,238,0.36)", width: "0.54", dash: "0.4 0.9" },
    critical: { stroke: "rgba(244,63,94,0.36)", width: "0.62", dash: "1.6 0.85" },
  },
  dots: {
    normal: {
      fill: "rgba(196,181,253,0.58)",
      r: "0.76",
      filter: "drop-shadow(0 0 2px rgba(34,211,238,0.75))",
    },
    warning: {
      fill: "rgba(34,211,238,0.56)",
      r: "0.9",
      filter: "drop-shadow(0 0 2.2px rgba(167,139,250,0.8))",
    },
    critical: {
      fill: "rgba(244,63,94,0.72)",
      r: "1.06",
      filter: "drop-shadow(0 0 2.5px rgba(244,63,94,0.85))",
    },
    selectedFill: "rgba(250,245,255,0.99)",
    selectedActive: {
      r: "1.05",
      filter:
        "drop-shadow(0 0 3px rgba(34,211,238,1)) drop-shadow(0 0 2px rgba(196,181,253,0.9))",
    },
  },
  overlays: [
    overlay(
      "w3-field",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.9]",
      {
        background:
          "radial-gradient(circle at 18% 28%, rgba(167,139,250,0.16), transparent 40%), radial-gradient(circle at 85% 72%, rgba(34,211,238,0.12), transparent 42%)",
      }
    ),
    overlay(
      "w3-trace",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.28]",
      {
        background:
          "repeating-linear-gradient(95deg, rgba(167,139,250,0.08) 0 1px, transparent 1px 6px), repeating-linear-gradient(-5deg, rgba(34,211,238,0.06) 0 1px, transparent 1px 8px)",
      }
    ),
    overlay(
      "w3-scan",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.26]",
      {
        background:
          "repeating-linear-gradient(180deg, rgba(167,139,250,0.09) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(34,211,238,0.06) 0 1px, transparent 1px 5px)",
      }
    ),
    overlay(
      "w3-noise",
      "pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-screen opacity-[0.14]",
      {
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(196,181,253,0.55)", width: "0.54", dash: "0.4 1.0" },
    overlays: [
      overlay(
        "w3-field-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.78]",
        {
          background:
            "radial-gradient(circle at 50% 38%, rgba(167,139,250,0.12), transparent 48%)",
        }
      ),
      overlay(
        "w3-scan-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.16]",
        {
          background:
            "repeating-linear-gradient(180deg, rgba(34,211,238,0.07) 0 1px, transparent 1px 6px)",
        }
      ),
    ],
    mapBadgeText: "Signal",
    mapBadgeClassName: "tracking-[0.18em]",
    links: {
      normal: { stroke: "rgba(167,139,250,0.24)", width: "0.44", dash: "0.7 1.25" },
    },
    dots: {
      selectedActive: { r: "0.92", filter: "drop-shadow(0 0 2.5px rgba(34,211,238,0.9))" },
    },
  },
};

/** Reactor scar — thermal conduit, chamber pressure, flare lock */
const WORLD_4_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-gradient-to-b from-orange-950/35 via-slate-950/88 to-slate-950/95 shadow-[inset_0_0_120px_rgba(249,115,22,0.14),inset_0_-30px_90px_rgba(251,113,133,0.1)] ring-1 ring-inset ring-orange-500/45",
  mapInnerClassName:
    "rounded-[1.15rem] ring-1 ring-rose-400/35 shadow-[inset_0_0_48px_rgba(251,113,133,0.08)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-md border border-rose-400/45 bg-orange-950/55 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] text-orange-50 shadow-[0_0_28px_rgba(249,115,22,0.3),inset_0_1px_0_rgba(255,200,180,0.12)]",
  mapBadgeText: "Thermal grid",
  labelClassName: "text-orange-100/72",
  linkSelected: {
    stroke: "rgba(255,237,213,0.55)",
    width: "0.68",
    dash: "0.9 0.7",
  },
  selectedRingClassName:
    "ring-2 ring-orange-200/95 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_32px_rgba(249,115,22,0.48),0_0_16px_rgba(251,113,133,0.35)]",
  selectedRingHqClassName:
    "ring-2 ring-rose-200/95 ring-offset-2 ring-offset-orange-950/50 scale-[1.05] shadow-[0_0_38px_rgba(251,113,133,0.45),0_0_20px_rgba(249,115,22,0.35)]",
  hqIconClassName: "text-orange-100 drop-shadow-[0_0_14px_rgba(249,115,22,0.6)]",
  regularIconClassName: "text-rose-100 drop-shadow-[0_0_8px_rgba(251,113,133,0.45)]",
  node: {
    regularClassName:
      "ring-1 ring-orange-500/30 shadow-[0_0_18px_rgba(249,115,22,0.2),inset_0_0_24px_rgba(251,113,133,0.06)]",
    hqClassName:
      "ring-2 ring-orange-400/50 shadow-[0_0_32px_rgba(249,115,22,0.32),0_0_18px_rgba(251,113,133,0.22),inset_0_1px_0_rgba(255,220,200,0.08)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(249,115,22,0.32)", width: "0.54", dash: "0.45 0.85" },
    warning: { stroke: "rgba(251,191,36,0.38)", width: "0.58", dash: "0.35 0.65" },
    critical: { stroke: "rgba(244,63,94,0.4)", width: "0.68", dash: "1.5 0.75" },
  },
  dots: {
    normal: {
      fill: "rgba(253,186,116,0.62)",
      r: "0.8",
      filter: "drop-shadow(0 0 2.5px rgba(249,115,22,0.9))",
    },
    warning: {
      fill: "rgba(251,191,36,0.62)",
      r: "0.92",
      filter: "drop-shadow(0 0 2.5px rgba(251,191,36,0.85))",
    },
    critical: {
      fill: "rgba(244,63,94,0.76)",
      r: "1.1",
      filter: "drop-shadow(0 0 3px rgba(244,63,94,0.9))",
    },
    selectedFill: "rgba(255,251,235,0.99)",
    selectedActive: {
      r: "1.12",
      filter:
        "drop-shadow(0 0 4px rgba(255,237,213,0.95)) drop-shadow(0 0 3px rgba(249,115,22,0.85))",
    },
  },
  overlays: [
    overlay(
      "w4-core",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.98]",
      {
        background:
          "radial-gradient(circle at 50% 48%, rgba(249,115,22,0.2), transparent 52%), radial-gradient(ellipse 130% 85% at 50% 115%, rgba(251,113,133,0.16), transparent 48%)",
      }
    ),
    overlay(
      "w4-conduit",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.22]",
      {
        background:
          "repeating-linear-gradient(180deg, rgba(255,200,150,0.07) 0 2px, transparent 2px 10px)",
      }
    ),
    overlay(
      "w4-heat",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.2]",
      {
        background:
          "repeating-radial-gradient(circle at 50% 45%, rgba(255,255,255,0.07) 0 1px, transparent 1px 12px)",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(255,237,213,0.42)", width: "0.56", dash: "1.0 0.75" },
    overlays: [
      overlay(
        "w4-core-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.82]",
        {
          background:
            "radial-gradient(circle at 50% 52%, rgba(249,115,22,0.15), transparent 50%)",
        }
      ),
    ],
    mapBadgeText: "Reactor",
    links: {
      normal: { stroke: "rgba(249,115,22,0.26)", width: "0.5", dash: "0.5 0.9" },
    },
    dots: {
      normal: { r: "0.74", filter: "drop-shadow(0 0 2px rgba(249,115,22,0.75))" },
      selectedActive: { r: "0.95", filter: "drop-shadow(0 0 3px rgba(249,115,22,0.8))" },
    },
  },
};

/** Salvage graveyard — reclaimed hardware, scrap haze, patched conduits */
const WORLD_5_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-gradient-to-tl from-amber-950/30 via-slate-950/88 to-emerald-950/25 shadow-[inset_0_0_100px_rgba(16,185,129,0.1),inset_0_0_70px_rgba(180,83,9,0.06)] ring-1 ring-inset ring-emerald-500/35",
  mapInnerClassName:
    "rounded-[1.15rem] ring-1 ring-amber-600/28 shadow-[inset_0_0_40px_rgba(245,158,11,0.05)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-md border border-dashed border-emerald-400/50 bg-emerald-950/60 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.22)]",
  mapBadgeText: "Salvage field",
  labelClassName: "text-amber-100/65",
  linkSelected: {
    stroke: "rgba(52,211,153,0.52)",
    width: "0.62",
    dash: "2.2 0.55",
  },
  selectedRingClassName:
    "ring-2 ring-emerald-300/90 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_26px_rgba(16,185,129,0.38),0_0_12px_rgba(245,158,11,0.2)]",
  selectedRingHqClassName:
    "ring-2 ring-amber-300/90 ring-offset-2 ring-offset-emerald-950/40 scale-[1.05] shadow-[0_0_32px_rgba(245,158,11,0.32),0_0_14px_rgba(52,211,153,0.25)]",
  hqIconClassName: "text-amber-200 drop-shadow-[0_0_10px_rgba(245,158,11,0.45)]",
  regularIconClassName: "text-emerald-200 drop-shadow-[0_0_6px_rgba(16,185,129,0.35)]",
  node: {
    regularClassName:
      "ring-1 ring-dashed ring-emerald-500/35 shadow-[0_0_14px_rgba(16,185,129,0.14),inset_0_0_18px_rgba(0,0,0,0.15)]",
    hqClassName:
      "ring-2 ring-amber-500/40 ring-offset-0 shadow-[0_0_28px_rgba(245,158,11,0.22),0_0_12px_rgba(16,185,129,0.18),inset_0_1px_0_rgba(255,255,255,0.04)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(52,211,153,0.28)", width: "0.5", dash: "2.4 1.1" },
    warning: { stroke: "rgba(245,158,11,0.34)", width: "0.56", dash: "1.8 0.9" },
    critical: { stroke: "rgba(244,63,94,0.36)", width: "0.64", dash: "1.2 0.7" },
  },
  dots: {
    normal: {
      fill: "rgba(16,185,129,0.55)",
      r: "0.78",
      filter: "drop-shadow(0 0 1.8px rgba(245,158,11,0.6))",
    },
    warning: {
      fill: "rgba(245,158,11,0.6)",
      r: "0.9",
      filter: "drop-shadow(0 0 2px rgba(180,83,9,0.55))",
    },
    critical: {
      fill: "rgba(244,63,94,0.72)",
      r: "1.06",
      filter: "drop-shadow(0 0 2.5px rgba(244,63,94,0.82))",
    },
    selectedFill: "rgba(236,253,245,0.99)",
    selectedActive: {
      r: "1.02",
      filter:
        "drop-shadow(0 0 3px rgba(52,211,153,0.9)) drop-shadow(0 0 2px rgba(245,158,11,0.65))",
    },
  },
  overlays: [
    overlay(
      "w5-haze",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.28]",
      {
        background:
          "radial-gradient(ellipse 100% 60% at 50% 100%, rgba(120,113,108,0.12), transparent 50%), radial-gradient(ellipse 80% 50% at 20% 20%, rgba(16,185,129,0.08), transparent 45%)",
      }
    ),
    overlay(
      "w5-dust",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.22]",
      {
        backgroundImage:
          "radial-gradient(circle at 12% 22%, rgba(245,158,11,0.14) 0, transparent 3px), radial-gradient(circle at 72% 58%, rgba(16,185,129,0.12) 0, transparent 2px), radial-gradient(circle at 42% 78%, rgba(120,53,15,0.1) 0, transparent 2px)",
        backgroundSize: "130px 130px, 100px 100px, 110px 110px",
      }
    ),
    overlay(
      "w5-floor",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.38]",
      {
        background:
          "linear-gradient(168deg, rgba(15,23,42,0.45) 0%, transparent 42%, rgba(16,185,129,0.07) 100%)",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(52,211,153,0.4)", width: "0.54", dash: "1.8 0.5" },
    overlays: [
      overlay(
        "w5-haze-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.2]",
        {
          background:
            "linear-gradient(180deg, transparent 0%, rgba(16,185,129,0.06) 100%)",
        }
      ),
    ],
    mapBadgeText: "Salvage",
    mapBadgeClassName: "border-dashed",
    links: {
      normal: { stroke: "rgba(52,211,153,0.22)", width: "0.46", dash: "2.0 1.0" },
    },
    dots: {
      selectedActive: { r: "0.88", filter: "drop-shadow(0 0 2.5px rgba(52,211,153,0.75))" },
    },
  },
};

/** Nexus prime — harmonized command lattice, sync lock, premium surfaces */
const WORLD_6_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-gradient-to-b from-slate-950/95 via-slate-900/80 to-slate-950/95 shadow-[inset_0_0_80px_rgba(34,211,238,0.1),inset_0_0_120px_rgba(167,139,250,0.08)] ring-1 ring-inset ring-cyan-200/35",
  mapInnerClassName:
    "rounded-[1.15rem] ring-1 ring-white/22 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_0_36px_rgba(34,211,238,0.05)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded border border-cyan-200/45 bg-slate-950/80 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.26em] text-white shadow-[0_0_24px_rgba(34,211,238,0.28),0_0_12px_rgba(167,139,250,0.2),inset_0_1px_0_rgba(255,255,255,0.12)]",
  mapBadgeText: "Command nexus",
  labelClassName: "text-cyan-50/80",
  linkSelected: {
    stroke: "rgba(255,255,255,0.42)",
    width: "0.58",
    dash: "2.4 1.2",
  },
  selectedRingClassName:
    "ring-2 ring-cyan-100/95 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_30px_rgba(34,211,238,0.45),0_0_18px_rgba(167,139,250,0.35)]",
  selectedRingHqClassName:
    "ring-2 ring-white/95 ring-offset-2 ring-offset-slate-950 scale-[1.06] shadow-[0_0_40px_rgba(255,255,255,0.22),0_0_28px_rgba(34,211,238,0.4),0_0_16px_rgba(167,139,250,0.3)]",
  hqIconClassName: "text-white drop-shadow-[0_0_14px_rgba(34,211,238,0.65)]",
  regularIconClassName: "text-cyan-100 drop-shadow-[0_0_6px_rgba(167,139,250,0.35)]",
  node: {
    regularClassName:
      "ring-1 ring-white/12 shadow-[0_0_16px_rgba(167,139,250,0.15),inset_0_1px_0_rgba(255,255,255,0.07)]",
    hqClassName:
      "ring-2 ring-cyan-300/45 shadow-[0_0_34px_rgba(34,211,238,0.28),0_0_20px_rgba(167,139,250,0.2),inset_0_0_28px_rgba(34,211,238,0.08),inset_0_1px_0_rgba(255,255,255,0.1)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(34,211,238,0.28)", width: "0.48", dash: "2.2 1.8" },
    warning: { stroke: "rgba(196,181,253,0.36)", width: "0.54", dash: "1.6 1.4" },
    critical: { stroke: "rgba(244,63,94,0.36)", width: "0.64", dash: "1.4 0.85" },
  },
  dots: {
    normal: {
      fill: "rgba(224,242,254,0.62)",
      r: "0.74",
      filter: "drop-shadow(0 0 2px rgba(167,139,250,0.75))",
    },
    warning: {
      fill: "rgba(196,181,253,0.58)",
      r: "0.88",
      filter: "drop-shadow(0 0 2px rgba(34,211,238,0.7))",
    },
    critical: {
      fill: "rgba(244,63,94,0.74)",
      r: "1.04",
      filter: "drop-shadow(0 0 2.5px rgba(244,63,94,0.85))",
    },
    selectedFill: "rgba(255,255,255,0.995)",
    selectedActive: {
      r: "1.08",
      filter:
        "drop-shadow(0 0 3.5px rgba(255,255,255,0.85)) drop-shadow(0 0 2.5px rgba(34,211,238,0.9))",
    },
  },
  overlays: [
    overlay(
      "w6-grid",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.18]",
      {
        background:
          "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }
    ),
    overlay(
      "w6-lattice",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.12]",
      {
        background:
          "linear-gradient(45deg, transparent 48%, rgba(167,139,250,0.06) 49%, rgba(167,139,250,0.06) 51%, transparent 52%), linear-gradient(-45deg, transparent 48%, rgba(34,211,238,0.05) 49%, rgba(34,211,238,0.05) 51%, transparent 52%)",
        backgroundSize: "28px 28px",
      }
    ),
    overlay(
      "w6-nexus",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.92]",
      {
        background:
          "radial-gradient(circle at 50% 40%, rgba(34,211,238,0.12), transparent 48%), radial-gradient(circle at 50% 52%, rgba(167,139,250,0.1), transparent 55%)",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(255,255,255,0.32)", width: "0.5", dash: "2.0 1.4" },
    overlays: [
      overlay(
        "w6-nexus-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.78]",
        {
          background:
            "radial-gradient(circle at 50% 44%, rgba(34,211,238,0.1), transparent 50%)",
        }
      ),
      overlay(
        "w6-grid-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.1]",
        {
          background:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }
      ),
    ],
    mapBadgeText: "Nexus",
    links: {
      normal: { stroke: "rgba(34,211,238,0.22)", width: "0.44", dash: "2.0 1.6" },
    },
    dots: {
      selectedActive: { r: "0.95", filter: "drop-shadow(0 0 2.5px rgba(34,211,238,0.85))" },
    },
  },
};

export const WORLD_MAP_THEME_BY_ORDER = {
  2: WORLD_2_MAP_THEME,
  3: WORLD_3_MAP_THEME,
  4: WORLD_4_MAP_THEME,
  5: WORLD_5_MAP_THEME,
  6: WORLD_6_MAP_THEME,
};

export function getWorldMapTheme(order) {
  const n = Number(order);
  if (!Number.isFinite(n) || n <= 1) return DEFAULT_WORLD_MAP_THEME;
  return WORLD_MAP_THEME_BY_ORDER[n] || DEFAULT_WORLD_MAP_THEME;
}

function mergeLinkState(base, patch) {
  if (!patch) return base;
  return {
    normal: { ...base.normal, ...(patch.normal || {}) },
    warning: { ...base.warning, ...(patch.warning || {}) },
    critical: { ...base.critical, ...(patch.critical || {}) },
  };
}

function mergeDotState(base, patch) {
  if (!patch) return base;
  const next = { ...base, selectedFill: patch.selectedFill ?? base.selectedFill };
  for (const k of ["normal", "warning", "critical"]) {
    if (patch[k]) next[k] = { ...base[k], ...patch[k] };
  }
  if (patch.selectedActive) {
    next.selectedActive = { ...(base.selectedActive || {}), ...patch.selectedActive };
  }
  return next;
}

/**
 * Apply mobile-specific visual simplifications without changing layout geometry.
 */
export function resolveWorldMapTheme(theme, layout) {
  if (!theme) return DEFAULT_WORLD_MAP_THEME;
  if (layout !== "mobile" || !theme.mobileAdjustments) return theme;

  const m = theme.mobileAdjustments;
  const out = {
    ...theme,
    mapShellClassName: [theme.mapShellClassName, m.mapShellClassName].filter(Boolean).join(" ").trim(),
    mapInnerClassName: [theme.mapInnerClassName, m.mapInnerClassName].filter(Boolean).join(" ").trim(),
    links: mergeLinkState(theme.links, m.links),
    dots: mergeDotState(theme.dots, m.dots),
    overlays: m.overlays !== undefined ? m.overlays : theme.overlays,
  };
  if (m.linkSelected) {
    out.linkSelected = { ...(theme.linkSelected || {}), ...m.linkSelected };
  }
  if (m.mapBadgeText !== undefined) out.mapBadgeText = m.mapBadgeText;
  if (m.mapBadgeClassName) {
    out.mapBadgeClassName = [theme.mapBadgeClassName, m.mapBadgeClassName].filter(Boolean).join(" ").trim();
  }
  if (m.selectedRingClassName) out.selectedRingClassName = m.selectedRingClassName;
  if (m.selectedRingHqClassName) {
    out.selectedRingHqClassName = [theme.selectedRingHqClassName, m.selectedRingHqClassName]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (m.labelClassName) out.labelClassName = [theme.labelClassName, m.labelClassName].filter(Boolean).join(" ").trim();
  return out;
}
