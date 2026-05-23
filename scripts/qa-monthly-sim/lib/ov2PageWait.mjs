/** CSP-safe OV2 page waits — poll page.url() from Node; never use page.waitForFunction/evaluate. */

export function urlHasRoomQuery(urlString) {
  try {
    return new URL(urlString).search.includes("room=");
  } catch {
    return String(urlString).includes("room=");
  }
}

/**
 * Wait until the browser navigates away from an OV2 room URL (no room= in query).
 * @param {import('playwright').Page} page
 */
export async function waitUntilLeftOv2Room(page, { timeout = 90_000, pollMs = 500 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!urlHasRoomQuery(page.url())) return;
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error(`Timeout waiting to leave OV2 room (last url: ${page.url()})`);
}
