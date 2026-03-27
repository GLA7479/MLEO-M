import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseCreateSessionPayload, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { getSoloV2GameByKey } from "../../../../lib/solo-v2/server/gameCatalog";
import { QUICK_FLIP_MIN_WAGER } from "../../../../lib/solo-v2/quickFlipConfig";
import { buildQuickFlipSessionSnapshot } from "../../../../lib/solo-v2/server/quickFlipSnapshot";

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
 * Must match DB partial unique index uq_solo_v2_quick_flip_one_active_per_player
 * (game_key quick_flip + created/in_progress). Do not filter by expires_at here:
 * a time-expired row can still be created/in_progress in DB and would block RPC with 23505
 * while an expiry-only precheck would see "no row" and wrongly attempt insert → 503 fallback.
 */
const QUICK_FLIP_ACTIVE_SESSION_FETCH_CAP = 40;

async function readActiveQuickFlipSessions(supabase, playerRef) {
  const unresolvedStatuses = [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS];
  const lookup = await supabase
    .from("solo_v2_sessions")
    .select("id,session_status,session_mode,entry_amount,expires_at")
    .eq("player_ref", playerRef)
    .eq("game_key", "quick_flip")
    .in("session_status", unresolvedStatuses)
    .order("created_at", { ascending: false })
    .limit(QUICK_FLIP_ACTIVE_SESSION_FETCH_CAP);

  if (lookup.error) {
    logCreateBranch("readActiveQuickFlipSessions.query_failed", {
      code: lookup.error?.code ?? null,
      message: lookup.error?.message ?? null,
      details: lookup.error?.details ?? null,
      hint: lookup.error?.hint ?? null,
    });
    return { ok: false, error: lookup.error };
  }

  return { ok: true, rows: (lookup.data || []).slice(0, 2) };
}

async function fetchQuickFlipSessionRowForSnapshot(supabase, sessionId, playerRef) {
  const { data, error } = await supabase
    .from("solo_v2_sessions")
    .select(
      "id,game_key,player_ref,session_status,session_mode,entry_amount,reward_amount,net_amount,server_outcome_summary,created_at,updated_at,expires_at,resolved_at",
    )
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "quick_flip")
    .single();

  if (error || !data) return { ok: false, error: error || new Error("session row not found") };
  return { ok: true, row: data };
}

/** Align create with GET/readSessionTruth: only return existing_session when snapshot is playable. */
async function quickFlipActiveRowPlayableOrExpire(supabase, existingSummary, playerRef) {
  const fetched = await fetchQuickFlipSessionRowForSnapshot(supabase, existingSummary.id, playerRef);
  if (!fetched.ok) {
    return { ok: false, kind: "fetch_row", error: fetched.error };
  }

  const snap = await buildQuickFlipSessionSnapshot(supabase, fetched.row);
  if (!snap.ok) {
    return { ok: false, kind: "snapshot", error: snap.error };
  }

  const rs = snap.snapshot.readState;
  if (rs === "choice_required" || rs === "choice_submitted") {
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

  logCreateBranch("quick_flip_stale_row_expired_for_create", {
    sessionId: existingSummary.id,
    readState: rs,
    reason: "snapshot_not_playable_same_rules_as_read_api",
  });
  return { ok: true, playable: false };
}

function createExistingSessionResponse(existing, playerRef) {
  return {
    ok: true,
    category: "success",
    status: "existing_session",
    session: {
      id: existing.id,
      gameKey: "quick_flip",
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

async function ensureQuickFlipCatalogRow(supabase) {
  const game = getSoloV2GameByKey("quick_flip");
  if (!game) return { ok: false, reason: "missing_registry_game" };

  const upsert = await supabase.from("solo_v2_games").upsert(
    {
      game_key: "quick_flip",
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
  const { gameKey, sessionMode, entryAmount, clientNonce, idempotencyKey } = parsed.value;

  try {
    const supabase = getSupabaseAdmin();

    if (gameKey === "quick_flip") {
      if (!Number.isFinite(entryAmount) || entryAmount < QUICK_FLIP_MIN_WAGER) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_entry_amount",
          message: `entryAmount must be at least ${QUICK_FLIP_MIN_WAGER}`,
        });
      }

      const existingLookup = await readActiveQuickFlipSessions(supabase, playerRef);
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
            branch: "CREATE_503_QF_PRECHECK_PENDING_MIGRATION",
            source: "readActiveQuickFlipSessions_precheck_pending_migration_detection",
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 session persistence is not migrated yet.",
            rawBodySnapshot,
            entryAmount,
            supabaseError: err,
          });
        }
        return sendCreate503(res, {
          branch: "CREATE_503_QF_PRECHECK_UNAVAILABLE",
          source: "readActiveQuickFlipSessions_precheck_generic_supabase_error",
          category: "unavailable",
          status: "unavailable",
          message: "Create session is temporarily unavailable.",
          rawBodySnapshot,
          entryAmount,
          supabaseError: err,
        });
      }

      const existingRows = existingLookup.rows;
      if (existingRows.length > 1) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "conflict_active_sessions",
          message: "Multiple active quick_flip sessions exist for this player.",
        });
      }

      const existing = existingRows[0];
      if (existing) {
        const playable = await quickFlipActiveRowPlayableOrExpire(supabase, existing, playerRef);
        if (!playable.ok) {
          return sendCreate503(res, {
            branch: "CREATE_503_QF_EXISTING_CLASSIFY_FAILED",
            source: "quickFlipActiveRowPlayableOrExpire_precheck",
            category: "unavailable",
            status: "unavailable",
            message: "Create session is temporarily unavailable.",
            rawBodySnapshot,
            entryAmount,
            supabaseError: playable.error,
          });
        }
        if (playable.playable) {
          return res.status(200).json(createExistingSessionResponse(existing, playerRef));
        }
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

    if (error && gameKey === "quick_flip" && isGameNotEnabled(error)) {
      console.warn("solo-v2 create: quick_flip missing/disabled in solo_v2_games, attempting catalog bootstrap");
      const catalogFix = await ensureQuickFlipCatalogRow(supabase);
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
        console.error("solo-v2 create: quick_flip catalog bootstrap failed", {
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

      if (gameKey === "quick_flip" && isLegacyDeviceIdNotNullError(error)) {
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

      if (gameKey === "quick_flip" && isUniqueConflict(error)) {
        const conflictLookup = await readActiveQuickFlipSessions(supabase, playerRef);
        if (conflictLookup.ok) {
          if (conflictLookup.rows.length > 1) {
            return res.status(409).json({
              ok: false,
              category: "conflict",
              status: "conflict_active_sessions",
              message: "Multiple active quick_flip sessions exist for this player.",
            });
          }
          if (conflictLookup.rows[0]) {
            const row0 = conflictLookup.rows[0];
            const playable = await quickFlipActiveRowPlayableOrExpire(supabase, row0, playerRef);
            if (!playable.ok) {
              return sendCreate503(res, {
                branch: "CREATE_503_QF_CONFLICT_CLASSIFY_FAILED",
                source: "quickFlipActiveRowPlayableOrExpire_post_unique",
                category: "unavailable",
                status: "unavailable",
                message: "Create session is temporarily unavailable.",
                rawBodySnapshot,
                entryAmount,
                supabaseError: playable.error,
              });
            }
            if (playable.playable) {
              return res.status(200).json(createExistingSessionResponse(row0, playerRef));
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
            source: "readActiveQuickFlipSessions_after_unique_conflict_recheck",
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
