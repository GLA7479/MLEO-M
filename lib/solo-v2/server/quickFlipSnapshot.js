import { SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import { buildQuickFlipSettlementSummary, QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "../quickFlipConfig";

export function normalizeQuickFlipChoice(value) {
  const side = String(value || "").toLowerCase();
  if (side === "heads" || side === "tails") return side;
  return null;
}

async function readLatestQuickFlipChoiceEvent(supabase, sessionId) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .contains("event_payload", { action: "choice_submit" })
    .order("id", { ascending: false })
    .limit(1);

  if (query.error) return { ok: false, error: query.error };
  const row = Array.isArray(query.data) ? query.data[0] : query.data;
  return { ok: true, row: row || null };
}

export async function buildQuickFlipSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "quick_flip") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_quick_flip",
        canResolve: false,
        choice: null,
        choiceEventId: null,
        choiceSubmittedAt: null,
        resolvedResult: null,
      },
    };
  }

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const stake = Math.floor(Number(sessionRow.entry_amount || 0));
    const entryCost = stake >= QUICK_FLIP_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
    return {
      ok: true,
      snapshot: {
        gameKey: "quick_flip",
        readState: "resolved",
        canResolve: false,
        choice: normalizeQuickFlipChoice(summary.choice),
        choiceEventId: null,
        choiceSubmittedAt: null,
        resolvedResult: {
          choice: normalizeQuickFlipChoice(summary.choice),
          outcome: normalizeQuickFlipChoice(summary.outcome),
          isWin: Boolean(summary.isWin),
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildQuickFlipSettlementSummary({
              choice: normalizeQuickFlipChoice(summary.choice),
              outcome: normalizeQuickFlipChoice(summary.outcome),
              isWin: Boolean(summary.isWin),
              entryCost,
            }),
        },
      },
    };
  }

  if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
    return {
      ok: true,
      snapshot: {
        gameKey: "quick_flip",
        readState: "invalid",
        canResolve: false,
        choice: null,
        choiceEventId: null,
        choiceSubmittedAt: null,
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
          gameKey: "quick_flip",
          readState: "invalid",
          canResolve: false,
          choice: null,
          choiceEventId: null,
          choiceSubmittedAt: null,
          resolvedResult: null,
        },
      };
    }
  }

  const choiceRead = await readLatestQuickFlipChoiceEvent(supabase, sessionRow.id);
  if (!choiceRead.ok) {
    return { ok: false, error: choiceRead.error };
  }

  const row = choiceRead.row;
  const choice = normalizeQuickFlipChoice(row?.event_payload?.side);
  const hasChoice = Boolean(choice);

  return {
    ok: true,
    snapshot: {
      gameKey: "quick_flip",
      readState: hasChoice ? "choice_submitted" : "choice_required",
      canResolve: hasChoice,
      choice,
      choiceEventId: row?.id || null,
      choiceSubmittedAt: row?.created_at || null,
      resolvedResult: null,
    },
  };
}
