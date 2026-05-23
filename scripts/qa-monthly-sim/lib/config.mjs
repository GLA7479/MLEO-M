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
    forceActive: false,
    orchestrationPreflight: false,
    livePreflight: false,
    pilotForceActive: false,
    pilotWindowMinutes: 30,
    liveWindowMinutes: 45,
    approveLivePreflight: false,
    daily: false,
    approveDay: false,
    campaignId: null,
    dailyWindowHours: 6,
    approvePilot24h: false,
    resetDay: null,
    perUserBudget: 5,
    perUserBudgetExplicit: false,
    dayExplicit: false,
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
      args.dayExplicit = true;
      i++;
    } else if (a.startsWith("--day=")) {
      args.day = Number(a.split("=")[1]) || 1;
      args.dayExplicit = true;
    }
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
    }     else if (a.startsWith("--run-date=")) args.runAnchorDate = a.split("=")[1];
    else if (a === "--force-active" || a === "--validation-force-active") args.forceActive = true;
    else if (a === "--orchestration-preflight") args.orchestrationPreflight = true;
    else if (a === "--live-preflight") args.livePreflight = true;
    else if (a === "--approve-live-preflight") args.approveLivePreflight = true;
    else if (a === "--pilot-force-active") args.pilotForceActive = true;
    else if (a === "--pilot-window-minutes" && next) {
      args.pilotWindowMinutes = Number(next) || 30;
      i++;
    } else if (a.startsWith("--pilot-window-minutes=")) {
      args.pilotWindowMinutes = Number(a.split("=")[1]) || 30;
    } else if (a === "--per-user-budget" && next) {
      args.perUserBudget = Number(next) || 5;
      args.perUserBudgetExplicit = true;
      i++;
    } else if (a.startsWith("--per-user-budget=")) {
      args.perUserBudget = Number(a.split("=")[1]) || 5;
      args.perUserBudgetExplicit = true;
    } else if (a === "--live-window-minutes" && next) {
      args.liveWindowMinutes = Number(next) || 45;
      i++;
    } else if (a.startsWith("--live-window-minutes=")) {
      args.liveWindowMinutes = Number(a.split("=")[1]) || 45;
    } else if (a === "--daily") args.daily = true;
    else if (a === "--approve-day") args.approveDay = true;
    else if (a === "--approve-pilot-24h") args.approvePilot24h = true;
    else if (a === "--campaign-id" && next) {
      args.campaignId = next;
      i++;
    } else if (a.startsWith("--campaign-id=")) args.campaignId = a.split("=")[1];
    else if (a === "--daily-window-hours" && next) {
      args.dailyWindowHours = Number(next) || 6;
      i++;
    } else if (a.startsWith("--daily-window-hours=")) {
      args.dailyWindowHours = Number(a.split("=")[1]) || 6;
    } else if (a === "--reset-day" && next) {
      args.resetDay = Number(next) || null;
      i++;
    } else if (a.startsWith("--reset-day=")) {
      args.resetDay = Number(a.split("=")[1]) || null;
    }
  }
  args.pilotWindowMinutes = Math.min(60, Math.max(5, args.pilotWindowMinutes));
  args.liveWindowMinutes = Math.min(60, Math.max(30, args.liveWindowMinutes));
  args.dailyWindowHours = Math.min(24, Math.max(1, args.dailyWindowHours));
  if (args.daily) {
    args.perUserBudget = Math.min(20, Math.max(5, args.perUserBudget));
  } else {
    args.perUserBudget = Math.min(5, Math.max(1, args.perUserBudget));
  }
  if (args.baseUrlOverride) args.baseUrl = args.baseUrlOverride;
  else args.baseUrl = getBaseUrl(args.mode);
  return args;
}

export const MODULES = ["miners", "base", "solo_v2", "ov2"];
