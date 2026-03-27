import { SOLO_V2_GAMES } from "../registry";

export function getAllSoloV2Games() {
  return SOLO_V2_GAMES.map((game, index) => ({
    gameKey: game.key,
    route: game.route,
    title: game.title,
    shortDescription: game.shortDescription,
    sortOrder: index + 1,
    status: game.status,
    enabled: game.status !== "disabled",
  }));
}

export function getSoloV2GameByKey(gameKey) {
  return getAllSoloV2Games().find((game) => game.gameKey === gameKey) || null;
}
