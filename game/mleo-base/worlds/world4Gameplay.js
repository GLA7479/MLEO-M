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

function getOverclockActive(state) {
  const ocUntil = Number(state?.overclockUntil ?? state?.overclock_until ?? 0);
  return ocUntil > Date.now();
}

function calcWorld4LoadDiscipline({
  energyNow,
  energyCap,
  stability,
  refineryLevel,
  powerCellLevel,
  repairBayLevel,
  overclockActive,
  banked,
}) {
  const energyRatio = energyCap > 0 ? clamp(energyNow / energyCap, 0, 1) : 1;

  let score = 50;

  score += Math.min(16, powerCellLevel * 4);
  score += Math.min(10, repairBayLevel * 2.5);
  score += Math.min(8, refineryLevel * 1.5);

  if (stability >= 90) score += 12;
  else if (stability >= 82) score += 7;
  else if (stability >= 74) score += 2;
  else if (stability >= 66) score -= 8;
  else score -= 16;

  if (energyRatio >= 0.55) score += 14;
  else if (energyRatio >= 0.38) score += 8;
  else if (energyRatio >= 0.26) score += 2;
  else if (energyRatio >= 0.16) score -= 8;
  else score -= 18;

  if (banked >= 120 && banked <= 900) score += 5;
  else if (banked > 1200) score -= 3;

  if (refineryLevel > powerCellLevel + 2) score -= 12;
  else if (refineryLevel > powerCellLevel + 1) score -= 6;
  else if (powerCellLevel >= refineryLevel) score += 4;

  if (overclockActive) {
    if (energyRatio >= 0.4 && stability >= 82) score += 4;
    else score -= 10;
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    energyRatio,
  };
}

export function getWorld4ReactorSnapshot(state, derived = {}) {
  const worldOrder = resolveSectorWorldOrder(state);
  if (worldOrder !== 4) return null;

  const energyNow = Math.floor(Number(state?.resources?.ENERGY ?? 0));
  const energyCap = Math.max(1, Math.floor(Number(derived?.energyCap ?? 1)));
  const stability = clamp(Number(state?.stability ?? 100), 0, 100);
  const refineryLevel = Number(state?.buildings?.refinery ?? 0);
  const powerCellLevel = Number(state?.buildings?.powerCell ?? 0);
  const repairBayLevel = Number(state?.buildings?.repairBay ?? 0);
  const banked = Number(state?.bankedMleo ?? state?.banked_mleo ?? 0);
  const overclockActive = getOverclockActive(state);

  const { score: disciplineScore, energyRatio } = calcWorld4LoadDiscipline({
    energyNow,
    energyCap,
    stability,
    refineryLevel,
    powerCellLevel,
    repairBayLevel,
    overclockActive,
    banked,
  });

  let loadKey = "managed";
  let loadLabel = "Managed load";
  let loadTone = "sky";
  let reactorState = "Controlled output";
  let actionHint =
    "Load is under control. Keep energy reserve healthy before pushing harder.";
  let reason =
    "No major thermal instability detected. Reactor pressure and support layers are broadly aligned.";
  let recommendation =
    "Maintain reserve discipline and use overclock only on clean windows.";
  let riskText = "No immediate thermal risk.";

  if (disciplineScore >= 76) {
    loadKey = "primed";
    loadLabel = "Primed stack";
    loadTone = "orange";
    reactorState = "High-output window";
    actionHint =
      "Strong reactor window. Good moment for deliberate output pushes and selective overclock usage.";
    reason =
      "Energy reserve, stability, and support are aligned enough to absorb temporary load spikes cleanly.";
    recommendation = overclockActive
      ? "Ride the active overclock while reserve stays healthy."
      : "You can push output now; overclock is safe only if reserve stays strong.";
    riskText = "Low thermal risk.";
  } else if (disciplineScore <= 42) {
    loadKey = "strained";
    loadLabel = "Strained stack";
    loadTone = "rose";
    reactorState = "Thermal pressure";
    actionHint =
      "Do not chase output right now. Recover reserve and system stability before pushing the scar harder.";
    reason =
      "Reactor pressure is outrunning support quality. Thermal and maintenance risk are rising.";
    recommendation =
      "Prioritize energy recovery, maintenance, and support upgrades before forcing more output.";
    riskText = "Medium / high thermal risk.";
  }

  const recommendedOverclockNow =
    loadKey === "primed"
      ? energyRatio >= 0.44 && stability >= 84
      : loadKey === "managed"
        ? energyRatio >= 0.58 && stability >= 88 && refineryLevel >= 2
        : false;

  let priority = "Protect reserve before output";
  if (loadKey === "strained") {
    if (energyRatio < 0.18) priority = "Recover energy immediately";
    else if (stability < 76) priority = "Run maintenance before pushing output";
    else if (powerCellLevel < refineryLevel) priority = "Upgrade power support";
    else priority = "Stop forcing reactor load";
  } else if (loadKey === "primed" && recommendedOverclockNow) {
    priority = "Best moment for controlled overclock";
  }

  const overclockCardHint =
    loadKey === "primed" && recommendedOverclockNow
      ? "Overclock is viable — watch reserve while it runs."
      : loadKey === "primed"
        ? "High-output window — overclock only if reserve stays strong."
        : loadKey === "strained"
          ? "Avoid overclock until energy and stability recover."
          : "Overclock only on strong reserve and stability.";

  const maintenanceThermalHint =
    loadKey === "strained"
      ? "Thermal pressure — ease output; maintain stability before pushing."
      : loadKey === "primed"
        ? "Thermal headroom ok — pair bursts with maintenance cadence."
        : "Thermal band stable — keep reserve-backed maintenance rhythm.";

  return {
    worldOrder: 4,
    energyNow,
    energyCap,
    energyRatio,
    stability,
    refineryLevel,
    powerCellLevel,
    repairBayLevel,
    banked,
    overclockActive,
    disciplineScore,
    loadKey,
    loadLabel,
    loadTone,
    reactorState,
    actionHint,
    reason,
    recommendation,
    riskText,
    priority,
    recommendedOverclockNow,
    compactLine: `${loadLabel} · Discipline ${disciplineScore}/100 · Energy ${fmtInt(energyNow)}/${fmtInt(energyCap)} (${pct(energyRatio)}) · Stability ${Math.round(stability)}`,
    supportLine: `Refinery ${refineryLevel} · Power ${powerCellLevel} · Repair ${repairBayLevel} · Overclock ${overclockActive ? "live" : "idle"}`,
    thermalLine: `Reserve ${pct(energyRatio)} · Bank ${fmtInt(banked)} · Reactor state ${reactorState}`,
    chipText:
      loadKey === "primed"
        ? "Prime window"
        : loadKey === "strained"
          ? "Thermal stress"
          : "Controlled load",
    flowHeadline:
      loadKey === "primed"
        ? "Reactor window is primed"
        : loadKey === "strained"
          ? "Reactor stack is strained"
          : "Reactor load is managed",
    overclockCardHint,
    maintenanceThermalHint,
  };
}

export function buildWorld4ReactorAlert(snapshot) {
  if (!snapshot) return null;

  if (snapshot.loadKey === "strained") {
    return {
      key: "world4-reactor-strained",
      tone: "warning",
      title: "Reactor pressure rising",
      text: snapshot.priority || "World 4 thermal discipline is slipping.",
      target: { tab: "operations", target: "maintenance" },
    };
  }

  if (snapshot.loadKey === "primed" && snapshot.recommendedOverclockNow) {
    return {
      key: "world4-reactor-primed",
      tone: "success",
      title: "Primed reactor window",
      text: "Thermal window favorable — controlled overclock / output ok.",
      target: { tab: "operations", target: "overclock" },
    };
  }

  return null;
}
