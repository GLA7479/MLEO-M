import { useCallback, useEffect, useRef, useState } from "react";
import CoreBalanceBoard from "../components/solo-v2/CoreBalanceBoard";
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
import { CORE_BALANCE_MIN_WAGER, payoutForCoreBalanceWin } from "../lib/solo-v2/coreBalanceConfig";
import {
  applyCoreBalanceSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
} from "../lib/solo-v2/soloV2ApiResult";
import { navigateBackToArcadeV2 } from "../lib/solo-v2/arcadeV2LobbyMobileTab";

const GAME_KEY = "core_balance";
const PLAYER_HEADER = "v2-core-balance-client";

const UI_STATE = {
  IDLE: "idle",
  LOADING: "loading",
  PENDING_MIGRATION: "pending_migration",
  UNAVAILABLE: "unavailable",
  SESSION_ACTIVE: "session_active",
  RESOLVING: "resolving",
  RESOLVED: "resolved",
};

const STATS_KEY = "solo_v2_core_balance_stats_v1";
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

function CoreBalanceGameplayPanel({
  session,
  uiState,
  sessionNotice,
  stabilizingLoading,
  onStabilize,
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
  const cb = session?.coreBalance;
  const playing = cb?.playing;
  const rr = cb?.resolvedResult || pendingResolved;
  const isTerminal = Boolean(rr) || session?.sessionStatus === "resolved" || uiState === UI_STATE.RESOLVED;
  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || 2));
  const stripCleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));
  const busy = uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING || stabilizingLoading;

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
          keyPrefix="cb"
          rowLabel="Survival"
          ariaLabel="Core balance progress"
          stepTotal={total}
          stepsComplete={stripCleared}
          currentStepIndex={cur}
        />

        <div className="solo-v2-ladder-playfield-wrap flex min-h-0 flex-1 flex-col px-1 pb-1 sm:px-2 lg:min-h-0 lg:px-4 lg:pb-1.5">
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-700/55 bg-zinc-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:min-h-[min(14rem,30vh)]"
            aria-label="Core balance board"
          >
            <div className="solo-v2-ladder-play-inner flex min-h-0 min-h-[11rem] flex-1 flex-col items-center justify-center gap-3 px-0.5 py-1.5 sm:min-h-[12rem] sm:px-1 sm:py-2 lg:min-h-0 lg:py-1.5">
              {playing && !isTerminal ? (
                <>
                  <p className="max-w-sm px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Vent / bleed / sink / shunt — each move leaks into the others. Drift hits after every action.
                  </p>
                  <CoreBalanceBoard playing={playing} />
                  <div className="grid w-full max-w-md grid-cols-2 gap-2 sm:max-w-lg sm:grid-cols-4">
                    {[
                      { id: "vent", label: "Vent heat", sub: "−H · +P" },
                      { id: "bleed", label: "Bleed Δ", sub: "−P · +H" },
                      { id: "sink", label: "Sink charge", sub: "−C · +H/P" },
                      { id: "shunt", label: "Shunt", sub: "→ mid" },
                    ].map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onStabilize(b.id)}
                        disabled={busy || !cb?.canAct}
                        className={`min-h-[46px] rounded-xl border px-2 py-2 text-[9px] font-extrabold uppercase leading-tight tracking-wide sm:min-h-[50px] sm:text-[10px] ${
                          busy || !cb?.canAct
                            ? "cursor-not-allowed border-white/12 bg-white/5 text-zinc-500"
                            : "border-cyan-600/40 bg-cyan-950/25 text-cyan-100 hover:bg-cyan-900/35"
                        }`}
                      >
                        <span className="block">{stabilizingLoading ? "…" : b.label}</span>
                        <span className="mt-0.5 block text-[8px] font-semibold normal-case tracking-normal text-white/45">
                          {b.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : isTerminal && rr ? (
                <div className="px-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Core cycle closed</p>
                  <p className="mt-2 text-xs font-semibold text-zinc-200">
                    {rr.isWin || rr.terminalKind === "win" ? "Systems held through final drift." : "Breach — core tripped."}
                  </p>
                  {rr.failMeter ? (
                    <p className="mt-1 text-[11px] text-rose-300/90">
                      Failed on <span className="font-bold uppercase">{String(rr.failMeter)}</span>
                    </p>
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
            <SoloV2ResultPopupVaultLine isWin={resolvedIsWin} tone={resolvedIsWin ? "win" : "lose"} deltaLabel={resultVaultLabel} />
          ) : undefined
        }
      >
        <div className="text-[13px] font-black uppercase tracking-wide">Core Balance</div>
        <div className="mt-1 text-sm font-bold text-white">
          <span className="text-amber-100 tabular-nums">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function CoreBalancePage() {
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
  const [wagerInput, setWagerInput] = useState(String(CORE_BALANCE_MIN_WAGER));
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [stabilizingLoading, setStabilizingLoading] = useState(false);
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
    applyCoreBalanceSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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
    const cb = sessionPayload?.coreBalance;
    const readState = String(cb?.readState || sessionPayload?.readState || "");
    const st0 = String(sessionPayload?.sessionStatus || "");

    if (st0 === "resolved" && cb?.resolvedResult) {
      setResolvedResult({
        ...cb.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: cb.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Run restored (finished)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "survival_active") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Run resumed." : "Keep heat, pressure, and charge out of the red.");
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

  async function handleStabilize(choice) {
    const sid = session?.id;
    if (!sid || stabilizingLoading) return;
    const activeCycle = cycleRef.current;
    setStabilizingLoading(true);
    setUiState(UI_STATE.RESOLVING);
    try {
      const response = await fetch("/api/solo-v2/core-balance/resolve", {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
        body: JSON.stringify({ sessionId: sid, action: "stabilize", choice }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);

      if (api === SOLO_V2_API_RESULT.SUCCESS && payload?.status === "tick" && payload?.playing) {
        setSession(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            coreBalance: {
              ...(prev.coreBalance || {}),
              readState: "survival_active",
              canAct: true,
              playing: payload.playing,
            },
          };
        });
        setUiState(UI_STATE.SESSION_ACTIVE);
        setStabilizingLoading(false);
        return;
      }

      if (api === SOLO_V2_API_RESULT.SUCCESS && payload?.status === "resolved" && payload?.result) {
        terminalPopupEligibleRef.current = true;
        setResolvedResult({ ...payload.result, sessionId: sid });
        setUiState(UI_STATE.RESOLVED);
        setStabilizingLoading(false);
        const readResult = await readSessionTruth(sid, activeCycle);
        if (readResult?.ok && readResult.session) setSession(readResult.session);
        return;
      }

      setUiState(UI_STATE.SESSION_ACTIVE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Stabilize rejected."));
    } catch (_e) {
      if (activeCycle === cycleRef.current) {
        setUiState(UI_STATE.SESSION_ACTIVE);
        setErrorMessage("Network error.");
      }
    } finally {
      if (activeCycle === cycleRef.current) setStabilizingLoading(false);
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
    if (!isGiftRound && wager < CORE_BALANCE_MIN_WAGER) {
      setErrorMessage(`Minimum play is ${CORE_BALANCE_MIN_WAGER}.`);
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
    vaultReady && numericWager >= CORE_BALANCE_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;

  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= CORE_BALANCE_MIN_WAGER &&
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
    Number(session.entryAmount) >= CORE_BALANCE_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  let summaryWin = payoutForCoreBalanceWin(Math.max(CORE_BALANCE_MIN_WAGER, numericWager));

  const inActiveRunUi = uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const playing = session?.coreBalance?.playing;
  const maxT = playing?.maxTicks ?? 12;
  const tickN = playing?.tick ?? 0;

  let stepTotal = 2;
  let stepsComplete = 0;
  let currentStepIndex = 0;

  if (uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.RESOLVING) {
    stepTotal = maxT;
    stepsComplete = tickN;
    currentStepIndex = Math.min(tickN, Math.max(0, maxT - 1));
  } else if (uiState === UI_STATE.RESOLVED) {
    const cap = Math.max(2, Number(resolvedResult?.maxTicks) || maxT);
    stepTotal = cap;
    stepsComplete = resolvedResult?.isWin ? cap : Math.min(Number(resolvedResult?.survivedTicks) || 0, cap);
    currentStepIndex = Math.min(stepsComplete, stepTotal - 1);
  } else {
    stepTotal = 2;
    stepsComplete = 0;
    currentStepIndex = 0;
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}` : "";

  const prPopup = Math.max(0, Math.floor(Number(resolvedResult?.settlementSummary?.payoutReturn ?? 0)));
  const popupLine2 = formatCompact(prPopup);
  const popupLine3 = resolvedIsWin ? "Stacks survived full drift" : "Core breach — run lost";

  let payoutBandLabel = "Clear payout";
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
    if (createInFlightRef.current || stabilizingLoading) return;
    if ([UI_STATE.LOADING, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState)) return;
    giftRoundRef.current = true;
    void runStartRun();
  }, [vaultReady, giftShell.giftCount, uiState, stabilizingLoading]);

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
      title="Core Balance"
      subtitle="Three meters. One drift field."
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
            <span>Clear</span>
            <span className="font-semibold tabular-nums text-cyan-200/90">{formatCompact(summaryWin)}</span>
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - CORE_BALANCE_MIN_WAGER)));
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
          setWagerInput(String(CORE_BALANCE_MIN_WAGER));
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
        <CoreBalanceGameplayPanel
          session={session}
          uiState={uiState}
          sessionNotice={sessionNotice}
          stabilizingLoading={stabilizingLoading}
          onStabilize={handleStabilize}
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
            Core Balance is <strong>multi-variable survival</strong>: heat, pressure, and charge drift every beat after
            you act. Safe bands sit in the middle; critical breach is near the rails.
          </p>
          <p>
            Controls are deliberately coupled — venting heat relieves the stack but feeds pressure. Shunt nudges all
            three toward neutral when nothing is on fire yet. Priority switching matters more than raw reflex.
          </p>
          <p>
            This is not Safe Zone: you are not holding a single lane — you are trading off three liabilities under a
            shared clock until the run completes or a core trips.
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
