import { isSoloV2Enabled } from "../../../../lib/solo-v2/featureFlags";
import { getAllSoloV2Games } from "../../../../lib/solo-v2/server/gameCatalog";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, status: "method_not_allowed" });
  }

  return res.status(200).json({
    ok: true,
    status: "ready",
    namespace: "solo-v2",
    featureFlagEnabled: isSoloV2Enabled(),
    games: getAllSoloV2Games(),
  });
}
