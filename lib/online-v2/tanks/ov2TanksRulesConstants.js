/**
 * OV2 Tanks V1 — locked product numbers (client mirror of spec; server is authoritative).
 * Do not expand without an explicit product change.
 */

export const OV2_TANKS_PRODUCT_GAME_ID = "ov2_tanks";

export const OV2_TANKS_RULES_VERSION = "tanks_v1";

/** Turn wall clock (seconds). */
export const OV2_TANKS_TURN_SECONDS = 30;

/** Match cap: total completed turns before tie-break (30 each). */
export const OV2_TANKS_MATCH_MAX_TOTAL_TURNS = 60;

export const OV2_TANKS_STARTING_HP = 80;

/** Map size defaults (authoritative copy may live in session `public`). */
export const OV2_TANKS_DEFAULT_MAP_W = 960;
export const OV2_TANKS_DEFAULT_MAP_H = 540;

/** Terrain sample count (inclusive 0..N). */
export const OV2_TANKS_TERRAIN_SAMPLE_COUNT = 65;
