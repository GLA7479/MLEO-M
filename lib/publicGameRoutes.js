/**
 * Public-facing route & query aliases for neutral URLs.
 * Arcade single-player pathnames resolve to canonical app ids via arcadeGameIds; legacy DB ids are derived only where APIs require them.
 */

import {
  PUBLIC_PATH_SEGMENT_TO_APP_ID,
  APP_ID_TO_LEGACY_DB,
  getArcadeAppIdFromPathname as getArcadeAppIdFromPathnameBase,
  getCanonicalPathForAppId,
  legacyDbIdFromAppId,
  appIdFromLegacyDbId,
} from "./arcadeGameIds";

export { getArcadeAppIdFromPathnameBase as getArcadeAppIdFromPathname, getCanonicalPathForAppId };

/** First path segment (no slashes) -> legacy internal game id for arcade-online room registry & MP (unchanged). */
export const PUBLIC_PATH_SEGMENT_TO_INTERNAL_GAME_ID = Object.fromEntries(
  Object.entries(PUBLIC_PATH_SEGMENT_TO_APP_ID).map(([seg, appId]) => [seg, APP_ID_TO_LEGACY_DB[appId]])
);

/** Reverse: internal legacy id -> canonical public path segment */
export const INTERNAL_GAME_ID_TO_PUBLIC_PATH_SEGMENT = Object.fromEntries(
  Object.entries(PUBLIC_PATH_SEGMENT_TO_INTERNAL_GAME_ID).map(([path, id]) => [id, path])
);

/**
 * @param {string} pathname e.g. "/21-challenge"
 * @returns {string} Legacy internal game id for arcade session / Supabase when path is a mapped arcade route; otherwise first path segment (legacy behavior for unmapped paths)
 */
export function getInternalGameIdFromPathname(pathname) {
  const appId = getArcadeAppIdFromPathnameBase(pathname);
  if (appId) return legacyDbIdFromAppId(appId);
  if (!pathname || typeof pathname !== "string") return "";
  const seg = pathname.replace(/^\/+/, "").split("/")[0] || "";
  return seg;
}

/**
 * @param {string} internalId legacy e.g. "blackjack"
 * @returns {string} Path with leading slash, e.g. "/21-challenge"
 */
export function getCanonicalPathForInternalGameId(internalId) {
  const appId = appIdFromLegacyDbId(internalId);
  if (appId) return getCanonicalPathForAppId(appId);
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
