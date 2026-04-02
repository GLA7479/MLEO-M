import crypto from "crypto";
import { sanitizeGameId } from "./inputValidation";
import { buildIdemCommit, buildIdemSettle } from "../online-v2/community_cards/ov2CcEconomyIds";
import { getOv2CcDeviceForParticipant } from "./ov2CcParticipantDevice";

function vaultGameIdFromIdem(idem) {
  const h = crypto.createHash("sha256").update(String(idem)).digest("hex").slice(0, 36);
  const g = sanitizeGameId(`cc_${h}`);
  return g || `cc_${h.slice(0, 32)}`;
}

export { getArcadeVaultBalanceForRequest } from "./ov2C21VaultAuthority";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} roomId
 * @param {number} matchSeq
 * @param {Array<{ type: string; participantKey?: string; amount?: number; suffix?: string; lineKind?: string }>} economyOps
 */
export async function applyCcEconomyOpsToVault(admin, roomId, matchSeq, economyOps) {
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
        code: "cc_vault_participant_required",
        message: "Economy op missing participantKey for vault apply",
      };
    }

    const deviceId = await getOv2CcDeviceForParticipant(admin, roomId, recipientPk);
    if (!deviceId) {
      return {
        ok: false,
        code: "cc_vault_binding_missing",
        message:
          "No arcade device bound for a participant in this room; cannot apply vault delta. Ensure the player has connected with a device cookie before money moves.",
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
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} roomId
 * @param {number} matchSeq
 * @param {Array<{ type: string; participantKey?: string; amount?: number; suffix?: string }>} economyOps
 */
export async function reverseCcEconomyOps(admin, roomId, matchSeq, economyOps) {
  const reversed = (economyOps || []).filter(o => o && String(o.participantKey || "").trim()).slice().reverse();
  for (const op of reversed) {
    const recipientPk = String(op.participantKey || "").trim();
    const amt = Math.max(0, Math.floor(Number(op.amount) || 0));
    if (amt <= 0) continue;
    const kind = String(op.type || "");
    const suffix = String(op.suffix || "x");
    const deviceId = await getOv2CcDeviceForParticipant(admin, roomId, recipientPk);
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
