/**
 * =============================================================================
 * BOARD PATH — SETTLEMENT DELIVERY (OV2 only)
 * =============================================================================
 *
 * END-TO-END CLIENT FLOW (inspectable order; SQL migration may not be applied yet)
 * -----------------------------------------------------------------------------
 * 1. Preconditions: session settlement finalized, room `settlement_status = finalized`
 *    (Room finalize RPC is separate; claim RPC is gated on room finalized when enabled.)
 *
 * 2. UI shows "Send to vault" when `deriveBoardPathSettlementDeliveryUiPhase` allows.
 *
 * 3. Participant taps **Send to vault** → `claimSettlement()` in `useOv2BoardPathSession`.
 *
 * 4. **Claim RPC** (when DB exists): `ov2_board_path_claim_settlement(room, participant)`
 *    Returns rows that the server considers claimable for that participant.
 *    PLANNED BEHAVIOR (see reliability gap below): server may set `vault_delivered_at`
 *    on those rows in the same call *before* the browser credits the shared vault.
 *
 * 5. **Vault apply** (client): `applyBoardPathSettlementClaimLinesToVaultWithTrace` walks
 *    returned lines with `amount > 0`, sequentially, each via
 *    `creditOnlineV2VaultForSettlementLine` (OV2 bridge → sharedVault only).
 *
 * 6. **Local idempotency**: same settlement `idempotency_key` may be skipped in this
 *    browser if `localStorage` already recorded a successful credit (see bridge).
 *    That is *not* a substitute for fixing DB-before-vault ordering.
 *
 * 7. **UI refresh**: `refreshBundleFromServer()` reloads `ov2_settlement_lines` so the
 *    strip reflects `vault_delivered_at` / undelivered state.
 *
 * -----------------------------------------------------------------------------
 * RELIABILITY GAP (honest; not papered over)
 * -----------------------------------------------------------------------------
 * If the claim RPC marks lines in DB and then the vault step fails (network, flush,
 * etc.), a repeat claim may return **no lines**. The app cannot repair that from the
 * client alone without a DB or ops change. Phases `VAULT_GAP_NO_DB_RETRY` /
 * `VAULT_GAP_PARTIAL` surface this explicitly in UI naming and hints.
 *
 * Until claim RPC semantics are revised (e.g. two-phase commit or mark-after-vault),
 * **SQL-backed settlement approval should assume this gap remains.**
 */

import {
  creditOnlineV2VaultForSettlementLine,
  debitOnlineV2VaultForSettlementLine,
} from "../onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../ov2Economy";

/** Short reference for comments / tooling; not shown to users verbatim. */
export const BOARD_PATH_SETTLEMENT_VAULT_RELIABILITY_GAP =
  "DB_may_mark_vault_delivered_before_sharedVault_credit_succeeds_no_client_repair";

/**
 * User-visible / diagnostic phases for Board Path settlement delivery UX.
 * Names intentionally include `vault_gap` where the DB/vault ordering can strand credits.
 */
export const BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE = Object.freeze({
  INACTIVE: "inactive",
  ROOM_NOT_FINALIZED: "room_not_finalized",
  /** No settlement rows for this participant. */
  NOTHING_FOR_PARTICIPANT: "nothing_for_participant",
  /** Participant had rows; all marked delivered in DB (includes idempotent empty RPC). */
  NOTHING_LEFT_TO_CLAIM: "nothing_left_to_claim",
  CLAIM_AVAILABLE: "claim_available",
  CLAIM_BUSY: "claim_busy",
  RPC_REJECTED: "rpc_rejected",
  /** All returned creditable lines succeeded in vault (transient; see hook last-touch TTL). */
  VAULT_SUCCESS: "vault_success",
  /**
   * All creditable lines failed at vault after RPC had already accepted claim
   * (planned: marking in DB). No DB retry path for the same lines.
   */
  VAULT_GAP_NO_DB_RETRY: "vault_gap_no_db_retry",
  /**
   * Some lines credited to vault, some failed — same ordering gap for the failed slice.
   */
  VAULT_GAP_PARTIAL: "vault_gap_partial",
});

/** @param {unknown} v */
function nAmount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Documented flow as a single string (for logs / future dev panels).
 * @returns {string}
 */
export function getBoardPathSettlementDeliveryFlowDescription() {
  return [
    "1 room_finalized → 2 tap_send_to_vault → 3 claim_rpc → 4 vault_per_line → 5 refresh",
    `gap: ${BOARD_PATH_SETTLEMENT_VAULT_RELIABILITY_GAP}`,
  ].join("\n");
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string|null|undefined} selfKey
 */
export function settlementLineIsUndeliveredForSelf(row, selfKey) {
  const sk = selfKey?.trim() || null;
  if (!row || typeof row !== "object" || !sk) return false;
  const pk = String(/** @type {Record<string, unknown>} */ (row).recipient_participant_key ?? "").trim();
  if (pk !== sk) return false;
  const r = /** @type {Record<string, unknown>} */ (row);
  const delivered = r.vault_delivered_at ?? r.vaultDeliveredAt;
  if (delivered != null && String(delivered).trim() !== "") return false;
  return true;
}

/**
 * @param {unknown[]|null|undefined} roomSettlementLines
 * @param {string|null|undefined} selfKey
 * @returns {Record<string, unknown>[]}
 */
export function filterUndeliveredSettlementLinesForSelf(roomSettlementLines, selfKey) {
  const lines = Array.isArray(roomSettlementLines) ? roomSettlementLines : [];
  return lines.filter(l => settlementLineIsUndeliveredForSelf(/** @type {Record<string, unknown>} */ (l), selfKey));
}

/**
 * @param {unknown[]|null|undefined} roomSettlementLines
 * @param {string|null|undefined} selfKey
 * @returns {Record<string, unknown>[]}
 */
export function filterSettlementLinesForSelf(roomSettlementLines, selfKey) {
  const sk = selfKey?.trim() || null;
  const lines = Array.isArray(roomSettlementLines) ? roomSettlementLines : [];
  if (!sk) return [];
  return lines.filter(
    l =>
      l &&
      typeof l === "object" &&
      String(/** @type {Record<string, unknown>} */ (l).recipient_participant_key ?? "").trim() === sk
  );
}

/**
 * @param {unknown} roomLike
 * @param {string|null|undefined} selfKey
 * @param {unknown[]|null|undefined} roomSettlementLines
 * @param {boolean} liveDbBoardPath
 */
export function canBoardPathClaimSettlementForVault(roomLike, selfKey, roomSettlementLines, liveDbBoardPath) {
  if (!liveDbBoardPath) return false;
  const sk = selfKey?.trim() || null;
  if (!sk) return false;
  const room = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  if (!room) return false;
  if (String(room.product_game_id || "") !== ONLINE_V2_GAME_KINDS.BOARD_PATH) return false;
  const rss = String(room.settlement_status ?? room.settlementStatus ?? "").trim().toLowerCase();
  if (rss !== "finalized") return false;
  const pending = filterUndeliveredSettlementLinesForSelf(roomSettlementLines, sk);
  return pending.length > 0;
}

/**
 * Creditable total from claim RPC lines (amount > 0 only).
 * @param {{ amount?: unknown }[]} lines
 */
export function settlementClaimCreditTotal(lines) {
  if (!Array.isArray(lines)) return 0;
  let t = 0;
  for (const l of lines) {
    const a = nAmount(l?.amount);
    if (a > 0) t += a;
  }
  return t;
}

/**
 * UI label from hydrated room settlement lines (no RPC).
 * @param {unknown} roomLike
 * @param {string|null|undefined} selfKey
 * @param {unknown[]|null|undefined} roomSettlementLines
 * @param {boolean} liveDbBoardPath
 */
export function getBoardPathSettlementClaimStatusLabel(roomLike, selfKey, roomSettlementLines, liveDbBoardPath) {
  if (!liveDbBoardPath) return "";
  const sk = selfKey?.trim() || null;
  if (!sk) return "";
  const room = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  if (!room) return "";
  const rss = String(room.settlement_status ?? room.settlementStatus ?? "").trim().toLowerCase();
  if (rss !== "finalized") return "";
  const mine = filterSettlementLinesForSelf(roomSettlementLines, sk);
  if (mine.length === 0) return "Settlement: none for you";
  const undelivered = filterUndeliveredSettlementLinesForSelf(roomSettlementLines, sk);
  if (undelivered.length === 0) {
    const creditTotal = mine.reduce((acc, l) => acc + nAmount(/** @type {Record<string, unknown>} */ (l).amount), 0);
    return creditTotal > 0 ? "Settlement: sent to vault" : "Settlement: recorded (no vault credit)";
  }
  const owed = undelivered.reduce((acc, l) => acc + nAmount(/** @type {Record<string, unknown>} */ (l).amount), 0);
  return owed > 0 ? `Settlement: ${owed} ready for vault` : "Settlement: finalize in vault (no amount)";
}

/**
 * @typedef {{
 *   idempotencyKey: string,
 *   amount: number,
 *   outcome: "skipped_zero"|"skipped_local_idem"|"credited"|"failed",
 *   detail?: string
 * }} SettlementVaultLineTrace
 */

/**
 * Apply vault credits for lines returned from claim RPC (amount > 0 only), one-by-one.
 * @param {{ id?: unknown, amount?: unknown, idempotency_key?: unknown, idempotencyKey?: unknown }[]} claimedLines
 * @param {string} [gameId]
 * @returns {Promise<{
 *   creditedCount: number,
 *   creditedTotal: number,
 *   failedLines: { idempotencyKey: string, amount: number, error: string }[],
 *   skippedLocalIdemCount: number,
 *   skippedZeroCount: number,
 *   lineResults: SettlementVaultLineTrace[],
 * }>}
 */
export async function applyBoardPathSettlementClaimLinesToVaultWithTrace(claimedLines, gameId) {
  const gid = gameId || ONLINE_V2_GAME_KINDS.BOARD_PATH;
  const lines = Array.isArray(claimedLines) ? claimedLines : [];
  let creditedCount = 0;
  let creditedTotal = 0;
  let skippedLocalIdemCount = 0;
  let skippedZeroCount = 0;
  /** @type {SettlementVaultLineTrace[]} */
  const lineResults = [];
  /** @type {{ idempotencyKey: string, amount: number, error: string }[]} */
  const failedLines = [];

  for (const raw of lines) {
    const row = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : null;
    if (!row) continue;
    const amt = nAmount(row.amount);
    const lineKind = String(row.line_kind ?? row.lineKind ?? "").trim().toLowerCase();
    const isVaultLoss =
      lineKind === "ludo_loss" ||
      lineKind === "board_path_loss" ||
      (lineKind.length > 0 && lineKind.endsWith("_loss"));
    const idem =
      (typeof row.idempotency_key === "string" && row.idempotency_key.trim()) ||
      (typeof row.idempotencyKey === "string" && row.idempotencyKey.trim()) ||
      "";

    if (amt <= 0) {
      skippedZeroCount += 1;
      lineResults.push({
        idempotencyKey: idem || "(zero)",
        amount: amt,
        outcome: "skipped_zero",
      });
      continue;
    }
    if (!idem) {
      failedLines.push({ idempotencyKey: "", amount: amt, error: "missing idempotency_key" });
      lineResults.push({ idempotencyKey: "", amount: amt, outcome: "failed", detail: "missing idempotency_key" });
      continue;
    }

    try {
      if (isVaultLoss) {
        const r = await debitOnlineV2VaultForSettlementLine(amt, gid, idem);
        if (r?.skippedDuplicate) {
          skippedLocalIdemCount += 1;
          lineResults.push({ idempotencyKey: idem, amount: amt, outcome: "skipped_local_idem" });
          continue;
        }
        if (r && r.ok && !r.error && r.synced !== false) {
          lineResults.push({ idempotencyKey: idem, amount: amt, outcome: "debited" });
        } else {
          const msg = String(r?.error || "vault debit failed");
          failedLines.push({ idempotencyKey: idem, amount: amt, error: msg });
          lineResults.push({ idempotencyKey: idem, amount: amt, outcome: "failed", detail: msg });
        }
        continue;
      }
      const r = await creditOnlineV2VaultForSettlementLine(amt, gid, idem);
      if (r?.skippedDuplicate) {
        skippedLocalIdemCount += 1;
        lineResults.push({ idempotencyKey: idem, amount: amt, outcome: "skipped_local_idem" });
        continue;
      }
      if (r && r.ok && !r.error && r.synced !== false) {
        creditedCount += 1;
        creditedTotal += amt;
        lineResults.push({ idempotencyKey: idem, amount: amt, outcome: "credited" });
      } else {
        const msg = String(r?.error || "vault credit failed");
        failedLines.push({ idempotencyKey: idem, amount: amt, error: msg });
        lineResults.push({ idempotencyKey: idem, amount: amt, outcome: "failed", detail: msg });
      }
    } catch (e) {
      const msg = e?.message || String(e);
      failedLines.push({ idempotencyKey: idem, amount: amt, error: msg });
      lineResults.push({ idempotencyKey: idem, amount: amt, outcome: "failed", detail: msg });
    }
  }

  return {
    creditedCount,
    creditedTotal,
    failedLines,
    skippedLocalIdemCount,
    skippedZeroCount,
    lineResults,
  };
}

/**
 * @param {{ id?: unknown, amount?: unknown, idempotency_key?: unknown, idempotencyKey?: unknown }[]} claimedLines
 * @param {string} [gameId]
 */
export async function applyBoardPathSettlementClaimLinesToVault(claimedLines, gameId) {
  const t = await applyBoardPathSettlementClaimLinesToVaultWithTrace(claimedLines, gameId);
  return {
    creditedCount: t.creditedCount,
    creditedTotal: t.creditedTotal,
    failedLines: t.failedLines,
  };
}

const SUCCESS_FLASH_MS = 10_000;

/**
 * Last client-side settlement claim attempt (for UX + honesty about DB/vault ordering).
 * @typedef {Object} SettlementClaimLastTouch
 * @property {number} at
 * @property {number} rpcReturnedCount
 * @property {boolean} rpcIdempotentEmpty
 * @property {number} vaultCreditableAttempted — lines with amount > 0 returned from RPC
 * @property {number} vaultCreditedCount
 * @property {number} vaultFailedCount
 * @property {number} vaultSkippedLocalIdemCount
 * @property {boolean} vaultGapAfterDbMark — `true` if any vault credit failed after RPC accepted claim (see module gap)
 * @property {boolean} vaultSuccessAll — no vault failures; all positive lines credited or skipped as local idem
 * @property {SettlementVaultLineTrace[]} [lineResults]
 */

/**
 * @param {{
 *   liveDbBoardPath: boolean,
 *   roomFinalized: boolean,
 *   selfKey: string|null,
 *   roomSettlementLines: unknown[]|null|undefined,
 *   selfCanClaimSettlement: boolean,
 *   settlementClaimBusy: boolean,
 *   settlementClaimError: { code?: string, message?: string }|null,
 *   settlementClaimLastTouch: SettlementClaimLastTouch|null,
 * }} p
 * @returns {typeof BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE[keyof typeof BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE]}
 */
export function deriveBoardPathSettlementDeliveryUiPhase(p) {
  if (!p.liveDbBoardPath || !p.selfKey?.trim()) {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.INACTIVE;
  }
  if (!p.roomFinalized) {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.ROOM_NOT_FINALIZED;
  }
  if (p.settlementClaimBusy) {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.CLAIM_BUSY;
  }

  const errCode = p.settlementClaimError?.code ? String(p.settlementClaimError.code) : "";
  if (errCode === "VAULT_GAP_PARTIAL" || errCode === "VAULT_PARTIAL") {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_GAP_PARTIAL;
  }
  if (errCode === "VAULT_GAP_NO_DB_RETRY") {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_GAP_NO_DB_RETRY;
  }

  const touch = p.settlementClaimLastTouch;
  const now = Date.now();
  if (touch?.vaultSuccessAll && now - touch.at < SUCCESS_FLASH_MS) {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_SUCCESS;
  }

  if (touch?.vaultGapAfterDbMark) {
    if (touch.vaultFailedCount > 0 && touch.vaultCreditedCount > 0) {
      return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_GAP_PARTIAL;
    }
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_GAP_NO_DB_RETRY;
  }

  if (p.settlementClaimError) {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.RPC_REJECTED;
  }

  const mine = filterSettlementLinesForSelf(p.roomSettlementLines, p.selfKey);
  if (mine.length === 0) {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.NOTHING_FOR_PARTICIPANT;
  }
  if (!p.selfCanClaimSettlement) {
    return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.NOTHING_LEFT_TO_CLAIM;
  }
  return BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.CLAIM_AVAILABLE;
}

/**
 * Short banner line for the status strip (honest about gap states).
 * @param {ReturnType<typeof deriveBoardPathSettlementDeliveryUiPhase>} phase
 */
export function getBoardPathSettlementDeliveryHintLine(phase) {
  switch (phase) {
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.ROOM_NOT_FINALIZED:
      return "Vault: room not finalized yet";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.NOTHING_FOR_PARTICIPANT:
      return "Vault: no settlement lines for you";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.NOTHING_LEFT_TO_CLAIM:
      return "Vault: nothing left to claim";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.CLAIM_AVAILABLE:
      return "Vault: you can send credits";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.CLAIM_BUSY:
      return "Vault: sending…";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.RPC_REJECTED:
      return "Vault: claim rejected (see error)";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_SUCCESS:
      return "Vault: credited (refresh OK)";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_GAP_NO_DB_RETRY:
      return "Vault: delivery may be incomplete — no in-app retry if DB already marked (support)";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.VAULT_GAP_PARTIAL:
      return "Vault: partial delivery — some lines failed after claim (support if balance wrong)";
    case BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.INACTIVE:
    default:
      return "";
  }
}

/**
 * Whether the Send button should allow another press (DB may still show undelivered).
 * @param {ReturnType<typeof deriveBoardPathSettlementDeliveryUiPhase>} phase
 */
export function settlementDeliveryUiPhaseAllowsClaimButton(phase) {
  return phase === BOARD_PATH_SETTLEMENT_DELIVERY_UI_PHASE.CLAIM_AVAILABLE;
}
