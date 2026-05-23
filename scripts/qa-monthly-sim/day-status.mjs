#!/usr/bin/env node
/**
 * Read-only Gate 4 campaign status.
 * npm run qa:day-status
 * npm run qa:day-status -- --campaign-id=<uuid>
 */
import { loadEnvLocal } from "./lib/loadEnv.mjs";
import {
  loadCampaign,
  loadActiveCampaign,
  campaignStatusSummary,
} from "./lib/campaignStore.mjs";
import { listCampaignDayCheckpoints } from "./lib/dailyCheckpoint.mjs";

loadEnvLocal();

function parseArgs() {
  let campaignId = null;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--campaign-id=")) campaignId = a.split("=")[1];
  }
  return { campaignId };
}

async function main() {
  const { campaignId } = parseArgs();
  const campaign = campaignId ? loadCampaign(campaignId) : loadActiveCampaign();

  if (!campaign) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          hasActiveCampaign: false,
          message: "No active campaign. Start with: npm run qa:day -- --approve-day --daily-window-hours=6",
        },
        null,
        2
      )
    );
    return;
  }

  const checkpoints = listCampaignDayCheckpoints(campaign.campaignId);
  const summary = campaignStatusSummary(campaign);

  console.log(
    JSON.stringify(
      {
        ok: true,
        hasActiveCampaign: true,
        ...summary,
        checkpointFiles: checkpoints,
        pauseResume:
          "Between days: stop after any day completes. Resume with npm run qa:day -- --approve-day (auto day = lastCompletedDay + 1).",
        nextCommand:
          summary.lastCompletedDay === 0
            ? "npm run qa:day -- --approve-day --daily-window-hours=6"
            : `npm run qa:day -- --approve-day --day=${summary.nextDay}`,
      },
      null,
      2
    )
  );
}

main().catch(e => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  process.exit(1);
});
