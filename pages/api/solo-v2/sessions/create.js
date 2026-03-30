import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseCreateSessionPayload, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { getSoloV2GameByKey } from "../../../../lib/solo-v2/server/gameCatalog";
import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "../../../../lib/solo-v2/quickFlipConfig";
import { CHALLENGE_21_MIN_WAGER } from "../../../../lib/solo-v2/challenge21Config";
import { MYSTERY_BOX_MIN_WAGER } from "../../../../lib/solo-v2/mysteryBoxConfig";
import { buildQuickFlipSessionSnapshot } from "../../../../lib/solo-v2/server/quickFlipSnapshot";
import { buildOddEvenSessionSnapshot } from "../../../../lib/solo-v2/server/oddEvenSnapshot";
import { buildMysteryBoxSessionSnapshot } from "../../../../lib/solo-v2/server/mysteryBoxSnapshot";
import { buildHighLowCardsSessionSnapshot } from "../../../../lib/solo-v2/server/highLowCardsSnapshot";
import { buildDicePickSessionSnapshot } from "../../../../lib/solo-v2/server/dicePickSnapshot";
import { buildGoldRushDiggerSessionSnapshot } from "../../../../lib/solo-v2/server/goldRushDiggerSnapshot";
import { drawServerCard, buildActiveSummaryPatch } from "../../../../lib/solo-v2/server/highLowCardsEngine";
import {
  buildInitialActiveSummary,
  generateBombColumns,
} from "../../../../lib/solo-v2/server/goldRushDiggerEngine";
import { buildTreasureDoorsSessionSnapshot } from "../../../../lib/solo-v2/server/treasureDoorsSnapshot";
import {
  buildInitialActiveSummary as buildTreasureDoorsInitialActiveSummary,
  generateTrapDoors,
} from "../../../../lib/solo-v2/server/treasureDoorsEngine";
import { buildVaultDoorsSessionSnapshot } from "../../../../lib/solo-v2/server/vaultDoorsSnapshot";
import {
  buildInitialActiveSummary as buildVaultDoorsInitialActiveSummary,
  generateVaultTrapLayout,
} from "../../../../lib/solo-v2/server/vaultDoorsEngine";
import { buildCrystalPathSessionSnapshot } from "../../../../lib/solo-v2/server/crystalPathSnapshot";
import {
  buildInitialActiveSummary as buildCrystalPathInitialActiveSummary,
  generateSafeColumns,
} from "../../../../lib/solo-v2/server/crystalPathEngine";
import { buildSpeedTrackSessionSnapshot } from "../../../../lib/solo-v2/server/speedTrackSnapshot";
import {
  buildInitialActiveSummary as buildSpeedTrackInitialActiveSummary,
  generateBlockedRoutes,
} from "../../../../lib/solo-v2/server/speedTrackEngine";
import { buildLimitRunSessionSnapshot } from "../../../../lib/solo-v2/server/limitRunSnapshot";
import { buildLimitRunInitialActiveSummary } from "../../../../lib/solo-v2/server/limitRunEngine";
import { buildNumberHuntSessionSnapshot } from "../../../../lib/solo-v2/server/numberHuntSnapshot";
import { buildNumberHuntInitialActiveSummary } from "../../../../lib/solo-v2/server/numberHuntEngine";
import { buildTripleDiceSessionSnapshot } from "../../../../lib/solo-v2/server/tripleDiceSnapshot";
import { buildTripleDiceInitialActiveSummary } from "../../../../lib/solo-v2/server/tripleDiceEngine";
import { buildChallenge21SessionSnapshot } from "../../../../lib/solo-v2/server/challenge21Snapshot";
import { buildChallenge21DealState } from "../../../../lib/solo-v2/server/challenge21Play";
import { buildDropRunSessionSnapshot } from "../../../../lib/solo-v2/server/dropRunSnapshot";
import { buildDropRunInitialActiveSummary } from "../../../../lib/solo-v2/server/dropRunEngine";
import { buildMysteryChamberSessionSnapshot } from "../../../../lib/solo-v2/server/mysteryChamberSnapshot";
import { MYSTERY_CHAMBER_MIN_WAGER } from "../../../../lib/solo-v2/mysteryChamberConfig";
import {
  buildMysteryChamberInitialActiveSummary,
  generateSafeSigilSets,
} from "../../../../lib/solo-v2/server/mysteryChamberEngine";
import { mysteryChamberDebugLog } from "../../../../lib/solo-v2/server/mysteryChamberDebug";
import { buildCoreBreakerSessionSnapshot } from "../../../../lib/solo-v2/server/coreBreakerSnapshot";
import { buildCoreBreakerInitialActiveSummary } from "../../../../lib/solo-v2/server/coreBreakerEngine";
import { buildFlashVeinSessionSnapshot } from "../../../../lib/solo-v2/server/flashVeinSnapshot";
import { buildFlashVeinInitialActiveSummary } from "../../../../lib/solo-v2/server/flashVeinEngine";
import { buildDiamondsSessionSnapshot } from "../../../../lib/solo-v2/server/diamondsSnapshot";
import {
  generateDiamondBombIndices,
  buildDiamondsInitialActiveSummary,
} from "../../../../lib/solo-v2/server/diamondsEngine";
import { DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY } from "../../../../lib/solo-v2/diamondsConfig";
import { buildSoloLadderSessionSnapshot } from "../../../../lib/solo-v2/server/soloLadderSnapshot";
import { buildSoloLadderInitialActiveSummary } from "../../../../lib/solo-v2/server/soloLadderEngine";

function isMissingTable(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const hasDoesNotExist = message.includes("does not exist");
  return (
    code === "42P01" ||
    code === "42883" ||
    (hasDoesNotExist && message.includes("relation")) ||
    (hasDoesNotExist && message.includes("function")) ||
    message.includes("rpc")
  );
}

function logCreateBranch(branch, meta = {}) {
  console.warn("solo-v2 create branch", {
    branch,
    ...meta,
  });
}

function serializeSupabaseError(err) {
  if (!err || typeof err !== "object") return null;
  return {
    code: err.code ?? null,
    message: err.message ?? null,
    details: err.details ?? null,
    hint: err.hint ?? null,
  };
}

/**
 * Single exit for all 503s: logs a unique branch marker + returns full JSON to the browser
 * (so DevTools / any client that shows payload.message sees branch + supabase hints).
 */
function sendCreate503(
  res,
  {
    branch,
    source,
    category,
    status,
    message,
    rawBodySnapshot,
    entryAmount,
    supabaseError,
  },
) {
  const body = {
    ok: false,
    category,
    status,
    message: `${message} Branch: ${branch}.`,
    branch,
    source,
    requestBodyRaw: rawBodySnapshot,
    entryAmount,
    supabaseError: serializeSupabaseError(supabaseError),
  };
  console.error("[solo-v2/create 503]", branch, {
    category,
    status,
    source,
    message: body.message,
    requestBodyRaw: rawBodySnapshot,
    entryAmount,
    supabaseError: body.supabaseError,
  });
  return res.status(503).json(body);
}

function isUniqueConflict(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  return (
    code === "23505" ||
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    details.includes("duplicate key") ||
    hint.includes("unique")
  );
}

function isGameNotEnabled(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("game is not enabled");
}

function isLegacyDeviceIdNotNullError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "23502" && message.includes("device_id");
}

/**
 * Must match DB partial unique indexes (one active session per player per game), e.g.
 * uq_solo_v2_quick_flip_one_active_per_player, uq_solo_v2_mystery_box_one_active_per_player,
 * uq_solo_v2_high_low_cards_one_active_per_player.
 * Do not filter by expires_at here: a time-expired row can still be created/in_progress in DB.
 */
const SINGLE_ACTIVE_GAME_SESSION_FETCH_CAP = 40;

async function readActiveSessionsForGame(supabase, playerRef, gameKey) {
  const unresolvedStatuses = [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS];
  const lookup = await supabase
    .from("solo_v2_sessions")
    .select("id,session_status,session_mode,entry_amount,expires_at,created_at")
    .eq("player_ref", playerRef)
    .eq("game_key", gameKey)
    .in("session_status", unresolvedStatuses)
    .order("created_at", { ascending: false })
    .limit(SINGLE_ACTIVE_GAME_SESSION_FETCH_CAP);

  if (lookup.error) {
    logCreateBranch("readActiveSessionsForGame.query_failed", {
      gameKey,
      code: lookup.error?.code ?? null,
      message: lookup.error?.message ?? null,
      details: lookup.error?.details ?? null,
      hint: lookup.error?.hint ?? null,
    });
    return { ok: false, error: lookup.error };
  }

  return { ok: true, rows: lookup.data || [] };
}

function summarizeActiveSessionRows(rows) {
  return (rows || []).map(r => ({
    id: r.id,
    session_status: r.session_status,
    created_at: r.created_at ?? null,
  }));
}

/**
 * Expire duplicate active sessions, re-read from DB, optional bulk sweep (mystery_box diagnostics).
 * Returns latest read result { ok, rows } or { ok: false, error }.
 */
async function healAndReReadActiveSessions(supabase, playerRef, gameKey, phaseLabel) {
  const logMystery = gameKey === "mystery_box";
  const read1 = await readActiveSessionsForGame(supabase, playerRef, gameKey);
  if (!read1.ok) return read1;

  if (logMystery) {
    console.warn("[solo-v2/create mystery_box]", phaseLabel, "active_rows_before_heal", {
      playerRef,
      count: read1.rows.length,
      rows: summarizeActiveSessionRows(read1.rows),
    });
  }

  if (read1.rows.length <= 1) {
    if (logMystery) {
      console.warn("[solo-v2/create mystery_box]", phaseLabel, "no_duplicate_heal_needed", {
        expireUpdatedRowCount: 0,
        activeCount: read1.rows.length,
        rows: summarizeActiveSessionRows(read1.rows),
      });
    }
    return read1;
  }

  const keeperId = read1.rows[0].id;
  const extras = read1.rows.slice(1);
  let expireUpdatedRowCount = 0;

  for (const row of extras) {
    const upd = await supabase
      .from("solo_v2_sessions")
      .update({ session_status: SOLO_V2_SESSION_STATUS.EXPIRED })
      .eq("id", row.id)
      .eq("player_ref", playerRef)
      .eq("game_key", gameKey)
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id");

    if (upd.error) {
      logCreateBranch("expire_duplicate_active_session_failed", {
        gameKey,
        sessionId: row.id,
        code: upd.error?.code ?? null,
        message: upd.error?.message ?? null,
      });
    } else if (Array.isArray(upd.data) && upd.data.length > 0) {
      expireUpdatedRowCount += 1;
    }
  }

  let read2 = await readActiveSessionsForGame(supabase, playerRef, gameKey);
  if (!read2.ok) return read2;

  if (logMystery) {
    console.warn("[solo-v2/create mystery_box]", phaseLabel, "after_per_row_expire", {
      expireUpdatedRowCount,
      activeCount: read2.rows.length,
      rows: summarizeActiveSessionRows(read2.rows),
    });
  }

  if (read2.rows.length > 1) {
    const { data: bulkExpired, error: bulkErr } = await supabase
      .from("solo_v2_sessions")
      .update({ session_status: SOLO_V2_SESSION_STATUS.EXPIRED })
      .eq("player_ref", playerRef)
      .eq("game_key", gameKey)
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .neq("id", keeperId)
      .select("id");

    if (logMystery) {
      console.warn("[solo-v2/create mystery_box]", phaseLabel, "bulk_expire_non_keeper", {
        keeperId,
        error: bulkErr ? serializeSupabaseError(bulkErr) : null,
        expiredIds: (bulkExpired || []).map(r => r.id),
        expiredCount: bulkExpired?.length ?? 0,
      });
    }

    read2 = await readActiveSessionsForGame(supabase, playerRef, gameKey);
    if (!read2.ok) return read2;

    if (logMystery) {
      console.warn("[solo-v2/create mystery_box]", phaseLabel, "after_bulk_expire_re_read", {
        activeCount: read2.rows.length,
        rows: summarizeActiveSessionRows(read2.rows),
      });
    }
  }

  if (logMystery) {
    console.warn("[solo-v2/create mystery_box]", phaseLabel, "after_heal_summary", {
      expireUpdatedRowCount,
      activeCount: read2.rows.length,
      rows: summarizeActiveSessionRows(read2.rows),
      stillMultipleAfterHeal: read2.rows.length > 1,
    });
  }

  return read2;
}

async function fetchSessionRowForSnapshotByGame(supabase, sessionId, playerRef, gameKey) {
  const { data, error } = await supabase
    .from("solo_v2_sessions")
    .select(
      "id,game_key,player_ref,session_status,session_mode,entry_amount,reward_amount,net_amount,server_outcome_summary,created_at,updated_at,expires_at,resolved_at",
    )
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", gameKey)
    .single();

  if (error || !data) return { ok: false, error: error || new Error("session row not found") };
  return { ok: true, row: data };
}

/** Align create with GET/readSessionTruth: only return existing_session when snapshot is playable. */
async function singleActiveGameRowPlayableOrExpire(supabase, existingSummary, playerRef, gameKey, buildSnapshot) {
  const fetched = await fetchSessionRowForSnapshotByGame(supabase, existingSummary.id, playerRef, gameKey);
  if (!fetched.ok) {
    return { ok: false, kind: "fetch_row", error: fetched.error };
  }

  const snap = await buildSnapshot(supabase, fetched.row);
  if (!snap.ok) {
    return { ok: false, kind: "snapshot", error: snap.error };
  }

  const rs = snap.snapshot.readState;
  if (
    rs === "choice_required" ||
    rs === "choice_submitted" ||
    rs === "pick_conflict" ||
    rs === "ready" ||
    rs === "roll_submitted" ||
    rs === "roll_conflict" ||
    rs === "guess_submitted" ||
    rs === "guess_conflict" ||
    rs === "gate_submitted" ||
    rs === "gate_conflict" ||
    rs === "action_submitted" ||
    rs === "action_conflict" ||
    rs === "awaiting_reveal" ||
    rs === "pick_pending" ||
    rs === "pick_submitted"
  ) {
    return { ok: true, playable: true };
  }

  const { error: updErr } = await supabase
    .from("solo_v2_sessions")
    .update({ session_status: SOLO_V2_SESSION_STATUS.EXPIRED })
    .eq("id", existingSummary.id)
    .eq("player_ref", playerRef)
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (updErr) {
    return { ok: false, kind: "expire_stale", error: updErr };
  }

  logCreateBranch("solo_v2_stale_row_expired_for_create", {
    gameKey,
    sessionId: existingSummary.id,
    readState: rs,
    reason: "snapshot_not_playable_same_rules_as_read_api",
  });
  return { ok: true, playable: false };
}

function createExistingSessionResponse(existing, playerRef, gameKey) {
  return {
    ok: true,
    category: "success",
    status: "existing_session",
    session: {
      id: existing.id,
      gameKey,
      playerRef,
      sessionMode: existing.session_mode || "standard",
      entryAmount: Number(existing.entry_amount || 0),
      sessionStatus: existing.session_status || SOLO_V2_SESSION_STATUS.CREATED,
      expiresAt: existing.expires_at || null,
    },
    idempotent: true,
    authority: {
      sessionTruth: "server",
      outcomeTruth: "deferred",
      rewardTruth: "deferred",
    },
  };
}

async function ensureSoloV2GameCatalogRow(supabase, gameKey) {
  const game = getSoloV2GameByKey(gameKey);
  if (!game) return { ok: false, reason: "missing_registry_game" };

  const upsert = await supabase.from("solo_v2_games").upsert(
    {
      game_key: gameKey,
      route_path: game.route,
      title: game.title,
      is_enabled: true,
      sort_order: game.sortOrder || 1,
    },
    { onConflict: "game_key" },
  );

  if (upsert.error) return { ok: false, error: upsert.error };
  return { ok: true };
}

async function seedHighLowCardsSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "high_low_cards" || !sessionId) return;
  const card = drawServerCard();
  const summary = buildActiveSummaryPatch(card);
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "high_low_cards")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create high_low_cards] seed failed", { sessionId, error });
  }
}

async function seedGoldRushDiggerSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "gold_rush_digger" || !sessionId) return;
  const summary = buildInitialActiveSummary(generateBombColumns());
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "gold_rush_digger")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create gold_rush_digger] seed failed", { sessionId, error });
  }
}

async function seedTreasureDoorsSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "treasure_doors" || !sessionId) return;
  const summary = buildTreasureDoorsInitialActiveSummary(generateTrapDoors());
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "treasure_doors")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create treasure_doors] seed failed", { sessionId, error });
  }
}

async function seedVaultDoorsSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "vault_doors" || !sessionId) return;
  const summary = buildVaultDoorsInitialActiveSummary(generateVaultTrapLayout());
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "vault_doors")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create vault_doors] seed failed", { sessionId, error });
  }
}

async function seedCrystalPathSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "crystal_path" || !sessionId) return;
  const summary = buildCrystalPathInitialActiveSummary(generateSafeColumns());
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "crystal_path")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create crystal_path] seed failed", { sessionId, error });
  }
}

async function seedSpeedTrackSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "speed_track" || !sessionId) return;
  const summary = buildSpeedTrackInitialActiveSummary(generateBlockedRoutes());
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "speed_track")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create speed_track] seed failed", { sessionId, error });
  }
}

async function seedLimitRunSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "limit_run" || !sessionId) return;
  const summary = buildLimitRunInitialActiveSummary();
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "limit_run")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create limit_run] seed failed", { sessionId, error });
  }
}

async function seedNumberHuntSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "number_hunt" || !sessionId) return;
  const summary = buildNumberHuntInitialActiveSummary();
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "number_hunt")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create number_hunt] seed failed", { sessionId, error });
  }
}

async function seedCoreBreakerSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "core_breaker" || !sessionId) return;
  const summary = buildCoreBreakerInitialActiveSummary();
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "core_breaker")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create core_breaker] seed failed", { sessionId, error });
  }
}

async function seedFlashVeinSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "flash_vein" || !sessionId) return;
  const summary = buildFlashVeinInitialActiveSummary();
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "flash_vein")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create flash_vein] seed failed", { sessionId, error });
  }
}

async function seedTripleDiceSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "triple_dice" || !sessionId) return;
  const summary = buildTripleDiceInitialActiveSummary();
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "triple_dice")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create triple_dice] seed failed", { sessionId, error });
  }
}

async function seedChallenge21SessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "challenge_21" || !sessionId) return;

  const rowRes = await supabase
    .from("solo_v2_sessions")
    .select("entry_amount,session_mode")
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "challenge_21")
    .maybeSingle();

  let updatePayload;
  if (!rowRes.error && rowRes.data) {
    const entryRaw = Math.floor(Number(rowRes.data.entry_amount) || 0);
    const entryCost = entryRaw >= CHALLENGE_21_MIN_WAGER ? entryRaw : QUICK_FLIP_CONFIG.entryCost;
    const fundingSource =
      rowRes.data.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
    const deal = buildChallenge21DealState(entryCost, fundingSource);
    if (deal.type === "resolved") {
      updatePayload = {
        server_outcome_summary: deal.summary,
        session_status: SOLO_V2_SESSION_STATUS.RESOLVED,
        resolved_at: deal.summary.resolvedAt || null,
      };
    } else {
      updatePayload = {
        server_outcome_summary: deal.summary,
        session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        resolved_at: null,
      };
    }
  } else {
    const deal = buildChallenge21DealState(QUICK_FLIP_CONFIG.entryCost, "vault");
    updatePayload =
      deal.type === "resolved"
        ? {
            server_outcome_summary: deal.summary,
            session_status: SOLO_V2_SESSION_STATUS.RESOLVED,
            resolved_at: deal.summary.resolvedAt || null,
          }
        : {
            server_outcome_summary: deal.summary,
            session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            resolved_at: null,
          };
  }

  const { error } = await supabase
    .from("solo_v2_sessions")
    .update(updatePayload)
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "challenge_21")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create challenge_21] seed failed", { sessionId, error });
  }
}

async function seedDropRunSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "drop_run" || !sessionId) return;
  const summary = buildDropRunInitialActiveSummary();
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "drop_run")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create drop_run] seed failed", { sessionId, error });
  }
}

async function seedDiamondsSessionOrWarn(supabase, gameKey, sessionId, playerRef, gameOptions = {}) {
  if (gameKey !== "diamonds" || !sessionId) return;
  const difficulty = String(gameOptions?.difficulty || "medium").toLowerCase();
  const bombCount =
    DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY[difficulty] ?? DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY.medium;
  let bombIndices;
  try {
    bombIndices = generateDiamondBombIndices(bombCount);
  } catch {
    console.error("[solo-v2/create diamonds] bomb generation failed", { sessionId, bombCount });
    return;
  }
  const summary = buildDiamondsInitialActiveSummary(bombIndices, difficulty, bombCount);
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "diamonds")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create diamonds] seed failed", { sessionId, error });
  }
}

async function seedSoloLadderSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "solo_ladder" || !sessionId) return;
  const summary = buildSoloLadderInitialActiveSummary();
  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "solo_ladder")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create solo_ladder] seed failed", { sessionId, error });
  }
}

async function seedMysteryChamberSessionOrWarn(supabase, gameKey, sessionId, playerRef) {
  if (gameKey !== "mystery_chamber" || !sessionId) return;

  const rowRes = await supabase
    .from("solo_v2_sessions")
    .select("entry_amount")
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "mystery_chamber")
    .maybeSingle();

  const entryRaw = Math.floor(Number(rowRes.data?.entry_amount) || 0);
  const entryCost = entryRaw >= MYSTERY_CHAMBER_MIN_WAGER ? entryRaw : QUICK_FLIP_CONFIG.entryCost;
  const sets = generateSafeSigilSets();
  const summary = buildMysteryChamberInitialActiveSummary(sets, entryCost);

  mysteryChamberDebugLog("seed_new_run", {
    sessionId,
    entryCost,
    chamberCount: summary.chamberCount,
    safeSigilSets: sets,
    note: "Chambers 1–3: two distinct safe indices each; chamber 4: one. Server-owned layout.",
  });

  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: summary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "mystery_chamber")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    console.error("[solo-v2/create mystery_chamber] seed failed", { sessionId, error });
  }
}

async function createSessionLegacyCompat(supabase, payload) {
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + 900 * 1000).toISOString();
  const startedAtIso = startedAt.toISOString();

  const insertSession = await supabase
    .from("solo_v2_sessions")
    .insert({
      game_key: payload.gameKey,
      device_id: payload.playerRef,
      play_mode: payload.sessionMode === "freeplay" ? "freeplay" : "paid",
      stake_amount: payload.entryAmount,
      started_at: startedAtIso,
      player_ref: payload.playerRef,
      session_status: "created",
      session_mode: payload.sessionMode,
      entry_amount: payload.entryAmount,
      reward_amount: 0,
      net_amount: -payload.entryAmount,
      server_outcome_summary: { phase: "foundation" },
      client_nonce: payload.clientNonce,
      integrity_token: null,
      idempotency_key: payload.idempotencyKey,
      expires_at: expiresAt,
    })
    .select("id,session_status,expires_at")
    .single();

  if (insertSession.error) return { ok: false, error: insertSession.error };

  await supabase.from("solo_v2_session_events").insert({
    session_id: insertSession.data.id,
    event_type: "session_created",
    event_payload: {
      session_mode: payload.sessionMode,
      entry_amount: payload.entryAmount,
    },
  });

  return {
    ok: true,
    data: {
      session_id: insertSession.data.id,
      session_status: insertSession.data.session_status || "created",
      expires_at: insertSession.data.expires_at || null,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, category: "validation_error", status: "method_not_allowed" });
  }

  let rawBodySnapshot = null;
  try {
    rawBodySnapshot = JSON.stringify(req.body ?? null);
  } catch {
    rawBodySnapshot = "[unserializable req.body]";
  }

  const parsed = parseCreateSessionPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: parsed.message });
  }

  const playerRef = resolvePlayerRef(req);
  const { gameKey, sessionMode, entryAmount, clientNonce, idempotencyKey, gameOptions } = parsed.value;

  try {
    const supabase = getSupabaseAdmin();

    if (gameKey === "quick_flip" ||
      gameKey === "odd_even" ||
      gameKey === "dice_pick" ||
      gameKey === "mystery_box" ||
      gameKey === "high_low_cards" ||
      gameKey === "gold_rush_digger" ||
      gameKey === "treasure_doors" ||
      gameKey === "vault_doors" ||
      gameKey === "crystal_path" ||
      gameKey === "speed_track" ||
      gameKey === "limit_run" ||
      gameKey === "number_hunt" ||
      gameKey === "core_breaker" ||
      gameKey === "flash_vein" ||
      gameKey === "triple_dice" ||
      gameKey === "challenge_21" ||
      gameKey === "drop_run" ||
      gameKey === "mystery_chamber" ||
      gameKey === "diamonds" ||
      gameKey === "solo_ladder") {
      const minWager = gameKey === "mystery_box" ? MYSTERY_BOX_MIN_WAGER : QUICK_FLIP_MIN_WAGER;
      const buildSnapshot =
        gameKey === "mystery_box"
          ? buildMysteryBoxSessionSnapshot
          : gameKey === "high_low_cards"
            ? buildHighLowCardsSessionSnapshot
            : gameKey === "dice_pick"
              ? buildDicePickSessionSnapshot
              : gameKey === "gold_rush_digger"
                ? buildGoldRushDiggerSessionSnapshot
                : gameKey === "treasure_doors"
                  ? buildTreasureDoorsSessionSnapshot
                  : gameKey === "vault_doors"
                    ? buildVaultDoorsSessionSnapshot
                    : gameKey === "crystal_path"
                      ? buildCrystalPathSessionSnapshot
                      : gameKey === "speed_track"
                        ? buildSpeedTrackSessionSnapshot
                        : gameKey === "limit_run"
                          ? buildLimitRunSessionSnapshot
                          : gameKey === "number_hunt"
                            ? buildNumberHuntSessionSnapshot
                            : gameKey === "core_breaker"
                              ? buildCoreBreakerSessionSnapshot
                              : gameKey === "flash_vein"
                                ? buildFlashVeinSessionSnapshot
                                : gameKey === "triple_dice"
                                  ? buildTripleDiceSessionSnapshot
                                  : gameKey === "challenge_21"
                                    ? buildChallenge21SessionSnapshot
                                    : gameKey === "drop_run"
                                      ? buildDropRunSessionSnapshot
                                      : gameKey === "mystery_chamber"
                                        ? buildMysteryChamberSessionSnapshot
                                        : gameKey === "diamonds"
                                          ? buildDiamondsSessionSnapshot
                                            : gameKey === "solo_ladder"
                                            ? buildSoloLadderSessionSnapshot
                                            : gameKey === "odd_even"
                                              ? buildOddEvenSessionSnapshot
                                              : buildQuickFlipSessionSnapshot;

      if (!Number.isFinite(entryAmount) || entryAmount < minWager) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_entry_amount",
          message: `entryAmount must be at least ${minWager}`,
        });
      }

      const existingLookup = await healAndReReadActiveSessions(supabase, playerRef, gameKey, "precheck");
      if (!existingLookup.ok) {
        const err = existingLookup.error;
        const missingTbl = isMissingTable(err);
        if (missingTbl) {
          logCreateBranch("pending_migration.precheck_existing_sessions", {
            gameKey,
            code: existingLookup.error?.code || null,
            message: existingLookup.error?.message || null,
            details: existingLookup.error?.details || null,
          });
          return sendCreate503(res, {
            branch: "CREATE_503_SINGLE_ACTIVE_PRECHECK_PENDING_MIGRATION",
            source: "readActiveSessionsForGame_precheck_pending_migration_detection",
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 session persistence is not migrated yet.",
            rawBodySnapshot,
            entryAmount,
            supabaseError: err,
          });
        }
        return sendCreate503(res, {
          branch: "CREATE_503_SINGLE_ACTIVE_PRECHECK_UNAVAILABLE",
          source: "readActiveSessionsForGame_precheck_generic_supabase_error",
          category: "unavailable",
          status: "unavailable",
          message: "Create session is temporarily unavailable.",
          rawBodySnapshot,
          entryAmount,
          supabaseError: err,
        });
      }

      const existingRows = existingLookup.rows;
      if ((gameKey === "mystery_box" || gameKey === "high_low_cards") && existingRows.length > 1) {
        console.error(`[solo-v2/create ${gameKey}] unrecoverable_multiple_active_after_heal`, {
          playerRef,
          phase: "precheck",
          count: existingRows.length,
          rows: summarizeActiveSessionRows(existingRows),
        });
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "conflict_active_sessions",
          message: `Multiple active ${gameKey} sessions could not be merged. Try again in a moment.`,
        });
      }

      const existing = existingRows[0];
      if (existing) {
        const playable = await singleActiveGameRowPlayableOrExpire(supabase, existing, playerRef, gameKey, buildSnapshot);
        if (!playable.ok) {
          return sendCreate503(res, {
            branch: "CREATE_503_EXISTING_CLASSIFY_FAILED",
            source: "singleActiveGameRowPlayableOrExpire_precheck",
            category: "unavailable",
            status: "unavailable",
            message: "Create session is temporarily unavailable.",
            rawBodySnapshot,
            entryAmount,
            supabaseError: playable.error,
          });
        }
        if (playable.playable) {
          if (gameKey === "mystery_box") {
            console.warn("[solo-v2/create mystery_box] precheck http_response_branch", {
              branch: "200_existing_session",
              sessionId: existing.id,
            });
          }
          return res.status(200).json(createExistingSessionResponse(existing, playerRef, gameKey));
        }
      }
      if (gameKey === "mystery_box") {
        console.warn("[solo-v2/create mystery_box] precheck http_response_branch", {
          branch: "fallthrough_rpc_create",
        });
      }
    }

    let createCall = await supabase.rpc("solo_v2_create_session", {
      p_player_ref: playerRef,
      p_game_key: gameKey,
      p_session_mode: sessionMode,
      p_entry_amount: entryAmount,
      p_client_nonce: clientNonce,
      p_integrity_token: null,
      p_idempotency_key: idempotencyKey,
      p_expires_in_seconds: 900,
    });
    let { data, error } = createCall;

    if (
      error &&
      (gameKey === "quick_flip" ||
      gameKey === "odd_even" ||
      gameKey === "dice_pick" ||
      gameKey === "mystery_box" ||
      gameKey === "high_low_cards" ||
      gameKey === "gold_rush_digger" ||
      gameKey === "treasure_doors" ||
      gameKey === "vault_doors" ||
      gameKey === "crystal_path" ||
      gameKey === "speed_track" ||
      gameKey === "limit_run" ||
      gameKey === "number_hunt" ||
      gameKey === "core_breaker" ||
      gameKey === "flash_vein" ||
      gameKey === "triple_dice" ||
      gameKey === "challenge_21" ||
      gameKey === "drop_run" ||
      gameKey === "mystery_chamber" ||
      gameKey === "diamonds" ||
      gameKey === "solo_ladder") &&
      isGameNotEnabled(error)
    ) {
      console.warn(`solo-v2 create: ${gameKey} missing/disabled in solo_v2_games, attempting catalog bootstrap`);
      const catalogFix = await ensureSoloV2GameCatalogRow(supabase, gameKey);
      if (catalogFix.ok) {
        createCall = await supabase.rpc("solo_v2_create_session", {
          p_player_ref: playerRef,
          p_game_key: gameKey,
          p_session_mode: sessionMode,
          p_entry_amount: entryAmount,
          p_client_nonce: clientNonce,
          p_integrity_token: null,
          p_idempotency_key: idempotencyKey,
          p_expires_in_seconds: 900,
        });
        data = createCall.data;
        error = createCall.error;
      } else {
        console.error(`solo-v2 create: ${gameKey} catalog bootstrap failed`, {
          reason: catalogFix.reason || "upsert_error",
          error: catalogFix.error || null,
        });
      }
    }

    if (error) {
      console.error("solo-v2 create unavailable branch", {
        gameKey,
        playerRef,
        code: error?.code || null,
        message: error?.message || null,
        details: error?.details || null,
        hint: error?.hint || null,
      });

      if (
        (gameKey === "quick_flip" ||
      gameKey === "odd_even" ||
      gameKey === "dice_pick" ||
      gameKey === "mystery_box" ||
      gameKey === "high_low_cards" ||
      gameKey === "gold_rush_digger" ||
      gameKey === "treasure_doors" ||
      gameKey === "vault_doors" ||
      gameKey === "crystal_path" ||
      gameKey === "speed_track" ||
      gameKey === "limit_run" ||
      gameKey === "number_hunt" ||
      gameKey === "core_breaker" ||
      gameKey === "flash_vein" ||
      gameKey === "triple_dice" ||
      gameKey === "challenge_21" ||
      gameKey === "drop_run" ||
      gameKey === "mystery_chamber" ||
      gameKey === "diamonds" ||
      gameKey === "solo_ladder") &&
        isLegacyDeviceIdNotNullError(error)
      ) {
        console.warn("solo-v2 create: legacy device_id constraint detected, using compat insert path");
        const compatResult = await createSessionLegacyCompat(supabase, {
          gameKey,
          playerRef,
          sessionMode,
          entryAmount,
          clientNonce,
          idempotencyKey,
        });
        if (compatResult.ok) {
          data = compatResult.data;
          error = null;
        } else {
          error = compatResult.error;
        }
      }

      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        await seedHighLowCardsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedGoldRushDiggerSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedTreasureDoorsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedVaultDoorsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedCrystalPathSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedSpeedTrackSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedLimitRunSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedNumberHuntSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedCoreBreakerSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedFlashVeinSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedTripleDiceSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedChallenge21SessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedDropRunSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedMysteryChamberSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        await seedDiamondsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef, gameOptions);
        await seedSoloLadderSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
        return res.status(201).json({
          ok: true,
          category: "success",
          status: "created",
          session: {
            id: row?.session_id || null,
            gameKey,
            playerRef,
            sessionMode,
            entryAmount,
            sessionStatus: row?.session_status || "created",
            expiresAt: row?.expires_at || null,
          },
          authority: {
            sessionTruth: "server",
            outcomeTruth: "deferred",
            rewardTruth: "deferred",
          },
        });
      }

      if (isMissingTable(error)) {
        logCreateBranch("pending_migration.rpc_create_session", {
          gameKey,
          code: error?.code || null,
          message: error?.message || null,
          details: error?.details || null,
        });
        return sendCreate503(res, {
          branch: "CREATE_503_RPC_PENDING_MIGRATION",
          source: "solo_v2_create_session_rpc_missing_table_or_function",
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 session persistence is not migrated yet.",
          rawBodySnapshot,
          entryAmount,
          supabaseError: error,
        });
      }

      if (
        (gameKey === "quick_flip" ||
      gameKey === "odd_even" ||
      gameKey === "dice_pick" ||
      gameKey === "mystery_box" ||
      gameKey === "high_low_cards" ||
      gameKey === "gold_rush_digger" ||
      gameKey === "treasure_doors" ||
      gameKey === "vault_doors" ||
      gameKey === "crystal_path" ||
      gameKey === "speed_track" ||
      gameKey === "limit_run" ||
      gameKey === "number_hunt" ||
      gameKey === "core_breaker" ||
      gameKey === "flash_vein" ||
      gameKey === "triple_dice" ||
      gameKey === "challenge_21" ||
      gameKey === "drop_run" ||
      gameKey === "mystery_chamber" ||
      gameKey === "diamonds" ||
      gameKey === "solo_ladder") &&
        isUniqueConflict(error)
      ) {
        const buildSnapshot =
          gameKey === "mystery_box"
            ? buildMysteryBoxSessionSnapshot
            : gameKey === "high_low_cards"
              ? buildHighLowCardsSessionSnapshot
              : gameKey === "dice_pick"
                ? buildDicePickSessionSnapshot
                : gameKey === "gold_rush_digger"
                  ? buildGoldRushDiggerSessionSnapshot
                  : gameKey === "treasure_doors"
                    ? buildTreasureDoorsSessionSnapshot
                    : gameKey === "vault_doors"
                      ? buildVaultDoorsSessionSnapshot
                      : gameKey === "crystal_path"
                        ? buildCrystalPathSessionSnapshot
                        : gameKey === "speed_track"
                          ? buildSpeedTrackSessionSnapshot
                          : gameKey === "limit_run"
                            ? buildLimitRunSessionSnapshot
                            : gameKey === "number_hunt"
                              ? buildNumberHuntSessionSnapshot
                              : gameKey === "core_breaker"
                                ? buildCoreBreakerSessionSnapshot
                                : gameKey === "flash_vein"
                                  ? buildFlashVeinSessionSnapshot
                                  : gameKey === "triple_dice"
                                    ? buildTripleDiceSessionSnapshot
                                    : gameKey === "challenge_21"
                                      ? buildChallenge21SessionSnapshot
                                      : gameKey === "drop_run"
                                        ? buildDropRunSessionSnapshot
                                        : gameKey === "mystery_chamber"
                                          ? buildMysteryChamberSessionSnapshot
                                          : gameKey === "diamonds"
                                            ? buildDiamondsSessionSnapshot
                                            : gameKey === "solo_ladder"
                                            ? buildSoloLadderSessionSnapshot
                                            : gameKey === "odd_even"
                                              ? buildOddEvenSessionSnapshot
                                              : buildQuickFlipSessionSnapshot;
        const conflictLookup = await healAndReReadActiveSessions(supabase, playerRef, gameKey, "post_unique_conflict");
        if (conflictLookup.ok) {
          const conflictRows = conflictLookup.rows;
          if ((gameKey === "mystery_box" || gameKey === "high_low_cards") && conflictRows.length > 1) {
            console.error(`[solo-v2/create ${gameKey}] unrecoverable_multiple_active_after_heal`, {
              playerRef,
              phase: "post_unique_conflict",
              count: conflictRows.length,
              rows: summarizeActiveSessionRows(conflictRows),
            });
            return res.status(409).json({
              ok: false,
              category: "conflict",
              status: "conflict_active_sessions",
              message: `Multiple active ${gameKey} sessions could not be merged. Try again in a moment.`,
            });
          }
          if (conflictRows[0]) {
            const row0 = conflictRows[0];
            const playable = await singleActiveGameRowPlayableOrExpire(supabase, row0, playerRef, gameKey, buildSnapshot);
            if (!playable.ok) {
              return sendCreate503(res, {
                branch: "CREATE_503_CONFLICT_CLASSIFY_FAILED",
                source: "singleActiveGameRowPlayableOrExpire_post_unique",
                category: "unavailable",
                status: "unavailable",
                message: "Create session is temporarily unavailable.",
                rawBodySnapshot,
                entryAmount,
                supabaseError: playable.error,
              });
            }
            if (playable.playable) {
              if (gameKey === "mystery_box") {
                console.warn("[solo-v2/create mystery_box] post_unique_conflict http_response_branch", {
                  branch: "200_existing_session",
                  sessionId: row0.id,
                });
              }
              return res.status(200).json(createExistingSessionResponse(row0, playerRef, gameKey));
            }
            const retryCall = await supabase.rpc("solo_v2_create_session", {
              p_player_ref: playerRef,
              p_game_key: gameKey,
              p_session_mode: sessionMode,
              p_entry_amount: entryAmount,
              p_client_nonce: clientNonce,
              p_integrity_token: null,
              p_idempotency_key: idempotencyKey,
              p_expires_in_seconds: 900,
            });
            if (!retryCall.error) {
              const retryRow = Array.isArray(retryCall.data) ? retryCall.data[0] : retryCall.data;
              if (gameKey === "mystery_box") {
                console.warn("[solo-v2/create mystery_box] post_unique_conflict http_response_branch", {
                  branch: "201_created_after_retry",
                  sessionId: retryRow?.session_id ?? null,
                });
              }
              await seedHighLowCardsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedGoldRushDiggerSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedTreasureDoorsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedVaultDoorsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedCrystalPathSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedSpeedTrackSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedLimitRunSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedNumberHuntSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedCoreBreakerSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedFlashVeinSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedTripleDiceSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedChallenge21SessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedDropRunSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedMysteryChamberSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedDiamondsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef, gameOptions);
              await seedSoloLadderSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              return res.status(201).json({
                ok: true,
                category: "success",
                status: "created",
                session: {
                  id: retryRow?.session_id || null,
                  gameKey,
                  playerRef,
                  sessionMode,
                  entryAmount,
                  sessionStatus: retryRow?.session_status || "created",
                  expiresAt: retryRow?.expires_at || null,
                },
                authority: {
                  sessionTruth: "server",
                  outcomeTruth: "deferred",
                  rewardTruth: "deferred",
                },
              });
            }
            error = retryCall.error;
          } else {
            const retryAfterHealCall = await supabase.rpc("solo_v2_create_session", {
              p_player_ref: playerRef,
              p_game_key: gameKey,
              p_session_mode: sessionMode,
              p_entry_amount: entryAmount,
              p_client_nonce: clientNonce,
              p_integrity_token: null,
              p_idempotency_key: idempotencyKey,
              p_expires_in_seconds: 900,
            });
            if (!retryAfterHealCall.error) {
              const retryRow = Array.isArray(retryAfterHealCall.data) ? retryAfterHealCall.data[0] : retryAfterHealCall.data;
              if (gameKey === "mystery_box") {
                console.warn("[solo-v2/create mystery_box] post_unique_conflict http_response_branch", {
                  branch: "201_created_zero_active_after_heal",
                  sessionId: retryRow?.session_id ?? null,
                });
              }
              await seedHighLowCardsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedGoldRushDiggerSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedTreasureDoorsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedVaultDoorsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedCrystalPathSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedSpeedTrackSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedLimitRunSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedNumberHuntSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedCoreBreakerSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedFlashVeinSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedTripleDiceSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedChallenge21SessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedDropRunSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedMysteryChamberSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              await seedDiamondsSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef, gameOptions);
              await seedSoloLadderSessionOrWarn(supabase, gameKey, retryRow?.session_id, playerRef);
              return res.status(201).json({
                ok: true,
                category: "success",
                status: "created",
                session: {
                  id: retryRow?.session_id || null,
                  gameKey,
                  playerRef,
                  sessionMode,
                  entryAmount,
                  sessionStatus: retryRow?.session_status || "created",
                  expiresAt: retryRow?.expires_at || null,
                },
                authority: {
                  sessionTruth: "server",
                  outcomeTruth: "deferred",
                  rewardTruth: "deferred",
                },
              });
            }
            error = retryAfterHealCall.error;
          }
        } else if (isMissingTable(conflictLookup.error)) {
          logCreateBranch("pending_migration.post_conflict_recheck", {
            gameKey,
            code: conflictLookup.error?.code || null,
            message: conflictLookup.error?.message || null,
            details: conflictLookup.error?.details || null,
          });
          return sendCreate503(res, {
            branch: "CREATE_503_POST_CONFLICT_PENDING_MIGRATION",
            source: "readActiveSessionsForGame_after_unique_conflict_recheck",
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 session persistence is not migrated yet.",
            rawBodySnapshot,
            entryAmount,
            supabaseError: conflictLookup.error,
          });
        }
      }

      return sendCreate503(res, {
        branch: "CREATE_503_RPC_UNAVAILABLE_FALLBACK",
        source: "solo_v2_create_session_or_compat_still_failed_generic",
        category: "unavailable",
        status: "unavailable",
        message: "Create session is temporarily unavailable.",
        rawBodySnapshot,
        entryAmount,
        supabaseError: error,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    await seedHighLowCardsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedGoldRushDiggerSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedTreasureDoorsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedVaultDoorsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedCrystalPathSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedSpeedTrackSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedLimitRunSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedNumberHuntSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedCoreBreakerSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedFlashVeinSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedTripleDiceSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedChallenge21SessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedDropRunSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedMysteryChamberSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    await seedDiamondsSessionOrWarn(supabase, gameKey, row?.session_id, playerRef, gameOptions);
    await seedSoloLadderSessionOrWarn(supabase, gameKey, row?.session_id, playerRef);
    return res.status(201).json({
      ok: true,
      category: "success",
      status: "created",
      session: {
        id: row?.session_id || null,
        gameKey,
        playerRef,
        sessionMode,
        entryAmount,
        sessionStatus: row?.session_status || "created",
        expiresAt: row?.expires_at || null,
      },
      authority: {
        sessionTruth: "server",
        outcomeTruth: "deferred",
        rewardTruth: "deferred",
      },
    });
  } catch (error) {
    console.error("solo-v2/sessions/create failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Create session failed",
    });
  }
}
