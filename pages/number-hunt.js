import { useCallback, useEffect, useRef, useState } from "react";
import NumberHuntBoard from "../components/solo-v2/NumberHuntBoard";
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
  NUMBER_HUNT_MAX_GUESSES,
  NUMBER_HUNT_MAX_NUM,
  NUMBER_HUNT_MIN_NUM,
  NUMBER_HUNT_MIN_WAGER,
  numberHuntMaxPayout,
} from "../lib/solo-v2/numberHuntConfig";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import {
  applyNumberHuntSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "number_hunt";
const PLAYER_HEADER = "number-hunt-client";

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

const STATS_KEY = "solo_v2_number_hunt_stats_v1";
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

function formatGuessPath(history) {
  const arr = Array.isArray(history) ? history : [];
  const nums = arr.map(h => Math.floor(Number(h?.guess))).filter(Number.isFinite);
  return nums.length ? nums.join(", ") : "—";
}

function readNumberHuntStats() {
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

function writeNumberHuntStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function numberHuntRoundStripModel(uiState, readState, guessCount) {
  const stepTotal = NUMBER_HUNT_MAX_GUESSES;
  const gc = Math.max(0, Math.min(stepTotal, Math.floor(Number(guessCount) || 0)));
  const rs = String(readState || "");
  if (uiState === UI_STATE.RESOLVED) {
    return { stepTotal, stepsComplete: stepTotal, currentStepIndex: stepTotal - 1 };
  }
  if (
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    (uiState === UI_STATE.SESSION_ACTIVE && rs === "guess_submitted")
  ) {
    return { stepTotal, stepsComplete: gc, currentStepIndex: Math.min(gc, stepTotal - 1) };
  }
  if (uiState === UI_STATE.SESSION_ACTIVE && rs === "ready") {
    return { stepTotal, stepsComplete: gc, currentStepIndex: Math.min(gc, stepTotal - 1) };
  }
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

function NumberHuntGameplayPanel({
  session,
  uiState,
  pickingUi,
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
  onPickNumber,
  pickDisabled,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
  resolvedResult,
}) {
  const nh = session?.numberHunt;
  const rawPlaying = nh?.playing;
  const guessCountSoFar = Array.isArray(rawPlaying?.guessHistory) ? rawPlaying.guessHistory.length : 0;
  const resolved = uiState === UI_STATE.RESOLVED && resolvedResult;
  const playing =
    resolved && resolvedResult
      ? {
          ...rawPlaying,
          guessHistory: Array.isArray(resolvedResult.guessHistory) ? resolvedResult.guessHistory : [],
          lowBound: NUMBER_HUNT_MIN_NUM,
          highBound: NUMBER_HUNT_MAX_NUM,
        }
      : rawPlaying;
  const secret = Number(resolvedResult?.secretTarget);
  const revealTarget = resolved && Number.isFinite(secret) ? Math.floor(secret) : null;
  const revealWin = Boolean(resolvedResult?.isWin);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-5 lg:pt-2">
      <div className="flex min-h-0 flex-1 flex-col">
        <NumberHuntBoard
          playing={playing}
          pickingUi={pickingUi}
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          hintLine={hintLine}
          stepTotal={stepTotal}
          currentStepIndex={currentStepIndex}
          stepsComplete={stepsComplete}
          stepLabels={["1st", "2nd", "3rd"]}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
          onPickNumber={onPickNumber}
          pickDisabled={pickDisabled}
          revealTarget={revealTarget}
          revealWin={revealWin}
          showHeroHint={
            uiState === UI_STATE.SESSION_ACTIVE &&
            String(nh?.readState || "") === "ready" &&
            !pickingUi &&
            guessCountSoFar === 0
          }
        />
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

export default function NumberHuntPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(NUMBER_HUNT_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [pickingUi, setPickingUi] = useState(false);
  const [inHuntLoop, setInHuntLoop] = useState(false);
  const [stats, setStats] = useState(readNumberHuntStats);

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
    writeNumberHuntStats(stats);
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
    setInHuntLoop(false);
    setPickingUi(false);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyNumberHuntSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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
    session?.id,
    uiState,
    openResultPopup,
  ]);

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const nhSnap = sessionPayload?.numberHunt;
    const readState = String(nhSnap?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && nhSnap?.resolvedResult) {
      setInHuntLoop(false);
      setResolvedResult({
        ...nhSnap.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: nhSnap.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Round finished (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "guess_conflict") {
      setInHuntLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting picks — refresh and try again.");
      return;
    }

    if (readState === "guess_submitted") {
      setInHuntLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Finishing your guess…" : "Resolving…");
      setErrorMessage("");
      return;
    }

    if (readState === "ready") {
      setInHuntLoop(true);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setPickingUi(false);
      setSessionNotice(resumed ? "Session restored — pick a number." : "Pick a number (1–20).");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInHuntLoop(false);
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        st === "expired" ? "Session expired. Press START HUNT." : "Session ended. Press START HUNT.",
      );
      return;
    }

    setInHuntLoop(false);
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
    const response = await fetch("/api/solo-v2/number-hunt/resolve", {
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
    setInHuntLoop(false);
    terminalPopupEligibleRef.current = true;
    setResolvedResult({
      ...r,
      sessionId: r.sessionId || sid,
      settlementSummary: r.settlementSummary,
    });
    setUiState(UI_STATE.RESOLVED);
  }

  async function handleResolvePendingGuess(sessionId, activeCycle) {
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
        applyTerminalOutcomeToUi(r, sessionId);
        return;
      }

      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "in_progress" && payload?.result) {
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

  async function handlePickNumber(n) {
    const sid = sessionRef.current?.id;
    const nh = sessionRef.current?.numberHunt;
    if (sid == null || String(nh?.readState || "") !== "ready") return;
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
            action: "number_hunt_guess",
            gameKey: GAME_KEY,
            guess: n,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolvePendingGuess(sid, activeCycle);
        return;
      }

      setPickingUi(false);
      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "guess_conflict" || st === "turn_pending")) {
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
          setInHuntLoop(false);
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

  async function runStartHunt() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < NUMBER_HUNT_MIN_WAGER) return;
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
    setInHuntLoop(true);
    const nhBoot = boot.session?.numberHunt;
    if (nhBoot?.readState === "guess_submitted" && nhBoot?.canResolveTurn) {
      void handleResolvePendingGuess(boot.session.id, activeCycle);
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const nhSnap = session?.numberHunt;
    if (!sid || !nhSnap || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!nhSnap.canResolveTurn) return;
    if (nhSnap.readState !== "guess_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePendingGuess(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.numberHunt?.readState, session?.numberHunt?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= NUMBER_HUNT_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= NUMBER_HUNT_MIN_WAGER &&
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
      if (/Session expired\. Press START HUNT|Session ended\. Press START HUNT|no longer valid\. Press START HUNT/i.test(s)) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const nhSnap = session?.numberHunt;
  const playing = nhSnap?.playing;
  const readState = String(nhSnap?.readState || "");

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= NUMBER_HUNT_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  let summaryWin = numberHuntMaxPayout(Math.max(NUMBER_HUNT_MIN_WAGER, numericWager));

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing?.entryAmount != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING)) {
    summaryWin = numberHuntMaxPayout(Math.floor(Number(playing.entryAmount)));
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const guessCountForStrip = Array.isArray(playing?.guessHistory) ? playing.guessHistory.length : 0;
  const strip = numberHuntRoundStripModel(uiState, readState, guessCountForStrip);

  const lastClue =
    Array.isArray(playing?.guessHistory) && playing.guessHistory.length > 0
      ? String(playing.guessHistory[playing.guessHistory.length - 1]?.clue || "").trim()
      : "";

  let statusTop = "Press START HUNT when you are set.";
  let statusSub =
    "Set your play in the bar below, then start. The server holds a secret 1–20; you get up to three guesses with clues.";
  let hintLine = "Hit on 1st / 2nd / 3rd guess pays ×4.5 / ×2.5 / ×1.5 on your stake (this release).";

  if (uiState === UI_STATE.UNAVAILABLE) {
    statusTop = !vaultReady ? "Vault unavailable." : "Can’t start this round.";
    statusSub = !vaultReady
      ? "Shared vault could not be opened. Return to the arcade and try again."
      : String(errorMessage || "").trim() || "Check your balance and connection, then try START HUNT again.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.LOADING) {
    statusTop = "Starting hunt…";
    statusSub = "Opening or resuming a session with the server.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.SUBMITTING_PICK) {
    statusTop = "Submitting guess…";
    statusSub = "Sending your pick to the server.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.RESOLVING) {
    statusTop = "Resolving…";
    statusSub = "Checking your guess against the sealed target.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    statusTop = resolvedResult.isWin ? "You found the target." : "Out of guesses.";
    statusSub =
      "Round is complete. Adjust stake if you like, then press START HUNT for another round — there is no auto-start.";
    hintLine = resolvedResult.isWin
      ? "Vault credit applied after settlement."
      : "Paid rounds debit stake on a loss; gift rounds do not debit the vault on a loss.";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "ready") {
    if (pickingUi) {
      statusTop = "Checking…";
      statusSub = "\u00a0";
      hintLine = "\u00a0";
    } else if (guessCountForStrip === 0) {
      statusTop = "Pick your first guess.";
      statusSub = "Hidden number is 1–20 · You have three tries.";
      hintLine = "Tap a number in range; wrong picks are ruled out with higher / lower clues.";
    } else if (lastClue) {
      statusTop = lastClue;
      statusSub = `Guess ${guessCountForStrip + 1} of ${NUMBER_HUNT_MAX_GUESSES} · use the clues to narrow the range.`;
      hintLine = "Numbers outside the live range can’t be selected.";
    } else {
      statusTop = "Pick your next guess.";
      statusSub = `Guess ${guessCountForStrip + 1} of ${NUMBER_HUNT_MAX_GUESSES}.`;
      hintLine = "Use the range row and grid — eliminated numbers stay struck out.";
    }
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "guess_submitted") {
    statusTop = "Finishing your guess…";
    statusSub = "Resolving with the server.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.PENDING_MIGRATION) {
    statusTop = "Migration pending.";
    statusSub = "This environment is updating. Try again shortly.";
    hintLine = "\u00a0";
  } else if (uiState === UI_STATE.IDLE) {
    statusTop = "Number Hunt";
    statusSub = "Three guesses, higher-or-lower clues, range narrows after each miss.";
    hintLine = "START HUNT locks your stake; picks happen on the board only.";
  }

  let payoutBandLabel = "Max win";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `Full hit on 1st guess · up to ${formatCompact(summaryWin)}`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary.payoutReturn ?? 0)));
    payoutBandLabel = resolvedResult.isWin ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    payoutCaption = resolvedResult.isWin ? "Target found within three guesses" : "No payout — target not found";
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const secret = Number(resolvedResult?.secretTarget);
  const secretOk = Number.isFinite(secret);
  const hitOn = Number(resolvedResult?.hitOnGuess);
  const hist = resolvedResult?.guessHistory || [];
  const guessPath = formatGuessPath(hist);

  const popupLine2 = resolvedIsWin
    ? secretOk
      ? `Found ${secret}`
      : "Found it"
    : "Missed target";
  const popupLine3 = resolvedIsWin
    ? secretOk && Number.isFinite(hitOn)
      ? `GUESS ${hitOn} OF 3 · TARGET ${secret}`
      : "TARGET FOUND"
    : secretOk
      ? `TARGET ${secret} · GUESSES: ${guessPath}`
      : `GUESSES: ${guessPath}`;

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
    void runStartHunt();
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

  const pickDisabled =
    busyFooter || uiState !== UI_STATE.SESSION_ACTIVE || readState !== "ready" || pickingUi;

  return (
    <SoloV2GameShell
      title="Number Hunt"
      subtitle="Three guesses to find a server-sealed number from 1–20."
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - NUMBER_HUNT_MIN_WAGER)));
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
          setWagerInput(String(NUMBER_HUNT_MIN_WAGER));
        },
        primaryActionLabel: "START HUNT",
        primaryActionDisabled: !canStart,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => {
          void runStartHunt();
        },
        errorMessage: errorMessage || stakeHint,
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <NumberHuntGameplayPanel
          session={session}
          uiState={uiState}
          pickingUi={pickingUi}
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
          onPickNumber={handlePickNumber}
          pickDisabled={pickDisabled}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
          resolvedResult={resolvedResult}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Number Hunt is a single hunt per session: the server picks a secret integer from 1 to 20. You have three
            guesses; after each wrong guess you get a higher-or-lower style clue and numbers outside the live range are
            disabled. The board stays on your final clues and reveal until you press START HUNT again.
          </p>
          <p>
            Hit on guess 1 pays ×4.5, guess 2 pays ×2.5, guess 3 pays ×1.5 on your stake for this release. Gift rounds use
            freeplay mode: a loss does not debit your vault; a win credits the full payout.
          </p>
          <p>
            After the result popup closes, there is no auto-start — explicitly press START HUNT for the next hunt.
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
