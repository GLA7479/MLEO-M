// lib/vaultAdapter.js
import { ensureArcadeDeviceCookie, ensureCsrfToken } from "./arcadeDeviceClient";

const FLAG = process.env.NEXT_PUBLIC_VAULT_ADAPTER_ENABLED === "true";
const KEY = "mleo_rush_core_v4";
const FIELD = "vault";
const MINERS_KEY = "mleoMiningEconomy_v2.1";
const EVENT_NAME = "mleo-vault-updated";

let deviceId = null;
let nonce = null;
let deltaQueue = 0;
let timer = null;

/**
 * Arcade vault fetches — returns `{ ok, payload }` instead of throwing so Next.js dev overlay does not
 * treat handled vault/device failures as uncaught runtime errors.
 */
async function callArcadeApi(path, options = {}) {
  let dev;
  try {
    dev = await ensureArcadeDeviceCookie();
  } catch (e) {
    dev = {
      success: false,
      status: 0,
      message: e?.message || String(e || "Arcade device init failed"),
    };
  }
  if (!dev?.success) {
    const status = typeof dev?.status === "number" ? dev.status : "?";
    return {
      ok: false,
      error: dev?.message || `Arcade device unavailable (${status})`,
      payload: null,
    };
  }

  const method = String(options.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const csrfToken = await ensureCsrfToken();

  const { headers: optionHeaders, ...restOptions } = options;

  let response;
  try {
    response = await fetch(path, {
      credentials: "include",
      ...restOptions,
      method,
      headers: {
        ...(isGet ? {} : { "Content-Type": "application/json" }),
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...(optionHeaders || {}),
      },
    });
  } catch (e) {
    return { ok: false, error: e?.message || String(e), payload: null };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.message || `Arcade vault API failed (${response.status})`,
      payload,
    };
  }
  return { ok: true, error: null, payload };
}

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function lsGetJson(key, fallback) {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return safeParse(raw, fallback);
  } catch {
    return fallback;
  }
}

function lsSetJson(key, value) {
  if (!hasWindow()) return;
  withBypass(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota errors
    }
  });
}

function lsGetString(key, fallback = null) {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}

function lsSetString(key, value) {
  if (!hasWindow()) return;
  withBypass(() => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  });
}

function ensureLocalCore() {
  const core = lsGetJson(KEY, {});
  if (typeof core !== "object" || core === null) return {};
  return core;
}

function getLocalVault() {
  const obj = ensureLocalCore();
  const val = Number(obj?.[FIELD] ?? 0);
  return Number.isFinite(val) ? val : 0;
}

function announceVaultUpdate(balance, source = "vaultAdapter") {
  if (!hasWindow()) return;
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: {
          balance: Math.max(0, Number.isFinite(balance) ? balance : 0),
          source,
          at: Date.now(),
        },
      })
    );
  } catch {
    // ignore event dispatch errors
  }
}

export function peekLocalVault() {
  return getLocalVault();
}

export function peekPendingVaultDelta() {
  return deltaQueue;
}

export function setLocalVault(amount, { announce = true } = {}) {
  let next = Math.max(0, Number.isFinite(amount) ? amount : 0);
  if (Math.abs(next) < 1e-6) next = 0;
  const obj = ensureLocalCore();
  obj[FIELD] = next;
  lsSetJson(KEY, obj);
  const miners = lsGetJson(MINERS_KEY, null);
  if (miners && typeof miners === "object" && !Array.isArray(miners)) {
    const current = Number(miners?.vault ?? 0);
    if (!Number.isFinite(current) || Math.abs(current - next) > 1e-6) {
      miners.vault = next;
      lsSetJson(MINERS_KEY, miners);
    }
  }
  if (announce) {
    announceVaultUpdate(next);
  }
  return next;
}

function withBypass(callback) {
  if (!hasWindow()) return callback();
  const w = window;
  const prev = w.__VAULT_SHIM_BYPASS__ === true;
  w.__VAULT_SHIM_BYPASS__ = true;
  try {
    return callback();
  } finally {
    if (!prev) {
      delete w.__VAULT_SHIM_BYPASS__;
    } else {
      w.__VAULT_SHIM_BYPASS__ = true;
    }
  }
}

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function roundDelta(value) {
  const num = Number(value) || 0;
  // server expects bigint; truncate toward zero to keep conservative totals
  return Math.trunc(num);
}

export function initVaultAdapter() {
  if (!FLAG || !hasWindow()) return;
  if (!deviceId) {
    deviceId = lsGetString("vault_device_id") || randomId();
    lsSetString("vault_device_id", deviceId);
  }
  if (!nonce) {
    nonce = lsGetString("vault_nonce") || randomId();
    lsSetString("vault_nonce", nonce);
  }
  if (!timer) {
    timer = window.setInterval(() => {
      flushDelta("periodic").catch(() => {});
    }, 30_000);
  }
}

/**
 * @param {{ forceServer?: boolean }} [options] If `forceServer`, fetch from API even when a local delta queue exists
 * (use after server-authoritative wallet changes that did not go through this tab's queue).
 */
export async function getBalance(options = {}) {
  const forceServer = Boolean(options.forceServer);
  if (!FLAG || !hasWindow()) return getLocalVault();
  if (!forceServer && Math.abs(deltaQueue) > 1e-9) return getLocalVault();
  const balRes = await callArcadeApi("/api/arcade/vault/balance", {
    method: "GET",
  });
  if (!balRes.ok) {
    const errMsg = String(balRes.error || "");
    const errCode = balRes.payload?.code || "";
    if (
      errCode !== "42702" &&
      !errMsg.toLowerCase().includes("ambiguous") &&
      errCode !== "P0001" &&
      !errMsg.toLowerCase().includes("invalid nonce")
    ) {
      console.warn("[vaultAdapter] getBalance failed", balRes.error);
    }
    return getLocalVault();
  }
  const bal = Number(balRes.payload?.balance || 0);
  if (forceServer) {
    deltaQueue = 0;
  }
  return setLocalVault(bal);
}

export function queueDelta(delta, { syncLocal = true } = {}) {
  const amount = Number.isFinite(delta) ? delta : 0;
  if (syncLocal) {
    const nextLocal = getLocalVault() + amount;
    setLocalVault(nextLocal);
  }
  if (!FLAG || !hasWindow()) return;
  deltaQueue += amount;
}

export async function flushDelta(gameId = "generic") {
  if (!FLAG || !hasWindow()) return { ok: true, skipped: true };
  const pending = roundDelta(deltaQueue);
  if (!pending) return { ok: true, skipped: true };

  if (pending < 0) {
    const claimRes = await callArcadeApi("/api/arcade/vault/claim", {
      method: "POST",
      body: JSON.stringify({
        amount: Math.abs(pending),
        gameId: String(gameId || "generic"),
      }),
    });
    if (!claimRes.ok) {
      return { ok: false, error: String(claimRes.error || "") };
    }
    const newBalance = Number(claimRes.payload?.balance || 0);
    deltaQueue -= pending;
    if (Math.abs(deltaQueue) < 1e-6) deltaQueue = 0;
    const finalLocal = newBalance + deltaQueue;
    setLocalVault(finalLocal);
    return { ok: true };
  }

  const creditRes = await callArcadeApi("/api/arcade/vault/credit", {
    method: "POST",
    body: JSON.stringify({
      amount: pending,
      gameId: String(gameId || "generic"),
    }),
  });
  if (!creditRes.ok) {
    const errMsg = String(creditRes.error || "");
    if (
      errMsg &&
      !errMsg.toLowerCase().includes("auth") &&
      !errMsg.includes("401") &&
      !errMsg.includes("403") &&
      !errMsg.includes("42702") &&
      !errMsg.includes("ambiguous") &&
      !errMsg.includes("function") &&
      !errMsg.includes("does not exist")
    ) {
      console.warn("[vaultAdapter] flushDelta credit failed", errMsg);
    }
    return { ok: false, error: errMsg };
  }
  const newBalance = Number(creditRes.payload?.balance ?? 0);
  deltaQueue -= pending;
  if (Math.abs(deltaQueue) < 1e-6) deltaQueue = 0;
  const remainder = deltaQueue;
  const finalLocal = newBalance + remainder;
  setLocalVault(finalLocal);
  return { ok: true };
}


