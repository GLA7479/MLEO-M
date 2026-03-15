// lib/vaultAdapter.js
import { supabaseMP as supabase } from "./supabaseClients";
import { ensureCsrfToken } from "./arcadeDeviceClient";

const FLAG = process.env.NEXT_PUBLIC_VAULT_ADAPTER_ENABLED === "true";
const KEY = "mleo_rush_core_v4";
const FIELD = "vault";
const MINERS_KEY = "mleoMiningEconomy_v2.1";
const EVENT_NAME = "mleo-vault-updated";

let deviceId = null;
let nonce = null;
let deltaQueue = 0;
let timer = null;

async function callArcadeApi(path, options = {}) {
  const csrfToken = await ensureCsrfToken();

  await fetch("/api/arcade/device", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify({}),
  });

  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Arcade vault API failed");
  }
  return payload;
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

export async function getBalance() {
  if (!FLAG || !hasWindow()) return getLocalVault();
  // Do not overwrite local state while there is unsynced delta pending.
  if (Math.abs(deltaQueue) > 1e-9) return getLocalVault();
  try {
    const payload = await callArcadeApi("/api/arcade/vault/balance", {
      method: "GET",
    });
    const bal = Number(payload?.balance || 0);
    return setLocalVault(bal);
  } catch (err) {
    const errMsg = String(err?.message || err || "");
    const errCode = err?.code || "";
    if (
      errCode !== "42702" &&
      !errMsg.toLowerCase().includes("ambiguous") &&
      errCode !== "P0001" &&
      !errMsg.toLowerCase().includes("invalid nonce")
    ) {
      console.warn("[vaultAdapter] getBalance failed", err);
    }
  }
  return getLocalVault();
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
    try {
      const payload = await callArcadeApi("/api/arcade/vault/claim", {
        method: "POST",
        body: JSON.stringify({
          amount: Math.abs(pending),
          gameId: String(gameId || "generic"),
        }),
      });
      const newBalance = Number(payload?.balance || 0);
      deltaQueue -= pending;
      if (Math.abs(deltaQueue) < 1e-6) deltaQueue = 0;
      const finalLocal = newBalance + deltaQueue;
      setLocalVault(finalLocal);
      return { ok: true };
    } catch (err) {
      const errMsg = String(err?.message || err || "");
      return { ok: false, error: errMsg };
    }
  }

  // Ensure deviceId is initialized
  if (!deviceId) {
    deviceId = lsGetString("vault_device_id") || randomId();
    lsSetString("vault_device_id", deviceId);
  }

  const prevNonce = nonce || randomId();
  const nextNonce = randomId();

  const applyServerResult = (data, usedNonce) => {
    let newBalance = getLocalVault();
    if (Array.isArray(data) && data.length) {
      newBalance = Number(data[0]?.new_balance ?? data[0] ?? 0);
    }
    nonce = usedNonce;
    lsSetString("vault_nonce", nonce);
    deltaQueue -= pending;
    if (Math.abs(deltaQueue) < 1e-6) deltaQueue = 0;
    const remainder = deltaQueue;
    const finalLocal = newBalance + remainder;
    setLocalVault(finalLocal);
    return { ok: true };
  };

  try {
    const { data, error } = await supabase.rpc("sync_vault_delta", {
      p_game_id: String(gameId || "generic"),
      p_delta: pending,
      p_device_id: deviceId,
      p_prev_nonce: prevNonce,
      p_next_nonce: nextNonce,
    });
    if (error) throw error;
    return applyServerResult(data, nextNonce);
  } catch (err) {
    const errMsg = String(err?.message || err || "");
    const errCode = err?.code || "";
    const isInvalidNonce = errCode === "P0001" || errMsg.toLowerCase().includes("invalid nonce");

    // Auto-recover once by resetting prev nonce on server call.
    if (isInvalidNonce) {
      try {
        const recoveryNonce = randomId();
        const { data: retryData, error: retryError } = await supabase.rpc("sync_vault_delta", {
          p_game_id: String(gameId || "generic"),
          p_delta: pending,
          p_device_id: deviceId,
          p_prev_nonce: null,
          p_next_nonce: recoveryNonce,
        });
        if (!retryError) {
          return applyServerResult(retryData, recoveryNonce);
        }
      } catch {
        // fall through to common error handling
      }
    }

    if (errMsg && 
        !errMsg.toLowerCase().includes("auth") && 
        !errMsg.includes("401") && 
        !errMsg.includes("403") &&
        errCode !== "400" &&
        errCode !== "42702" &&
        !errMsg.includes("ambiguous") &&
        !errMsg.includes("function") &&
        !errMsg.includes("does not exist") &&
        !isInvalidNonce) {
      console.error("[vaultAdapter] flushDelta failed", err);
    }
    return { ok: false, error: errMsg };
  }
}


