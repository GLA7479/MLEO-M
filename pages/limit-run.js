import { useCallback, useEffect, useRef, useState } from "react";
import LimitRunBoard from "../components/solo-v2/LimitRunBoard";
import SoloV2ProgressStrip from "../components/solo-v2/SoloV2ProgressStrip";
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
import {
  LIMIT_RUN_LIMBO_MIN_TARGET,
  LIMIT_RUN_MIN_WAGER,
  limboProjectedPayout,
  limboWinChancePercent,
  normalizeLimitRunTargetMultiplier,
} from "../lib/solo-v2/limitRunConfig";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import {
  applyLimitRunSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "limit_run";
const PLAYER_HEADER = "limit-run-client";

const UI_STATE = {
  IDLE: "idle",
  LOADING: "loading",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  SESSION_ACTIVE: "session_active",
  SUBMITTING_PICK: "submitting_pick",
  RESOLVING: "resolving",
  RESOLVED: "resolved",
};

const STATS_KEY = "solo_v2_limit_run_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;
const REVEAL_READABLE_MS = 520;

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function readLimitRunStats() {
  if (typeof window === "undefined") {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
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
    };
  } catch {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
    };
  }
}

function writeLimitRunStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function limitRunRoundStripModel(uiState, readState) {
  const stepTotal = 2;
  const rs = String(readState || "");
  if (uiState === UI_STATE.RESOLVED) {
    return { stepTotal, stepsComplete: 2, currentStepIndex: 1 };
  }
  if (
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    (uiState === UI_STATE.SESSION_ACTIVE && rs === "roll_submitted")
  ) {
    return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  }
  if (uiState === UI_STATE.SESSION_ACTIVE && rs === "ready") {
    return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  }
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

/** Ladder-family shell — mirrors Gold Rush Digger; inner board keeps limbo / target-roll identity. */
function LimitRunGameplayPanel({
  session,
  targetMultiplier,
  onTargetChange,
  displayMultiplierText,
  rollingUi,
  resultLineUi,
  resultToneUi,
  sessionNotice,
  statusTop,
  statusSub,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  stepLabels,
  payoutBandLabel,
  payoutBandValue,
  payoutCaption,
  onRoll,
  rollDisabled,
  resultPopupOpen,
  resolvedIsWin,
  resultPopupRollLabel,
  resultPopupCompareLine,
  resultVaultLabel,
}) {
  const lr = session?.limitRun;
  const playing = lr?.playing;
  const entry = playing?.entryAmount ?? session?.entryAmount ?? LIMIT_RUN_MIN_WAGER;
  const winChance = limboWinChancePercent(targetMultiplier);
  const projected = limboProjectedPayout(entry, targetMultiplier);

  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || 2));
  const stripCleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-amber-900/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex h-4 shrink-0 items-center justify-center px-2 sm:h-[1.125rem] lg:px-5">
          <p
            className={`line-clamp-1 w-full text-center text-[9px] font-semibold leading-tight text-amber-200/85 sm:text-[10px] ${
              showSession ? "opacity-100" : "opacity-0"
            }`}
          >
            {showSession ? sessionNotice : "\u00a0"}
          </p>
        </div>

        <div className="shrink-0 space-y-0 px-2.5 py-0 text-center sm:px-3 lg:px-5">
          <div className="flex min-h-[1.6875rem] items-start justify-center sm:min-h-[2.0625rem]">
            <p className="line-clamp-2 w-full text-center text-[11px] font-bold leading-tight text-white sm:text-[13px]">
              {statusTop}
            </p>
          </div>
          <div className="flex min-h-[1.375rem] items-start justify-center sm:min-h-[1.5625rem]">
            <p className="line-clamp-2 w-full text-center text-[9px] leading-tight text-zinc-400 sm:text-[10px]">{statusSub}</p>
          </div>
        </div>

        <SoloV2ProgressStrip
          keyPrefix="lr"
          rowLabel="Round"
          ariaLabel="Round progress"
          stepTotal={total}
          stepsComplete={stripCleared}
          currentStepIndex={cur}
          stepLabels={stepLabels}
        />

        <div className="shrink-0 px-2.5 pb-1 pt-0 sm:px-3 sm:pb-1 lg:px-5 lg:hidden">
          <div className="rounded-lg border border-amber-900/50 bg-zinc-800/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-xl">
            <div className="flex min-h-[2.125rem] items-center justify-between gap-2 px-2.5 py-0.5 sm:min-h-[2.25rem] sm:px-3 sm:py-1">
              <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.14em] text-amber-200/45 sm:text-[9px]">
                {payoutBandLabel}
              </span>
              <span className="truncate text-right text-sm font-black tabular-nums text-amber-100 sm:text-base">
                {payoutBandValue}
              </span>
            </div>
            <p className="min-h-[1.05rem] border-t border-white/5 px-2.5 pb-0.5 pt-0.5 text-right text-[8px] font-medium leading-tight text-zinc-500 sm:min-h-[1.1rem] sm:px-3 sm:pb-1 sm:pt-0.5 sm:text-[9px]">
              <span className={`line-clamp-1 ${payoutCaption ? "" : "opacity-0"}`}>
                {payoutCaption || "\u00a0"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col px-1 pb-1 sm:px-2 lg:px-4 lg:pb-1.5">
          <div
            className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-700/55 bg-zinc-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            aria-label="Limit Run playfield"
          >
            <div className="shrink-0 px-0.5 py-1 sm:px-1 sm:py-1.5 lg:px-1 lg:py-0.5">
              <LimitRunBoard
                targetMultiplier={targetMultiplier}
                onTargetChange={onTargetChange}
                displayMultiplierText={displayMultiplierText}
                rolling={rollingUi}
                resultLine={resultLineUi}
                resultTone={resultToneUi}
                winChancePercent={winChance}
                projectedPayoutLabel={formatCompact(projected)}
                onRoll={onRoll}
                rollDisabled={rollDisabled}
              />
            </div>
          </div>
        </div>
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        resultTone={resolvedIsWin ? "win" : "lose"}
        animationKey={`${resultPopupRollLabel}-${resultPopupCompareLine}-${resolvedIsWin ? "w" : "l"}-${resultVaultLabel}`}
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
        <div className="text-[13px] font-black uppercase tracking-wide">
          {resolvedIsWin ? "YOU WIN" : "YOU LOSE"}
        </div>
        <div className="mt-1 text-sm font-bold text-white">
          Rolled:{" "}
          <span className="text-amber-100 tabular-nums">{resultPopupRollLabel}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">
          {resultPopupCompareLine}
        </div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function LimitRunPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(LIMIT_RUN_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [targetMultiplier, setTargetMultiplier] = useState(LIMIT_RUN_LIMBO_MIN_TARGET);
  const [displayMultiplierText, setDisplayMultiplierText] = useState("—");
  const [rollingUi, setRollingUi] = useState(false);
  const [resultLineUi, setResultLineUi] = useState("");
  const [resultToneUi, setResultToneUi] = useState("neutral");
  /** True while an active server session is in play (ready / roll_submitted). Cleared on terminal resolve. */
  const [inLimitRunLoop, setInLimitRunLoop] = useState(false);
  const [stats, setStats] = useState(readLimitRunStats);

  const cycleRef = useRef(0);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const sessionRef = useRef(null);
  const giftRoundRef = useRef(false);
  const giftRefreshRef = useRef(() => {});
  const lastPresetAmountRef = useRef(null);
  const resultPopupTimerRef = useRef(null);
  /** True only after a fresh client resolve — avoids auto-opening the terminal popup on resumed resolved sessions. */
  const terminalPopupEligibleRef = useRef(false);
  const rollAnimTimerRef = useRef(null);

  const giftShell = useSoloV2GiftShellState();

  useEffect(() => {
    giftRefreshRef.current = giftShell.refresh;
  }, [giftShell.refresh]);

  useEffect(() => {
    return () => {
      if (resultPopupTimerRef.current) {
        clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = null;
      }
      if (rollAnimTimerRef.current) {
        clearInterval(rollAnimTimerRef.current);
        rollAnimTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    writeLimitRunStats(stats);
  }, [stats]);

  useEffect(() => {
    let cancelled = false;
    readQuickFlipSharedVaultBalance().then(result => {
      if (cancelled) return;
      if (result.ok) {
        setVaultBalance(result.balance);
        setVaultReady(true);
      } else {
        setVaultReady(false);
      }
    });
    const unsub = subscribeQuickFlipSharedVault(({ balance }) => {
      setVaultBalance(balance);
      setVaultReady(true);
    });
    return () => {
      cancelled = true;
      unsub();
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

  /** Hard reset when vault settlement fails — not used on normal popup dismiss. */
  function resetRoundAfterResultPopup() {
    if (rollAnimTimerRef.current) {
      clearInterval(rollAnimTimerRef.current);
      rollAnimTimerRef.current = null;
    }
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setInLimitRunLoop(false);
    setDisplayMultiplierText("—");
    setRollingUi(false);
    setResultLineUi("");
    setResultToneUi("neutral");
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyLimitRunSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Math.max(0, Number(settlementResult.nextBalance || 0));
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = window.setTimeout(() => {
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
          const won = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
          return {
            ...prev,
            totalGames: Number(prev.totalGames || 0) + 1,
            wins: Number(prev.wins || 0) + (won ? 1 : 0),
            losses: Number(prev.losses || 0) + (won ? 0 : 1),
            totalPlay:
              Number(prev.totalPlay || 0) + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
            totalWon: Number(prev.totalWon || 0) + payoutReturn,
            biggestWin: Math.max(Number(prev.biggestWin || 0), won ? payoutReturn : 0),
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
  }, [
    resolvedResult?.sessionId,
    resolvedResult?.settlementSummary,
    resolvedResult?.isWin,
    resolvedResult?.won,
    session?.id,
    uiState,
    openResultPopup,
  ]);

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const lrSnap = sessionPayload?.limitRun;
    const readState = String(lrSnap?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && lrSnap?.resolvedResult) {
      setInLimitRunLoop(false);
      setResolvedResult({
        ...lrSnap.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: lrSnap.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Round finished (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "roll_conflict") {
      setInLimitRunLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting roll — refresh and try again.");
      return;
    }

    if (readState === "roll_submitted") {
      setInLimitRunLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Finishing your roll…" : "Resolving roll…");
      setErrorMessage("");
      return;
    }

    if (readState === "ready") {
      setInLimitRunLoop(true);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setDisplayMultiplierText("—");
      setRollingUi(false);
      setResultLineUi("");
      setResultToneUi("neutral");
      setSessionNotice(resumed ? "Session restored — set target and roll." : "Set target and tap Roll.");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInLimitRunLoop(false);
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        st === "expired" ? "Session expired. Press START RUN." : "Session ended. Press START RUN.",
      );
      return;
    }

    setInLimitRunLoop(false);
    setUiState(UI_STATE.UNAVAILABLE);
    setErrorMessage("Session state is not resumable.");
  }

  async function readSessionTruth(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}`, {
      method: "GET",
      headers: { "x-solo-v2-player": PLAYER_HEADER },
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

  async function bootstrapSession(wager, activeCycle, createSessionMode, giftRoundMeta) {
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
    setResolvedResult(null);
    setDisplayMultiplierText("—");
    setResultLineUi("");
    setResultToneUi("neutral");

    try {
      const response = await fetch("/api/solo-v2/sessions/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": PLAYER_HEADER,
        },
        body: JSON.stringify({
          gameKey: GAME_KEY,
          sessionMode: createSessionMode,
          entryAmount: wager,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "created" && payload?.session) {
        if (isGiftRound) {
          if (!soloV2GiftConsumeOne()) {
            setSession(null);
            setUiState(UI_STATE.IDLE);
            setErrorMessage("No gift available.");
            return { ok: false };
          }
          giftRoundMeta?.onGiftConsumed?.();
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => giftRoundMeta?.onGiftConsumed?.());
          }
        }
        const readResult = await readSessionTruth(payload.session.id, activeCycle);
        if (readResult?.halted) return { ok: false };
        if (!readResult?.ok) {
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: false });
        return { ok: true, session: readResult.session };
      }

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "existing_session" && payload?.session) {
        if (isGiftRound && payload.session.sessionMode !== SOLO_V2_SESSION_MODE.FREEPLAY) {
          setSession(null);
          setUiState(UI_STATE.IDLE);
          setErrorMessage("Finish your current paid round before using a gift.");
          return { ok: false };
        }
        const readResult = await readSessionTruth(payload.session.id, activeCycle);
        if (readResult?.halted) return { ok: false };
        if (!readResult?.ok) {
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
        if (readResult.session?.sessionStatus === "resolved") {
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
    } catch (_e) {
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

  async function postResolve(sessionId, body, activeCycle) {
    const response = await fetch("/api/solo-v2/limit-run/resolve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-solo-v2-player": PLAYER_HEADER,
      },
      body: JSON.stringify({ sessionId, ...body }),
    });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return { halted: true };
    return { response, payload };
  }

  function applyRollOutcomeToUi(r, sid, { animate }) {
    const finalMult = Number(r.rollMultiplier);
    const tgt = Number(r.targetMultiplier);
    const won = Boolean(r.won ?? r.isWin ?? r.terminalKind === "full_clear");

    const line = won
      ? `Win — ×${finalMult.toFixed(2)} ≥ ×${tgt.toFixed(2)}`
      : `Miss — ×${finalMult.toFixed(2)} < ×${tgt.toFixed(2)}`;

    if (!animate) {
      setDisplayMultiplierText(Number.isFinite(finalMult) ? finalMult.toFixed(2) : "—");
      setRollingUi(false);
      setResultLineUi(line);
      setResultToneUi(won ? "win" : "lose");
      setInLimitRunLoop(false);
      terminalPopupEligibleRef.current = true;
      setResolvedResult({
        ...r,
        sessionId: r.sessionId || sid,
        settlementSummary: r.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      return;
    }

    setRollingUi(true);
    if (rollAnimTimerRef.current) clearInterval(rollAnimTimerRef.current);
    let count = 0;
    rollAnimTimerRef.current = setInterval(() => {
      count += 1;
      setDisplayMultiplierText((Math.random() * 99 + 1).toFixed(2));
      if (count >= 14) {
        if (rollAnimTimerRef.current) {
          clearInterval(rollAnimTimerRef.current);
          rollAnimTimerRef.current = null;
        }
        setDisplayMultiplierText(Number.isFinite(finalMult) ? finalMult.toFixed(2) : "—");
        setRollingUi(false);
        setResultLineUi(line);
        setResultToneUi(won ? "win" : "lose");
        setInLimitRunLoop(false);
        terminalPopupEligibleRef.current = true;
        setResolvedResult({
          ...r,
          sessionId: r.sessionId || sid,
          settlementSummary: r.settlementSummary,
        });
        setUiState(UI_STATE.RESOLVED);
      }
    }, 48);
  }

  async function handleResolvePendingRoll(sessionId, activeCycle, { animate }) {
    if (resolveInFlightRef.current) return;
    resolveInFlightRef.current = true;
    setUiState(UI_STATE.RESOLVING);
    try {
      const { response, payload, halted } = await postResolve(sessionId, {}, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const api = classifySoloV2ApiResult(response, payload);

      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const r = payload.result;
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          if (readResult.session.sessionStatus !== "resolved") {
            applySessionReadState(readResult.session, { resumed: true });
          }
        }
        applyRollOutcomeToUi(r, sessionId, { animate });
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      setRollingUi(false);
      const readResult = await readSessionTruth(sessionId, activeCycle);
      if (readResult?.ok && readResult.session) {
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
      }
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      resolveInFlightRef.current = false;
    }
  }

  async function handleRoll() {
    const sid = sessionRef.current?.id;
    const lr = sessionRef.current?.limitRun;
    if (sid == null || String(lr?.readState || "") !== "ready") return;
    if (submitInFlightRef.current || resolveInFlightRef.current || rollingUi) return;

    const target = normalizeLimitRunTargetMultiplier(targetMultiplier);
    if (target === null) return;

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_PICK);
    setErrorMessage("");
    setRollingUi(true);
    setResultLineUi("");
    setResultToneUi("neutral");
    const activeCycle = cycleRef.current;

    try {
      const response = await fetch(`/api/solo-v2/sessions/${sid}/event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": PLAYER_HEADER,
        },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: {
            action: "limit_run_roll",
            gameKey: GAME_KEY,
            targetMultiplier: target,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolvePendingRoll(sid, activeCycle, { animate: true });
        return;
      }

      setRollingUi(false);
      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "roll_conflict" || st === "turn_pending")) {
        const rr = await readSessionTruth(sid, activeCycle);
        if (rr?.ok && rr.session) {
          setSession(rr.session);
          applySessionReadState(rr.session, { resumed: true });
        }
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Roll rejected — state refreshed."));
        setUiState(UI_STATE.SESSION_ACTIVE);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && st === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          setSession(null);
          setInLimitRunLoop(false);
          setUiState(UI_STATE.IDLE);
          setErrorMessage(msg || "Session expired.");
          return;
        }
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Roll failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setRollingUi(false);
      setErrorMessage("Network error while rolling.");
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function runStartRun() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < LIMIT_RUN_MIN_WAGER) return;
    if (!isGiftRound && vaultBalance < wager) {
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this round.`);
      return;
    }

    cycleRef.current += 1;
    const activeCycle = cycleRef.current;
    const mode = isGiftRound ? SOLO_V2_SESSION_MODE.FREEPLAY : SOLO_V2_SESSION_MODE.STANDARD;
    const boot = await bootstrapSession(wager, activeCycle, mode, {
      isGiftRound,
      onGiftConsumed: () => giftRefreshRef.current?.(),
    });
    if (isGiftRound) giftRoundRef.current = false;
    if (!boot.ok || boot.alreadyTerminal) return;
    if (isGiftRound && typeof window !== "undefined" && window.requestAnimationFrame) {
      giftRefreshRef.current?.();
      window.requestAnimationFrame(() => giftRefreshRef.current?.());
    }
    setInLimitRunLoop(true);
    const lrBoot = boot.session?.limitRun;
    if (lrBoot?.readState === "roll_submitted" && lrBoot?.canResolveTurn) {
      void handleResolvePendingRoll(boot.session.id, activeCycle, { animate: false });
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const lrSnap = session?.limitRun;
    if (!sid || !lrSnap || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!lrSnap.canResolveTurn) return;
    if (lrSnap.readState !== "roll_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePendingRoll(sid, cycleRef.current, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.limitRun?.readState, session?.limitRun?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= LIMIT_RUN_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= LIMIT_RUN_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(
      uiState,
    ) &&
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE || uiState === UI_STATE.RESOLVED);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (
        /Session expired\. Press START RUN|Session ended\. Press START RUN|no longer valid\. Press START RUN/i.test(s)
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const handleTargetChange = useCallback(next => {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    setTargetMultiplier(next);
  }, []);

  const lrSnap = session?.limitRun;
  const playing = lrSnap?.playing;
  const readState = String(lrSnap?.readState || "");

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= LIMIT_RUN_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  let summaryWin = limboProjectedPayout(Math.max(LIMIT_RUN_MIN_WAGER, numericWager), targetMultiplier);

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing?.entryAmount != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING)) {
    summaryWin = limboProjectedPayout(Math.floor(Number(playing.entryAmount)), targetMultiplier);
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const strip = limitRunRoundStripModel(uiState, readState);
  const winChanceNow = limboWinChancePercent(targetMultiplier);

  let statusTop = "Press START RUN when you are set.";
  let statusSub =
    "Set your target multiplier and stake in the bar below, then start. After that, Roll resolves the server draw.";

  if (uiState === UI_STATE.UNAVAILABLE) {
    statusTop = !vaultReady ? "Vault unavailable." : "Can’t start this round.";
    statusSub = !vaultReady
      ? "Shared vault could not be opened. Return to the arcade and try again."
      : String(errorMessage || "").trim() || "Check your balance and connection, then try START RUN again.";
  } else if (uiState === UI_STATE.LOADING) {
    statusTop = "Starting run…";
    statusSub = "Opening or resuming a session with the server.";
  } else if (uiState === UI_STATE.SUBMITTING_PICK) {
    statusTop = "Submitting roll…";
    statusSub = "Locking your target with the server.";
  } else if (uiState === UI_STATE.RESOLVING || rollingUi) {
    statusTop = "Drawing multiplier…";
    statusSub = "Outcome is resolved on the server; the readout follows the fair result.";
  } else if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    statusTop = resolvedResult.isWin || resolvedResult.won ? "Target beaten." : "Below target this time.";
    statusSub =
      "Round is complete. Adjust target or stake, then press START RUN for another round — there is no auto-start.";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "ready") {
    statusTop = "Ready to roll.";
    statusSub = "Tap Roll when your target is set. The server draws the multiplier for this round.";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "roll_submitted") {
    statusTop = "Finishing your roll…";
    statusSub = "Resolving the server draw.";
  } else if (uiState === UI_STATE.PENDING_MIGRATION) {
    statusTop = "Migration pending.";
    statusSub = "This environment is updating. Try again shortly.";
  } else if (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE) {
    statusTop = "Limbo-style run.";
    statusSub = "Choose a target, set play, then START RUN. Roll only after the session opens.";
  }

  let payoutBandLabel = "Payout if win";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `Target ×${Number(targetMultiplier).toFixed(2)} · ~${winChanceNow.toFixed(2)}% hit`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary.payoutReturn ?? 0)));
    payoutBandLabel = resolvedResult.isWin || resolvedResult.won ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    const rr0 = Number(resolvedResult.rollMultiplier);
    const tt0 = Number(resolvedResult.targetMultiplier);
    payoutCaption =
      Number.isFinite(rr0) && Number.isFinite(tt0)
        ? `Rolled ×${rr0.toFixed(2)} vs target ×${tt0.toFixed(2)}`
        : "Round settled";
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
  const rr = Number(resolvedResult?.rollMultiplier);
  const tt = Number(resolvedResult?.targetMultiplier);
  const rOk = Number.isFinite(rr);
  const tOk = Number.isFinite(tt);
  const resultPopupRollLabel = rOk ? `×${rr.toFixed(2)}` : "—";
  const resultPopupCompareLine =
    rOk && tOk
      ? resolvedIsWin
        ? `CLEAR — ×${rr.toFixed(2)} ≥ ×${tt.toFixed(2)}`
        : `MISS — ×${rr.toFixed(2)} < ×${tt.toFixed(2)}`
      : resolvedIsWin
        ? "TARGET BEATEN"
        : "NO WIN";
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null
      ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}`
      : "";

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if (
      [
        UI_STATE.LOADING,
        UI_STATE.SUBMITTING_PICK,
        UI_STATE.RESOLVING,
        UI_STATE.PENDING_MIGRATION,
      ].includes(uiState)
    ) {
      return;
    }
    giftRoundRef.current = true;
    void runStartRun();
  }, [vaultReady, giftShell.giftCount, uiState]);

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

  const busyFooter =
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  const rollDisabled =
    busyFooter ||
    uiState !== UI_STATE.SESSION_ACTIVE ||
    readState !== "ready" ||
    rollingUi;

  return (
    <SoloV2GameShell
      title="Limit Run"
      subtitle="Roll meets your target."
      layoutMaxWidthClass="max-w-full sm:max-w-2xl lg:max-w-5xl"
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - LIMIT_RUN_MIN_WAGER)));
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
          setWagerInput(String(LIMIT_RUN_MIN_WAGER));
        },
        primaryActionLabel: "START RUN",
        primaryActionDisabled: !canStart,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => {
          void runStartRun();
        },
        errorMessage: errorMessage || stakeHint,
        desktopPayout: {
          label: payoutBandLabel,
          value: payoutBandValue,
        },
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <LimitRunGameplayPanel
          session={session}
          targetMultiplier={targetMultiplier}
          onTargetChange={handleTargetChange}
          displayMultiplierText={displayMultiplierText}
          rollingUi={rollingUi}
          resultLineUi={resultLineUi}
          resultToneUi={resultToneUi}
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          stepTotal={strip.stepTotal}
          stepsComplete={strip.stepsComplete}
          currentStepIndex={strip.currentStepIndex}
          stepLabels={["Target", "Roll"]}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
          onRoll={handleRoll}
          rollDisabled={rollDisabled}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          resultPopupRollLabel={resultPopupRollLabel}
          resultPopupCompareLine={resultPopupCompareLine}
          resultVaultLabel={resultVaultLabel}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Limit Run is a limbo-style round: choose a target multiplier (slider, presets, or custom), set your play
            amount, then press START RUN. Once the session is ready, tap Roll — the server draws a multiplier before the
            animation finishes, then your shared vault updates from that result.
          </p>
          <p>
            You win when the rolled multiplier is greater than or equal to your target; payout scales with your target
            and stake. Gift rounds use freeplay mode: a loss does not debit your vault; a win credits the full payout.
          </p>
          <p>
            After a round ends, the multiplier readout and result line stay visible until you explicitly press START RUN
            again — there is no auto-start after the summary popup closes.
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
        </div>
      }
      resultState={null}
    />
  );
}
