import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const CHECKPOINT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "checkpoints"
);

export function checkpointPath(runId, day) {
  return path.join(CHECKPOINT_DIR, `run-${runId}-day-${day}.json`);
}

export function writeCheckpoint(runId, day, data) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const file = checkpointPath(runId, day);
  fs.writeFileSync(file, JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2));
  return file;
}

export function readLatestCheckpoint(runId) {
  if (!fs.existsSync(CHECKPOINT_DIR)) return null;
  const files = fs
    .readdirSync(CHECKPOINT_DIR)
    .filter(f => f.startsWith(`run-${runId}-day-`))
    .sort();
  if (!files.length) return null;
  const last = files[files.length - 1];
  return JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, last), "utf8"));
}

export function browserStatePath(userId) {
  return path.join(CHECKPOINT_DIR, `browser-state-${userId}.json`);
}
