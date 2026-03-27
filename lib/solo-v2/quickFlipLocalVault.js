import {
  initSharedVault,
  peekSharedVault,
  readSharedVault,
  subscribeSharedVault,
} from "../sharedVault";
import { ensureArcadeDeviceCookie, ensureCsrfToken } from "../arcadeDeviceClient";

const RECEIPT_PREFIX = "solo_v2_quick_flip_settlement_receipt:";
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

export async function applyQuickFlipSettlementOnce(sessionId, settlementSummary) {
  const netDelta = toFiniteNumber(settlementSummary?.netDelta, 0);
  const entryCost = toFiniteNumber(settlementSummary?.entryCost, 0);

  const currentBalance = Math.max(0, toFiniteNumber(peekSharedVault()?.balance, 0));
  const existingReceipt = readQuickFlipSettlementReceipt(sessionId);
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
    window.localStorage.setItem(settlementReceiptKey(sessionId), JSON.stringify(receipt));
  }

  return {
    applied: true,
    alreadyApplied: false,
    nextBalance,
    receipt,
    error: null,
  };
}
