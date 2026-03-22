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
  /** SVG line caps: unset = browser default (butt). Worlds 2–6 set "round" for softer lanes. */
  linkStrokeLinecap: undefined,
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
  /** Mobile-only: optional root wrapper classes on the flow map (e.g. vertical nudge). */
  mapMobileRootClassName: "",
  mobileAdjustments: null,
};

function overlay(key, className, style) {
  return { key, className, style };
}

/** Orbital freight — corridor discipline: shell vs one grid layer, routes read sharp */
const WORLD_2_MAP_THEME = {
  linkStrokeLinecap: "round",
  mapShellClassName: "rounded-3xl",
  mapInnerClassName:
    "rounded-3xl bg-gradient-to-b from-amber-950/18 via-slate-950/45 to-slate-950/52 ring-1 ring-inset ring-cyan-400/28 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.1),inset_0_0_56px_rgba(251,191,36,0.035)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] max-w-[46%] truncate rounded-md border border-amber-400/50 bg-amber-950/75 px-2 py-0.5 text-[8px] font-black uppercase leading-tight tracking-[0.2em] text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.18),inset_0_1px_0_rgba(255,255,255,0.07)] sm:max-w-none sm:px-2.5 sm:text-[9px] sm:tracking-[0.22em]",
  mapBadgeText: "Freight orbit",
  labelClassName: "text-cyan-100/80",
  linkSelected: {
    stroke: "rgba(34,211,238,0.58)",
    width: "0.68",
    dash: "1.35 0.65",
  },
  selectedRingClassName:
    "ring-2 ring-cyan-200/95 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_22px_rgba(34,211,238,0.45)]",
  selectedRingHqClassName:
    "ring-2 ring-amber-100/95 ring-offset-2 ring-offset-slate-950 scale-[1.05] shadow-[0_0_28px_rgba(251,191,36,0.42),0_0_12px_rgba(34,211,238,0.2)]",
  hqIconClassName: "text-amber-50 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]",
  regularIconClassName: "text-cyan-100 drop-shadow-[0_0_4px_rgba(34,211,238,0.3)]",
  node: {
    regularClassName:
      "ring-1 ring-cyan-400/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    hqClassName:
      "ring-2 ring-amber-400/55 shadow-[0_0_22px_rgba(251,191,36,0.3),inset_0_1px_0_rgba(255,255,255,0.08)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(251,191,36,0.24)", width: "0.5", dash: "2.05 1.0" },
    warning: { stroke: "rgba(251,191,36,0.36)", width: "0.56", dash: "1.5 0.85" },
    critical: { stroke: "rgba(244,63,94,0.38)", width: "0.64", dash: "1.75 0.95" },
  },
  dots: {
    normal: {
      fill: "rgba(34,211,238,0.5)",
      r: "0.74",
      filter: "drop-shadow(0 0 1.5px rgba(251,191,36,0.55))",
    },
    warning: {
      fill: "rgba(251,191,36,0.58)",
      r: "0.86",
      filter: "drop-shadow(0 0 1.6px rgba(251,191,36,0.7))",
    },
    critical: {
      fill: "rgba(244,63,94,0.7)",
      r: "1.02",
      filter: "drop-shadow(0 0 2px rgba(244,63,94,0.78))",
    },
    selectedFill: "rgba(255,253,240,0.99)",
    selectedActive: {
      r: "1.02",
      filter: "drop-shadow(0 0 3.5px rgba(34,211,238,0.95)) drop-shadow(0 0 2px rgba(251,191,36,0.75))",
    },
  },
  overlays: [
    overlay(
      "w2-orbit",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.72]",
      {
        background:
          "radial-gradient(ellipse 95% 68% at 50% 108%, rgba(251,191,36,0.13), transparent 56%), radial-gradient(ellipse 50% 38% at 12% 14%, rgba(34,211,238,0.07), transparent 50%)",
      }
    ),
    overlay(
      "w2-corridor-grid",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.26]",
      {
        backgroundImage: `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 13px,
          rgba(34,211,238,0.038) 13px,
          rgba(34,211,238,0.038) 14px
        ), repeating-linear-gradient(
          90deg,
          transparent,
          transparent 13px,
          rgba(251,191,36,0.03) 13px,
          rgba(251,191,36,0.03) 14px
        ), repeating-linear-gradient(
          -16deg,
          transparent,
          transparent 10px,
          rgba(34,211,238,0.028) 10px,
          rgba(34,211,238,0.028) 11px
        )`,
      }
    ),
  ],
  mobileAdjustments: {
    mapInnerClassName: "ring-cyan-400/20",
    linkStrokeLinecap: "round",
    linkSelected: { stroke: "rgba(34,211,238,0.5)", width: "0.58", dash: "1.2 0.7" },
    selectedRingClassName:
      "ring-2 ring-cyan-200/95 ring-offset-1 ring-offset-slate-950 scale-[1.03] shadow-[0_0_16px_rgba(34,211,238,0.4)]",
    selectedRingHqClassName:
      "ring-2 ring-amber-100/95 ring-offset-1 ring-offset-slate-950 scale-[1.04] shadow-[0_0_20px_rgba(251,191,36,0.38)]",
    overlays: [
      overlay(
        "w2-orbit-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.68]",
        {
          background:
            "radial-gradient(ellipse 100% 70% at 50% 100%, rgba(251,191,36,0.11), transparent 55%)",
        }
      ),
      overlay(
        "w2-grid-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.18]",
        {
          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 16px, rgba(34,211,238,0.032) 16px, rgba(34,211,238,0.032) 17px)`,
        }
      ),
    ],
    mapBadgeText: "Freight",
    mapBadgeClassName: "max-w-[42%] sm:max-w-none",
    links: {
      normal: { stroke: "rgba(251,191,36,0.2)", width: "0.46", dash: "1.85 0.95" },
    },
    dots: {
      normal: { r: "0.66", filter: "drop-shadow(0 0 1px rgba(251,191,36,0.5))" },
      selectedActive: { r: "0.84", filter: "drop-shadow(0 0 3px rgba(34,211,238,0.9))" },
    },
  },
};

/** Signal wastes — scan field + lock: fewer layers, traces read as telemetry */
const WORLD_3_MAP_THEME = {
  linkStrokeLinecap: "round",
  mapShellClassName: "rounded-3xl",
  mapInnerClassName:
    "rounded-3xl bg-gradient-to-br from-violet-950/22 via-slate-950/48 to-slate-950/55 ring-1 ring-inset ring-violet-400/32 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08),inset_0_0_48px_rgba(167,139,250,0.05)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] max-w-[46%] truncate rounded-md border border-cyan-400/45 bg-violet-950/70 px-2 py-0.5 text-[8px] font-black uppercase leading-tight tracking-[0.2em] text-cyan-100 shadow-[0_0_16px_rgba(167,139,250,0.22)] sm:max-w-none sm:px-2.5 sm:text-[9px] sm:tracking-[0.24em]",
  mapBadgeText: "Signal scan",
  labelClassName: "text-violet-100/75",
  linkSelected: {
    stroke: "rgba(224,242,254,0.78)",
    width: "0.7",
    dash: "0.28 0.95",
  },
  selectedRingClassName:
    "ring-2 ring-cyan-200/98 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_24px_rgba(34,211,238,0.5)]",
  selectedRingHqClassName:
    "ring-2 ring-violet-100/95 ring-offset-2 ring-offset-violet-950/70 scale-[1.05] shadow-[0_0_28px_rgba(167,139,250,0.38),0_0_12px_rgba(34,211,238,0.28)]",
  hqIconClassName: "text-cyan-100 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]",
  regularIconClassName: "text-violet-200 drop-shadow-[0_0_5px_rgba(167,139,250,0.35)]",
  node: {
    regularClassName:
      "ring-1 ring-violet-400/32 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    hqClassName:
      "ring-2 ring-cyan-400/48 shadow-[0_0_20px_rgba(34,211,238,0.28),inset_0_1px_0_rgba(255,255,255,0.06)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(167,139,250,0.26)", width: "0.46", dash: "0.5 1.15" },
    warning: { stroke: "rgba(34,211,238,0.34)", width: "0.52", dash: "0.32 0.75" },
    critical: { stroke: "rgba(244,63,94,0.38)", width: "0.6", dash: "1.45 0.75" },
  },
  dots: {
    normal: {
      fill: "rgba(196,181,253,0.54)",
      r: "0.72",
      filter: "drop-shadow(0 0 1.5px rgba(34,211,238,0.55))",
    },
    warning: {
      fill: "rgba(34,211,238,0.54)",
      r: "0.86",
      filter: "drop-shadow(0 0 1.6px rgba(167,139,250,0.65))",
    },
    critical: {
      fill: "rgba(244,63,94,0.72)",
      r: "1.02",
      filter: "drop-shadow(0 0 2.2px rgba(244,63,94,0.82))",
    },
    selectedFill: "rgba(255,255,255,0.995)",
    selectedActive: {
      r: "1.06",
      filter:
        "drop-shadow(0 0 3.5px rgba(34,211,238,1)) drop-shadow(0 0 2px rgba(196,181,253,0.85))",
    },
  },
  overlays: [
    overlay(
      "w3-field",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.55]",
      {
        background:
          "radial-gradient(circle at 20% 26%, rgba(167,139,250,0.11), transparent 42%), radial-gradient(circle at 84% 74%, rgba(34,211,238,0.08), transparent 44%)",
      }
    ),
    overlay(
      "w3-scan-trace",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.22]",
      {
        background:
          "repeating-linear-gradient(180deg, rgba(167,139,250,0.065) 0 1px, transparent 1px 5px), repeating-linear-gradient(92deg, rgba(34,211,238,0.045) 0 1px, transparent 1px 7px), repeating-linear-gradient(-8deg, rgba(196,181,253,0.04) 0 1px, transparent 1px 9px)",
      }
    ),
    overlay(
      "w3-noise",
      "pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-screen opacity-[0.09]",
      {
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(224,242,254,0.62)", width: "0.58", dash: "0.35 0.85" },
    selectedRingClassName:
      "ring-2 ring-cyan-200/98 ring-offset-1 ring-offset-slate-950 scale-[1.03] shadow-[0_0_18px_rgba(34,211,238,0.48)]",
    selectedRingHqClassName:
      "ring-2 ring-violet-100/95 ring-offset-1 ring-offset-violet-950/70 scale-[1.04] shadow-[0_0_20px_rgba(167,139,250,0.32)]",
    overlays: [
      overlay(
        "w3-field-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.5]",
        {
          background:
            "radial-gradient(circle at 50% 36%, rgba(167,139,250,0.09), transparent 50%)",
        }
      ),
      overlay(
        "w3-scan-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.14]",
        {
          background:
            "repeating-linear-gradient(180deg, rgba(34,211,238,0.055) 0 1px, transparent 1px 7px)",
        }
      ),
    ],
    mapBadgeText: "Signal",
    mapBadgeClassName: "max-w-[42%] sm:max-w-none tracking-[0.16em] sm:tracking-[0.24em]",
    links: {
      normal: { stroke: "rgba(167,139,250,0.22)", width: "0.42", dash: "0.55 1.05" },
    },
    dots: {
      normal: { r: "0.66", filter: "drop-shadow(0 0 1px rgba(34,211,238,0.45))" },
      selectedActive: { r: "0.9", filter: "drop-shadow(0 0 3px rgba(34,211,238,0.95))" },
    },
  },
};

/** Reactor scar — chamber + conduit stress; heat stays behind nodes */
const WORLD_4_MAP_THEME = {
  linkStrokeLinecap: "round",
  mapShellClassName: "rounded-3xl",
  mapInnerClassName:
    "rounded-3xl bg-gradient-to-b from-orange-950/25 via-orange-950/10 to-slate-950/48 ring-1 ring-inset ring-orange-400/38 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.12),inset_0_0_64px_rgba(249,115,22,0.07),inset_0_-28px_56px_rgba(251,113,133,0.05)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] max-w-[46%] truncate rounded-md border border-rose-400/50 bg-orange-950/58 px-2 py-0.5 text-[8px] font-black uppercase leading-tight tracking-[0.2em] text-orange-50 shadow-[0_0_18px_rgba(249,115,22,0.22)] sm:max-w-none sm:px-2.5 sm:text-[9px] sm:tracking-[0.22em]",
  mapBadgeText: "Thermal grid",
  labelClassName: "text-orange-100/78",
  linkSelected: {
    stroke: "rgba(255,247,230,0.62)",
    width: "0.72",
    dash: "0.55 0.55",
  },
  selectedRingClassName:
    "ring-2 ring-orange-100/98 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_26px_rgba(249,115,22,0.52)]",
  selectedRingHqClassName:
    "ring-2 ring-rose-100/98 ring-offset-2 ring-offset-orange-950/45 scale-[1.05] shadow-[0_0_30px_rgba(251,113,133,0.42),0_0_14px_rgba(249,115,22,0.32)]",
  hqIconClassName: "text-orange-50 drop-shadow-[0_0_10px_rgba(249,115,22,0.55)]",
  regularIconClassName: "text-rose-100 drop-shadow-[0_0_5px_rgba(251,113,133,0.4)]",
  node: {
    regularClassName:
      "ring-1 ring-orange-500/34 shadow-[inset_0_1px_0_rgba(255,220,200,0.06)]",
    hqClassName:
      "ring-2 ring-orange-400/55 shadow-[0_0_24px_rgba(249,115,22,0.34),inset_0_1px_0_rgba(255,230,210,0.09)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(249,115,22,0.28)", width: "0.52", dash: "0.4 0.72" },
    warning: { stroke: "rgba(251,191,36,0.36)", width: "0.56", dash: "0.3 0.55" },
    critical: { stroke: "rgba(244,63,94,0.42)", width: "0.66", dash: "1.35 0.65" },
  },
  dots: {
    normal: {
      fill: "rgba(253,186,116,0.58)",
      r: "0.76",
      filter: "drop-shadow(0 0 2px rgba(249,115,22,0.75))",
    },
    warning: {
      fill: "rgba(251,191,36,0.6)",
      r: "0.88",
      filter: "drop-shadow(0 0 2px rgba(251,191,36,0.75))",
    },
    critical: {
      fill: "rgba(244,63,94,0.74)",
      r: "1.04",
      filter: "drop-shadow(0 0 2.5px rgba(244,63,94,0.85))",
    },
    selectedFill: "rgba(255,255,250,0.995)",
    selectedActive: {
      r: "1.08",
      filter:
        "drop-shadow(0 0 3.5px rgba(255,247,230,0.9)) drop-shadow(0 0 2.5px rgba(249,115,22,0.8))",
    },
  },
  overlays: [
    overlay(
      "w4-chamber",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.72]",
      {
        background:
          "radial-gradient(circle at 50% 46%, rgba(249,115,22,0.14), transparent 54%), radial-gradient(ellipse 125% 80% at 50% 112%, rgba(251,113,133,0.11), transparent 50%)",
      }
    ),
    overlay(
      "w4-conduit-heat",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.18]",
      {
        background:
          "repeating-linear-gradient(180deg, rgba(255,210,170,0.06) 0 2px, transparent 2px 9px), repeating-radial-gradient(circle at 50% 44%, rgba(255,255,255,0.05) 0 1px, transparent 1px 11px)",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(255,247,230,0.48)", width: "0.6", dash: "0.65 0.6" },
    selectedRingClassName:
      "ring-2 ring-orange-100/98 ring-offset-1 ring-offset-slate-950 scale-[1.03] shadow-[0_0_20px_rgba(249,115,22,0.48)]",
    selectedRingHqClassName:
      "ring-2 ring-rose-100/98 ring-offset-1 ring-offset-orange-950/45 scale-[1.04] shadow-[0_0_22px_rgba(251,113,133,0.35)]",
    overlays: [
      overlay(
        "w4-chamber-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.65]",
        {
          background:
            "radial-gradient(circle at 50% 50%, rgba(249,115,22,0.12), transparent 52%)",
        }
      ),
    ],
    mapBadgeText: "Reactor",
    mapBadgeClassName: "max-w-[42%] sm:max-w-none",
    links: {
      normal: { stroke: "rgba(249,115,22,0.24)", width: "0.48", dash: "0.45 0.78" },
    },
    dots: {
      normal: { r: "0.7", filter: "drop-shadow(0 0 1.5px rgba(249,115,22,0.65))" },
      selectedActive: { r: "0.92", filter: "drop-shadow(0 0 3px rgba(249,115,22,0.82))" },
    },
  },
};

/** Salvage graveyard — scrapfield haze + patched runs; solids on nodes */
const WORLD_5_MAP_THEME = {
  linkStrokeLinecap: "round",
  mapShellClassName: "rounded-3xl",
  mapInnerClassName:
    "rounded-3xl bg-gradient-to-tl from-amber-950/14 via-slate-950/46 to-emerald-950/14 ring-1 ring-inset ring-emerald-500/28 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.08),inset_0_0_52px_rgba(16,185,129,0.045)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] max-w-[46%] truncate rounded-md border border-dashed border-emerald-400/45 bg-emerald-950/62 px-2 py-0.5 text-[8px] font-black uppercase leading-tight tracking-[0.18em] text-emerald-50 shadow-[0_0_14px_rgba(16,185,129,0.18)] sm:max-w-none sm:px-2.5 sm:text-[9px] sm:tracking-[0.2em]",
  mapBadgeText: "Salvage field",
  labelClassName: "text-amber-100/72",
  linkSelected: {
    stroke: "rgba(110,231,183,0.58)",
    width: "0.64",
    dash: "2.6 0.45",
  },
  selectedRingClassName:
    "ring-2 ring-emerald-200/95 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_22px_rgba(16,185,129,0.42)]",
  selectedRingHqClassName:
    "ring-2 ring-amber-200/95 ring-offset-2 ring-offset-emerald-950/35 scale-[1.05] shadow-[0_0_26px_rgba(245,158,11,0.34),0_0_12px_rgba(52,211,153,0.22)]",
  hqIconClassName: "text-amber-100 drop-shadow-[0_0_8px_rgba(245,158,11,0.42)]",
  regularIconClassName: "text-emerald-100 drop-shadow-[0_0_4px_rgba(16,185,129,0.3)]",
  node: {
    regularClassName:
      "ring-1 ring-dashed ring-emerald-500/38 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
    hqClassName:
      "ring-2 ring-amber-500/48 shadow-[0_0_20px_rgba(245,158,11,0.26),inset_0_1px_0_rgba(255,255,255,0.05)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(52,211,153,0.24)", width: "0.48", dash: "2.8 1.05" },
    warning: { stroke: "rgba(245,158,11,0.32)", width: "0.54", dash: "2.0 0.75" },
    critical: { stroke: "rgba(244,63,94,0.38)", width: "0.62", dash: "1.1 0.55" },
  },
  dots: {
    normal: {
      fill: "rgba(16,185,129,0.52)",
      r: "0.72",
      filter: "drop-shadow(0 0 1.4px rgba(245,158,11,0.45))",
    },
    warning: {
      fill: "rgba(245,158,11,0.58)",
      r: "0.86",
      filter: "drop-shadow(0 0 1.6px rgba(180,83,9,0.48))",
    },
    critical: {
      fill: "rgba(244,63,94,0.72)",
      r: "1.02",
      filter: "drop-shadow(0 0 2.2px rgba(244,63,94,0.78))",
    },
    selectedFill: "rgba(240,253,250,0.995)",
    selectedActive: {
      r: "1.04",
      filter:
        "drop-shadow(0 0 3.2px rgba(110,231,183,0.88)) drop-shadow(0 0 2px rgba(245,158,11,0.55))",
    },
  },
  overlays: [
    overlay(
      "w5-scrapfield",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.38]",
      {
        background:
          "radial-gradient(ellipse 95% 58% at 50% 100%, rgba(87,83,78,0.08), transparent 52%), radial-gradient(ellipse 70% 48% at 18% 18%, rgba(16,185,129,0.06), transparent 46%), linear-gradient(170deg, rgba(15,23,42,0.18) 0%, transparent 44%, rgba(16,185,129,0.045) 100%)",
      }
    ),
    overlay(
      "w5-grit",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.14]",
      {
        backgroundImage:
          "radial-gradient(circle at 14% 24%, rgba(245,158,11,0.1) 0, transparent 2px), radial-gradient(circle at 76% 62%, rgba(16,185,129,0.08) 0, transparent 2px)",
        backgroundSize: "140px 140px, 110px 110px",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(110,231,183,0.46)", width: "0.54", dash: "2.2 0.4" },
    selectedRingClassName:
      "ring-2 ring-emerald-200/95 ring-offset-1 ring-offset-slate-950 scale-[1.03] shadow-[0_0_16px_rgba(16,185,129,0.38)]",
    selectedRingHqClassName:
      "ring-2 ring-amber-200/95 ring-offset-1 ring-offset-emerald-950/35 scale-[1.04] shadow-[0_0_18px_rgba(245,158,11,0.3)]",
    overlays: [
      overlay(
        "w5-scrap-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.28]",
        {
          background:
            "linear-gradient(180deg, transparent 0%, rgba(16,185,129,0.045) 100%)",
        }
      ),
    ],
    mapBadgeText: "Salvage",
    mapBadgeClassName: "max-w-[42%] sm:max-w-none",
    links: {
      normal: { stroke: "rgba(52,211,153,0.2)", width: "0.44", dash: "2.4 0.95" },
    },
    dots: {
      normal: { r: "0.64", filter: "drop-shadow(0 0 1px rgba(245,158,11,0.4))" },
      selectedActive: { r: "0.86", filter: "drop-shadow(0 0 2.8px rgba(52,211,153,0.82))" },
    },
  },
};

/** Nexus prime — command grid + soft nexus wash; crisp sync foreground */
const WORLD_6_MAP_THEME = {
  linkStrokeLinecap: "round",
  mapShellClassName: "rounded-3xl",
  mapInnerClassName:
    "rounded-3xl bg-gradient-to-b from-slate-900/55 via-slate-950/50 to-slate-900/55 ring-1 ring-inset ring-cyan-200/28 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),inset_0_0_56px_rgba(34,211,238,0.05),inset_0_0_72px_rgba(167,139,250,0.04)]",
  mapBadgeClassName:
    "pointer-events-none z-[2] max-w-[46%] truncate rounded-sm border border-cyan-200/50 bg-slate-950/82 px-2 py-0.5 text-[8px] font-black uppercase leading-tight tracking-[0.22em] text-white shadow-[0_0_16px_rgba(34,211,238,0.22),inset_0_1px_0_rgba(255,255,255,0.1)] sm:max-w-none sm:rounded sm:px-2.5 sm:text-[9px] sm:tracking-[0.26em]",
  mapBadgeText: "Command nexus",
  labelClassName: "text-cyan-50/85",
  linkSelected: {
    stroke: "rgba(255,255,255,0.52)",
    width: "0.62",
    dash: "2.6 1.35",
  },
  selectedRingClassName:
    "ring-2 ring-cyan-50/98 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_26px_rgba(34,211,238,0.48)]",
  selectedRingHqClassName:
    "ring-2 ring-white/98 ring-offset-2 ring-offset-slate-950 scale-[1.06] shadow-[0_0_32px_rgba(34,211,238,0.42),0_0_14px_rgba(167,139,250,0.28)]",
  hqIconClassName: "text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.55)]",
  regularIconClassName: "text-cyan-50 drop-shadow-[0_0_4px_rgba(167,139,250,0.28)]",
  node: {
    regularClassName:
      "ring-1 ring-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
    hqClassName:
      "ring-2 ring-cyan-300/52 shadow-[0_0_22px_rgba(34,211,238,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(34,211,238,0.26)", width: "0.46", dash: "2.35 1.75" },
    warning: { stroke: "rgba(196,181,253,0.32)", width: "0.52", dash: "1.75 1.25" },
    critical: { stroke: "rgba(244,63,94,0.38)", width: "0.62", dash: "1.25 0.8" },
  },
  dots: {
    normal: {
      fill: "rgba(224,242,254,0.58)",
      r: "0.72",
      filter: "drop-shadow(0 0 1.6px rgba(167,139,250,0.55))",
    },
    warning: {
      fill: "rgba(196,181,253,0.55)",
      r: "0.86",
      filter: "drop-shadow(0 0 1.7px rgba(34,211,238,0.55))",
    },
    critical: {
      fill: "rgba(244,63,94,0.72)",
      r: "1.02",
      filter: "drop-shadow(0 0 2.2px rgba(244,63,94,0.82))",
    },
    selectedFill: "rgba(255,255,255,0.998)",
    selectedActive: {
      r: "1.06",
      filter:
        "drop-shadow(0 0 3.2px rgba(255,255,255,0.88)) drop-shadow(0 0 2.2px rgba(34,211,238,0.92))",
    },
  },
  overlays: [
    overlay(
      "w6-command-grid",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.14]",
      {
        background:
          "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.038) 1px, transparent 1px), linear-gradient(45deg, transparent 47.5%, rgba(167,139,250,0.04) 48.5%, rgba(167,139,250,0.04) 51.5%, transparent 52.5%), linear-gradient(-45deg, transparent 47.5%, rgba(34,211,238,0.032) 48.5%, rgba(34,211,238,0.032) 51.5%, transparent 52.5%)",
        backgroundSize: "20px 20px, 20px 20px, 26px 26px, 26px 26px",
      }
    ),
    overlay(
      "w6-nexus",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.48]",
      {
        background:
          "radial-gradient(circle at 50% 42%, rgba(34,211,238,0.09), transparent 50%), radial-gradient(circle at 50% 54%, rgba(167,139,250,0.07), transparent 56%)",
      }
    ),
  ],
  mobileAdjustments: {
    linkSelected: { stroke: "rgba(255,255,255,0.4)", width: "0.52", dash: "2.2 1.25" },
    selectedRingClassName:
      "ring-2 ring-cyan-50/98 ring-offset-1 ring-offset-slate-950 scale-[1.03] shadow-[0_0_18px_rgba(34,211,238,0.44)]",
    selectedRingHqClassName:
      "ring-2 ring-white/98 ring-offset-1 ring-offset-slate-950 scale-[1.05] shadow-[0_0_22px_rgba(34,211,238,0.36)]",
    overlays: [
      overlay(
        "w6-nexus-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.42]",
        {
          background:
            "radial-gradient(circle at 50% 46%, rgba(34,211,238,0.08), transparent 52%)",
        }
      ),
      overlay(
        "w6-grid-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.09]",
        {
          background:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }
      ),
    ],
    mapBadgeText: "Nexus",
    mapBadgeClassName: "max-w-[40%] sm:max-w-none",
    links: {
      normal: { stroke: "rgba(34,211,238,0.2)", width: "0.42", dash: "2.1 1.55" },
    },
    dots: {
      normal: { r: "0.64", filter: "drop-shadow(0 0 1.2px rgba(167,139,250,0.45))" },
      selectedActive: { r: "0.92", filter: "drop-shadow(0 0 2.8px rgba(34,211,238,0.88))" },
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
  if (m.linkStrokeLinecap !== undefined) out.linkStrokeLinecap = m.linkStrokeLinecap;
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
  if (m.mapMobileRootClassName) {
    out.mapMobileRootClassName = [theme.mapMobileRootClassName || "", m.mapMobileRootClassName]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return out;
}
