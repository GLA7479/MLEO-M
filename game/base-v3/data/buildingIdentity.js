// V3: unique visual identity per building for mobile game scene (not generic nodes).
// Short labels shown in scene: HQ, PWR, LAB, MINE, EXP, REP, TRD, SAL

export const BUILDING_IDENTITY = {
  hq: {
    label: "HQ",
    size: "lg", // largest node
    shape: "hex", // central anchor
    glow: "emerald",
    pulse: "breathe",
    icon: "◆",
  },
  quarry: {
    label: "MINE",
    size: "md",
    shape: "round",
    glow: "amber",
    pulse: "slow",
    icon: "◇",
  },
  tradeHub: {
    label: "TRD",
    size: "md",
    shape: "round",
    glow: "yellow",
    pulse: "slow",
    icon: "◎",
  },
  salvage: {
    label: "SAL",
    size: "md",
    shape: "round",
    glow: "lime",
    pulse: "slow",
    icon: "▣",
  },
  powerCell: {
    label: "PWR",
    size: "md",
    shape: "round",
    glow: "cyan",
    pulse: "flicker",
    icon: "⚡",
  },
  expeditionBay: {
    label: "EXP",
    size: "md",
    shape: "round",
    glow: "violet",
    pulse: "slow",
    icon: "◈",
  },
  researchLab: {
    label: "LAB",
    size: "md",
    shape: "round",
    glow: "indigo",
    pulse: "slow",
    icon: "◉",
  },
  repairBay: {
    label: "REP",
    size: "md",
    shape: "round",
    glow: "teal",
    pulse: "slow",
    icon: "⚙",
  },
};

export function getBuildingIdentity(key) {
  return BUILDING_IDENTITY[key] || { label: key.slice(0, 3).toUpperCase(), size: "md", shape: "round", glow: "slate", pulse: "none", icon: "•" };
}
