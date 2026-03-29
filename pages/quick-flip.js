import { useCallback, useEffect, useRef, useState } from "react";
import QuickFlipBoard from "../components/solo-v2/QuickFlipBoard";
import QuickFlipCoinDisplay from "../components/solo-v2/QuickFlipCoinDisplay";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
  SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS,
} from "../components/solo-v2/SoloV2ResultPopup";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import {
  SOLO_V2_GIFT_ROUND_STAKE,
  soloV2GiftConsumeOne,
} from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER, QUICK_FLIP_WIN_MULTIPLIER } from "../lib/solo-v2/quickFlipConfig";
import {
  applyQuickFlipSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

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

/** Dev-only START ROUND tracing (next dev). Prod: set localStorage solo_v2_qf_start_debug=1 to enable. */
function qfStartDebug(label, data) {
  const allowProd =
    typeof window !== "undefined" && window.localStorage?.getItem("solo_v2_qf_start_debug") === "1";
  if (process.env.NODE_ENV !== "development" && !allowProd) return;
  console.warn(`[QuickFlip handleStartSession] ${label}`, data);
}

const STATS_KEY = "solo_v2_quick_flip_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;
/** Brief beat after resolve so the coin can read as “landed” before the result overlay (mirror-game timing). */
const REVEAL_READABLE_MS = 520;

/** Parsed numeric wager from the amount field (0 if empty/invalid). No minimum — playability is gated separately. */
function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
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

function normalizeQuickFlipServerOutcome(outcome) {
  const s = String(outcome || "").toLowerCase();
  if (s === "heads") return "heads";
  if (s === "tails") return "tails";
  return null;
}

/** Heads / Tails — tile rhythm matches Mystery Chamber sigil buttons (rounded-2xl, premium weight). */
function FlipChoiceTile({ label, value, selectedChoice, disabled, onSelect }) {
  const isSelected = selectedChoice === value;
  const isHeads = value === "heads";
  const shell =
    "group relative flex h-full min-h-[5.25rem] w-full flex-col items-center justify-center rounded-2xl border-2 text-center shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 sm:min-h-[6.1rem] sm:rounded-[1.05rem] lg:min-h-[6.35rem]";

  let face =
    "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ";
  if (isSelected && isHeads) {
    face =
      "border-emerald-400/65 bg-gradient-to-b from-emerald-900/55 to-emerald-950/90 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(16,185,129,0.12)] ring-2 ring-inset ring-emerald-400/20 ";
  } else if (isSelected && !isHeads) {
    face =
      "border-violet-400/65 bg-gradient-to-b from-violet-900/55 to-violet-950/90 text-violet-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(139,92,246,0.15)] ring-2 ring-inset ring-violet-400/20 ";
  } else {
    face +=
      "enabled:hover:border-amber-500/55 enabled:hover:from-zinc-800 enabled:hover:to-zinc-950 enabled:active:scale-[0.98] ";
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className={`${shell} ${face}${
        disabled ? "cursor-not-allowed opacity-[0.42] " : ""
      }focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/35`}
    >
      <span
        className={`mt-0.5 select-none text-[2rem] font-black leading-none tabular-nums sm:text-[2.35rem] lg:text-[2.5rem] ${
          isSelected ? "" : "text-amber-100/95"
        }`}
        aria-hidden
      >
        {isHeads ? "H" : "T"}
      </span>
      <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px]">
        {label}
      </span>
    </button>
  );
}

function quickFlipRoundStripModel(uiState) {
  const stepTotal = 2;
  if (uiState === UI_STATE.RESOLVED) {
    return { stepTotal, stepsComplete: 2, currentStepIndex: 1 };
  }
  if (
    uiState === UI_STATE.SUBMITTING_CHOICE ||
    uiState === UI_STATE.CHOICE_SUBMITTED ||
    uiState === UI_STATE.RESOLVING
  ) {
    return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  }
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

/**
 * Gameplay column — mirrors MysteryChamberGameplayPanel: outer padding, flex-1 board, result popup overlay.
 */
function QuickFlipGameplayPanel({
  uiState,
  selectedChoice,
  isFlipping,
  resultPopupOpen,
  resolvedIsWin,
  resultVaultLabel,
  popupTitle,
  popupLine2,
  popupLine3,
  sessionNotice,
  statusTop,
  statusSub,
  hintLine,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  payoutBandLabel,
  payoutBandValue,
  payoutCaption,
  onSelectChoice,
  coinResolvedFace,
}) {
  const isChoiceLocked = uiState === UI_STATE.CHOICE_SUBMITTED;
  const canChoose =
    !isFlipping && uiState !== UI_STATE.LOADING && !isChoiceLocked;

  const coinPhase = isFlipping ? "flipping" : coinResolvedFace ? "resolved" : "idle";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1">
      <div className="flex min-h-0 flex-1 flex-col">
        <QuickFlipBoard
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          stepTotal={stepTotal}
          currentStepIndex={currentStepIndex}
          stepsComplete={stepsComplete}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
          hintLine={hintLine}
          coinSlot={<QuickFlipCoinDisplay phase={coinPhase} resolvedFace={coinResolvedFace} />}
          choiceSlot={
            <div className="grid w-full grid-cols-2 gap-2 sm:gap-3" role="group" aria-label="Choose side">
              <FlipChoiceTile
                label="Heads"
                value="heads"
                selectedChoice={selectedChoice}
                disabled={!canChoose}
                onSelect={onSelectChoice}
              />
              <FlipChoiceTile
                label="Tails"
                value="tails"
                selectedChoice={selectedChoice}
                disabled={!canChoose}
                onSelect={onSelectChoice}
              />
            </div>
          }
        />
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        resultTone={resolvedIsWin ? "win" : "lose"}
        animationKey={`${popupLine2}-${popupLine3}-${resultVaultLabel}`}
        vaultSlot={
          resultPopupOpen ? (
            <SoloV2ResultPopupVaultLine
              isWin={resolvedIsWin}
              tone={resolvedIsWin ? "win" : "lose"}
              deltaLabel={resultVaultLabel}
            />
          ) : undefined
        }
      >
        <div className="text-[13px] font-black uppercase tracking-wide">{popupTitle}</div>
        <div className="mt-1 text-sm font-bold text-white">
          <span className="text-amber-100 tabular-nums">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function QuickFlipPage() {
  const giftShell = useSoloV2GiftShellState();
  const giftRefreshRef = useRef(() => {});
  const giftRoundRef = useRef(false);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [session, setSession] = useState(null);
  const [selectedChoice, setSelectedChoice] = useState("");
  const [eventInfo, setEventInfo] = useState(null);
  const [resolvedResult, setResolvedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(QUICK_FLIP_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readQuickFlipStats);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const resultPopupTimerRef = useRef(null);
  /** True only after a fresh client resolve — avoids auto-opening the terminal popup on resumed resolved sessions. */
  const terminalPopupEligibleRef = useRef(false);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const cycleRef = useRef(0);
  const sessionRef = useRef(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    giftRefreshRef.current = giftShell.refresh;
  }, [giftShell.refresh]);

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
      if (resultPopupTimerRef.current) {
        clearTimeout(resultPopupTimerRef.current);
      }
    };
  }, []);

  const dismissResultPopupAfterTerminalRun = useCallback(() => {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setResultPopupOpen(false);
  }, []);

  const openResultPopup = useCallback(() => {
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(true);
    resultPopupTimerRef.current = window.setTimeout(() => {
      resultPopupTimerRef.current = null;
      dismissResultPopupAfterTerminalRun();
    }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
  }, [dismissResultPopupAfterTerminalRun]);

  /** Hard reset when vault settlement fails or stale recovery — not used on normal popup dismiss. */
  function resetRoundAfterResultPopup() {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setEventInfo(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
  }

  /** Clears stale session/round state but keeps wager input so the user can try FLIP COIN again. */
  function recoverStaleRound(message) {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setSelectedChoice("");
    setEventInfo(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
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
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = setTimeout(() => {
          resetRoundAfterResultPopup();
        }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
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
            totalPlay:
              Number(prev.totalPlay || 0) + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
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

      const shouldOpenTerminalPopup = terminalPopupEligibleRef.current;
      terminalPopupEligibleRef.current = false;
      if (shouldOpenTerminalPopup) {
        window.setTimeout(() => {
          openResultPopup();
        }, REVEAL_READABLE_MS);
      }
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id, uiState, openResultPopup]);

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
    const result = classifySoloV2ApiResult(response, payload);

    if (result === SOLO_V2_API_RESULT.SUCCESS && payload?.session) {
      return { ok: true, session: payload.session, readStatus: String(payload?.status || "") };
    }
    if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) {
      return {
        ok: false,
        state: UI_STATE.PENDING_MIGRATION,
        message: buildSoloV2ApiErrorMessage(payload, "Migration is pending."),
      };
    }
    if (result === SOLO_V2_API_RESULT.UNAVAILABLE) {
      return {
        ok: false,
        state: UI_STATE.UNAVAILABLE,
        message: buildSoloV2ApiErrorMessage(payload, "Session read unavailable."),
      };
    }
    return {
      ok: false,
      state: UI_STATE.UNAVAILABLE,
      message: buildSoloV2ApiErrorMessage(payload, "Session read rejected."),
    };
  }

  /**
   * Create or resume a server session (authoritative). Preserves local pre-selected side via localChoiceToKeep on resume.
   * Gift rounds: sessionMode freeplay, stake SOLO_V2_GIFT_ROUND_STAKE; consume one gift only after status "created".
   * @returns {{ ok: true, session: object } | { ok: false }}
   */
  async function bootstrapQuickFlipSession(wager, activeCycle, localChoiceToKeep, createSessionMode, giftRoundMeta) {
    const isGiftRound = Boolean(giftRoundMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
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
          sessionMode: createSessionMode,
          entryAmount: wager,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");

      qfStartDebug("fetch_done", {
        httpStatus: response.status,
        classify: result,
        apiStatus: status,
        sessionId: payload?.session?.id ?? null,
        rawPayload: payload,
      });

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "created" && payload?.session) {
        if (isGiftRound) {
          if (!soloV2GiftConsumeOne()) {
            setSession(null);
            setUiState(UI_STATE.IDLE);
            setErrorMessage("No gift available. Try again after the next recharge.");
            return { ok: false };
          }
          giftRoundMeta?.onGiftConsumed?.();
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => giftRoundMeta?.onGiftConsumed?.());
          }
        }
        setSession(payload.session);
        setSessionNotice("");
        setErrorMessage("");
        setUiState(UI_STATE.SESSION_CREATED);
        qfStartDebug("branch_created", { sessionId: payload.session?.id });
        return { ok: true, session: payload.session };
      }

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "existing_session" && payload?.session) {
        if (isGiftRound && payload.session.sessionMode !== SOLO_V2_SESSION_MODE.FREEPLAY) {
          setSession(null);
          setUiState(UI_STATE.IDLE);
          setErrorMessage("Finish your current paid round before using a gift.");
          return { ok: false };
        }
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

      if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) {
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Migration is pending."));
        return { ok: false };
      }

      if (result === SOLO_V2_API_RESULT.UNAVAILABLE) {
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Session bootstrap unavailable."));
        return { ok: false };
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Session bootstrap rejected."));
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
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "accepted") {
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

      if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) {
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Migration is pending."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.UNAVAILABLE) {
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Choice submission unavailable."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "choice_already_submitted") {
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

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "invalid_session_state") {
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
        recoverStaleRound(buildSoloV2ApiErrorMessage(payload, "Session no longer accepts choice submit."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          recoverStaleRound(msg || "Session expired. Choose side and press FLIP COIN.");
          return;
        }
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Choice submission rejected."));
        return;
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Choice submission rejected."));
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
    const isGiftRound = giftRoundRef.current;

    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }
    const side = selectedChoice;
    if (side !== "heads" && side !== "tails") {
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }

    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < QUICK_FLIP_MIN_WAGER) return;
    if (!isGiftRound && vaultBalance < wager) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this round.`);
      return;
    }

    if (isGiftRound) {
      const cur = sessionRef.current;
      if (
        cur?.id &&
        cur.sessionStatus !== "resolved" &&
        cur.sessionMode !== SOLO_V2_SESSION_MODE.FREEPLAY
      ) {
        setErrorMessage("Finish your current round before using a gift.");
        giftRoundRef.current = false;
        return;
      }
    }

    try {
      cycleRef.current += 1;
      const activeCycle = cycleRef.current;
      const createSessionMode = isGiftRound
        ? SOLO_V2_SESSION_MODE.FREEPLAY
        : SOLO_V2_SESSION_MODE.STANDARD;

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
        const boot = await bootstrapQuickFlipSession(wager, activeCycle, side, createSessionMode, {
          isGiftRound,
          onGiftConsumed: () => giftRefreshRef.current?.(),
        });
        if (!boot.ok || activeCycle !== cycleRef.current) return;
        if (isGiftRound && typeof window !== "undefined" && window.requestAnimationFrame) {
          giftRefreshRef.current?.();
          window.requestAnimationFrame(() => giftRefreshRef.current?.());
        }
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
    } finally {
      if (isGiftRound) {
        giftRoundRef.current = false;
      }
    }
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
      const result = classifySoloV2ApiResult(response, payload);

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        terminalPopupEligibleRef.current = true;
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

      if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) {
        setResolvedResult(null);
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Migration is pending."));
        return;
      }

      setResolvedResult(null);
      setUiState(UI_STATE.RESOLVE_FAILED);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve unavailable."));
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

  const inActiveRunUi = [
    UI_STATE.SESSION_CREATED,
    UI_STATE.CHOICE_SELECTED,
    UI_STATE.CHOICE_SUBMITTED,
    UI_STATE.SUBMITTING_CHOICE,
    UI_STATE.RESOLVING,
    UI_STATE.LOADING,
  ].includes(uiState);

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= QUICK_FLIP_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  const sessionLocksSummary = runEntryFromSession != null && inActiveRunUi;

  const potentialWin = Math.floor(numericWager * QUICK_FLIP_WIN_MULTIPLIER);
  const summaryPlay = sessionLocksSummary ? runEntryFromSession : numericWager;
  const summaryWin = sessionLocksSummary
    ? Math.floor(Number(summaryPlay) * QUICK_FLIP_WIN_MULTIPLIER)
    : potentialWin;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= QUICK_FLIP_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to play.`
    : "";

  const isFlipping = uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;
  const strip = quickFlipRoundStripModel(uiState);

  let statusTop = "Press FLIP COIN when you are set.";
  let statusSub =
    "Choose Heads or Tails, set your play in the bar below, then flip. The server seals the coin before you see it.";
  let hintLine = "Fair ×1.92 payout on a winning match — one flip per round.";

  if (uiState === UI_STATE.UNAVAILABLE) {
    statusTop = !vaultReady ? "Vault unavailable." : "Can’t start this round.";
    statusSub = !vaultReady
      ? "Shared vault could not be opened. Return to the arcade and try again."
      : String(errorMessage || "").trim() || "Check your balance and connection, then try FLIP COIN again.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.LOADING) {
    statusTop = "Starting round…";
    statusSub = "Opening or resuming a session with the server.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.SUBMITTING_CHOICE) {
    statusTop = "Locking your pick…";
    statusSub = "Sending Heads or Tails to the server.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.CHOICE_SUBMITTED || isFlipping) {
    statusTop = "Flipping…";
    statusSub = "Outcome is resolved on the server; the coin follows the fair result.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    statusTop = resolvedResult.isWin ? "You matched the coin." : "No match this time.";
    statusSub =
      "Round is complete. Change side or stake, then press FLIP COIN for another round.";
    hintLine = resolvedResult.isWin
      ? "Vault credit applied after settlement."
      : "Paid rounds debit stake on a loss; gift rounds do not debit the vault on a loss.";
  } else if (uiState === UI_STATE.SESSION_CREATED || uiState === UI_STATE.CHOICE_SELECTED) {
    statusTop = hasValidSide ? "Ready to flip." : "Choose your side.";
    statusSub = hasValidSide
      ? "Press FLIP COIN to lock your pick and resolve this round."
      : "Tap Heads or Tails, then flip from the footer.";
  } else if (uiState === UI_STATE.RESOLVE_FAILED) {
    statusTop = "Could not resolve.";
    statusSub = "Check your connection and try FLIP COIN again.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.PENDING_MIGRATION) {
    statusTop = "Migration pending.";
    statusSub = "This environment is updating. Try again shortly.";
    hintLine = "\u00a0";
  }

  let payoutBandLabel = "Payout if win";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `×${QUICK_FLIP_WIN_MULTIPLIER} multiplier · play ${formatCompact(summaryPlay)}`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary?.payoutReturn ?? 0)));
    payoutBandLabel = resolvedResult.isWin ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    const oc = normalizeQuickFlipServerOutcome(resolvedResult.outcome);
    payoutCaption = `Coin ${String(oc || "—").toUpperCase()} · pick ${String(resolvedResult.choice || "—").toUpperCase()}`;
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const deltaVault = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${deltaVault > 0 ? "+" : ""}${formatCompact(deltaVault)}` : "";

  let popupTitle = "—";
  let popupLine2 = "—";
  let popupLine3 = "—";
  if (resolvedResult) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary?.payoutReturn ?? 0)));
    const oc = normalizeQuickFlipServerOutcome(resolvedResult.outcome);
    popupTitle = resolvedIsWin ? "YOU WIN" : "YOU LOSE";
    popupLine2 = `Return ${formatCompact(pr)}`;
    popupLine3 = `Pick ${String(resolvedResult.choice || "—").toUpperCase()} · coin ${String(oc || "—").toUpperCase()}`;
  }

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

  const busyFooter =
    uiState === UI_STATE.LOADING ||
    uiState === UI_STATE.SUBMITTING_CHOICE ||
    uiState === UI_STATE.CHOICE_SUBMITTED ||
    uiState === UI_STATE.RESOLVING;

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

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (!hasValidSide) {
      setErrorMessage("Choose Heads or Tails to play a gift round.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if (
      [
        UI_STATE.LOADING,
        UI_STATE.SUBMITTING_CHOICE,
        UI_STATE.CHOICE_SUBMITTED,
        UI_STATE.RESOLVING,
        UI_STATE.PENDING_MIGRATION,
      ].includes(uiState)
    ) {
      return;
    }
    giftRoundRef.current = true;
    void runOneClickRound();
  }, [vaultReady, hasValidSide, giftShell.giftCount, uiState]);

  return (
    <SoloV2GameShell
      title="Quick Flip"
      subtitle="One honest flip — sealed on the server before you see it."
      layoutMaxWidthClass="max-w-full sm:max-w-2xl"
      mobileHeaderBreathingRoom
      stableTripleTopSummary
      gameplayScrollable={false}
      gameplayDesktopUnclipVertical
      menuVaultBalance={vaultBalance}
      gift={{ ...giftShell, onGiftClick: handleGiftPlay }}
      hideStatusPanel
      hideActionBar
      onBack={() => {
        if (typeof window !== "undefined") window.location.href = "/arcade-v2";
      }}
      topGameStatsSlot={
        <>
          <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-zinc-500">
            <span>Play</span>
            <span className="font-semibold tabular-nums text-emerald-200/90">{formatCompact(summaryPlay)}</span>
          </span>
          <span className="shrink-0 text-zinc-600" aria-hidden>
            ·
          </span>
          <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-zinc-500">
            <span>Win</span>
            <span className="font-semibold tabular-nums text-lime-200/90">{formatCompact(summaryWin)}</span>
          </span>
        </>
      }
      soloV2Footer={{
        betPresets: BET_PRESETS,
        wagerInput,
        wagerNumeric: numericWager,
        canEditPlay: !busyFooter,
        compactAmountDisplayWhenBlurred: true,
        formatPresetLabel: v => formatCompact(v),
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            const next = Math.min(MAX_WAGER, Math.max(0, c - QUICK_FLIP_MIN_WAGER));
            return String(next);
          });
        },
        onIncreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            return String(Math.min(MAX_WAGER, c + 1000));
          });
        },
        onAmountInput: raw => {
          clearPresetChain();
          setWagerInput(String(raw).replace(/\D/g, "").slice(0, 12));
        },
        onResetAmount: () => {
          clearPresetChain();
          setWagerInput(String(QUICK_FLIP_MIN_WAGER));
        },
        primaryActionLabel,
        primaryActionDisabled: !canFlipCoin,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "FLIPPING...",
        onPrimaryAction: handlePrimaryCta,
        errorMessage: errorMessage || stakeHint,
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <QuickFlipGameplayPanel
          uiState={uiState}
          selectedChoice={selectedChoice}
          isFlipping={isFlipping}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          resultVaultLabel={resultVaultLabel}
          popupTitle={popupTitle}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          hintLine={hintLine}
          stepTotal={strip.stepTotal}
          stepsComplete={strip.stepsComplete}
          currentStepIndex={strip.currentStepIndex}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
          onSelectChoice={handleSelectChoice}
          coinResolvedFace={
            uiState === UI_STATE.RESOLVED
              ? normalizeQuickFlipServerOutcome(resolvedResult?.outcome)
              : null
          }
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Quick Flip is a single coin round: pick Heads or Tails, set your play amount, then press FLIP COIN. The
            server resolves the outcome before the coin animation finishes, then your shared vault is updated from that
            result.
          </p>
          <p>
            A winning match pays ×{QUICK_FLIP_WIN_MULTIPLIER} on your stake for this release (96% RTP design). Gift rounds
            use freeplay mode: a loss does not debit your vault; a win credits the full payout.
          </p>
          <p>
            After a round ends, the board stays on the final coin face until you start again — adjust side or stake and
            press FLIP COIN explicitly; there is no auto-start.
          </p>
        </div>
      }
      statsContent={
        <div className="space-y-2">
          <p>Total games: {stats.totalGames}</p>
          <p>Wins: {stats.wins}</p>
          <p>Losses: {stats.losses}</p>
          <p>Win rate: {stats.totalGames ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : "0.0"}%</p>
          <p>Total played: {formatCompact(stats.totalPlay)}</p>
          <p>Total returned: {formatCompact(stats.totalWon)}</p>
          <p>Biggest win: {formatCompact(stats.biggestWin)}</p>
          <p>Net flow (returned − played): {formatCompact(stats.totalWon - stats.totalPlay)}</p>
          <p>Heads wins: {stats.headsWins}</p>
          <p>Tails wins: {stats.tailsWins}</p>
        </div>
      }
      resultState={null}
    />
  );
}
