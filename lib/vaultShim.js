// lib/vaultShim.js
import { queueDelta, flushDelta, getBalance, initVaultAdapter } from "./vaultAdapter";

const FLAG = process.env.NEXT_PUBLIC_VAULT_ADAPTER_ENABLED === "true";
const CORE_KEY = "mleo_rush_core_v4";
const CORE_FIELD = "vault";
const MINERS_KEY = "mleoMiningEconomy_v2.1";

let initialized = false;
let flushTimer = null;
let inflightBalance = null;
let lastBalanceFetch = 0;

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore parse errors
  }
  return typeof fallback === "object" ? { ...fallback } : fallback;
}

function trackerFor(key) {
  if (key === CORE_KEY) {
    return {
      read(payload) {
        const val = Number(payload?.[CORE_FIELD] ?? 0);
        return Number.isFinite(val) ? val : 0;
      },
      write(payload, amount) {
        const next = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
        next[CORE_FIELD] = amount;
        return next;
      },
    };
  }
  if (key === MINERS_KEY) {
    return {
      read(payload) {
        const val = Number(payload?.vault ?? 0);
        return Number.isFinite(val) ? val : 0;
      },
      write(payload, amount) {
        const next = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
        next.vault = amount;
        return next;
      },
    };
  }
  return null;
}

function scheduleFlush() {
  if (!hasWindow()) return;
  if (flushTimer) return;
  flushTimer = window.setTimeout(async () => {
    try {
      await flushDelta("auto");
    } catch (err) {
      console.warn("[vaultShim] flushDelta error", err);
    } finally {
      flushTimer = null;
    }
  }, 4_000);
}

function syncVaultValue(_setItem, _getItem, key, amount) {
  const tracker = trackerFor(key);
  if (!tracker) return;
  const target = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const raw = _getItem(key);
  const payload = safeParse(raw, {});
  const current = tracker.read(payload);
  if (Math.abs(current - target) < 1e-6) return;
  const updated = tracker.write(payload, target);
  try {
    _setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.warn("[vaultShim] syncVaultValue failed", err);
  }
}

function requestBalanceSync(_setItem, _getItem) {
  if (!FLAG) return;
  const now = Date.now();
  if (inflightBalance) return;
  if (now - lastBalanceFetch < 5_000) return;
  lastBalanceFetch = now;

  inflightBalance = getBalance()
    .then(balance => {
      syncVaultValue(_setItem, _getItem, MINERS_KEY, balance);
    })
    .catch(err => {
      console.warn("[vaultShim] balance sync failed", err);
    })
    .finally(() => {
      inflightBalance = null;
    });
}

export function initVaultShim() {
  if (initialized) return;
  initialized = true;

  initVaultAdapter();
  if (!FLAG || !hasWindow()) return;

  const storage = window.localStorage;
  const originalSet = storage.setItem.bind(storage);
  const originalGet = storage.getItem.bind(storage);

  const trackedKeys = new Set([CORE_KEY, MINERS_KEY]);

  storage.setItem = function patchedSetItem(key, value) {
    if (window.__VAULT_SHIM_BYPASS__ === true || !trackedKeys.has(key)) {
      return originalSet(key, value);
    }

    const tracker = trackerFor(key);
    if (!tracker) {
      return originalSet(key, value);
    }

    const beforePayload = safeParse(originalGet(key), {});
    const rawValue = typeof value === "string" ? value : String(value ?? "");
    const afterPayload = safeParse(rawValue, {});

    const beforeVault = tracker.read(beforePayload);
    let afterVault = tracker.read(afterPayload);
    if (!Number.isFinite(afterVault)) afterVault = 0;
    if (afterVault < 0) afterVault = 0;

    const updatedPayload = tracker.write(afterPayload, afterVault);
    originalSet(key, JSON.stringify(updatedPayload));

    const delta = afterVault - beforeVault;
    if (Math.abs(delta) > 1e-6) {
      queueDelta(delta, { syncLocal: false });
      scheduleFlush();
    }
  };

  storage.getItem = function patchedGetItem(key) {
    const value = originalGet(key);
    if (window.__VAULT_SHIM_BYPASS__ === true || !trackedKeys.has(key)) {
      return value;
    }
    requestBalanceSync(originalSet, originalGet);
    return value;
  };

  window.addEventListener("beforeunload", () => {
    if (!FLAG) return;
    flushDelta("unload").catch(() => {});
  });

  requestBalanceSync(originalSet, originalGet);
}

