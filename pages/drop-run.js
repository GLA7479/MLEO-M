import { useEffect, useRef, useState } from "react";
import DropRunBoard from "../components/solo-v2/DropRunBoard";
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
import { DROP_RUN_MIN_WAGER, dropRunMaxPayout, dropRunMultiplierForBay } from "../lib/solo-v2/dropRunConfig";
import {
  applyDropRunSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "drop_run";
const PLAYER_HEADER = "drop-run-client";

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

function formatMultiplierLabel(m) {
  const x = Number(m);
  if (!Number.isFinite(x)) return "—";
  if (x < 1 && x > 0) return String(Math.round(x * 100) / 100).replace(/\.?0+$/, "");
  return String(x);
}

function DropRunGameplayPanel({
  session,
  uiState,
  pickingUi,
  resolvingUi,
  sessionNotice,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
  dropPlayback,
  onDropAnimationComplete,
}) {
  const dr = session?.dropRun;
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-1 text-center sm:px-2">
      <div className="flex min-h-0 flex-1 flex-col">
        <DropRunBoard
          sessionNotice={sessionNotice}
          readState={String(dr?.readState || "")}
          pickingUi={pickingUi}
          resolvingUi={resolvingUi}
          dropPlayback={dropPlayback}
          onDropAnimationComplete={onDropAnimationComplete}
        />
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        animationKey={`${popupLine2}-${popupLine3}-${resolvedIsWin ? "w" : "l"}-${resultVaultLabel}`}
        vaultSlot={
          resultPopupOpen ? (
            <SoloV2ResultPopupVaultLine isWin={resolvedIsWin} deltaLabel={resultVaultLabel} />
          ) : undefined
        }
      >
        <div className="text-[13px] font-black uppercase tracking-wide">
          {resolvedIsWin ? "YOU WIN" : "YOU LOSE"}
        </div>
        <div className="mt-1 text-sm font-bold text-white">
          <span className="text-amber-100">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function DropRunPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(DROP_RUN_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [pickingUi, setPickingUi] = useState(false);
  const [dropPlayback, setDropPlayback] = useState(null);
  const [inDropLoop, setInDropLoop] = useState(false);
  const inDropLoopRef = useRef(false);
  const wagerInputRef = useRef(wagerInput);
  const vaultBalanceRef = useRef(vaultBalance);
  const pendingTerminalRef = useRef(null);
  const animCompleteFiredRef = useRef(false);
  const dropAnimEpochRef = useRef(0);

  const cycleRef = useRef(0);
  const createInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const resolveInFlightRef = useRef(false);
  const sessionRef = useRef(null);
  const giftRoundRef = useRef(false);
  const giftRefreshRef = useRef(() => {});
  const lastPresetAmountRef = useRef(null);
  const resultPopupTimerRef = useRef(null);

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
    inDropLoopRef.current = inDropLoop;
  }, [inDropLoop]);

  useEffect(() => {
    wagerInputRef.current = wagerInput;
  }, [wagerInput]);

  useEffect(() => {
    vaultBalanceRef.current = vaultBalance;
  }, [vaultBalance]);

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
    applyDropRunSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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

  async function prepareNextDropRound() {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setResultPopupOpen(false);
    setResolvedResult(null);
    setDropPlayback(null);
    setSessionNotice("");
    setPickingUi(false);
    pendingTerminalRef.current = null;
    animCompleteFiredRef.current = false;

    if (!inDropLoopRef.current) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      return;
    }

    if (!vaultReady) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInDropLoop(false);
      setErrorMessage("Shared vault unavailable.");
      return;
    }

    const wager = parseWagerInput(wagerInputRef.current);
    if (wager < DROP_RUN_MIN_WAGER) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInDropLoop(false);
      setErrorMessage(`Minimum stake is ${DROP_RUN_MIN_WAGER}.`);
      return;
    }
    if (vaultBalanceRef.current < wager) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInDropLoop(false);
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this round.`);
      return;
    }

    cycleRef.current += 1;
    const activeCycle = cycleRef.current;
    const boot = await bootstrapSession(wager, activeCycle, SOLO_V2_SESSION_MODE.STANDARD, { isGiftRound: false });
    if (!boot.ok || boot.alreadyTerminal) {
      setInDropLoop(false);
      return;
    }
    const drBoot = boot.session?.dropRun;
    if (drBoot?.readState === "gate_submitted" && drBoot?.canResolveTurn) {
      void handleResolvePendingDrop(boot.session.id, activeCycle);
    }
  }

  function openResultPopup() {
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(true);
    resultPopupTimerRef.current = window.setTimeout(() => {
      resultPopupTimerRef.current = null;
      void prepareNextDropRound();
    }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
  }

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const drSnap = sessionPayload?.dropRun;
    const readState = String(drSnap?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && drSnap?.resolvedResult) {
      setInDropLoop(false);
      setResolvedResult({
        ...drSnap.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: drSnap.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Round finished (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "gate_conflict") {
      setInDropLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("State conflict — refresh and try again.");
      return;
    }

    if (readState === "gate_submitted") {
      setInDropLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Finishing your drop…" : "Resolving…");
      setErrorMessage("");
      return;
    }

    if (readState === "ready") {
      setInDropLoop(true);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setPickingUi(false);
      setDropPlayback(null);
      setSessionNotice(resumed ? "Session restored." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInDropLoop(false);
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        st === "expired" ? "Session expired. Press START DROP." : "Session ended. Press START DROP.",
      );
      return;
    }

    setInDropLoop(false);
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
    setDropPlayback(null);

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
    const response = await fetch("/api/solo-v2/drop-run/resolve", {
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

  function applyTerminalOutcomeToUi(r, sid, nextSession) {
    setPickingUi(false);
    setDropPlayback(null);
    if (nextSession) setSession(nextSession);
    setResolvedResult({
      ...r,
      sessionId: r.sessionId || sid,
      settlementSummary: r.settlementSummary,
    });
    setUiState(UI_STATE.RESOLVED);
    openResultPopup();
  }

  async function handleResolvePendingDrop(sessionId, activeCycle) {
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
        const nextSession = readResult?.ok && readResult.session ? readResult.session : null;
        animCompleteFiredRef.current = false;
        dropAnimEpochRef.current += 1;
        pendingTerminalRef.current = { r, sid: sessionId, nextSession };
        setDropPlayback({
          sessionId,
          animEpoch: dropAnimEpochRef.current,
          pathPositions: Array.isArray(r.pathPositions) ? r.pathPositions : [],
          finalBay: r.finalBay,
          selectedGate: r.selectedGate,
          isWin: Boolean(r.isWin ?? r.won),
        });
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

  function handleDropAnimationComplete() {
    if (animCompleteFiredRef.current) return;
    const p = pendingTerminalRef.current;
    if (!p?.r) return;
    animCompleteFiredRef.current = true;
    pendingTerminalRef.current = null;
    applyTerminalOutcomeToUi(p.r, p.sid, p.nextSession);
  }

  async function handlePlayDrop() {
    const sid = sessionRef.current?.id;
    const dr = sessionRef.current?.dropRun;
    if (sid == null || String(dr?.readState || "") !== "ready") return;
    if (submitInFlightRef.current || resolveInFlightRef.current || pickingUi || dropPlayback) return;

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
            action: "drop_run_play",
            gameKey: GAME_KEY,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        setPickingUi(false);
        await handleResolvePendingDrop(sid, activeCycle);
        return;
      }

      setPickingUi(false);
      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "gate_conflict" || st === "turn_pending")) {
        const rr = await readSessionTruth(sid, activeCycle);
        if (rr?.ok && rr.session) {
          setSession(rr.session);
          applySessionReadState(rr.session, { resumed: true });
        }
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Drop rejected — state refreshed."));
        setUiState(UI_STATE.SESSION_ACTIVE);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && st === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          setSession(null);
          setInDropLoop(false);
          setUiState(UI_STATE.IDLE);
          setErrorMessage(msg || "Session expired.");
          return;
        }
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Drop failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setPickingUi(false);
      setErrorMessage("Network error while starting drop.");
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function runStartDrop() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < DROP_RUN_MIN_WAGER) return;
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
    setInDropLoop(true);
    const drBoot = boot.session?.dropRun;
    if (drBoot?.readState === "gate_submitted" && drBoot?.canResolveTurn) {
      void handleResolvePendingDrop(boot.session.id, activeCycle);
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const drSnap = session?.dropRun;
    if (!sid || !drSnap || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!drSnap.canResolveTurn) return;
    if (drSnap.readState !== "gate_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePendingDrop(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.dropRun?.readState, session?.dropRun?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= DROP_RUN_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= DROP_RUN_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
    !inDropLoop &&
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(
      uiState,
    ) &&
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  const drSnap = session?.dropRun;
  const playing = drSnap?.playing;

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= DROP_RUN_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  let summaryWin = dropRunMaxPayout(Math.max(DROP_RUN_MIN_WAGER, numericWager));

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing?.entryAmount != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING)) {
    summaryWin = dropRunMaxPayout(Math.floor(Number(playing.entryAmount)));
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const finalBay = Number(resolvedResult?.finalBay);
  const bayOk = Number.isFinite(finalBay);
  const multResolved = resolvedResult?.resolvedMultiplier;
  const effMult = Number(multResolved ?? (bayOk ? dropRunMultiplierForBay(finalBay) : NaN));

  const popupLine2 = bayOk ? `Bottom box ${finalBay}` : "Round complete";
  const popupLine3 = bayOk
    ? Number.isFinite(effMult) && effMult > 0
      ? `Multiplier ×${formatMultiplierLabel(effMult)}`
      : "No payout on this box"
    : "";

  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}` : "";

  function handleGiftPlay() {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    giftRoundRef.current = true;
    void runStartDrop();
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

  const readState = String(drSnap?.readState || "");
  const dropRoundFoot =
    inDropLoop &&
    uiState !== UI_STATE.RESOLVED &&
    (readState === "ready" ||
      readState === "gate_submitted" ||
      Boolean(dropPlayback) ||
      uiState === UI_STATE.SUBMITTING_PICK ||
      uiState === UI_STATE.RESOLVING ||
      uiState === UI_STATE.LOADING);

  const primaryIsDropBall = dropRoundFoot;
  const canDropBall =
    inDropLoop &&
    readState === "ready" &&
    uiState === UI_STATE.SESSION_ACTIVE &&
    !dropPlayback &&
    !pickingUi;

  const dropBallBusy =
    primaryIsDropBall &&
    (pickingUi ||
      uiState === UI_STATE.SUBMITTING_PICK ||
      (uiState === UI_STATE.RESOLVING && !dropPlayback) ||
      uiState === UI_STATE.LOADING);

  const primaryActionLoading = primaryIsDropBall ? dropBallBusy : isPrimaryLoading;
  const primaryLoadingLabel =
    primaryIsDropBall && (pickingUi || uiState === UI_STATE.SUBMITTING_PICK || (uiState === UI_STATE.RESOLVING && !dropPlayback))
      ? "DROPPING…"
      : "STARTING…";

  return (
    <SoloV2GameShell
      title="Drop Run"
      subtitle="Drop through the field · Landing box sets payout"
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
            Max win{" "}
            <span className="font-semibold tabular-nums text-lime-200/90">{formatCompact(summaryWin)}</span>
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - DROP_RUN_MIN_WAGER)));
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
          setWagerInput(String(DROP_RUN_MIN_WAGER));
        },
        primaryActionLabel: primaryIsDropBall ? "DROP BALL" : "START DROP",
        primaryActionDisabled: primaryIsDropBall ? !canDropBall : !canStart,
        primaryActionLoading: primaryActionLoading,
        primaryLoadingLabel,
        onPrimaryAction: () => {
          if (primaryIsDropBall) void handlePlayDrop();
          else void runStartDrop();
        },
        errorMessage: errorMessage || stakeHint,
      }}
      gameplaySlot={
        <DropRunGameplayPanel
          session={session}
          uiState={uiState}
          pickingUi={pickingUi}
          resolvingUi={uiState === UI_STATE.RESOLVING}
          sessionNotice={sessionNotice}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
          dropPlayback={dropPlayback}
          onDropAnimationComplete={handleDropAnimationComplete}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            The ball releases from the center and falls through a server-sealed path across the peg field. It lands in
            one of nine bottom boxes — that box sets your multiplier on the current play. The two outer columns pay
            nothing; values rise toward the middle, with the highest multiplier on the center box (×4.75 on your play).
          </p>
          <p>
            Use START DROP for your first entry, then DROP BALL for each repeat round in the same session. Outcome is
            resolved on the server when the drop animation completes.
          </p>
        </div>
      }
      resultState={null}
    />
  );
}
