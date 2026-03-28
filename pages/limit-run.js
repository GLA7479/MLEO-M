import { useEffect, useRef, useState } from "react";
import LimitRunBoard from "../components/solo-v2/LimitRunBoard";
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
  LIMIT_RUN_LIMBO_MIN_TARGET,
  LIMIT_RUN_MIN_WAGER,
  limboProjectedPayout,
  limboWinChancePercent,
  normalizeLimitRunTargetMultiplier,
} from "../lib/solo-v2/limitRunConfig";
import {
  applyLimitRunSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "limit_run";
const PLAYER_HEADER = "limit-run-client";

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

const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

/** Gameplay slot: single flex-1 board (shell handles wager / START RUN / ad — same anchors as Speed Track). */
function LimitRunGameplayPanel({
  session,
  uiState,
  targetMultiplier,
  onTargetChange,
  displayMultiplierText,
  rollingUi,
  resultLineUi,
  resultToneUi,
  sessionNotice,
  onRoll,
  rollDisabled,
  resultPopupOpen,
  resolvedIsWin,
  resultTitle,
  resultVaultLabel,
}) {
  const lr = session?.limitRun;
  const playing = lr?.playing;
  const entry = playing?.entryAmount ?? session?.entryAmount ?? LIMIT_RUN_MIN_WAGER;
  const winChance = limboWinChancePercent(targetMultiplier);
  const projected = limboProjectedPayout(entry, targetMultiplier);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-1 text-center sm:px-2">
      <div className="flex min-h-0 flex-1 flex-col">
        <LimitRunBoard
          targetMultiplier={targetMultiplier}
          onTargetChange={onTargetChange}
          displayMultiplierText={displayMultiplierText}
          rolling={rollingUi}
          resultLine={resultLineUi}
          resultTone={resultToneUi}
          winChancePercent={winChance}
          projectedPayoutLabel={formatCompact(projected)}
          onRoll={onRoll}
          rollDisabled={rollDisabled}
          sessionNotice={sessionNotice}
          showHeroHint={
            uiState === UI_STATE.SESSION_ACTIVE &&
            String(lr?.readState || "") === "ready" &&
            !rollingUi &&
            !resultLineUi
          }
        />
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        animationKey={String(resultTitle)}
        vaultSlot={<SoloV2ResultPopupVaultLine isWin={resolvedIsWin} deltaLabel={resultVaultLabel} />}
      >
        <p className="text-sm font-extrabold leading-tight">{resultTitle}</p>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function LimitRunPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(LIMIT_RUN_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [targetMultiplier, setTargetMultiplier] = useState(LIMIT_RUN_LIMBO_MIN_TARGET);
  const [displayMultiplierText, setDisplayMultiplierText] = useState("—");
  const [rollingUi, setRollingUi] = useState(false);
  const [resultLineUi, setResultLineUi] = useState("");
  const [resultToneUi, setResultToneUi] = useState("neutral");

  const cycleRef = useRef(0);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const sessionRef = useRef(null);
  const giftRoundRef = useRef(false);
  const giftRefreshRef = useRef(() => {});
  const lastPresetAmountRef = useRef(null);
  const resultPopupTimerRef = useRef(null);
  const rollAnimTimerRef = useRef(null);

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
      if (rollAnimTimerRef.current) {
        clearInterval(rollAnimTimerRef.current);
        rollAnimTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyLimitRunSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        return;
      }
      const delta = Number(settlementSummary.netDelta || 0);
      if (settlementResult.applied) {
        setVaultBalance(Math.max(0, Number(settlementResult.nextBalance || 0)));
      }
      if (settlementResult.applied && delta !== 0) {
        const sign = delta > 0 ? "+" : "";
        setSessionNotice(`Vault ${sign}${formatCompact(delta)}`);
      }
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id]);

  function resetAfterResultPopup() {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    if (rollAnimTimerRef.current) {
      clearInterval(rollAnimTimerRef.current);
      rollAnimTimerRef.current = null;
    }
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setResultPopupOpen(false);
    setSession(null);
    setResolvedResult(null);
    setUiState(UI_STATE.IDLE);
    setSessionNotice("");
    setDisplayMultiplierText("—");
    setRollingUi(false);
    setResultLineUi("");
    setResultToneUi("neutral");
  }

  function openResultPopup() {
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(true);
    resultPopupTimerRef.current = window.setTimeout(() => {
      resultPopupTimerRef.current = null;
      resetAfterResultPopup();
    }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
  }

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const lrSnap = sessionPayload?.limitRun;
    const readState = String(lrSnap?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && lrSnap?.resolvedResult) {
      setResolvedResult({
        ...lrSnap.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: lrSnap.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Round finished (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "roll_conflict") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting roll — refresh and try again.");
      return;
    }

    if (readState === "roll_submitted") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Finishing your roll…" : "Resolving roll…");
      setErrorMessage("");
      return;
    }

    if (readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setDisplayMultiplierText("—");
      setRollingUi(false);
      setResultLineUi("");
      setResultToneUi("neutral");
      setSessionNotice(resumed ? "Session restored — set target and roll." : "Set target and tap Roll.");
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
    setSession(null);
    setResolvedResult(null);
    setDisplayMultiplierText("—");
    setResultLineUi("");
    setResultToneUi("neutral");

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
    const response = await fetch("/api/solo-v2/limit-run/resolve", {
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

  function applyRollOutcomeToUi(r, sid, { animate }) {
    const finalMult = Number(r.rollMultiplier);
    const tgt = Number(r.targetMultiplier);
    const won = Boolean(r.won ?? r.isWin ?? r.terminalKind === "full_clear");

    const line = won
      ? `Win — ×${finalMult.toFixed(2)} ≥ ×${tgt.toFixed(2)}`
      : `Miss — ×${finalMult.toFixed(2)} < ×${tgt.toFixed(2)}`;

    if (!animate) {
      setDisplayMultiplierText(Number.isFinite(finalMult) ? finalMult.toFixed(2) : "—");
      setRollingUi(false);
      setResultLineUi(line);
      setResultToneUi(won ? "win" : "lose");
      setResolvedResult({
        ...r,
        sessionId: r.sessionId || sid,
        settlementSummary: r.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      openResultPopup();
      return;
    }

    setRollingUi(true);
    if (rollAnimTimerRef.current) clearInterval(rollAnimTimerRef.current);
    let count = 0;
    rollAnimTimerRef.current = setInterval(() => {
      count += 1;
      setDisplayMultiplierText((Math.random() * 99 + 1).toFixed(2));
      if (count >= 14) {
        if (rollAnimTimerRef.current) {
          clearInterval(rollAnimTimerRef.current);
          rollAnimTimerRef.current = null;
        }
        setDisplayMultiplierText(Number.isFinite(finalMult) ? finalMult.toFixed(2) : "—");
        setRollingUi(false);
        setResultLineUi(line);
        setResultToneUi(won ? "win" : "lose");
        setResolvedResult({
          ...r,
          sessionId: r.sessionId || sid,
          settlementSummary: r.settlementSummary,
        });
        setUiState(UI_STATE.RESOLVED);
        openResultPopup();
      }
    }, 48);
  }

  async function handleResolvePendingRoll(sessionId, activeCycle, { animate }) {
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
        applyRollOutcomeToUi(r, sessionId, { animate });
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      setRollingUi(false);
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

  async function handleRoll() {
    const sid = sessionRef.current?.id;
    const lr = sessionRef.current?.limitRun;
    if (sid == null || String(lr?.readState || "") !== "ready") return;
    if (submitInFlightRef.current || resolveInFlightRef.current || rollingUi) return;

    const target = normalizeLimitRunTargetMultiplier(targetMultiplier);
    if (target === null) return;

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_PICK);
    setErrorMessage("");
    setRollingUi(true);
    setResultLineUi("");
    setResultToneUi("neutral");
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
            action: "limit_run_roll",
            gameKey: GAME_KEY,
            targetMultiplier: target,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolvePendingRoll(sid, activeCycle, { animate: true });
        return;
      }

      setRollingUi(false);
      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "roll_conflict" || st === "turn_pending")) {
        const rr = await readSessionTruth(sid, activeCycle);
        if (rr?.ok && rr.session) {
          setSession(rr.session);
          applySessionReadState(rr.session, { resumed: true });
        }
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Roll rejected — state refreshed."));
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

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Roll failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setRollingUi(false);
      setErrorMessage("Network error while rolling.");
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
    if (!isGiftRound && wager < LIMIT_RUN_MIN_WAGER) return;
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
    const lrBoot = boot.session?.limitRun;
    if (lrBoot?.readState === "roll_submitted" && lrBoot?.canResolveTurn) {
      void handleResolvePendingRoll(boot.session.id, activeCycle, { animate: false });
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const lrSnap = session?.limitRun;
    if (!sid || !lrSnap || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!lrSnap.canResolveTurn) return;
    if (lrSnap.readState !== "roll_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePendingRoll(sid, cycleRef.current, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.limitRun?.readState, session?.limitRun?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= LIMIT_RUN_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= LIMIT_RUN_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(
      uiState,
    ) &&
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  const lrSnap = session?.limitRun;
  const playing = lrSnap?.playing;

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= LIMIT_RUN_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  let summaryWin = limboProjectedPayout(Math.max(LIMIT_RUN_MIN_WAGER, numericWager), targetMultiplier);

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing?.entryAmount != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING)) {
    summaryWin = limboProjectedPayout(Math.floor(Number(playing.entryAmount)), targetMultiplier);
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const terminalKind = resolvedResult?.terminalKind;
  let resultTitle = "Round complete";
  if (terminalKind === "overload") {
    if (resolvedResult?.overloadReason === "limbo_miss") {
      const t = Number(resolvedResult?.targetMultiplier);
      resultTitle = Number.isFinite(t)
        ? `Landed under ×${t.toFixed(2)}`
        : "Below your target";
    } else resultTitle = "No win";
  } else if (terminalKind === "full_clear") {
    const r = Number(resolvedResult?.rollMultiplier);
    const t = Number(resolvedResult?.targetMultiplier);
    resultTitle =
      Number.isFinite(r) && Number.isFinite(t)
        ? `Hit ×${r.toFixed(2)} — beat ×${t.toFixed(2)}`
        : "Target beaten";
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null
      ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}`
      : "";

  function handleGiftPlay() {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    giftRoundRef.current = true;
    void runStartRun();
  }

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

  const readState = String(lrSnap?.readState || "");
  const rollDisabled =
    busyFooter ||
    uiState !== UI_STATE.SESSION_ACTIVE ||
    readState !== "ready" ||
    rollingUi;

  return (
    <SoloV2GameShell
      title="Limit Run"
      subtitle="Pick a target · Roll · Land on or above it to win"
      layoutMaxWidthClass="max-w-full sm:max-w-2xl"
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
          <span className="shrink-0 whitespace-nowrap text-zinc-500">
            Play <span className="font-semibold tabular-nums text-emerald-200/90">{formatCompact(summaryPlay)}</span>
          </span>
          <span className="shrink-0 text-zinc-600" aria-hidden>
            ·
          </span>
          <span className="shrink-0 whitespace-nowrap text-zinc-500">
            Win <span className="font-semibold tabular-nums text-lime-200/90">{formatCompact(summaryWin)}</span>
          </span>
        </>
      }
      soloV2Footer={{
        betPresets: BET_PRESETS,
        wagerInput,
        wagerNumeric: numericWager,
        canEditPlay: !busyFooter,
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            return String(Math.min(MAX_WAGER, Math.max(0, c - LIMIT_RUN_MIN_WAGER)));
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
          setWagerInput(String(LIMIT_RUN_MIN_WAGER));
        },
        primaryActionLabel: "START RUN",
        primaryActionDisabled: !canStart,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => {
          void runStartRun();
        },
        errorMessage: errorMessage || stakeHint,
      }}
      gameplaySlot={
        <LimitRunGameplayPanel
          session={session}
          uiState={uiState}
          targetMultiplier={targetMultiplier}
          onTargetChange={setTargetMultiplier}
          displayMultiplierText={displayMultiplierText}
          rollingUi={rollingUi}
          resultLineUi={resultLineUi}
          resultToneUi={resultToneUi}
          sessionNotice={sessionNotice}
          onRoll={handleRoll}
          rollDisabled={rollDisabled}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          resultTitle={resultTitle}
          resultVaultLabel={resultVaultLabel}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Choose a target multiplier (slider or quick presets). Your stake is set when you press START RUN — win
            chance and projected payout update with the target.
          </p>
          <p>
            Tap Roll: the server draws a random multiplier. If the result is greater than or equal to your target, you
            win your stake × target; otherwise the round is a loss.
          </p>
        </div>
      }
      resultState={null}
    />
  );
}
