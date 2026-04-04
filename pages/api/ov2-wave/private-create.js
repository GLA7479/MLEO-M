import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { assertWaveFixedNoForeignActiveSeat } from "../../../lib/server/ov2WaveFixedSeatRegistry";
import {
  createOv2WavePrivateFixedRoom,
  sweepExpiredOv2WavePrivateRooms,
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

  const productGameId = String(body?.productGameId || "").trim();
  const stakeUnits = body?.stakeUnits;
  const maxSeatsCc = body?.maxSeatsCc;
  const password = String(body?.password || "");
  const participantKey = String(body?.participantKey || "").trim();

  try {
    const admin = getSupabaseAdmin();
    await sweepExpiredOv2WavePrivateRooms(admin);

    const seatGate = await assertWaveFixedNoForeignActiveSeat(admin, participantKey, null);
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

    const out = await createOv2WavePrivateFixedRoom(admin, {
      productGameId,
      stakeUnits,
      password,
      maxSeatsCc: maxSeatsCc == null ? null : maxSeatsCc,
    });
    if (!out.ok) {
      const st = out.code === "ROOM_CREATE_FAILED" || out.code === "LIVE_STATE_FAILED" ? 500 : 400;
      return res.status(st).json({ ok: false, code: out.code, message: out.message });
    }
    return res.status(200).json({ ok: true, roomId: out.roomId });
  } catch (e) {
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: e?.message || String(e) });
  }
}
