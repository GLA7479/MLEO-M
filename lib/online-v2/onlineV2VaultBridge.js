/**
 * OV2 vault bridge — the only OV2 import for balance and stake sync.
 * Delegates to product `sharedVault` (same ecosystem as other app surfaces).
 *
 * Contract:
 * - read / peek / subscribe: snapshot `{ balance, lastSyncedAt? }`.
 * - credit / debit / syncPending: pass OV2 public `gameId` (`ov2_board_path` | `ov2_mark_grid`).
 * - Stake: call `ov2_stake_commit` first; on `ok`, debit the vault with the same stake amount and `gameId`.
 * - After RPC inserts `ov2_settlement_lines`, credit once per server-returned idempotency key.
 * OV2 UI and game modules must not read wallet storage keys directly.
 */

import {
  creditSharedVault,
  debitSharedVault,
  peekSharedVault,
  readSharedVault,
  subscribeSharedVault,
  syncSharedVault,
} from "../sharedVault";

/**
 * @param {{ fresh?: boolean; forceServer?: boolean }} [opts]
 * `forceServer`: pull authoritative balance even if a local pending delta exists (OV2 server-side vault RPC).
 * @returns {Promise<{ balance: number, lastSyncedAt?: number }>}
 */
export async function readOnlineV2Vault(opts) {
  return readSharedVault(opts);
}

export function peekOnlineV2Vault() {
  return peekSharedVault();
}

export function subscribeOnlineV2Vault(listener) {
  return subscribeSharedVault(listener);
}

export async function creditOnlineV2Vault(amount, gameId) {
  return creditSharedVault(amount, gameId);
}

const OV2_SETTLEMENT_CREDIT_LS_PREFIX = "ov2_bp_vault_settlement_idem:";
const OV2_SETTLEMENT_DEBIT_LS_PREFIX = "ov2_bp_vault_settlement_debit_idem:";
const OV2_PRE_GAME_REFUND_CREDIT_LS_PREFIX = "ov2_vault_pre_game_refund_idem:";

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Credit shared vault for one settlement line; skips if this browser already applied the same `idempotencyKey`.
 * Use the server line `idempotency_key` (not the line UUID) so retries align with OV2 settlement dedupe.
 * @param {number} amount
 * @param {string} gameId
 * @param {string|null|undefined} settlementLineIdempotencyKey
 */
export async function creditOnlineV2VaultForSettlementLine(amount, gameId, settlementLineIdempotencyKey) {
  const key =
    typeof settlementLineIdempotencyKey === "string" ? settlementLineIdempotencyKey.trim() : "";
  if (!key || !hasWindow()) {
    return creditSharedVault(amount, gameId);
  }
  try {
    if (window.localStorage.getItem(OV2_SETTLEMENT_CREDIT_LS_PREFIX + key) === "1") {
      return { ...peekSharedVault(), ok: true, synced: true, skippedDuplicate: true, error: null };
    }
  } catch {
    // ignore quota / access errors; still attempt credit
  }
  const result = await creditSharedVault(amount, gameId);
  try {
    if (result?.ok === true && result?.synced === true) {
      window.localStorage.setItem(OV2_SETTLEMENT_CREDIT_LS_PREFIX + key, "1");
    }
  } catch {
    // ignore
  }
  return result;
}

/**
 * Debit shared vault for one settlement loss line; idempotent per `idempotencyKey` in localStorage.
 * @param {number} amount
 * @param {string} gameId
 * @param {string|null|undefined} settlementLineIdempotencyKey
 */
export async function debitOnlineV2VaultForSettlementLine(amount, gameId, settlementLineIdempotencyKey) {
  const key =
    typeof settlementLineIdempotencyKey === "string" ? settlementLineIdempotencyKey.trim() : "";
  if (!key || !hasWindow()) {
    return debitSharedVault(amount, gameId);
  }
  try {
    if (window.localStorage.getItem(OV2_SETTLEMENT_DEBIT_LS_PREFIX + key) === "1") {
      return { ...peekSharedVault(), ok: true, synced: true, skippedDuplicate: true, error: null };
    }
  } catch {
    // ignore
  }
  const result = await debitSharedVault(amount, gameId);
  try {
    if (result?.ok === true && result?.synced === true) {
      window.localStorage.setItem(OV2_SETTLEMENT_DEBIT_LS_PREFIX + key, "1");
    }
  } catch {
    // ignore
  }
  return result;
}

export async function debitOnlineV2Vault(amount, gameId) {
  return debitSharedVault(amount, gameId);
}

/**
 * Credit vault once per server pre-game refund idempotency key (ov2_economy_events row key).
 * @param {number} amount
 * @param {string} gameId
 * @param {string|null|undefined} idempotencyKey
 */
export async function creditOnlineV2VaultForPreGameRefund(amount, gameId, idempotencyKey) {
  const key = typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
  if (!key || !hasWindow()) {
    return creditSharedVault(amount, gameId);
  }
  try {
    if (window.localStorage.getItem(OV2_PRE_GAME_REFUND_CREDIT_LS_PREFIX + key) === "1") {
      return { ...peekSharedVault(), ok: true, synced: true, skippedDuplicate: true, error: null };
    }
  } catch {
    // ignore
  }
  const result = await creditSharedVault(amount, gameId);
  try {
    if (result?.ok === true && result?.synced === true) {
      window.localStorage.setItem(OV2_PRE_GAME_REFUND_CREDIT_LS_PREFIX + key, "1");
    }
  } catch {
    // ignore
  }
  return result;
}

export async function syncOnlineV2VaultPending(gameId) {
  return syncSharedVault(gameId);
}
