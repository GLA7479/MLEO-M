import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildOddEvenSettlementSummary,
  ODD_EVEN_CONFIG,
  ODD_EVEN_MIN_WAGER,
} from "../oddEvenConfig";

export function normalizeOddEvenChoice(value) {
  const side = String(value || "").toLowerCase();
  if (side === "odd" || side === "even") return side;
  return null;
}

async function readLatestOddEvenChoiceEvent(supabase, sessionId) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .contains("event_payload", { action: "odd_even_submit" })
    .order("id", { ascending: false })
    .limit(1);

  if (query.error) return { ok: false, error: query.error };
  const row = Array.isArray(query.data) ? query.data[0] : query.data;
  return { ok: true, row: row || null };
}

export async function buildOddEvenSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "odd_even") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_odd_even",
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
    const entryCost = stake >= ODD_EVEN_MIN_WAGER ? stake : ODD_EVEN_CONFIG.entryCost;
    const fundingSource = sessionRow.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
    const rolledValue =
      summary.rolledValue != null && Number.isFinite(Math.floor(Number(summary.rolledValue)))
        ? Math.floor(Number(summary.rolledValue))
        : null;
    return {
      ok: true,
      snapshot: {
        gameKey: "odd_even",
        readState: "resolved",
        canResolve: false,
        choice: normalizeOddEvenChoice(summary.choice),
        choiceEventId: null,
        choiceSubmittedAt: null,
        resolvedResult: {
          choice: normalizeOddEvenChoice(summary.choice),
          outcome: normalizeOddEvenChoice(summary.outcome),
          rolledValue,
          isWin: Boolean(summary.isWin),
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildOddEvenSettlementSummary({
              choice: normalizeOddEvenChoice(summary.choice),
              outcome: normalizeOddEvenChoice(summary.outcome),
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
        gameKey: "odd_even",
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
          gameKey: "odd_even",
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

  const choiceRead = await readLatestOddEvenChoiceEvent(supabase, sessionRow.id);
  if (!choiceRead.ok) {
    return { ok: false, error: choiceRead.error };
  }

  const row = choiceRead.row;
  const choice = normalizeOddEvenChoice(row?.event_payload?.side);
  const hasChoice = Boolean(choice);

  return {
    ok: true,
    snapshot: {
      gameKey: "odd_even",
      readState: hasChoice ? "choice_submitted" : "choice_required",
      canResolve: hasChoice,
      choice,
      choiceEventId: row?.id || null,
      choiceSubmittedAt: row?.created_at || null,
      resolvedResult: null,
    },
  };
}
