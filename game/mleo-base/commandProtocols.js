/**
 * Command Protocols — Phase 1A + 1B MVP (economy-safe).
 * Multipliers must stay aligned with `base_reconcile_state` in `styles/sql/base_server_authority.sql`.
 */

export const PHASE_1A_COMMAND_PROTOCOL_IDS = [
  "none",
  "steady_ops",
  "liquidity_drill",
  "signal_focus",
  "gold_over_watch",
  "data_over_watch",
];

const ID_SET = new Set(PHASE_1A_COMMAND_PROTOCOL_IDS);

/** Phase 1C UI: family tag labels (gameplay unchanged). */
export const COMMAND_PROTOCOL_FAMILY_LABEL = {
  clean: "Clean",
  tradeoff: "Tradeoff",
};

/**
 * Phase 1E / 1H: mismatch copy (Crew + Overview); single source so surfaces stay aligned.
 */
export const COMMAND_PROTOCOL_STORED_INACTIVE_OVERVIEW =
  "Stored protocol is not yet effective at your commander level.";

export const COMMAND_PROTOCOL_DOCTRINE_CONTEXT_OVERVIEW = {
  steady_ops: "Effective doctrine: slightly higher maintenance relief.",
  liquidity_drill: "Effective doctrine: gold routines emphasized.",
  signal_focus: "Effective doctrine: DATA routines emphasized.",
  gold_over_watch: "Effective doctrine: gold focus with a small maintenance offset.",
  data_over_watch: "Effective doctrine: DATA focus with a small gold offset.",
};

/** UI + docs: unlock thresholds and copy */
export const PHASE_1A_COMMAND_PROTOCOLS = [
  {
    id: "none",
    name: "Standard Posture",
    shortDesc: "Baseline doctrine; no protocol modifiers.",
    minCommanderLevel: 1,
    bestWhen: "Fit: neutral baseline, no doctrine offset.",
  },
  {
    id: "steady_ops",
    name: "Steady Ops",
    shortDesc: "Maintenance relief +2.5%",
    minCommanderLevel: 2,
    family: "clean",
    bestWhen: "Fit: rising maintenance load; steadier ops.",
  },
  {
    id: "liquidity_drill",
    name: "Liquidity Drill",
    shortDesc: "Gold output +2%",
    minCommanderLevel: 3,
    family: "clean",
    bestWhen: "Fit: extra gold without adding a new drawback.",
  },
  {
    id: "signal_focus",
    name: "Signal Focus",
    shortDesc: "DATA output +2.5%",
    minCommanderLevel: 4,
    family: "clean",
    bestWhen: "Fit: extra DATA without spreading pressure elsewhere.",
  },
  {
    id: "gold_over_watch",
    name: "Gold Overwatch",
    shortDesc: "Gold +2.5%, maintenance relief −1.5%",
    minCommanderLevel: 5,
    family: "tradeoff",
    bestWhen: "Fit: gold priority over a small maintenance comfort cost.",
  },
  {
    id: "data_over_watch",
    name: "Data Overwatch",
    shortDesc: "DATA +3%, gold −1.5%",
    minCommanderLevel: 6,
    family: "tradeoff",
    bestWhen: "Fit: DATA priority over a small gold efficiency cost.",
  },
];

export function normalizeCommandProtocolId(raw) {
  const s = String(raw ?? "none")
    .trim()
    .toLowerCase();
  if (!ID_SET.has(s)) return "none";
  return s;
}

export function isCommandProtocolUnlocked(protocolId, commanderLevel) {
  const id = normalizeCommandProtocolId(protocolId);
  const lv = Math.max(1, Math.floor(Number(commanderLevel ?? 1)));
  const row = PHASE_1A_COMMAND_PROTOCOLS.find((p) => p.id === id);
  if (!row) return false;
  return lv >= row.minCommanderLevel;
}

/** Effective protocol for gameplay: invalid or locked → none */
export function resolveEffectiveCommandProtocol(state) {
  const id = normalizeCommandProtocolId(
    state?.commandProtocolActive ?? state?.command_protocol_active
  );
  const lv = Math.max(1, Math.floor(Number(state?.commanderLevel ?? state?.commander_level ?? 1)));
  if (id === "none") return "none";
  if (!isCommandProtocolUnlocked(id, lv)) return "none";
  return id;
}

/**
 * Apply command protocol multipliers after all other derive factors (incl. hq × stability on gold/data).
 * Only touches maintenanceRelief, goldMult, dataMult — never bankBonus / mleoMult.
 */
export function applyPhase1ACommandProtocolToDerivedRates(effectiveId, rates) {
  const maintenanceRelief = Number(rates?.maintenanceRelief ?? 1);
  const goldMult = Number(rates?.goldMult ?? 1);
  const dataMult = Number(rates?.dataMult ?? 1);
  if (effectiveId === "steady_ops") {
    return { maintenanceRelief: maintenanceRelief * 1.025, goldMult, dataMult };
  }
  if (effectiveId === "liquidity_drill") {
    return { maintenanceRelief, goldMult: goldMult * 1.02, dataMult };
  }
  if (effectiveId === "signal_focus") {
    return { maintenanceRelief, goldMult, dataMult: dataMult * 1.025 };
  }
  if (effectiveId === "gold_over_watch") {
    return {
      maintenanceRelief: maintenanceRelief * 0.985,
      goldMult: goldMult * 1.025,
      dataMult,
    };
  }
  if (effectiveId === "data_over_watch") {
    return {
      maintenanceRelief,
      goldMult: goldMult * 0.985,
      dataMult: dataMult * 1.03,
    };
  }
  return { maintenanceRelief, goldMult, dataMult };
}
