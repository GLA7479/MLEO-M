/**
 * Dev-only Mystery Chamber tracing. Set SOLO_V2_DEBUG_MYSTERY_CHAMBER=1 (or "true") in the server env.
 * Logs full safe layouts — never enable in production if logs are retained or exposed.
 */
export function isMysteryChamberDebugEnabled() {
  const v = String(process.env.SOLO_V2_DEBUG_MYSTERY_CHAMBER || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function mysteryChamberDebugLog(label, payload) {
  if (!isMysteryChamberDebugEnabled()) return;
  // eslint-disable-next-line no-console -- intentional dev instrumentation
  console.info(`[solo-v2/mystery_chamber][debug] ${label}`, payload);
}
