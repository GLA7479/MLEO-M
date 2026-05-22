#!/usr/bin/env node
/**
 * QA cleanup — dry-run by default. Real deletion requires --confirm and owner intent.
 * node scripts/qa-monthly-sim/cleanup.mjs --run-id=<uuid> [--dry-run] [--confirm]
 */
import { loadEnvLocal } from "./lib/loadEnv.mjs";
import { getQaDb } from "./lib/db.mjs";
import { qaDeviceId } from "./lib/deviceCookie.mjs";
import { PERSONAS } from "./personas.mjs";

loadEnvLocal();

function parseArgs() {
  const out = { runId: null, dryRun: true, confirm: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--run-id=")) out.runId = a.split("=")[1];
    else if (a === "--confirm") {
      out.confirm = true;
      out.dryRun = false;
    } else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

const QA_TABLES = [
  "qa_sim_alert",
  "qa_sim_economy_snapshot",
  "qa_sim_daily_summary",
  "qa_sim_session",
  "qa_sim_event",
  "qa_sim_run",
];

async function main() {
  const args = parseArgs();
  if (!args.runId) {
    console.error("Usage: cleanup.mjs --run-id=<uuid> [--dry-run] [--confirm]");
    process.exit(1);
  }

  const plan = {
    runId: args.runId,
    dryRun: args.dryRun,
    tables: QA_TABLES.map(t => ({ table: t, action: "delete", filter: { run_id: args.runId } })),
    qaDeviceIds: PERSONAS.map(p => qaDeviceId(p.id)),
    note: "Does not delete non-QA product data. Vault reset for QA devices is manual/optional.",
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ ok: true, mode: "dry-run", plan }, null, 2));
    return;
  }

  if (!args.confirm) {
    console.error("Refusing to delete without --confirm");
    process.exit(1);
  }

  const db = getQaDb();
  for (const table of QA_TABLES) {
    if (table === "qa_sim_run") continue;
    const { error } = await db.from(table).delete().eq("run_id", args.runId);
    if (error) console.warn(`[cleanup] ${table}:`, error.message);
  }
  const { error: runErr } = await db.from("qa_sim_run").delete().eq("id", args.runId);
  if (runErr) console.warn("[cleanup] qa_sim_run:", runErr.message);
  console.log(JSON.stringify({ ok: true, mode: "executed", runId: args.runId }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
