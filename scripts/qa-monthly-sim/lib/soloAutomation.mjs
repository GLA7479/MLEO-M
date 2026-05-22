import { SOLO_V2_GAME_KEYS } from "./soloGames.mjs";

/** Games with known client_action event payloads in driver. */
export const SOLO_EVENT_AUTOMATED = new Set(["quick_flip", "odd_even"]);

/** Games resolved via dedicated launch/cashout (or similar) API flows. */
export const SOLO_SPECIAL_RESOLVE = new Set(["surge_cashout"]);

/** Games where we attempt create + resolve without full play automation. */
export const SOLO_RESOLVE_ATTEMPT = SOLO_V2_GAME_KEYS.filter(k => !SOLO_EVENT_AUTOMATED.has(k));

export function soloAutomationStatus(gameKey, result) {
  if (SOLO_EVENT_AUTOMATED.has(gameKey) || SOLO_SPECIAL_RESOLVE.has(gameKey)) {
    if (result?.ok) return { status: "covered", reason: result?.reason || "automated_event_resolve" };
    if (result?.coverageGap) return { status: "coverage_gap", reason: result.reason };
    return { status: "error", reason: result?.error || "automated_failed" };
  }
  if (result?.coverageGap) return { status: "coverage_gap", reason: result.reason };
  if (result?.ok) return { status: "covered", reason: "create_resolve_ok" };
  const msg = String(result?.error || result?.data?.message || result?.data?.status || "");
  if (
    /choice_required|invalid_session|not_implemented|pending_migration|action must be launch or cashout|action must be climb or cashout|action must be reveal or cashout/i.test(
      msg
    )
  ) {
    return { status: "coverage_gap", reason: msg || "needs_game_specific_events" };
  }
  return { status: "error", reason: msg || "unknown" };
}
