import {
  initSharedVault,
  peekSharedVault,
  readSharedVault,
  subscribeSharedVault,
} from "../sharedVault";
import { ensureArcadeDeviceCookie, ensureCsrfToken } from "../arcadeDeviceClient";

const RECEIPT_PREFIX_QUICK_FLIP = "solo_v2_quick_flip_settlement_receipt:";
const RECEIPT_PREFIX_ODD_EVEN = "solo_v2_odd_even_settlement_receipt:";
const RECEIPT_PREFIX_MYSTERY_BOX = "solo_v2_mystery_box_settlement_receipt:";
const RECEIPT_PREFIX_HIGH_LOW_CARDS = "solo_v2_high_low_cards_settlement_receipt:";
const RECEIPT_PREFIX_DICE_PICK = "solo_v2_dice_pick_settlement_receipt:";
const RECEIPT_PREFIX_GOLD_RUSH_DIGGER = "solo_v2_gold_rush_digger_settlement_receipt:";
const RECEIPT_PREFIX_TREASURE_DOORS = "solo_v2_treasure_doors_settlement_receipt:";
const RECEIPT_PREFIX_VAULT_DOORS = "solo_v2_vault_doors_settlement_receipt:";
const RECEIPT_PREFIX_CRYSTAL_PATH = "solo_v2_crystal_path_settlement_receipt:";
const RECEIPT_PREFIX_SPEED_TRACK = "solo_v2_speed_track_settlement_receipt:";
const RECEIPT_PREFIX_LIMIT_RUN = "solo_v2_limit_run_settlement_receipt:";
const RECEIPT_PREFIX_NUMBER_HUNT = "solo_v2_number_hunt_settlement_receipt:";
const RECEIPT_PREFIX_DROP_RUN = "solo_v2_drop_run_settlement_receipt:";
const RECEIPT_PREFIX_TRIPLE_DICE = "solo_v2_triple_dice_settlement_receipt:";
const RECEIPT_PREFIX_CHALLENGE_21 = "solo_v2_challenge_21_settlement_receipt:";
const RECEIPT_PREFIX_MYSTERY_CHAMBER = "solo_v2_mystery_chamber_settlement_receipt:";
const RECEIPT_PREFIX_CORE_BREAKER = "solo_v2_core_breaker_settlement_receipt:";
const RECEIPT_PREFIX_FLASH_VEIN = "solo_v2_flash_vein_settlement_receipt:";
const RECEIPT_PREFIX_DIAMONDS = "solo_v2_diamonds_settlement_receipt:";
const RECEIPT_PREFIX_SOLO_LADDER = "solo_v2_solo_ladder_settlement_receipt:";
const RECEIPT_PREFIX_PULSE_LOCK = "solo_v2_pulse_lock_settlement_receipt:";
const RECEIPT_PREFIX_ECHO_SEQUENCE = "solo_v2_echo_sequence_settlement_receipt:";
const RECEIPT_PREFIX_SAFE_ZONE = "solo_v2_safe_zone_settlement_receipt:";
const QUICK_FLIP_SETTLEMENT_GAME_ID = "solo-v2-quick-flip-settlement";
const PULSE_LOCK_SETTLEMENT_GAME_ID = "solo-v2-pulse-lock-settlement";
const ECHO_SEQUENCE_SETTLEMENT_GAME_ID = "solo-v2-echo-sequence-settlement";
const SAFE_ZONE_SETTLEMENT_GAME_ID = "solo-v2-safe-zone-settlement";

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

async function applySharedVaultDelta(
  netDelta,
  {
    gameId = QUICK_FLIP_SETTLEMENT_GAME_ID,
    vaultPath = "/api/solo-v2/quick-flip/vault-delta",
  } = {},
) {
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
  const response = await fetch(vaultPath, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({
      gameId,
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

async function applySharedVaultSettlementOnce(sessionId, settlementSummary, receiptPrefix, vaultOptions = {}) {
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

  const vaultMutation = await applySharedVaultDelta(netDelta, vaultOptions);
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

export async function applyOddEvenSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_ODD_EVEN);
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

export async function applyVaultDoorsSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_VAULT_DOORS);
}

export async function applyCrystalPathSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_CRYSTAL_PATH);
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

export async function applyDropRunSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_DROP_RUN);
}

export async function applyTripleDiceSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_TRIPLE_DICE);
}

export async function applyChallenge21SettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_CHALLENGE_21);
}

export async function applyMysteryChamberSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_MYSTERY_CHAMBER);
}

export async function applyCoreBreakerSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_CORE_BREAKER);
}

export async function applyFlashVeinSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_FLASH_VEIN);
}

export async function applyDiamondsSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_DIAMONDS);
}

export async function applySoloLadderSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_SOLO_LADDER);
}

export async function applyPulseLockSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_PULSE_LOCK, {
    gameId: PULSE_LOCK_SETTLEMENT_GAME_ID,
    vaultPath: "/api/solo-v2/pulse-lock/vault-delta",
  });
}

export async function applyEchoSequenceSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_ECHO_SEQUENCE, {
    gameId: ECHO_SEQUENCE_SETTLEMENT_GAME_ID,
    vaultPath: "/api/solo-v2/echo-sequence/vault-delta",
  });
}

export async function applySafeZoneSettlementOnce(sessionId, settlementSummary) {
  return applySharedVaultSettlementOnce(sessionId, settlementSummary, RECEIPT_PREFIX_SAFE_ZONE, {
    gameId: SAFE_ZONE_SETTLEMENT_GAME_ID,
    vaultPath: "/api/solo-v2/safe-zone/vault-delta",
  });
}
