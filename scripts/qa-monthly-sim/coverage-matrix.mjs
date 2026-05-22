#!/usr/bin/env node
/** Print static coverage matrix (no server calls). */
import { SOLO_V2_GAME_KEYS } from "./lib/soloGames.mjs";
import { OV2_LOBBY_ACTIVE_GAMES } from "./lib/ov2Games.mjs";
import { BASE_ACTION_CATALOG } from "./lib/baseActions.mjs";
import { buildMonthlySoloCoveragePlan } from "./lib/monthlyCoveragePlan.mjs";

const MINERS = ["state", "accrue", "claim_vault", "gift_claim"];

const plan = buildMonthlySoloCoveragePlan();
const soloDays = {};
for (const [day, games] of Object.entries(plan)) {
  for (const g of games) {
    if (!soloDays[g]) soloDays[g] = [];
    soloDays[g].push(Number(day));
  }
}

console.log(
  JSON.stringify(
    {
      soloV2: {
        totalLiveGames: SOLO_V2_GAME_KEYS.length,
        games: SOLO_V2_GAME_KEYS.map(k => ({
          gameKey: k,
          scheduledDays: soloDays[k] || [],
          automation: ["quick_flip", "odd_even"].includes(k)
            ? "full_event_resolve"
            : "attempt_create_resolve_or_coverage_gap",
        })),
      },
      ov2: {
        totalActive: OV2_LOBBY_ACTIVE_GAMES.length,
        games: OV2_LOBBY_ACTIVE_GAMES.map(g => ({
          id: g.id,
          title: g.title,
          automatable: g.automatable,
        })),
      },
      base: Object.entries(BASE_ACTION_CATALOG).map(([action, c]) => ({
        action,
        automation: c.automation,
        path: c.path,
        note: c.note,
      })),
      miners: MINERS.map(a => ({ action: a, automation: "implemented" })),
    },
    null,
    2
  )
);
