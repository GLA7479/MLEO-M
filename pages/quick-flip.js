import { useEffect, useRef, useState } from "react";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER, QUICK_FLIP_WIN_MULTIPLIER } from "../lib/solo-v2/quickFlipConfig";
import {
  applyQuickFlipSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";

const UI_STATE = {
  IDLE: "idle",
  LOADING: "loading",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  SESSION_CREATED: "session_created",
  CHOICE_SELECTED: "choice_selected",
  SUBMITTING_CHOICE: "submitting_choice",
  CHOICE_SUBMITTED: "choice_submitted",
  RESOLVING: "resolving",
  RESOLVED: "resolved",
  RESOLVE_FAILED: "resolve_failed",
};

const API_RESULT = {
  SUCCESS: "success",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  CONFLICT: "conflict",
  VALIDATION: "validation_error",
  ERROR: "error",
};

function classifyApiResult(response, payload) {
  const category = String(payload?.category || "");
  const status = String(payload?.status || "");
  if (response.ok) return API_RESULT.SUCCESS;
  if (category === "pending_migration") return API_RESULT.PENDING_MIGRATION;
  if (category === "unavailable") return API_RESULT.UNAVAILABLE;
  if (category === "conflict") return API_RESULT.CONFLICT;
  if (category === "validation_error") return API_RESULT.VALIDATION;
  if (status === "pending_migration") return API_RESULT.PENDING_MIGRATION;
  if (status === "unavailable" || status === "server_error") return API_RESULT.UNAVAILABLE;
  return API_RESULT.ERROR;
}

function buildApiErrorMessage(payload, fallback) {
  return String(payload?.message || "").trim() || fallback;
}

/** Dev-only START ROUND tracing (next dev). Prod: set localStorage solo_v2_qf_start_debug=1 to enable. */
function qfStartDebug(label, data) {
  const allowProd =
    typeof window !== "undefined" && window.localStorage?.getItem("solo_v2_qf_start_debug") === "1";
  if (process.env.NODE_ENV !== "development" && !allowProd) return;
  console.warn(`[QuickFlip handleStartSession] ${label}`, data);
}

function isEventRejectedStaleSessionMessage(message) {
  const m = String(message || "").toLowerCase();
  if (!m) return false;
  if (m.includes("session expired")) return true;
  if (m.includes("session is not writable")) return true;
  if (m.includes("ownership mismatch")) return true;
  if (m.includes("session not found")) return true;
  return false;
}

const STATS_KEY = "solo_v2_quick_flip_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;

/** Parsed numeric wager from the amount field (0 if empty/invalid). No minimum — playability is gated separately. */
function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function formatCompact(value) {
  const num = Number(value) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return String(Math.floor(num));
}

function readQuickFlipStats() {
  if (typeof window === "undefined") {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
      headsWins: 0,
      tailsWins: 0,
    };
  }
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    return {
      totalGames: Number(parsed.totalGames || 0),
      wins: Number(parsed.wins || 0),
      losses: Number(parsed.losses || 0),
      totalPlay: Number(parsed.totalPlay || 0),
      totalWon: Number(parsed.totalWon || 0),
      biggestWin: Number(parsed.biggestWin || 0),
      headsWins: Number(parsed.headsWins || 0),
      tailsWins: Number(parsed.tailsWins || 0),
    };
  } catch {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
      headsWins: 0,
      tailsWins: 0,
    };
  }
}

function writeQuickFlipStats(nextStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
  } catch {
    // ignore storage errors
  }
}

function ChoiceButton({ label, value, selectedChoice, disabled, onSelect }) {
  const isSelected = selectedChoice === value;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className={`min-h-[42px] rounded-lg border px-3 py-2 text-sm font-bold transition ${
        isSelected
          ? "border-amber-400/50 bg-amber-500/25 text-amber-50"
          : "border-white/25 bg-white/[0.06] text-zinc-100 hover:bg-white/12"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {label}
    </button>
  );
}

function QuickFlipPlaceholderPanel({
  session,
  uiState,
  vaultBalance,
  wagerInput,
  potentialWin,
  selectedChoice,
  isFlipping,
  resultToast,
  errorMessage,
  onPresetAmount,
  onDecreaseAmount,
  onIncreaseAmount,
  onAmountInput,
  onResetAmount,
  onSelectChoice,
  onPrimaryAction,
  primaryActionLabel,
  primaryActionDisabled,
  primaryActionLoading,
}) {
  const isChoiceLocked = uiState === UI_STATE.CHOICE_SUBMITTED;
  const canChoose =
    !isFlipping && uiState !== UI_STATE.LOADING && !isChoiceLocked;
  const canEditPlay = !isFlipping;
  const wagerNumeric = parseWagerInput(wagerInput);

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col px-2 pt-1 text-center sm:max-w-lg">
      <div className="mb-1.5 flex w-full shrink-0 flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-xs sm:text-[13px]">
        <span className="text-zinc-500">
          Vault <span className="font-semibold text-emerald-300/95">{formatCompact(vaultBalance)}</span>
        </span>
        <span className="text-zinc-600" aria-hidden>
          ·
        </span>
        <span className="text-zinc-500">
          Play <span className="font-semibold text-amber-200/90">{formatCompact(wagerNumeric)}</span>
        </span>
        <span className="text-zinc-600" aria-hidden>
          ·
        </span>
        <span className="text-zinc-500">
          Win <span className="font-semibold text-lime-200/90">{formatCompact(potentialWin)}</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-3 sm:py-5">
          <div
            className={`select-none text-8xl leading-none transition-transform sm:text-9xl ${
              isFlipping ? "animate-spin" : ""
            }`}
            aria-hidden
          >
            🪙
          </div>
        </div>

        <div className="w-full shrink-0 space-y-2.5 pb-2 sm:space-y-3 sm:pb-3">
          <div className="grid w-full grid-cols-2 gap-2">
            <ChoiceButton
              label="Heads"
              value="heads"
              selectedChoice={selectedChoice}
              disabled={!canChoose}
              onSelect={onSelectChoice}
            />
            <ChoiceButton
              label="Tails"
              value="tails"
              selectedChoice={selectedChoice}
              disabled={!canChoose}
              onSelect={onSelectChoice}
            />
          </div>

          <div className="flex h-9 w-full min-w-0 flex-nowrap items-stretch gap-1 sm:h-10 sm:gap-1.5">
            {BET_PRESETS.map(value => (
              <button
                key={value}
                type="button"
                disabled={!canEditPlay}
                onClick={() => onPresetAmount(value)}
                className={`min-h-0 min-w-0 flex-1 basis-0 rounded-md border px-1 py-1.5 text-[10px] font-bold leading-none sm:px-2 sm:text-xs ${
                  wagerNumeric === value
                    ? "border-amber-400/55 bg-amber-500/30 text-amber-50"
                    : "border-white/20 bg-white/[0.07] text-zinc-100"
                } ${!canEditPlay ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {value >= 1000 ? `${value / 1000}K` : String(value)}
              </button>
            ))}
            <button
              type="button"
              onClick={onDecreaseAmount}
              disabled={!canEditPlay}
              className="h-full w-9 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:w-10"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={wagerInput}
              onChange={e => onAmountInput(e.target.value)}
              disabled={!canEditPlay}
              className="h-full min-w-0 flex-[1.15] rounded-md border border-white/20 bg-black/40 px-1.5 text-center text-[11px] font-bold text-white disabled:opacity-50 sm:min-w-[4.5rem] sm:text-sm"
            />
            <button
              type="button"
              onClick={onResetAmount}
              disabled={!canEditPlay}
              className="h-full w-9 shrink-0 rounded-md border border-red-400/35 bg-red-500/15 text-[11px] font-bold text-red-100 disabled:opacity-50 sm:w-10"
              title="Reset"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={onIncreaseAmount}
              disabled={!canEditPlay}
              className="h-full w-9 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:w-10"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled || primaryActionLoading}
            className={`min-h-[48px] w-full rounded-lg border px-4 py-2.5 text-base font-extrabold tracking-wide ${
              primaryActionDisabled || primaryActionLoading
                ? "cursor-not-allowed border-white/20 bg-white/10 text-zinc-400 opacity-70"
                : "border-emerald-400/40 bg-gradient-to-r from-emerald-600 to-green-600 text-white"
            }`}
          >
            {primaryActionLoading ? "FLIPPING..." : primaryActionLabel}
          </button>

          {errorMessage ? (
            <p className="text-[11px] leading-snug text-red-300/95">{errorMessage}</p>
          ) : null}
        </div>
      </div>

      {resultToast ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-[10%] z-20 w-[88%] max-w-xs -translate-x-1/2 rounded-lg border px-3 py-2 text-center text-xs font-bold sm:top-[12%] ${
            resultToast.isWin
              ? "border-emerald-400/35 bg-emerald-700/90 text-white"
              : "border-red-400/35 bg-red-700/90 text-white"
          }`}
        >
          <div className="text-[13px]">{resultToast.isWin ? "YOU WIN" : "YOU LOSE"}</div>
          <div className="text-sm">{resultToast.deltaLabel}</div>
          <div className="mt-0.5 text-[10px] font-semibold opacity-90">
            {String(resultToast.outcome || "--").toUpperCase()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function QuickFlipPage() {
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [session, setSession] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [eventInfo, setEventInfo] = useState(null);
  const [resolvedResult, setResolvedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(QUICK_FLIP_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readQuickFlipStats);
  const [resultToast, setResultToast] = useState(null);
  const toastTimerRef = useRef(null);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const cycleRef = useRef(0);
  const sessionRef = useRef(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;
    readQuickFlipSharedVaultBalance().then(result => {
      if (!active) return;
      if (!result?.ok) {
        setVaultReady(false);
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(result?.message || "Shared vault unavailable.");
        return;
      }
      setVaultBalance(Number(result.balance || 0));
      setVaultReady(true);
    });

    const unsubscribe = subscribeQuickFlipSharedVault(snapshot => {
      if (!active) return;
      setVaultBalance(Number(snapshot?.balance || 0));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    writeQuickFlipStats(stats);
  }, [stats]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  /** Clears stale session/round state but keeps wager input so the user can try FLIP COIN again. */
  function recoverStaleRound(message) {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setSelectedChoice("");
    setEventInfo(null);
    setResolvedResult(null);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
    setErrorMessage(String(message || "").trim() || "This round is no longer valid. Choose side and press FLIP COIN.");
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const sessionId = resolvedResult?.sessionId || session?.id;
    const settlementSummary = resolvedResult?.settlementSummary;
    if (!sessionId || !settlementSummary) return;
    applyQuickFlipSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Number(settlementResult.nextBalance || 0);
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        return;
      }

      const delta = Number(settlementSummary.netDelta || 0);
      const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
      if (settlementResult.applied) {
        setSessionNotice(`Settled (${deltaLabel}). Vault: ${authoritativeBalance}.`);
        setStats(prev => {
          const entryCost = Number(settlementSummary.entryCost || QUICK_FLIP_CONFIG.entryCost);
          const payoutReturn = Number(settlementSummary.payoutReturn || 0);
          return {
            ...prev,
            totalGames: Number(prev.totalGames || 0) + 1,
            wins: Number(prev.wins || 0) + (resolvedResult?.isWin ? 1 : 0),
            losses: Number(prev.losses || 0) + (resolvedResult?.isWin ? 0 : 1),
            totalPlay: Number(prev.totalPlay || 0) + entryCost,
            totalWon: Number(prev.totalWon || 0) + payoutReturn,
            biggestWin: Math.max(Number(prev.biggestWin || 0), resolvedResult?.isWin ? payoutReturn : 0),
            headsWins:
              Number(prev.headsWins || 0) +
              (resolvedResult?.isWin && String(resolvedResult?.outcome || "") === "heads" ? 1 : 0),
            tailsWins:
              Number(prev.tailsWins || 0) +
              (resolvedResult?.isWin && String(resolvedResult?.outcome || "") === "tails" ? 1 : 0),
          };
        });
      } else {
        setSessionNotice(`Settlement already applied. Vault: ${authoritativeBalance}.`);
      }

      const toastDelta = Number(settlementSummary.netDelta || 0);
      const toastDeltaLabel = toastDelta >= 0 ? `+${toastDelta}` : `${toastDelta}`;
      setResultToast({
        isWin: Boolean(resolvedResult?.isWin),
        deltaLabel: toastDeltaLabel,
        outcome: resolvedResult?.outcome || null,
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setResultToast(null);
      }, 2600);
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id, uiState]);

  function hydrateResolvedFromSession(sessionPayload) {
    const summary = sessionPayload?.quickFlip?.resolvedResult || sessionPayload?.serverOutcomeSummary || {};
    if (sessionPayload?.sessionStatus !== "resolved") return null;
    return {
      sessionId: sessionPayload?.id || null,
      sessionStatus: sessionPayload?.sessionStatus || "resolved",
      choice: summary.choice || null,
      outcome: summary.outcome || null,
      isWin: Boolean(summary.isWin),
      resolvedAt: summary.resolvedAt || sessionPayload?.resolvedAt || null,
      settlementSummary: summary.settlementSummary || null,
    };
  }

  function applySessionReadState(sessionPayload, options = {}) {
    const { resumed = false, localChoiceToKeep = null } = options;
    setSession(sessionPayload);

    const readState = String(sessionPayload?.readState || "");
    const quickFlipChoice = sessionPayload?.quickFlip?.choice || null;
    const quickFlipChoiceEventId = sessionPayload?.quickFlip?.choiceEventId || null;
    const resolved = hydrateResolvedFromSession(sessionPayload);

    if (readState === "resolved" || resolved) {
      if (resolved) setResolvedResult(resolved);
      setEventInfo(null);
      setSelectedChoice("");
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Resumed already resolved session." : "Session already resolved on server.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_submitted") {
      setSelectedChoice(quickFlipChoice || "");
      setEventInfo({
        eventId: quickFlipChoiceEventId,
        eventType: "client_action",
      });
      setUiState(UI_STATE.CHOICE_SUBMITTED);
      setSessionNotice("Resumed session with submitted choice. Ready to resolve.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      if (localChoiceToKeep === "heads" || localChoiceToKeep === "tails") {
        setSelectedChoice(localChoiceToKeep);
      } else {
        setSelectedChoice("");
      }
      setEventInfo(null);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_CREATED);
      setSessionNotice(resumed ? "Resumed active session." : "Session ready.");
      setErrorMessage("");
      return;
    }

    if (
      readState === "invalid" ||
      sessionPayload?.sessionStatus === "expired" ||
      sessionPayload?.sessionStatus === "cancelled"
    ) {
      setSession(null);
      setSelectedChoice("");
      setEventInfo(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        sessionPayload?.sessionStatus === "expired"
          ? "Session expired. Choose side and press FLIP COIN."
          : "Session ended. Choose side and press FLIP COIN.",
      );
      return;
    }

    setUiState(UI_STATE.UNAVAILABLE);
    setErrorMessage("Session state is not resumable.");
  }

  async function readSessionTruth(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        "x-solo-v2-player": "quick-flip-client",
      },
    });

    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return { halted: true };
    const result = classifyApiResult(response, payload);

    if (result === API_RESULT.SUCCESS && payload?.session) {
      return { ok: true, session: payload.session, readStatus: String(payload?.status || "") };
    }
    if (result === API_RESULT.PENDING_MIGRATION) {
      return {
        ok: false,
        state: UI_STATE.PENDING_MIGRATION,
        message: buildApiErrorMessage(payload, "Migration is pending."),
      };
    }
    if (result === API_RESULT.UNAVAILABLE) {
      return {
        ok: false,
        state: UI_STATE.UNAVAILABLE,
        message: buildApiErrorMessage(payload, "Session read unavailable."),
      };
    }
    return {
      ok: false,
      state: UI_STATE.UNAVAILABLE,
      message: buildApiErrorMessage(payload, "Session read rejected."),
    };
  }

  /**
   * Create or resume a server session (authoritative). Preserves local pre-selected side via localChoiceToKeep on resume.
   * @returns {{ ok: true, session: object } | { ok: false }}
   */
  async function bootstrapQuickFlipSession(wager, activeCycle, localChoiceToKeep) {
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    setSession(null);
    setEventInfo(null);
    setResolvedResult(null);

    try {
      const response = await fetch("/api/solo-v2/sessions/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": "quick-flip-client",
        },
        body: JSON.stringify({
          gameKey: "quick_flip",
          sessionMode: "standard",
          entryAmount: wager,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      const result = classifyApiResult(response, payload);
      const status = String(payload?.status || "");

      qfStartDebug("fetch_done", {
        httpStatus: response.status,
        classify: result,
        apiStatus: status,
        sessionId: payload?.session?.id ?? null,
        rawPayload: payload,
      });

      if (result === API_RESULT.SUCCESS && status === "created" && payload?.session) {
        setSession(payload.session);
        setSessionNotice("");
        setErrorMessage("");
        setUiState(UI_STATE.SESSION_CREATED);
        qfStartDebug("branch_created", { sessionId: payload.session?.id });
        return { ok: true, session: payload.session };
      }

      if (result === API_RESULT.SUCCESS && status === "existing_session" && payload?.session) {
        setSession(payload.session);
        setSessionNotice("Resumed active round.");
        setUiState(UI_STATE.SESSION_CREATED);
        setErrorMessage("");

        const readResult = await readSessionTruth(payload.session.id, activeCycle);
        qfStartDebug("readSessionTruth_result", {
          halted: Boolean(readResult?.halted),
          ok: readResult?.ok,
          readState: readResult?.session?.readState,
        });
        if (readResult?.halted) return { ok: false };
        if (!readResult?.ok) {
          setSession(null);
          setSelectedChoice("");
          setEventInfo(null);
          setResolvedResult(null);
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }

        applySessionReadState(readResult.session, { resumed: true, localChoiceToKeep });
        qfStartDebug("after_applySessionReadState", { readState: String(readResult.session?.readState || "") });
        const rs = String(readResult.session?.readState || "");
        const st = String(readResult.session?.sessionStatus || "");
        if (rs === "invalid" || st === "expired" || st === "cancelled") {
          return { ok: false };
        }
        if (rs === "resolved" || st === "resolved") {
          return { ok: true, session: readResult.session, alreadyTerminal: true };
        }
        return { ok: true, session: readResult.session };
      }

      if (result === API_RESULT.PENDING_MIGRATION) {
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildApiErrorMessage(payload, "Migration is pending."));
        return { ok: false };
      }

      if (result === API_RESULT.UNAVAILABLE) {
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildApiErrorMessage(payload, "Session bootstrap unavailable."));
        return { ok: false };
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildApiErrorMessage(payload, "Session bootstrap rejected."));
      return { ok: false };
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return { ok: false };
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error while creating session.");
      return { ok: false };
    } finally {
      if (activeCycle === cycleRef.current) {
        createInFlightRef.current = false;
      }
    }
  }

  async function submitChoiceAndResolveFlow(sessionId, side, activeCycle) {
    if (!sessionId || (side !== "heads" && side !== "tails")) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_CHOICE);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": "quick-flip-client",
        },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: {
            gameKey: "quick_flip",
            action: "choice_submit",
            side,
          },
        }),
      });

      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const result = classifyApiResult(response, payload);
      const status = String(payload?.status || "");

      if (result === API_RESULT.SUCCESS && status === "accepted") {
        setEventInfo({
          eventId: payload?.event?.id || null,
          eventType: payload?.event?.eventType || "client_action",
        });
        setUiState(UI_STATE.CHOICE_SUBMITTED);
        if (payload?.idempotent) {
          setSessionNotice("Choice already accepted. Resolving...");
        } else {
          setSessionNotice("Flipping...");
        }
        await handleResolveSession({ sessionIdOverride: sessionId });
        return;
      }

      if (result === API_RESULT.PENDING_MIGRATION) {
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildApiErrorMessage(payload, "Migration is pending."));
        return;
      }

      if (result === API_RESULT.UNAVAILABLE) {
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildApiErrorMessage(payload, "Choice submission unavailable."));
        return;
      }

      if (result === API_RESULT.CONFLICT && status === "choice_already_submitted") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (!readResult?.ok) {
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return;
        }
        applySessionReadState(readResult.session, { resumed: true });
        if (String(readResult?.readStatus || "") === "choice_submitted") {
          setSessionNotice("A choice is already locked on server. Resolving locked choice.");
          await handleResolveSession({ sessionIdOverride: readResult.session.id });
        }
        return;
      }

      if (result === API_RESULT.CONFLICT && status === "invalid_session_state") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (readResult?.ok) {
          applySessionReadState(readResult.session, { resumed: true });
          if (String(readResult?.readStatus || "") === "choice_submitted") {
            setSessionNotice("Session already has submitted choice. Resolving now.");
            await handleResolveSession({ sessionIdOverride: readResult.session.id });
          }
          return;
        }
        recoverStaleRound(buildApiErrorMessage(payload, "Session no longer accepts choice submit."));
        return;
      }

      if (result === API_RESULT.CONFLICT && status === "event_rejected") {
        const msg = buildApiErrorMessage(payload, "");
        if (isEventRejectedStaleSessionMessage(msg)) {
          recoverStaleRound(msg || "Session expired. Choose side and press FLIP COIN.");
          return;
        }
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildApiErrorMessage(payload, "Choice submission rejected."));
        return;
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildApiErrorMessage(payload, "Choice submission rejected."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error while submitting choice.");
    } finally {
      if (activeCycle === cycleRef.current) {
        submitInFlightRef.current = false;
      }
    }
  }

  async function runOneClickRound() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    const side = selectedChoice;
    if (side !== "heads" && side !== "tails") return;
    const wager = parseWagerInput(wagerInput);
    if (wager < QUICK_FLIP_MIN_WAGER) return;
    if (vaultBalance < wager) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this round.`);
      return;
    }

    cycleRef.current += 1;
    const activeCycle = cycleRef.current;

    const cur = sessionRef.current;
    let sessionId = cur?.id;
    const status = cur?.sessionStatus;
    const needsBootstrap =
      !sessionId ||
      status === "resolved" ||
      [
        UI_STATE.RESOLVED,
        UI_STATE.IDLE,
        UI_STATE.UNAVAILABLE,
        UI_STATE.RESOLVE_FAILED,
        UI_STATE.PENDING_MIGRATION,
      ].includes(uiState);

    let readStateKnown = String(cur?.readState || "");

    if (needsBootstrap) {
      const boot = await bootstrapQuickFlipSession(wager, activeCycle, side);
      if (!boot.ok || activeCycle !== cycleRef.current) return;
      if (boot.alreadyTerminal) return;
      sessionId = boot.session?.id;
      readStateKnown = String(boot.session?.readState || "");
    }

    if (!sessionId || activeCycle !== cycleRef.current) return;

    if (readStateKnown === "choice_submitted") {
      await handleResolveSession({ sessionIdOverride: sessionId });
      return;
    }

    await submitChoiceAndResolveFlow(sessionId, side, activeCycle);
  }

  function handleSelectChoice(choice) {
    if (
      uiState === UI_STATE.LOADING ||
      uiState === UI_STATE.SUBMITTING_CHOICE ||
      uiState === UI_STATE.CHOICE_SUBMITTED ||
      uiState === UI_STATE.RESOLVING
    ) {
      return;
    }
    setSelectedChoice(choice);
    setErrorMessage("");
    setEventInfo(null);
    setResolvedResult(null);
    setSessionNotice("");
    if (session?.id && uiState !== UI_STATE.RESOLVED) {
      setUiState(UI_STATE.CHOICE_SELECTED);
    }
  }

  async function handleResolveSession(options = {}) {
    const { sessionIdOverride = null } = options;
    const targetSessionId = sessionIdOverride || session?.id;
    if (!targetSessionId) return;
    if (resolveInFlightRef.current || createInFlightRef.current) return;
    resolveInFlightRef.current = true;
    const activeCycle = cycleRef.current;
    setUiState(UI_STATE.RESOLVING);
    setErrorMessage("");

    try {
      const response = await fetch("/api/solo-v2/quick-flip/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": "quick-flip-client",
        },
        body: JSON.stringify({
          sessionId: targetSessionId,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const status = String(payload?.status || "");
      const result = classifyApiResult(response, payload);

      if (result === API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        setResolvedResult(payload.result);
        setEventInfo(null);
        setSession(previous =>
          previous
            ? {
                ...previous,
                sessionStatus: "resolved",
              }
            : previous,
        );
        setUiState(UI_STATE.RESOLVED);
        setSessionNotice(payload?.idempotent ? "Round already resolved." : "Round resolved.");
        return;
      }

      if (result === API_RESULT.PENDING_MIGRATION) {
        setResolvedResult(null);
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildApiErrorMessage(payload, "Migration is pending."));
        return;
      }

      setResolvedResult(null);
      setUiState(UI_STATE.RESOLVE_FAILED);
      setErrorMessage(buildApiErrorMessage(payload, "Resolve unavailable."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setResolvedResult(null);
      setUiState(UI_STATE.RESOLVE_FAILED);
      setErrorMessage("Network error while resolving outcome.");
    } finally {
      if (activeCycle === cycleRef.current) {
        resolveInFlightRef.current = false;
      }
    }
  }

  const numericWager = parseWagerInput(wagerInput);
  const hasValidSide = selectedChoice === "heads" || selectedChoice === "tails";
  const wagerPlayable =
    vaultReady && numericWager >= QUICK_FLIP_MIN_WAGER && vaultBalance >= numericWager;

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (
        /Session expired\. Press START ROUND|Session ended\. Press START ROUND|no longer valid\. Press START ROUND|Session expired\. Choose side and press FLIP COIN|Session ended\. Choose side and press FLIP COIN|no longer valid\. Choose side and press FLIP COIN/i.test(
          s,
        )
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const canFlipCoin =
    wagerPlayable &&
    hasValidSide &&
    ![
      UI_STATE.LOADING,
      UI_STATE.SUBMITTING_CHOICE,
      UI_STATE.CHOICE_SUBMITTED,
      UI_STATE.RESOLVING,
      UI_STATE.PENDING_MIGRATION,
    ].includes(uiState);

  const isPrimaryLoading =
    uiState === UI_STATE.LOADING || uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;

  const primaryActionLabel = hasValidSide ? "FLIP COIN" : "Choose Heads or Tails";

  function handlePresetClick(presetValue) {
    const v = Number(presetValue);
    if (!Number.isFinite(v) || !BET_PRESETS.includes(v)) return;
    const last = lastPresetAmountRef.current;
    if (last === v) {
      setWagerInput(prev => {
        const current = parseWagerInput(prev);
        return String(Math.min(MAX_WAGER, current + v));
      });
      return;
    }
    lastPresetAmountRef.current = v;
    setWagerInput(String(v));
  }

  function clearPresetChain() {
    lastPresetAmountRef.current = null;
  }

  function handlePrimaryCta() {
    if (canFlipCoin) {
      void runOneClickRound();
    }
  }

  return (
    <SoloV2GameShell
      title="Quick Flip"
      subtitle="Arcade Solo"
      menuVaultBalance={vaultBalance}
      hideStatusPanel
      onBack={() => {
        if (typeof window !== "undefined") window.location.href = "/arcade-v2";
      }}
      gameplaySlot={
        <QuickFlipPlaceholderPanel
          session={session}
          uiState={uiState}
          vaultBalance={vaultBalance}
          wagerInput={wagerInput}
          potentialWin={Math.floor(parseWagerInput(wagerInput) * QUICK_FLIP_WIN_MULTIPLIER)}
          selectedChoice={selectedChoice}
          isFlipping={uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING}
          resultToast={resultToast}
          errorMessage={errorMessage}
          onPresetAmount={handlePresetClick}
          onDecreaseAmount={() => {
            clearPresetChain();
            setWagerInput(prev => {
              const c = parseWagerInput(prev);
              const next = Math.min(MAX_WAGER, Math.max(0, c - QUICK_FLIP_MIN_WAGER));
              return String(next);
            });
          }}
          onIncreaseAmount={() => {
            clearPresetChain();
            setWagerInput(prev => {
              const c = parseWagerInput(prev);
              return String(Math.min(MAX_WAGER, c + 1000));
            });
          }}
          onAmountInput={raw => {
            clearPresetChain();
            setWagerInput(String(raw).replace(/\D/g, "").slice(0, 12));
          }}
          onResetAmount={() => {
            clearPresetChain();
            setWagerInput(String(QUICK_FLIP_MIN_WAGER));
          }}
          onSelectChoice={handleSelectChoice}
          onPrimaryAction={handlePrimaryCta}
          primaryActionLabel={primaryActionLabel}
          primaryActionDisabled={!canFlipCoin}
          primaryActionLoading={isPrimaryLoading}
        />
      }
      primaryActionLabel=""
      secondaryActionLabel=""
      primaryDisabled
      secondaryDisabled={false}
      primaryLoading={false}
      showSecondary={false}
      onPrimaryAction={() => {}}
      onSecondaryAction={() => {
        if (typeof window !== "undefined") window.location.href = "/arcade-v2";
      }}
      helpContent={
        <div className="space-y-2">
          <p>1. Choose Heads or Tails.</p>
          <p>2. Set your play amount and press FLIP COIN.</p>
          <p>3. If your side matches the result, you win.</p>
          <p>Win ratio is x1.92 per round in this release.</p>
          <p>Result is server-resolved before vault settlement is applied.</p>
        </div>
      }
      statsContent={
        <div className="space-y-2">
          <p>Total games: {stats.totalGames}</p>
          <p>Win rate: {stats.totalGames ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : "0.0"}%</p>
          <p>Total play: {formatCompact(stats.totalPlay)}</p>
          <p>Total won: {formatCompact(stats.totalWon)}</p>
          <p>Biggest win: {formatCompact(stats.biggestWin)}</p>
          <p>Net profit: {formatCompact(stats.totalWon - stats.totalPlay)}</p>
          <p>Heads wins: {stats.headsWins} | Tails wins: {stats.tailsWins}</p>
        </div>
      }
      resultState={null}
      hideActionBar
    />
  );
}
