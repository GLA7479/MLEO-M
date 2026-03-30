export const RELIC_DRAFT_PHASE_ACTIVE = "relic_draft_active";
export const RELIC_DRAFT_PHASE_RESOLVED = "relic_draft_resolved";

/** @typedef {{ thresholdShift: number; payoutPercentBonus: number; freeMistakes: number }} RunModifiers */

export const RELIC_CATALOG = {
  aegis_plate: {
    key: "aegis_plate",
    label: "Aegis Plate",
    blurb: "+7 encounter odds. Bulwark for the next beats.",
    thresholdShift: 7,
    payoutPercentBonus: 0,
    freeMistakes: 0,
  },
  steady_kit: {
    key: "steady_kit",
    label: "Steady Kit",
    blurb: "+4 odds. Slower tilts on bad variance.",
    thresholdShift: 4,
    payoutPercentBonus: 0,
    freeMistakes: 0,
  },
  risk_sigil: {
    key: "risk_sigil",
    label: "Risk Sigil",
    blurb: "+15% payout if the run clears; encounters bite harder.",
    thresholdShift: -5,
    payoutPercentBonus: 15,
    freeMistakes: 0,
  },
  second_wind: {
    key: "second_wind",
    label: "Second Wind",
    blurb: "Absorb one failed encounter — run keeps going.",
    thresholdShift: 0,
    payoutPercentBonus: -4,
    freeMistakes: 1,
  },
  soft_focus: {
    key: "soft_focus",
    label: "Soft Focus",
    blurb: "+6 odds; gentler pressure on the trail.",
    thresholdShift: 6,
    payoutPercentBonus: 0,
    freeMistakes: 0,
  },
  gilded_ward: {
    key: "gilded_ward",
    label: "Gilded Ward",
    blurb: "+6 odds at the cost of −9% final payout.",
    thresholdShift: 6,
    payoutPercentBonus: -9,
    freeMistakes: 0,
  },
  voltaic_core: {
    key: "voltaic_core",
    label: "Voltaic Core",
    blurb: "+10% payout; encounters −3 odds.",
    thresholdShift: -3,
    payoutPercentBonus: 10,
    freeMistakes: 0,
  },
};

export const RELIC_KEYS = Object.keys(RELIC_CATALOG);

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

/**
 * Three distinct relic offers for this draft step.
 */
export function rollRelicOffers(sessionId, draftRound) {
  const rng = mulberry32((hashUuidToSeed(sessionId) + draftRound * 9176) >>> 0);
  const pool = [...RELIC_KEYS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  return pool.slice(0, 3).map(k => {
    const r = RELIC_CATALOG[k];
    return { key: r.key, label: r.label, blurb: r.blurb };
  });
}

function rollEncounterSuccess(sessionId, encounterRound, thresholdShiftSum) {
  const rng = mulberry32((hashUuidToSeed(sessionId) + encounterRound * 12011 + 33333) >>> 0);
  const roll = Math.floor(rng() * 10000);
  const baseLine = 5200;
  const line = Math.min(8700, Math.max(2600, baseLine + thresholdShiftSum * 125));
  return roll < line;
}

/**
 * @param {string} sessionId
 */
export function buildRelicDraftInitialSummary(sessionId) {
  const maxRounds = 5;
  const offers = rollRelicOffers(sessionId, 1);
  return {
    phase: RELIC_DRAFT_PHASE_ACTIVE,
    round: 1,
    maxRounds,
    awaitingPick: true,
    thresholdShift: 0,
    payoutPercentBonus: 0,
    freeMistakes: 0,
    offers,
    picks: [],
    lastEncounter: null,
  };
}

/**
 * @param {unknown} summary
 */
export function parseRelicDraftActiveSummary(summary) {
  const s = summary || {};
  if (s.phase !== RELIC_DRAFT_PHASE_ACTIVE) return null;
  const round = Math.floor(Number(s.round) || 0);
  const maxRounds = Math.floor(Number(s.maxRounds) || 0);
  if (round < 1 || maxRounds < 3 || maxRounds > 8) return null;
  if (typeof s.awaitingPick !== "boolean") return null;
  const thresholdShift = Math.floor(Number(s.thresholdShift) || 0);
  const payoutPercentBonus = Math.floor(Number(s.payoutPercentBonus) || 0);
  const freeMistakes = Math.max(0, Math.floor(Number(s.freeMistakes) || 0));
  const offers = Array.isArray(s.offers) ? s.offers : [];
  const picks = Array.isArray(s.picks) ? s.picks : [];
  return {
    round,
    maxRounds,
    awaitingPick: s.awaitingPick,
    thresholdShift,
    payoutPercentBonus,
    freeMistakes,
    offers,
    picks,
    lastEncounter: s.lastEncounter || null,
  };
}

export function normalizeRelicPickKey(raw, offerKeys) {
  const v = String(raw || "").trim();
  const allowed = new Set(offerKeys);
  if (!allowed.has(v)) return null;
  return v;
}

/**
 * Apply pick + encounter for current round; returns terminal or next active summary fields.
 * @param {string} sessionId
 * @param {NonNullable<ReturnType<typeof parseRelicDraftActiveSummary>>} active
 * @param {string} relicKey
 */
export function advanceRelicDraftRun(sessionId, active, relicKey) {
  const def = RELIC_CATALOG[relicKey];
  if (!def) return { kind: "error" };

  let thresholdShift = active.thresholdShift + def.thresholdShift;
  let payoutPercentBonus = active.payoutPercentBonus + def.payoutPercentBonus;
  let freeMistakes = active.freeMistakes + def.freeMistakes;

  const encounterOk = rollEncounterSuccess(sessionId, active.round, thresholdShift);
  let absorbed = false;
  let survived = encounterOk;

  if (!encounterOk && freeMistakes > 0) {
    freeMistakes -= 1;
    absorbed = true;
    survived = true;
  }

  const picks = [
    ...active.picks,
    {
      round: active.round,
      key: relicKey,
      label: def.label,
      encounterOk,
      absorbed,
    },
  ];

  const lastEncounter = { encounterOk, absorbed, round: active.round };

  if (!survived) {
    return {
      kind: "lose",
      picks,
      lastEncounter,
      thresholdShift,
      payoutPercentBonus,
      freeMistakes,
    };
  }

  const doneRound = active.round;
  if (doneRound >= active.maxRounds) {
    return {
      kind: "win",
      picks,
      lastEncounter,
      thresholdShift,
      payoutPercentBonus,
      freeMistakes,
    };
  }

  const nextRound = active.round + 1;
  const offers = rollRelicOffers(sessionId, nextRound);

  return {
    kind: "continue",
    nextSummary: {
      phase: RELIC_DRAFT_PHASE_ACTIVE,
      round: nextRound,
      maxRounds: active.maxRounds,
      awaitingPick: true,
      thresholdShift,
      payoutPercentBonus,
      freeMistakes,
      offers,
      picks,
      lastEncounter,
    },
  };
}
