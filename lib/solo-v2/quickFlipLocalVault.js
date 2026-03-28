import {
  initSharedVault,
  peekSharedVault,
  readSharedVault,
  subscribeSharedVault,
} from "../sharedVault";
import { ensureArcadeDeviceCookie, ensureCsrfToken } from "../arcadeDeviceClient";

const RECEIPT_PREFIX_QUICK_FLIP = "solo_v2_quick_flip_settlement_receipt:";
const RECEIPT_PREFIX_MYSTERY_BOX = "solo_v2_mystery_box_settlement_receipt:";
const RECEIPT_PREFIX_HIGH_LOW_CARDS = "solo_v2_high_low_cards_settlement_receipt:";
const RECEIPT_PREFIX_DICE_PICK = "solo_v2_dice_pick_settlement_receipt:";
const RECEIPT_PREFIX_GOLD_RUSH_DIGGER = "solo_v2_gold_rush_digger_settlement_receipt:";
const RECEIPT_PREFIX_TREASURE_DOORS = "solo_v2_treasure_doors_settlement_receipt:";
const RECEIPT_PREFIX_SPEED_TRACK = "solo_v2_speed_track_settlement_receipt:";
const RECEIPT_PREFIX_LIMIT_RUN = "solo_v2_limit_run_settlement_receipt:";
const RECEIPT_PREFIX_NUMBER_HUNT = "solo_v2_number_hunt_settlement_receipt:";
const QUICK_FLIP_SETTLEMENT_GAME_ID = "solo-v2-quick-flip-settlement";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function readQuickFlipSharedVaultBalance() {
  if (!canUseStorage()) {
    return {
      ok: false,
      reason: "vault_unavailable",
      message: "Shared vault is unavailable in this environment.",
      balance: null,
    };
  }

  try {
    initSharedVault();
    const deviceInit = await ensureArcadeDeviceCookie();
    const shouldReadFresh = Boolean(deviceInit?.success);
    const snapshot = await readSharedVault({ fresh: shouldReadFresh });
    const balance = toFiniteNumber(snapshot?.balance, null);
    if (!Number.isFinite(balance)) {
      return {
        ok: false,
        reason: "vault_unavailable",
        message: "Unable to read shared vault balance.",
        balance: null,
      };
    }
    return { ok: true, balance: Math.max(0, balance) };
  } catch (_error) {
    return {
      ok: false,
      reason: "vault_unavailable",
      message: "Shared vault read failed.",
      balance: null,
    };
  }
}

export function subscribeQuickFlipSharedVault(listener) {
  if (typeof listener !== "function") return () => {};
  return subscribeSharedVault(snapshot => {
    const balance = Math.max(0, toFiniteNumber(snapshot?.balance, 0));
    listener({ balance });
  });
}

function settlementReceiptKey(sessionId, prefix = RECEIPT_PREFIX_QUICK_FLIP) {
  return `${prefix}${sessionId}`;
}

export function readQuickFlipSettlementReceipt(sessionId) {
  if (!sessionId || !canUseStorage()) return null;
  const raw = window.localStorage.getItem(settlementReceiptKey(sessionId, RECEIPT_PREFIX_QUICK_FLIP));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function applySharedVaultDelta(netDelta) {
  if (!Number.isFinite(netDelta) || netDelta === 0) {
    return {
      ok: true,
      balance: Math.max(0, toFiniteNumber(peekSharedVault()?.balance, 0)),
      error: null,
    };
  }

  initSharedVault();
  const deviceInit = await ensureArcadeDeviceCookie();
  if (!deviceInit?.success) {
    return {
      ok: false,
      balance: Math.max(0, toFiniteNumber(peekSharedVault()?.balance, 0)),
      error: deviceInit?.message || "Vault device initialization failed.",
    };
  }

  const csrfToken = await ensureCsrfToken();
  const response = await fetch("/api/solo-v2/quick-flip/vault-delta", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({
      gameId: QUICK_FLIP_SETTLEMENT_GAME_ID,
      delta: Math.trunc(netDelta),
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      balance: Math.max(0, toFiniteNumber(peekSharedVault()?.balance, 0)),
      error: String(payload?.message || "Vault settlement write failed."),
    };
  }

  const balance = Math.max(0, toFiniteNumber(payload?.balance, peekSharedVault()?.balance));
  return { ok: true, balance, error: null };
}

async function applySharedVaultSettlementOnce(sessionId, settlementSummary, receiptPrefix) {
  const netDelta = toFiniteNumber(settlementSummary?.netDelta, 0);
  const entryCost = toFiniteNumber(settlementSummary?.entryCost, 0);

  const currentBalance = Math.max(0, toFiniteNumber(peekSharedVault()?.balance, 0));
  const existingRaw = canUseStorage()
    ? window.localStorage.getItem(settlementReceiptKey(sessionId, receiptPrefix))
    : null;
  let existingReceipt = null;
  if (existingRaw) {
    try {
      existingReceipt = JSON.parse(existingRaw);
    } catch {
      existingReceipt = null;
    }
  }
  if (existingReceipt) {
    const snapshot = await readQuickFlipSharedVaultBalance();
    return {
      applied: false,
      alreadyApplied: true,
      nextBalance: snapshot?.ok ? snapshot.balance : currentBalance,
      receipt: existingReceipt,
    };
  }

  const vaultMutation = await applySharedVaultDelta(netDelta);
  if (!vaultMutation.ok) {
    return {
      applied: false,
      alreadyApplied: false,
      nextBalance: currentBalance,
      receipt: null,
      error: vaultMutation.error || "Vault mutation failed.",
    };
  }

  const snapshot = await readQuickFlipSharedVaultBalance();
  const nextBalance = Math.max(
    0,
    toFiniteNumber(snapshot?.ok ? snapshot.balance : vaultMutation.balance, currentBalance),
  );
  const receipt = {
    sessionId,
    netDelta,
    entryCost,
    appliedAt: new Date().toISOString(),
  };

  if (canUseStorage()) {
    window.localStorage.setItem(settlementReceiptKey(sessionId, receiptPrefix), JSON.stringify(receipt));
  }

  return {
    applied: true,
    alreadyApplied: false,
    nextBalance,
    receipt,
    error: null,
  };
}

export async function applyQuickFlipSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_QUICK_FLIP);
}

export async function applyMysteryBoxSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_MYSTERY_BOX);
}

export async function applyHighLowCardsSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_HIGH_LOW_CARDS);
}

export async function applyDicePickSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_DICE_PICK);
}

export async function applyGoldRushDiggerSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_GOLD_RUSH_DIGGER);
}

export async function applyTreasureDoorsSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_TREASURE_DOORS);
}

export async function applySpeedTrackSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_SPEED_TRACK);
}

export async function applyLimitRunSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_LIMIT_RUN);
}

export async function applyNumberHuntSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_NUMBER_HUNT);
}
