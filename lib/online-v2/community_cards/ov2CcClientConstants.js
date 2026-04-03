/** Client-visible timing hints (mirror server engine). */

export const OV2_CC_ACTION_MS = 15_000;
/** Server accepts actions until this long after actionDeadline (mobile / conflict safety). */
export const OV2_CC_ACTION_SERVER_GRACE_MS = 3_000;

/** Pause between hands (ms) — engine-driven; for UI hints only. */
export const OV2_CC_BETWEEN_HANDS_MS = 4_000;
