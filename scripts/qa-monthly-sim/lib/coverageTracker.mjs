import { allSoloGameKeys, allOv2GameIds, buildMonthlySoloCoveragePlan } from "./monthlyCoveragePlan.mjs";
import { BASE_ACTION_CATALOG } from "./baseActions.mjs";

const MINERS_ACTIONS = ["state", "accrue", "claim_vault", "gift_claim"];

export class CoverageTracker {
  constructor() {
    this.solo = new Map();
    this.ov2 = new Map();
    this.base = new Map();
    this.miners = new Map();
    this.timing = [];
    this.outsideWindowCount = 0;
    allSoloGameKeys().forEach(k => this.solo.set(k, { status: "missed", attempts: 0 }));
    allOv2GameIds().forEach(id => this.ov2.set(id, { status: "missed", attempts: 0 }));
    Object.keys(BASE_ACTION_CATALOG).forEach(a => {
      const cat = BASE_ACTION_CATALOG[a];
      this.base.set(a, {
        status: cat.automation === "coverage_gap" ? "coverage_gap" : "missed",
        attempts: 0,
        note: cat.note,
      });
    });
    MINERS_ACTIONS.forEach(a => this.miners.set(a, { status: "missed", attempts: 0 }));
  }

  recordSolo(gameKey, status, reason) {
    if (!this.solo.has(gameKey)) this.solo.set(gameKey, { status: "missed", attempts: 0 });
    const cur = this.solo.get(gameKey);
    cur.attempts += 1;
    if (status === "covered") cur.status = "covered";
    else if (status === "coverage_gap" && cur.status !== "covered") cur.status = "coverage_gap";
    else if (status === "error" && cur.status === "missed") cur.status = "error";
    cur.reason = reason;
  }

  recordOv2(gameId, status, reason) {
    if (!this.ov2.has(gameId)) this.ov2.set(gameId, { status: "missed", attempts: 0 });
    const cur = this.ov2.get(gameId);
    cur.attempts += 1;
    if (status === "covered") cur.status = "covered";
    else if (status === "coverage_gap" && cur.status !== "covered") cur.status = "coverage_gap";
    cur.reason = reason;
  }

  recordBase(action, outcome, note) {
    if (!this.base.has(action)) return;
    const cur = this.base.get(action);
    cur.attempts += 1;
    if (BASE_ACTION_CATALOG[action]?.automation === "coverage_gap") {
      cur.status = "coverage_gap";
      return;
    }
    if (outcome === "coverage_gap") cur.status = "coverage_gap";
    else if (outcome === "ok" || outcome === "covered") {
      if (cur.status !== "coverage_gap") cur.status = "covered";
    } else if (outcome === "error" && cur.status !== "covered") cur.status = "error";
    if (note) cur.reason = note;
  }

  recordMiners(action, outcome) {
    if (!this.miners.has(action)) return;
    const cur = this.miners.get(action);
    cur.attempts += 1;
    if (outcome === "ok") cur.status = "covered";
    else if (cur.status === "missed") cur.status = "error";
  }

  recordTiming(row) {
    this.timing.push(row);
    if (row.outsideWindow) this.outsideWindowCount += 1;
  }

  toReport() {
    const soloRows = [...this.solo.entries()].map(([k, v]) => ({ id: k, ...v }));
    const ov2Rows = [...this.ov2.entries()].map(([k, v]) => ({ id: k, ...v }));
    const baseRows = [...this.base.entries()].map(([k, v]) => ({ action: k, ...v }));
    const minersRows = [...this.miners.entries()].map(([k, v]) => ({ action: k, ...v }));
    const monthlySoloPlan = buildMonthlySoloCoveragePlan();

    return {
      soloV2: {
        total: soloRows.length,
        covered: soloRows.filter(r => r.status === "covered").length,
        missed: soloRows.filter(r => r.status === "missed").length,
        coverage_gap: soloRows.filter(r => r.status === "coverage_gap").length,
        error: soloRows.filter(r => r.status === "error").length,
        games: soloRows,
        monthlyPlanDays: Object.keys(monthlySoloPlan).length,
      },
      ov2: {
        total: ov2Rows.length,
        covered: ov2Rows.filter(r => r.status === "covered").length,
        missed: ov2Rows.filter(r => r.status === "missed").length,
        coverage_gap: ov2Rows.filter(r => r.status === "coverage_gap").length,
        games: ov2Rows,
      },
      base: {
        total: baseRows.length,
        covered: baseRows.filter(r => r.status === "covered").length,
        coverage_gap: baseRows.filter(r => r.status === "coverage_gap").length,
        missed: baseRows.filter(r => r.status === "missed").length,
        actions: baseRows,
      },
      miners: {
        total: minersRows.length,
        covered: minersRows.filter(r => r.status === "covered").length,
        missed: minersRows.filter(r => r.status === "missed").length,
        actions: minersRows,
      },
      timing: {
        actionCount: this.timing.length,
        outsideWindowCount: this.outsideWindowCount,
        samples: this.timing.slice(0, 100),
      },
    };
  }
}
