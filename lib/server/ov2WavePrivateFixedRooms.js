/**
 * Private wave rooms write `ov2_rooms.password_hash` and touch `last_activity_at` (via operate).
 * Those columns are defined in `migrations/online-v2/046_ov2_shared_rooms_schema.sql` (not in 070).
 *
 * Wave-only private rooms use `ov2_rooms.join_code` for a unique 5-digit numeric string (00000–99999),
 * distinct from shared-room alphanumeric join codes.
 */

import crypto from "crypto";

import {
  OV2_C21_PRODUCT_GAME_ID,
  OV2_C21_STAKE_TIERS,
} from "../online-v2/c21/ov2C21TableIds";
import { OV2_CW_PRODUCT_GAME_ID, OV2_CW_STAKE_TIERS } from "../online-v2/color_wheel/ov2CwTableIds";
import {
  OV2_CC_PRODUCT_GAME_ID,
  OV2_CC_STAKE_TIERS,
} from "../online-v2/community_cards/ov2CcTableIds";
import {
  normalizeWavePrivateRoomCodeInput,
  WAVE_PRIVATE_ROOM_CODE_LEN,
} from "../online-v2/wavePrivateRoomCode";

export const OV2_WAVE_FIXED_PRODUCT_IDS = Object.freeze([
  OV2_C21_PRODUCT_GAME_ID,
  OV2_CW_PRODUCT_GAME_ID,
  OV2_CC_PRODUCT_GAME_ID,
]);

function ccMetaForStake(stake, maxSeats) {
  const s = Math.floor(Number(stake));
  const sb =
    s >= 1_000_000 ? 10_000 : s >= 100_000 ? 1000 : s >= 10_000 ? 100 : s >= 1000 ? 10 : 1;
  const bb = sb * 2;
  const maxBuyin = s * 10;
  return {
    ov2_cc_max_seats: maxSeats,
    ov2_cc_small_blind: sb,
    ov2_cc_big_blind: bb,
    ov2_cc_max_buyin: maxBuyin,
  };
}

function titleForPrivate(productGameId, stake, maxSeats) {
  if (productGameId === OV2_C21_PRODUCT_GAME_ID) {
    const lab =
      stake >= 1_000_000
        ? "1M"
        : stake >= 100_000
          ? "100K"
          : stake >= 10_000
            ? "10K"
            : stake >= 1000
              ? "1K"
              : stake >= 100
                ? "100"
                : "10";
    return `Private • 21 Challenge • ${lab}`;
  }
  if (productGameId === OV2_CW_PRODUCT_GAME_ID) {
    const lab =
      stake >= 1_000_000
        ? "1M"
        : stake >= 100_000
          ? "100K"
          : stake >= 10_000
            ? "10K"
            : stake >= 1000
              ? "1K"
              : stake >= 100
                ? "100"
                : stake >= 10
                  ? "10"
                  : "1";
    return `Private • Color Wheel • ${lab}`;
  }
  const lab =
    stake >= 1_000_000
      ? "1M"
      : stake >= 100_000
        ? "100K"
        : stake >= 10_000
          ? "10K"
          : stake >= 1000
            ? "1K"
            : "100";
  return `Private • Community Cards • ${lab} • ${maxSeats}-max`;
}

const WAVE_PRIVATE_CODE_MAX = 10 ** WAVE_PRIVATE_ROOM_CODE_LEN;

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @returns {Promise<string|null>}
 */
async function allocateUniqueWavePrivateJoinCode(admin) {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const n = crypto.randomInt(0, WAVE_PRIVATE_CODE_MAX);
    const code = String(n).padStart(WAVE_PRIVATE_ROOM_CODE_LEN, "0");
    const { data, error } = await admin.from("ov2_rooms").select("id").eq("join_code", code).maybeSingle();
    if (error) return null;
    if (!data) return code;
  }
  return null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 */
export async function createOv2WavePrivateFixedRoom(admin, params) {
  const productGameId = String(params.productGameId || "").trim();
  const stake = Math.floor(Number(params.stakeUnits));
  const password = String(params.password || "");
  const maxSeatsCc = params.maxSeatsCc == null ? null : Math.floor(Number(params.maxSeatsCc));

  if (!OV2_WAVE_FIXED_PRODUCT_IDS.includes(productGameId)) {
    return { ok: false, code: "INVALID_PRODUCT", message: "Unsupported game." };
  }
  if (password.length < 4) {
    return { ok: false, code: "PASSWORD_TOO_SHORT", message: "Password must be at least 4 characters." };
  }

  if (productGameId === OV2_C21_PRODUCT_GAME_ID) {
    if (!OV2_C21_STAKE_TIERS.includes(stake)) {
      return { ok: false, code: "INVALID_STAKE", message: "Pick a valid table minimum for this game." };
    }
  } else if (productGameId === OV2_CW_PRODUCT_GAME_ID) {
    if (!OV2_CW_STAKE_TIERS.includes(stake)) {
      return { ok: false, code: "INVALID_STAKE", message: "Pick a valid table minimum for this game." };
    }
  } else if (productGameId === OV2_CC_PRODUCT_GAME_ID) {
    if (!OV2_CC_STAKE_TIERS.includes(stake) || (maxSeatsCc !== 5 && maxSeatsCc !== 9)) {
      return { ok: false, code: "INVALID_TABLE", message: "Pick stake and 5-max or 9-max." };
    }
  }

  const { data: hash, error: hErr } = await admin.rpc("ov2_wave_hash_password", {
    p_plain: password,
  });
  if (hErr || !hash) {
    return { ok: false, code: "HASH_FAILED", message: hErr?.message || "Could not set room password." };
  }

  const meta = { ov2_wave_private: "1" };
  if (productGameId === OV2_C21_PRODUCT_GAME_ID) {
    meta.ov2_c21_stake_units = stake;
  } else if (productGameId === OV2_CW_PRODUCT_GAME_ID) {
    meta.ov2_cw_stake_units = stake;
  } else {
    Object.assign(meta, ccMetaForStake(stake, maxSeatsCc));
  }

  const title = titleForPrivate(productGameId, stake, maxSeatsCc || 9);

  const roomCode = await allocateUniqueWavePrivateJoinCode(admin);
  if (!roomCode) {
    return { ok: false, code: "ROOM_CODE_FAILED", message: "Could not allocate a unique room code." };
  }

  const { data: roomRow, error: insErr } = await admin
    .from("ov2_rooms")
    .insert({
      product_game_id: productGameId,
      title,
      lifecycle_phase: "active",
      stake_per_seat: stake,
      host_participant_key: null,
      is_private: true,
      password_hash: hash,
      join_code: roomCode,
      meta,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !roomRow?.id) {
    return { ok: false, code: "ROOM_CREATE_FAILED", message: insErr?.message || "Could not create room." };
  }

  const roomId = roomRow.id;

  if (productGameId === OV2_C21_PRODUCT_GAME_ID) {
    const { error: lsErr } = await admin.from("ov2_c21_live_state").insert({
      room_id: roomId,
      match_seq: 0,
      revision: 0,
      engine: {},
    });
    if (lsErr) {
      await admin.from("ov2_rooms").delete().eq("id", roomId);
      return { ok: false, code: "LIVE_STATE_FAILED", message: lsErr.message };
    }
  } else if (productGameId === OV2_CW_PRODUCT_GAME_ID) {
    const { error: lsErr } = await admin.from("ov2_color_wheel_live_state").insert({
      room_id: roomId,
      match_seq: 0,
      revision: 0,
      engine: {},
    });
    if (lsErr) {
      await admin.from("ov2_rooms").delete().eq("id", roomId);
      return { ok: false, code: "LIVE_STATE_FAILED", message: lsErr.message };
    }
  } else {
    const { error: lsErr } = await admin.from("ov2_community_cards_live_state").insert({
      room_id: roomId,
      match_seq: 0,
      revision: 0,
      engine: {},
    });
    if (lsErr) {
      await admin.from("ov2_rooms").delete().eq("id", roomId);
      return { ok: false, code: "LIVE_STATE_FAILED", message: lsErr.message };
    }
    const { error: prErr } = await admin.from("ov2_community_cards_private").insert({
      room_id: roomId,
      revision: 0,
      payload: {},
    });
    if (prErr) {
      await admin.from("ov2_rooms").delete().eq("id", roomId);
      return { ok: false, code: "PRIVATE_SLICE_FAILED", message: prErr.message };
    }
  }

  return { ok: true, roomId, roomCode };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 * @param {string} joinCodeNormalized — output of {@link normalizeWavePrivateRoomCodeInput}
 */
export async function findWavePrivateRoomIdByJoinCode(admin, joinCodeNormalized) {
  const code = String(joinCodeNormalized || "").trim();
  if (code.length !== WAVE_PRIVATE_ROOM_CODE_LEN) return { ok: false, code: "INVALID_CODE", message: "Invalid room code." };
  const { data: room, error } = await admin
    .from("ov2_rooms")
    .select("id, is_private, product_game_id, meta")
    .eq("join_code", code)
    .maybeSingle();
  if (error || !room) {
    return { ok: false, code: "ROOM_NOT_FOUND", message: "No room with that code." };
  }
  if (!room.is_private || room.meta?.ov2_wave_private !== "1") {
    return { ok: false, code: "NOT_PRIVATE_WAVE_ROOM", message: "Not a private room for this flow." };
  }
  if (!OV2_WAVE_FIXED_PRODUCT_IDS.includes(String(room.product_game_id))) {
    return { ok: false, code: "WRONG_PRODUCT", message: "Room is not for this game family." };
  }
  return { ok: true, roomId: room.id };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 */
export async function verifyOv2WavePrivateRoomPasscode(admin, roomId, passwordPlain, expectedProductGameId) {
  const expect = String(expectedProductGameId || "").trim();
  const { data: room, error } = await admin
    .from("ov2_rooms")
    .select("id, is_private, password_hash, product_game_id, meta")
    .eq("id", roomId)
    .maybeSingle();
  if (error || !room) {
    return { ok: false, code: "ROOM_NOT_FOUND", message: "Room not found." };
  }
  if (!room.is_private || room.meta?.ov2_wave_private !== "1") {
    return { ok: false, code: "NOT_PRIVATE_WAVE_ROOM", message: "Not a private room for this flow." };
  }
  if (!OV2_WAVE_FIXED_PRODUCT_IDS.includes(String(room.product_game_id))) {
    return { ok: false, code: "WRONG_PRODUCT", message: "Room is not for this game family." };
  }
  if (expect && String(room.product_game_id) !== expect) {
    return { ok: false, code: "WRONG_GAME_PAGE", message: "This private room is for a different game." };
  }
  const { data: ok, error: vErr } = await admin.rpc("ov2_wave_verify_password_against_hash", {
    p_plain: passwordPlain,
    p_hash: room.password_hash,
  });
  if (vErr) {
    return { ok: false, code: "VERIFY_FAILED", message: vErr.message };
  }
  if (!ok) {
    return { ok: false, code: "BAD_PASSWORD", message: "Wrong password." };
  }
  return { ok: true };
}

function occupiedPksFromEngine(engine) {
  const seats = engine?.seats;
  if (!Array.isArray(seats)) return new Set();
  const s = new Set();
  for (const x of seats) {
    const pk = String(x?.participantKey || "").trim();
    if (pk) s.add(pk);
  }
  return s;
}

/**
 * Deletes empty inactive wave private rooms (no seated players, no seat-registry rows).
 * @param {import("@supabase/supabase-js").SupabaseClient} admin
 */
export async function sweepExpiredOv2WavePrivateRooms(admin) {
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: rooms, error } = await admin
    .from("ov2_rooms")
    .select("id, product_game_id, updated_at, meta")
    .eq("is_private", true)
    .in("product_game_id", [...OV2_WAVE_FIXED_PRODUCT_IDS])
    .lt("updated_at", cutoff);
  if (error || !rooms?.length) return { deleted: 0 };

  let deleted = 0;
  for (const r of rooms) {
    if (r.meta?.ov2_wave_private !== "1") continue;
    const rid = r.id;
    const { data: reg } = await admin.from("ov2_wave_fixed_active_seat").select("participant_key").eq("room_id", rid).limit(1);
    if (reg?.length) continue;

    let engine = null;
    const pid = String(r.product_game_id);
    if (pid === OV2_C21_PRODUCT_GAME_ID) {
      const { data } = await admin.from("ov2_c21_live_state").select("engine").eq("room_id", rid).maybeSingle();
      engine = data?.engine;
    } else if (pid === OV2_CW_PRODUCT_GAME_ID) {
      const { data } = await admin.from("ov2_color_wheel_live_state").select("engine").eq("room_id", rid).maybeSingle();
      engine = data?.engine;
    } else {
      const { data } = await admin.from("ov2_community_cards_live_state").select("engine").eq("room_id", rid).maybeSingle();
      engine = data?.engine;
    }
    if (occupiedPksFromEngine(engine).size > 0) continue;

    const { error: delErr } = await admin.from("ov2_rooms").delete().eq("id", rid);
    if (!delErr) deleted += 1;
  }
  return { deleted };
}
