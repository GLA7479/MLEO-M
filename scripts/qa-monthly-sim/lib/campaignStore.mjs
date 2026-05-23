import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { getQaDb } from "./db.mjs";

const CHECKPOINT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../checkpoints");
const ACTIVE_FILE = path.join(CHECKPOINT_DIR, "campaign-active.json");

function campaignPath(campaignId) {
  return path.join(CHECKPOINT_DIR, `campaign-${campaignId}.json`);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function parseRunNotes(notes) {
  if (!notes) return null;
  try {
    return typeof notes === "string" ? JSON.parse(notes) : notes;
  } catch {
    return null;
  }
}

export function loadCampaign(campaignId) {
  return readJson(campaignPath(campaignId));
}

export function loadActiveCampaign() {
  const active = readJson(ACTIVE_FILE);
  if (!active?.campaignId) return null;
  return loadCampaign(active.campaignId);
}

export function saveCampaign(campaign) {
  writeJson(campaignPath(campaign.campaignId), campaign);
  writeJson(ACTIVE_FILE, {
    campaignId: campaign.campaignId,
    updatedAt: new Date().toISOString(),
  });
  return campaign;
}

export function getOrCreateCampaign({ campaignId = null, seed = 42, label = "gate4-daily" } = {}) {
  if (campaignId) {
    const existing = loadCampaign(campaignId);
    if (existing) return existing;
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  const active = loadActiveCampaign();
  if (active) return active;

  const campaign = {
    campaignId: randomUUID(),
    seed,
    label,
    createdAt: new Date().toISOString(),
    lastCompletedDay: 0,
    days: {},
  };
  return saveCampaign(campaign);
}

export function lastCompletedDay(campaign) {
  return campaign.lastCompletedDay ?? 0;
}

export function resolveSimDay(campaign, explicitDay) {
  if (explicitDay != null && explicitDay > 0) return explicitDay;
  return lastCompletedDay(campaign) + 1;
}

export function getDayRecord(campaign, simDay) {
  return campaign.days?.[String(simDay)] ?? null;
}

export async function findRunningDayRun(campaignId, simDay) {
  const db = getQaDb();
  const { data } = await db
    .from("qa_sim_run")
    .select("id, status, notes, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(50);

  for (const row of data || []) {
    const notes = parseRunNotes(row.notes);
    if (notes?.campaignId === campaignId && notes?.dayNumber === simDay) return row;
  }
  return null;
}

export async function assertDayCanStart(campaign, simDay, { resetDay = false } = {}) {
  const last = lastCompletedDay(campaign);
  const dayRec = getDayRecord(campaign, simDay);

  if (resetDay) {
    if (dayRec?.status === "running") {
      throw new Error(`Day ${simDay} is still running in campaign ${campaign.campaignId}. Stop the process first.`);
    }
    return;
  }

  const running = await findRunningDayRun(campaign.campaignId, simDay);
  if (running) {
    throw new Error(
      `Day ${simDay} has a running qa_sim_run (${running.id}). Wait for completion or use --reset-day=${simDay} after inspection.`
    );
  }

  if (simDay > last + 1) {
    throw new Error(
      `Cannot start day ${simDay}: last completed day is ${last}. Run day ${last + 1} next or use --day=${last + 1}.`
    );
  }

  if (simDay <= last && dayRec?.status === "completed") {
    throw new Error(
      `Day ${simDay} already completed for campaign ${campaign.campaignId}. Use --day=${last + 1} or --reset-day=${simDay} to re-run.`
    );
  }
}

export function markDayStarted(campaign, simDay, runId) {
  campaign.days[String(simDay)] = {
    runId,
    simDay,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  return saveCampaign(campaign);
}

export function markDayCompleted(campaign, simDay, { runId, status, reportPaths = {} }) {
  const prev = getDayRecord(campaign, simDay) || {};
  campaign.days[String(simDay)] = {
    ...prev,
    runId: runId ?? prev.runId,
    simDay,
    status,
    endedAt: new Date().toISOString(),
    reportJson: reportPaths.json ?? prev.reportJson ?? null,
    reportHtml: reportPaths.html ?? prev.reportHtml ?? null,
  };
  if (status === "completed" || status === "partial") {
    campaign.lastCompletedDay = Math.max(campaign.lastCompletedDay ?? 0, simDay);
  }
  return saveCampaign(campaign);
}

export function campaignStatusSummary(campaign) {
  const dayKeys = Object.keys(campaign.days || {})
    .map(Number)
    .sort((a, b) => a - b);
  return {
    campaignId: campaign.campaignId,
    seed: campaign.seed,
    label: campaign.label,
    createdAt: campaign.createdAt,
    lastCompletedDay: campaign.lastCompletedDay ?? 0,
    nextDay: (campaign.lastCompletedDay ?? 0) + 1,
    totalDaysRecorded: dayKeys.length,
    days: dayKeys.map(d => ({
      simDay: d,
      ...campaign.days[String(d)],
    })),
  };
}
