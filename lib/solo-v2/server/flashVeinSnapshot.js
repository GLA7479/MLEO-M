import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildFlashVeinSettlementSummary,
  FLASH_VEIN_MIN_WAGER,
  FLASH_VEIN_ROUNDS,
  normalizeFlashVeinColumn,
} from "../flashVeinConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { parseFlashVeinActiveSummary } from "./flashVeinEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= FLASH_VEIN_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function readFlashVeinPickEventsAfter(supabase, sessionId, minIdExclusive) {
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
  const picks = rows.filter(
    r =>
      String(r?.event_payload?.action || "") === "flash_vein_pick" &&
      String(r?.event_payload?.gameKey || "") === "flash_vein",
  );
  return { ok: true, rows: picks };
}

function buildPlayingPublic(sessionRow) {
  const entry = entryCostFromSessionRow(sessionRow);
  const active = parseFlashVeinActiveSummary(sessionRow);
  if (!active) {
    return {
      entryAmount: entry,
      currentRoundIndex: 0,
      maxRounds: FLASH_VEIN_ROUNDS,
      multBps: 10000,
      gemsCollected: 0,
      roundHistory: [],
    };
  }
  const hist = Array.isArray(active.roundHistory)
    ? active.roundHistory.map(h => ({
        column: Math.floor(Number(h?.column)),
        outcome: String(h?.outcome || ""),
        roundIndex: Math.floor(Number(h?.roundIndex)),
      }))
    : [];
  return {
    entryAmount: entry,
    currentRoundIndex: active.currentRoundIndex,
    maxRounds: FLASH_VEIN_ROUNDS,
    multBps: active.multBps,
    gemsCollected: active.gemsCollected,
    roundHistory: hist,
  };
}

export async function buildFlashVeinSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "flash_vein") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_flash_vein",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind = summary.terminalKind === "full_clear" ? "full_clear" : "overload";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildFlashVeinSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "flash_vein",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind === "full_clear" && payoutReturn > 0,
          multBpsEnd: summary.multBpsEnd != null ? Number(summary.multBpsEnd) : null,
          gemsCollected: summary.gemsCollected != null ? Math.floor(Number(summary.gemsCollected)) : null,
          roundHistory: Array.isArray(summary.roundHistory) ? summary.roundHistory : [],
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
        gameKey: "flash_vein",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
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
          gameKey: "flash_vein",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          pendingPick: null,
          pickConflict: false,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseFlashVeinActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "flash_vein",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: null,
      },
    };
  }

  const pickRead = await readFlashVeinPickEventsAfter(supabase, sessionRow.id, active.lastProcessedPickEventId);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const forPick = pickRead.rows;
  const pickConflict = forPick.length > 1;
  let pendingPick = null;

  if (!pickConflict && forPick.length === 1) {
    const row = forPick[0];
    const eid = row?.id != null ? Number(row.id) : null;
    const column = normalizeFlashVeinColumn(row?.event_payload?.column);
    if (Number.isFinite(eid) && eid > 0 && column !== null) {
      pendingPick = {
        pickEventId: eid,
        column,
        submittedAt: row?.created_at || null,
      };
    }
  }

  const r = active.currentRoundIndex;
  const revealed = active.revealedForRound;
  const revealDone = revealed !== null && revealed === r;

  let readState = "awaiting_reveal";
  if (pickConflict) readState = "pick_conflict";
  else if (pendingPick) readState = "pick_submitted";
  else if (revealDone) readState = "pick_pending";

  const canResolveTurn = !pickConflict && Boolean(pendingPick);

  const playing = buildPlayingPublic(sessionRow);

  return {
    ok: true,
    snapshot: {
      gameKey: "flash_vein",
      readState,
      canResolveTurn,
      canCashOut: false,
      playing,
      pendingPick,
      pickConflict,
      resolvedResult: null,
    },
  };
}

export function stripFlashVeinSecretsFromSummary(summary) {
  if (!summary || typeof summary !== "object") return {};
  const { roundPlan: _omit, ...rest } = summary;
  return rest;
}
