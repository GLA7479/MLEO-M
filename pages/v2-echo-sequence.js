import { useCallback, useEffect, useRef, useState } from "react";
import EchoSequenceBoard from "../components/solo-v2/EchoSequenceBoard";
import SoloV2BoardCashOutControl from "../components/solo-v2/SoloV2BoardCashOutControl";
import SoloV2ResultPopup, { SoloV2ResultPopupVaultLine, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS } from "../components/solo-v2/SoloV2ResultPopup";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import SoloV2ProgressStrip from "../components/solo-v2/SoloV2ProgressStrip";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import { SOLO_V2_GIFT_ROUND_STAKE, soloV2GiftConsumeOne } from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import { ECHO_SEQUENCE_MIN_WAGER } from "../lib/solo-v2/echoSequenceConfig";
import { applyEchoSequenceSettlementOnce, readQuickFlipSharedVaultBalance, subscribeQuickFlipSharedVault } from "../lib/solo-v2/quickFlipLocalVault";
import { SOLO_V2_API_RESULT, buildSoloV2ApiErrorMessage, classifySoloV2ApiResult, isSoloV2EventRejectedStaleSessionMessage } from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "echo_sequence";
const PLAYER_HEADER = "echo-sequence-client";
const UI_STATE = { IDLE: "idle", LOADING: "loading", PENDING_MIGRATION: "pending_migration", UNAVAILABLE: "unavailable", SESSION_ACTIVE: "session_active", SUBMITTING_PICK: "submitting_pick", RESOLVING: "resolving", RESOLVED: "resolved" };
const STATS_KEY = "solo_v2_echo_sequence_stats_v1";
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
    const p = raw ? JSON.parse(raw) : null;
    return { totalGames: Number(p?.totalGames || 0), wins: Number(p?.wins || 0), losses: Number(p?.losses || 0), totalPlay: Number(p?.totalPlay || 0), totalWon: Number(p?.totalWon || 0), biggestWin: Number(p?.biggestWin || 0) };
  } catch {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
  }
}

function writeStats(next) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STATS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

function EchoGameplayPanel({
  session,
  uiState,
  onChoose,
  sessionNotice,
  showBoardCashOut,
  boardCashOutDisabled,
  boardCashOutLoading,
  onBoardCashOut,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
}) {
  const es = session?.echoSequence;
  const playing = es?.playing;
  const rr = es?.resolvedResult;
  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Number(playing?.totalRounds || 5));
  const cleared = Math.max(0, Math.min(total, Number(playing?.clearedRounds?.length || 0)));
  const cur = Math.max(0, Math.min(total - 1, Number(playing?.currentRoundIndex || 0)));
  const readState = String(es?.readState || "");
  const revealVisible = readState !== "choice_required";
  const disabled = uiState !== UI_STATE.SESSION_ACTIVE || readState !== "choice_required";
  return (
    <div className="solo-v2-route-stack relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
      <div className="solo-v2-board-frame flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-amber-900/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex h-4 shrink-0 items-center justify-center px-2 sm:h-[1.125rem] lg:px-5">
          <p className={`line-clamp-1 w-full text-center text-[9px] font-semibold leading-tight text-amber-200/85 sm:text-[10px] ${showSession ? "opacity-100" : "opacity-0"}`}>{showSession ? sessionNotice : "\u00a0"}</p>
        </div>
        <SoloV2ProgressStrip keyPrefix="es" rowLabel="Rounds" ariaLabel="Round progress" stepTotal={total} stepsComplete={cleared} currentStepIndex={cur} stepLabels={Array.from({ length: total }, (_, i) => `R${i + 1}`)} />
        <div className="solo-v2-ladder-playfield-wrap flex min-h-0 flex-1 flex-col px-1 pb-1 sm:px-2 lg:min-h-0 lg:px-4 lg:pb-1.5">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-700/55 bg-zinc-950/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] lg:min-h-[min(14rem,30vh)]" aria-label="Echo Sequence board">
            <div className="solo-v2-ladder-play-inner flex min-h-0 min-h-[11rem] flex-1 flex-col items-center justify-center px-0.5 py-1 sm:min-h-[12rem] sm:px-1 sm:py-1.5 lg:min-h-0 lg:px-1 lg:py-0.5">
              <EchoSequenceBoard
                phase={readState === "choice_required" ? "choose" : "reveal"}
                currentRound={playing?.currentRound || null}
                revealVisible={revealVisible}
                onChooseOption={onChoose}
                disabled={disabled}
                chosenOptionKey={rr?.chosenOptionKey || null}
                correctOptionKey={rr?.correctOptionKey || null}
                terminalKind={rr?.terminalKind || null}
              />
            </div>
            <div className="hidden shrink-0 flex-col items-center justify-center gap-2 border-t border-zinc-700/45 bg-zinc-900/30 px-2 py-2 sm:py-2.5 lg:flex lg:min-h-[4.25rem] lg:gap-1.5 lg:px-2 lg:py-1.5">
              <SoloV2BoardCashOutControl
                show={showBoardCashOut}
                label="Cash out (secured)"
                loadingLabel="Cashing out…"
                disabled={boardCashOutDisabled}
                loading={boardCashOutLoading}
                onClick={onBoardCashOut}
                wrapperClassName="flex w-full shrink-0 justify-center px-1 pb-0 pt-0 sm:px-2"
              />
              <div className="h-10 w-full max-w-sm sm:mx-auto sm:h-[2.4rem] lg:h-8 lg:max-w-2xl" aria-hidden />
            </div>
          </div>
          <div className="flex w-full min-w-0 shrink-0 flex-col items-stretch justify-center px-0 py-2 sm:py-2.5 lg:hidden">
            {showBoardCashOut ? (
              <button type="button" onClick={onBoardCashOut} disabled={boardCashOutDisabled || boardCashOutLoading} className={`min-h-[48px] w-full rounded-lg border px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide sm:text-sm ${boardCashOutDisabled || boardCashOutLoading ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500" : "border-amber-400/45 bg-amber-950/40 text-amber-100 active:bg-amber-900/45"}`}>{boardCashOutLoading ? "Cashing out…" : "Cash out (secured)"}</button>
            ) : (<div className="pointer-events-none min-h-[2.5rem] w-full sm:min-h-[2.4rem]" aria-hidden />)}
          </div>
        </div>
      </div>
      <SoloV2ResultPopup open={resultPopupOpen} isWin={resolvedIsWin} resultTone={resolvedIsWin ? "win" : "lose"} animationKey={`${popupLine2}-${popupLine3}-${resolvedIsWin ? "w" : "l"}-${resultVaultLabel}`} vaultSlot={resultPopupOpen ? <SoloV2ResultPopupVaultLine isWin={resolvedIsWin} tone={resolvedIsWin ? "win" : "lose"} deltaLabel={resultVaultLabel} /> : undefined}>
        <div className="text-[13px] font-black uppercase tracking-wide">{resolvedIsWin ? "YOU WIN" : "YOU LOSE"}</div>
        <div className="mt-1 text-sm font-bold text-white"><span className="text-amber-100 tabular-nums">{popupLine2}</span></div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function EchoSequencePage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(ECHO_SEQUENCE_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [cashOutLoading, setCashOutLoading] = useState(false);
  const [stats, setStats] = useState(readStats);
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
  useEffect(() => { giftRefreshRef.current = giftShell.refresh; }, [giftShell.refresh]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { writeStats(stats); }, [stats]);
  useEffect(() => { let cancelled = false; readQuickFlipSharedVaultBalance().then(result => { if (cancelled) return; if (result.ok) { setVaultBalance(result.balance); setVaultReady(true); } else { setVaultReady(false); } }); const unsub = subscribeQuickFlipSharedVault(({ balance }) => { setVaultBalance(balance); setVaultReady(true); }); return () => { cancelled = true; unsub(); }; }, []);
  useEffect(() => () => { if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current); }, []);

  const dismissResultPopupAfterTerminalRun = useCallback(() => { if (resultPopupTimerRef.current) { clearTimeout(resultPopupTimerRef.current); resultPopupTimerRef.current = null; } submitInFlightRef.current = false; resolveInFlightRef.current = false; setResultPopupOpen(false); }, []);
  const openResultPopup = useCallback(() => { if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current); setResultPopupOpen(true); resultPopupTimerRef.current = window.setTimeout(() => { resultPopupTimerRef.current = null; dismissResultPopupAfterTerminalRun(); }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS); }, [dismissResultPopupAfterTerminalRun]);

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const es = sessionPayload?.echoSequence;
    const readState = String(es?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");
    if (st === "resolved" && es?.resolvedResult) {
      setResolvedResult({ ...es.resolvedResult, sessionId: sessionPayload.id, settlementSummary: es.resolvedResult.settlementSummary });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Run ended (restored)." : "");
      setErrorMessage("");
      return;
    }
    if (readState === "choice_submitted") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("Resolving your choice…");
      setErrorMessage("");
      return;
    }
    if (readState === "choice_required" || readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Resumed active run." : "Watch, remember, choose.");
      setErrorMessage("");
      return;
    }
    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setSession(null); setResolvedResult(null); setUiState(UI_STATE.IDLE); setSessionNotice("");
      setErrorMessage(st === "expired" ? "Session expired. Press START RUN." : "Session ended. Press START RUN.");
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
    if (result === SOLO_V2_API_RESULT.SUCCESS && payload?.session) return { ok: true, session: payload.session, readStatus: String(payload?.status || "") };
    if (result === SOLO_V2_API_RESULT.PENDING_MIGRATION) return { ok: false, state: UI_STATE.PENDING_MIGRATION, message: buildSoloV2ApiErrorMessage(payload, "Migration is pending.") };
    if (result === SOLO_V2_API_RESULT.UNAVAILABLE) return { ok: false, state: UI_STATE.UNAVAILABLE, message: buildSoloV2ApiErrorMessage(payload, "Session read unavailable.") };
    return { ok: false, state: UI_STATE.UNAVAILABLE, message: buildSoloV2ApiErrorMessage(payload, "Session read rejected.") };
  }

  async function bootstrapSession(wager, activeCycle, createSessionMode, giftRoundMeta) {
    const isGiftRound = Boolean(giftRoundMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING); setErrorMessage("");
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(false); setSession(null); setResolvedResult(null);
    try {
      const response = await fetch("/api/solo-v2/sessions/create", { method: "POST", headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER }, body: JSON.stringify({ gameKey: GAME_KEY, sessionMode: createSessionMode, entryAmount: wager }) });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");
      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "created" && payload?.session) {
        if (isGiftRound) {
          if (!soloV2GiftConsumeOne()) { setSession(null); setUiState(UI_STATE.IDLE); setErrorMessage("No gift available."); return { ok: false }; }
          giftRoundMeta?.onGiftConsumed?.();
        }
        const rr = await readSessionTruth(payload.session.id, activeCycle);
        if (!rr?.ok) { setUiState(rr.state); setErrorMessage(rr.message); return { ok: false }; }
        setSession(rr.session); applySessionReadState(rr.session, { resumed: false }); return { ok: true, session: rr.session };
      }
      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "existing_session" && payload?.session) {
        const rr = await readSessionTruth(payload.session.id, activeCycle);
        if (!rr?.ok) { setUiState(rr.state); setErrorMessage(rr.message); return { ok: false }; }
        setSession(rr.session); applySessionReadState(rr.session, { resumed: true });
        if (rr.session?.sessionStatus === "resolved") return { ok: true, session: rr.session, alreadyTerminal: true };
        return { ok: true, session: rr.session };
      }
      setUiState(result === SOLO_V2_API_RESULT.PENDING_MIGRATION ? UI_STATE.PENDING_MIGRATION : UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Session bootstrap rejected."));
      return { ok: false };
    } catch (_e) {
      if (activeCycle !== cycleRef.current) return { ok: false };
      setUiState(UI_STATE.UNAVAILABLE); setErrorMessage("Network error while creating session."); return { ok: false };
    } finally { if (activeCycle === cycleRef.current) createInFlightRef.current = false; }
  }

  async function postResolve(sessionId, body, activeCycle) {
    const response = await fetch("/api/solo-v2/echo-sequence/resolve", { method: "POST", headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER }, body: JSON.stringify({ sessionId, ...body }) });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return { halted: true };
    return { response, payload };
  }

  async function postStartEvent(sessionId, activeCycle) {
    const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
      body: JSON.stringify({
        eventType: "client_action",
        eventPayload: { action: "echo_sequence_start", gameKey: GAME_KEY },
      }),
    });
    const payload = await response.json().catch(() => null);
    if (activeCycle !== cycleRef.current) return { halted: true };
    return { response, payload };
  }

  async function handleResolveAfterChoice(sessionId, activeCycle) {
    if (resolveInFlightRef.current) return;
    resolveInFlightRef.current = true; setUiState(UI_STATE.RESOLVING);
    try {
      const { response, payload, halted } = await postResolve(sessionId, {}, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const result = classifySoloV2ApiResult(response, payload);
      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "turn_complete") {
        const rr = await readSessionTruth(sessionId, activeCycle);
        if (rr?.ok) { setSession(rr.session); applySessionReadState(rr.session, { resumed: true }); }
        return;
      }
      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const rr = await readSessionTruth(sessionId, activeCycle);
        if (rr?.ok) { setSession(rr.session); applySessionReadState(rr.session, { resumed: true }); }
        setResolvedResult({ ...payload.result, sessionId: sessionId, settlementSummary: payload.result?.settlementSummary });
        setUiState(UI_STATE.RESOLVED); terminalPopupEligibleRef.current = true; return;
      }
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally { resolveInFlightRef.current = false; }
  }

  async function handleChooseOption(optionKey) {
    const sid = sessionRef.current?.id;
    const roundIndex = sessionRef.current?.echoSequence?.playing?.currentRoundIndex;
    if (!sid || !Number.isFinite(Number(roundIndex))) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;
    submitInFlightRef.current = true; setUiState(UI_STATE.SUBMITTING_PICK); setErrorMessage("");
    const activeCycle = cycleRef.current;
    try {
      const response = await fetch(`/api/solo-v2/sessions/${sid}/event`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-solo-v2-player": PLAYER_HEADER },
        body: JSON.stringify({ eventType: "client_action", eventPayload: { action: "echo_sequence_choose", gameKey: GAME_KEY, roundIndex, optionKey } }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");
      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolveAfterChoice(sid, activeCycle);
        return;
      }
      if (api === SOLO_V2_API_RESULT.CONFLICT && st === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) { setSession(null); setUiState(UI_STATE.IDLE); setErrorMessage(msg || "Session expired."); return; }
      }
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Choice failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setErrorMessage("Network error while submitting choice.");
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally { submitInFlightRef.current = false; }
  }

  async function handleCashOut() {
    const sid = session?.id;
    if (!sid || cashOutLoading || resolveInFlightRef.current) return;
    setCashOutLoading(true); setUiState(UI_STATE.RESOLVING);
    const activeCycle = cycleRef.current;
    try {
      const { response, payload, halted } = await postResolve(sid, { action: "cashout" }, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const api = classifySoloV2ApiResult(response, payload);
      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const rr = await readSessionTruth(sid, activeCycle);
        if (rr?.ok) { setSession(rr.session); applySessionReadState(rr.session, { resumed: true }); }
        setResolvedResult({ ...payload.result, sessionId: sid, settlementSummary: payload.result?.settlementSummary });
        setUiState(UI_STATE.RESOLVED); terminalPopupEligibleRef.current = true; return;
      }
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Cash out failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally { setCashOutLoading(false); }
  }

  async function runStartRun() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    if (!vaultReady) { setUiState(UI_STATE.UNAVAILABLE); setErrorMessage("Shared vault unavailable."); if (isGiftRound) giftRoundRef.current = false; return; }
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < ECHO_SEQUENCE_MIN_WAGER) return;
    if (!isGiftRound && vaultBalance < wager) { setErrorMessage(`Insufficient vault balance. Need ${wager} for this run.`); return; }
    cycleRef.current += 1;
    const activeCycle = cycleRef.current;
    const mode = isGiftRound ? SOLO_V2_SESSION_MODE.FREEPLAY : SOLO_V2_SESSION_MODE.STANDARD;
    const boot = await bootstrapSession(wager, activeCycle, mode, { isGiftRound, onGiftConsumed: () => giftRefreshRef.current?.() });
    if (isGiftRound) giftRoundRef.current = false;
    if (!boot.ok || boot.alreadyTerminal) return;
    if (String(boot.session?.echoSequence?.readState || "") === "ready") {
      const start = await postStartEvent(boot.session.id, activeCycle);
      if (!start?.halted) {
        const api = classifySoloV2ApiResult(start.response, start.payload);
        if (api === SOLO_V2_API_RESULT.SUCCESS) {
          const rr = await readSessionTruth(boot.session.id, activeCycle);
          if (rr?.ok && rr.session) {
            setSession(rr.session);
            applySessionReadState(rr.session, { resumed: true });
          }
        }
      }
    }
    if (String(boot.session?.echoSequence?.readState || "") === "choice_submitted") await handleResolveAfterChoice(boot.session.id, activeCycle);
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyEchoSequenceSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Math.max(0, Number(settlementResult.nextBalance || 0));
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = window.setTimeout(() => { setSession(null); setResolvedResult(null); setResultPopupOpen(false); setUiState(UI_STATE.IDLE); setSessionNotice(""); }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
        return;
      }
      const delta = Number(settlementSummary.netDelta || 0);
      const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
      const won = Boolean(resolvedResult?.isWin);
      if (settlementResult.applied) {
        setSessionNotice(`Settled (${deltaLabel}). Vault: ${authoritativeBalance}.`);
        setStats(prev => {
          const entryCost = Number(settlementSummary.entryCost || QUICK_FLIP_CONFIG.entryCost);
          const payoutReturn = Number(settlementSummary.payoutReturn || 0);
          return { ...prev, totalGames: Number(prev.totalGames || 0) + 1, wins: Number(prev.wins || 0) + (won ? 1 : 0), losses: Number(prev.losses || 0) + (won ? 0 : 1), totalPlay: Number(prev.totalPlay || 0) + (settlementSummary.fundingSource === "gift" ? 0 : entryCost), totalWon: Number(prev.totalWon || 0) + payoutReturn, biggestWin: Math.max(Number(prev.biggestWin || 0), won ? payoutReturn : 0) };
        });
      }
      const shouldOpenTerminalPopup = terminalPopupEligibleRef.current;
      terminalPopupEligibleRef.current = false;
      if (shouldOpenTerminalPopup) window.setTimeout(() => { openResultPopup(); }, REVEAL_READABLE_MS);
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, resolvedResult?.isWin, session?.id, uiState, openResultPopup]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable = vaultReady && numericWager >= ECHO_SEQUENCE_MIN_WAGER && vaultBalance >= numericWager;
  const canStart = wagerPlayable && ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState) && (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE || uiState === UI_STATE.RESOLVED);
  const busyFooter = uiState === UI_STATE.SUBMITTING_PICK || uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING;
  const inRun = uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.SUBMITTING_PICK || uiState === UI_STATE.RESOLVING;
  const play = session?.entryAmount ? Number(session.entryAmount) : numericWager;
  const win = inRun ? Number(session?.echoSequence?.playing?.nextPayout || 0) : Number(resolvedResult?.settlementSummary?.payoutReturn || 0);
  const terminalKind = resolvedResult?.terminalKind;
  const popupLine2 = terminalKind === "wrong" ? "Wrong sequence" : terminalKind === "cashout" ? `Cashed ${formatCompact(win)}` : `Return ${formatCompact(win)}`;
  const popupLine3 = terminalKind === "full_clear" ? "All rounds cleared" : terminalKind === "cashout" ? "Secured payout" : "Run complete";
  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel = resolvedResult?.settlementSummary != null ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}` : "";

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) { setErrorMessage("Shared vault unavailable."); return; }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if ([UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState)) return;
    giftRoundRef.current = true;
    void runStartRun();
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

  return (
    <SoloV2GameShell
      title="Echo Sequence"
      subtitle="Watch. Remember. Choose."
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
      topGameStatsSlot={<><span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-zinc-500"><span>Play</span><span className="font-semibold tabular-nums text-emerald-200/90">{formatCompact(play)}</span></span><span className="shrink-0 text-zinc-600" aria-hidden>·</span><span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-zinc-500"><span>Win</span><span className="font-semibold tabular-nums text-lime-200/90">{formatCompact(win)}</span></span></>}
      soloV2Footer={{
        betPresets: BET_PRESETS,
        wagerInput,
        wagerNumeric: numericWager,
        canEditPlay: !busyFooter,
        compactAmountDisplayWhenBlurred: true,
        formatPresetLabel: v => formatCompact(v),
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => setWagerInput(prev => String(Math.min(MAX_WAGER, Math.max(0, parseWagerInput(prev) - ECHO_SEQUENCE_MIN_WAGER)))),
        onIncreaseAmount: () => setWagerInput(prev => String(Math.min(MAX_WAGER, parseWagerInput(prev) + 1000))),
        onAmountInput: raw => setWagerInput(String(raw).replace(/\D/g, "").slice(0, 12)),
        onResetAmount: () => setWagerInput(String(ECHO_SEQUENCE_MIN_WAGER)),
        primaryActionLabel: "START RUN",
        primaryActionDisabled: !canStart,
        primaryActionLoading: uiState === UI_STATE.LOADING,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => { void runStartRun(); },
        errorMessage: errorMessage,
        desktopPayout: { label: "Secured payout", value: formatCompact(win) },
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={<EchoGameplayPanel session={session} uiState={uiState} onChoose={k => { void handleChooseOption(k); }} sessionNotice={sessionNotice} showBoardCashOut={uiState === UI_STATE.SESSION_ACTIVE && Boolean(session?.echoSequence?.canCashOut)} boardCashOutDisabled={cashOutLoading || busyFooter} boardCashOutLoading={cashOutLoading} onBoardCashOut={() => { void handleCashOut(); }} resultPopupOpen={resultPopupOpen} resolvedIsWin={resolvedIsWin} popupLine2={popupLine2} popupLine3={popupLine3} resultVaultLabel={resultVaultLabel} />}
      helpContent={<div className="space-y-2"><p>Echo Sequence is a five-round memory run: the server reveals a symbol pattern for the current round, then presents options. You choose one option; the server validates correctness and advances or ends the run.</p><p>After at least one correct round, cash-out becomes available. Final round clear gives max payout. Gift rounds are freeplay: losses do not debit vault, wins credit full return.</p></div>}
      statsContent={<div className="space-y-2"><p>Total games: {stats.totalGames}</p><p>Wins: {stats.wins}</p><p>Losses: {stats.losses}</p><p>Win rate: {stats.totalGames ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : "0.0"}%</p><p>Total played: {formatCompact(stats.totalPlay)}</p><p>Total returned: {formatCompact(stats.totalWon)}</p><p>Biggest win: {formatCompact(stats.biggestWin)}</p></div>}
      resultState={null}
    />
  );
}
