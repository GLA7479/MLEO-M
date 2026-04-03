import crypto from "crypto";
import { getArcadeDevice } from "./arcadeDeviceCookie";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { sanitizeGameId } from "./inputValidation";
import { buildIdemCommit, buildIdemSettle } from "../online-v2/c21/ov2C21EconomyIds";
import { getOv2C21DeviceForParticipant } from "./ov2C21ParticipantDevice";

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
/**
 * Authoritative vault read for a known arcade device (server-only; used for multi-seat pre-checks).
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} deviceId
 */
export async function getVaultBalanceForDevice(admin, deviceId) {
  const did = String(deviceId || "").trim();
  if (!did) {
    return { ok: false, code: "device_required", balance: 0 };
  }
  const { data, error } = await admin.rpc("get_vault_balance", {
    p_device_id: did,
  });
  if (error) {
    return { ok: false, code: "vault_read_failed", balance: 0, message: error.message };
  }
  const row = extractRow(data);
  const balance = Math.max(0, Math.floor(Number(row?.vault_balance ?? row?.balance ?? row ?? 0)));
  return { ok: true, balance };
}

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
 * Apply every commit/credit in `economyOps` to the vault device bound to each op's
 * `participantKey` for this room (see ov2_c21_participant_devices). Fails if any op
 * needs a device and no binding exists — caller must not persist engine/ledger without success.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} roomId
 * @param {number} matchSeq
 * @param {Array<{ type: string; participantKey?: string; amount?: number; suffix?: string; lineKind?: string }>} economyOps
 */
export async function applyC21EconomyOpsToVault(admin, roomId, matchSeq, economyOps) {
  for (const op of economyOps || []) {
    if (!op) continue;
    const recipientPk = String(op.participantKey || "").trim();
    const kind = String(op.type || "");
    const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
    if (amt <= 0) continue;
    if (kind !== "commit" && kind !== "credit") continue;

    if (!recipientPk) {
      return {
        ok: false,
        code: "c21_vault_participant_required",
        message: "Economy op missing participantKey for vault apply",
      };
    }

    const deviceId = await getOv2C21DeviceForParticipant(admin, roomId, recipientPk);
    if (!deviceId) {
      return {
        ok: false,
        code: "c21_vault_binding_missing",
        message:
          "No arcade device bound for a participant in this room; cannot apply vault delta. Ensure the player has connected with a device cookie (e.g. commit play or tick) before settlement.",
        participantKey: recipientPk,
      };
    }

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
 * Best-effort reverse of applyC21EconomyOpsToVault after a failed follow-up step.
 * Uses current participant→device bindings for the same room.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} roomId
 * @param {number} matchSeq
 * @param {Array<{ type: string; participantKey?: string; amount?: number; suffix?: string }>} economyOps
 */
export async function reverseC21EconomyOps(admin, roomId, matchSeq, economyOps) {
  const reversed = (economyOps || []).filter(o => o && String(o.participantKey || "").trim()).slice().reverse();
  for (const op of reversed) {
    const recipientPk = String(op.participantKey || "").trim();
    const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
    if (amt <= 0) continue;
    const kind = String(op.type || "");
    const suffix = String(op.suffix || "x");
    const deviceId = await getOv2C21DeviceForParticipant(admin, roomId, recipientPk);
    if (!deviceId) continue;

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
