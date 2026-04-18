import { useCallback, useEffect, useRef, useState } from "react";
import RelicDraftBoard from "../components/solo-v2/RelicDraftBoard";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
  SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS,
} from "../components/solo-v2/SoloV2ResultPopup";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import SoloV2ProgressStrip from "../components/solo-v2/SoloV2ProgressStrip";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import { SOLO_V2_GIFT_ROUND_STAKE, soloV2GiftConsumeOne } from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import { RELIC_DRAFT_MIN_WAGER, payoutForRelicDraftWin } from "../lib/solo-v2/relicDraftConfig";
import {
  applyRelicDraftSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
} from "../lib/solo-v2/soloV2ApiResult";
import { navigateBackToArcadeV2 } from "../lib/solo-v2/arcadeV2LobbyMobileTab";

const GAME_KEY = "relic_draft";
const PLAYER_HEADER = "v2-relic-draft-client";

const UI_STATE = {
  IDLE: "idle",
  LOADING: "loading",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  SESSION_ACTIVE: "session_active",
  RESOLVING: "resolving",
  RESOLVED: "resolved",
};

const STATS_KEY = "solo_v2_relic_draft_stats_v1";
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

function readStats() {
  if (typeof window === "undefined") {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
  }
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p || typeof p !== "object") throw new Error("invalid");
    return {
      totalGames: Number(p.totalGames || 0),
      wins: Number(p.wins || 0),
      losses: Number(p.losses || 0),
      totalPlay: Number(p.totalPlay || 0),
      totalWon: Number(p.totalWon || 0),
      biggestWin: Number(p.biggestWin || 0),
    };
  } catch {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
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

function RelicDraftGameplayPanel({
  session,
  uiState,
  sessionNotice,
  advanceLoading,
  onPickRelic,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  pendingResolved,
}) {
  const rd = session?.relicDraft;
  const playing = rd?.playing;
  const rr = rd?.resolvedResult || pendingResolved;
  const isTerminal =
    Boolean(rr) || session?.sessionStatus === "resolved" || uiState === UI_STATE.RESOLVED;
  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || 5));
  const stripCleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));
  const busy = uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING || advanceLoading;

  return (
    <div className="solo-v2-route-stack relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
      <div className="solo-v2-board-frame flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-amber-900/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
          keyPrefix="rd"
          rowLabel="Trail"
          ariaLabel="Relic draft progress"
          stepTotal={total}
          stepsComplete={stripCleared}
          currentStepIndex={cur}
        />

        <div className="solo-v2-ladder-playfield-wrap flex min-h-0 flex-1 flex-col px-1 pb-1 sm:px-2 lg:min-h-0 lg:px-4 lg:pb-1.5">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-700/55 bg-zinc-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:min-h-[min(16rem,32vh)]"
            aria-label="Relic draft board"
          >
            <div className="flex min-h-0 min-h-[12rem] flex-1 flex-col items-center justify-center px-0.5 py-1.5 sm:min-h-[13rem] sm:px-1 sm:py-2 lg:min-h-0 lg:py-1.5">
              {playing && !isTerminal ? (
                <RelicDraftBoard
                  offers={playing.offers}
                  lastEncounter={playing.lastEncounter}
                  round={playing.round}
                  maxRounds={playing.maxRounds}
                  modifiersLine={playing.modifiersLine}
                  picks={playing.picks}
                  disabled={busy || !rd?.canAdvance}
                  onPick={onPickRelic}
                />
              ) : isTerminal && rr ? (
                <div className="px-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Run closed</p>
                  <p className="mt-2 text-xs font-semibold text-zinc-200">
                    {rr.isWin || rr.terminalKind === "win"
                      ? "Relic trail held — vault release authorized."
                      : "Trail broke — no payout this run."}
                  </p>
                  {Array.isArray(rr.picks) && rr.picks.length > 0 ? (
                    <p className="mt-2 text-[10px] text-zinc-500">{rr.picks.length} relic picks logged.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
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
        <div className="text-[13px] font-black uppercase tracking-wide">Relic Draft Run</div>
        <div className="mt-1 text-sm font-bold text-white">
          <span className="text-amber-100 tabular-nums">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function RelicDraftPage() {
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
  const [wagerInput, setWagerInput] = useState(String(RELIC_DRAFT_MIN_WAGER));
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [stats, setStats] = useState(readStats);

  const lastPresetAmountRef = useRef(null);
  const resultPopupTimerRef = useRef(null);
  const terminalPopupEligibleRef = useRef(false);
  const createInFlightRef = useRef(false);
  const cycleRef = useRef(0);

  useEffect(() => {
    giftRefreshRef.current = giftShell.refresh;
  }, [giftShell.refresh]);
  useEffect(() => {
    writeStats(stats);
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

  useEffect(() => {
    return () => {
      if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    };
  }, []);

  const dismissResultPopupAfterTerminalRun = useCallback(() => {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
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
    setSession(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setUiState(UI_STATE.IDLE);
    setSessionNotice("");
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyRelicDraftSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Math.max(0, Number(settlementResult.nextBalance || 0));
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = window.setTimeout(() => resetRoundAfterResultPopup(), SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
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
        window.setTimeout(() => openResultPopup(), REVEAL_READABLE_MS);
      }
    });
  }, [
    uiState,
    resolvedResult?.sessionId,
    resolvedResult?.settlementSummary,
    resolvedResult?.isWin,
    resolvedResult?.won,
    session?.id,
    openResultPopup,
  ]);

  const applySessionReadState = useCallback((sessionPayload, { resumed = false } = {}) => {
    const rd = sessionPayload?.relicDraft;
    const readState = String(rd?.readState || sessionPayload?.readState || "");
    const st0 = String(sessionPayload?.sessionStatus || "");

    if (st0 === "resolved" && rd?.resolvedResult) {
      setResolvedResult({
        ...rd.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: rd.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Run restored (finished)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "draft_run_active") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Run resumed." : "Draft a relic — then face the encounter.");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st0 === "expired" || st0 === "cancelled") {
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(st0 === "expired" ? "Session expired. Press START RUN." : "Session ended. Press START RUN.");
      return;
    }

    setUiState(UI_STATE.UNAVAILABLE);
    setErrorMessage("Session state is not resumable.");
  }, []);

  async function readSessionTruth(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}`, {
      method: "GET",
      headers: { "x-solo-v2-player": PLAYER_HEADER },
    });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return { halted: true };
    const result = classifySoloV2ApiResult(response, payload);
    if (result === SOLO_V2_API_RESULT.SUCCESS && payload?.session) {
      return { ok: true, session: payload.session };
    }
    if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) {
      return {
        ok: false,
        state: UI_STATE.PENDING_MIGRATION,
        message: buildSoloV2ApiErrorMessage(payload, "Migration is pending."),
      };
    }
    return {
      ok: false,
      state: UI_STATE.UNAVAILABLE,
      message: buildSoloV2ApiErrorMessage(payload, "Session read unavailable."),
    };
  }

  async function bootstrapSession(wager, activeCycle, createSessionMode, giftRoundMeta) {
    const isGiftRound = Boolean(giftRoundMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(false);
    setSession(null);
    setResolvedResult(null);

    try {
      const response = await fetch("/api/solo-v2/sessions/create", {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
        body: JSON.stringify({ gameKey: GAME_KEY, sessionMode: createSessionMode, entryAmount: wager }),
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
        return { ok: true };
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
          return { ok: true, alreadyTerminal: true };
        }
        return { ok: true };
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
      if (activeCycle === cycleRef.current) createInFlightRef.current = false;
    }
  }

  async function handlePickRelic(relicKey) {
    const sid = session?.id;
    if (!sid || advanceLoading) return;
    const activeCycle = cycleRef.current;
    setAdvanceLoading(true);
    setUiState(UI_STATE.RESOLVING);
    try {
      const response = await fetch("/api/solo-v2/relic-draft/resolve", {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
        body: JSON.stringify({ sessionId: sid, action: "advance", relicKey }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);

      if (api === SOLO_V2_API_RESULT.SUCCESS && payload?.status === "step" && payload?.playing) {
        setSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            relicDraft: {
              ...(prev.relicDraft || {}),
              readState: "draft_run_active",
              canAdvance: true,
              playing: payload.playing,
            },
          };
        });
        setUiState(UI_STATE.SESSION_ACTIVE);
        setAdvanceLoading(false);
        return;
      }

      if (api === SOLO_V2_API_RESULT.SUCCESS && payload?.status === "resolved" && payload?.result) {
        terminalPopupEligibleRef.current = true;
        setResolvedResult({ ...payload.result, sessionId: sid });
        setUiState(UI_STATE.RESOLVED);
        setAdvanceLoading(false);
        const readResult = await readSessionTruth(sid, activeCycle);
        if (readResult?.ok && readResult.session) setSession(readResult.session);
        return;
      }

      setUiState(UI_STATE.SESSION_ACTIVE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Advance rejected."));
    } catch (_e) {
      if (activeCycle === cycleRef.current) {
        setUiState(UI_STATE.SESSION_ACTIVE);
        setErrorMessage("Network error.");
      }
    } finally {
      if (activeCycle === cycleRef.current) setAdvanceLoading(false);
    }
  }

  async function runStartRun() {
    if (createInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (!isGiftRound && wager < RELIC_DRAFT_MIN_WAGER) {
      setErrorMessage(`Minimum play is ${RELIC_DRAFT_MIN_WAGER}.`);
      return;
    }
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
    if (!boot?.ok || boot?.alreadyTerminal) return;
    if (isGiftRound && typeof window !== "undefined" && window.requestAnimationFrame) {
      giftRefreshRef.current?.();
      window.requestAnimationFrame(() => giftRefreshRef.current?.());
    }
  }

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= RELIC_DRAFT_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;

  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= RELIC_DRAFT_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState) &&
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

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= RELIC_DRAFT_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  const playing = session?.relicDraft?.playing;
  const pctBonus = 0;
  let summaryWin = payoutForRelicDraftWin(Math.max(RELIC_DRAFT_MIN_WAGER, numericWager), pctBonus);

  if (playing?.potentialWinReturn != null && (uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.RESOLVING)) {
    summaryWin = Math.floor(Number(playing.potentialWinReturn) || summaryWin);
  }

  if (runEntryFromSession != null && (uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.RESOLVING || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const maxR = playing?.maxRounds ?? 5;
  const rnd = playing?.round ?? 1;

  let stepTotal = maxR;
  let stepsComplete = 0;
  let currentStepIndex = 0;

  if (uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.RESOLVING) {
    stepsComplete = Math.max(0, rnd - 1);
    currentStepIndex = Math.min(stepsComplete, maxR - 1);
  } else if (uiState === UI_STATE.RESOLVED) {
    stepTotal = maxR;
    stepsComplete = resolvedResult?.isWin ? maxR : Math.max(0, (resolvedResult?.picks?.length ?? 1) - 1);
    currentStepIndex = Math.min(stepsComplete, maxR - 1);
  } else {
    stepTotal = 5;
    stepsComplete = 0;
    currentStepIndex = 0;
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}` : "";

  const prPopup = Math.max(0, Math.floor(Number(resolvedResult?.settlementSummary?.payoutReturn ?? 0)));
  const popupLine2 = formatCompact(prPopup);
  const popupLine3 = resolvedIsWin ? "Run forged — take payout" : "Trail snapped";

  let payoutBandLabel = "Projected clear";
  let payoutBandValue = formatCompact(summaryWin);
  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary.payoutReturn ?? 0)));
    payoutBandLabel = resolvedIsWin ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
  }

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || advanceLoading) return;
    if ([UI_STATE.LOADING, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState)) return;
    giftRoundRef.current = true;
    void runStartRun();
  }, [vaultReady, giftShell.giftCount, uiState, advanceLoading]);

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

  const busyFooter = uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING;

  return (
    <SoloV2GameShell
      title="Relic Draft Run"
      subtitle="Pick modifiers. Survive the trail."
      layoutMaxWidthClass="max-w-full sm:max-w-2xl lg:max-w-5xl"
      mobileHeaderBreathingRoom
      stableTripleTopSummary
      gameplayScrollable={false}
      gameplayDesktopUnclipVertical
      menuVaultBalance={vaultBalance}
      gift={{ ...giftShell, onGiftClick: handleGiftPlay }}
      hideStatusPanel
      hideActionBar
      onBack={navigateBackToArcadeV2}
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
            <span>Vault line</span>
            <span className="font-semibold tabular-nums text-amber-200/90">{formatCompact(summaryWin)}</span>
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - RELIC_DRAFT_MIN_WAGER)));
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
          setWagerInput(String(RELIC_DRAFT_MIN_WAGER));
        },
        primaryActionLabel: "START RUN",
        primaryActionDisabled: !canStart,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => void runStartRun(),
        errorMessage: errorMessage || stakeHint,
        desktopPayout: { label: payoutBandLabel, value: payoutBandValue },
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <RelicDraftGameplayPanel
          session={session}
          uiState={uiState}
          sessionNotice={sessionNotice}
          advanceLoading={advanceLoading}
          onPickRelic={handlePickRelic}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
          stepTotal={stepTotal}
          stepsComplete={stepsComplete}
          currentStepIndex={currentStepIndex}
          pendingResolved={uiState === UI_STATE.RESOLVED ? resolvedResult : null}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Each <strong>round</strong> you draft one of three relics. It stacks modifiers for the rest of this run
            only — encounter odds, payout band, or a one-time save.
          </p>
          <p>
            Immediately after you pick, a short <strong>encounter</strong> resolves on the server. Survive every leg
            of the trail to clear; fail without a save and the run ends.
          </p>
          <p>
            This is intentionally not a ladder or chamber flip: identity is <strong>what you drafted</strong> and how
            those choices compound.
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
