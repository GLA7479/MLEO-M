// lib/server/monitoring.js
// Basic monitoring helper - can be extended with Sentry/Axiom/Logtail

const isProduction = process.env.NODE_ENV === "production";

/**
 * Log critical events for monitoring
 * @param {string} event - Event name (e.g., "miners_accrue_fail")
 * @param {object} data - Event data
 */
export function logEvent(event, payload = {}) {
  const logEntry = {
    ts: new Date().toISOString(),
    event,
    ...payload,
  };

  if (isProduction) {
    // In production, log to console (can be picked up by monitoring services)
    console.log("[EVENT]", JSON.stringify(logEntry));
    
    // TODO: Add Sentry/Axiom/Logtail integration here
    // Example:
    // if (process.env.SENTRY_DSN) {
    //   Sentry.captureMessage(event, { extra: payload });
    // }
  } else {
    console.warn("[EVENT]", logEntry);
  }
}

/**
 * Log errors for monitoring
 * @param {Error} error - Error object
 * @param {object} context - Additional context
 */
export function logError(error, payload = {}) {
  const logEntry = {
    ts: new Date().toISOString(),
    ...payload,
    error: error?.message || String(error),
    stack: error?.stack || null,
  };

  if (isProduction) {
    console.error("[ERROR]", JSON.stringify(logEntry));
    
    // TODO: Add Sentry/Axiom/Logtail integration here
    // Example:
    // if (process.env.SENTRY_DSN) {
    //   Sentry.captureException(error, { extra: payload });
    // }
  } else {
    console.error("[ERROR]", logEntry);
  }
}

// Critical events to monitor (as per requirements)
export const EVENTS = {
  MINERS_ACCRUE_FAIL: "miners_accrue_fail",
  MINERS_CLAIM_TO_VAULT_FAIL: "miners_claim_to_vault_fail",
  MINERS_CLAIM_TO_WALLET_FAIL: "miners_claim_to_wallet_fail",
  BASE_SHIP_FAIL: "base_ship_fail",
  BASE_SPEND_FAIL: "base_spend_fail",
  BASE_BUILD_FAIL: "base_build_fail",
  BASE_EXPEDITION_FAIL: "base_expedition_fail",
  CSRF_FAIL: "csrf_fail",
  RATE_LIMIT_SPIKE: "rate_limit_spike",
  SUSPICIOUS_ACTIVITY: "suspicious_activity",
  CONTRACT_CLAIM_FAIL: "contract_claim_fail",
};
