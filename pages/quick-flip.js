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
  session,
  selectedChoice,
  eventInfo,
  resolvedResult,
  sessionNotice,
  errorMessage,
  onSelectChoice,
  onSubmitChoice,
  onStartNewSession,
}) {
  const sessionStatusLabel = resolvedResult?.sessionStatus || (uiState === UI_STATE.RESOLVED ? "resolved" : session?.sessionStatus || "created");
  const isBusy = uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;
  const isLocked = uiState === UI_STATE.CHOICE_SUBMITTED || uiState === UI_STATE.RESOLVED;
  const canChoose = Boolean(session?.id) && !isBusy && !isLocked;
  const canSubmit = Boolean(session?.id) && Boolean(selectedChoice) && !isBusy && !isLocked;
  const canRestart = [
    UI_STATE.RESOLVED,
    UI_STATE.RESOLVE_FAILED,
    UI_STATE.UNAVAILABLE,
    UI_STATE.PENDING_MIGRATION,
  ].includes(uiState);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-3 text-center">
      <div className="text-6xl leading-none" aria-hidden>
        🪙
      </div>
      <h2 className="text-lg font-bold text-white">Quick Flip</h2>
      {session ? (
        <div className="w-full max-w-sm space-y-2 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-3 py-3 text-left text-xs text-emerald-100">
          <p className="font-semibold">Session: {sessionStatusLabel}</p>
          <p>ID: {session.id || "--"}</p>
        </div>
      ) : (
        <p className="max-w-sm text-sm text-zinc-300">Pick a side and let the server resolve the outcome.</p>
      )}
      <div className="grid w-full max-w-sm grid-cols-2 gap-2">
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
      <button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmitChoice}
        className={`min-h-[44px] w-full max-w-sm rounded-lg border px-3 py-2 text-sm font-semibold ${
          canSubmit
            ? "border-violet-300/45 bg-violet-500/30 text-white"
            : "cursor-not-allowed border-white/20 bg-white/5 text-zinc-300 opacity-70"
        }`}
      >
        {uiState === UI_STATE.SUBMITTING_CHOICE
          ? "Submitting..."
          : uiState === UI_STATE.RESOLVING
            ? "Resolving..."
            : "Submit Choice"}
      </button>
      {eventInfo?.eventId ? (
        <div className="w-full max-w-sm rounded-lg border border-blue-300/25 bg-blue-500/10 px-3 py-2 text-left text-xs text-blue-100">
          <p className="font-semibold">Choice submitted to server.</p>
          <p className="text-blue-100/90">Waiting for server result.</p>
        </div>
      ) : null}
      {resolvedResult ? (
        <div className="w-full max-w-sm rounded-lg border border-violet-300/25 bg-violet-500/10 px-3 py-2 text-left text-xs text-violet-100">
          <p className="font-semibold">Server outcome resolved.</p>
          <p>Choice: {String(resolvedResult.choice || "--")}</p>
          <p>Outcome: {String(resolvedResult.outcome || "--")}</p>
          <p>Result: {resolvedResult.isWin ? "Match" : "No match"}</p>
        </div>
      ) : null}
      {sessionNotice ? (
        <div className="max-w-sm rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-zinc-200">
          {sessionNotice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="max-w-sm rounded-lg border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {errorMessage}
        </div>
      ) : null}
      {canRestart ? (
        <button
          type="button"
          onClick={onStartNewSession}
          disabled={isBusy}
          className={`min-h-[44px] w-full max-w-sm rounded-lg border px-3 py-2 text-sm font-semibold ${
            isBusy
              ? "cursor-not-allowed border-white/20 bg-white/5 text-zinc-300 opacity-70"
              : "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
          }`}
        >
          Start New Session
        </button>
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
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const sessionId = resolvedResult?.sessionId || session?.id;
    const settlementSummary = resolvedResult?.settlementSummary;
    if (!sessionId || !settlementSummary) return;
    applyQuickFlipSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      setVaultBalance(settlementResult.nextBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        return;
      }

      const delta = Number(settlementSummary.netDelta || 0);
      const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
      if (settlementResult.applied) {
        setSessionNotice(`Settled (${deltaLabel}). Vault: ${settlementResult.nextBalance}.`);
      } else {
        setSessionNotice(`Settlement already applied. Vault: ${settlementResult.nextBalance}.`);
      }
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
        setSessionNotice("New session created on server.");
        setUiState(UI_STATE.SESSION_CREATED);
        return;
      }

      if (result === API_RESULT.SUCCESS && status === "existing_session" && payload?.session) {
        setSession(payload.session);
        setSessionNotice("Resumed existing active session.");
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
    setSessionNotice("Choice selected. Submit when ready.");
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
        setSession(previous =>
          previous
            ? {
                ...previous,
                sessionStatus: "resolved",
              }
            : previous,
        );
        setUiState(UI_STATE.RESOLVED);
        setSessionNotice(payload?.idempotent ? "Server returned existing resolved result." : "Server resolved this session.");
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
          setSessionNotice("Same choice was already accepted. Continuing to resolve.");
        } else {
          setSessionNotice("Choice accepted by server. Resolving outcome.");
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
  const primaryActionLabel =
    uiState === UI_STATE.IDLE
      ? `Start Session (${QUICK_FLIP_CONFIG.entryCost})`
      : canStartSession
        ? `Start New Session (${QUICK_FLIP_CONFIG.entryCost})`
        : "Session Ready";

  return (
    <SoloV2GameShell
      title="Quick Flip"
      subtitle="Solo V2 reference game"
      balanceLabel="Vault"
      balanceValue={String(vaultBalance)}
      hideStatusPanel
      onBack={() => {
        if (typeof window !== "undefined") window.location.href = "/arcade-v2";
      }}
      gameplaySlot={
        <QuickFlipPlaceholderPanel
          uiState={uiState}
          session={session}
          selectedChoice={selectedChoice}
          eventInfo={eventInfo}
          resolvedResult={resolvedResult}
          sessionNotice={sessionNotice}
          errorMessage={errorMessage}
          onSelectChoice={handleSelectChoice}
          onSubmitChoice={handleSubmitChoice}
          onStartNewSession={resetForNewAttempt}
        />
      }
      primaryActionLabel={primaryActionLabel}
      secondaryActionLabel="Back to Lobby"
      primaryDisabled={!canStartSession}
      secondaryDisabled={false}
      primaryLoading={
        uiState === UI_STATE.LOADING || uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING
      }
      onPrimaryAction={handleStartSession}
      onSecondaryAction={() => {
        if (typeof window !== "undefined") window.location.href = "/arcade-v2";
      }}
      helpContent={
        <div className="space-y-2">
          <p>Pick heads or tails and confirm your choice.</p>
          <p>The server generates and validates the final outcome.</p>
          <p>Settlement updates the shared player vault once per resolved session.</p>
        </div>
      }
      statsContent={
        <div className="space-y-2">
          <p>Quick Flip stats will appear after server-backed sessions are enabled.</p>
          <p>Plays, wins, losses, reward totals, and last played will be shown here.</p>
        </div>
      }
      resultState={{
        title: uiState === UI_STATE.RESOLVED ? "Server Result" : "Result Pending",
        message:
          uiState === UI_STATE.RESOLVED
            ? `Choice: ${String(resolvedResult?.choice || "--")} | Outcome: ${String(resolvedResult?.outcome || "--")}`
            : "Result pending.",
        tone: uiState === UI_STATE.RESOLVED ? "resolved_server_authoritative" : "neutral",
      }}
    />
  );
}
