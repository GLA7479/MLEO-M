import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildMysteryChamberSettlementSummary,
  MYSTERY_CHAMBER_CHAMBER_COUNT,
  MYSTERY_CHAMBER_MIN_WAGER,
  MYSTERY_CHAMBER_SIGIL_COUNT,
} from "../mysteryChamberConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeMysteryChamberSigil(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= MYSTERY_CHAMBER_SIGIL_COUNT) return null;
  return n;
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= MYSTERY_CHAMBER_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseMysteryChamberActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "mystery_chamber_active") return null;
  const safeSigils = Array.isArray(s.safeSigils) ? s.safeSigils.map(x => Math.floor(Number(x))) : [];
  if (safeSigils.length !== MYSTERY_CHAMBER_CHAMBER_COUNT) return null;
  if (safeSigils.some(x => !Number.isFinite(x) || x < 0 || x >= MYSTERY_CHAMBER_SIGIL_COUNT)) return null;

  const currentChamberIndex = Math.max(0, Math.floor(Number(s.currentChamberIndex) || 0));
  const chambersCleared = Math.max(0, Math.floor(Number(s.chambersCleared) || 0));
  const securedReturn = Math.max(0, Math.floor(Number(s.securedReturn) || 0));
  const lastProcessedPickEventId = Math.max(0, Math.floor(Number(s.lastProcessedPickEventId) || 0));
  const sigilHistory = Array.isArray(s.sigilHistory) ? s.sigilHistory : [];

  return {
    chamberCount: MYSTERY_CHAMBER_CHAMBER_COUNT,
    sigilCount: MYSTERY_CHAMBER_SIGIL_COUNT,
    safeSigils,
    currentChamberIndex,
    chambersCleared,
    securedReturn,
    lastProcessedPickEventId,
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
    sigilHistory,
  };
}

/** Remove secret layout from summaries returned to the client while the run is active. */
export function stripMysteryChamberSecretsFromSummary(summary) {
  const s = summary && typeof summary === "object" ? summary : {};
  if (s.phase !== "mystery_chamber_active") return summary;
  const next = { ...s };
  delete next.safeSigils;
  return next;
}

async function readMysteryChamberPickEventsAfter(supabase, sessionId, minIdExclusive) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .gt("id", minIdExclusive)
    .order("id", { ascending: true })
    .limit(80);

  if (query.error) return { ok: false, error: query.error };
  const rows = Array.isArray(query.data) ? query.data : [];
  const picks = rows.filter(
    r =>
      String(r?.event_payload?.action || "") === "mystery_chamber_pick" &&
      String(r?.event_payload?.gameKey || "") === "mystery_chamber",
  );
  return { ok: true, rows: picks };
}

function buildPlayingPayload(active, entryCost) {
  return {
    chamberCount: active.chamberCount,
    sigilCount: active.sigilCount,
    currentChamberIndex: active.currentChamberIndex,
    chambersCleared: active.chambersCleared,
    securedReturn: active.securedReturn,
    entryAmount: entryCost,
    lastTurn: active.lastTurn,
    sigilHistory: active.sigilHistory,
  };
}

export async function buildMysteryChamberSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "mystery_chamber") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_mystery_chamber",
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
    const terminalKind =
      summary.terminalKind === "cashout"
        ? "cashout"
        : summary.terminalKind === "full_clear"
          ? "full_clear"
          : "fail";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildMysteryChamberSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "mystery_chamber",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "fail" && payoutReturn > 0,
          chambersCleared: Math.max(0, Math.floor(Number(summary.chambersCleared) || 0)),
          finalChamberIndex:
            summary.finalChamberIndex != null ? Math.floor(Number(summary.finalChamberIndex)) : null,
          lastChosenSigil:
            summary.lastChosenSigil != null ? Math.floor(Number(summary.lastChosenSigil)) : null,
          safeSigilRevealed:
            summary.safeSigilRevealed != null ? Math.floor(Number(summary.safeSigilRevealed)) : null,
          safeSigils: Array.isArray(summary.safeSigils) ? summary.safeSigils.map(x => Math.floor(Number(x))) : null,
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
        gameKey: "mystery_chamber",
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
          gameKey: "mystery_chamber",
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

  const active = parseMysteryChamberActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "mystery_chamber",
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

  const pickRead = await readMysteryChamberPickEventsAfter(supabase, sessionRow.id, active.lastProcessedPickEventId);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const sigils = new Set();
  for (const r of pickRead.rows) {
    const si = normalizeMysteryChamberSigil(r?.event_payload?.sigilIndex);
    if (si !== null) sigils.add(si);
  }

  const pickConflict = sigils.size > 1;
  let pendingPick = null;

  if (!pickConflict && sigils.size === 1) {
    const last = pickRead.rows[pickRead.rows.length - 1];
    const sigilIndex = normalizeMysteryChamberSigil(last?.event_payload?.sigilIndex);
    const eid = last?.id != null ? Number(last.id) : null;
    if (sigilIndex !== null && Number.isFinite(eid) && eid > 0) {
      pendingPick = {
        sigilIndex,
        pickEventId: eid,
        pickSubmittedAt: last?.created_at || null,
      };
    }
  }

  const playing = buildPlayingPayload(active, entryCost);
  const canCashOut =
    active.chambersCleared >= 1 && !pendingPick && !pickConflict && active.currentChamberIndex < MYSTERY_CHAMBER_CHAMBER_COUNT;

  const readState = pickConflict ? "pick_conflict" : pendingPick ? "choice_submitted" : "choice_required";

  return {
    ok: true,
    snapshot: {
      gameKey: "mystery_chamber",
      readState,
      canResolveTurn: Boolean(pendingPick) && !pickConflict,
      canCashOut,
      playing,
      pendingPick,
      pickConflict,
      resolvedResult: null,
    },
  };
}
