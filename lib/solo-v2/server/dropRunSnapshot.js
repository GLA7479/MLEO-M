import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildDropRunSettlementSummary,
  DROP_RUN_GATES,
  DROP_RUN_MIN_WAGER,
  DROP_RUN_RELEASE_COLUMN,
  normalizeDropRunGate,
} from "../dropRunConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { parseDropRunActiveSummary } from "./dropRunEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= DROP_RUN_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function readDropRunGateEventsAfter(supabase, sessionId, minIdExclusive) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .gt("id", minIdExclusive)
    .order("id", { ascending: true })
    .limit(40);

  if (query.error) return { ok: false, error: query.error };
  const rows = Array.isArray(query.data) ? query.data : [];
  const picks = rows.filter(r => {
    const action = String(r?.event_payload?.action || "");
    return (
      (action === "drop_run_select_gate" || action === "drop_run_play") &&
      String(r?.event_payload?.gameKey || "") === "drop_run"
    );
  });
  return { ok: true, rows: picks };
}

function buildPlayingPublic(sessionRow, readState, pendingGate) {
  const entry = entryCostFromSessionRow(sessionRow);
  const gate = pendingGate?.gate != null ? Math.floor(Number(pendingGate.gate)) : null;
  const ready = readState === "ready";
  return {
    entryAmount: entry,
    canDropBall: ready,
    canSelectGate: ready,
    selectedGate: Number.isFinite(gate) && gate >= 1 && gate <= DROP_RUN_GATES ? gate : null,
  };
}

export async function buildDropRunSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "drop_run") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_drop_run",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGate: null,
        gateConflict: false,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind =
      summary.terminalKind === "cashout"
        ? "cashout"
        : summary.terminalKind === "full_clear"
          ? "full_clear"
          : "overload";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildDropRunSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "drop_run",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGate: null,
        gateConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "overload",
          selectedGate: summary.selectedGate != null ? Number(summary.selectedGate) : null,
          driftPath: Array.isArray(summary.driftPath) ? summary.driftPath : [],
          pathPositions: Array.isArray(summary.pathPositions) ? summary.pathPositions : [],
          finalBay: summary.finalBay != null ? Number(summary.finalBay) : null,
          resolvedMultiplier:
            summary.resolvedMultiplier != null ? Number(summary.resolvedMultiplier) : null,
          won: summary.won === true || (terminalKind === "full_clear" && payoutReturn > 0),
          overloadReason: summary.overloadReason != null ? String(summary.overloadReason) : null,
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary,
        },
      },
    };
  }

  if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
    return {
      ok: true,
      snapshot: {
        gameKey: "drop_run",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGate: null,
        gateConflict: false,
        resolvedResult: null,
      },
    };
  }

  const expiresAtRaw = sessionRow.expires_at;
  if (expiresAtRaw) {
    const expiresMs = new Date(expiresAtRaw).getTime();
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return {
        ok: true,
        snapshot: {
          gameKey: "drop_run",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          pendingGate: null,
          gateConflict: false,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseDropRunActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "drop_run",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGate: null,
        gateConflict: false,
        resolvedResult: null,
      },
    };
  }

  const gateRead = await readDropRunGateEventsAfter(supabase, sessionRow.id, active.lastProcessedGateEventId);
  if (!gateRead.ok) {
    return { ok: false, error: gateRead.error };
  }

  const forGate = gateRead.rows;
  const gateConflict = forGate.length > 1;
  let pendingGate = null;

  if (!gateConflict && forGate.length === 1) {
    const row = forGate[0];
    const eid = row?.id != null ? Number(row.id) : null;
    const action = String(row?.event_payload?.action || "");
    const rawGate =
      action === "drop_run_play" ? DROP_RUN_RELEASE_COLUMN : row?.event_payload?.gate;
    const gate = normalizeDropRunGate(rawGate);
    if (Number.isFinite(eid) && eid > 0 && gate !== null) {
      pendingGate = {
        gateEventId: eid,
        gate,
        submittedAt: row?.created_at || null,
      };
    }
  }

  let readState = "ready";
  if (gateConflict) readState = "gate_conflict";
  else if (pendingGate) readState = "gate_submitted";

  const canResolveTurn = !gateConflict && Boolean(pendingGate);
  const playing = buildPlayingPublic(sessionRow, readState, pendingGate);

  return {
    ok: true,
    snapshot: {
      gameKey: "drop_run",
      readState,
      canResolveTurn,
      canCashOut: false,
      playing,
      pendingGate,
      gateConflict,
      resolvedResult: null,
    },
  };
}
