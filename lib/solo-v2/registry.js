export const SOLO_V2_NAMESPACE = "solo-v2";

export const SOLO_V2_GAMES = [
  {
    key: "quick_flip",
    route: "/quick-flip",
    title: "Quick Flip",
    shortDescription: "Pick a side and reveal the server result.",
    status: "live",
  },
  {
    key: "mystery_box",
    route: "/mystery-box",
    title: "Mystery Box",
    shortDescription: "Choose one box and reveal its server outcome.",
    status: "scaffold",
  },
  {
    key: "dice_pick",
    route: "/dice-pick",
    title: "Dice Pick",
    shortDescription: "Choose a target range and lock your roll.",
    status: "live",
  },
  {
    key: "limit_run",
    route: "/limit-run",
    title: "Limit Run",
    shortDescription: "Six stages — rising load meter; lock under the redline before overload or the run breaches.",
    status: "live",
  },
  {
    key: "number_hunt",
    route: "/number-hunt",
    title: "Number Hunt",
    shortDescription: "Three guesses to find the hidden number 1–20 — higher/lower clues after each miss.",
    status: "live",
  },
  {
    key: "drop_run",
    route: "/drop-run",
    title: "Drop Run",
    shortDescription: "Drop and resolve through server-auth paths.",
    status: "scaffold",
  },
  {
    key: "speed_track",
    route: "/speed-track",
    title: "Speed Track",
    shortDescription: "Six checkpoints — choose a racing line each segment; server seals blocked lanes.",
    status: "live",
  },
  {
    key: "gold_rush_digger",
    route: "/gold-rush-digger",
    title: "Gold Rush Digger",
    shortDescription: "Reveal tiles with server-owned hazard layout.",
    status: "live",
  },
  {
    key: "treasure_doors",
    route: "/treasure-doors",
    title: "Treasure Doors",
    shortDescription: "Five chambers, three doors — find safe paths server-side.",
    status: "live",
  },
  {
    key: "triple_dice",
    route: "/triple-dice",
    title: "Triple Dice",
    shortDescription: "Resolve three-dice patterns from server rolls.",
    status: "scaffold",
  },
  {
    key: "challenge_21",
    route: "/challenge-21",
    title: "21 Challenge",
    shortDescription: "Play card decisions from a server-owned deck.",
    status: "scaffold",
  },
  {
    key: "high_low_cards",
    route: "/high-low-cards",
    title: "Hi-Lo Cards",
    shortDescription: "Guess next card direction from server sequence.",
    status: "scaffold",
  },
  {
    key: "mystery_chamber",
    route: "/mystery-chamber",
    title: "Mystery Chamber",
    shortDescription: "Advance chambers with server-validated risk.",
    status: "scaffold",
  },
];

export const SOLO_V2_GAME_KEYS = SOLO_V2_GAMES.map((game) => game.key);

export function getSoloV2GameByKey(gameKey) {
  return SOLO_V2_GAMES.find((game) => game.key === gameKey) || null;
}

export function getSoloV2GameByRoute(route) {
  return SOLO_V2_GAMES.find((game) => game.route === route) || null;
}
