import { useCallback, useEffect, useRef, useState } from "react";
import DicePickBoard from "../components/solo-v2/DicePickBoard";
import { FlashVeinChoiceSlot, FlashVeinDiceSlot } from "../components/solo-v2/FlashVeinPlayfield";
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
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import {
  FLASH_VEIN_MIN_WAGER,
  FLASH_VEIN_ROUNDS,
  flashVeinMaxPayout,
} from "../lib/solo-v2/flashVeinConfig";
import {
  applyFlashVeinSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "flash_vein";
const PLAYER_HEADER = "flash-vein-client";

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

const STATS_KEY = "solo_v2_flash_vein_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;
const REVEAL_READABLE_MS = 520;
const FLASH_SHOW_MS = 880;

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function readFlashVeinStats() {
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

function writeFlashVeinStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function flashVeinStripModel(uiState, readState, playing) {
  const stepTotal = FLASH_VEIN_ROUNDS;
  const hist = Array.isArray(playing?.roundHistory) ? playing.roundHistory : [];
  const sl = hist.length;
  const curIdx = Math.max(
    0,
    Math.min(stepTotal - 1, Math.floor(Number(playing?.currentRoundIndex) || 0)),
  );
  const rs = String(readState || "");
  if (uiState === UI_STATE.RESOLVED) {
    return { stepTotal, stepsComplete: stepTotal, currentStepIndex: stepTotal - 1 };
  }
  if (
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    (uiState === UI_STATE.SESSION_ACTIVE && rs === "pick_submitted")
  ) {
    return { stepTotal, stepsComplete: sl, currentStepIndex: Math.min(curIdx, stepTotal - 1) };
  }
  if (
    uiState === UI_STATE.SESSION_ACTIVE &&
    (rs === "pick_pending" || rs === "awaiting_reveal")
  ) {
    return { stepTotal, stepsComplete: sl, currentStepIndex: Math.min(curIdx, stepTotal - 1) };
  }
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

function FlashVeinGameplayPanel({
  session,
  uiState,
  pickingUi,
  lastFlash,
  sessionNotice,
  statusTop,
  statusSub,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  payoutBandLabel,
  payoutBandValue,
  payoutCaption,
  flashLanes,
  revealPhase,
  onPickLane,
  pickDisabled,
  resultPopupOpen,
  resolvedIsWin,
  popupTitle,
  popupLine2,
  popupLine3,
  resultVaultLabel,
}) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
      <DicePickBoard
        progressStripKeyPrefix="flash-vein"
        sessionNotice={sessionNotice}
        statusTop={statusTop}
        statusSub={statusSub}
        stepTotal={stepTotal}
        currentStepIndex={currentStepIndex}
        stepsComplete={stepsComplete}
        stepLabels={["1", "2", "3", "4", "5"]}
        payoutBandLabel={payoutBandLabel}
        payoutBandValue={payoutBandValue}
        payoutCaption={payoutCaption}
        hideMobilePayoutBand
        diceSlot={<FlashVeinDiceSlot lanes={flashLanes} revealPhase={revealPhase} />}
        choiceSlot={
          <FlashVeinChoiceSlot
            pickDisabled={pickDisabled}
            pickingUi={pickingUi}
            lastFlash={lastFlash}
            onPickLane={onPickLane}
          />
        }
      />

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
        <div className="text-[13px] font-black uppercase tracking-wide">{popupTitle}</div>
        <div className="mt-1 text-sm font-bold text-white">
          <span className="text-amber-100 tabular-nums">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function FlashVeinPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(FLASH_VEIN_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [pickingUi, setPickingUi] = useState(false);
  const [inRunLoop, setInRunLoop] = useState(false);
  const [lastFlash, setLastFlash] = useState(null);
  const [stats, setStats] = useState(readFlashVeinStats);
  const [revealPhase, setRevealPhase] = useState("idle");
  const [flashLanes, setFlashLanes] = useState(null);

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
  const flashTimerRef = useRef(null);
  const revealBusyRef = useRef(false);
  const revealHideTimerRef = useRef(null);
  const lastRoundIdxRef = useRef(null);

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
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      if (revealHideTimerRef.current) {
        clearTimeout(revealHideTimerRef.current);
        revealHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    lastRoundIdxRef.current = null;
  }, [session?.id]);

  useEffect(() => {
    const ri = session?.flashVein?.playing?.currentRoundIndex;
    if (ri === undefined || ri === null || Number.isNaN(Number(ri))) return;
    const n = Math.floor(Number(ri));
    if (lastRoundIdxRef.current === n) return;
    lastRoundIdxRef.current = n;
    setRevealPhase("idle");
    setFlashLanes(null);
    if (revealHideTimerRef.current) {
      clearTimeout(revealHideTimerRef.current);
      revealHideTimerRef.current = null;
    }
  }, [session?.flashVein?.playing?.currentRoundIndex, session?.id]);

  useEffect(() => {
    writeFlashVeinStats(stats);
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
    setInRunLoop(false);
    setPickingUi(false);
    setLastFlash(null);
    setRevealPhase("idle");
    setFlashLanes(null);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyFlashVeinSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Math.max(0, Number(settlementResult.nextBalance || 0));
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = window.setTimeout(() => {
          resetRoundAfterResultPopup();
        }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
        return;
      }

      if (settlementResult.applied) {
        setSessionNotice("");
        setStats(prev => {
          const entryCost = Number(settlementSummary.entryCost || QUICK_FLIP_CONFIG.entryCost);
          const payoutReturn = Number(settlementSummary.payoutReturn || 0);
          const won = Boolean(resolvedResult?.isWin);
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
        setSessionNotice("");
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
    session?.id,
    uiState,
    openResultPopup,
  ]);

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const fvSnap = sessionPayload?.flashVein;
    const readState = String(fvSnap?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && fvSnap?.resolvedResult) {
      setInRunLoop(false);
      setResolvedResult({
        ...fvSnap.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: fvSnap.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice("");
      setErrorMessage("");
      return;
    }

    if (readState === "pick_conflict") {
      setInRunLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting picks — refresh and try again.");
      return;
    }

    if (readState === "pick_submitted") {
      setInRunLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("");
      return;
    }

    if (readState === "pick_pending" || readState === "awaiting_reveal") {
      setInRunLoop(true);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setPickingUi(false);
      setSessionNotice("");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInRunLoop(false);
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        st === "expired" ? "Session expired. Press START RUN." : "Session ended. Press START RUN.",
      );
      return;
    }

    setInRunLoop(false);
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
    setRevealPhase("idle");
    setFlashLanes(null);

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
    const response = await fetch("/api/solo-v2/flash-vein/resolve", {
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

  function applyTerminalOutcomeToUi(r, sid) {
    setPickingUi(false);
    setInRunLoop(false);
    terminalPopupEligibleRef.current = true;
    setResolvedResult({
      ...r,
      sessionId: r.sessionId || sid,
      settlementSummary: r.settlementSummary,
    });
    setUiState(UI_STATE.RESOLVED);
  }

  async function handleResolvePendingPick(sessionId, activeCycle) {
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
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        setLastFlash({ column: r.column, outcome: r.outcome });
        flashTimerRef.current = window.setTimeout(() => {
          flashTimerRef.current = null;
          setLastFlash(null);
        }, 900);
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          if (readResult.session.sessionStatus !== "resolved") {
            applySessionReadState(readResult.session, { resumed: true });
          }
        }
        applyTerminalOutcomeToUi(r, sessionId);
        return;
      }

      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "in_progress" && payload?.result) {
        const r = payload.result;
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        setLastFlash({ column: r.column, outcome: r.outcome });
        flashTimerRef.current = window.setTimeout(() => {
          flashTimerRef.current = null;
          setLastFlash(null);
        }, 900);
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        setPickingUi(false);
        setUiState(UI_STATE.SESSION_ACTIVE);
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      setPickingUi(false);
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

  async function handlePickLane(col) {
    const sid = sessionRef.current?.id;
    const fv = sessionRef.current?.flashVein;
    if (sid == null || String(fv?.readState || "") !== "pick_pending") return;
    if (revealPhase !== "masked") return;
    if (submitInFlightRef.current || resolveInFlightRef.current || pickingUi) return;

    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_PICK);
    setErrorMessage("");
    setPickingUi(true);
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
            action: "flash_vein_pick",
            gameKey: GAME_KEY,
            column: col,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolvePendingPick(sid, activeCycle);
        return;
      }

      setPickingUi(false);
      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "pick_conflict" || st === "turn_pending")) {
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
          setInRunLoop(false);
          setUiState(UI_STATE.IDLE);
          setErrorMessage(msg || "Session expired.");
          return;
        }
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setPickingUi(false);
      setErrorMessage("Network error while picking.");
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
    if (!isGiftRound && wager < FLASH_VEIN_MIN_WAGER) return;
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
    setInRunLoop(true);
    const fvBoot = boot.session?.flashVein;
    if (fvBoot?.readState === "pick_submitted" && fvBoot?.canResolveTurn) {
      void handleResolvePendingPick(boot.session.id, activeCycle);
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const fvSnap = session?.flashVein;
    if (!sid || !fvSnap || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!fvSnap.canResolveTurn) return;
    if (fvSnap.readState !== "pick_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePendingPick(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.flashVein?.readState, session?.flashVein?.canResolveTurn, uiState]);

  useEffect(() => {
    const sid = session?.id;
    const fv = session?.flashVein;
    if (!sid || !fv || uiState !== UI_STATE.SESSION_ACTIVE) return;
    const rs = String(fv.readState || "");
    const needsReveal = rs === "awaiting_reveal" || (rs === "pick_pending" && !flashLanes);
    if (!needsReveal) return;
    if (revealBusyRef.current) return;

    revealBusyRef.current = true;
    const activeCycle = cycleRef.current;

    (async () => {
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
              action: "flash_vein_reveal",
              gameKey: GAME_KEY,
            },
          }),
        });
        const payload = await response.json().catch(() => null);
        if (activeCycle !== cycleRef.current) return;
        const api = classifySoloV2ApiResult(response, payload);
        const st = String(payload?.status || "");
        if (api !== SOLO_V2_API_RESULT.SUCCESS || st !== "reveal_ready" || !payload?.reveal?.lanes) {
          setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Could not open flash."));
          return;
        }
        const lanes = payload.reveal.lanes;
        setFlashLanes(Array.isArray(lanes) ? [...lanes] : null);
        setRevealPhase("showing");
        const readResult = await readSessionTruth(sid, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        if (revealHideTimerRef.current) clearTimeout(revealHideTimerRef.current);
        revealHideTimerRef.current = window.setTimeout(() => {
          revealHideTimerRef.current = null;
          setRevealPhase("masked");
        }, FLASH_SHOW_MS);
      } catch (_e) {
        setErrorMessage("Network error during flash.");
      } finally {
        revealBusyRef.current = false;
      }
    })();
  }, [session?.id, session?.flashVein?.readState, uiState, flashLanes]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= FLASH_VEIN_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= FLASH_VEIN_MIN_WAGER &&
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

  const fvSnap = session?.flashVein;
  const playing = fvSnap?.playing;
  const readState = String(fvSnap?.readState || "");

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= FLASH_VEIN_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  let summaryWin = flashVeinMaxPayout(Math.max(FLASH_VEIN_MIN_WAGER, numericWager));

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing?.entryAmount != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING)) {
    summaryWin = flashVeinMaxPayout(Math.floor(Number(playing.entryAmount)));
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const roundsDone = Array.isArray(playing?.roundHistory) ? playing.roundHistory.length : 0;
  const strip = flashVeinStripModel(uiState, readState, playing);

  let statusTop = "Press START RUN.";

  if (uiState === UI_STATE.UNAVAILABLE) {
    statusTop = !vaultReady ? "Vault unavailable." : "Can't start.";
  } else if (uiState === UI_STATE.LOADING) {
    statusTop = "Starting run…";
  } else if (uiState === UI_STATE.SUBMITTING_PICK || uiState === UI_STATE.RESOLVING) {
    statusTop = "Working…";
  } else if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    statusTop = resolvedResult.isWin ? "You won." : "Run lost.";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "awaiting_reveal") {
    statusTop = "Opening flash…";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "pick_pending") {
    if (revealPhase === "showing") statusTop = "Memorize the lanes.";
    else if (revealPhase === "masked")
      statusTop = `Round ${roundsDone + 1} of ${FLASH_VEIN_ROUNDS} — pick your lane.`;
    else statusTop = "Preparing flash…";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "pick_submitted") {
    statusTop = "Working…";
  } else if (uiState === UI_STATE.PENDING_MIGRATION) {
    statusTop = "Migration pending.";
  } else if (uiState === UI_STATE.IDLE) {
    statusTop = "Press START RUN.";
  }

  const statusSub = "\u00a0";

  let payoutBandLabel = "Max win";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `Full clear · up to ${formatCompact(summaryWin)} (all gem path)`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary.payoutReturn ?? 0)));
    payoutBandLabel = resolvedResult.isWin ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    payoutCaption = resolvedResult.isWin ? "Vein cleared" : "Unstable lane — no payout";
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const popupTitle = resolvedIsWin ? "YOU WIN" : "YOU LOSE";
  const prPopup = Math.max(0, Math.floor(Number(resolvedResult?.settlementSummary?.payoutReturn ?? 0)));
  const popupLine2 = formatCompact(prPopup);
  const popupLine3 = resolvedIsWin
    ? `×${((resolvedResult?.multBpsEnd ?? 10000) / 10000).toFixed(2)} · ${resolvedResult?.gemsCollected ?? 0} gems`
    : "Vein collapsed";

  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}` : "";

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

  const primaryIsInRun =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING;
  const runPrimaryBusy =
    primaryIsInRun &&
    (uiState === UI_STATE.SUBMITTING_PICK || uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING);
  const primaryActionLoading = runPrimaryBusy ? true : isPrimaryLoading;
  const primaryLoadingLabel =
    uiState === UI_STATE.LOADING && !primaryIsInRun ? "STARTING…" : runPrimaryBusy ? "WORKING…" : "STARTING…";

  const pickDisabled =
    busyFooter ||
    uiState !== UI_STATE.SESSION_ACTIVE ||
    readState !== "pick_pending" ||
    revealPhase !== "masked" ||
    pickingUi;

  return (
    <SoloV2GameShell
      title="Flash Vein"
      subtitle="Flash, recall, safe pick."
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
            <span>Max win</span>
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - FLASH_VEIN_MIN_WAGER)));
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
          setWagerInput(String(FLASH_VEIN_MIN_WAGER));
        },
        primaryActionLabel: primaryIsInRun ? "IN RUN" : "START RUN",
        primaryActionDisabled: primaryIsInRun ? true : !canStart,
        primaryActionLoading,
        primaryLoadingLabel,
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
        <FlashVeinGameplayPanel
          session={session}
          uiState={uiState}
          pickingUi={pickingUi}
          lastFlash={lastFlash}
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          stepTotal={strip.stepTotal}
          stepsComplete={strip.stepsComplete}
          currentStepIndex={strip.currentStepIndex}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
          flashLanes={flashLanes}
          revealPhase={revealPhase}
          onPickLane={handlePickLane}
          pickDisabled={pickDisabled}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          popupTitle={popupTitle}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Flash Vein runs for five rounds. Each round the server seals unstable, gem, and safe across three lanes.
            The board flashes the layout briefly; after it hides, pick a lane from memory. Safe continues, gem boosts
            your multiplier, unstable ends the run. Clear all five rounds to collect the built payout.
          </p>
          <p>
            Gift rounds use freeplay — a loss does not debit your vault; a win credits the full payout. After the
            popup, press START RUN for the next run.
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
