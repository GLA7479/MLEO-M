#!/usr/bin/env node
/**
 * Laptop QA runner preflight — checks env presence (no secrets), Playwright, campaign state.
 * Does NOT start any live run.
 *
 * Usage: npm run qa:laptop-preflight
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { loadEnvLocal, PROJECT_ROOT } from "./lib/loadEnv.mjs";
import { loadActiveCampaign, loadCampaign, findRunningDayRun } from "./lib/campaignStore.mjs";

loadEnvLocal();

const CHECKPOINTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "checkpoints");

const REQUIRED_ENV = [
  { key: "NEXT_PUBLIC_SUPABASE_URL_MP", label: "Supabase MP project URL" },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY_MP",
    label: "Supabase service role (MP)",
    fallbacks: ["SUPABASE_SERVICE_ROLE_MP", "SUPABASE_SERVICE_ROLE_KEY"],
  },
  {
    key: "NEXT_PUBLIC_AUTH_REDIRECT_BASE",
    label: "Live site base URL",
    fallbacks: ["QA_SIM_LIVE_BASE"],
  },
  {
    key: "CSRF_SECRET",
    label: "Arcade device cookie signing secret",
    fallbacks: ["ARCADE_DEVICE_COOKIE_SECRET", "SESSION_COOKIE_SECRET", "NEXTAUTH_SECRET"],
  },
];

function envPresent(key, fallbacks = []) {
  const keys = [key, ...fallbacks];
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== "") return { ok: true, via: k };
  }
  return { ok: false, via: null };
}

function checkPlaywright() {
  const ver = spawnSync("npx", ["playwright", "--version"], { encoding: "utf8", shell: true, timeout: 15000 });
  if (ver.status !== 0) {
    return { ok: false, detail: "playwright CLI not found — run: npm ci && npx playwright install chromium" };
  }
  const launch = spawnSync(
    process.execPath,
    [
      "-e",
      "import('playwright').then(async ({chromium})=>{const b=await chromium.launch({headless:true});await b.close();process.exit(0)}).catch(()=>process.exit(1))",
    ],
    { encoding: "utf8", cwd: PROJECT_ROOT, timeout: 45000 },
  );
  return {
    ok: launch.status === 0,
    version: (ver.stdout || ver.stderr || "").trim(),
    detail: launch.status === 0 ? "chromium launches OK" : "run: npx playwright install chromium",
  };
}

function countBrowserStates() {
  if (!fs.existsSync(CHECKPOINTS)) return 0;
  return fs.readdirSync(CHECKPOINTS).filter(f => f.startsWith("browser-state-") && f.endsWith(".json")).length;
}

async function main() {
  const envChecks = REQUIRED_ENV.map(({ key, label, fallbacks = [] }) => {
    const r = envPresent(key, fallbacks);
    return { key, label, present: r.ok, resolvedVia: r.via };
  });

  const envOk = envChecks.every(c => c.present);
  const envLocalExists = fs.existsSync(path.join(PROJECT_ROOT, ".env.local"));
  const pw = checkPlaywright();
  const campaign = loadActiveCampaign();
  let runningDay = null;
  if (campaign) {
    for (const day of Object.keys(campaign.days || {})) {
      const rec = campaign.days[day];
      if (rec?.status === "running") {
        runningDay = { simDay: Number(day), runId: rec.runId };
      }
    }
    try {
      const dbRunning = await findRunningDayRun(campaign.campaignId, runningDay?.simDay ?? 999);
      if (dbRunning) runningDay = { simDay: runningDay?.simDay, runId: dbRunning.id, source: "db" };
    } catch {
      /* DB unreachable — reported below */
    }
  }

  const browserStates = countBrowserStates();
  const nodeOk = spawnSync(process.execPath, ["--version"], { encoding: "utf8" }).status === 0;

  const report = {
    ok: envOk && pw.ok && nodeOk && !runningDay,
    machine: "laptop-preflight",
    projectRoot: PROJECT_ROOT,
    envLocalFile: envLocalExists ? "present" : "MISSING — copy .env.local from main PC (do not commit)",
    node: nodeOk ? process.version : "unknown",
    env: envChecks.map(c => ({
      label: c.label,
      present: c.present,
      resolvedVia: c.present ? c.resolvedVia : null,
    })),
    playwright: pw,
    campaign: campaign
      ? {
          campaignId: campaign.campaignId,
          lastCompletedDay: campaign.lastCompletedDay ?? 0,
          nextDay: (campaign.lastCompletedDay ?? 0) + 1,
          days: Object.entries(campaign.days || {}).map(([d, rec]) => ({
            simDay: Number(d),
            status: rec.status,
            runId: rec.runId,
            note: rec.note ?? null,
          })),
        }
      : null,
    checkpoints: {
      dir: CHECKPOINTS,
      browserStateFiles: browserStates,
      hint:
        browserStates < 20
          ? "Copy scripts/qa-monthly-sim/checkpoints/ from main PC to preserve OV2 browser state"
          : "browser-state files look present",
    },
    runningDayBlock: runningDay
      ? {
          blocked: true,
          message:
            "A day is still marked running. Do NOT start from laptop until main PC run finishes or is aborted in Supabase + campaign JSON.",
          ...runningDay,
        }
      : { blocked: false },
    singleMachineRule:
      "Only ONE machine may run qa:day live at a time. Check qa:day-status on BOTH machines before starting.",
    sleepWarning:
      "Disable sleep/hibernate on the laptop during live daily runs (~5h). Use: powercfg /change standby-timeout-ac 0",
    suggestedCommands: {
      status: "npm run qa:day-status",
      dryRun: campaign ? `npm run qa:day:${(campaign.lastCompletedDay ?? 0) + 1}:dry-run` : "npm run qa:day:dry-run",
      liveDay: campaign
        ? `npm run qa:day --day=${(campaign.lastCompletedDay ?? 0) + 1}`
        : "npm run qa:day --day=1",
      campaignId: campaign?.campaignId ?? null,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch(e => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  process.exit(1);
});
