import { world1FrontierBase } from "./world1FrontierBase";
import { world2FreightOrbit } from "./world2FreightOrbit";
import { world3SignalWastes } from "./world3SignalWastes";
import { world4ReactorScar } from "./world4ReactorScar";
import { world5SalvageGraveyard } from "./world5SalvageGraveyard";
import { world6NexusPrime } from "./world6NexusPrime";

export const WORLDS = [
  world1FrontierBase,
  world2FreightOrbit,
  world3SignalWastes,
  world4ReactorScar,
  world5SalvageGraveyard,
  world6NexusPrime,
].sort((a, b) => a.order - b.order);

export const WORLD_MAX_ORDER = 6;

export const WORLD_BY_ORDER = Object.fromEntries(WORLDS.map((w) => [w.order, w]));

export const WORLD_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));

export function getWorldDailyMleoCapByOrder(order) {
  const o = Math.max(1, Math.min(WORLD_MAX_ORDER, Number(order || 1)));
  return WORLD_BY_ORDER[o]?.dailyMleoCap ?? 3400;
}

export function resolveSectorWorldOrder(state) {
  const raw = state?.sectorWorld ?? state?.sector_world;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(WORLD_MAX_ORDER, n);
}
