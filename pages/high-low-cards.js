import { useCallback, useEffect, useRef, useState } from "react";
import DicePickBoard from "../components/solo-v2/DicePickBoard";
import { HighLowCardsMergedPlayfield } from "../components/solo-v2/HighLowCardsBoard";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
  SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS,
} from "../components/solo-v2/SoloV2ResultPopup";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import {
  SOLO_V2_GIFT_ROUND_STAKE,
  soloV2GiftConsumeOne,
} from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import { HIGH_LOW_CARDS_MIN_WAGER, payoutFromEntryAndStreak } from "../lib/solo-v2/highLowCardsConfig";
import {
  applyHighLowCardsSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const SOLO_V2_PLAYER = "high-low-cards-client";
const GAME_KEY = "high_low_cards";
const SESSION_STORAGE_KEY = "solo_v2_high_low_session_v1";

const UI_STATE = {
  IDLE: "idle",
  LOADING: "loading",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  PLAYING: "playing",
  RESOLVING: "resolving",
  TERMINAL: "terminal",
};

const STATS_KEY = "solo_v2_high_low_cards_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;
/** Beat after terminal reveal before the result overlay (mirror-game timing). */
const REVEAL_READABLE_MS = 520;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function readStats() {
  if (typeof window === "undefined") {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0, maxStreak: 0 };
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
      maxStreak: Number(parsed.maxStreak || 0),
    };
  } catch {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0, maxStreak: 0 };
  }
}

function writeStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function readStoredSessionId() {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return id && String(id).length >= 8 ? String(id) : null;
  } catch {
    return null;
  }
}

function writeStoredSessionId(id) {
  if (typeof window === "undefined" || !id) return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, String(id));
  } catch {
    // ignore
  }
}

function clearStoredSessionId() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const HIGH_LOW_STRIP_CAP = 10;

function highLowStripModel(uiState, streakValue) {
  const total = HIGH_LOW_STRIP_CAP;
  const s = Math.max(0, Math.floor(Number(streakValue) || 0));
  const capped = Math.min(s, total);
  if (uiState === UI_STATE.TERMINAL) {
    const cleared = capped;
    const cur = capped > 0 ? Math.min(capped - 1, total - 1) : 0;
    return { stepTotal: total, stepsComplete: cleared, currentStepIndex: cur };
  }
  const cleared = Math.min(s, total);
  const cur = Math.min(s, total - 1);
  return { stepTotal: total, stepsComplete: cleared, currentStepIndex: cur };
}

export default function HighLowCardsPage() {
  const giftShell = useSoloV2GiftShellState();
  const giftRefreshRef = useRef(() => {});
  const giftRoundRef = useRef(false);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [session, setSession] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [pendingGuess, setPendingGuess] = useState(null);
  const [terminalResult, setTerminalResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(HIGH_LOW_CARDS_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readStats);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const resultPopupTimerRef = useRef(null);
  const terminalPopupEligibleRef = useRef(false);
  const createInFlightRef = useRef(false);
  const actionInFlightRef = useRef(false);
  const cycleRef = useRef(0);
  const sessionRef = useRef(null);
  const resolveTurnRef = useRef(async () => {});
  const revealAnimatingRef = useRef(false);

  const [revealAnimating, setRevealAnimating] = useState(false);
  const [revealFaceUp, setRevealFaceUp] = useState(false);
  const [revealCardData, setRevealCardData] = useState(null);
  const [revealOutcome, setRevealOutcome] = useState(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    giftRefreshRef.current = giftShell.refresh;
  }, [giftShell.refresh]);

  useEffect(() => {
    writeStats(stats);
  }, [stats]);

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
    return () => {
      if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    };
  }, []);

  function resetRevealVisuals() {
    revealAnimatingRef.current = false;
    setRevealAnimating(false);
    setRevealFaceUp(false);
    setRevealCardData(null);
    setRevealOutcome(null);
  }

  function recoverToIdle(message) {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    terminalPopupEligibleRef.current = false;
    clearStoredSessionId();
    createInFlightRef.current = false;
    actionInFlightRef.current = false;
    resetRevealVisuals();
    setSession(null);
    setPlaying(null);
    setPendingGuess(null);
    setTerminalResult(null);
    setUiState(UI_STATE.IDLE);
    setErrorMessage(String(message || "").trim() || "Session reset. Press PLAY to start again.");
  }

  function applySessionFromTruth(s, options = {}) {
    const { resumed = false, preserveReveal = false } = options;
    setSession(s);
    const hl = s?.highLowCards;
    const rs = String(s?.readState || "");
    const st = String(s?.sessionStatus || "");

    if (st === "resolved" || rs === "resolved") {
      const rr = hl?.resolvedResult;
      terminalPopupEligibleRef.current = false;
      setPlaying(null);
      setPendingGuess(null);
      if (!preserveReveal) resetRevealVisuals();
      setTerminalResult({
        terminalKind: rr?.terminalKind || "loss",
        streak: Number(rr?.finalStreak ?? rr?.streak ?? 0),
        settlementSummary: rr?.settlementSummary || null,
        lastNextCard: rr?.lastNextCard || null,
        isWin: Boolean(rr?.isWin),
      });
      setUiState(UI_STATE.TERMINAL);
      setSessionNotice(resumed ? "Resumed finished session." : "Round complete.");
      setErrorMessage("");
      return;
    }

    if (rs === "invalid" || st === "expired" || st === "cancelled") {
      recoverToIdle(
        st === "expired" ? "Session expired. Press PLAY to start again." : "Session ended. Press PLAY to start again.",
      );
      return;
    }

    if (hl?.playing) {
      setPlaying(hl.playing);
      setPendingGuess(hl.pendingGuess || null);
      setTerminalResult(null);
      if (!preserveReveal) {
        resetRevealVisuals();
      }
      setUiState(UI_STATE.PLAYING);
      setSessionNotice(resumed ? "Resumed your run." : "");
      setErrorMessage("");
      return;
    }

    setUiState(UI_STATE.UNAVAILABLE);
    setErrorMessage("Session state is not playable.");
  }

  async function readSessionTruth(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}`, {
      method: "GET",
      headers: { "x-solo-v2-player": SOLO_V2_PLAYER },
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

  function sessionTruthIsDead(sPayload, readStatus) {
    const rs = String(sPayload?.readState || "");
    const rss = String(readStatus || "");
    const st = String(sPayload?.sessionStatus || "");
    return rss === "invalid" || rs === "invalid" || st === "expired" || st === "cancelled";
  }

  const tryResumeStoredSession = useCallback(async () => {
    const sid = readStoredSessionId();
    if (!sid) return;
    cycleRef.current += 1;
    const c = cycleRef.current;
    const truth = await readSessionTruth(sid, c);
    if (truth?.halted || c !== cycleRef.current) return;
    if (!truth?.ok) {
      clearStoredSessionId();
      return;
    }
    if (sessionTruthIsDead(truth.session, truth.readStatus)) {
      clearStoredSessionId();
      return;
    }
    writeStoredSessionId(sid);
    applySessionFromTruth(truth.session, { resumed: true });
  }, []);

  useEffect(() => {
    if (!vaultReady) return;
    void tryResumeStoredSession();
  }, [vaultReady, tryResumeStoredSession]);

  const dismissResultPopupAfterTerminalRun = useCallback(() => {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    actionInFlightRef.current = false;
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
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    clearStoredSessionId();
    createInFlightRef.current = false;
    actionInFlightRef.current = false;
    resetRevealVisuals();
    setSession(null);
    setPlaying(null);
    setPendingGuess(null);
    setTerminalResult(null);
    setResultPopupOpen(false);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
    terminalPopupEligibleRef.current = false;
    setErrorMessage(prev => String(prev || "").trim() || "Vault update failed. Adjust play and press PLAY.");
  }

  useEffect(() => {
    if (uiState !== UI_STATE.TERMINAL) return;
    const tr = terminalResult;
    const sid = session?.id;
    const settlementSummary = tr?.settlementSummary;
    if (!sid || !settlementSummary) return;
    applyHighLowCardsSettlementOnce(sid, settlementSummary).then(sr => {
      if (!sr) return;
      const authoritativeBalance = Math.max(0, Number(sr.nextBalance || 0));
      setVaultBalance(authoritativeBalance);
      if (sr.error) {
        setErrorMessage(sr.error);
        setSessionNotice("Result resolved, but vault update failed.");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = window.setTimeout(() => {
          resetRoundAfterResultPopup();
        }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
        return;
      }
      const entryCost = Number(settlementSummary.entryCost || HIGH_LOW_CARDS_MIN_WAGER);
      const payoutReturn = Number(settlementSummary.payoutReturn || 0);
      const won = Boolean(tr?.isWin);
      const streakN = Number(tr?.streak ?? 0);
      if (sr.applied) {
        setStats(prev => ({
          ...prev,
          totalGames: prev.totalGames + 1,
          wins: prev.wins + (won ? 1 : 0),
          losses: prev.losses + (won ? 0 : 1),
          totalPlay: prev.totalPlay + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
          totalWon: prev.totalWon + payoutReturn,
          biggestWin: Math.max(prev.biggestWin, won ? payoutReturn : 0),
          maxStreak: Math.max(prev.maxStreak, streakN),
        }));
      }
      const delta = Number(settlementSummary.netDelta || 0);
      const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
      if (sr.applied) {
        setSessionNotice(`Settled (${deltaLabel}). Vault: ${authoritativeBalance}.`);
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
    uiState,
    terminalResult?.settlementSummary,
    session?.id,
    terminalResult?.isWin,
    terminalResult?.streak,
    openResultPopup,
  ]);

  async function bootstrapSession(wager, activeCycle, createSessionMode, giftMeta) {
    const isGiftRound = Boolean(giftMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    terminalPopupEligibleRef.current = false;
    setTerminalResult(null);
    resetRevealVisuals();

    try {
      const body = { gameKey: GAME_KEY, sessionMode: createSessionMode, entryAmount: wager };
      let response = await fetch("/api/solo-v2/sessions/create", {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": SOLO_V2_PLAYER },
        body: JSON.stringify(body),
      });
      let payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      let result = classifySoloV2ApiResult(response, payload);
      let status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "conflict_active_sessions") {
        recoverToIdle("");
        setErrorMessage("Session sync issue — retrying…");
        await new Promise(r => setTimeout(r, 480));
        if (activeCycle !== cycleRef.current) return { ok: false };
        response = await fetch("/api/solo-v2/sessions/create", {
          method: "POST",
          headers: { "content-type": "application/json", "x-solo-v2-player": SOLO_V2_PLAYER },
          body: JSON.stringify(body),
        });
        payload = await response.json().catch(() => null);
        if (activeCycle !== cycleRef.current) return { ok: false };
        result = classifySoloV2ApiResult(response, payload);
        status = String(payload?.status || "");
      }

      if (result === SOLO_V2_API_RESULT.SUCCESS && (status === "created" || status === "existing_session") && payload?.session) {
        if (isGiftRound) {
          if (status === "created" && !soloV2GiftConsumeOne()) {
            setUiState(UI_STATE.IDLE);
            setErrorMessage("No gift available.");
            return { ok: false };
          }
          if (status === "existing_session" && payload.session.sessionMode !== SOLO_V2_SESSION_MODE.FREEPLAY) {
            setUiState(UI_STATE.IDLE);
            setErrorMessage("Finish your paid run before using a gift.");
            return { ok: false };
          }
          giftMeta?.onGiftConsumed?.();
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => giftMeta?.onGiftConsumed?.());
          }
        }

        const sid = payload.session.id;
        writeStoredSessionId(sid);
        const truth = await readSessionTruth(sid, activeCycle);
        if (truth?.halted || activeCycle !== cycleRef.current) return { ok: false };
        if (!truth?.ok) {
          clearStoredSessionId();
          setUiState(truth.state);
          setErrorMessage(truth.message);
          return { ok: false };
        }
        if (sessionTruthIsDead(truth.session, truth.readStatus)) {
          clearStoredSessionId();
          recoverToIdle("Session not usable.");
          return { ok: false };
        }
        applySessionFromTruth(truth.session);
        return { ok: true };
      }

      if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) {
        setUiState(UI_STATE.PENDING_MIGRATION);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Migration is pending."));
        return { ok: false };
      }
      if (result === SOLO_V2_API_RESULT.UNAVAILABLE) {
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Create unavailable."));
        return { ok: false };
      }
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Create rejected."));
      return { ok: false };
    } catch {
      if (activeCycle !== cycleRef.current) return { ok: false };
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error.");
      return { ok: false };
    } finally {
      if (activeCycle === cycleRef.current) createInFlightRef.current = false;
    }
  }

  async function handleStartPlay() {
    if (createInFlightRef.current || actionInFlightRef.current || revealAnimatingRef.current) return;
    if (!vaultReady) {
      setErrorMessage("Vault unavailable.");
      return;
    }
    if (uiState === UI_STATE.TERMINAL) {
      handlePlayAgain();
    }
    const isGiftRound = giftRoundRef.current;
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < HIGH_LOW_CARDS_MIN_WAGER) return;
    if (!isGiftRound && vaultBalance < wager) {
      setErrorMessage(`Need at least ${wager} in vault.`);
      return;
    }

    cycleRef.current += 1;
    const c = cycleRef.current;
    const mode = isGiftRound ? SOLO_V2_SESSION_MODE.FREEPLAY : SOLO_V2_SESSION_MODE.STANDARD;

    try {
      const boot = await bootstrapSession(wager, c, mode, {
        isGiftRound,
        onGiftConsumed: () => giftRefreshRef.current?.(),
      });
      if (isGiftRound && boot?.ok && typeof window !== "undefined" && window.requestAnimationFrame) {
        giftRefreshRef.current?.();
        window.requestAnimationFrame(() => giftRefreshRef.current?.());
      }
    } finally {
      if (isGiftRound) giftRoundRef.current = false;
    }
  }

  async function submitGuessAndResolve(guess) {
    const sid = sessionRef.current?.id;
    if (!sid || actionInFlightRef.current || revealAnimatingRef.current) return;
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    actionInFlightRef.current = true;
    cycleRef.current += 1;
    const c = cycleRef.current;
    setUiState(UI_STATE.RESOLVING);
    setErrorMessage("");
    resetRevealVisuals();

    try {
      let response = await fetch(`/api/solo-v2/sessions/${sid}/event`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": SOLO_V2_PLAYER },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: { gameKey: GAME_KEY, action: "high_low_cards_guess", guess },
        }),
      });
      let payload = await response.json().catch(() => null);
      if (c !== cycleRef.current) return;
      let result = classifySoloV2ApiResult(response, payload);
      let status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "turn_pending") {
        const truth = await readSessionTruth(sid, c);
        if (truth?.ok && !sessionTruthIsDead(truth.session, truth.readStatus)) {
          applySessionFromTruth(truth.session);
          setSessionNotice("Finish the pending turn first.");
        }
        setUiState(UI_STATE.PLAYING);
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "choice_already_submitted") {
        const truth = await readSessionTruth(sid, c);
        if (!truth?.ok || sessionTruthIsDead(truth.session, truth.readStatus)) {
          recoverToIdle(truth?.message || "Session no longer valid.");
          return;
        }
        applySessionFromTruth(truth.session);
        if (truth.session?.highLowCards?.canResolveTurn) {
          await resolveTurn(sid, c);
        }
        return;
      }

      if (!(result === SOLO_V2_API_RESULT.SUCCESS && status === "accepted")) {
        if (result === SOLO_V2_API_RESULT.CONFLICT && status === "event_rejected") {
          const msg = buildSoloV2ApiErrorMessage(payload, "");
          if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
            recoverToIdle(msg);
            return;
          }
        }
        setUiState(UI_STATE.PLAYING);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Guess rejected."));
        return;
      }

      await resolveTurn(sid, c);
    } finally {
      if (c === cycleRef.current) actionInFlightRef.current = false;
    }
  }

  async function resolveTurn(sid, c) {
    const response = await fetch("/api/solo-v2/high-low-cards/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-solo-v2-player": SOLO_V2_PLAYER },
      body: JSON.stringify({ sessionId: sid }),
    });
    const payload = await response.json().catch(() => null);
    if (c !== cycleRef.current) return;
    const result = classifySoloV2ApiResult(response, payload);
    const status = String(payload?.status || "");

    if (result === SOLO_V2_API_RESULT.SUCCESS && status === "turn_complete" && payload?.result?.won) {
      const next = payload.result.nextCard;
      const newStreak = Number(payload.result.streak ?? 0);
      revealAnimatingRef.current = true;
      setRevealAnimating(true);
      setRevealFaceUp(false);
      setRevealCardData(next);
      setRevealOutcome("win");
      setUiState(UI_STATE.RESOLVING);
      await sleep(260);
      if (c !== cycleRef.current) {
        resetRevealVisuals();
        return;
      }
      setRevealFaceUp(true);
      await sleep(480);
      if (c !== cycleRef.current) {
        resetRevealVisuals();
        return;
      }
      await sleep(420);
      if (c !== cycleRef.current) {
        resetRevealVisuals();
        return;
      }
      const truth = await readSessionTruth(sid, c);
      if (truth?.ok) applySessionFromTruth(truth.session, { preserveReveal: false });
      resetRevealVisuals();
      setUiState(UI_STATE.PLAYING);
      setSessionNotice(`Streak ${newStreak} — nice hit. Cash out or push your luck.`);
      return;
    }

    if (result === SOLO_V2_API_RESULT.SUCCESS && status === "session_lost") {
      const next = payload?.result?.nextCard || null;
      revealAnimatingRef.current = true;
      setRevealAnimating(true);
      setRevealFaceUp(false);
      setRevealCardData(next);
      setRevealOutcome("loss");
      setUiState(UI_STATE.RESOLVING);
      await sleep(240);
      if (c !== cycleRef.current) {
        resetRevealVisuals();
        return;
      }
      setRevealFaceUp(true);
      await sleep(720);
      if (c !== cycleRef.current) {
        resetRevealVisuals();
        return;
      }
      clearStoredSessionId();
      resetRevealVisuals();
      setTerminalResult({
        terminalKind: "loss",
        streak: Number(payload?.result?.streak ?? 0),
        settlementSummary: payload?.result?.settlementSummary,
        lastNextCard: next,
        isWin: false,
      });
      setSession(prev => (prev ? { ...prev, sessionStatus: "resolved" } : prev));
      terminalPopupEligibleRef.current = true;
      setUiState(UI_STATE.TERMINAL);
      setSessionNotice("Wrong call — run ended.");
      return;
    }

    if (result === SOLO_V2_API_RESULT.SUCCESS && status === "turn_complete" && payload?.idempotent) {
      resetRevealVisuals();
      const truth = await readSessionTruth(sid, c);
      if (truth?.ok) applySessionFromTruth(truth.session);
      setUiState(UI_STATE.PLAYING);
      return;
    }

    resetRevealVisuals();
    const truth = await readSessionTruth(sid, c);
    if (truth?.ok) applySessionFromTruth(truth.session);
    setUiState(UI_STATE.PLAYING);
    setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Could not resolve turn."));
  }

  resolveTurnRef.current = resolveTurn;

  useEffect(() => {
    const sid = session?.id;
    const cr = session?.highLowCards?.canResolveTurn;
    if (!sid || !cr || actionInFlightRef.current || createInFlightRef.current || revealAnimatingRef.current) return;

    cycleRef.current += 1;
    const cycle = cycleRef.current;
    actionInFlightRef.current = true;
    setUiState(UI_STATE.RESOLVING);

    let cancelled = false;
    (async () => {
      await resolveTurnRef.current(sid, cycle);
      if (!cancelled && cycle === cycleRef.current) actionInFlightRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.highLowCards?.canResolveTurn]);

  async function handleCashOut() {
    const sid = sessionRef.current?.id;
    if (!sid || actionInFlightRef.current || revealAnimatingRef.current) return;
    if (!playing?.canCashOut && !session?.highLowCards?.canCashOut) {
      setErrorMessage("Nothing to cash out yet.");
      return;
    }
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    actionInFlightRef.current = true;
    cycleRef.current += 1;
    const c = cycleRef.current;
    setUiState(UI_STATE.RESOLVING);
    setErrorMessage("");

    try {
      const response = await fetch("/api/solo-v2/high-low-cards/cash-out", {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": SOLO_V2_PLAYER },
        body: JSON.stringify({ sessionId: sid }),
      });
      const payload = await response.json().catch(() => null);
      if (c !== cycleRef.current) return;
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "cashed_out" && payload?.result) {
        clearStoredSessionId();
        setTerminalResult({
          terminalKind: "cashout",
          streak: Number(payload.result.streak ?? 0),
          settlementSummary: payload.result.settlementSummary,
          isWin: true,
        });
        setSession(prev => (prev ? { ...prev, sessionStatus: "resolved" } : prev));
        terminalPopupEligibleRef.current = true;
        setUiState(UI_STATE.TERMINAL);
        setSessionNotice("Cashed out.");
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "turn_pending") {
        const truth = await readSessionTruth(sid, c);
        if (truth?.ok) applySessionFromTruth(truth.session);
        setErrorMessage("Resolve your current guess before cashing out.");
        setUiState(UI_STATE.PLAYING);
        return;
      }

      const truth = await readSessionTruth(sid, c);
      if (truth?.ok) applySessionFromTruth(truth.session);
      setUiState(UI_STATE.PLAYING);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Cash-out failed."));
    } finally {
      if (c === cycleRef.current) actionInFlightRef.current = false;
    }
  }

  function handlePlayAgain() {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    terminalPopupEligibleRef.current = false;
    clearStoredSessionId();
    setSession(null);
    setPlaying(null);
    setTerminalResult(null);
    resetRevealVisuals();
    setUiState(UI_STATE.IDLE);
    setErrorMessage("");
    setSessionNotice("");
  }

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= HIGH_LOW_CARDS_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.TERMINAL;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= HIGH_LOW_CARDS_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to play.`
    : "";

  const canStart =
    wagerPlayable &&
    !revealAnimating &&
    ![UI_STATE.LOADING, UI_STATE.RESOLVING, UI_STATE.PLAYING, UI_STATE.PENDING_MIGRATION].includes(uiState);

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (/Session expired\.|Session ended\.|Press PLAY|no longer valid/i.test(s)) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const currentCard = playing?.currentCard;
  const streak = Number(playing?.streak ?? 0);
  const mult = Number(playing?.multiplier ?? 1);
  const potentialWin =
    session?.entryAmount != null ? payoutFromEntryAndStreak(Number(session.entryAmount), streak) : 0;

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= HIGH_LOW_CARDS_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;
  const inActiveRunUi = uiState === UI_STATE.PLAYING || uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING;

  let summaryPlay = numericWager;
  let summaryWin = payoutFromEntryAndStreak(Math.max(HIGH_LOW_CARDS_MIN_WAGER, numericWager), 0);
  if (runEntryFromSession != null && inActiveRunUi) {
    summaryPlay = runEntryFromSession;
    summaryWin = potentialWin;
  }

  if (uiState === UI_STATE.TERMINAL && terminalResult?.settlementSummary) {
    const ss = terminalResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const trPopup = terminalResult;
  const wonPopup = Boolean(trPopup?.isWin);
  const tkPopup = String(trPopup?.terminalKind || "");
  const prPopup = Math.max(0, Math.floor(Number(trPopup?.settlementSummary?.payoutReturn) || 0));
  const deltaPopup = Number(trPopup?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabelPopup =
    trPopup?.settlementSummary != null ? `${deltaPopup > 0 ? "+" : ""}${formatCompact(deltaPopup)}` : "";
  let popupTitle = wonPopup ? "BANKED" : "RUN OVER";
  let popupLine2 = "—";
  let popupLine3 = "—";
  if (trPopup) {
    popupLine2 = `Return ${formatCompact(prPopup)}`;
    const st = Math.max(0, Math.floor(Number(trPopup.streak ?? 0)));
    if (wonPopup) {
      popupLine3 = tkPopup === "cashout" ? `CASH OUT · STREAK ${st}` : `STREAK ${st}`;
    } else if (trPopup?.lastNextCard?.rank) {
      const r = trPopup.lastNextCard.rank;
      const su = trPopup.lastNextCard.suit || "♠";
      popupLine3 = `NEXT ${r}${su} · MISS`;
    } else {
      popupLine3 = "MISS";
    }
    if (tkPopup === "cashout" && wonPopup) popupTitle = "EXITED";
  }
  const resultTonePopup = wonPopup ? "win" : "lose";

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

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || actionInFlightRef.current || revealAnimatingRef.current) return;
    if (
      [UI_STATE.LOADING, UI_STATE.RESOLVING, UI_STATE.PLAYING, UI_STATE.PENDING_MIGRATION].includes(uiState)
    ) {
      return;
    }
    giftRoundRef.current = true;
    void handleStartPlay();
  }, [vaultReady, giftShell.giftCount, uiState]);

  const isRunActive = uiState === UI_STATE.PLAYING || uiState === UI_STATE.RESOLVING;
  const busyFooter = uiState === UI_STATE.LOADING || (isRunActive && uiState === UI_STATE.RESOLVING);
  const primaryLabel = uiState === UI_STATE.PLAYING ? "Run in progress" : "PLAY";
  const guessControlsLocked =
    Boolean(pendingGuess) || uiState === UI_STATE.RESOLVING || revealAnimating;
  const showGuessActionRow = (uiState === UI_STATE.PLAYING || uiState === UI_STATE.RESOLVING) && playing;

  let payoutBandLabel = "Potential return";
  let payoutBandValue = formatCompact(payoutFromEntryAndStreak(Math.max(HIGH_LOW_CARDS_MIN_WAGER, numericWager), 0));
  let payoutCaption = "Each correct call adds +0.206 to the multiplier · Ace is high";

  if (inActiveRunUi && playing) {
    payoutBandLabel = "Current bank";
    payoutBandValue = formatCompact(potentialWin);
    payoutCaption =
      streak > 0
        ? `Streak ${streak} · ×${mult.toFixed(3)} — cash out banks this return`
        : "Hit higher or lower to start your streak";
  }

  if (uiState === UI_STATE.TERMINAL && terminalResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(terminalResult.settlementSummary.payoutReturn ?? 0)));
    const won = Boolean(terminalResult.isWin);
    payoutBandLabel = won ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    const tk = String(terminalResult.terminalKind || "");
    if (tk === "cashout") payoutCaption = "Cashed out — secured return";
    else if (tk === "loss") payoutCaption = "Miss — run ended";
    else payoutCaption = "Round settled";
  }

  const streakForStrip = uiState === UI_STATE.TERMINAL ? Number(terminalResult?.streak ?? 0) : streak;
  const strip = highLowStripModel(uiState, streakForStrip);
  const stepLabels = Array.from({ length: strip.stepTotal }, (_, i) => String(i + 1));

  return (
    <SoloV2GameShell
      title="Hi-Lo Cards"
      subtitle="Higher, lower, build streak."
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
        canEditPlay: !isRunActive && uiState !== UI_STATE.LOADING,
        compactAmountDisplayWhenBlurred: true,
        formatPresetLabel: v => formatCompact(v),
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            return String(Math.min(MAX_WAGER, Math.max(0, c - HIGH_LOW_CARDS_MIN_WAGER)));
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
          setWagerInput(String(HIGH_LOW_CARDS_MIN_WAGER));
        },
        primaryActionLabel: primaryLabel,
        primaryActionDisabled: !canStart,
        primaryActionLoading: uiState === UI_STATE.LOADING || (isRunActive && uiState === UI_STATE.RESOLVING),
        primaryLoadingLabel: uiState === UI_STATE.LOADING ? "STARTING…" : "RESOLVING…",
        onPrimaryAction: () => {
          void handleStartPlay();
        },
        errorMessage: errorMessage || stakeHint,
        desktopPayout: {
          label: payoutBandLabel,
          value: payoutBandValue,
        },
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <div className="solo-v2-route-stack relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
          {/* Hi-Lo intentionally uses DicePickBoard `mergedPlayfieldSlot` (card + guess UI) instead of dice/choice columns — do not revert to the default two-slot layout in “consistency” passes. */}
          <DicePickBoard
            progressStripKeyPrefix="high-low-cards"
            sessionNotice={sessionNotice}
            statusTop=""
            statusSub=""
            hideBoardStatusStack
            stepTotal={strip.stepTotal}
            currentStepIndex={strip.currentStepIndex}
            stepsComplete={strip.stepsComplete}
            stepLabels={stepLabels}
            payoutBandLabel={payoutBandLabel}
            payoutBandValue={payoutBandValue}
            payoutCaption={payoutCaption}
            hideMobilePayoutBand
            mergedPlayfieldSlot={
              <HighLowCardsMergedPlayfield
                currentCard={currentCard}
                revealCardData={revealCardData}
                revealFaceUp={revealFaceUp}
                revealOutcome={revealOutcome}
                resolving={uiState === UI_STATE.RESOLVING}
                uiState={uiState}
                playing={playing}
                guessControlsLocked={guessControlsLocked}
                showActionRow={showGuessActionRow}
                onHigh={() => void submitGuessAndResolve("high")}
                onLow={() => void submitGuessAndResolve("low")}
                onCashOut={() => void handleCashOut()}
              />
            }
          />

          <SoloV2ResultPopup
            open={resultPopupOpen}
            isWin={wonPopup}
            resultTone={resultTonePopup}
            animationKey={`${popupTitle}-${popupLine2}-${resultVaultLabelPopup}`}
            vaultSlot={
              resultPopupOpen ? (
                <SoloV2ResultPopupVaultLine
                  isWin={wonPopup}
                  tone={resultTonePopup}
                  deltaLabel={resultVaultLabelPopup}
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
      }
      helpContent={
        <div className="space-y-2">
          <p>1. Set play and press PLAY — server deals your starting card.</p>
          <p>2. Tap HIGHER or LOWER (or CASH OUT after at least one win).</p>
          <p>3. Each correct guess advances streak; multiplier grows by +0.206 per win (legacy rule).</p>
          <p>4. Wrong guess ends the run; vault settles from server result.</p>
          <p>
            Gift rounds use freeplay — a loss does not debit your vault; a win credits the full payout. After the result
            popup closes, the final cards stay visible — press PLAY explicitly for the next run; there is no auto-start or
            auto-chain.
          </p>
        </div>
      }
      statsContent={
        <div className="space-y-2">
          <p>Total games: {stats.totalGames}</p>
          <p>Wins: {stats.wins}</p>
          <p>Losses: {stats.losses}</p>
          <p>Win rate: {stats.totalGames ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : "0.0"}%</p>
          <p>Max streak: {stats.maxStreak}</p>
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
