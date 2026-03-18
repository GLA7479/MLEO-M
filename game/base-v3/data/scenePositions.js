// V3 scene: all 12 buildings, spatial zoning (center / production / systems / command / support).

export const SCENE_BUILDING_KEYS = [
  "hq",
  "quarry",
  "tradeHub",
  "salvage",
  "refinery",
  "powerCell",
  "minerControl",
  "arcadeHub",
  "expeditionBay",
  "logisticsCenter",
  "researchLab",
  "repairBay",
];

// Center: HQ
// Lower-left / left: quarry, salvage, refinery (production)
// Upper / upper-right: powerCell, researchLab (systems)
// Right / lower-right: expeditionBay, logisticsCenter, repairBay (command / export)
// Support band: tradeHub, minerControl, arcadeHub
export const SCENE_POSITIONS = {
  hq: { x: 50, y: 50 },
  quarry: { x: 20, y: 64 },
  salvage: { x: 16, y: 46 },
  refinery: { x: 24, y: 56 },
  tradeHub: { x: 32, y: 26 },
  minerControl: { x: 36, y: 36 },
  arcadeHub: { x: 30, y: 40 },
  powerCell: { x: 72, y: 22 },
  researchLab: { x: 68, y: 30 },
  expeditionBay: { x: 82, y: 44 },
  logisticsCenter: { x: 78, y: 56 },
  repairBay: { x: 76, y: 68 },
};

// Links from HQ for energy/routes (visual only)
export const SCENE_LINK_KEYS = ["quarry", "tradeHub", "powerCell", "salvage", "refinery"];
