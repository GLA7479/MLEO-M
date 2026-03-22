import { resolveSectorWorldOrder } from "./catalog";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pct(value, digits = 0) {
  const n = Number(value || 0) * 100;
  return `${n.toFixed(digits).replace(/\.0+$/, "")}%`;
}

function fmtFlow(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v) >= 1000) return `${Math.round(v).toLocaleString("en-US")}`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1).replace(/\.0$/, "");
  return v.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function calcFreightDisciplineScore({
  logisticsLevel,
  refineryLevel,
  tradeHubLevel,
  repairBayLevel,
  banked,
  stability,
  energyRatio,
  shippedRatio,
}) {
  let score = 50;

  score += Math.min(18, logisticsLevel * 4);
  score += Math.min(10, tradeHubLevel * 1.5);
  score += Math.min(8, repairBayLevel * 1.5);

  if (logisticsLevel >= refineryLevel) score += 10;
  else if (logisticsLevel === refineryLevel - 1) score += 3;
  else score -= Math.min(16, (refineryLevel - logisticsLevel) * 6);

  if (stability >= 90) score += 10;
  else if (stability >= 82) score += 6;
  else if (stability >= 74) score += 1;
  else if (stability >= 65) score -= 8;
  else score -= 16;

  if (energyRatio >= 0.5) score += 10;
  else if (energyRatio >= 0.35) score += 6;
  else if (energyRatio >= 0.22) score += 1;
  else if (energyRatio >= 0.12) score -= 7;
  else score -= 14;

  if (banked >= 140 && banked <= 900) score += 8;
  else if (banked > 900) score -= 5;
  else if (banked >= 80) score += 3;
  else score -= 4;

  if (shippedRatio >= 0.95) score -= 6;
  else if (shippedRatio >= 0.75) score -= 2;
  else if (shippedRatio <= 0.35) score += 2;

  return clamp(Math.round(score), 0, 100);
}

export function getWorld2ThroughputSnapshot(state, derived = {}) {
  const worldOrder = resolveSectorWorldOrder(state);
  if (worldOrder !== 2) return null;

  const banked = Number(state?.bankedMleo ?? state?.banked_mleo ?? 0);
  const shippedToday = Number(state?.stats?.shippedToday ?? state?.stats?.shipped_today ?? 0);
  const sentToday = Number(state?.sentToday ?? state?.sent_today ?? 0);

  const stability = clamp(Number(state?.stability ?? 100), 0, 100);
  const energy = Number(state?.resources?.ENERGY ?? 0);
  const energyCap = Number(derived?.energyCap ?? 0);
  const energyRatio = energyCap > 0 ? clamp(energy / energyCap, 0, 1) : 1;

  const logisticsLevel = Number(state?.buildings?.logisticsCenter ?? 0);
  const refineryLevel = Number(state?.buildings?.refinery ?? 0);
  const tradeHubLevel = Number(state?.buildings?.tradeHub ?? 0);
  const repairBayLevel = Number(state?.buildings?.repairBay ?? 0);

  const shipCap = Number(derived?.dailyMleoCap ?? derived?.shipCap ?? 0);
  const shippedRatio = shipCap > 0 ? clamp(shippedToday / shipCap, 0, 1.25) : 0;

  const disciplineScore = calcFreightDisciplineScore({
    logisticsLevel,
    refineryLevel,
    tradeHubLevel,
    repairBayLevel,
    banked,
    stability,
    energyRatio,
    shippedRatio,
  });

  let laneKey = "steady";
  let laneLabel = "Steady lane";
  let laneTone = "sky";
  let throughputState = "Measured";
  let actionHint =
    "Flow is stable. Keep logistics near refinery pressure and export on clean windows.";
  let reason =
    "No major freight bottleneck detected. The sector is operating in a controlled rhythm.";
  let riskText = "No immediate throughput risk.";
  let recommendation = "Keep stacking a measured bank and ship when window stays clean.";

  if (disciplineScore >= 76) {
    laneKey = "open";
    laneLabel = "Open lane";
    laneTone = "emerald";
    throughputState = "Clean throughput";
    actionHint =
      "Strong export window. Freight support is aligned and the orbit lane can clear volume cleanly.";
    reason =
      "Logistics support is matching refinery pressure while energy and stability remain inside a safe band.";
    riskText = "Low freight risk.";
    recommendation = banked >= 110
      ? "Ship now for a clean cycle, then refill the bank again."
      : "Stay in rhythm and let the bank stack a little more before exporting.";
  } else if (disciplineScore <= 42) {
    laneKey = "congested";
    laneLabel = "Congested lane";
    laneTone = "amber";
    throughputState = "Pressure building";
    actionHint =
      "Do not force export rhythm. Stabilize support first, then bring logistics closer to refinery load.";
    reason =
      "Freight pressure is building faster than support quality. The world is signaling a throughput bottleneck.";
    riskText = "Medium / high freight risk.";
    recommendation =
      "Prioritize logistics, repair support, or energy recovery before trying to push the lane harder.";
  }

  const supportGap = logisticsLevel - refineryLevel;
  const recommendedShipNow =
    laneKey === "open"
      ? banked >= 110
      : laneKey === "steady"
        ? banked >= 180 && stability >= 76 && energyRatio >= 0.24
        : false;

  let priority = "Maintain logistics rhythm";
  if (laneKey === "congested") {
    if (energyRatio < 0.2) priority = "Recover energy reserve";
    else if (stability < 76) priority = "Run maintenance first";
    else if (supportGap < 0) priority = "Upgrade logistics before refinery";
    else priority = "Reduce export pressure";
  } else if (laneKey === "open" && recommendedShipNow) {
    priority = "Best moment to export";
  }

  /** Short line for shipping card — action-oriented; strip carries fuller state. */
  const shippingCardHint =
    laneKey === "open" && recommendedShipNow
      ? "Ship banked MLEO now — lane is favorable."
      : laneKey === "open"
        ? "Lane is open; build bank before exporting."
        : laneKey === "congested"
          ? priority
          : "Keep logistics matched to refinery; export on clean windows only.";

  return {
    worldOrder: 2,
    banked,
    shippedToday,
    sentToday,
    stability,
    energyRatio,
    logisticsLevel,
    refineryLevel,
    tradeHubLevel,
    repairBayLevel,
    shipCap,
    shippedRatio,
    supportGap,
    disciplineScore,
    laneKey,
    laneLabel,
    laneTone,
    throughputState,
    recommendedShipNow,
    actionHint,
    reason,
    riskText,
    recommendation,
    priority,
    flowHeadline:
      laneKey === "open"
        ? "Freight window is open"
        : laneKey === "congested"
          ? "Freight lanes are congested"
          : "Freight lanes are steady",
    compactLine: `${laneLabel} · Discipline ${disciplineScore}/100 · Energy ${pct(energyRatio)} · Stability ${Math.round(stability)}`,
    logisticsLine: `Logistics ${logisticsLevel} · Refinery ${refineryLevel} · Trade ${tradeHubLevel} · Support gap ${supportGap >= 0 ? `+${supportGap}` : `${supportGap}`}`,
    shippingLine: `Bank ${fmtFlow(banked)} · Produced ${fmtFlow(shippedToday)} / ${fmtFlow(shipCap || 0)} · Sent ${fmtFlow(sentToday)}`,
    chipText:
      laneKey === "open"
        ? "Clean window"
        : laneKey === "congested"
          ? "Flow pressure"
          : "Measured flow",
    shippingCardHint,
  };
}

export function buildWorld2FreightAlert(snapshot) {
  if (!snapshot) return null;

  if (snapshot.laneKey === "congested") {
    return {
      key: "world2-freight-pressure",
      tone: "warning",
      title: "Freight lane pressure",
      text: snapshot.priority || "World 2 logistics support is lagging behind throughput pressure.",
      target: { tab: "operations", target: "shipping" },
    };
  }

  if (snapshot.laneKey === "open" && snapshot.recommendedShipNow) {
    return {
      key: "world2-freight-open",
      tone: "success",
      title: "Open freight window",
      text: "Favorable lane — export banked MLEO from shipping.",
      target: { tab: "operations", target: "shipping" },
    };
  }

  return null;
}
