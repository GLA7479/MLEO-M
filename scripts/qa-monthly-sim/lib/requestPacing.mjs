export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Backoff after HTTP 429 or IP rate-limit messages. */
export function rateLimitBackoffMs(attempt) {
  return Math.min(8000, 1200 * 2 ** attempt);
}
