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
      className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold transition ${
        isSelected
          ? "border-violet-300/45 bg-violet-500/30 text-white"
          : "border-white/20 bg-white/5 text-zinc-200 hover:bg-white/10"
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
    <div className="relative flex h-full min-h-0 flex-col px-3 pb-1 text-center">
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5">
          <div className="text-[10px] text-zinc-400">Vault</div>
          <div className="text-sm font-bold text-emerald-300">{formatCompact(vaultBalance)}</div>
        </div>
        <div className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5">
          <div className="text-[10px] text-zinc-400">Play</div>
          <div className="text-sm font-bold text-amber-300">{formatCompact(playAmount)}</div>
        </div>
        <div className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5">
          <div className="text-[10px] text-zinc-400">Win</div>
          <div className="text-sm font-bold text-lime-300">{formatCompact(potentialWin)}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div
          className={`mb-3 grid h-40 w-40 place-items-center rounded-full border border-amber-300/35 bg-gradient-to-br from-yellow-300/40 to-amber-700/50 text-7xl shadow-[0_0_35px_rgba(251,191,36,0.2)] transition-transform ${
            isFlipping ? "animate-spin" : ""
          }`}
          aria-hidden
        >
          🪙
        </div>

        <div className="grid w-full max-w-md grid-cols-2 gap-2">
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

      <div className="mb-2 grid w-full max-w-md grid-cols-4 gap-1.5">
        {BET_PRESETS.map(value => (
          <button
            key={value}
            type="button"
            disabled={!canEditPlay}
            onClick={() => onPresetAmount(value)}
            className={`min-h-[36px] rounded-md border text-xs font-bold ${
              playAmount === value
                ? "border-amber-300/60 bg-amber-500/35 text-black"
                : "border-white/20 bg-white/10 text-white"
            } ${!canEditPlay ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {value >= 1000 ? `${value / 1000}K` : value}
          </button>
        ))}
      </div>

      <div className="mb-2 flex w-full max-w-md items-center gap-1.5">
        <button
          type="button"
          onClick={onDecreaseAmount}
          disabled={!canEditPlay}
          className="h-9 w-9 rounded-md border border-white/20 bg-white/10 text-sm font-bold text-white disabled:opacity-50"
        >
          -
        </button>
        <input
          type="text"
          value={String(playAmount)}
          onChange={e => onAmountInput(e.target.value)}
          disabled={!canEditPlay}
          className="h-9 flex-1 rounded-md border border-white/20 bg-black/35 px-2 text-center text-sm font-bold text-white disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onResetAmount}
          disabled={!canEditPlay}
          className="h-9 w-9 rounded-md border border-red-300/30 bg-red-500/20 text-xs font-bold text-red-100 disabled:opacity-50"
          title="Reset"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={onIncreaseAmount}
          disabled={!canEditPlay}
          className="h-9 w-9 rounded-md border border-white/20 bg-white/10 text-sm font-bold text-white disabled:opacity-50"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={primaryActionDisabled || primaryActionLoading}
        className={`min-h-[52px] w-full max-w-md rounded-lg border px-4 py-3 text-base font-extrabold ${
          primaryActionDisabled || primaryActionLoading
            ? "cursor-not-allowed border-white/20 bg-white/10 text-zinc-300 opacity-70"
            : "border-emerald-300/45 bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg"
        }`}
      >
        {primaryActionLoading ? "FLIPPING..." : primaryActionLabel}
      </button>

      {sessionNotice ? (
        <div className="mt-1 max-w-md rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-zinc-200">
          {sessionNotice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-1 max-w-md rounded-lg border border-red-300/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-100">
          {errorMessage}
        </div>
      ) : null}

      {resultToast ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-8 z-20 w-[85%] max-w-sm -translate-x-1/2 rounded-xl border px-4 py-3 text-center text-sm font-bold shadow-xl ${
            resultToast.isWin
              ? "border-emerald-300/40 bg-emerald-600/85 text-white"
              : "border-red-300/35 bg-red-600/85 text-white"
          }`}
        >
          <div className="text-base">{resultToast.isWin ? "YOU WIN" : "YOU LOSE"}</div>
          <div className="text-lg">{resultToast.deltaLabel}</div>
          <div className="text-xs opacity-90">Result: {String(resultToast.outcome || "--").toUpperCase()}</div>
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
        setSessionNotice("Choose heads or tails, then flip.");
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
    setSessionNotice("Ready to flip.");
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
      balanceLabel="Vault"
      balanceValue={String(vaultBalance)}
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
