/**
 * Scheduled cleanup for OV2 wave private fixed rooms (empty + inactive).
 *
 * Configure in Vercel:
 * 1. Set env `CRON_SECRET` or `OV2_WAVE_PRIVATE_SWEEP_SECRET` to a long random string.
 * 2. `vercel.json` schedules GET this route (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set in the project).
 *
 * If you use only `OV2_WAVE_PRIVATE_SWEEP_SECRET`, set the same value as Vercel’s CRON_SECRET or send the matching Bearer from an external scheduler.
 *
 * SQL was not run from this repo; the sweep uses the same logic as `sweepExpiredOv2WavePrivateRooms`.
 */

import { getSupabaseAdmin } from "../../../lib/server/supabaseAdmin";
import { sweepExpiredOv2WavePrivateRooms } from "../../../lib/server/ov2WavePrivateFixedRooms";

function bearerMatches(req) {
  const expected =
    process.env.OV2_WAVE_PRIVATE_SWEEP_SECRET || process.env.CRON_SECRET || "";
  if (!expected) return null;
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token === expected;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const configured =
    Boolean(process.env.OV2_WAVE_PRIVATE_SWEEP_SECRET) || Boolean(process.env.CRON_SECRET);
  if (!configured) {
    return res.status(503).json({
      ok: false,
      code: "SWEEP_SECRET_NOT_CONFIGURED",
      message: "Set CRON_SECRET or OV2_WAVE_PRIVATE_SWEEP_SECRET for scheduled sweeps.",
    });
  }

  if (!bearerMatches(req)) {
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }

  try {
    const admin = getSupabaseAdmin();
    const { deleted } = await sweepExpiredOv2WavePrivateRooms(admin);
    return res.status(200).json({ ok: true, deleted });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      code: "SERVER_ERROR",
      message: e?.message || String(e),
    });
  }
}
