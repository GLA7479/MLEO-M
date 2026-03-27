import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildMysteryBoxSettlementSummary,
  MYSTERY_BOX_MIN_WAGER,
} from "../mysteryBoxConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeMysteryBoxIndex(value) {
  // `Number(null) === 0` — without this guard, "no pick" (null) is misread as box 0 and event.js
  // falsely returns idempotent success without appending.
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < 0 || n > 2) return null;
  return n;
}

async function readLatestMysteryBoxPickEvent(supabase, sessionId) {
  // Load recent rows for this session (all event_type) so diagnostics show mis-tagged rows too.
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_type,event_payload,created_at")
    .eq("session_id", sessionId)
    .order("id", { ascending: false })
    .limit(80);

  if (query.error) {
    console.warn("[mysteryBoxSnapshot diag] solo_v2_session_events query_error", {
      sessionId,
      error: query.error,
    });
    return { ok: false, error: query.error };
  }

  const rows = Array.isArray(query.data) ? query.data : [];
  console.warn("[mysteryBoxSnapshot diag] raw_event_rows", {
    sessionId,
    rowCount: rows.length,
    rows: rows.map(r => ({
      id: r?.id ?? null,
      event_type: r?.event_type ?? null,
      event_payload: r?.event_payload ?? null,
      created_at: r?.created_at ?? null,
    })),
  });

  const row =
    rows.find(
      r =>
        String(r?.event_type || "") === "client_action" &&
        String(r?.event_payload?.action || "") === "mystery_box_pick",
    ) || null;

  const normalizedBoxChoice = normalizeMysteryBoxIndex(row?.event_payload?.boxIndex);

  console.warn("[mysteryBoxSnapshot diag] pick_selection", {
    sessionId,
    selectedPickEventId: row?.id ?? null,
    selectedEventType: row?.event_type ?? null,
    selectedEventPayload: row?.event_payload ?? null,
    normalizedBoxChoice,
    hasPick: normalizedBoxChoice !== null,
  });

  return { ok: true, row };
}

export async function buildMysteryBoxSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "mystery_box") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_mystery_box",
        canResolve: false,
        boxChoice: null,
        pickEventId: null,
        pickSubmittedAt: null,
        resolvedResult: null,
      },
    };
  }

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const stake = Math.floor(Number(sessionRow.entry_amount || 0));
    const entryCost = stake >= MYSTERY_BOX_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
    const fundingSource = sessionRow.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
    const choiceN = normalizeMysteryBoxIndex(summary.choice);
    const outcomeN = normalizeMysteryBoxIndex(summary.outcome);
    return {
      ok: true,
      snapshot: {
        gameKey: "mystery_box",
        readState: "resolved",
        canResolve: false,
        boxChoice: choiceN,
        pickEventId: null,
        pickSubmittedAt: null,
        resolvedResult: {
          choice: choiceN,
          outcome: outcomeN,
          isWin: Boolean(summary.isWin),
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildMysteryBoxSettlementSummary({
              choice: choiceN,
              outcome: outcomeN,
              isWin: Boolean(summary.isWin),
              entryCost,
              fundingSource,
            }),
        },
      },
    };
  }

  if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
    return {
      ok: true,
      snapshot: {
        gameKey: "mystery_box",
        readState: "invalid",
        canResolve: false,
        boxChoice: null,
        pickEventId: null,
        pickSubmittedAt: null,
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
          gameKey: "mystery_box",
          readState: "invalid",
          canResolve: false,
          boxChoice: null,
          pickEventId: null,
          pickSubmittedAt: null,
          resolvedResult: null,
        },
      };
    }
  }

  const pickRead = await readLatestMysteryBoxPickEvent(supabase, sessionRow.id);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const row = pickRead.row;
  const boxChoice = normalizeMysteryBoxIndex(row?.event_payload?.boxIndex);
  const hasPick = boxChoice !== null;

  const snapshot = {
    gameKey: "mystery_box",
    readState: hasPick ? "choice_submitted" : "choice_required",
    canResolve: hasPick,
    boxChoice,
    pickEventId: row?.id || null,
    pickSubmittedAt: row?.created_at || null,
    resolvedResult: null,
  };

  console.warn("[mysteryBoxSnapshot diag] snapshot_out", {
    sessionId: sessionRow.id,
    session_status: sessionRow.session_status,
    snapshot,
  });

  return {
    ok: true,
    snapshot,
  };
}
