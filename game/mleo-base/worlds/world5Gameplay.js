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

function calcWorld5RecoveryDiscipline({
  scrapStored,
  oreStored,
  salvageLevel,
  quarryLevel,
  repairBayLevel,
  refineryLevel,
  stability,
  energyRatio,
}) {
  let score = 50;

  score += Math.min(16, salvageLevel * 4);
  score += Math.min(12, repairBayLevel * 3);
  score += Math.min(8, quarryLevel * 2);
  score += Math.min(6, refineryLevel * 1.5);

  if (scrapStored >= 300 && scrapStored <= 2500) score += 12;
  else if (scrapStored > 2500) score += 4;
  else if (scrapStored >= 140) score += 5;
  else score -= 10;

  if (oreStored >= 220 && oreStored <= 2000) score += 8;
  else if (oreStored > 2000) score += 2;
  else if (oreStored >= 90) score += 3;
  else score -= 8;

  if (stability >= 90) score += 10;
  else if (stability >= 82) score += 6;
  else if (stability >= 74) score += 2;
  else if (stability >= 66) score -= 7;
  else score -= 15;

  if (energyRatio >= 0.42) score += 10;
  else if (energyRatio >= 0.28) score += 5;
  else if (energyRatio >= 0.18) score += 1;
  else if (energyRatio >= 0.10) score -= 7;
  else score -= 13;

  if (repairBayLevel < salvageLevel - 1) score -= 10;
  if (refineryLevel > salvageLevel + 2) score -= 6;

  return clamp(Math.round(score), 0, 100);
}

export function getWorld5SalvagePressureSnapshot(state, derived = {}) {
  const worldOrder = resolveSectorWorldOrder(state);
  if (worldOrder !== 5) return null;

  const scrapStored = Math.floor(Number(state?.resources?.SCRAP ?? state?.resources?.scrap ?? 0));
  const oreStored = Math.floor(Number(state?.resources?.ORE ?? state?.resources?.ore ?? 0));
  const salvageLevel = Number(state?.buildings?.salvage ?? 0);
  const quarryLevel = Number(state?.buildings?.quarry ?? 0);
  const repairBayLevel = Number(state?.buildings?.repairBay ?? 0);
  const refineryLevel = Number(state?.buildings?.refinery ?? 0);
  const stability = clamp(Number(state?.stability ?? 100), 0, 100);

  const energyNow = Number(state?.resources?.ENERGY ?? 0);
  const energyCap = Math.max(1, Number(derived?.energyCap ?? 1));
  const energyRatio = clamp(energyNow / energyCap, 0, 1);

  const disciplineScore = calcWorld5RecoveryDiscipline({
    scrapStored,
    oreStored,
    salvageLevel,
    quarryLevel,
    repairBayLevel,
    refineryLevel,
    stability,
    energyRatio,
  });

  let salvageKey = "stable";
  let salvageLabel = "Stable recovery";
  let salvageTone = "sky";
  let salvageState = "Controlled salvage";
  let actionHint =
    "Recovery loop is stable. Keep scrap flow meaningful and avoid starving repair support.";
  let reason =
    "No major salvage bottleneck detected. Recovery and maintenance layers are still aligned.";
  let recommendation =
    "Keep scrap reserves healthy and let repair support stay close to salvage pressure.";
  let riskText = "No immediate salvage risk.";

  if (disciplineScore >= 76) {
    salvageKey = "rich";
    salvageLabel = "Rich recovery";
    salvageTone = "emerald";
    salvageState = "High-yield salvage";
    actionHint =
      "Excellent salvage window. Good moment to lean into recovery and keep the graveyard productive.";
    reason =
      "Scrap reserves, recovery support, and maintenance are aligned enough to absorb sustained salvage pressure.";
    recommendation =
      "Push salvage and recycling actions while support quality remains clean.";
    riskText = "Low salvage risk.";
  } else if (disciplineScore <= 42) {
    salvageKey = "strained";
    salvageLabel = "Strained recovery";
    salvageTone = "amber";
    salvageState = "Maintenance drag";
    actionHint =
      "Do not overpush salvage right now. Repair support and reserve quality need to recover first.";
    reason =
      "Recovery pressure is rising faster than maintenance can absorb. The loop is starting to drag.";
    recommendation =
      "Prioritize repair support, energy recovery, and rebuilding scrap discipline before pushing harder.";
    riskText = "Medium / high salvage risk.";
  }

  const recommendedSalvageNow =
    salvageKey === "rich"
      ? scrapStored >= 220 && stability >= 82
      : salvageKey === "stable"
        ? scrapStored >= 320 && energyRatio >= 0.24 && stability >= 76
        : false;

  let priority = "Protect repair support";
  if (salvageKey === "strained") {
    if (energyRatio < 0.16) priority = "Recover energy before salvage push";
    else if (stability < 76) priority = "Run maintenance before more recovery";
    else if (repairBayLevel < salvageLevel) priority = "Upgrade repair support";
    else priority = "Reduce salvage pressure";
  } else if (salvageKey === "rich" && recommendedSalvageNow) {
    priority = "Best moment for recovery push";
  }

  return {
    worldOrder: 5,
    scrapStored,
    oreStored,
    salvageLevel,
    quarryLevel,
    repairBayLevel,
    refineryLevel,
    stability,
    energyRatio,
    disciplineScore,
    salvageKey,
    salvageLabel,
    salvageTone,
    salvageState,
    actionHint,
    reason,
    recommendation,
    riskText,
    priority,
    recommendedSalvageNow,
    compactLine: `${salvageLabel} · Discipline ${disciplineScore}/100 · Scrap ${fmtInt(scrapStored)} · Ore ${fmtInt(oreStored)} · Energy ${pct(energyRatio)}`,
    systemsLine: `Salvage ${salvageLevel} · Quarry ${quarryLevel} · Repair ${repairBayLevel} · Refinery ${refineryLevel}`,
    recoveryLine: `Scrap ${fmtInt(scrapStored)} · Ore ${fmtInt(oreStored)} · State ${salvageState} · Stability ${Math.round(stability)}`,
    chipText:
      salvageKey === "rich"
        ? "Recovery window"
        : salvageKey === "strained"
          ? "Recovery drag"
          : "Measured salvage",
    flowHeadline:
      salvageKey === "rich"
        ? "Recovery loop is rich"
        : salvageKey === "strained"
          ? "Recovery loop is strained"
          : "Recovery loop is stable",
  };
}

export function buildWorld5SalvageAlert(snapshot) {
  if (!snapshot) return null;

  if (snapshot.salvageKey === "strained") {
    return {
      key: "world5-salvage-strained",
      tone: "warning",
      title: "Salvage drag rising",
      text: snapshot.priority || "World 5 recovery discipline is slipping.",
      target: { tab: "operations", target: "maintenance" },
    };
  }

  if (snapshot.salvageKey === "rich" && snapshot.recommendedSalvageNow) {
    return {
      key: "world5-salvage-rich",
      tone: "success",
      title: "Rich salvage window",
      text: "World 5 recovery loop is clean right now. Good moment to push salvage / scrap decisions.",
      target: { tab: "operations", target: "expedition" },
    };
  }

  return null;
}
