import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getQaDb } from "./db.mjs";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../checkpoints");
const FALLBACK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../reports/fallback-events.jsonl");

export class EventLogger {
  constructor({ runId, simDay, dryRun }) {
    this.runId = runId;
    this.simDay = simDay;
    this.dryRun = dryRun;
    this.dbOk = true;
    this.localEvents = [];
    this.sessions = new Map();
    this.cumulative = new Map();
  }

  async logEvent(row) {
    const plannedAt = row.plannedAt || row.simulatedAt || new Date().toISOString();
    const executedAt = row.executedAt || new Date().toISOString();
    const full = {
      run_id: this.runId,
      user_id: row.userId,
      simulated_at: plannedAt,
      recorded_at: executedAt,
      module: row.module,
      action: row.action,
      game_key: row.gameKey ?? null,
      session_id: row.sessionId ?? null,
      vault_before: row.vaultBefore ?? null,
      vault_after: row.vaultAfter ?? null,
      delta: row.delta ?? null,
      outcome: row.outcome ?? null,
      error_message: row.errorMessage ?? null,
      response_ms: row.responseMs ?? null,
      raw_response: {
        ...(row.rawResponse && typeof row.rawResponse === "object" ? row.rawResponse : {}),
        plannedAt,
        executedAt,
        waitedMs: row.waitedMs ?? null,
        outsideWindow: Boolean(row.outsideWindow),
      },
    };
    if (this.dryRun) {
      this.localEvents.push(full);
      return;
    }
    try {
      const db = getQaDb();
      const { error } = await db.from("qa_sim_event").insert(full);
      if (error) throw error;
    } catch (e) {
      this.dbOk = false;
      fs.mkdirSync(path.dirname(FALLBACK), { recursive: true });
      fs.appendFileSync(FALLBACK, JSON.stringify(full) + "\n");
    }
  }

  trackSession(userId, key, patch) {
    const id = `${userId}:${key}`;
    const cur = this.sessions.get(id) || { userId, ...patch };
    this.sessions.set(id, { ...cur, ...patch });
  }

  async flushSessions() {
    if (this.dryRun || !this.runId) return;
    const rows = [...this.sessions.values()].map(s => ({
      run_id: this.runId,
      user_id: s.userId,
      module: s.module,
      game_key: s.gameKey ?? null,
      started_at: s.startedAt,
      ended_at: s.endedAt ?? new Date().toISOString(),
      duration_ms: s.durationMs ?? 0,
      actions_count: s.actionsCount ?? 0,
      vault_start: s.vaultStart ?? null,
      vault_end: s.vaultEnd ?? null,
      net_delta: s.netDelta ?? 0,
      outcome: s.outcome ?? null,
      error_count: s.errorCount ?? 0,
      stuck: Boolean(s.stuck),
    }));
    if (!rows.length) return;
    try {
      await getQaDb().from("qa_sim_session").insert(rows);
    } catch {
      /* fallback only */
    }
  }

  async writeDailySummary(userId, summary) {
    if (this.dryRun || !this.runId) return;
    const row = {
      run_id: this.runId,
      user_id: userId,
      sim_day: this.simDay,
      date: summary.date,
      total_active_ms: summary.totalActiveMs,
      session_count: summary.sessionCount,
      miners_sessions: summary.minersSessions,
      base_sessions: summary.baseSessions,
      solo_v2_sessions: summary.soloV2Sessions,
      ov2_sessions: summary.ov2Sessions,
      total_earned: summary.totalEarned,
      total_spent: summary.totalSpent,
      net_delta: summary.netDelta,
      vault_end: summary.vaultEnd,
      error_count: summary.errorCount,
      stuck_count: summary.stuckCount,
      top_game_key: summary.topGameKey,
    };
    try {
      await getQaDb().from("qa_sim_daily_summary").upsert(row, {
        onConflict: "run_id,user_id,sim_day",
      });
    } catch {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(
        path.join(DIR, `daily-${this.runId}-${userId}-day${this.simDay}.json`),
        JSON.stringify(row, null, 2)
      );
    }
  }

  async writeEconomySnapshot(userId, snap) {
    if (this.dryRun || !this.runId) return;
    try {
      await getQaDb().from("qa_sim_economy_snapshot").insert({
        run_id: this.runId,
        user_id: userId,
        sim_day: this.simDay,
        vault_balance: snap.vaultBalance,
        total_earned_cumulative: snap.totalEarned,
        total_spent_cumulative: snap.totalSpent,
      });
    } catch {
      /* ignore */
    }
  }

  async writeAlert(alert) {
    if (this.dryRun || !this.runId) return;
    try {
      await getQaDb().from("qa_sim_alert").insert({
        run_id: this.runId,
        user_id: alert.userId ?? null,
        sim_day: this.simDay,
        alert_type: alert.type,
        severity: alert.severity || "warning",
        details: alert.details ?? {},
      });
    } catch {
      /* ignore */
    }
  }
}
