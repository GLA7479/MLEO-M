import { useCallback, useEffect, useRef, useState } from "react";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
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

function PlayingCard({ rank, suit, tone = "neutral", className = "" }) {
  const isRed = suit === "♥" || suit === "♦";
  const color = isRed ? "text-red-500" : "text-zinc-100";
  const ring =
    tone === "win"
      ? "ring-2 ring-emerald-400/90 shadow-[0_0_24px_rgba(52,211,153,0.35)]"
      : tone === "loss"
        ? "ring-2 ring-rose-500/90 shadow-[0_0_22px_rgba(244,63,94,0.35)]"
        : "border-white/20 shadow-lg";
  return (
    <div
      className={`relative flex h-44 w-28 flex-col rounded-xl border-2 bg-zinc-900/90 sm:h-52 sm:w-36 ${ring} ${className}`}
    >
      <div className={`absolute left-2 top-2 flex flex-col leading-none ${color}`}>
        <span className="text-2xl font-serif font-bold sm:text-3xl">{rank}</span>
        <span className="text-xl font-serif sm:text-2xl">{suit}</span>
      </div>
      <div className={`absolute bottom-2 right-2 flex rotate-180 flex-col leading-none ${color}`}>
        <span className="text-2xl font-serif font-bold sm:text-3xl">{rank}</span>
        <span className="text-xl font-serif sm:text-2xl">{suit}</span>
      </div>
    </div>
  );
}

function CardBackFace({ className = "" }) {
  return (
    <div
      className={`relative flex h-44 w-28 flex-col rounded-xl border-2 border-indigo-400/50 bg-gradient-to-br from-indigo-950 via-zinc-900 to-violet-950 shadow-inner sm:h-52 sm:w-36 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_45%)]" />
      <span className="m-auto select-none text-4xl opacity-90 drop-shadow-lg sm:text-5xl" aria-hidden>
        🃏
      </span>
      <span className="absolute bottom-2 left-0 right-0 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-200/50">
        Hi-Lo
      </span>
    </div>
  );
}

/** Opacity + scale reveal: back → face, with outcome tint after face-up. */
function NextCardReveal({ card, faceUp, outcome }) {
  if (!card?.rank) return null;
  const tone = faceUp ? (outcome === "win" ? "win" : outcome === "loss" ? "loss" : "neutral") : "neutral";
  return (
    <div className="relative flex h-44 w-28 shrink-0 flex-col items-center justify-center sm:h-52 sm:w-36">
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out ${
          faceUp ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <CardBackFace />
      </div>
      <div
        className={`transition-all ease-out ${
          faceUp ? "scale-100 opacity-100" : "pointer-events-none scale-[0.92] opacity-0"
        }`}
        style={{ transitionDuration: "450ms" }}
      >
        <PlayingCard rank={card.rank} suit={card.suit || "♠"} tone={tone} />
      </div>
      {faceUp && outcome === "win" ? (
        <div className="pointer-events-none absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500/95 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-white shadow-md ring-1 ring-emerald-200/60">
          Hit
        </div>
      ) : null}
      {faceUp && outcome === "loss" ? (
        <div className="pointer-events-none absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-600/95 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-white shadow-md ring-1 ring-rose-200/50">
          Miss
        </div>
      ) : null}
    </div>
  );
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
  const [, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(HIGH_LOW_CARDS_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readStats);
  const [resultToast, setResultToast] = useState(null);
  const toastTimerRef = useRef(null);
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
  const [streakPulse, setStreakPulse] = useState(0);

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
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
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

  useEffect(() => {
    if (uiState !== UI_STATE.TERMINAL) return undefined;
    const tr = terminalResult;
    const sid = session?.id;
    const settlementSummary = tr?.settlementSummary;
    if (!sid || !settlementSummary) return undefined;
    let cancelled = false;
    applyHighLowCardsSettlementOnce(sid, settlementSummary).then(sr => {
      if (cancelled || !sr) return;
      setVaultBalance(Number(sr.nextBalance || 0));
      if (sr.error) {
        setErrorMessage(sr.error);
        setSessionNotice("Round ended, but vault update failed.");
        handlePlayAgain();
        return;
      }
      const entryCost = Number(settlementSummary.entryCost || HIGH_LOW_CARDS_MIN_WAGER);
      const payoutReturn = Number(settlementSummary.payoutReturn || 0);
      const won = Boolean(tr?.isWin);
      if (sr.applied) {
        setStats(prev => ({
          ...prev,
          totalGames: prev.totalGames + 1,
          wins: prev.wins + (won ? 1 : 0),
          losses: prev.losses + (won ? 0 : 1),
          totalPlay: prev.totalPlay + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
          totalWon: prev.totalWon + payoutReturn,
          biggestWin: Math.max(prev.biggestWin, won ? payoutReturn : 0),
          maxStreak: Math.max(prev.maxStreak, Number(tr?.streak || 0)),
        }));
      }
      const delta = Number(settlementSummary.netDelta || 0);
      const line2 = won
        ? tr?.terminalKind === "cashout"
          ? `Cashed out · ${tr?.streak ?? 0} streak · +${formatCompact(payoutReturn)}`
          : `Run won · ${tr?.streak ?? 0} streak · +${formatCompact(payoutReturn)}`
        : tr?.lastNextCard?.rank
          ? `Next card ${tr.lastNextCard.rank}${tr.lastNextCard.suit || "♠"} · streak lost`
          : "Better luck next run";
      setResultToast({
        isWin: won,
        title: won ? "BANKED" : "RUN OVER",
        line2,
        vaultDeltaLabel: `${delta >= 0 ? "+" : ""}${formatCompact(delta)}`,
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        setResultToast(null);
        handlePlayAgain();
      }, 2000);
    });
    return () => {
      cancelled = true;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [uiState, terminalResult?.settlementSummary, session?.id, terminalResult?.isWin, terminalResult?.streak]);

  async function bootstrapSession(wager, activeCycle, createSessionMode, giftMeta) {
    const isGiftRound = Boolean(giftMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
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
      await bootstrapSession(wager, c, mode, {
        isGiftRound,
        onGiftConsumed: () => giftRefreshRef.current?.(),
      });
    } finally {
      if (isGiftRound) giftRoundRef.current = false;
    }
  }

  async function submitGuessAndResolve(guess) {
    const sid = sessionRef.current?.id;
    if (!sid || actionInFlightRef.current || revealAnimatingRef.current) return;
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
      setStreakPulse(newStreak);
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
      setTimeout(() => setStreakPulse(0), 900);
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
  const canStart =
    wagerPlayable &&
    !revealAnimating &&
    uiState !== UI_STATE.LOADING &&
    uiState !== UI_STATE.RESOLVING &&
    uiState !== UI_STATE.PLAYING &&
    uiState !== UI_STATE.TERMINAL;

  const currentCard = playing?.currentCard;
  const streak = Number(playing?.streak ?? 0);
  const mult = Number(playing?.multiplier ?? 1);
  const potentialWin =
    session?.entryAmount != null ? payoutFromEntryAndStreak(Number(session.entryAmount), streak) : 0;

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
    if (!vaultReady || giftShell.giftCount < 1) return;
    if ([UI_STATE.LOADING, UI_STATE.RESOLVING, UI_STATE.PLAYING, UI_STATE.PENDING_MIGRATION].includes(uiState)) return;
    if (revealAnimatingRef.current) return;
    giftRoundRef.current = true;
    void handleStartPlay();
  }, [vaultReady, giftShell.giftCount, uiState]);

  const isRunActive = uiState === UI_STATE.PLAYING || uiState === UI_STATE.RESOLVING;
  const primaryLabel =
    uiState === UI_STATE.TERMINAL ? "PLAY" : uiState === UI_STATE.PLAYING ? "Run in progress" : "PLAY";
  const guessControlsLocked =
    Boolean(pendingGuess) || uiState === UI_STATE.RESOLVING || revealAnimating;
  const hiLoBottomSlotActive =
    ((uiState === UI_STATE.PLAYING || uiState === UI_STATE.RESOLVING) && playing) ||
    (uiState === UI_STATE.TERMINAL && terminalResult);

  return (
    <SoloV2GameShell
      title="Hi-Lo Cards"
      subtitle="Arcade Solo"
      gameplayScrollable={false}
      menuVaultBalance={vaultBalance}
      gift={{ ...giftShell, onGiftClick: handleGiftPlay }}
      hideStatusPanel
      hideActionBar
      onBack={() => {
        if (typeof window !== "undefined") window.location.href = "/arcade-v2";
      }}
      topGameStatsSlot={
        <>
          <span className="shrink-0 whitespace-nowrap text-zinc-500">
            Play <span className="font-semibold tabular-nums text-amber-200/90">{formatCompact(numericWager)}</span>
          </span>
          <span className="shrink-0 text-zinc-600" aria-hidden>
            ·
          </span>
          <span className="shrink-0 whitespace-nowrap text-zinc-500">
            Win <span className="font-semibold tabular-nums text-lime-200/90">{formatCompact(potentialWin)}</span>
          </span>
        </>
      }
      soloV2Footer={{
        betPresets: BET_PRESETS,
        wagerInput,
        wagerNumeric: numericWager,
        canEditPlay: !isRunActive && uiState !== UI_STATE.TERMINAL,
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
        primaryActionDisabled: uiState === UI_STATE.TERMINAL ? true : !canStart,
        primaryActionLoading: uiState === UI_STATE.LOADING || (isRunActive && uiState === UI_STATE.RESOLVING),
        primaryLoadingLabel: uiState === UI_STATE.LOADING ? "STARTING..." : "RESOLVING...",
        onPrimaryAction: () => {
          void handleStartPlay();
        },
        errorMessage,
      }}
      gameplaySlot={
        <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden px-2 pt-1 text-center sm:max-w-lg">
          {/* Same column contract as quick-flip: flex-1 main stage + shrink-0 control strip with only pb-2/sm:pb-3 above footer */}
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-1 shrink-0 text-[10px] leading-snug text-zinc-400 sm:text-xs">
              See the base card, then call higher or lower. Each win raises your streak and multiplier (+0.206 per win,
              legacy curve). Cash out anytime after at least one win.
            </p>

            {/* Fixed-height status band: streak / resolving never change layout height */}
            <div
              className="relative mx-auto w-full max-w-sm shrink-0 text-zinc-500"
              style={{ minHeight: "2.875rem" }}
              aria-live="polite"
            >
              <div className="flex h-5 items-center justify-center gap-1 text-[11px] leading-none sm:text-xs">
                {isRunActive ? (
                  <>
                    <span className="font-semibold uppercase tracking-wide text-zinc-400">Run active</span>
                    <span className="text-zinc-600" aria-hidden>
                      ·
                    </span>
                    <span>
                      Streak{" "}
                      <span
                        className={`inline-block font-bold tabular-nums transition-all duration-300 ${
                          streakPulse > 0
                            ? "scale-110 text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.45)]"
                            : "text-amber-200/90"
                        }`}
                      >
                        {streak}
                      </span>
                    </span>
                    <span className="text-zinc-600" aria-hidden>
                      ·
                    </span>
                    <span className="tabular-nums">×{mult.toFixed(3)}</span>
                  </>
                ) : (
                  <span className="invisible select-none tabular-nums" aria-hidden>
                    Run active · Streak 0 · ×1.000
                  </span>
                )}
              </div>
              <div className="relative flex h-4 items-center justify-center">
                {isRunActive && uiState === UI_STATE.RESOLVING ? (
                  <span className="text-[9px] font-medium uppercase tracking-wider text-indigo-300/90 sm:text-[10px]">
                    Resolving turn…
                  </span>
                ) : (
                  <span className="invisible text-[9px] leading-none sm:text-[10px]" aria-hidden>
                    Resolving
                  </span>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-center py-3 sm:py-5">
              <div className="flex w-full shrink-0 items-start justify-center gap-2 sm:gap-3">
                {currentCard?.rank ? <PlayingCard rank={currentCard.rank} suit={currentCard.suit || "♠"} /> : null}
                {revealCardData?.rank ? (
                  <NextCardReveal card={revealCardData} faceUp={revealFaceUp} outcome={revealOutcome} />
                ) : uiState === UI_STATE.RESOLVING ? (
                  <div className="flex h-44 w-28 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-600/50 bg-zinc-900/40 sm:h-52 sm:w-36">
                    <span className="px-1 text-[9px] font-medium uppercase tracking-wide text-zinc-500">Next card</span>
                    <span className="mt-0.5 text-[10px] text-zinc-400 animate-pulse sm:text-xs">Drawing…</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Fixed-height strip: buttons while playing; empty reserved height in terminal (popup carries result copy) */}
            <div className="w-full shrink-0 pb-2 sm:pb-3">
              {hiLoBottomSlotActive ? (
                <div className="flex h-[4.5rem] w-full flex-col justify-center overflow-hidden sm:h-[4.75rem]">
                  {(uiState === UI_STATE.PLAYING || uiState === UI_STATE.RESOLVING) && playing ? (
                    <div className="grid w-full grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={uiState !== UI_STATE.PLAYING || guessControlsLocked}
                        onClick={() => void submitGuessAndResolve("high")}
                        className="h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-xs font-bold text-white shadow-md disabled:pointer-events-none disabled:opacity-40 sm:h-12 sm:text-sm"
                      >
                        HIGHER
                      </button>
                      <button
                        type="button"
                        disabled={uiState !== UI_STATE.PLAYING || !playing?.canCashOut || guessControlsLocked}
                        onClick={() => void handleCashOut()}
                        className="h-11 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 text-xs font-bold text-white shadow-md disabled:pointer-events-none disabled:opacity-30 sm:h-12 sm:text-sm"
                      >
                        CASH OUT
                      </button>
                      <button
                        type="button"
                        disabled={uiState !== UI_STATE.PLAYING || guessControlsLocked}
                        onClick={() => void submitGuessAndResolve("low")}
                        className="h-11 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 text-xs font-bold text-white shadow-md disabled:pointer-events-none disabled:opacity-40 sm:h-12 sm:text-sm"
                      >
                        LOWER
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <SoloV2ResultPopup
            open={Boolean(resultToast)}
            isWin={Boolean(resultToast?.isWin)}
            animationKey={`${resultToast?.title ?? ""}-${resultToast?.vaultDeltaLabel ?? ""}`}
            vaultSlot={
              resultToast ? (
                <SoloV2ResultPopupVaultLine
                  isWin={resultToast.isWin}
                  deltaLabel={resultToast.vaultDeltaLabel}
                />
              ) : undefined
            }
          >
            <div className="text-[13px] font-black uppercase tracking-wide">{resultToast?.title}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">
              {resultToast?.line2}
            </div>
          </SoloV2ResultPopup>
        </div>
      }
      helpContent={
        <div className="space-y-2">
          <p>1. Set play and press PLAY — server deals your starting card.</p>
          <p>2. Tap HIGHER or LOWER (or CASH OUT after at least one win).</p>
          <p>3. Each correct guess advances streak; multiplier grows by +0.206 per win (legacy rule).</p>
          <p>4. Wrong guess ends the run; vault settles from server result.</p>
        </div>
      }
      statsContent={
        <div className="space-y-2">
          <p>Total games: {stats.totalGames}</p>
          <p>Win rate: {stats.totalGames ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : "0.0"}%</p>
          <p>Max streak: {stats.maxStreak}</p>
          <p>Total play: {formatCompact(stats.totalPlay)}</p>
          <p>Total won: {formatCompact(stats.totalWon)}</p>
        </div>
      }
      resultState={null}
    />
  );
}
