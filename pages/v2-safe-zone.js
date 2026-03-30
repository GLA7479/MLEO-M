import { useCallback, useEffect, useRef, useState } from "react";
import QuickFlipBoard from "../components/solo-v2/QuickFlipBoard";
import SafeZoneGauge, { useSafeZoneVisualPulse } from "../components/solo-v2/SafeZoneGauge";
import SoloV2ResultPopup, { SoloV2ResultPopupVaultLine, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS } from "../components/solo-v2/SoloV2ResultPopup";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import { SOLO_V2_GIFT_ROUND_STAKE, soloV2GiftConsumeOne } from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import { QUICK_FLIP_CONFIG, QUICK_FLIP_MIN_WAGER } from "../lib/solo-v2/quickFlipConfig";
import { SAFE_ZONE_MIN_SECURED_MS, SAFE_ZONE_TIER_MS, safeZoneMultiplierForSecuredMs } from "../lib/solo-v2/safeZoneConfig";
import { applySafeZoneSettlementOnce, readQuickFlipSharedVaultBalance, subscribeQuickFlipSharedVault } from "../lib/solo-v2/quickFlipLocalVault";
import { SOLO_V2_API_RESULT, buildSoloV2ApiErrorMessage, classifySoloV2ApiResult } from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "safe_zone";
const PLAYER_HEADER = "v2-safe-zone-client";
const UI_STATE = { IDLE: "idle", LOADING: "loading", PENDING_MIGRATION: "pending_migration", UNAVAILABLE: "unavailable", SESSION_CREATED: "session_created", ACTIVE: "active", SUBMITTING_CONTROL: "submitting_control", RESOLVING: "resolving", RESOLVED: "resolved", RESOLVE_FAILED: "resolve_failed" };
const STATS_KEY = "solo_v2_safe_zone_stats_v1";
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
  if (typeof window === "undefined") return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return { totalGames: Number(p.totalGames || 0), wins: Number(p.wins || 0), losses: Number(p.losses || 0), totalPlay: Number(p.totalPlay || 0), totalWon: Number(p.totalWon || 0), biggestWin: Number(p.biggestWin || 0) };
  } catch {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
  }
}

function writeStats(next) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STATS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

function safeStripModel(uiState) {
  const stepTotal = 2;
  if (uiState === UI_STATE.RESOLVED) return { stepTotal, stepsComplete: 2, currentStepIndex: 1 };
  if ([UI_STATE.ACTIVE, UI_STATE.SUBMITTING_CONTROL, UI_STATE.RESOLVING].includes(uiState)) return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

function SafeZoneGameplayPanel({
  uiState,
  playing,
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
  resolvedKind,
  holding,
}) {
  const visualPos = useSafeZoneVisualPulse(playing, uiState === UI_STATE.ACTIVE ? "active" : "idle");
  const sim = playing?.simNow || {};
  const securedMs = Math.max(0, Number(sim.securedMs || 0));
  const tierProgress = Math.min(1, SAFE_ZONE_TIER_MS.length ? securedMs / SAFE_ZONE_TIER_MS[SAFE_ZONE_TIER_MS.length - 1] : 0);
  const leftLabel = uiState === UI_STATE.ACTIVE ? "LIVE" : uiState === UI_STATE.RESOLVED ? (resolvedKind === "fail" ? "FAIL" : "SAFE") : "SET";
  const leftSub = uiState === UI_STATE.ACTIVE ? "Control" : uiState === UI_STATE.RESOLVED ? "Result" : "Ready";
  return (
    <div className="solo-v2-route-stack relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
      <QuickFlipBoard
        sessionNotice={sessionNotice}
        statusTop=""
        statusSub=""
        hideBoardStatusStack
        stepLabels={["Run", "Secure"]}
        stepTotal={stepTotal}
        currentStepIndex={currentStepIndex}
        stepsComplete={stepsComplete}
        payoutBandLabel={payoutBandLabel}
        payoutBandValue={payoutBandValue}
        payoutCaption={payoutCaption}
        hideMobilePayoutBand
        coinSlot={<SafeZoneGauge pos={visualPos} safeMin={Number(playing?.config?.safeMin || 0.34)} safeMax={Number(playing?.config?.safeMax || 0.66)} tierProgress={tierProgress} holding={holding} resolvedKind={resolvedKind} />}
        choiceSlot={
          <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 lg:gap-6" aria-label="Run status">
            <div className="group relative flex h-full min-h-[5.25rem] w-full flex-col items-center justify-center rounded-2xl border-2 border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:min-h-[6.1rem] sm:rounded-[1.05rem] lg:min-h-[7.35rem] lg:rounded-[1.12rem]">
              <span className="mt-0.5 select-none text-[1.35rem] font-black leading-none tabular-nums sm:text-[1.55rem] lg:text-[1.85rem]">{leftLabel}</span>
              <span className="mt-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] lg:text-[11px]">{leftSub}</span>
            </div>
            <div className="group relative flex h-full min-h-[5.25rem] w-full flex-col items-center justify-center rounded-2xl border-2 border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:min-h-[6.1rem] sm:rounded-[1.05rem] lg:min-h-[7.35rem] lg:rounded-[1.12rem]">
              <span className="mt-0.5 select-none text-[1.35rem] font-black leading-none tabular-nums sm:text-[1.55rem] lg:text-[1.85rem]">{`${(safeZoneMultiplierForSecuredMs(securedMs) || 0).toFixed(2)}x`}</span>
              <span className="mt-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] lg:text-[11px]">Secured</span>
            </div>
          </div>
        }
      />
      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        resultTone={resolvedIsWin ? "win" : "lose"}
        animationKey={`${popupLine2}-${popupLine3}-${resultVaultLabel}`}
        vaultSlot={resultPopupOpen ? <SoloV2ResultPopupVaultLine isWin={resolvedIsWin} tone={resolvedIsWin ? "win" : "lose"} deltaLabel={resultVaultLabel} /> : undefined}
      >
        <div className="text-[13px] font-black uppercase tracking-wide">{popupTitle}</div>
        <div className="mt-1 text-sm font-bold text-white"><span className="text-amber-100 tabular-nums">{popupLine2}</span></div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function SafeZonePage() {
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
  const [holding, setHolding] = useState(false);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [stats, setStats] = useState(readStats);
  const lastPresetAmountRef = useRef(null);
  const resultPopupTimerRef = useRef(null);
  const terminalPopupEligibleRef = useRef(false);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const cycleRef = useRef(0);
  const sessionRef = useRef(null);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { giftRefreshRef.current = giftShell.refresh; }, [giftShell.refresh]);
  useEffect(() => { writeStats(stats); }, [stats]);
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
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => () => { if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current); }, []);

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

  function applySessionReadState(sessionPayload, options = {}) {
    const { resumed = false } = options;
    setSession(sessionPayload);
    const sz = sessionPayload?.safeZone;
    const readState = String(sz?.readState || sessionPayload?.readState || "");
    if (sessionPayload?.sessionStatus === "resolved" && sz?.resolvedResult) {
      setResolvedResult({ ...sz.resolvedResult, sessionId: sessionPayload.id, settlementSummary: sz.resolvedResult.settlementSummary });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Resumed resolved run." : "Run resolved.");
      return;
    }
    if (readState === "active" || readState === "terminal_pending") {
      setResolvedResult(null);
      setUiState(UI_STATE.ACTIVE);
      setSessionNotice("Keep it inside the zone.");
      return;
    }
    if (readState === "safe_zone_start_required" || readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_CREATED);
      setSessionNotice("Session ready.");
      return;
    }
    if (readState === "invalid" || sessionPayload?.sessionStatus === "expired" || sessionPayload?.sessionStatus === "cancelled") {
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage("Session ended. Press START RUN.");
      return;
    }
    setUiState(UI_STATE.UNAVAILABLE);
    setErrorMessage("Session state is not resumable.");
  }

  async function readSessionTruth(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}`, { method: "GET", headers: { "x-solo-v2-player": PLAYER_HEADER } });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return { halted: true };
    const result = classifySoloV2ApiResult(response, payload);
    if (result === SOLO_V2_API_RESULT.SUCCESS && payload?.session) return { ok: true, session: payload.session };
    if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) return { ok: false, state: UI_STATE.PENDING_MIGRATION, message: buildSoloV2ApiErrorMessage(payload, "Migration is pending.") };
    return { ok: false, state: UI_STATE.UNAVAILABLE, message: buildSoloV2ApiErrorMessage(payload, "Session read unavailable.") };
  }

  async function bootstrapSafeZoneSession(wager, activeCycle, createSessionMode, giftRoundMeta) {
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
      if (result === SOLO_V2_API_RESULT.SUCCESS && (status === "created" || status === "existing_session") && payload?.session) {
        if (isGiftRound && status === "created") {
          if (!soloV2GiftConsumeOne()) {
            setUiState(UI_STATE.IDLE);
            setErrorMessage("No gift available.");
            return { ok: false };
          }
          giftRoundMeta?.onGiftConsumed?.();
        }
        const readResult = await readSessionTruth(payload.session.id, activeCycle);
        if (!readResult?.ok) {
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }
        applySessionReadState(readResult.session, { resumed: status === "existing_session" });
        return { ok: true, session: readResult.session };
      }
      setUiState(result === SOLO_V2_API_RESULT.PENDING_MIGRATION ? UI_STATE.PENDING_MIGRATION : UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Session bootstrap rejected."));
      return { ok: false };
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return { ok: false };
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error while creating session.");
      return { ok: false };
    } finally {
      if (activeCycle === cycleRef.current) createInFlightRef.current = false;
    }
  }

  async function postStartRun(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
      body: JSON.stringify({ eventType: "client_action", eventPayload: { gameKey: GAME_KEY, action: "safe_zone_start" } }),
    });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return false;
    const result = classifySoloV2ApiResult(response, payload);
    if (result === SOLO_V2_API_RESULT.SUCCESS) return true;
    setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Could not start run."));
    return false;
  }

  async function postControl(hold, activeCycle) {
    const sid = sessionRef.current?.id;
    if (!sid) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;
    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_CONTROL);
    try {
      const response = await fetch(`/api/solo-v2/sessions/${sid}/event`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: { gameKey: GAME_KEY, action: "safe_zone_control", holding: Boolean(hold) },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const result = classifySoloV2ApiResult(response, payload);
      if (result !== SOLO_V2_API_RESULT.SUCCESS) {
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Control update failed."));
      }
      setUiState(UI_STATE.ACTIVE);
      const rr = await readSessionTruth(sid, activeCycle);
      if (rr?.ok) applySessionReadState(rr.session, { resumed: true });
      await handleResolveSession({ sessionIdOverride: sid });
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function handleResolveSession(options = {}) {
    const targetSessionId = options.sessionIdOverride || sessionRef.current?.id;
    if (!targetSessionId) return;
    if (resolveInFlightRef.current || createInFlightRef.current) return;
    resolveInFlightRef.current = true;
    const activeCycle = cycleRef.current;
    setUiState(UI_STATE.RESOLVING);
    try {
      const response = await fetch("/api/solo-v2/safe-zone/resolve", {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
        body: JSON.stringify({ sessionId: targetSessionId }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");
      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        terminalPopupEligibleRef.current = true;
        setResolvedResult({ ...payload.result, sessionId: targetSessionId, settlementSummary: payload.result?.settlementSummary });
        setUiState(UI_STATE.RESOLVED);
        return;
      }
      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "active") {
        const rr = await readSessionTruth(targetSessionId, activeCycle);
        if (rr?.ok) applySessionReadState(rr.session, { resumed: true });
        setUiState(UI_STATE.ACTIVE);
        return;
      }
      setUiState(UI_STATE.RESOLVE_FAILED);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve unavailable."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setUiState(UI_STATE.RESOLVE_FAILED);
      setErrorMessage("Network error while resolving outcome.");
    } finally {
      if (activeCycle === cycleRef.current) resolveInFlightRef.current = false;
    }
  }

  async function handleCashOut() {
    const sid = sessionRef.current?.id;
    if (!sid) return;
    if (resolveInFlightRef.current) return;
    const activeCycle = cycleRef.current;
    setUiState(UI_STATE.RESOLVING);
    const response = await fetch("/api/solo-v2/safe-zone/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
      body: JSON.stringify({ sessionId: sid, action: "cashout" }),
    });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return;
    const result = classifySoloV2ApiResult(response, payload);
    if (result === SOLO_V2_API_RESULT.SUCCESS && String(payload?.status || "") === "resolved") {
      terminalPopupEligibleRef.current = true;
      setResolvedResult({ ...payload.result, sessionId: sid, settlementSummary: payload.result?.settlementSummary });
      setUiState(UI_STATE.RESOLVED);
      return;
    }
    setUiState(UI_STATE.ACTIVE);
    setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Cash out failed."));
  }

  async function runStartSession() {
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
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this round.`);
      return;
    }
    cycleRef.current += 1;
    const activeCycle = cycleRef.current;
    const createSessionMode = isGiftRound ? SOLO_V2_SESSION_MODE.FREEPLAY : SOLO_V2_SESSION_MODE.STANDARD;
    const boot = await bootstrapSafeZoneSession(wager, activeCycle, createSessionMode, { isGiftRound, onGiftConsumed: () => giftRefreshRef.current?.() });
    if (isGiftRound) giftRoundRef.current = false;
    if (!boot.ok || activeCycle !== cycleRef.current) return;
    const sid = boot.session?.id;
    if (!sid) return;
    const started = await postStartRun(sid, activeCycle);
    if (!started) return;
    const rr = await readSessionTruth(sid, activeCycle);
    if (rr?.ok) applySessionReadState(rr.session, { resumed: true });
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const sessionId = resolvedResult?.sessionId || session?.id;
    const settlementSummary = resolvedResult?.settlementSummary;
    if (!sessionId || !settlementSummary) return;
    applySafeZoneSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Number(settlementResult.nextBalance || 0);
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = setTimeout(() => { setSession(null); setResolvedResult(null); setResultPopupOpen(false); setSessionNotice(""); setUiState(UI_STATE.IDLE); }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
        return;
      }
      const delta = Number(settlementSummary.netDelta || 0);
      const won = Boolean(resolvedResult?.isWin);
      if (settlementResult.applied) {
        setSessionNotice(`Settled (${delta >= 0 ? "+" : ""}${delta}). Vault: ${authoritativeBalance}.`);
        setStats(prev => {
          const entryCost = Number(settlementSummary.entryCost || QUICK_FLIP_CONFIG.entryCost);
          const payoutReturn = Number(settlementSummary.payoutReturn || 0);
          return {
            ...prev,
            totalGames: Number(prev.totalGames || 0) + 1,
            wins: Number(prev.wins || 0) + (won ? 1 : 0),
            losses: Number(prev.losses || 0) + (won ? 0 : 1),
            totalPlay: Number(prev.totalPlay || 0) + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
            totalWon: Number(prev.totalWon || 0) + payoutReturn,
            biggestWin: Math.max(Number(prev.biggestWin || 0), won ? payoutReturn : 0),
          };
        });
      }
      const shouldOpen = terminalPopupEligibleRef.current;
      terminalPopupEligibleRef.current = false;
      if (shouldOpen) window.setTimeout(() => { openResultPopup(); }, REVEAL_READABLE_MS);
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id, uiState, openResultPopup, resolvedResult?.isWin]);

  const sz = session?.safeZone;
  const playing = sz?.playing || null;
  const simNow = playing?.simNow || {};
  const securedMs = Math.max(0, Number(simNow.securedMs || 0));
  const runEntryFromSession = session != null && Number(session.entryAmount) >= QUICK_FLIP_MIN_WAGER && Number.isFinite(Number(session.entryAmount)) ? Math.floor(Number(session.entryAmount)) : null;
  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable = vaultReady && numericWager >= QUICK_FLIP_MIN_WAGER && vaultBalance >= numericWager;
  const summaryPlay = runEntryFromSession != null ? runEntryFromSession : numericWager;
  const summaryWin = uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary ? Math.floor(Number(resolvedResult.settlementSummary.payoutReturn || 0)) : Math.floor(summaryPlay * Math.max(1, safeZoneMultiplierForSecuredMs(securedMs)));
  const strip = safeStripModel(uiState);
  const canStartRun = wagerPlayable && ![UI_STATE.LOADING, UI_STATE.SUBMITTING_CONTROL, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION, UI_STATE.ACTIVE].includes(uiState) && [UI_STATE.IDLE, UI_STATE.SESSION_CREATED, UI_STATE.RESOLVED].includes(uiState);
  const canHoldRelease = wagerPlayable && uiState === UI_STATE.ACTIVE;
  const canCashOut = canHoldRelease && Boolean(sz?.canCashOut);
  const busyFooter = [UI_STATE.LOADING, UI_STATE.SUBMITTING_CONTROL, UI_STATE.RESOLVING].includes(uiState);
  let primaryActionLabel = "START RUN";
  if (uiState === UI_STATE.ACTIVE) primaryActionLabel = holding ? "RELEASE" : "HOLD";
  const primaryLoading = [UI_STATE.LOADING, UI_STATE.SUBMITTING_CONTROL, UI_STATE.RESOLVING].includes(uiState);
  let payoutBandLabel = "Secured payout";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `${safeZoneMultiplierForSecuredMs(securedMs).toFixed(2)}x · secured ${Math.floor(securedMs / 1000)}s`;
  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    payoutBandLabel = resolvedResult?.isWin ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(Math.floor(Number(resolvedResult.settlementSummary.payoutReturn || 0)));
    payoutCaption = `${String(resolvedResult?.terminalKind || "").replace("_", " ") || "result"}`;
  }
  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const deltaVault = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel = resolvedResult?.settlementSummary != null ? `${deltaVault > 0 ? "+" : ""}${formatCompact(deltaVault)}` : "";
  const popupTitle = resolvedIsWin ? "YOU WIN" : "YOU LOSE";
  const popupLine2 = `Return ${formatCompact(Math.floor(Number(resolvedResult?.settlementSummary?.payoutReturn || 0)))}`;
  const popupLine3 = resolvedResult?.terminalKind === "fail" ? "Out of bounds" : resolvedResult?.terminalKind === "cashout" ? "Cashed out" : "Full duration";

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if ([UI_STATE.LOADING, UI_STATE.SUBMITTING_CONTROL, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION, UI_STATE.ACTIVE].includes(uiState)) return;
    giftRoundRef.current = true;
    void runStartSession();
  }, [vaultReady, giftShell.giftCount, uiState]);

  function handlePresetClick(presetValue) {
    const v = Number(presetValue);
    if (!Number.isFinite(v) || !BET_PRESETS.includes(v)) return;
    const last = lastPresetAmountRef.current;
    if (last === v) {
      setWagerInput(prev => String(Math.min(MAX_WAGER, parseWagerInput(prev) + v)));
      return;
    }
    lastPresetAmountRef.current = v;
    setWagerInput(String(v));
  }

  async function handlePrimary() {
    if (uiState === UI_STATE.ACTIVE) {
      const nextHolding = !holding;
      setHolding(nextHolding);
      await postControl(nextHolding, cycleRef.current);
      return;
    }
    if (canStartRun) await runStartSession();
  }

  return (
    <SoloV2GameShell
      title="Safe Zone"
      subtitle="Hold the line."
      layoutMaxWidthClass="max-w-full sm:max-w-2xl lg:max-w-5xl"
      mobileHeaderBreathingRoom
      stableTripleTopSummary
      gameplayScrollable={false}
      gameplayDesktopUnclipVertical
      menuVaultBalance={vaultBalance}
      gift={{ ...giftShell, onGiftClick: handleGiftPlay }}
      hideStatusPanel
      hideActionBar
      onBack={() => { if (typeof window !== "undefined") window.location.href = "/arcade-v2"; }}
      topGameStatsSlot={
        <>
          <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-zinc-500"><span>Play</span><span className="font-semibold tabular-nums text-emerald-200/90">{formatCompact(summaryPlay)}</span></span>
          <span className="shrink-0 text-zinc-600" aria-hidden>·</span>
          <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-zinc-500"><span>Win</span><span className="font-semibold tabular-nums text-lime-200/90">{formatCompact(summaryWin)}</span></span>
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
        onDecreaseAmount: () => setWagerInput(prev => String(Math.min(MAX_WAGER, Math.max(0, parseWagerInput(prev) - QUICK_FLIP_MIN_WAGER)))),
        onIncreaseAmount: () => setWagerInput(prev => String(Math.min(MAX_WAGER, parseWagerInput(prev) + 1000))),
        onAmountInput: raw => setWagerInput(String(raw).replace(/\D/g, "").slice(0, 12)),
        onResetAmount: () => setWagerInput(String(QUICK_FLIP_MIN_WAGER)),
        primaryActionLabel,
        primaryActionDisabled: uiState === UI_STATE.ACTIVE ? !canHoldRelease : !canStartRun,
        primaryActionLoading: primaryLoading,
        primaryLoadingLabel: uiState === UI_STATE.RESOLVING ? "RESOLVING..." : "UPDATING...",
        onPrimaryAction: () => { void handlePrimary(); },
        errorMessage: errorMessage || "",
        desktopPayout: { label: payoutBandLabel, value: payoutBandValue },
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <SafeZoneGameplayPanel
          uiState={uiState}
          playing={playing}
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
          resolvedKind={resolvedResult?.terminalKind || null}
          holding={holding}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>Safe Zone is a control run: press START RUN, then use HOLD/RELEASE to stabilize the level inside the safe band. The server evaluates drift, control events, secured time, and terminal state.</p>
          <p>After the minimum secured threshold, CASH OUT becomes available. Longer stable control unlocks higher payout tiers; falling out of bounds ends the run.</p>
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
        </div>
      }
      resultState={null}
    />
  );
}
