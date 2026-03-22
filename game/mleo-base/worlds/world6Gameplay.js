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

const RESEARCH_LAB_MILESTONE_KEYS = ["matrix_operator", "telemetry_controller"];

function getOverclockActive(state) {
  const ocUntil = Number(state?.overclockUntil ?? state?.overclock_until ?? 0);
  return ocUntil > Date.now();
}

function calcWorld6CommandDiscipline({
  energyRatio,
  stability,
  banked,
  dataStored,
  scrapStored,
  logisticsLevel,
  researchLabLevel,
  powerCellLevel,
  repairBayLevel,
  refineryLevel,
  salvageLevel,
  tradeHubLevel,
  expeditionCenterLevel,
  researchActiveCount,
  labProgram,
  labMilestonesDone,
  overclockActive,
}) {
  let score = 50;

  score += Math.min(8, logisticsLevel * 1.5);
  score += Math.min(8, researchLabLevel * 1.5);
  score += Math.min(8, powerCellLevel * 1.5);
  score += Math.min(8, repairBayLevel * 1.5);
  score += Math.min(8, refineryLevel * 1.25);
  score += Math.min(6, salvageLevel * 1.25);
  score += Math.min(5, tradeHubLevel * 1.25);
  score += Math.min(5, expeditionCenterLevel * 1.25);

  if (stability >= 90) score += 14;
  else if (stability >= 84) score += 9;
  else if (stability >= 76) score += 3;
  else if (stability >= 68) score -= 8;
  else score -= 18;

  if (energyRatio >= 0.5) score += 14;
  else if (energyRatio >= 0.36) score += 8;
  else if (energyRatio >= 0.24) score += 2;
  else if (energyRatio >= 0.14) score -= 8;
  else score -= 18;

  if (banked >= 180 && banked <= 1200) score += 6;
  else if (banked > 1800) score -= 4;
  else if (banked < 80) score -= 4;

  if (dataStored >= 180 && dataStored <= 1800) score += 6;
  else if (dataStored < 80) score -= 6;

  if (scrapStored >= 220 && scrapStored <= 2200) score += 6;
  else if (scrapStored < 100) score -= 6;

  if (researchActiveCount >= 3) score += 6;
  else if (researchActiveCount === 0) score -= 8;

  if (labProgram) score += 5;
  else score -= 5;

  score += Math.min(6, labMilestonesDone * 3);

  const supportSpread = Math.max(
    logisticsLevel,
    researchLabLevel,
    powerCellLevel,
    repairBayLevel,
    refineryLevel,
    salvageLevel
  ) - Math.min(
    logisticsLevel,
    researchLabLevel,
    powerCellLevel,
    repairBayLevel,
    refineryLevel,
    salvageLevel
  );

  if (supportSpread <= 2) score += 10;
  else if (supportSpread <= 4) score += 4;
  else if (supportSpread >= 7) score -= 10;

  if (overclockActive) {
    if (energyRatio >= 0.42 && stability >= 84) score += 3;
    else score -= 10;
  }

  return clamp(Math.round(score), 0, 100);
}

export function getWorld6CommandSnapshot(state, derived = {}) {
  const worldOrder = resolveSectorWorldOrder(state);
  if (worldOrder !== 6) return null;

  const banked = Number(state?.bankedMleo ?? state?.banked_mleo ?? 0);
  const dataStored = Math.floor(Number(state?.resources?.DATA ?? 0));
  const scrapStored = Math.floor(Number(state?.resources?.SCRAP ?? state?.resources?.scrap ?? 0));
  const oreStored = Math.floor(Number(state?.resources?.ORE ?? state?.resources?.ore ?? 0));

  const energyNow = Number(state?.resources?.ENERGY ?? 0);
  const energyCap = Math.max(1, Number(derived?.energyCap ?? 1));
  const energyRatio = clamp(energyNow / energyCap, 0, 1);

  const stability = clamp(Number(state?.stability ?? 100), 0, 100);

  const logisticsLevel = Number(state?.buildings?.logisticsCenter ?? 0);
  const researchLabLevel = Number(state?.buildings?.researchLab ?? 0);
  const powerCellLevel = Number(state?.buildings?.powerCell ?? 0);
  const repairBayLevel = Number(state?.buildings?.repairBay ?? 0);
  const refineryLevel = Number(state?.buildings?.refinery ?? 0);
  const salvageLevel = Number(state?.buildings?.salvage ?? 0);
  const tradeHubLevel = Number(state?.buildings?.tradeHub ?? 0);
  const expeditionCenterLevel = Number(state?.buildings?.expeditionCenter ?? 0);

  const research = getResearchMap(state);
  const researchActiveCount = Object.keys(research).filter((k) => !!research[k]).length;

  const activeProgram =
    state?.supportProgramActive?.researchLab ??
    state?.support_program_active?.researchLab ??
    null;
  const labProgram = typeof activeProgram === "string" && activeProgram.length ? activeProgram : null;

  const claimed = getClaimedLabMilestones(state);
  const labMilestonesDone = RESEARCH_LAB_MILESTONE_KEYS.filter((k) => !!claimed[k]).length;

  const overclockActive = getOverclockActive(state);

  const disciplineScore = calcWorld6CommandDiscipline({
    energyRatio,
    stability,
    banked,
    dataStored,
    scrapStored,
    logisticsLevel,
    researchLabLevel,
    powerCellLevel,
    repairBayLevel,
    refineryLevel,
    salvageLevel,
    tradeHubLevel,
    expeditionCenterLevel,
    researchActiveCount,
    labProgram,
    labMilestonesDone,
    overclockActive,
  });

  let commandKey = "balanced";
  let commandLabel = "Balanced command";
  let commandTone = "sky";
  let commandState = "Integrated control";
  let actionHint =
    "Systems are coordinated. Keep all support layers reasonably aligned and avoid overcommitting one axis.";
  let reason =
    "No major endgame imbalance detected. Nexus Prime rewards broad system discipline over brute forcing one loop.";
  let recommendation =
    "Maintain balanced reserves, keep research / logistics / repair close together, and only push spikes on clean windows.";
  let riskText = "No immediate command-layer risk.";

  if (disciplineScore >= 78) {
    commandKey = "harmonized";
    commandLabel = "Harmonized grid";
    commandTone = "cyan";
    commandState = "Full-spectrum control";
    actionHint =
      "Excellent command window. This is the right moment for deliberate multi-system pushes across shipping, research, and recovery.";
    reason =
      "Core support layers, reserves, and system posture are aligned. Nexus Prime can absorb integrated pressure cleanly.";
    recommendation =
      "Push your best sequence now: ship, research, salvage, or overclock — but keep the rhythm deliberate.";
    riskText = "Low command-layer risk.";
  } else if (disciplineScore <= 44) {
    commandKey = "fractured";
    commandLabel = "Fractured grid";
    commandTone = "rose";
    commandState = "System drift";
    actionHint =
      "Do not force endgame pressure right now. One or more support layers are dragging the whole command stack down.";
    reason =
      "Nexus Prime is exposing coordination gaps: reserve quality, support spread, or active systems are out of sync.";
    recommendation =
      "Stabilize the weakest layer first, then restore overall balance before chasing output.";
    riskText = "Medium / high command-layer risk.";
  }

  const recommendedPushNow =
    commandKey === "harmonized"
      ? energyRatio >= 0.42 && stability >= 84
      : commandKey === "balanced"
        ? energyRatio >= 0.5 && stability >= 88 && banked >= 180
        : false;

  let priority = "Keep systems aligned";
  if (commandKey === "fractured") {
    if (energyRatio < 0.18) priority = "Recover energy before anything else";
    else if (stability < 76) priority = "Restore stability and maintenance first";
    else if (!labProgram) priority = "Re-establish research program discipline";
    else priority = "Fix the weakest support layer before pushing";
  } else if (commandKey === "harmonized" && recommendedPushNow) {
    priority = "Best moment for integrated push";
  }

  const overviewSystemsHint =
    commandKey === "fractured"
      ? priority
      : commandKey === "harmonized" && recommendedPushNow
        ? "Systems aligned — good moment for a coordinated push across tabs."
        : commandKey === "harmonized"
          ? "Strong alignment — wait for energy/stability thresholds before forcing."
          : "Balance reserves and support spread; push only when the stack is ready.";

  return {
    worldOrder: 6,
    banked,
    dataStored,
    scrapStored,
    oreStored,
    energyNow,
    energyCap,
    energyRatio,
    stability,
    logisticsLevel,
    researchLabLevel,
    powerCellLevel,
    repairBayLevel,
    refineryLevel,
    salvageLevel,
    tradeHubLevel,
    expeditionCenterLevel,
    researchActiveCount,
    labProgram,
    labMilestonesDone,
    overclockActive,
    disciplineScore,
    commandKey,
    commandLabel,
    commandTone,
    commandState,
    actionHint,
    reason,
    recommendation,
    riskText,
    priority,
    recommendedPushNow,
    compactLine: `${commandLabel} · Discipline ${disciplineScore}/100 · Energy ${pct(energyRatio)} · Stability ${Math.round(stability)} · Bank ${fmtInt(banked)}`,
    systemsLine: `Log ${logisticsLevel} · Lab ${researchLabLevel} · Power ${powerCellLevel} · Repair ${repairBayLevel} · Refinery ${refineryLevel} · Salvage ${salvageLevel}`,
    reservesLine: `DATA ${fmtInt(dataStored)} · Scrap ${fmtInt(scrapStored)} · Ore ${fmtInt(oreStored)} · Overclock ${overclockActive ? "live" : "idle"}`,
    commandLine: `Research ${researchActiveCount} · Program ${labProgram || "—"} · Milestones ${labMilestonesDone}/${RESEARCH_LAB_MILESTONE_KEYS.length} · ${commandState}`,
    chipText:
      commandKey === "harmonized"
        ? "Grid aligned"
        : commandKey === "fractured"
          ? "System drift"
          : "Integrated control",
    flowHeadline:
      commandKey === "harmonized"
        ? "Nexus grid is harmonized"
        : commandKey === "fractured"
          ? "Nexus grid is fractured"
          : "Nexus grid is balanced",
    overviewSystemsHint,
  };
}

export function buildWorld6CommandAlert(snapshot) {
  if (!snapshot) return null;

  if (snapshot.commandKey === "fractured") {
    return {
      key: "world6-command-fractured",
      tone: "warning",
      title: "Nexus coordination drifting",
      text: snapshot.priority || "World 6 command discipline is slipping.",
      target: { tab: "overview", target: "systems" },
    };
  }

  if (snapshot.commandKey === "harmonized" && snapshot.recommendedPushNow) {
    return {
      key: "world6-command-harmonized",
      tone: "success",
      title: "Harmonized command window",
      text: "Grid aligned — good moment for a coordinated multi-system push.",
      target: { tab: "overview", target: "systems" },
    };
  }

  return null;
}
