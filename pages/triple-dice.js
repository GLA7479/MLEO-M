import { useEffect, useRef, useState } from "react";
import TripleDiceBoard from "../components/solo-v2/TripleDiceBoard";
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
  TRIPLE_DICE_MIN_WAGER,
  normalizeTripleDiceTargetTotal,
  tripleDiceProjectedPayout,
  tripleDiceWinChancePercent,
} from "../lib/solo-v2/tripleDiceConfig";
import {
  applyTripleDiceSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "triple_dice";
const PLAYER_HEADER = "triple-dice-client";

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

const NEUTRAL_DICE = [2, 3, 4];

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function clampDie(n) {
  return Math.min(6, Math.max(1, Math.floor(Number(n)) || 1));
}

function TripleDiceGameplayPanel({
  targetTotal,
  onTargetChange,
  diceValues,
  diceMuted,
  totalDisplay,
  rollingUi,
  statusTop,
  statusSub,
  sessionNotice,
  onRoll,
  rollDisabled,
  targetPickerDisabled,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
}) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-1 text-center sm:px-2">
      <div className="flex min-h-0 flex-1 flex-col">
        <TripleDiceBoard
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          diceValues={diceValues}
          diceMuted={diceMuted}
          totalDisplay={totalDisplay}
          targetTotal={targetTotal}
          onTargetChange={onTargetChange}
          rolling={rollingUi}
          onRoll={onRoll}
          rollDisabled={rollDisabled}
          targetPickerDisabled={targetPickerDisabled}
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
          <span className="text-amber-100 tabular-nums">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function TripleDicePage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(TRIPLE_DICE_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [targetTotal, setTargetTotal] = useState(10);
  const [diceValues, setDiceValues] = useState(() => [...NEUTRAL_DICE]);
  const [rollingUi, setRollingUi] = useState(false);
  const [totalDisplay, setTotalDisplay] = useState("—");
  const [inTripleDiceLoop, setInTripleDiceLoop] = useState(false);
  const inTripleDiceLoopRef = useRef(false);
  const wagerInputRef = useRef(wagerInput);
  const vaultBalanceRef = useRef(vaultBalance);

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
    inTripleDiceLoopRef.current = inTripleDiceLoop;
  }, [inTripleDiceLoop]);

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
    applyTripleDiceSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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

  async function prepareNextTripleDiceRound() {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    if (rollAnimTimerRef.current) {
      clearInterval(rollAnimTimerRef.current);
      rollAnimTimerRef.current = null;
    }
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setResultPopupOpen(false);
    setResolvedResult(null);
    setSessionNotice("");
    setRollingUi(false);
    setTotalDisplay("—");
    setDiceValues([...NEUTRAL_DICE]);

    if (!inTripleDiceLoopRef.current) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      return;
    }

    if (!vaultReady) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInTripleDiceLoop(false);
      setErrorMessage("Shared vault unavailable.");
      return;
    }

    const wager = parseWagerInput(wagerInputRef.current);
    if (wager < TRIPLE_DICE_MIN_WAGER) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInTripleDiceLoop(false);
      setErrorMessage(`Minimum stake is ${TRIPLE_DICE_MIN_WAGER}.`);
      return;
    }
    if (vaultBalanceRef.current < wager) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInTripleDiceLoop(false);
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this round.`);
      return;
    }

    cycleRef.current += 1;
    const activeCycle = cycleRef.current;
    const boot = await bootstrapSession(wager, activeCycle, SOLO_V2_SESSION_MODE.STANDARD, { isGiftRound: false });
    if (!boot.ok || boot.alreadyTerminal) {
      setInTripleDiceLoop(false);
      return;
    }
    const tdBoot = boot.session?.tripleDice;
    if (tdBoot?.readState === "roll_submitted" && tdBoot?.canResolveTurn) {
      void handleResolvePendingRoll(boot.session.id, activeCycle, { animate: false });
    }
  }

  function openResultPopup() {
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(true);
    resultPopupTimerRef.current = window.setTimeout(() => {
      resultPopupTimerRef.current = null;
      void prepareNextTripleDiceRound();
    }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
  }

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const tdSnap = sessionPayload?.tripleDice;
    const readState = String(tdSnap?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && tdSnap?.resolvedResult) {
      setInTripleDiceLoop(false);
      setResolvedResult({
        ...tdSnap.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: tdSnap.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Round finished (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "roll_conflict") {
      setInTripleDiceLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting roll — refresh and try again.");
      return;
    }

    if (readState === "roll_submitted") {
      setInTripleDiceLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Finishing your roll…" : "Resolving roll…");
      setErrorMessage("");
      return;
    }

    if (readState === "ready") {
      setInTripleDiceLoop(true);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setDiceValues([...NEUTRAL_DICE]);
      setRollingUi(false);
      setTotalDisplay("—");
      setSessionNotice(resumed ? "Session restored — adjust target and roll." : "Set your target, then tap Roll.");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInTripleDiceLoop(false);
      setSession(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        st === "expired" ? "Session expired. Press START TRIPLE DICE." : "Session ended. Press START TRIPLE DICE.",
      );
      return;
    }

    setInTripleDiceLoop(false);
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
    setDiceValues([...NEUTRAL_DICE]);
    setTotalDisplay("—");

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
    const response = await fetch("/api/solo-v2/triple-dice/resolve", {
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
    const dice = Array.isArray(r.dice) && r.dice.length === 3 ? r.dice.map(clampDie) : [1, 1, 1];
    const tot = Math.floor(Number(r.rolledTotal));
    const tgt = Math.floor(Number(r.targetTotal));
    const won = Boolean(r.won ?? r.isWin ?? r.terminalKind === "full_clear");

    const finalize = () => {
      setDiceValues(dice);
      setRollingUi(false);
      setTotalDisplay(Number.isFinite(tot) ? String(tot) : "—");
      setResolvedResult({
        ...r,
        sessionId: r.sessionId || sid,
        settlementSummary: r.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      openResultPopup();
    };

    if (!animate) {
      finalize();
      return;
    }

    setRollingUi(true);
    if (rollAnimTimerRef.current) clearInterval(rollAnimTimerRef.current);
    let count = 0;
    rollAnimTimerRef.current = setInterval(() => {
      count += 1;
      setDiceValues([
        clampDie(Math.floor(Math.random() * 6) + 1),
        clampDie(Math.floor(Math.random() * 6) + 1),
        clampDie(Math.floor(Math.random() * 6) + 1),
      ]);
      setTotalDisplay("…");
      if (count >= 15) {
        if (rollAnimTimerRef.current) {
          clearInterval(rollAnimTimerRef.current);
          rollAnimTimerRef.current = null;
        }
        finalize();
      }
    }, 52);
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
    const td = sessionRef.current?.tripleDice;
    if (sid == null || String(td?.readState || "") !== "ready") return;
    if (submitInFlightRef.current || resolveInFlightRef.current || rollingUi) return;

    const target = normalizeTripleDiceTargetTotal(targetTotal);
    if (target === null) return;

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_PICK);
    setErrorMessage("");
    setRollingUi(true);
    setTotalDisplay("…");
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
            action: "triple_dice_roll",
            gameKey: GAME_KEY,
            targetTotal: target,
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
      setTotalDisplay("—");
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
          setInTripleDiceLoop(false);
          setUiState(UI_STATE.IDLE);
          setErrorMessage(msg || "Session expired.");
          return;
        }
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Roll failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setRollingUi(false);
      setTotalDisplay("—");
      setErrorMessage("Network error while rolling.");
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function runStartTripleDice() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < TRIPLE_DICE_MIN_WAGER) return;
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
    setInTripleDiceLoop(true);
    const tdBoot = boot.session?.tripleDice;
    if (tdBoot?.readState === "roll_submitted" && tdBoot?.canResolveTurn) {
      void handleResolvePendingRoll(boot.session.id, activeCycle, { animate: false });
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const tdSnap = session?.tripleDice;
    if (!sid || !tdSnap || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!tdSnap.canResolveTurn) return;
    if (tdSnap.readState !== "roll_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePendingRoll(sid, cycleRef.current, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.tripleDice?.readState, session?.tripleDice?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= TRIPLE_DICE_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= TRIPLE_DICE_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
    !inTripleDiceLoop &&
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(
      uiState,
    ) &&
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  const tdSnap = session?.tripleDice;
  const playing = tdSnap?.playing;

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= TRIPLE_DICE_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  const normTarget = normalizeTripleDiceTargetTotal(targetTotal) ?? 10;
  let summaryWin = tripleDiceProjectedPayout(Math.max(TRIPLE_DICE_MIN_WAGER, numericWager), normTarget);

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing?.entryAmount != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING)) {
    summaryWin = tripleDiceProjectedPayout(Math.floor(Number(playing.entryAmount)), normTarget);
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const rt = Number(resolvedResult?.rolledTotal);
  const tt = Number(resolvedResult?.targetTotal);
  const rOk = Number.isFinite(rt);
  const tOk = Number.isFinite(tt);
  const popupLine2 = rOk ? `Total ${rt}` : "—";
  const popupLine3 =
    rOk && tOk
      ? resolvedIsWin
        ? `You matched ${tt}.`
        : `Target was ${tt}.`
      : resolvedIsWin
        ? "EXACT MATCH"
        : "NO MATCH";

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
    void runStartTripleDice();
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

  const readState = String(tdSnap?.readState || "");
  const rollDisabled =
    busyFooter || uiState !== UI_STATE.SESSION_ACTIVE || readState !== "ready" || rollingUi;

  const targetPickerDisabled =
    rollingUi || busyFooter || uiState !== UI_STATE.SESSION_ACTIVE || readState !== "ready";

  const winChance = tripleDiceWinChancePercent(normTarget);

  let statusTop = "Choose a target total from 3 to 18.";
  let statusSub = "Press START TRIPLE DICE when ready.";
  if (inTripleDiceLoop && uiState === UI_STATE.SESSION_ACTIVE && readState === "ready" && !rollingUi) {
    statusTop = "Set your target, then tap Roll.";
    statusSub = `Target ${normTarget} · ${winChance.toFixed(2)}% chance`;
  }
  if (rollingUi) {
    statusTop = "Rolling…";
    statusSub = "\u00a0";
  }
  if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    const t = Math.floor(Number(resolvedResult.rolledTotal));
    const g = Math.floor(Number(resolvedResult.targetTotal));
    if (Number.isFinite(t) && Number.isFinite(g)) {
      statusTop = resolvedIsWin ? `Total ${t}. You matched ${g}.` : `Total ${t}. Target was ${g}.`;
      statusSub = "\u00a0";
    }
  }

  const diceMuted = !inTripleDiceLoop && idleLike;

  return (
    <SoloV2GameShell
      title="Triple Dice"
      subtitle="Pick a total. Roll all three dice."
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - TRIPLE_DICE_MIN_WAGER)));
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
          setWagerInput(String(TRIPLE_DICE_MIN_WAGER));
        },
        primaryActionLabel: "START TRIPLE DICE",
        primaryActionDisabled: !canStart,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => {
          void runStartTripleDice();
        },
        errorMessage: errorMessage || stakeHint,
      }}
      gameplaySlot={
        <TripleDiceGameplayPanel
          targetTotal={targetTotal}
          onTargetChange={setTargetTotal}
          diceValues={diceValues}
          diceMuted={diceMuted}
          totalDisplay={totalDisplay}
          rollingUi={rollingUi}
          statusTop={statusTop}
          statusSub={statusSub}
          sessionNotice={sessionNotice}
          onRoll={handleRoll}
          rollDisabled={rollDisabled}
          targetPickerDisabled={targetPickerDisabled}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Choose a total from 3 to 18. Your stake is locked when you press START TRIPLE DICE. Win chance and
            projected win update with the target.
          </p>
          <p>
            Tap Roll: the server rolls three dice. If the sum exactly matches your target, you win the shown payout;
            otherwise the round is a loss.
          </p>
        </div>
      }
      resultState={null}
    />
  );
}
