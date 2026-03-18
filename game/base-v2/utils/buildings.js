import { BUILDINGS } from "../data/buildings";

export function getBuildingDef(key) {
  return BUILDINGS.find((item) => item.key === key) || null;
}

export function buildingCost(defOrKey, level) {
  const def =
    typeof defOrKey === "string" ? getBuildingDef(defOrKey) : defOrKey;
  if (!def) return {};

  const base = def.baseCost || {};
  const growth = Number(def.growth || 1);
  const nextLevel = Math.max(1, level + 1);

  const factor = Math.pow(growth, Math.max(0, nextLevel - 1));
  const cost = {};
  for (const [key, value] of Object.entries(base)) {
    cost[key] = Math.round(Number(value || 0) * factor);
  }
  return cost;
}

export function canAfford(resources, cost) {
  if (!resources) return false;
  return Object.entries(cost).every(
    ([key, value]) => Number(resources[key] || 0) >= Number(value || 0)
  );
}

