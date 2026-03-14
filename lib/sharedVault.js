import {
  flushDelta,
  getBalance,
  initVaultAdapter,
  peekLocalVault,
  queueDelta,
} from "./vaultAdapter";

const EVENT_NAME = "mleo-vault-updated";
const CHANNEL_NAME = "mleo-shared-vault";
const STORAGE_PING_KEY = "mleo_shared_vault_ping_v1";

let initialized = false;
let channel = null;
let lastSyncedAt = 0;
const listeners = new Set();

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeAmount(amount) {
  const value = Math.floor(Number(amount) || 0);
  return value > 0 ? value : 0;
}

function currentSnapshot() {
  return {
    balance: Math.max(0, Math.floor(Number(peekLocalVault()) || 0)),
    lastSyncedAt,
  };
}

function notifyListeners(snapshot) {
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch (err) {
      console.warn("[sharedVault] subscriber failed", err);
    }
  });
}

function notifyLocal(snapshot) {
  notifyListeners(snapshot);
}

function broadcastSnapshot(snapshot) {
  if (!hasWindow()) return;
  if (channel) {
    try {
      channel.postMessage({ type: EVENT_NAME, snapshot });
    } catch {
      // ignore BroadcastChannel failures
    }
  }
  try {
    window.localStorage.setItem(
      STORAGE_PING_KEY,
      JSON.stringify({ at: Date.now(), balance: snapshot.balance })
    );
  } catch {
    // ignore storage ping failures
  }
}

function updateFromCurrent({ synced = false, broadcast = false } = {}) {
  if (synced) lastSyncedAt = Date.now();
  const snapshot = currentSnapshot();
  notifyLocal(snapshot);
  if (broadcast) broadcastSnapshot(snapshot);
  return snapshot;
}

function handleExternalSnapshot(balance, syncedAt = 0) {
  if (Number.isFinite(syncedAt) && syncedAt > lastSyncedAt) {
    lastSyncedAt = syncedAt;
  }
  const nextBalance = Math.max(0, Math.floor(Number(balance) || 0));
  const localBalance = Math.max(0, Math.floor(Number(peekLocalVault()) || 0));
  const snapshot = {
    balance: Number.isFinite(nextBalance) ? nextBalance : localBalance,
    lastSyncedAt,
  };
  notifyLocal(snapshot);
}

export function initSharedVault() {
  if (!hasWindow() || initialized) return;
  initialized = true;
  initVaultAdapter();

  if (typeof window.BroadcastChannel !== "undefined") {
    try {
      channel = new window.BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", event => {
        if (event?.data?.type !== EVENT_NAME) return;
        const snapshot = event.data.snapshot || {};
        handleExternalSnapshot(snapshot.balance, snapshot.lastSyncedAt || 0);
      });
    } catch {
      channel = null;
    }
  }

  window.addEventListener(EVENT_NAME, event => {
    const balance = event?.detail?.balance;
    handleExternalSnapshot(balance, event?.detail?.at || 0);
  });

  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_PING_KEY && event.key !== "mleo_rush_core_v4") return;
    let ping = null;
    if (event.key === STORAGE_PING_KEY && event.newValue) {
      try {
        ping = JSON.parse(event.newValue);
      } catch {
        ping = null;
      }
    }
    handleExternalSnapshot(ping?.balance, ping?.at || 0);
  });
}

export async function readSharedVault({ fresh = true } = {}) {
  initSharedVault();
  if (!fresh) return currentSnapshot();
  try {
    const balance = await getBalance();
    if (Number.isFinite(balance)) {
      lastSyncedAt = Date.now();
      return updateFromCurrent({ synced: false, broadcast: false });
    }
  } catch (err) {
    console.warn("[sharedVault] read failed", err);
  }
  return currentSnapshot();
}

export function peekSharedVault() {
  initSharedVault();
  return currentSnapshot();
}

export async function syncSharedVault(gameId = "shared-vault") {
  initSharedVault();
  const result = await flushDelta(gameId);
  const synced = Boolean(result?.ok || result?.skipped);
  const snapshot = updateFromCurrent({ synced, broadcast: true });
  console.info("[sharedVault] sync", { gameId, synced, balance: snapshot.balance });
  return { ok: synced, synced, error: result?.error || null, ...snapshot };
}

export async function creditSharedVault(amount, gameId) {
  initSharedVault();
  const value = normalizeAmount(amount);
  if (!value) return { ok: true, synced: true, error: null, ...currentSnapshot() };
  queueDelta(value, { syncLocal: true });
  let snapshot = updateFromCurrent({ broadcast: true });
  const result = await flushDelta(String(gameId || "generic"));
  const synced = Boolean(result?.ok || result?.skipped);
  snapshot = updateFromCurrent({ synced, broadcast: true });
  console.info("[sharedVault] credit", { gameId, amount: value, synced, balance: snapshot.balance });
  return { ok: true, synced, error: synced ? null : result?.error || "Sync failed", ...snapshot };
}

export async function debitSharedVault(amount, gameId) {
  initSharedVault();
  const value = normalizeAmount(amount);
  if (!value) return { ok: true, synced: true, error: null, ...currentSnapshot() };
  const current = currentSnapshot();
  if (current.balance < value) {
    return {
      ok: false,
      synced: true,
      error: "Insufficient vault balance",
      ...current,
    };
  }
  queueDelta(-value, { syncLocal: true });
  let snapshot = updateFromCurrent({ broadcast: true });
  const result = await flushDelta(String(gameId || "generic"));
  const synced = Boolean(result?.ok || result?.skipped);
  snapshot = updateFromCurrent({ synced, broadcast: true });
  console.info("[sharedVault] debit", { gameId, amount: value, synced, balance: snapshot.balance });
  return { ok: true, synced, error: synced ? null : result?.error || "Sync failed", ...snapshot };
}

export function subscribeSharedVault(listener) {
  initSharedVault();
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  try {
    listener(currentSnapshot());
  } catch (err) {
    console.warn("[sharedVault] subscriber failed during init", err);
  }
  return () => {
    listeners.delete(listener);
  };
}
