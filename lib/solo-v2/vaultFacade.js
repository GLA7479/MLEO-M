/**
 * Solo V2 vault boundary adapter.
 * Foundation-stage neutral boundary:
 * - No direct runtime coupling to legacy/shared vault internals.
 * - Debit/credit are intentionally blocked until Deliverable 2.
 */
export async function getBalance() {
  return {
    balance: 0,
    lastSyncedAt: 0,
    source: "solo-v2-foundation-placeholder",
  };
}

export function subscribeBalance(_listener) {
  return () => {};
}

function createNotImplementedError(operation) {
  return new Error(`solo-v2 vault facade: ${operation} not implemented for foundation stage`);
}

export async function applyDebit(_amount, _gameKey) {
  throw createNotImplementedError("applyDebit");
}

export async function applyCredit(_amount, _gameKey) {
  throw createNotImplementedError("applyCredit");
}
