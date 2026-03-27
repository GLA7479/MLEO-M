import { useEffect, useRef, useState } from "react";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
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

const STATS_KEY = "solo_v2_quick_flip_stats_v1";
const BET_PRESETS = [100, 1000, 10000, 100000];

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
  uiState,
  vaultBalance,
  playAmount,
  potentialWin,
  selectedChoice,
  isFlipping,
  resultToast,
  sessionNotice,
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
  const canChoose = !isFlipping;
  const canEditPlay = !isFlipping;

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col px-1 pb-1 pt-0 text-center sm:max-w-lg">
      <div className="mb-1.5 flex w-full shrink-0 items-center justify-center gap-x-3 gap-y-0.5 text-[11px] sm:text-xs">
        <span className="text-zinc-500">
          Vault <span className="font-semibold text-emerald-300/95">{formatCompact(vaultBalance)}</span>
        </span>
        <span className="text-zinc-700" aria-hidden>
          ·
        </span>
        <span className="text-zinc-500">
          Play <span className="font-semibold text-amber-200/90">{formatCompact(playAmount)}</span>
        </span>
        <span className="text-zinc-700" aria-hidden>
          ·
        </span>
        <span className="text-zinc-500">
          Win <span className="font-semibold text-lime-200/90">{formatCompact(potentialWin)}</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-1">
        <div
          className={`mb-2 grid h-[10.5rem] w-[10.5rem] place-items-center rounded-full border-2 border-amber-400/35 bg-amber-950/30 text-8xl transition-transform sm:h-52 sm:w-52 sm:text-9xl ${
            isFlipping ? "animate-spin" : ""
          }`}
          aria-hidden
        >
          🪙
        </div>

        <div className="grid w-full max-w-xs grid-cols-2 gap-1.5 sm:max-w-sm">
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
      </div>

      <div className="mt-1 shrink-0 rounded-md bg-white/[0.03] px-1 py-1 sm:px-1.5">
        <div className="flex w-full flex-nowrap items-stretch gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {BET_PRESETS.map(value => (
            <button
              key={value}
              type="button"
              disabled={!canEditPlay}
              onClick={() => onPresetAmount(value)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold leading-none sm:px-2.5 sm:text-xs ${
                playAmount === value
                  ? "border-amber-400/55 bg-amber-500/30 text-amber-50"
                  : "border-white/20 bg-white/[0.07] text-zinc-100"
              } ${!canEditPlay ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {value >= 1000 ? `${value / 1000}K` : value}
            </button>
          ))}
          <button
            type="button"
            onClick={onDecreaseAmount}
            disabled={!canEditPlay}
            className="h-8 w-8 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:h-9 sm:w-9"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={String(playAmount)}
            onChange={e => onAmountInput(e.target.value)}
            disabled={!canEditPlay}
            className="h-8 min-w-[4.25rem] max-w-[5.5rem] shrink-0 rounded-md border border-white/20 bg-black/40 px-1 text-center text-[11px] font-bold text-white disabled:opacity-50 sm:h-9 sm:min-w-[5rem] sm:text-sm"
          />
          <button
            type="button"
            onClick={onResetAmount}
            disabled={!canEditPlay}
            className="h-8 w-8 shrink-0 rounded-md border border-red-400/35 bg-red-500/15 text-[11px] font-bold text-red-100 disabled:opacity-50 sm:h-9 sm:w-9"
            title="Reset"
          >
            ↺
          </button>
          <button
            type="button"
            onClick={onIncreaseAmount}
            disabled={!canEditPlay}
            className="h-8 w-8 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:h-9 sm:w-9"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={primaryActionDisabled || primaryActionLoading}
        className={`mt-2 min-h-[48px] w-full shrink-0 rounded-lg border px-4 py-2.5 text-base font-extrabold tracking-wide ${
          primaryActionDisabled || primaryActionLoading
            ? "cursor-not-allowed border-white/20 bg-white/10 text-zinc-400 opacity-70"
            : "border-emerald-400/40 bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md shadow-emerald-900/30"
        }`}
      >
        {primaryActionLoading ? "FLIPPING..." : primaryActionLabel}
      </button>

      {sessionNotice ? (
        <p className="mt-1.5 px-1 text-[11px] leading-snug text-zinc-400">{sessionNotice}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-1.5 px-1 text-[11px] leading-snug text-red-300/95">{errorMessage}</p>
      ) : null}

      {resultToast ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-[10%] z-20 w-[88%] max-w-xs -translate-x-1/2 rounded-lg border px-3 py-2 text-center text-xs font-bold shadow-lg sm:top-[12%] ${
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
  const [sessionNotice, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [playAmount, setPlayAmount] = useState(100);
  const [stats, setStats] = useState(readQuickFlipStats);
  const [resultToast, setResultToast] = useState(null);
  const toastTimerRef = useRef(null);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const cycleRef = useRef(0);

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

  function resetForNewAttempt() {
    cycleRef.current += 1;
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setUiState(UI_STATE.IDLE);
    setSession(null);
    setSelectedChoice("");
    setEventInfo(null);
    setResolvedResult(null);
    setSessionNotice("");
    setErrorMessage("");
    setResultToast(null);
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
    const { resumed = false } = options;
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
      setSelectedChoice("");
      setEventInfo(null);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_CREATED);
      setSessionNotice(resumed ? "Resumed active session." : "Session ready.");
      setErrorMessage("");
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

  async function handleStartSession() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      setSessionNotice("");
      return;
    }
    if (vaultBalance < QUICK_FLIP_CONFIG.entryCost) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(`Insufficient vault balance. Need ${QUICK_FLIP_CONFIG.entryCost} to start.`);
      setSessionNotice("");
      return;
    }
    createInFlightRef.current = true;
    cycleRef.current += 1;
    const activeCycle = cycleRef.current;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    setSession(null);
    setSelectedChoice("");
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
          entryAmount: 0,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const result = classifyApiResult(response, payload);
      const status = String(payload?.status || "");

      if (result === API_RESULT.SUCCESS && status === "created" && payload?.session) {
        setSession(payload.session);
        setSessionNotice("");
        setUiState(UI_STATE.SESSION_CREATED);
        return;
      }

      if (result === API_RESULT.SUCCESS && status === "existing_session" && payload?.session) {
        setSession(payload.session);
        setSessionNotice("Resumed active round.");
        setUiState(UI_STATE.SESSION_CREATED);

        const readResult = await readSessionTruth(payload.session.id, activeCycle);
        if (readResult?.halted) return;
        if (!readResult?.ok) {
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return;
        }
        applySessionReadState(readResult.session, { resumed: true });
        return;
      }

      if (result === API_RESULT.PENDING_MIGRATION) {
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildApiErrorMessage(payload, "Migration is pending."));
        return;
      }

      if (result === API_RESULT.UNAVAILABLE) {
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildApiErrorMessage(payload, "Session bootstrap unavailable."));
        return;
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildApiErrorMessage(payload, "Session bootstrap rejected."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error while creating session.");
    } finally {
      if (activeCycle === cycleRef.current) {
        createInFlightRef.current = false;
      }
    }
  }

  function handleSelectChoice(choice) {
    if (!session?.id) return;
    if (
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
    setUiState(UI_STATE.CHOICE_SELECTED);
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

  async function handleSubmitChoice() {
    if (!session?.id || !selectedChoice) return;
    if (submitInFlightRef.current || createInFlightRef.current || resolveInFlightRef.current) return;
    if (uiState === UI_STATE.CHOICE_SUBMITTED || uiState === UI_STATE.RESOLVING || uiState === UI_STATE.RESOLVED) return;

    submitInFlightRef.current = true;
    const activeCycle = cycleRef.current;
    setUiState(UI_STATE.SUBMITTING_CHOICE);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/solo-v2/sessions/${session.id}/event`, {
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
            side: selectedChoice,
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
        await handleResolveSession();
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
        const readResult = await readSessionTruth(session.id, activeCycle);
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
        const readResult = await readSessionTruth(session.id, activeCycle);
        if (readResult?.halted) return;
        if (readResult?.ok) {
          applySessionReadState(readResult.session, { resumed: true });
          if (String(readResult?.readStatus || "") === "choice_submitted") {
            setSessionNotice("Session already has submitted choice. Resolving now.");
            await handleResolveSession({ sessionIdOverride: readResult.session.id });
          }
          return;
        }
        setUiState(UI_STATE.RESOLVE_FAILED);
        setErrorMessage(buildApiErrorMessage(payload, "Session no longer accepts choice submit."));
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

  const canStartSession =
    [
      UI_STATE.IDLE,
      UI_STATE.UNAVAILABLE,
      UI_STATE.PENDING_MIGRATION,
      UI_STATE.RESOLVE_FAILED,
      UI_STATE.RESOLVED,
    ].includes(uiState) &&
    !createInFlightRef.current &&
    !submitInFlightRef.current &&
    !resolveInFlightRef.current &&
    vaultReady &&
    vaultBalance >= QUICK_FLIP_CONFIG.entryCost;

  const canFlipNow =
    Boolean(session?.id) &&
    Boolean(selectedChoice) &&
    !submitInFlightRef.current &&
    !resolveInFlightRef.current &&
    !createInFlightRef.current &&
    ![UI_STATE.RESOLVED, UI_STATE.LOADING, UI_STATE.SUBMITTING_CHOICE, UI_STATE.RESOLVING].includes(uiState);

  const isPrimaryLoading =
    uiState === UI_STATE.LOADING || uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;

  const primaryActionLabel = canFlipNow ? "FLIP COIN" : canStartSession ? "START ROUND" : "FLIP COIN";

  function clampPlayAmount(value) {
    const parsed = Math.floor(Number(value) || 0);
    return Math.max(100, parsed);
  }

  function handlePrimaryCta() {
    if (canFlipNow) {
      handleSubmitChoice();
      return;
    }
    if (canStartSession) {
      handleStartSession();
      return;
    }
    if ([UI_STATE.RESOLVED, UI_STATE.RESOLVE_FAILED, UI_STATE.UNAVAILABLE, UI_STATE.PENDING_MIGRATION].includes(uiState)) {
      resetForNewAttempt();
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
          uiState={uiState}
          vaultBalance={vaultBalance}
          playAmount={playAmount}
          potentialWin={Math.floor(playAmount * 1.92)}
          selectedChoice={selectedChoice}
          isFlipping={uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING}
          resultToast={resultToast}
          sessionNotice={sessionNotice}
          errorMessage={errorMessage}
          onPresetAmount={value => setPlayAmount(value)}
          onDecreaseAmount={() => setPlayAmount(current => clampPlayAmount(current - 100))}
          onIncreaseAmount={() => setPlayAmount(current => clampPlayAmount(current + 1000))}
          onAmountInput={raw => setPlayAmount(clampPlayAmount(String(raw).replace(/[^0-9]/g, "")))}
          onResetAmount={() => setPlayAmount(100)}
          onSelectChoice={handleSelectChoice}
          onPrimaryAction={handlePrimaryCta}
          primaryActionLabel={primaryActionLabel}
          primaryActionDisabled={!canFlipNow && !canStartSession}
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
