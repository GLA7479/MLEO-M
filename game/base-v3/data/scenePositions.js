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
  // Center (slightly below geometric center for better flow + bottom layers)
  hq: { x: 50, y: 54 },

  // Upper-right (core systems)
  powerCell: { x: 78, y: 22 },
  researchLab: { x: 70, y: 30 },

  // Upper-left (ecosystem / trade)
  tradeHub: { x: 22, y: 20 },

  // Mid-left (support / activity / control)
  salvage: { x: 18, y: 44 },
  arcadeHub: { x: 27, y: 40 },
  minerControl: { x: 30, y: 32 },

  // Lower-left (production)
  refinery: { x: 24, y: 62 },
  quarry: { x: 16, y: 72 },

  // Right / lower-right (command / export)
  expeditionBay: { x: 84, y: 42 },
  logisticsCenter: { x: 86, y: 58 },
  repairBay: { x: 78, y: 72 },
};

// Links from HQ for energy/routes (visual only)
export const SCENE_LINK_KEYS = ["quarry", "tradeHub", "powerCell", "salvage", "refinery"];
