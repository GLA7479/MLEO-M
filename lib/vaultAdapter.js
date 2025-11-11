// lib/vaultAdapter.js
import { supabaseMP as supabase } from "./supabaseClients";

const FLAG = process.env.NEXT_PUBLIC_VAULT_ADAPTER_ENABLED === "true";
const KEY = "mleo_rush_core_v4";
const FIELD = "vault";
const MINERS_KEY = "mleoMiningEconomy_v2.1";

let deviceId = null;
let nonce = null;
let deltaQueue = 0;
let timer = null;

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

function setLocalVault(amount) {
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
  try {
    const { data, error } = await supabase.rpc("get_vault_balance");
    if (error) throw error;
    if (Array.isArray(data) && data.length) {
      const bal = Number(data[0]?.balance ?? data[0] ?? 0);
      return setLocalVault(bal);
    }
  } catch (err) {
    console.warn("[vaultAdapter] getBalance failed", err);
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

  const prevNonce = nonce || randomId();
  const nextNonce = randomId();

  try {
    const { data, error } = await supabase.rpc("sync_vault_delta", {
      p_game_id: String(gameId || "generic"),
      p_delta: pending,
      p_device_id: deviceId || randomId(),
      p_prev_nonce: prevNonce,
      p_next_nonce: nextNonce,
    });
    if (error) throw error;
    let newBalance = getLocalVault();
    if (Array.isArray(data) && data.length) {
      newBalance = Number(data[0]?.new_balance ?? data[0] ?? 0);
    }
    nonce = nextNonce;
    lsSetString("vault_nonce", nonce);
    deltaQueue -= pending;
    if (Math.abs(deltaQueue) < 1e-6) deltaQueue = 0;
    const remainder = deltaQueue;
    const finalLocal = newBalance + remainder;
    setLocalVault(finalLocal);
    return { ok: true };
  } catch (err) {
    console.error("[vaultAdapter] flushDelta failed", err);
    return { ok: false, error: String(err?.message || err) };
  }
}


