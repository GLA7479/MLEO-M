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
  selectedRingClassName: "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950 scale-[1.04]",
  hqIconClassName: "text-emerald-300",
  regularIconClassName: "",
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
  },
  overlays: [],
  mobileAdjustments: null,
};

function overlay(key, className, style) {
  return { key, className, style };
}

/** Orbital freight — amber / cyan lanes, cargo-route feel */
const WORLD_2_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-slate-950/55 shadow-[inset_0_0_80px_rgba(251,191,36,0.06)] ring-1 ring-inset ring-amber-400/25",
  mapInnerClassName: "rounded-[1.15rem] ring-1 ring-cyan-400/20",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-lg border border-amber-400/35 bg-amber-950/55 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-100/90 shadow-[0_0_20px_rgba(251,191,36,0.12)]",
  mapBadgeText: "Freight orbit",
  labelClassName: "text-white/80",
  selectedRingClassName:
    "ring-2 ring-cyan-200/85 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_22px_rgba(34,211,238,0.25)]",
  hqIconClassName: "text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.45)]",
  regularIconClassName: "text-cyan-100/90",
  node: {
    regularClassName: "shadow-[0_0_12px_rgba(34,211,238,0.08)]",
    hqClassName: "shadow-[0_0_18px_rgba(251,191,36,0.15)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(251,191,36,0.2)", width: "0.5", dash: "1.5 1.1" },
    warning: { stroke: "rgba(251,191,36,0.32)", width: "0.55", dash: "1.2 1.0" },
    critical: { stroke: "rgba(244,63,94,0.3)", width: "0.62", dash: "2.0 1.2" },
  },
  dots: {
    normal: {
      fill: "rgba(34,211,238,0.5)",
      r: "0.75",
      filter: "drop-shadow(0 0 1.2px rgba(251,191,36,0.9))",
    },
    warning: {
      fill: "rgba(251,191,36,0.58)",
      r: "0.88",
      filter: "drop-shadow(0 0 1.4px rgba(251,191,36,0.85))",
    },
    critical: {
      fill: "rgba(244,63,94,0.68)",
      r: "1.05",
      filter: "drop-shadow(0 0 2px rgba(244,63,94,0.75))",
    },
    selectedFill: "rgba(254,252,232,0.96)",
  },
  overlays: [
    overlay(
      "w2-orbit-glow",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-90",
      {
        background:
          "radial-gradient(ellipse 95% 65% at 50% 108%, rgba(251,191,36,0.14), transparent 58%), radial-gradient(ellipse 70% 45% at 12% 18%, rgba(34,211,238,0.08), transparent 50%)",
      }
    ),
    overlay(
      "w2-lanes",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.35]",
      {
        backgroundImage: `repeating-linear-gradient(
          -12deg,
          transparent,
          transparent 7px,
          rgba(34,211,238,0.04) 7px,
          rgba(34,211,238,0.04) 8px
        )`,
      }
    ),
  ],
  mobileAdjustments: {
    mapInnerClassName: "ring-cyan-400/12",
    overlays: [
      overlay(
        "w2-orbit-glow-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-80",
        {
          background:
            "radial-gradient(ellipse 100% 70% at 50% 100%, rgba(251,191,36,0.11), transparent 55%)",
        }
      ),
    ],
    mapBadgeText: "Freight",
    links: {
      normal: { stroke: "rgba(251,191,36,0.17)", width: "0.46", dash: "1.4 1.2" },
    },
    dots: {
      normal: { r: "0.68", filter: "drop-shadow(0 0 0.8px rgba(251,191,36,0.7))" },
    },
  },
};

/** Signal wastes — violet / cyan telemetry */
const WORLD_3_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-slate-950/60 shadow-[inset_0_0_70px_rgba(167,139,250,0.08)] ring-1 ring-inset ring-violet-400/28",
  mapInnerClassName: "rounded-[1.15rem] ring-1 ring-cyan-400/15",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-lg border border-violet-400/35 bg-violet-950/50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-violet-100/90 shadow-[0_0_18px_rgba(167,139,250,0.18)]",
  mapBadgeText: "Signal scan",
  labelClassName: "text-white/78",
  selectedRingClassName:
    "ring-2 ring-violet-200/80 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_24px_rgba(167,139,250,0.28)]",
  hqIconClassName: "text-cyan-200 drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]",
  regularIconClassName: "text-violet-200/90",
  node: {
    regularClassName: "shadow-[0_0_14px_rgba(167,139,250,0.1)]",
    hqClassName: "shadow-[0_0_20px_rgba(34,211,238,0.12)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(167,139,250,0.22)", width: "0.46", dash: "0.9 1.6" },
    warning: { stroke: "rgba(34,211,238,0.28)", width: "0.52", dash: "1.4 1.2" },
    critical: { stroke: "rgba(244,63,94,0.3)", width: "0.6", dash: "2.0 1.1" },
  },
  dots: {
    normal: {
      fill: "rgba(196,181,253,0.55)",
      r: "0.72",
      filter: "drop-shadow(0 0 1.5px rgba(34,211,238,0.65))",
    },
    warning: {
      fill: "rgba(34,211,238,0.52)",
      r: "0.86",
      filter: "drop-shadow(0 0 1.6px rgba(167,139,250,0.75))",
    },
    critical: {
      fill: "rgba(244,63,94,0.68)",
      r: "1.02",
      filter: "drop-shadow(0 0 2px rgba(244,63,94,0.8))",
    },
    selectedFill: "rgba(237,233,254,0.96)",
  },
  overlays: [
    overlay(
      "w3-field",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.85]",
      {
        background:
          "radial-gradient(circle at 20% 30%, rgba(167,139,250,0.12), transparent 42%), radial-gradient(circle at 82% 70%, rgba(34,211,238,0.1), transparent 45%)",
      }
    ),
    overlay(
      "w3-scan",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.22]",
      {
        background:
          "repeating-linear-gradient(180deg, rgba(167,139,250,0.07) 0 1px, transparent 1px 5px), repeating-linear-gradient(90deg, rgba(34,211,238,0.05) 0 1px, transparent 1px 7px)",
      }
    ),
    overlay(
      "w3-noise",
      "pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-screen opacity-[0.12]",
      {
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
      }
    ),
  ],
  mobileAdjustments: {
    overlays: [
      overlay(
        "w3-field-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-75",
        {
          background:
            "radial-gradient(circle at 50% 40%, rgba(167,139,250,0.1), transparent 50%)",
        }
      ),
    ],
    mapBadgeText: "Signal",
    links: {
      normal: { stroke: "rgba(167,139,250,0.19)", width: "0.44", dash: "0.9 1.5" },
    },
  },
};

/** Reactor scar — orange / rose thermal */
const WORLD_4_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-slate-950/65 shadow-[inset_0_0_90px_rgba(249,115,22,0.1)] ring-1 ring-inset ring-orange-400/35",
  mapInnerClassName: "rounded-[1.15rem] ring-1 ring-rose-400/25",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-lg border border-orange-400/40 bg-orange-950/45 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-orange-100/95 shadow-[0_0_22px_rgba(249,115,22,0.2)]",
  mapBadgeText: "Thermal grid",
  labelClassName: "text-white/75",
  selectedRingClassName:
    "ring-2 ring-orange-200/85 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_26px_rgba(251,113,133,0.35)]",
  hqIconClassName: "text-orange-200 drop-shadow-[0_0_12px_rgba(249,115,22,0.45)]",
  regularIconClassName: "text-rose-100/85",
  node: {
    regularClassName: "shadow-[0_0_14px_rgba(249,115,22,0.12)]",
    hqClassName: "shadow-[0_0_22px_rgba(251,113,133,0.18)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(249,115,22,0.24)", width: "0.52", dash: "1.1 1.3" },
    warning: { stroke: "rgba(251,191,36,0.3)", width: "0.56", dash: "1.0 1.0" },
    critical: { stroke: "rgba(244,63,94,0.34)", width: "0.64", dash: "1.8 1.0" },
  },
  dots: {
    normal: {
      fill: "rgba(251,146,60,0.58)",
      r: "0.76",
      filter: "drop-shadow(0 0 2px rgba(249,115,22,0.85))",
    },
    warning: {
      fill: "rgba(251,191,36,0.58)",
      r: "0.9",
      filter: "drop-shadow(0 0 2px rgba(251,191,36,0.75))",
    },
    critical: {
      fill: "rgba(244,63,94,0.72)",
      r: "1.06",
      filter: "drop-shadow(0 0 2.5px rgba(244,63,94,0.85))",
    },
    selectedFill: "rgba(255,247,237,0.97)",
  },
  overlays: [
    overlay(
      "w4-core",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-95",
      {
        background:
          "radial-gradient(circle at 50% 50%, rgba(249,115,22,0.14), transparent 55%), radial-gradient(ellipse 120% 80% at 50% 110%, rgba(251,113,133,0.12), transparent 50%)",
      }
    ),
    overlay(
      "w4-heat",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.18]",
      {
        background:
          "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0 1px, transparent 1px 14px)",
      }
    ),
  ],
  mobileAdjustments: {
    overlays: [
      overlay(
        "w4-core-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-80",
        {
          background:
            "radial-gradient(circle at 50% 55%, rgba(249,115,22,0.12), transparent 52%)",
        }
      ),
    ],
    mapBadgeText: "Reactor",
    links: {
      normal: { stroke: "rgba(249,115,22,0.2)", width: "0.48", dash: "1.1 1.3" },
    },
  },
};

/** Salvage graveyard — emerald / amber industrial */
const WORLD_5_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-slate-950/70 shadow-[inset_0_0_85px_rgba(16,185,129,0.07)] ring-1 ring-inset ring-emerald-500/25",
  mapInnerClassName: "rounded-[1.15rem] ring-1 ring-amber-500/20",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-lg border border-emerald-400/35 bg-emerald-950/45 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100/90 shadow-[0_0_18px_rgba(16,185,129,0.15)]",
  mapBadgeText: "Salvage field",
  labelClassName: "text-white/78",
  selectedRingClassName:
    "ring-2 ring-emerald-200/80 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_22px_rgba(245,158,11,0.22)]",
  hqIconClassName: "text-amber-200 drop-shadow-[0_0_8px_rgba(245,158,11,0.35)]",
  regularIconClassName: "text-emerald-200/88",
  node: {
    regularClassName: "shadow-[0_0_12px_rgba(16,185,129,0.1)]",
    hqClassName: "shadow-[0_0_20px_rgba(245,158,11,0.12)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(52,211,153,0.22)", width: "0.48", dash: "1.6 1.4" },
    warning: { stroke: "rgba(245,158,11,0.28)", width: "0.54", dash: "1.3 1.1" },
    critical: { stroke: "rgba(244,63,94,0.3)", width: "0.6", dash: "2.0 1.1" },
  },
  dots: {
    normal: {
      fill: "rgba(16,185,129,0.52)",
      r: "0.74",
      filter: "drop-shadow(0 0 1.2px rgba(245,158,11,0.55))",
    },
    warning: {
      fill: "rgba(245,158,11,0.56)",
      r: "0.88",
      filter: "drop-shadow(0 0 1.4px rgba(245,158,11,0.65))",
    },
    critical: {
      fill: "rgba(244,63,94,0.68)",
      r: "1.04",
      filter: "drop-shadow(0 0 2px rgba(244,63,94,0.78))",
    },
    selectedFill: "rgba(236,253,245,0.96)",
  },
  overlays: [
    overlay(
      "w5-dust",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.2]",
      {
        backgroundImage:
          "radial-gradient(circle at 10% 20%, rgba(245,158,11,0.15) 0, transparent 3px), radial-gradient(circle at 70% 60%, rgba(16,185,129,0.12) 0, transparent 2px), radial-gradient(circle at 40% 80%, rgba(180,83,9,0.1) 0, transparent 2px)",
        backgroundSize: "120px 120px, 90px 90px, 100px 100px",
      }
    ),
    overlay(
      "w5-floor",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.35]",
      {
        background:
          "linear-gradient(165deg, rgba(15,23,42,0.4) 0%, transparent 45%, rgba(16,185,129,0.06) 100%)",
      }
    ),
  ],
  mobileAdjustments: {
    overlays: [
      overlay(
        "w5-floor-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-40",
        {
          background:
            "linear-gradient(180deg, transparent 0%, rgba(16,185,129,0.05) 100%)",
        }
      ),
    ],
    mapBadgeText: "Salvage",
    links: {
      normal: { stroke: "rgba(52,211,153,0.19)", width: "0.45", dash: "1.5 1.3" },
    },
  },
};

/** Nexus prime — cyan / violet / white command */
const WORLD_6_MAP_THEME = {
  mapShellClassName:
    "rounded-3xl bg-slate-950/75 shadow-[inset_0_0_60px_rgba(34,211,238,0.08),inset_0_0_100px_rgba(167,139,250,0.06)] ring-1 ring-inset ring-cyan-300/25",
  mapInnerClassName: "rounded-[1.15rem] ring-1 ring-white/15",
  mapBadgeClassName:
    "pointer-events-none z-[2] rounded-lg border border-cyan-300/35 bg-slate-950/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.2)]",
  mapBadgeText: "Command nexus",
  labelClassName: "text-white/82",
  selectedRingClassName:
    "ring-2 ring-white/90 ring-offset-2 ring-offset-slate-950 scale-[1.04] shadow-[0_0_28px_rgba(167,139,250,0.35),0_0_12px_rgba(34,211,238,0.25)]",
  hqIconClassName: "text-white drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]",
  regularIconClassName: "text-cyan-100/90",
  node: {
    regularClassName: "shadow-[0_0_14px_rgba(167,139,250,0.12)]",
    hqClassName: "shadow-[0_0_22px_rgba(34,211,238,0.18)]",
    warningClassName: "",
    criticalClassName: "",
  },
  links: {
    normal: { stroke: "rgba(34,211,238,0.22)", width: "0.46", dash: "1.8 1.6" },
    warning: { stroke: "rgba(196,181,253,0.3)", width: "0.52", dash: "1.2 1.2" },
    critical: { stroke: "rgba(244,63,94,0.32)", width: "0.62", dash: "1.6 0.9" },
  },
  dots: {
    normal: {
      fill: "rgba(224,242,254,0.58)",
      r: "0.72",
      filter: "drop-shadow(0 0 1.5px rgba(167,139,250,0.7))",
    },
    warning: {
      fill: "rgba(196,181,253,0.55)",
      r: "0.86",
      filter: "drop-shadow(0 0 1.6px rgba(34,211,238,0.65))",
    },
    critical: {
      fill: "rgba(244,63,94,0.7)",
      r: "1.02",
      filter: "drop-shadow(0 0 2px rgba(244,63,94,0.82))",
    },
    selectedFill: "rgba(255,255,255,0.98)",
  },
  overlays: [
    overlay(
      "w6-grid",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.14]",
      {
        background:
          "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }
    ),
    overlay(
      "w6-nexus",
      "pointer-events-none absolute inset-0 rounded-[inherit] opacity-90",
      {
        background:
          "radial-gradient(circle at 50% 42%, rgba(34,211,238,0.1), transparent 50%), radial-gradient(circle at 50% 50%, rgba(167,139,250,0.08), transparent 58%)",
      }
    ),
  ],
  mobileAdjustments: {
    overlays: [
      overlay(
        "w6-nexus-m",
        "pointer-events-none absolute inset-0 rounded-[inherit] opacity-75",
        {
          background:
            "radial-gradient(circle at 50% 45%, rgba(34,211,238,0.09), transparent 52%)",
        }
      ),
    ],
    mapBadgeText: "Nexus",
    links: {
      normal: { stroke: "rgba(34,211,238,0.19)", width: "0.44", dash: "1.6 1.4" },
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
  if (m.mapBadgeText !== undefined) out.mapBadgeText = m.mapBadgeText;
  if (m.mapBadgeClassName) {
    out.mapBadgeClassName = [theme.mapBadgeClassName, m.mapBadgeClassName].filter(Boolean).join(" ").trim();
  }
  if (m.selectedRingClassName) out.selectedRingClassName = m.selectedRingClassName;
  if (m.labelClassName) out.labelClassName = [theme.labelClassName, m.labelClassName].filter(Boolean).join(" ").trim();
  return out;
}
