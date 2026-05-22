/** Re-export live Solo V2 keys from product registry (single source of truth). */
import { SOLO_V2_GAME_KEYS as REGISTRY_KEYS } from "../../../lib/solo-v2/registry.js";

export const SOLO_V2_GAME_KEYS = [...REGISTRY_KEYS];

export function gameKeyToApiSegment(gameKey) {
  return String(gameKey).replace(/_/g, "-");
}

export const CONSERVATIVE_GAMES = ["odd_even", "quick_flip", "dice_pick"];
export const AGGRESSIVE_GAMES = ["surge_cashout", "solo_ladder", "core_balance", "relic_draft"];
export const CASHOUT_GAMES = ["surge_cashout", "echo_sequence", "pulse_lock", "safe_zone"];
