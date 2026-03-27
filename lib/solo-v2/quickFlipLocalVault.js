import { QUICK_FLIP_CONFIG } from "./quickFlipConfig";

const BALANCE_KEY = "solo_v2_quick_flip_local_vault_balance";
const RECEIPT_PREFIX = "solo_v2_quick_flip_settlement_receipt:";
const DEFAULT_BALANCE = 1000;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function readQuickFlipLocalVaultBalance() {
  if (!canUseStorage()) return DEFAULT_BALANCE;
  const raw = window.localStorage.getItem(BALANCE_KEY);
  if (raw === null) {
    window.localStorage.setItem(BALANCE_KEY, String(DEFAULT_BALANCE));
    return DEFAULT_BALANCE;
  }
  return Math.max(0, toFiniteNumber(raw, DEFAULT_BALANCE));
}

export function writeQuickFlipLocalVaultBalance(nextBalance) {
  const safe = Math.max(0, toFiniteNumber(nextBalance, 0));
  if (canUseStorage()) {
    window.localStorage.setItem(BALANCE_KEY, String(safe));
  }
  return safe;
}

function settlementReceiptKey(sessionId) {
  return `${RECEIPT_PREFIX}${sessionId}`;
}

export function readQuickFlipSettlementReceipt(sessionId) {
  if (!sessionId || !canUseStorage()) return null;
  const raw = window.localStorage.getItem(settlementReceiptKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function applyQuickFlipSettlementOnce(sessionId, settlementSummary) {
  const netDelta = toFiniteNumber(settlementSummary?.netDelta, 0);
  const entryCost = toFiniteNumber(settlementSummary?.entryCost, QUICK_FLIP_CONFIG.entryCost);

  const currentBalance = readQuickFlipLocalVaultBalance();
  const existingReceipt = readQuickFlipSettlementReceipt(sessionId);
  if (existingReceipt) {
    return {
      applied: false,
      alreadyApplied: true,
      nextBalance: currentBalance,
      receipt: existingReceipt,
    };
  }

  const nextBalance = writeQuickFlipLocalVaultBalance(currentBalance + netDelta);
  const receipt = {
    sessionId,
    netDelta,
    entryCost,
    appliedAt: new Date().toISOString(),
  };

  if (canUseStorage()) {
    window.localStorage.setItem(settlementReceiptKey(sessionId), JSON.stringify(receipt));
  }

  return {
    applied: true,
    alreadyApplied: false,
    nextBalance,
    receipt,
  };
}
