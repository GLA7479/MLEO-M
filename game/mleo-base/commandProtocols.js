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

/** UI + docs: unlock thresholds and copy */
export const PHASE_1A_COMMAND_PROTOCOLS = [
  {
    id: "none",
    name: "Standard Posture",
    shortDesc: "No protocol modifier.",
    minCommanderLevel: 1,
    bestWhen: "Best when: you want a neutral baseline with no protocol tradeoff.",
  },
  {
    id: "steady_ops",
    name: "Steady Ops",
    shortDesc: "Maintenance relief +2.5%",
    minCommanderLevel: 2,
    family: "clean",
    bestWhen: "Best when: maintenance pressure is rising and you want smoother operations.",
  },
  {
    id: "liquidity_drill",
    name: "Liquidity Drill",
    shortDesc: "Gold output +2%",
    minCommanderLevel: 3,
    family: "clean",
    bestWhen: "Best when: you want extra gold without taking on a new drawback.",
  },
  {
    id: "signal_focus",
    name: "Signal Focus",
    shortDesc: "DATA output +2.5%",
    minCommanderLevel: 4,
    family: "clean",
    bestWhen:
      "Best when: you want extra DATA without weakening other economic pressure points.",
  },
  {
    id: "gold_over_watch",
    name: "Gold Overwatch",
    shortDesc: "Gold +2.5%, maintenance relief −1.5%",
    minCommanderLevel: 5,
    family: "tradeoff",
    bestWhen:
      "Best when: gold demand matters more than a small maintenance comfort loss.",
  },
  {
    id: "data_over_watch",
    name: "Data Overwatch",
    shortDesc: "DATA +3%, gold −1.5%",
    minCommanderLevel: 6,
    family: "tradeoff",
    bestWhen: "Best when: DATA demand matters more than a small gold efficiency loss.",
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
