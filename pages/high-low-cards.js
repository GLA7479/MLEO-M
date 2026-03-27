import { useCallback, useEffect, useRef, useState } from "react";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import {
  SOLO_V2_GIFT_ROUND_STAKE,
  soloV2GiftConsumeOne,
} from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import { HIGH_LOW_CARDS_MIN_WAGER, HIGH_LOW_CARDS_WIN_MULTIPLIER } from "../lib/solo-v2/highLowCardsConfig";
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

const STATS_KEY = "solo_v2_high_low_cards_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function readHighLowStats() {
  if (typeof window === "undefined") {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
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
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
  }
}

function writeHighLowStats(nextStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
  } catch {
    // ignore
  }
}

function rankLabel(n) {
  if (!Number.isFinite(Number(n))) return "—";
  const r = Math.floor(Number(n));
  if (r === 1) return "A";
  if (r >= 2 && r <= 10) return String(r);
  if (r === 11) return "J";
  if (r === 12) return "Q";
  if (r === 13) return "K";
  return String(r);
}

function GuessButton({ value, label, selectedGuess, disabled, onSelect }) {
  const isSelected = selectedGuess === value;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className={`flex min-h-[72px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-extrabold transition sm:min-h-[84px] ${
        isSelected
          ? "border-sky-400/55 bg-sky-500/25 text-sky-50 shadow-md shadow-sky-900/25"
          : "border-white/25 bg-white/[0.06] text-zinc-100 hover:bg-white/12"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="text-xl sm:text-2xl">{label}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Guess</span>
    </button>
  );
}

function HighLowGameplayPanel({ uiState, selectedGuess, isOpening, resultToast, onSelectGuess, resolvedResult }) {
  const guessLocked = uiState === UI_STATE.CHOICE_SUBMITTED;
  const canGuess = !isOpening && uiState !== UI_STATE.LOADING && !guessLocked;

  const showCards =
    uiState === UI_STATE.RESOLVED &&
    resolvedResult?.baseRank != null &&
    resolvedResult?.nextRank != null;

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col px-2 pt-1 text-center sm:max-w-lg">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2 sm:py-4">
          <p className="mb-3 max-w-xs text-xs leading-relaxed text-zinc-400 sm:text-sm">
            The server draws two distinct ranks (A–K). Guess whether the next card is higher or lower than the base.
          </p>
          <div className="grid w-full grid-cols-2 gap-2 sm:gap-3">
            <GuessButton
              value="high"
              label="Higher"
              selectedGuess={selectedGuess}
              disabled={!canGuess}
              onSelect={onSelectGuess}
            />
            <GuessButton
              value="low"
              label="Lower"
              selectedGuess={selectedGuess}
              disabled={!canGuess}
              onSelect={onSelectGuess}
            />
          </div>
          {showCards ? (
            <p className="mt-4 text-xs text-zinc-400">
              Base <span className="font-bold text-sky-200/95">{rankLabel(resolvedResult.baseRank)}</span>
              {" → "}
              Next <span className="font-bold text-sky-200/95">{rankLabel(resolvedResult.nextRank)}</span>
              {" · "}
              Actual:{" "}
              <span className="font-bold text-zinc-200">
                {resolvedResult.outcome === "high" ? "Higher" : resolvedResult.outcome === "low" ? "Lower" : "—"}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {resultToast ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-[10%] z-20 w-[88%] max-w-xs -translate-x-1/2 rounded-lg border px-3 py-2 text-center text-xs font-bold sm:top-[12%] ${
            resultToast.isWin
              ? "border-emerald-400/35 bg-emerald-700/90 text-white"
              : "border-red-400/35 bg-red-700/90 text-white"
          }`}
        >
          <div className="text-[13px]">{resultToast.isWin ? "YOU WIN" : "YOU LOSE"}</div>
          <div className="text-sm">{resultToast.deltaLabel}</div>
          <div className="mt-0.5 text-[10px] font-semibold opacity-90">{resultToast.outcomeLabel}</div>
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
  const [selectedGuess, setSelectedGuess] = useState(null);
  const [, setEventInfo] = useState(null);
  const [resolvedResult, setResolvedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(HIGH_LOW_CARDS_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readHighLowStats);
  const [resultToast, setResultToast] = useState(null);
  const toastTimerRef = useRef(null);
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
    writeHighLowStats(stats);
  }, [stats]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function recoverStaleRound(message, opts = {}) {
    const releaseCreateLock = opts.releaseCreateLock !== false;
    if (releaseCreateLock) createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setSelectedGuess(null);
    setEventInfo(null);
    setResolvedResult(null);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
    setErrorMessage(String(message || "").trim() || "This round is no longer valid. Choose High or Low and press PLAY.");
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const sessionId = resolvedResult?.sessionId || session?.id;
    const settlementSummary = resolvedResult?.settlementSummary;
    if (!sessionId || !settlementSummary) return;
    applyHighLowCardsSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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
        const entryCost = Number(settlementSummary.entryCost || HIGH_LOW_CARDS_MIN_WAGER);
        const payoutReturn = Number(settlementSummary.payoutReturn || 0);
        setStats(prev => ({
          ...prev,
          totalGames: Number(prev.totalGames || 0) + 1,
          wins: Number(prev.wins || 0) + (resolvedResult?.isWin ? 1 : 0),
          losses: Number(prev.losses || 0) + (resolvedResult?.isWin ? 0 : 1),
          totalPlay:
            Number(prev.totalPlay || 0) + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
          totalWon: Number(prev.totalWon || 0) + payoutReturn,
          biggestWin: Math.max(Number(prev.biggestWin || 0), resolvedResult?.isWin ? payoutReturn : 0),
        }));
      } else {
        setSessionNotice(`Settlement already applied. Vault: ${authoritativeBalance}.`);
      }

      const toastDelta = Number(settlementSummary.netDelta || 0);
      const toastDeltaLabel = toastDelta >= 0 ? `+${toastDelta}` : `${toastDelta}`;
      const ob = resolvedResult?.outcome;
      const br = resolvedResult?.baseRank;
      const nr = resolvedResult?.nextRank;
      const outcomeLabel =
        br != null && nr != null
          ? `${rankLabel(br)} → ${rankLabel(nr)} (${ob === "high" ? "higher" : ob === "low" ? "lower" : "—"})`
          : "Round complete";
      setResultToast({
        isWin: Boolean(resolvedResult?.isWin),
        deltaLabel: toastDeltaLabel,
        outcomeLabel,
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setResultToast(null);
      }, 2600);
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id, uiState]);

  function hydrateResolvedFromSession(sessionPayload) {
    const summary = sessionPayload?.highLowCards?.resolvedResult || {};
    if (sessionPayload?.sessionStatus !== "resolved") return null;
    return {
      sessionId: sessionPayload?.id || null,
      sessionStatus: sessionPayload?.sessionStatus || "resolved",
      guess: summary.guess ?? null,
      outcome: summary.outcome ?? null,
      baseRank: summary.baseRank != null ? Number(summary.baseRank) : null,
      nextRank: summary.nextRank != null ? Number(summary.nextRank) : null,
      isWin: Boolean(summary.isWin),
      resolvedAt: summary.resolvedAt || sessionPayload?.resolvedAt || null,
      settlementSummary: summary.settlementSummary || null,
    };
  }

  function applySessionReadState(sessionPayload, options = {}) {
    const { resumed = false, localChoiceToKeep = null } = options;
    setSession(sessionPayload);

    const readState = String(sessionPayload?.readState || "");
    const serverGuess = sessionPayload?.highLowCards?.guess;
    const guessEventId = sessionPayload?.highLowCards?.guessEventId || null;
    const resolved = hydrateResolvedFromSession(sessionPayload);

    if (readState === "resolved" || resolved) {
      if (resolved) setResolvedResult(resolved);
      setEventInfo(null);
      setSelectedGuess(null);
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Resumed already resolved session." : "Session already resolved on server.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_submitted") {
      setSelectedGuess(serverGuess === "high" || serverGuess === "low" ? serverGuess : null);
      setEventInfo({
        eventId: guessEventId,
        eventType: "client_action",
      });
      setUiState(UI_STATE.CHOICE_SUBMITTED);
      setSessionNotice("Resumed session with locked guess. Ready to reveal.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      if (localChoiceToKeep === "high" || localChoiceToKeep === "low") {
        setSelectedGuess(localChoiceToKeep);
      } else {
        setSelectedGuess(null);
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
      createInFlightRef.current = false;
      submitInFlightRef.current = false;
      resolveInFlightRef.current = false;
      setSession(null);
      setSelectedGuess(null);
      setEventInfo(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        sessionPayload?.sessionStatus === "expired"
          ? "Session expired. Choose High or Low and press PLAY."
          : "Session ended. Choose High or Low and press PLAY.",
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
        "x-solo-v2-player": SOLO_V2_PLAYER,
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

  function hasPersistedHighLowGuess(sessionPayload) {
    const g = sessionPayload?.highLowCards?.guess;
    return g === "high" || g === "low";
  }

  function sessionTruthIsDead(sessionPayload, readStatus) {
    const rs = String(sessionPayload?.readState || "");
    const rss = String(readStatus || "");
    const st = String(sessionPayload?.sessionStatus || "");
    return rss === "invalid" || rs === "invalid" || st === "expired" || st === "cancelled";
  }

  async function verifyHighLowGuessPersisted(sessionId, activeCycle) {
    const readResult = await readSessionTruth(sessionId, activeCycle);
    if (readResult?.halted) return { halted: true };
    if (!readResult?.ok) return { ok: false, readResult };
    if (!hasPersistedHighLowGuess(readResult.session)) {
      return { ok: false, readResult, missingGuess: true };
    }
    return { ok: true, session: readResult.session };
  }

  async function bootstrapHighLowSession(wager, activeCycle, localGuessToKeep, createSessionMode, giftRoundMeta) {
    const isGiftRound = Boolean(giftRoundMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    setSession(null);
    setEventInfo(null);
    setResolvedResult(null);

    try {
      const createBody = {
        gameKey: GAME_KEY,
        sessionMode: createSessionMode,
        entryAmount: wager,
      };

      let response = await fetch("/api/solo-v2/sessions/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": SOLO_V2_PLAYER,
        },
        body: JSON.stringify(createBody),
      });

      let payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      let result = classifySoloV2ApiResult(response, payload);
      let status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "conflict_active_sessions") {
        recoverStaleRound("", { releaseCreateLock: false });
        setErrorMessage("Session sync issue — retrying…");
        await new Promise(r => setTimeout(r, 480));
        if (activeCycle !== cycleRef.current) return { ok: false };
        response = await fetch("/api/solo-v2/sessions/create", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-solo-v2-player": SOLO_V2_PLAYER,
          },
          body: JSON.stringify(createBody),
        });
        payload = await response.json().catch(() => null);
        if (activeCycle !== cycleRef.current) return { ok: false };
        result = classifySoloV2ApiResult(response, payload);
        status = String(payload?.status || "");
      }

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "created" && payload?.session) {
        if (isGiftRound) {
          if (!soloV2GiftConsumeOne()) {
            setSession(null);
            setUiState(UI_STATE.IDLE);
            setErrorMessage("No gift available. Try again after the next recharge.");
            return { ok: false };
          }
          giftRoundMeta?.onGiftConsumed?.();
        }
        setSession(payload.session);
        setSessionNotice("");
        setErrorMessage("");
        setUiState(UI_STATE.SESSION_CREATED);
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
        if (readResult?.halted) return { ok: false };
        if (!readResult?.ok) {
          setSession(null);
          setSelectedGuess(null);
          setEventInfo(null);
          setResolvedResult(null);
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }

        applySessionReadState(readResult.session, { resumed: true, localChoiceToKeep: localGuessToKeep });
        const rs = String(readResult.session?.readState || "");
        const st = String(readResult.session?.sessionStatus || "");
        const rss = String(readResult.readStatus || "");
        if (sessionTruthIsDead(readResult.session, rss)) {
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

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "conflict_active_sessions") {
        recoverStaleRound("Couldn’t merge sessions. Tap PLAY again.");
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

  async function submitGuessAndResolveFlow(sessionId, guess, activeCycle) {
    if (!sessionId || (guess !== "high" && guess !== "low")) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_CHOICE);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": SOLO_V2_PLAYER,
        },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: {
            gameKey: GAME_KEY,
            action: "high_low_cards_guess",
            guess,
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
          setSessionNotice("Guess already accepted. Revealing…");
        } else {
          setSessionNotice("Revealing…");
        }
        const verified = await verifyHighLowGuessPersisted(sessionId, activeCycle);
        if (verified?.halted) return;
        if (!verified?.ok) {
          if (verified?.missingGuess) {
            recoverStaleRound("Guess did not persist. Choose again and press PLAY.");
            return;
          }
          setUiState(verified.readResult.state);
          setErrorMessage(verified.readResult.message);
          return;
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
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Guess submission unavailable."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "choice_already_submitted") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (!readResult?.ok) {
          recoverStaleRound(readResult.message || "Session no longer available.");
          return;
        }
        const rss = String(readResult.readStatus || "");
        const rs = String(readResult.session?.readState || "");
        const st = String(readResult.session?.sessionStatus || "");

        if (sessionTruthIsDead(readResult.session, rss)) {
          recoverStaleRound(
            st === "expired"
              ? "Session expired. Choose High or Low and press PLAY."
              : "Session ended. Choose High or Low and press PLAY.",
          );
          return;
        }

        if (st === "resolved" || rs === "resolved") {
          applySessionReadState(readResult.session, { resumed: true });
          return;
        }

        if ((rss === "choice_submitted" || rs === "choice_submitted") && hasPersistedHighLowGuess(readResult.session)) {
          applySessionReadState(readResult.session, { resumed: true });
          setSessionNotice("Guess already locked on server. Resolving.");
          await handleResolveSession({ sessionIdOverride: readResult.session.id });
          return;
        }

        recoverStaleRound("Session state mismatch. Choose again and press PLAY.");
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "invalid_session_state") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (readResult?.ok) {
          const rss = String(readResult.readStatus || "");
          const rs = String(readResult.session?.readState || "");
          const st = String(readResult.session?.sessionStatus || "");

          if (sessionTruthIsDead(readResult.session, rss)) {
            recoverStaleRound(
              st === "expired"
                ? "Session expired. Choose High or Low and press PLAY."
                : "Session ended. Choose High or Low and press PLAY.",
            );
            return;
          }

          applySessionReadState(readResult.session, { resumed: true });

          if (st === "resolved" || rs === "resolved") {
            return;
          }

          if ((rss === "choice_submitted" || rs === "choice_submitted") && hasPersistedHighLowGuess(readResult.session)) {
            setSessionNotice("Session already has a guess. Revealing now.");
            await handleResolveSession({ sessionIdOverride: readResult.session.id });
          }
          return;
        }
        recoverStaleRound(buildSoloV2ApiErrorMessage(payload, "Session no longer accepts guesses."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          recoverStaleRound(msg || "Session expired. Choose High or Low and press PLAY.");
          return;
        }
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Guess submission rejected."));
        return;
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Guess submission rejected."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error while submitting guess.");
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
    const guess = selectedGuess;
    if (guess !== "high" && guess !== "low") {
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }

    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < HIGH_LOW_CARDS_MIN_WAGER) return;
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
        const boot = await bootstrapHighLowSession(wager, activeCycle, guess, createSessionMode, {
          isGiftRound,
          onGiftConsumed: () => giftRefreshRef.current?.(),
        });
        if (!boot.ok || activeCycle !== cycleRef.current) return;
        if (boot.alreadyTerminal) return;
        sessionId = boot.session?.id;
        readStateKnown = String(boot.session?.readState || "");
      } else if (sessionId) {
        const truth = await readSessionTruth(sessionId, activeCycle);
        if (truth?.halted) return;
        if (!truth?.ok) {
          recoverStaleRound(truth.message || "Session no longer available.");
          return;
        }
        if (sessionTruthIsDead(truth.session, truth.readStatus)) {
          recoverStaleRound(
            String(truth.session?.sessionStatus || "") === "expired"
              ? "Session expired. Choose High or Low and press PLAY."
              : "Session ended. Choose High or Low and press PLAY.",
          );
          return;
        }

        const trs = String(truth.session?.readState || "");
        const tst = String(truth.session?.sessionStatus || "");
        if (trs === "resolved" || tst === "resolved") {
          applySessionReadState(truth.session, { resumed: true, localChoiceToKeep: guess });
          return;
        }

        applySessionReadState(truth.session, { resumed: true, localChoiceToKeep: guess });
        sessionId = truth.session?.id;
        readStateKnown = String(truth.session?.readState || "");
      }

      if (!sessionId || activeCycle !== cycleRef.current) return;

      if (readStateKnown === "choice_submitted") {
        const verified = await verifyHighLowGuessPersisted(sessionId, activeCycle);
        if (verified?.halted) return;
        if (verified?.ok) {
          await handleResolveSession({ sessionIdOverride: sessionId });
          return;
        }
        if (verified?.missingGuess) {
          recoverStaleRound("Guess did not persist. Choose again and press PLAY.");
          return;
        }
        setUiState(verified.readResult.state);
        setErrorMessage(verified.readResult.message);
        return;
      }

      await submitGuessAndResolveFlow(sessionId, guess, activeCycle);
    } finally {
      if (isGiftRound) {
        giftRoundRef.current = false;
      }
    }
  }

  function handleSelectGuess(value) {
    if (
      uiState === UI_STATE.LOADING ||
      uiState === UI_STATE.SUBMITTING_CHOICE ||
      uiState === UI_STATE.CHOICE_SUBMITTED ||
      uiState === UI_STATE.RESOLVING
    ) {
      return;
    }
    setSelectedGuess(value);
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
      const response = await fetch("/api/solo-v2/high-low-cards/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": SOLO_V2_PLAYER,
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
  const hasValidGuess = selectedGuess === "high" || selectedGuess === "low";
  const wagerPlayable =
    vaultReady && numericWager >= HIGH_LOW_CARDS_MIN_WAGER && vaultBalance >= numericWager;

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (
        /Session expired\. Choose High or Low|Session ended\. Choose High or Low|no longer valid\. Choose/i.test(s)
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const canPlayRound =
    wagerPlayable &&
    hasValidGuess &&
    ![
      UI_STATE.LOADING,
      UI_STATE.SUBMITTING_CHOICE,
      UI_STATE.CHOICE_SUBMITTED,
      UI_STATE.RESOLVING,
      UI_STATE.PENDING_MIGRATION,
    ].includes(uiState);

  const isPrimaryLoading =
    uiState === UI_STATE.LOADING || uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;

  const primaryActionLabel = hasValidGuess ? "PLAY" : "Choose High or Low";

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
    if (canPlayRound) {
      void runOneClickRound();
    }
  }

  const isOpening = uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;
  const potentialWin = Math.floor(numericWager * HIGH_LOW_CARDS_WIN_MULTIPLIER);

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (!hasValidGuess) {
      setErrorMessage("Choose High or Low to play a gift round.");
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
  }, [vaultReady, hasValidGuess, giftShell.giftCount, uiState]);

  return (
    <SoloV2GameShell
      title="Hi-Lo Cards"
      subtitle="Arcade Solo"
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
        canEditPlay: !isOpening,
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            const next = Math.min(MAX_WAGER, Math.max(0, c - HIGH_LOW_CARDS_MIN_WAGER));
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
          setWagerInput(String(HIGH_LOW_CARDS_MIN_WAGER));
        },
        primaryActionLabel,
        primaryActionDisabled: !canPlayRound,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "PLAYING...",
        onPrimaryAction: handlePrimaryCta,
        errorMessage,
      }}
      gameplaySlot={
        <HighLowGameplayPanel
          uiState={uiState}
          selectedGuess={selectedGuess}
          isOpening={isOpening}
          resultToast={resultToast}
          onSelectGuess={handleSelectGuess}
          resolvedResult={resolvedResult}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>1. Tap Higher or Lower.</p>
          <p>2. Set your play amount and press PLAY.</p>
          <p>3. The server draws base and next ranks; you win if your guess matches whether the next rank is higher.</p>
          <p>Win pays about ×1.92 on your play (~96% RTP target).</p>
          <p>Vault updates after the server result, same shared vault as other Solo V2 games.</p>
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
        </div>
      }
      resultState={null}
    />
  );
}
