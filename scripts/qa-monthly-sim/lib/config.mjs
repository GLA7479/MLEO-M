import { loadEnvLocal } from "./loadEnv.mjs";

loadEnvLocal();

export function getBaseUrl(mode) {
  if (mode === "local") {
    return process.env.QA_SIM_LOCAL_BASE || "http://localhost:3000";
  }
  return (
    process.env.QA_SIM_LIVE_BASE ||
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_BASE ||
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
    "http://localhost:3000"
  );
}

export function parseArgs(argv) {
  const args = {
    dryRun: false,
    mock: false,
    compressed: false,
    mode: "local",
    day: 1,
    month: 1,
    allUsers: false,
    users: [],
    resume: false,
    runId: null,
    seed: 42,
    runAnchorDate: null,
    approvePilot: false,
    approveFullRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--mock") args.mock = true;
    else if (a === "--compressed") args.compressed = true;
    else if (a === "--resume") args.resume = true;
    else if (a === "--all-users") args.allUsers = true;
    else if (a === "--approve-pilot") args.approvePilot = true;
    else if (a === "--approve-full-run") args.approveFullRun = true;
    else if (a === "--mode" && next) {
      args.mode = next;
      i++;
    } else if (a.startsWith("--mode=")) args.mode = a.split("=")[1];
    else if (a === "--day" && next) {
      args.day = Number(next) || 1;
      i++;
    } else if (a.startsWith("--day=")) args.day = Number(a.split("=")[1]) || 1;
    else if (a === "--month" && next) {
      args.month = Number(next) || 1;
      i++;
    } else if (a.startsWith("--month=")) args.month = Number(a.split("=")[1]) || 1;
    else if (a === "--users" && next) {
      args.users = next.split(",").map(s => s.trim()).filter(Boolean);
      i++;
    } else if (a.startsWith("--users=")) args.users = a.split("=")[1].split(",").map(s => s.trim()).filter(Boolean);
    else if (a === "--run-id" && next) {
      args.runId = next;
      i++;
    } else if (a.startsWith("--run-id=")) args.runId = a.split("=")[1];
    else if (a.startsWith("--seed=")) args.seed = Number(a.split("=")[1]) || 42;
    else if (a === "--base-url" && next) {
      args.baseUrlOverride = next;
      i++;
    }     else if (a.startsWith("--base-url=")) args.baseUrlOverride = a.split("=")[1];
    else if (a === "--run-date" && next) {
      args.runAnchorDate = next;
      i++;
    } else if (a.startsWith("--run-date=")) args.runAnchorDate = a.split("=")[1];
  }
  if (args.baseUrlOverride) args.baseUrl = args.baseUrlOverride;
  else args.baseUrl = getBaseUrl(args.mode);
  return args;
}

export const MODULES = ["miners", "base", "solo_v2", "ov2"];
