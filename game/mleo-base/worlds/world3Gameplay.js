import { resolveSectorWorldOrder } from "./catalog";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fmtInt(n) {
  const v = Math.floor(Number(n || 0));
  return Number.isFinite(v) ? String(v) : "0";
}

function pct(value, digits = 0) {
  const n = Number(value || 0) * 100;
  return `${n.toFixed(digits).replace(/\.0+$/, "")}%`;
}

const RESEARCH_LAB_MILESTONE_KEYS = ["matrix_operator", "telemetry_controller"];

function getResearchMap(state) {
  return state?.research && typeof state.research === "object" ? state.research : {};
}

function getClaimedLabMilestones(state) {
  return (
    state?.specializationMilestonesClaimed?.researchLab ??
    state?.specialization_milestones_claimed?.researchLab ??
    {}
  );
}

function calcWorld3SignalDiscipline({
  dataStored,
  researchActiveCount,
  labProgram,
  labMilestonesDone,
  researchLabLevel,
  expeditionCenterLevel,
  tradeHubLevel,
  stability,
  energyRatio,
}) {
  let score = 50;

  score += Math.min(18, researchLabLevel * 4);
  score += Math.min(10, expeditionCenterLevel * 2);
  score += Math.min(8, tradeHubLevel * 1.5);
  score += Math.min(10, labMilestonesDone * 5);

  if (researchActiveCount >= 4) score += 8;
  else if (researchActiveCount >= 2) score += 4;
  else if (researchActiveCount >= 1) score += 1;
  else score -= 8;

  if (labProgram) score += 8;
  else score -= 6;

  if (dataStored >= 250 && dataStored <= 2200) score += 10;
  else if (dataStored > 2200) score += 2;
  else if (dataStored >= 120) score += 4;
  else if (dataStored >= 60) score -= 2;
  else score -= 10;

  if (stability >= 90) score += 10;
  else if (stability >= 82) score += 6;
  else if (stability >= 74) score += 2;
  else if (stability >= 66) score -= 6;
  else score -= 14;

  if (energyRatio >= 0.45) score += 10;
  else if (energyRatio >= 0.30) score += 5;
  else if (energyRatio >= 0.20) score += 1;
  else if (energyRatio >= 0.12) score -= 6;
  else score -= 12;

  return clamp(Math.round(score), 0, 100);
}

export function getWorld3TelemetrySnapshot(state, derived = {}) {
  const worldOrder = resolveSectorWorldOrder(state);
  if (worldOrder !== 3) return null;

  const dataStored = Math.floor(Number(state?.resources?.DATA ?? 0));
  const research = getResearchMap(state);
  const researchActiveCount = Object.keys(research).filter((k) => !!research[k]).length;

  const active =
    state?.supportProgramActive?.researchLab ??
    state?.support_program_active?.researchLab ??
    null;
  const labProgram = typeof active === "string" && active.length ? active : null;

  const claimed = getClaimedLabMilestones(state);
  const labMilestonesDone = RESEARCH_LAB_MILESTONE_KEYS.filter((k) => !!claimed[k]).length;

  const researchLabLevel = Number(state?.buildings?.researchLab ?? 0);
  const expeditionCenterLevel = Number(state?.buildings?.expeditionCenter ?? 0);
  const tradeHubLevel = Number(state?.buildings?.tradeHub ?? 0);

  const stability = clamp(Number(state?.stability ?? 100), 0, 100);
  const energy = Number(state?.resources?.ENERGY ?? 0);
  const energyCap = Number(derived?.energyCap ?? 0);
  const energyRatio = energyCap > 0 ? clamp(energy / energyCap, 0, 1) : 1;

  const disciplineScore = calcWorld3SignalDiscipline({
    dataStored,
    researchActiveCount,
    labProgram,
    labMilestonesDone,
    researchLabLevel,
    expeditionCenterLevel,
    tradeHubLevel,
    stability,
    energyRatio,
  });

  let signalKey = "stable";
  let signalLabel = "Stable signal";
  let signalTone = "sky";
  let telemetryState = "Measured telemetry";
  let actionHint =
    "Signal load is manageable. Keep DATA meaningful and avoid wasting research pressure on weak windows.";
  let reason =
    "No severe telemetry bottleneck detected. Research, DATA, and support layers are working in balance.";
  let recommendation =
    "Maintain a healthy DATA reserve and keep the lab on a deliberate program.";
  let riskText = "No immediate telemetry risk.";

  if (disciplineScore >= 76) {
    signalKey = "clean";
    signalLabel = "Clean signal";
    signalTone = "violet";
    telemetryState = "High signal clarity";
    actionHint =
      "Excellent telemetry window. Good moment for decisive research progress and DATA spending.";
    reason =
      "DATA reserve, lab program, and support quality are aligned. The sector can absorb information pressure cleanly.";
    recommendation =
      dataStored >= 180
        ? "Push research / telemetry actions while the signal stays clean."
        : "Keep the lab program active and let DATA build slightly before heavy spend.";
    riskText = "Low telemetry risk.";
  } else if (disciplineScore <= 42) {
    signalKey = "noisy";
    signalLabel = "Noisy signal";
    signalTone = "amber";
    telemetryState = "Signal interference";
    actionHint =
      "Do not overextend DATA actions. Recover support quality before pushing more research pressure.";
    reason =
      "Telemetry support is lagging behind information pressure. The sector is producing noise instead of clarity.";
    recommendation =
      "Stabilize energy, maintain the lab, and avoid draining DATA on weak windows.";
    riskText = "Medium / high telemetry risk.";
  }

  const recommendedResearchNow =
    signalKey === "clean"
      ? dataStored >= 160
      : signalKey === "stable"
        ? dataStored >= 260 && stability >= 76 && energyRatio >= 0.24
        : false;

  let priority = "Protect DATA discipline";
  if (signalKey === "noisy") {
    if (energyRatio < 0.18) priority = "Recover energy before telemetry work";
    else if (stability < 76) priority = "Run maintenance before pushing research";
    else if (!labProgram) priority = "Activate a lab program";
    else if (dataStored < 100) priority = "Rebuild DATA buffer";
    else priority = "Reduce research noise";
  } else if (signalKey === "clean" && recommendedResearchNow) {
    priority = "Best moment for research push";
  }

  /** One line for Build / research panel — DATA & clarity, not logistics copy. */
  const researchPanelHint =
    signalKey === "noisy"
      ? priority
      : signalKey === "clean" && recommendedResearchNow
        ? "DATA clarity is high — good window to spend on research."
        : signalKey === "clean"
          ? "Signal is clean; let DATA build before heavy research spend."
          : recommendedResearchNow
            ? "Stable telemetry — research spend ok if DATA buffer holds."
            : "Hold DATA discipline and keep an active lab program.";

  return {
    worldOrder: 3,
    dataStored,
    researchActiveCount,
    labProgram,
    labMilestonesDone,
    researchLabLevel,
    expeditionCenterLevel,
    tradeHubLevel,
    stability,
    energyRatio,
    disciplineScore,
    signalKey,
    signalLabel,
    signalTone,
    telemetryState,
    actionHint,
    reason,
    recommendation,
    riskText,
    priority,
    recommendedResearchNow,
    compactLine: `${signalLabel} · Discipline ${disciplineScore}/100 · DATA ${fmtInt(dataStored)} · Energy ${pct(energyRatio)} · Stability ${Math.round(stability)}`,
    systemsLine: `Lab ${researchLabLevel} · Expedition ${expeditionCenterLevel} · Trade ${tradeHubLevel} · Research tracks ${researchActiveCount}`,
    telemetryLine: `DATA ${fmtInt(dataStored)} · Lab program ${labProgram || "—"} · Milestones ${labMilestonesDone}/${RESEARCH_LAB_MILESTONE_KEYS.length}`,
    chipText:
      signalKey === "clean"
        ? "Clear signal"
        : signalKey === "noisy"
          ? "Signal noise"
          : "Measured telemetry",
    flowHeadline:
      signalKey === "clean"
        ? "Telemetry window is clean"
        : signalKey === "noisy"
          ? "Telemetry is noisy"
          : "Telemetry is stable",
    researchPanelHint,
  };
}

export function buildWorld3TelemetryAlert(snapshot) {
  if (!snapshot) return null;

  if (snapshot.signalKey === "noisy") {
    return {
      key: "world3-telemetry-noisy",
      tone: "warning",
      title: "Signal interference rising",
      text: snapshot.priority || "World 3 telemetry discipline is slipping.",
      target: { tab: "crew", target: "research" },
    };
  }

  if (snapshot.signalKey === "clean" && snapshot.recommendedResearchNow) {
    return {
      key: "world3-telemetry-clean",
      tone: "success",
      title: "Clean telemetry window",
      text: "Signal clear — good moment for research / DATA spend.",
      target: { tab: "crew", target: "research" },
    };
  }

  return null;
}
