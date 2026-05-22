import { SOLO_V2_GAME_KEYS } from "./soloGames.mjs";
import { OV2_LOBBY_ACTIVE_GAMES } from "./ov2Games.mjs";

const MONTH_DAYS = 30;

/** Each live Solo V2 game is assigned to at least one sim day in the 30-day plan. */
export function buildMonthlySoloCoveragePlan() {
  const plan = {};
  for (let day = 1; day <= MONTH_DAYS; day++) {
    plan[day] = [];
  }
  SOLO_V2_GAME_KEYS.forEach((gameKey, i) => {
    const primaryDay = (i % MONTH_DAYS) + 1;
    plan[primaryDay].push(gameKey);
    const secondaryDay = ((i + 7) % MONTH_DAYS) + 1;
    if (secondaryDay !== primaryDay) plan[secondaryDay].push(gameKey);
  });
  return plan;
}

export function soloGamesForSimDay(simDay) {
  const plan = buildMonthlySoloCoveragePlan();
  return plan[simDay] || [];
}

/** Rotate active OV2 lobby games across days. */
export function ov2GameForSimDay(simDay) {
  const games = OV2_LOBBY_ACTIVE_GAMES;
  if (!games.length) return null;
  return games[(simDay - 1) % games.length];
}

export function allSoloGameKeys() {
  return [...SOLO_V2_GAME_KEYS];
}

export function allOv2GameIds() {
  return OV2_LOBBY_ACTIVE_GAMES.map(g => g.id);
}
