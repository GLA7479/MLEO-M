import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { assertWaveFixedNoForeignActiveSeat } from "../../../lib/server/ov2WaveFixedSeatRegistry";
import { isOv2RoomIdQueryParam } from "../../../lib/online-v2/onlineV2GameRegistry";
import { normalizeWavePrivateRoomCodeInput } from "../../../lib/online-v2/wavePrivateRoomCode";
import {
  findWavePrivateRoomIdByJoinCode,
  sweepExpiredOv2WavePrivateRooms,
  verifyOv2WavePrivateRoomPasscode,
} from "../../../lib/server/ov2WavePrivateFixedRooms";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, code: "INVALID_JSON" });
    }
  }

  const roomIdRaw = String(body?.roomId || "").trim();
  const roomCodeRaw = body?.roomCode != null ? String(body.roomCode) : "";
  const password = String(body?.password || "");
  const productGameId = String(body?.productGameId || "").trim();
  const participantKey = String(body?.participantKey || "").trim();

  const normalizedCode = normalizeWavePrivateRoomCodeInput(roomCodeRaw);
  /** @type {string|null} */
  let roomId = null;
  if (isOv2RoomIdQueryParam(roomIdRaw)) {
    roomId = String(roomIdRaw).trim();
  } else if (normalizedCode) {
    roomId = null;
  } else {
    return res.status(400).json({ ok: false, code: "ROOM_OR_CODE_REQUIRED", message: "Enter the 5-digit room code." });
  }
  if (password.length < 1) {
    return res.status(400).json({ ok: false, code: "PASSWORD_REQUIRED" });
  }
  if (!productGameId) {
    return res.status(400).json({ ok: false, code: "PRODUCT_REQUIRED" });
  }

  try {
    const admin = getSupabaseAdmin();
    await sweepExpiredOv2WavePrivateRooms(admin);

    if (!roomId && normalizedCode) {
      const found = await findWavePrivateRoomIdByJoinCode(admin, normalizedCode);
      if (!found.ok) {
        const st = found.code === "ROOM_NOT_FOUND" ? 404 : 400;
        return res.status(st).json({ ok: false, code: found.code, message: found.message });
      }
      roomId = found.roomId;
    }

    if (!roomId) {
      return res.status(400).json({ ok: false, code: "ROOM_OR_CODE_REQUIRED", message: "Enter the 5-digit room code." });
    }

    const seatGate = await assertWaveFixedNoForeignActiveSeat(admin, participantKey, roomId);
    if (!seatGate.ok) {
      const st =
        seatGate.code === "ALREADY_SEATED_ELSEWHERE"
          ? 409
          : seatGate.code === "SEAT_REGISTRY_READ_FAILED"
            ? 500
            : 400;
      return res.status(st).json({
        ok: false,
        code: seatGate.code,
        message: seatGate.message,
      });
    }

    const out = await verifyOv2WavePrivateRoomPasscode(admin, roomId, password, productGameId);
    if (!out.ok) {
      const st =
        out.code === "ROOM_NOT_FOUND"
          ? 404
          : out.code === "BAD_PASSWORD"
            ? 401
            : out.code === "NOT_PRIVATE_WAVE_ROOM" ||
                out.code === "WRONG_PRODUCT" ||
                out.code === "WRONG_GAME_PAGE"
              ? 400
              : 400;
      return res.status(st).json({ ok: false, code: out.code, message: out.message });
    }
    return res.status(200).json({ ok: true, roomId });
  } catch (e) {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: e?.message || String(e) });
  }
}
