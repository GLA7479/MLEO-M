/**
 * Canonical arcade single-player app identifiers (app layer).
 * Legacy DB / RPC game_id strings are mapped only at session/vault boundaries — never change stored DB values from here.
 */

/** @type {Readonly<{ CHALLENGE_21: string, CARD_ARENA: string, COLOR_WHEEL: string, CARD_DUEL: string, DICE_ARENA: string, TRIPLE_DICE: string, SYMBOL_MATCH: string, TRIPLE_CARDS: string, ULTIMATE_CARDS: string }>} */
export const ARCADE_APP_IDS = Object.freeze({
  CHALLENGE_21: "challenge-21",
  CARD_ARENA: "card-arena",
  COLOR_WHEEL: "color-wheel",
  CARD_DUEL: "card-duel",
  DICE_ARENA: "dice-arena",
  TRIPLE_DICE: "triple-dice",
  SYMBOL_MATCH: "symbol-match",
  TRIPLE_CARDS: "triple-cards",
  ULTIMATE_CARDS: "ultimate-cards",
});

/** Public URL path segment (first segment) → canonical app id */
export const PUBLIC_PATH_SEGMENT_TO_APP_ID = Object.freeze({
  "21-challenge": ARCADE_APP_IDS.CHALLENGE_21,
  "card-arena": ARCADE_APP_IDS.CARD_ARENA,
  "color-wheel": ARCADE_APP_IDS.COLOR_WHEEL,
  "card-duel": ARCADE_APP_IDS.CARD_DUEL,
  "dice-arena": ARCADE_APP_IDS.DICE_ARENA,
  "triple-dice": ARCADE_APP_IDS.TRIPLE_DICE,
  "symbol-match": ARCADE_APP_IDS.SYMBOL_MATCH,
  "triple-cards": ARCADE_APP_IDS.TRIPLE_CARDS,
  "ultimate-cards": ARCADE_APP_IDS.ULTIMATE_CARDS,
});

/** Canonical app id → legacy string used by Supabase RPC (start_paid_session / start_freeplay_session / finish payload routing) */
export const APP_ID_TO_LEGACY_DB = Object.freeze({
  [ARCADE_APP_IDS.CHALLENGE_21]: "blackjack",
  [ARCADE_APP_IDS.CARD_ARENA]: "poker",
  [ARCADE_APP_IDS.COLOR_WHEEL]: "roulette",
  [ARCADE_APP_IDS.CARD_DUEL]: "baccarat",
  [ARCADE_APP_IDS.DICE_ARENA]: "craps",
  [ARCADE_APP_IDS.TRIPLE_DICE]: "sicbo",
  [ARCADE_APP_IDS.SYMBOL_MATCH]: "slots-upgraded",
  [ARCADE_APP_IDS.TRIPLE_CARDS]: "three-card-poker",
  [ARCADE_APP_IDS.ULTIMATE_CARDS]: "ultimate-poker",
});

/** @type {Readonly<Record<string, string>>} */
export const LEGACY_DB_TO_APP_ID = Object.freeze(
  Object.fromEntries(Object.entries(APP_ID_TO_LEGACY_DB).map(([appId, legacy]) => [legacy, appId]))
);

/** Canonical app id → first path segment (may differ from app id, e.g. challenge-21 ↔ 21-challenge) */
export const APP_ID_TO_PUBLIC_PATH_SEGMENT = Object.freeze({
  [ARCADE_APP_IDS.CHALLENGE_21]: "21-challenge",
  [ARCADE_APP_IDS.CARD_ARENA]: "card-arena",
  [ARCADE_APP_IDS.COLOR_WHEEL]: "color-wheel",
  [ARCADE_APP_IDS.CARD_DUEL]: "card-duel",
  [ARCADE_APP_IDS.DICE_ARENA]: "dice-arena",
  [ARCADE_APP_IDS.TRIPLE_DICE]: "triple-dice",
  [ARCADE_APP_IDS.SYMBOL_MATCH]: "symbol-match",
  [ARCADE_APP_IDS.TRIPLE_CARDS]: "triple-cards",
  [ARCADE_APP_IDS.ULTIMATE_CARDS]: "ultimate-cards",
});

/**
 * Second argument to debitSharedVault → POST /api/arcade/vault/claim → sync_vault_delta.p_game_id.
 * Keep exact legacy tag strings for DB continuity (see vault/claim handler).
 */
export const ARCADE_VAULT_DEBIT = Object.freeze({
  CHALLENGE_21_CLAIM: "blackjack-claim",
  CARD_ARENA: "poker",
  COLOR_WHEEL_CLAIM: "roulette-claim",
  CARD_DUEL_CLAIM: "baccarat-claim",
  DICE_ARENA_CLAIM: "craps-claim",
  TRIPLE_DICE: "sicbo",
  SYMBOL_MATCH_CLAIM: "slots-claim",
  TRIPLE_CARDS: "three-card-poker",
});

/** localStorage: prefer clean key; if missing, read legacy and copy to clean (do not delete legacy in this release). */
export const ARCADE_LS = Object.freeze({
  challenge21: { clean: "arcade_stats_challenge_21_v1", legacy: "mleo_blackjack_v3" },
  cardArena: { clean: "arcade_stats_card_arena_v1", legacy: "mleo_poker_v2" },
  colorWheel: { clean: "arcade_stats_color_wheel_v1", legacy: "mleo_roulette_v2" },
  cardDuel: { clean: "arcade_stats_card_duel_v1", legacy: "mleo_baccarat_v2" },
  diceArena: { clean: "arcade_stats_dice_arena_v1", legacy: "mleo_craps_v2" },
  tripleDice: { clean: "arcade_stats_triple_dice_v1", legacy: "mleo_sicbo_v2" },
  symbolMatch: { clean: "arcade_stats_symbol_match_v1", legacy: "mleo_slots_v2" },
  tripleCards: { clean: "arcade_stats_triple_cards_v1", legacy: "mleo_three_card_poker_v2" },
  ultimateCards: { clean: "arcade_stats_ultimate_cards_v1", legacy: "mleo_ultimate_poker_v1" },
});

/**
 * @param {string} pathname e.g. "/21-challenge"
 * @returns {string} Canonical app id or "" if not a mapped arcade single-player path
 */
export function getArcadeAppIdFromPathname(pathname) {
  if (!pathname || typeof pathname !== "string") return "";
  const seg = pathname.replace(/^\/+/, "").split("/")[0] || "";
  return PUBLIC_PATH_SEGMENT_TO_APP_ID[seg] || "";
}

/**
 * @param {string} appId
 * @returns {string}
 */
export function getCanonicalPathForAppId(appId) {
  const segment = APP_ID_TO_PUBLIC_PATH_SEGMENT[appId];
  return segment ? `/${segment}` : `/${appId}`;
}

/**
 * @param {string} appId
 * @returns {string}
 */
export function legacyDbIdFromAppId(appId) {
  return APP_ID_TO_LEGACY_DB[appId] || "";
}

/**
 * @param {string} legacyDbId
 * @returns {string}
 */
export function appIdFromLegacyDbId(legacyDbId) {
  return LEGACY_DB_TO_APP_ID[legacyDbId] || "";
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isKnownArcadeAppId(value) {
  return Boolean(value && APP_ID_TO_LEGACY_DB[value]);
}

/**
 * Safe stats read: prefer clean key; migrate from legacy once without removing legacy.
 * @param {string} legacyKey
 * @param {string} cleanKey
 * @param {Record<string, unknown>} fallback
 */
export function readArcadeLocalStats(legacyKey, cleanKey, fallback = {}) {
  if (typeof window === "undefined") return { ...fallback };

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {}
    return null;
  }

  const fromClean = read(cleanKey);
  if (fromClean) return { ...fallback, ...fromClean };

  const fromLegacy = read(legacyKey);
  if (fromLegacy) {
    try {
      localStorage.setItem(cleanKey, JSON.stringify(fromLegacy));
    } catch {}
    return { ...fallback, ...fromLegacy };
  }

  return { ...fallback };
}
