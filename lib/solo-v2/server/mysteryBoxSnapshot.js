import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildMysteryBoxSettlementSummary,
  MYSTERY_BOX_MIN_WAGER,
} from "../mysteryBoxConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeMysteryBoxIndex(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < 0 || n > 2) return null;
  return n;
}

async function readLatestMysteryBoxPickEvent(supabase, sessionId) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .contains("event_payload", { action: "mystery_box_pick" })
    .order("id", { ascending: false })
    .limit(1);

  if (query.error) return { ok: false, error: query.error };
  const row = Array.isArray(query.data) ? query.data[0] : query.data;
  return { ok: true, row: row || null };
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

  return {
    ok: true,
    snapshot: {
      gameKey: "mystery_box",
      readState: hasPick ? "choice_submitted" : "choice_required",
      canResolve: hasPick,
      boxChoice,
      pickEventId: row?.id || null,
      pickSubmittedAt: row?.created_at || null,
      resolvedResult: null,
    },
  };
}
