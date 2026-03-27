import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildDicePickSettlementSummary,
  DICE_PICK_MIN_WAGER,
} from "../dicePickConfig";

export function normalizeDicePickZone(value) {
  const z = String(value || "").toLowerCase();
  if (z === "low" || z === "high") return z;
  return null;
}

async function readLatestDicePickSubmitEvent(supabase, sessionId) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .contains("event_payload", { action: "dice_pick_submit" })
    .order("id", { ascending: false })
    .limit(1);

  if (query.error) return { ok: false, error: query.error };
  const row = Array.isArray(query.data) ? query.data[0] : query.data;
  return { ok: true, row: row || null };
}

export async function buildDicePickSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "dice_pick") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_dice_pick",
        canResolve: false,
        zone: null,
        submitEventId: null,
        submitSubmittedAt: null,
        resolvedResult: null,
      },
    };
  }

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const stake = Math.floor(Number(sessionRow.entry_amount || 0));
    const entryCost = stake >= DICE_PICK_MIN_WAGER ? stake : DICE_PICK_MIN_WAGER;
    const fundingSource = sessionRow.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
    return {
      ok: true,
      snapshot: {
        gameKey: "dice_pick",
        readState: "resolved",
        canResolve: false,
        zone: normalizeDicePickZone(summary.zone),
        submitEventId: null,
        submitSubmittedAt: null,
        resolvedResult: {
          zone: normalizeDicePickZone(summary.zone),
          roll: Number.isFinite(Number(summary.roll)) ? Number(summary.roll) : null,
          isWin: Boolean(summary.isWin),
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildDicePickSettlementSummary({
              zone: normalizeDicePickZone(summary.zone),
              roll: Number(summary.roll),
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
        gameKey: "dice_pick",
        readState: "invalid",
        canResolve: false,
        zone: null,
        submitEventId: null,
        submitSubmittedAt: null,
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
          gameKey: "dice_pick",
          readState: "invalid",
          canResolve: false,
          zone: null,
          submitEventId: null,
          submitSubmittedAt: null,
          resolvedResult: null,
        },
      };
    }
  }

  const submitRead = await readLatestDicePickSubmitEvent(supabase, sessionRow.id);
  if (!submitRead.ok) {
    return { ok: false, error: submitRead.error };
  }

  const row = submitRead.row;
  const zone = normalizeDicePickZone(row?.event_payload?.zone);
  const hasZone = Boolean(zone);

  return {
    ok: true,
    snapshot: {
      gameKey: "dice_pick",
      readState: hasZone ? "choice_submitted" : "choice_required",
      canResolve: hasZone,
      zone,
      submitEventId: row?.id || null,
      submitSubmittedAt: row?.created_at || null,
      resolvedResult: null,
    },
  };
}
