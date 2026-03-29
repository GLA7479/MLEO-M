import { useCallback, useEffect, useRef, useState } from "react";
import SpeedTrackBoard from "../components/solo-v2/SpeedTrackBoard";
import SoloV2BoardCashOutControl from "../components/solo-v2/SoloV2BoardCashOutControl";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
  SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS,
} from "../components/solo-v2/SoloV2ResultPopup";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import SoloV2ProgressStrip from "../components/solo-v2/SoloV2ProgressStrip";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import {
  SOLO_V2_GIFT_ROUND_STAKE,
  soloV2GiftConsumeOne,
} from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import {
  SPEED_TRACK_CHECKPOINT_COUNT,
  SPEED_TRACK_MIN_WAGER,
  SPEED_TRACK_MULTIPLIER_LADDER,
  payoutForMultiplier,
} from "../lib/solo-v2/speedTrackConfig";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import {
  applySpeedTrackSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "speed_track";
const PLAYER_HEADER = "speed-track-client";

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

const STATS_KEY = "solo_v2_speed_track_stats_v1";
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

function readSpeedTrackStats() {
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

function writeSpeedTrackStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function speedTrackStripModel(checkpointCount, uiState, nCleared, terminalKind) {
  const total = Math.max(1, Math.floor(Number(checkpointCount) || SPEED_TRACK_CHECKPOINT_COUNT));
  const cleared = Math.max(0, Math.min(total, Math.floor(Number(nCleared) || 0)));
  if (uiState === UI_STATE.RESOLVED && terminalKind === "full_clear") {
    return { stepTotal: total, stepsComplete: total, currentStepIndex: total - 1 };
  }
  return { stepTotal: total, stepsComplete: cleared, currentStepIndex: Math.min(cleared, total - 1) };
}

function SpeedTrackGameplayPanel({
  session,
  uiState,
  pulseLane,
  shakeLane,
  onPickRoute,
  sessionNotice,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  stepLabels,
  showBoardCashOut,
  boardCashOutDisabled,
  boardCashOutLoading,
  boardCashOutLabel,
  boardCashOutLoadingLabel,
  onBoardCashOut,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
}) {
  const st = session?.speedTrack;
  const playing = st?.playing;
  const rr = st?.resolvedResult;
  const isTerminal = Boolean(rr) || session?.sessionStatus === "resolved";
  const revealBlocked = isTerminal && Array.isArray(rr?.blockedRoutes);
  const blockedRoutes = revealBlocked ? rr.blockedRoutes : null;
  const routeHistory = isTerminal ? rr?.routeHistory || [] : playing?.routeHistory || [];
  const clearedCheckpoints = isTerminal
    ? rr?.clearedCheckpoints || []
    : playing?.clearedCheckpoints || [];

  const checkpointCount =
    Math.floor(Number(playing?.checkpointCount ?? SPEED_TRACK_CHECKPOINT_COUNT)) || SPEED_TRACK_CHECKPOINT_COUNT;

  const busy =
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  const canPick =
    !busy &&
    !isTerminal &&
    st?.readState === "choice_required" &&
    uiState === UI_STATE.SESSION_ACTIVE;

  const currentCheckpointIndex = isTerminal
    ? rr?.terminalKind === "full_clear"
      ? checkpointCount - 1
      : Math.floor(Number(rr?.finalCheckpointIndex ?? playing?.currentCheckpointIndex ?? 0))
    : Math.floor(Number(playing?.currentCheckpointIndex ?? 0));

  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || checkpointCount));
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

        <SoloV2ProgressStrip
          keyPrefix="st"
          rowLabel="Sectors"
          ariaLabel="Sector progress"
          stepTotal={total}
          stepsComplete={stripCleared}
          currentStepIndex={cur}
          stepLabels={stepLabels}
        />

        <div className="flex min-h-0 flex-1 flex-col px-1 pb-1 sm:px-2 lg:min-h-0 lg:px-4 lg:pb-1.5">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-700/55 bg-zinc-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:min-h-[min(14rem,30vh)]"
            aria-label="Speed Track course"
          >
            <div className="flex min-h-0 min-h-[11rem] flex-1 flex-col px-0.5 pb-0.5 pt-1 sm:min-h-[12rem] sm:px-1 sm:pb-1 sm:pt-1.5 lg:min-h-0 lg:px-1 lg:py-0.5">
              <SpeedTrackBoard
                checkpointCount={checkpointCount}
                currentCheckpointIndex={currentCheckpointIndex}
                clearedCheckpoints={clearedCheckpoints}
                routeHistory={routeHistory}
                blockedRoutes={blockedRoutes}
                revealBlocked={revealBlocked}
                disabled={!canPick}
                pulseLane={pulseLane}
                shakeLane={shakeLane}
                onPickRoute={onPickRoute}
                terminalKind={rr?.terminalKind ?? null}
                failCheckpointIndex={rr?.finalCheckpointIndex ?? null}
                lockedRouteIndex={
                  st?.readState === "choice_submitted" && st?.pendingPick?.routeIndex != null
                    ? st.pendingPick.routeIndex
                    : null
                }
                hideCheckpointRibbon
              />
            </div>
            <div className="hidden shrink-0 flex-col items-center justify-center gap-2 border-t border-zinc-700/45 bg-zinc-900/30 px-2 py-2 sm:py-2.5 lg:flex lg:min-h-[4.25rem] lg:gap-1.5 lg:px-2 lg:py-1.5">
              <SoloV2BoardCashOutControl
                show={showBoardCashOut}
                label={boardCashOutLabel}
                loadingLabel={boardCashOutLoadingLabel}
                disabled={boardCashOutDisabled}
                loading={boardCashOutLoading}
                onClick={onBoardCashOut}
                wrapperClassName="flex w-full shrink-0 justify-center px-1 pb-0 pt-0 sm:px-2"
              />
              <div
                className="h-10 w-full max-w-sm sm:mx-auto sm:h-[2.4rem] lg:h-8 lg:max-w-2xl"
                aria-hidden
              />
            </div>
          </div>

          <div className="flex w-full min-w-0 shrink-0 flex-col items-stretch justify-center px-0 py-2 sm:py-2.5 lg:hidden">
            {showBoardCashOut ? (
              <button
                type="button"
                onClick={onBoardCashOut}
                disabled={boardCashOutDisabled || boardCashOutLoading}
                className={`min-h-[48px] w-full rounded-lg border px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide sm:text-sm ${
                  boardCashOutDisabled || boardCashOutLoading
                    ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
                    : "border-amber-400/45 bg-amber-950/40 text-amber-100 active:bg-amber-900/45"
                }`}
              >
                {boardCashOutLoading ? boardCashOutLoadingLabel : boardCashOutLabel}
              </button>
            ) : (
              <div className="pointer-events-none min-h-[2.5rem] w-full sm:min-h-[2.4rem]" aria-hidden />
            )}
          </div>
        </div>
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        resultTone={resolvedIsWin ? "win" : "lose"}
        animationKey={`${popupLine2}-${popupLine3}-${resolvedIsWin ? "w" : "l"}-${resultVaultLabel}`}
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
          <span className="text-amber-100 tabular-nums">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function SpeedTrackPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(SPEED_TRACK_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [pulseLane, setPulseLane] = useState(null);
  const [shakeLane, setShakeLane] = useState(null);
  const [cashOutLoading, setCashOutLoading] = useState(false);
  const [stats, setStats] = useState(readSpeedTrackStats);

  const cycleRef = useRef(0);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const sessionRef = useRef(null);
  const giftRoundRef = useRef(false);
  const giftRefreshRef = useRef(() => {});
  const lastPresetAmountRef = useRef(null);
  const resultPopupTimerRef = useRef(null);
  const terminalPopupEligibleRef = useRef(false);

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
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    writeSpeedTrackStats(stats);
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

  function resetRoundAfterResultPopup() {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setUiState(UI_STATE.IDLE);
    setSessionNotice("");
    setPulseLane(null);
    setShakeLane(null);
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applySpeedTrackSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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
      const won = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
      if (settlementResult.applied) {
        setSessionNotice(`Settled (${deltaLabel}). Vault: ${authoritativeBalance}.`);
        setStats(prev => {
          const entryCost = Number(settlementSummary.entryCost || QUICK_FLIP_CONFIG.entryCost);
          const payoutReturn = Number(settlementSummary.payoutReturn || 0);
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
    const stSnap = sessionPayload?.speedTrack;
    const readState = String(stSnap?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && stSnap?.resolvedResult) {
      setResolvedResult({
        ...stSnap.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: stSnap.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Run ended (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "pick_conflict") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting route picks — refreshing checkpoint state.");
      return;
    }

    if (readState === "choice_submitted") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Line locked — timing the sector…" : "Committing your racing line…");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      const ch = Math.floor(Number(stSnap?.playing?.currentCheckpointIndex ?? 0)) + 1;
      const cleared = Array.isArray(stSnap?.playing?.clearedCheckpoints)
        ? stSnap.playing.clearedCheckpoints.length
        : 0;
      setSessionNotice(
        resumed
          ? cleared > 0
            ? `Checkpoint ${ch} — pick your line.`
            : "Run restored — green flag."
          : cleared > 0
            ? `Sector clear — approach checkpoint ${ch}.`
            : `Checkpoint ${ch} — choose inside, center, or outside.`,
      );
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        st === "expired" ? "Session expired. Press START RUN." : "Session ended. Press START RUN.",
      );
      return;
    }

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
          setErrorMessage("Finish your current paid run before using a gift.");
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
    const response = await fetch("/api/solo-v2/speed-track/resolve", {
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

  async function handleResolveAfterPick(sessionId, activeCycle) {
    if (resolveInFlightRef.current) return;
    resolveInFlightRef.current = true;
    setUiState(UI_STATE.RESOLVING);
    try {
      const { response, payload, halted } = await postResolve(sessionId, {}, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const result = classifySoloV2ApiResult(response, payload);

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "turn_complete" && payload?.result) {
        const r = payload.result;
        setPulseLane({ routeIndex: r.routeIndex });
        window.setTimeout(() => setPulseLane(null), 650);
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted || !readResult?.ok) {
          setUiState(UI_STATE.SESSION_ACTIVE);
          return;
        }
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
        return;
      }

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const r = payload.result;
        if (r.terminalKind === "blocked") {
          setShakeLane({
            routeIndex: r.lastPickRoute ?? r.routeIndex,
          });
          window.setTimeout(() => setShakeLane(null), 900);
        }
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        setResolvedResult({
          ...r,
          sessionId: r.sessionId || sessionId,
          settlementSummary: r.settlementSummary || payload?.result?.settlementSummary,
        });
        setUiState(UI_STATE.RESOLVED);
        terminalPopupEligibleRef.current = true;
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      const readResult = await readSessionTruth(sessionId, activeCycle);
      if (readResult?.ok && readResult.session) {
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
      } else {
        setUiState(UI_STATE.SESSION_ACTIVE);
      }
    } finally {
      resolveInFlightRef.current = false;
    }
  }

  async function handlePickRoute(route) {
    const sid = sessionRef.current?.id;
    const playing = sessionRef.current?.speedTrack?.playing;
    const checkpoint = playing?.currentCheckpointIndex;
    const r = String(route || "").toLowerCase();
    if (sid == null || !Number.isFinite(Number(checkpoint)) || !["inside", "center", "outside"].includes(r)) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_PICK);
    setErrorMessage("");
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
            action: "speed_track_pick",
            gameKey: GAME_KEY,
            checkpointIndex: checkpoint,
            route: r,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolveAfterPick(sid, activeCycle);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "pick_conflict" || st === "invalid_row")) {
        const rr = await readSessionTruth(sid, activeCycle);
        if (rr?.ok && rr.session) {
          setSession(rr.session);
          applySessionReadState(rr.session, { resumed: true });
        }
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick rejected — state refreshed."));
        setUiState(UI_STATE.SESSION_ACTIVE);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && st === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          setSession(null);
          setUiState(UI_STATE.IDLE);
          setErrorMessage(msg || "Session expired.");
          return;
        }
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setErrorMessage("Network error while submitting pick.");
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function handleCashOut() {
    const sid = session?.id;
    if (!sid || cashOutLoading || resolveInFlightRef.current) return;
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    setCashOutLoading(true);
    const activeCycle = cycleRef.current;
    setUiState(UI_STATE.RESOLVING);
    try {
      const { response, payload, halted } = await postResolve(sid, { action: "cashout" }, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const api = classifySoloV2ApiResult(response, payload);
      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const readResult = await readSessionTruth(sid, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        const pr = payload.result;
        setResolvedResult({
          ...pr,
          sessionId: pr.sessionId || sid,
          settlementSummary: pr.settlementSummary ?? payload?.settlementSummary,
        });
        setUiState(UI_STATE.RESOLVED);
        terminalPopupEligibleRef.current = true;
        return;
      }
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Cash out failed."));
      const readResult = await readSessionTruth(sid, activeCycle);
      if (readResult?.ok && readResult.session) {
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
      }
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      setCashOutLoading(false);
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
    if (!isGiftRound && wager < SPEED_TRACK_MIN_WAGER) return;
    if (!isGiftRound && vaultBalance < wager) {
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this run.`);
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
    const stBoot = boot.session?.speedTrack;
    if (stBoot?.readState === "choice_submitted") {
      await handleResolveAfterPick(boot.session.id, activeCycle);
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const stSnap = session?.speedTrack;
    if (!sid || !stSnap || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (stSnap.readState !== "choice_submitted" || !stSnap.canResolveTurn) return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolveAfterPick(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional resume-only resolve
  }, [session?.id, session?.speedTrack?.readState, session?.speedTrack?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= SPEED_TRACK_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= SPEED_TRACK_MIN_WAGER &&
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

  const stSnap = session?.speedTrack;
  const playing = stSnap?.playing;
  const readState = String(stSnap?.readState || "");

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= SPEED_TRACK_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  const firstStepWinPreview = payoutForMultiplier(
    Math.max(SPEED_TRACK_MIN_WAGER, numericWager),
    SPEED_TRACK_MULTIPLIER_LADDER[0],
  );

  let summaryPlay = numericWager;
  let summaryWin = firstStepWinPreview;

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing && (uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.SUBMITTING_PICK || uiState === UI_STATE.RESOLVING)) {
    const np = playing.nextPayout;
    const cp = playing.currentPayout;
    if (np != null && Number.isFinite(Number(np))) {
      summaryWin = Math.floor(Number(np));
    } else if (cp != null && Number.isFinite(Number(cp))) {
      summaryWin = Math.floor(Number(cp));
    }
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const checkpointTotal =
    Math.floor(Number(playing?.checkpointCount ?? SPEED_TRACK_CHECKPOINT_COUNT)) || SPEED_TRACK_CHECKPOINT_COUNT;
  const rrSnap = stSnap?.resolvedResult;
  const terminalSession = Boolean(rrSnap) || session?.sessionStatus === "resolved";
  const nCleared = terminalSession && Array.isArray(rrSnap?.clearedCheckpoints)
    ? rrSnap.clearedCheckpoints.length
    : Array.isArray(playing?.clearedCheckpoints)
      ? playing.clearedCheckpoints.length
      : 0;
  const stripTerminalKind =
    uiState === UI_STATE.RESOLVED ? resolvedResult?.terminalKind ?? null : rrSnap?.terminalKind ?? null;
  const strip = speedTrackStripModel(checkpointTotal, uiState, nCleared, stripTerminalKind);
  const stepLabels = Array.from({ length: strip.stepTotal }, (_, i) => `CP${i + 1}`);

  let payoutBandLabel = "Secured payout";
  let payoutBandValue = formatCompact(summaryWin);

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary.payoutReturn ?? 0)));
    const won = Boolean(resolvedResult.isWin ?? resolvedResult.won);
    payoutBandLabel = won ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
  }

  const terminalKind = resolvedResult?.terminalKind;
  let resultTitle = "Race over";
  if (terminalKind === "blocked") resultTitle = "Blocked line — DNF";
  else if (terminalKind === "full_clear") resultTitle = "Finish line — full clear!";
  else if (terminalKind === "cashout") resultTitle = "Pit stop payout banked";

  const resolvedIsWin = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null
      ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}`
      : "";

  const prPopup = Math.max(0, Math.floor(Number(resolvedResult?.settlementSummary?.payoutReturn ?? 0)));
  let popupLine2 = formatCompact(prPopup);
  let popupLine3 = resultTitle;
  if (terminalKind === "blocked") {
    const fi = Math.floor(Number(resolvedResult?.finalCheckpointIndex ?? 0));
    popupLine2 = Number.isFinite(fi) ? `DNF · sector ${fi + 1}` : "DNF";
    popupLine3 = `${formatCompact(prPopup)} return`;
  } else if (terminalKind === "full_clear") {
    popupLine2 = `Finish · ${formatCompact(prPopup)}`;
    popupLine3 = "Full ladder cleared";
  } else if (terminalKind === "cashout") {
    popupLine2 = `Banked ${formatCompact(prPopup)}`;
    popupLine3 = "Pit stop payout";
  }

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if (
      [UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState)
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

  return (
    <SoloV2GameShell
      title="Speed Track"
      subtitle="Sectors, lines, pit stop."
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - SPEED_TRACK_MIN_WAGER)));
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
          setWagerInput(String(SPEED_TRACK_MIN_WAGER));
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
        <SpeedTrackGameplayPanel
          session={session}
          uiState={uiState}
          pulseLane={pulseLane}
          shakeLane={shakeLane}
          onPickRoute={handlePickRoute}
          sessionNotice={sessionNotice}
          stepTotal={strip.stepTotal}
          stepsComplete={strip.stepsComplete}
          currentStepIndex={strip.currentStepIndex}
          stepLabels={stepLabels}
          showBoardCashOut={
            uiState === UI_STATE.SESSION_ACTIVE && !terminalSession && Boolean(stSnap?.canCashOut)
          }
          boardCashOutDisabled={cashOutLoading || busyFooter}
          boardCashOutLoading={cashOutLoading}
          boardCashOutLabel="Pit stop · bank payout"
          boardCashOutLoadingLabel="Pitting…"
          onBoardCashOut={() => {
            void handleCashOut();
          }}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Speed Track is a multi-sector ladder run: at each checkpoint you choose inside, center, or outside. The server
            seals one blocked line per sector before you commit — a wrong line ends the run (DNF). Clearing sectors raises
            your secured payout along the multiplier ladder.
          </p>
          <p>
            After any safe sector you can use Pit stop — the control sits in the lower band of the course panel, under the
            track and above the stake bar. Secured payout on small screens appears in the summary strip above the course; on
            large screens it also appears beside the stake controls. Gift rounds use freeplay — a loss does not debit your
            vault; a win credits the full payout.
          </p>
          <p>
            After the result popup closes, the finished board stays visible — press START RUN explicitly for the next
            round; there is no auto-start.
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
