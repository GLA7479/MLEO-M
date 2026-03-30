import { payoutMultiplierForShadowTell, SHADOW_TELL_MIN_WAGER } from "../shadowTellConfig";

export const SHADOW_TELL_PHASE_ACTIVE = "shadow_tell_active";
export const SHADOW_TELL_PHASE_RESOLVED = "shadow_tell_resolved";

export const SHADOW_PROFILES = /** @type {const} */ (["weak", "balanced", "strong"]);

const CLUES = {
  weak: [
    "Weight shifts late — openings appear.",
    "Breathing runs shallow; tempo stutters.",
    "Eyes flick away first in the exchange.",
    "Footing resets twice before committing.",
  ],
  balanced: [
    "Centered stance — patience over flash.",
    "Mirrors your rhythm without overshooting.",
    "Hands stay loose; guard never drops.",
    "Quiet readiness — no wasted motion.",
  ],
  strong: [
    "First motion arrives before yours finishes.",
    "Shoulders square; weight springs forward.",
    "Minimal sway — pressure through the line.",
    "Timing eats space; no second guess.",
  ],
};

function hashUuidToSeed(uuid) {
  const s = String(uuid || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDistinct(pool, count, rng) {
  const copy = [...pool];
  const out = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {string} sessionId
 */
export function buildShadowTellInitialSummary(sessionId) {
  const rng = mulberry32(hashUuidToSeed(sessionId));
  const profile = SHADOW_PROFILES[Math.floor(rng() * 3)];
  const useThree = rng() >= 0.38;

  const others = SHADOW_PROFILES.filter((p) => p !== profile);
  const decoyProfile = others[Math.floor(rng() * others.length)];

  const truePool = CLUES[profile];
  const decoyPool = CLUES[decoyProfile];

  const solidCount = useThree ? 2 : 1;
  const solidTexts = pickDistinct(truePool, solidCount, rng);
  const decoyPick = pickDistinct(decoyPool, 1, rng)[0] || decoyPool[0];

  const combined = [...solidTexts, decoyPick];
  shuffleInPlace(combined, rng);

  const clues = combined.map((text, i) => ({ id: String(i), text }));

  return {
    phase: SHADOW_TELL_PHASE_ACTIVE,
    opponentProfile: profile,
    clues,
  };
}

/**
 * @param {unknown} summary
 * @returns {{ opponentProfile: string; clues: Array<{ id: string; text: string }> } | null}
 */
export function parseShadowTellActiveSummary(summary) {
  const s = summary || {};
  if (s.phase !== SHADOW_TELL_PHASE_ACTIVE) return null;
  const opponentProfile = String(s.opponentProfile || "");
  if (!SHADOW_PROFILES.includes(opponentProfile)) return null;
  const clues = Array.isArray(s.clues) ? s.clues : [];
  if (clues.length < 2 || clues.length > 3) return null;
  const normalized = clues.map((c, i) => ({
    id: String(c?.id ?? i),
    text: String(c?.text || "").trim(),
  }));
  if (normalized.some((c) => !c.text)) return null;
  return { opponentProfile, clues: normalized };
}

export function normalizeShadowTellChoice(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "challenge" || v === "press" || v === "aggressive") return "challenge";
  if (v === "safe" || v === "play_safe" || v === "cautious") return "safe";
  if (v === "middle" || v === "mid" || v === "split") return "middle";
  return null;
}

/**
 * @param {number} entryAmount
 * @param {string} profile
 * @param {"challenge"|"safe"|"middle"} choice
 */
export function computeShadowTellResolution(entryAmount, profile, choice) {
  const entry = Math.max(SHADOW_TELL_MIN_WAGER, Math.floor(Number(entryAmount) || 0));
  const mult = payoutMultiplierForShadowTell(
    SHADOW_PROFILES.includes(profile) ? profile : "balanced",
    choice,
  );
  const payoutReturn = Math.max(0, Math.floor(entry * mult));
  const isWin = payoutReturn >= entry;
  const terminalKind = isWin ? "win" : "lose";
  return {
    payoutReturn,
    terminalKind,
    isWin,
    multiplierUsed: mult,
  };
}
