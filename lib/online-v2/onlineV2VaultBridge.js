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
 * @param {{ fresh?: boolean }} [opts]
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

export async function debitOnlineV2Vault(amount, gameId) {
  return debitSharedVault(amount, gameId);
}

export async function syncOnlineV2VaultPending(gameId) {
  return syncSharedVault(gameId);
}
