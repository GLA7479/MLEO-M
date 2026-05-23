import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const CHECKPOINT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../checkpoints");

export function campaignDayCheckpointPath(campaignId, simDay) {
  return path.join(CHECKPOINT_DIR, `campaign-${campaignId}-day-${simDay}.json`);
}

export function writeCampaignDayCheckpoint(campaignId, simDay, data) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const file = campaignDayCheckpointPath(campaignId, simDay);
  fs.writeFileSync(
    file,
    JSON.stringify({ campaignId, simDay, savedAt: new Date().toISOString(), ...data }, null, 2)
  );
  return file;
}

export function readCampaignDayCheckpoint(campaignId, simDay) {
  const file = campaignDayCheckpointPath(campaignId, simDay);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function listCampaignDayCheckpoints(campaignId) {
  if (!fs.existsSync(CHECKPOINT_DIR)) return [];
  return fs
    .readdirSync(CHECKPOINT_DIR)
    .filter(f => f.startsWith(`campaign-${campaignId}-day-`) && f.endsWith(".json"))
    .sort();
}
