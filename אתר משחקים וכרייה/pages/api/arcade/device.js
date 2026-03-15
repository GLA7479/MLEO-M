import { ensureArcadeDevice } from "../../../lib/server/arcadeDeviceCookie";

export default function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const deviceId = ensureArcadeDevice(req, res);
  return res.status(200).json({ success: true, hasDevice: Boolean(deviceId) });
}
