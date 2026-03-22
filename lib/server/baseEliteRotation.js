import crypto from "crypto";
import { ELITE_ROTATING_TEMPLATE_KEYS } from "../../game/mleo-base/data.js";

export function getUtcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Deterministic global pick (2 templates per UTC day). Matches PostgreSQL
 * `base_elite_daily_offer_templates` (md5(day || key) ordering).
 */
export function pickDailyEliteTemplateKeys(dayKey) {
  const d = String(dayKey || "").trim();
  const keys = [...ELITE_ROTATING_TEMPLATE_KEYS].sort((a, b) => {
    const ha = crypto.createHash("md5").update(`${d}:${a}`).digest("hex");
    const hb = crypto.createHash("md5").update(`${d}:${b}`).digest("hex");
    if (ha !== hb) return ha < hb ? -1 : 1;
    return a.localeCompare(b);
  });
  return keys.slice(0, 2);
}

export function getEliteRotationPayload(now = new Date()) {
  const dayKey = getUtcDayKey(now);
  return {
    dayKey,
    offerTemplateKeys: pickDailyEliteTemplateKeys(dayKey),
  };
}
