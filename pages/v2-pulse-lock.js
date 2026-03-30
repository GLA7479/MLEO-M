import { useCallback, useEffect, useRef, useState } from "react";
import QuickFlipBoard from "../components/solo-v2/QuickFlipBoard";
import PulseLockLane, { usePulseLockSweepAnimation } from "../components/solo-v2/PulseLockLane";
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
import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "../lib/solo-v2/quickFlipConfig";
import { PULSE_LOCK_MULTIPLIERS } from "../lib/solo-v2/pulseLockConfig";
import {
  applyPulseLockSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "pulse_lock";
const PLAYER_HEADER = "v2-pulse-lock-client";

const UI_STATE = {
  IDLE: "idle",
  LOADING: "loading",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  SESSION_CREATED: "session_created",
  SWEEPING: "sweeping",
  SUBMITTING_LOCK: "submitting_lock",
  RESOLVING: "resolving",
  RESOLVED: "resolved",
  RESOLVE_FAILED: "resolve_failed",
};

const STATS_KEY = "solo_v2_pulse_lock_stats_v1";
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

function readPulseLockStats() {
  if (typeof window === "undefined") {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
      perfectHits: 0,
      goodHits: 0,
      edgeHits: 0,
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
      perfectHits: Number(parsed.perfectHits || 0),
      goodHits: Number(parsed.goodHits || 0),
      edgeHits: Number(parsed.edgeHits || 0),
    };
  } catch {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
      perfectHits: 0,
      goodHits: 0,
      edgeHits: 0,
    };
  }
}

function writePulseLockStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function pulseLockStripModel(uiState) {
  const stepTotal = 2;
  if (uiState === UI_STATE.RESOLVED) {
    return { stepTotal, stepsComplete: 2, currentStepIndex: 1 };
  }
  if (
    uiState === UI_STATE.SUBMITTING_LOCK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.SWEEPING
  ) {
    return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  }
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

function hitLabel(hq) {
  const s = String(hq || "").toLowerCase();
  if (s === "perfect") return "PERFECT";
  if (s === "good") return "GOOD";
  if (s === "edge") return "EDGE";
  if (s === "miss") return "MISS";
  return "—";
}

/** Heads / Tails tile shell reused as read-only status tiles (Quick Flip rhythm). */
function PulseMetaTile({ label, sub, tone = "neutral" }) {
  const shell =
    "group relative flex h-full min-h-[5.25rem] w-full flex-col items-center justify-center rounded-2xl border-2 text-center shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 sm:min-h-[6.1rem] sm:rounded-[1.05rem] lg:min-h-[7.35rem] lg:rounded-[1.12rem]";
  let face =
    "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ";
  if (tone === "perfect") {
    face =
      "border-emerald-400/65 bg-gradient-to-b from-emerald-900/55 to-emerald-950/90 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-2 ring-inset ring-emerald-400/20 ";
  } else if (tone === "good") {
    face =
      "border-amber-400/65 bg-gradient-to-b from-amber-900/45 to-amber-950/85 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-2 ring-inset ring-amber-400/18 ";
  } else if (tone === "edge") {
    face =
      "border-violet-400/65 bg-gradient-to-b from-violet-900/45 to-violet-950/90 text-violet-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-2 ring-inset ring-violet-400/18 ";
  } else if (tone === "miss") {
    face =
      "border-rose-500/45 bg-gradient-to-b from-rose-950/55 to-zinc-950 text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ";
  }

  return (
    <div className={`${shell} ${face} cursor-default opacity-100`}>
      <span className="mt-0.5 select-none text-[1.35rem] font-black leading-none tabular-nums sm:text-[1.55rem] lg:text-[1.85rem]">
        {label}
      </span>
      <span className="mt-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] lg:text-[11px]">
        {sub}
      </span>
    </div>
  );
}

function PulseLockGameplayPanel({
  uiState,
  playing,
  lanePhase,
  animMarker01,
  resultPopupOpen,
  resolvedIsWin,
  resultVaultLabel,
  popupTitle,
  popupLine2,
  popupLine3,
  sessionNotice,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  payoutBandLabel,
  payoutBandValue,
  payoutCaption,
  resolvedPositionTicks,
  resolvedHitQuality,
}) {
  const leftLabel =
    uiState === UI_STATE.SWEEPING || uiState === UI_STATE.SUBMITTING_LOCK || uiState === UI_STATE.RESOLVING
      ? "GO"
      : uiState === UI_STATE.RESOLVED
        ? hitLabel(resolvedHitQuality)
        : "SET";
  const leftSub =
    uiState === UI_STATE.SWEEPING || uiState === UI_STATE.SUBMITTING_LOCK || uiState === UI_STATE.RESOLVING
      ? "Sweep"
      : uiState === UI_STATE.RESOLVED
        ? "Result"
        : "Ready";

  let rightTone = "neutral";
  if (uiState === UI_STATE.RESOLVED) {
    const h = String(resolvedHitQuality || "").toLowerCase();
    if (h === "perfect") rightTone = "perfect";
    else if (h === "good") rightTone = "good";
    else if (h === "edge") rightTone = "edge";
    else if (h === "miss") rightTone = "miss";
  }

  return (
    <div className="solo-v2-route-stack relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
      <QuickFlipBoard
        sessionNotice={sessionNotice}
        statusTop=""
        statusSub=""
        hideBoardStatusStack
        stepLabels={["Run", "Lock"]}
        stepTotal={stepTotal}
        currentStepIndex={currentStepIndex}
        stepsComplete={stepsComplete}
        payoutBandLabel={payoutBandLabel}
        payoutBandValue={payoutBandValue}
        payoutCaption={payoutCaption}
        hideMobilePayoutBand
        coinSlot={
          <PulseLockLane
            playing={playing}
            lanePhase={lanePhase}
            markerPos01={animMarker01}
            resolvedPositionTicks={resolvedPositionTicks}
            resolvedHitQuality={resolvedHitQuality}
          />
        }
        choiceSlot={
          <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 lg:gap-6" aria-label="Round status">
            <PulseMetaTile label={leftLabel} sub={leftSub} tone={uiState === UI_STATE.RESOLVED ? rightTone : "neutral"} />
            <PulseMetaTile
              label={`×${PULSE_LOCK_MULTIPLIERS.perfect.toFixed(2)}`}
              sub="Perfect max"
              tone={rightTone === "perfect" ? "perfect" : "neutral"}
            />
          </div>
        }
      />

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

export default function PulseLockPage() {
  const giftShell = useSoloV2GiftShellState();
  const giftRefreshRef = useRef(() => {});
  const giftRoundRef = useRef(false);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [session, setSession] = useState(null);
  const [resolvedResult, setResolvedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(QUICK_FLIP_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readPulseLockStats);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const resultPopupTimerRef = useRef(null);
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
    writePulseLockStats(stats);
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

  function resetRoundAfterResultPopup() {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
  }

  function recoverStaleRound(message) {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
    setErrorMessage(String(message || "").trim() || "This round is no longer valid. Press START RUN.");
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const sessionId = resolvedResult?.sessionId || session?.id;
    const settlementSummary = resolvedResult?.settlementSummary;
    if (!sessionId || !settlementSummary) return;
    applyPulseLockSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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
      const hq = String(resolvedResult?.hitQuality || "").toLowerCase();
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
            perfectHits: Number(prev.perfectHits || 0) + (hq === "perfect" ? 1 : 0),
            goodHits: Number(prev.goodHits || 0) + (hq === "good" ? 1 : 0),
            edgeHits: Number(prev.edgeHits || 0) + (hq === "edge" ? 1 : 0),
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
    const summary = sessionPayload?.pulseLock?.resolvedResult || sessionPayload?.serverOutcomeSummary || {};
    if (sessionPayload?.sessionStatus !== "resolved") return null;
    return {
      sessionId: sessionPayload?.id || null,
      sessionStatus: sessionPayload?.sessionStatus || "resolved",
      hitQuality: summary.hitQuality || null,
      positionTicks: summary.positionTicks ?? null,
      isWin: Boolean(summary.isWin),
      resolvedAt: summary.resolvedAt || sessionPayload?.resolvedAt || null,
      settlementSummary: summary.settlementSummary || null,
    };
  }

  function applySessionReadState(sessionPayload, options = {}) {
    const { resumed = false } = options;
    setSession(sessionPayload);

    const readState = String(sessionPayload?.readState || "");
    const resolved = hydrateResolvedFromSession(sessionPayload);

    if (readState === "resolved" || resolved) {
      if (resolved) setResolvedResult(resolved);
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Resumed already resolved session." : "Session already resolved on server.");
      setErrorMessage("");
      return;
    }

    if (readState === "lock_submitted") {
      setUiState(UI_STATE.RESOLVING);
      setSessionNotice("Lock recorded. Resolving...");
      setErrorMessage("");
      return;
    }

    if (readState === "pulse_sweeping") {
      setUiState(UI_STATE.SWEEPING);
      setSessionNotice(resumed ? "Resumed active sweep." : "Sweep running.");
      setErrorMessage("");
      return;
    }

    if (readState === "pulse_start_required" || readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_CREATED);
      setSessionNotice(resumed ? "Resumed session. Press START RUN." : "Session ready.");
      setErrorMessage("");
      return;
    }

    if (
      readState === "invalid" ||
      sessionPayload?.sessionStatus === "expired" ||
      sessionPayload?.sessionStatus === "cancelled"
    ) {
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        sessionPayload?.sessionStatus === "expired"
          ? "Session expired. Press START ROUND."
          : "Session ended. Press START ROUND.",
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
        "x-solo-v2-player": PLAYER_HEADER,
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

  async function bootstrapPulseLockSession(wager, activeCycle, createSessionMode, giftRoundMeta) {
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
            setErrorMessage("No gift available. Try again after the next recharge.");
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
          setSession(null);
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }
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
          setSession(null);
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }
        applySessionReadState(readResult.session, { resumed: true });
        if (String(readResult.session?.readState || "") === "resolved") {
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

  async function postPulseStart(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-solo-v2-player": PLAYER_HEADER,
      },
      body: JSON.stringify({
        eventType: "client_action",
        eventPayload: {
          gameKey: GAME_KEY,
          action: "pulse_start",
        },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return { ok: false };
    const result = classifySoloV2ApiResult(response, payload);
    const status = String(payload?.status || "");
    if (result === SOLO_V2_API_RESULT.SUCCESS && status === "accepted") {
      const ps = payload?.pulseStart;
      if (ps) {
        setSession(prev => ({
          ...prev,
          readState: "pulse_sweeping",
          pulseLock: {
            readState: "pulse_sweeping",
            playing: {
              roundStartAt: ps.roundStartAt,
              sweepPeriodMs: ps.sweepPeriodMs,
              centerTicks: ps.centerTicks,
              rPerfectTicks: ps.rPerfectTicks,
              rGoodTicks: ps.rGoodTicks,
              rEdgeTicks: ps.rEdgeTicks,
            },
            canResolve: false,
            resolvedResult: null,
          },
        }));
      }
      setUiState(UI_STATE.SWEEPING);
      setSessionNotice(payload?.idempotent ? "Sweep already running." : "Sweep running.");
      return { ok: true };
    }
    setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Could not start sweep."));
    setUiState(UI_STATE.SESSION_CREATED);
    return { ok: false };
  }

  async function postPulseLock(sessionId, activeCycle) {
    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_LOCK);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": PLAYER_HEADER,
        },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: {
            gameKey: GAME_KEY,
            action: "pulse_lock",
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "accepted") {
        setSessionNotice(payload?.idempotent ? "Lock already recorded. Resolving..." : "Resolving...");
        setUiState(UI_STATE.RESOLVING);
        await handleResolveSession({ sessionIdOverride: sessionId });
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "invalid_pulse_phase") {
        recoverStaleRound(buildSoloV2ApiErrorMessage(payload, "Cannot lock right now."));
        return;
      }

      setUiState(UI_STATE.SWEEPING);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Lock failed."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setUiState(UI_STATE.SWEEPING);
      setErrorMessage("Network error while locking.");
    } finally {
      if (activeCycle === cycleRef.current) {
        submitInFlightRef.current = false;
      }
    }
  }

  async function runStartSweep() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;

    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
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
      const createSessionMode = isGiftRound ? SOLO_V2_SESSION_MODE.FREEPLAY : SOLO_V2_SESSION_MODE.STANDARD;

      const cur = sessionRef.current;
      let sessionId = cur?.id;
      const status = cur?.sessionStatus;
      const rs = String(cur?.readState || "");
      const needsBootstrap =
        !sessionId ||
        status === "resolved" ||
        [UI_STATE.RESOLVED, UI_STATE.IDLE, UI_STATE.UNAVAILABLE, UI_STATE.RESOLVE_FAILED, UI_STATE.PENDING_MIGRATION].includes(
          uiState,
        );

      if (needsBootstrap) {
        const boot = await bootstrapPulseLockSession(wager, activeCycle, createSessionMode, {
          isGiftRound,
          onGiftConsumed: () => giftRefreshRef.current?.(),
        });
        if (!boot.ok || activeCycle !== cycleRef.current) return;
        if (boot.alreadyTerminal) return;
        sessionId = boot.session?.id;
      }

      if (!sessionId || activeCycle !== cycleRef.current) return;

      await postPulseStart(sessionId, activeCycle);
    } finally {
      if (isGiftRound) {
        giftRoundRef.current = false;
      }
    }
  }

  async function runLockThenResolve() {
    if (submitInFlightRef.current || resolveInFlightRef.current || createInFlightRef.current) return;
    const sessionId = sessionRef.current?.id;
    if (!sessionId) return;
    const activeCycle = cycleRef.current;
    await postPulseLock(sessionId, activeCycle);
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
      const response = await fetch("/api/solo-v2/pulse-lock/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": PLAYER_HEADER,
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

  const pl = session?.pulseLock;
  const playing = pl?.playing || null;
  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= QUICK_FLIP_MIN_WAGER && vaultBalance >= numericWager;

  const inActiveRunUi = [
    UI_STATE.SESSION_CREATED,
    UI_STATE.SWEEPING,
    UI_STATE.SUBMITTING_LOCK,
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

  const potentialWin = Math.floor(numericWager * PULSE_LOCK_MULTIPLIERS.perfect);
  const summaryPlay = sessionLocksSummary ? runEntryFromSession : numericWager;
  const summaryWin = sessionLocksSummary
    ? Math.floor(Number(summaryPlay) * PULSE_LOCK_MULTIPLIERS.perfect)
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

  const strip = pulseLockStripModel(uiState);

  let payoutBandLabel = "Payout if perfect";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `Perfect ×${PULSE_LOCK_MULTIPLIERS.perfect.toFixed(2)} · play ${formatCompact(summaryPlay)}`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary?.payoutReturn ?? 0)));
    payoutBandLabel = resolvedResult.isWin ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    payoutCaption = `${hitLabel(resolvedResult.hitQuality)} · lock result`;
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
    popupTitle = resolvedIsWin ? "YOU WIN" : "YOU LOSE";
    popupLine2 = `Return ${formatCompact(pr)}`;
    popupLine3 = `${hitLabel(resolvedResult.hitQuality)} · pulse locked`;
  }

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (
        /Session expired\. Press START|Session ended\. Press START|no longer valid\. Press START/i.test(s)
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const canStartRun =
    wagerPlayable &&
    ![
      UI_STATE.LOADING,
      UI_STATE.SUBMITTING_LOCK,
      UI_STATE.RESOLVING,
      UI_STATE.PENDING_MIGRATION,
      UI_STATE.SWEEPING,
    ].includes(uiState) &&
    (uiState === UI_STATE.IDLE ||
      uiState === UI_STATE.SESSION_CREATED ||
      uiState === UI_STATE.RESOLVED);

  const canLock =
    wagerPlayable &&
    uiState === UI_STATE.SWEEPING &&
    ![UI_STATE.SUBMITTING_LOCK, UI_STATE.RESOLVING, UI_STATE.LOADING].includes(uiState);

  const busyFooter =
    uiState === UI_STATE.LOADING ||
    uiState === UI_STATE.SUBMITTING_LOCK ||
    uiState === UI_STATE.RESOLVING;

  const isPrimaryLoading =
    uiState === UI_STATE.LOADING || uiState === UI_STATE.SUBMITTING_LOCK || uiState === UI_STATE.RESOLVING;

  let primaryActionLabel = "START RUN";
  if (uiState === UI_STATE.SWEEPING) primaryActionLabel = "LOCK";
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
    if (canLock) {
      void runLockThenResolve();
    } else if (canStartRun) {
      void runStartSweep();
    }
  }

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
        UI_STATE.SUBMITTING_LOCK,
        UI_STATE.RESOLVING,
        UI_STATE.PENDING_MIGRATION,
        UI_STATE.SWEEPING,
      ].includes(uiState)
    ) {
      return;
    }
    giftRoundRef.current = true;
    void runStartSweep();
  }, [vaultReady, giftShell.giftCount, uiState]);

  const resumeResolveOnceRef = useRef(null);
  useEffect(() => {
    if (String(session?.readState || "") !== "lock_submitted") return;
    const id = session?.id;
    if (!id) return;
    if (resumeResolveOnceRef.current === id) return;
    resumeResolveOnceRef.current = id;
    void handleResolveSession({ sessionIdOverride: id });
  }, [session?.readState, session?.id]);

  const lanePhase =
    uiState === UI_STATE.RESOLVED ? "resolved" : uiState === UI_STATE.SWEEPING ? "sweeping" : "idle";
  const animMarker = usePulseLockSweepAnimation(playing, uiState === UI_STATE.SWEEPING ? "sweeping" : "idle");

  return (
    <SoloV2GameShell
      title="Pulse Lock"
      subtitle="Lock on time."
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
        primaryActionDisabled: !(canLock || canStartRun),
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: uiState === UI_STATE.RESOLVING ? "RESOLVING..." : "LOCKING...",
        onPrimaryAction: handlePrimaryCta,
        errorMessage: errorMessage || stakeHint,
        desktopPayout: {
          label: payoutBandLabel,
          value: payoutBandValue,
        },
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <PulseLockGameplayPanel
          uiState={uiState}
          playing={playing}
          lanePhase={lanePhase}
          animMarker01={animMarker}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          resultVaultLabel={resultVaultLabel}
          popupTitle={popupTitle}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          sessionNotice={sessionNotice}
          stepTotal={strip.stepTotal}
          stepsComplete={strip.stepsComplete}
          currentStepIndex={strip.currentStepIndex}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
          resolvedPositionTicks={resolvedResult?.positionTicks ?? null}
          resolvedHitQuality={resolvedResult?.hitQuality ?? null}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Pulse Lock is a single timing round: set your play amount, press START RUN to begin the sweep, then press LOCK
            once. The server records lock time and resolves hit quality and payout — the bar animation is display-only.
          </p>
          <p>
            Perfect, good, and edge hits pay different multipliers on your stake; a miss returns nothing. Gift rounds
            use freeplay mode: a loss does not debit your vault; a win credits the full payout.
          </p>
          <p>
            After a round ends, press START RUN again to play another — there is no auto-start.
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
          <p>Perfect / Good / Edge: {stats.perfectHits} / {stats.goodHits} / {stats.edgeHits}</p>
        </div>
      }
      resultState={null}
    />
  );
}
