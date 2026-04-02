import crypto from "crypto";
import { getArcadeDevice } from "./arcadeDeviceCookie";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { sanitizeGameId } from "./inputValidation";
import { buildIdemCommit, buildIdemSettle } from "../online-v2/c21/ov2C21EconomyIds";

function extractRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

/** Deterministic short game_id for sync_vault_delta (<= 50 chars, alphanumeric + _-). */
function vaultGameIdFromIdem(idem) {
  const h = crypto.createHash("sha256").update(String(idem)).digest("hex").slice(0, 36);
  const g = sanitizeGameId(`c21_${h}`);
  return g || `c21_${h.slice(0, 32)}`;
}

/**
 * Read authoritative vault balance for the request's arcade device.
 * @param {import("http").IncomingMessage} req
 */
export async function getArcadeVaultBalanceForRequest(req) {
  const admin = getSupabaseAdmin();
  const deviceId = getArcadeDevice(req);
  if (!deviceId) {
    return { ok: false, code: "device_required", balance: 0 };
  }
  const { data, error } = await admin.rpc("get_vault_balance", {
    p_device_id: deviceId,
  });
  if (error) {
    return { ok: false, code: "vault_read_failed", balance: 0, message: error.message };
  }
  const row = extractRow(data);
  const balance = Math.max(0, Math.floor(Number(row?.vault_balance ?? row?.balance ?? row ?? 0)));
  return { ok: true, balance, deviceId };
}

/**
 * Apply commit (debit) / credit economy ops for the HTTP caller's device only
 * when participantKey matches `callerParticipantKey`.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {import("http").IncomingMessage} req
 * @param {string} roomId
 * @param {number} matchSeq
 * @param {string} callerParticipantKey
 * @param {Array<{ type: string; participantKey?: string; amount?: number; suffix?: string; lineKind?: string }>} economyOps
 */
export async function applyC21ServerVaultForCaller(admin, req, roomId, matchSeq, callerParticipantKey, economyOps) {
  const pk = String(callerParticipantKey || "").trim();
  if (!pk) return { ok: false, code: "participant_required" };
  const deviceId = getArcadeDevice(req);
  if (!deviceId) return { ok: false, code: "device_required" };

  for (const op of economyOps || []) {
    if (!op || String(op.participantKey || "").trim() !== pk) continue;
    const kind = String(op.type || "");
    const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
    if (amt <= 0) continue;

    if (kind === "commit") {
      const suffix = String(op.suffix || "commit");
      const idem = buildIdemCommit(roomId, matchSeq, suffix);
      const gameId = vaultGameIdFromIdem(idem);
      const { error } = await admin.rpc("sync_vault_delta", {
        p_game_id: gameId,
        p_delta: -amt,
        p_device_id: deviceId,
        p_prev_nonce: null,
        p_next_nonce: crypto.randomUUID(),
      });
      if (error) {
        const msg = String(error.message || "");
        const insuff = msg.toLowerCase().includes("insufficient");
        return { ok: false, code: insuff ? "insufficient_vault" : "vault_debit_failed", message: msg };
      }
    } else if (kind === "credit") {
      const suffix = String(op.suffix || "credit");
      const idem = buildIdemSettle(roomId, matchSeq, suffix);
      const gameId = vaultGameIdFromIdem(idem);
      const { error } = await admin.rpc("sync_vault_delta", {
        p_game_id: gameId,
        p_delta: amt,
        p_device_id: deviceId,
        p_prev_nonce: null,
        p_next_nonce: crypto.randomUUID(),
      });
      if (error) {
        return { ok: false, code: "vault_credit_failed", message: error.message || String(error) };
      }
    }
  }

  return { ok: true };
}

/**
 * Best-effort reverse of applyC21ServerVaultForCaller after a failed follow-up step.
 * @param {Array<{ type: string; participantKey?: string; amount?: number; suffix?: string }>} economyOps
 */
export async function reverseC21ServerVaultForCaller(admin, req, roomId, matchSeq, callerParticipantKey, economyOps) {
  const pk = String(callerParticipantKey || "").trim();
  const deviceId = getArcadeDevice(req);
  if (!pk || !deviceId) return { ok: false };

  const reversed = (economyOps || []).filter(o => o && String(o.participantKey || "").trim() === pk).slice().reverse();
  for (const op of reversed) {
    const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
    if (amt <= 0) continue;
    const kind = String(op.type || "");
    const suffix = String(op.suffix || "x");
    if (kind === "commit") {
      const idem = `rev:${buildIdemCommit(roomId, matchSeq, suffix)}`;
      const gameId = vaultGameIdFromIdem(idem);
      await admin.rpc("sync_vault_delta", {
        p_game_id: gameId,
        p_delta: amt,
        p_device_id: deviceId,
        p_prev_nonce: null,
        p_next_nonce: crypto.randomUUID(),
      });
    } else if (kind === "credit") {
      const idem = `rev:${buildIdemSettle(roomId, matchSeq, suffix)}`;
      const gameId = vaultGameIdFromIdem(idem);
      await admin.rpc("sync_vault_delta", {
        p_game_id: gameId,
        p_delta: -amt,
        p_device_id: deviceId,
        p_prev_nonce: null,
        p_next_nonce: crypto.randomUUID(),
      });
    }
  }
  return { ok: true };
}
