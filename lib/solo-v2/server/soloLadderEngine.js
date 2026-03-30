import { SOLO_LADDER_STEP_COUNT } from "../soloLadderConfig";

export function buildSoloLadderInitialActiveSummary() {
  return {
    phase: "solo_ladder_active",
    stepCount: SOLO_LADDER_STEP_COUNT,
    successCount: 0,
  };
}
