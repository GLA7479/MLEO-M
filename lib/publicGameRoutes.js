/**
 * Public-facing route & query aliases for neutral URLs.
 * Internal arcade / Supabase game ids stay unchanged (e.g. "blackjack", "poker").
 */

/** First path segment (no slashes) -> stable internal game id for arcade APIs & Supabase room game_id */
export const PUBLIC_PATH_SEGMENT_TO_INTERNAL_GAME_ID = {
  "21-challenge": "blackjack",
  "card-arena": "poker",
  "color-wheel": "roulette",
  "card-duel": "baccarat",
  "dice-arena": "craps",
  "triple-dice": "sicbo",
  "symbol-match": "slots-upgraded",
  "triple-cards": "three-card-poker",
  "ultimate-cards": "ultimate-poker",
};

/** Reverse: internal id -> canonical public path segment */
export const INTERNAL_GAME_ID_TO_PUBLIC_PATH_SEGMENT = Object.fromEntries(
  Object.entries(PUBLIC_PATH_SEGMENT_TO_INTERNAL_GAME_ID).map(([path, id]) => [id, path])
);

/**
 * @param {string} pathname e.g. "/21-challenge" or "/symbol-match"
 * @returns {string} Internal game id for arcade session / vault (unchanged from pre-rename behavior)
 */
export function getInternalGameIdFromPathname(pathname) {
  if (!pathname || typeof pathname !== "string") return "";
  const seg = pathname.replace(/^\/+/, "").split("/")[0] || "";
  return PUBLIC_PATH_SEGMENT_TO_INTERNAL_GAME_ID[seg] || seg;
}

/**
 * @param {string} internalId e.g. "blackjack"
 * @returns {string} Path with leading slash, e.g. "/21-challenge"
 */
export function getCanonicalPathForInternalGameId(internalId) {
  const seg = INTERNAL_GAME_ID_TO_PUBLIC_PATH_SEGMENT[internalId];
  return seg ? `/${seg}` : `/${internalId}`;
}

// --- /arcade-online?game=... (query is public; RoomBrowser still uses internal ids) ---

/** Public query value -> internal registry / room id */
export const PUBLIC_GAME_QUERY_TO_INTERNAL_ID = {
  "challenge-21": "blackjack",
  "card-arena": "poker",
  "color-wheel": "roulette",
  blackjack: "blackjack",
  poker: "poker",
  roulette: "roulette",
};

/** Internal id -> preferred public query string (omit if same as internal) */
export const INTERNAL_ID_TO_PUBLIC_GAME_QUERY = {
  blackjack: "challenge-21",
  poker: "card-arena",
  roulette: "color-wheel",
};

/**
 * @param {string} queryValue raw `game` query param
 * @returns {string} Internal id for GAME_REGISTRY / RoomBrowser / MP components
 */
export function resolvePublicGameQueryToInternal(queryValue) {
  if (!queryValue || typeof queryValue !== "string") return queryValue;
  return PUBLIC_GAME_QUERY_TO_INTERNAL_ID[queryValue] || queryValue;
}

/**
 * @param {string} internalId
 * @returns {string} Canonical public query value for URL bar
 */
export function getCanonicalPublicGameQuery(internalId) {
  return INTERNAL_ID_TO_PUBLIC_GAME_QUERY[internalId] || internalId;
}
