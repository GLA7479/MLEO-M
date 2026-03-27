import { SOLO_V2_GAMES, SOLO_V2_NAMESPACE } from "../../../lib/solo-v2/registry";
import { isSoloV2Enabled } from "../../../lib/solo-v2/featureFlags";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, status: "method_not_allowed" });
  }

  return res.status(200).json({
    ok: true,
    status: "healthy",
    namespace: SOLO_V2_NAMESPACE,
    timestamp: new Date().toISOString(),
    featureFlagEnabled: isSoloV2Enabled(),
    gameCount: SOLO_V2_GAMES.length,
  });
}
