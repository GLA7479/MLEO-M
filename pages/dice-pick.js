import { useCallback, useEffect, useRef, useState } from "react";
import DicePickBoard from "../components/solo-v2/DicePickBoard";
import DicePickDisplay from "../components/solo-v2/DicePickDisplay";
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
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import {
  DICE_PICK_MIN_WAGER,
  DICE_PICK_WIN_MULTIPLIER,
} from "../lib/solo-v2/dicePickConfig";
import {
  applyDicePickSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

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

/** Dev-only session tracing. Prod: localStorage solo_v2_dice_pick_debug=1 */
function dicePickDebug(label, data) {
  const allowProd =
    typeof window !== "undefined" && window.localStorage?.getItem("solo_v2_dice_pick_debug") === "1";
  if (process.env.NODE_ENV !== "development" && !allowProd) return;
  console.warn(`[DicePick] ${label}`, data);
}

const STATS_KEY = "solo_v2_dice_pick_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;
const REVEAL_READABLE_MS = 520;

/** Parsed numeric wager from the amount field (0 if empty/invalid). No minimum — playability is gated separately. */
function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function readDicePickStats() {
  if (typeof window === "undefined") {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
      lowWins: 0,
      highWins: 0,
    };
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
      lowWins: Number(parsed.lowWins || 0),
      highWins: Number(parsed.highWins || 0),
    };
  } catch {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
      lowWins: 0,
      highWins: 0,
    };
  }
}

function writeDicePickStats(nextStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
  } catch {
    // ignore storage errors
  }
}

/**
 * LOW / HIGH — mirrors Quick Flip FlipChoiceTile rhythm (primary glyph scale + caption row).
 * Keeps sky/orange selected faces as dice-zone identity (vs emerald/violet on coin).
 */
function DiceZoneTile({ glyph, label, sub, value, selectedZone, disabled, onSelect }) {
  const isSelected = selectedZone === value;
  const isLow = value === "low";
  const shell =
    "group relative flex h-full min-h-[5.25rem] w-full flex-col items-center justify-center rounded-2xl border-2 text-center shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 sm:min-h-[6.1rem] sm:rounded-[1.05rem] lg:min-h-[7.35rem] lg:rounded-[1.12rem]";

  let face =
    "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ";
  if (isSelected && isLow) {
    face =
      "border-sky-400/65 bg-gradient-to-b from-sky-900/45 to-zinc-950 text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(56,189,248,0.15)] ring-2 ring-inset ring-sky-400/20 ";
  } else if (isSelected && !isLow) {
    face =
      "border-orange-400/65 bg-gradient-to-b from-orange-900/45 to-zinc-950 text-orange-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(251,146,60,0.15)] ring-2 ring-inset ring-orange-400/20 ";
  } else {
    face +=
      "enabled:hover:border-amber-500/55 enabled:hover:from-zinc-800 enabled:hover:to-zinc-950 enabled:active:scale-[0.98] ";
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className={`${shell} ${face}${
        disabled ? "cursor-not-allowed opacity-[0.42] " : ""
      }focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/35`}
    >
      <span
        className={`mt-0.5 select-none text-[2rem] font-black leading-none tabular-nums sm:text-[2.35rem] lg:text-[2.85rem] ${
          isSelected ? "" : "text-amber-100/95"
        }`}
        aria-hidden
      >
        {glyph}
      </span>
      <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] lg:text-[11px]">
        {label}
        {sub ? ` · ${sub}` : ""}
      </span>
    </button>
  );
}

function dicePickRoundStripModel(uiState) {
  const stepTotal = 2;
  if (uiState === UI_STATE.RESOLVED) {
    return { stepTotal, stepsComplete: 2, currentStepIndex: 1 };
  }
  if (
    uiState === UI_STATE.SUBMITTING_CHOICE ||
    uiState === UI_STATE.CHOICE_SUBMITTED ||
    uiState === UI_STATE.RESOLVING
  ) {
    return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  }
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

function DicePickGameplayPanel({
  uiState,
  selectedZone,
  isRolling,
  onSelectZone,
  resolvedRoll,
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
}) {
  const isChoiceLocked = uiState === UI_STATE.CHOICE_SUBMITTED;
  const canChoose = !isRolling && uiState !== UI_STATE.LOADING && !isChoiceLocked;

  const dicePhase = isRolling ? "rolling" : resolvedRoll != null ? "resolved" : "idle";

  return (
    <div className="solo-v2-route-stack relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-4 lg:pt-1">
      <DicePickBoard
        progressStripKeyPrefix="dice-pick"
        sessionNotice={sessionNotice}
        statusTop=""
        statusSub=""
        hideBoardStatusStack
        stepTotal={stepTotal}
        currentStepIndex={currentStepIndex}
        stepsComplete={stepsComplete}
        stepLabels={["Choose", "Roll"]}
        payoutBandLabel={payoutBandLabel}
        payoutBandValue={payoutBandValue}
        payoutCaption={payoutCaption}
        hideMobilePayoutBand
        diceSlot={<DicePickDisplay phase={dicePhase} resolvedRoll={resolvedRoll} hideSubcaption />}
        choiceSlot={
          <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 lg:gap-6" role="group" aria-label="Pick zone">
            <DiceZoneTile
              glyph="L"
              label="LOW"
              sub="1–3"
              value="low"
              selectedZone={selectedZone}
              disabled={!canChoose}
              onSelect={onSelectZone}
            />
            <DiceZoneTile
              glyph="H"
              label="HIGH"
              sub="4–6"
              value="high"
              selectedZone={selectedZone}
              disabled={!canChoose}
              onSelect={onSelectZone}
            />
          </div>
        }
      />

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
        <div className="text-[13px] font-black uppercase tracking-wide">{popupTitle}</div>
        <div className="mt-1 text-sm font-bold text-white">
          <span className="text-amber-100 tabular-nums">{popupLine2}</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">{popupLine3}</div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function DicePickPage() {
  const giftShell = useSoloV2GiftShellState();
  const giftRefreshRef = useRef(() => {});
  const giftRoundRef = useRef(false);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [session, setSession] = useState(null);
  const [selectedZone, setSelectedZone] = useState("");
  const [eventInfo, setEventInfo] = useState(null);
  const [resolvedResult, setResolvedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(DICE_PICK_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readDicePickStats);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const resultPopupTimerRef = useRef(null);
  /** True only after a fresh client resolve — avoids auto-opening the terminal popup on resumed resolved sessions. */
  const terminalPopupEligibleRef = useRef(false);
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
    writeDicePickStats(stats);
  }, [stats]);

  useEffect(() => {
    return () => {
      if (resultPopupTimerRef.current) {
        clearTimeout(resultPopupTimerRef.current);
      }
    };
  }, []);

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

  /** Hard reset when vault settlement fails or stale recovery — not used on normal popup dismiss. */
  function resetRoundAfterResultPopup() {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setEventInfo(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
  }

  /** Clears stale session/round state but keeps wager input so the user can roll again. */
  function recoverStaleRound(message) {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setSelectedZone("");
    setEventInfo(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
    setErrorMessage(
      String(message || "").trim() ||
        "This round is no longer valid. Choose LOW or HIGH and press ROLL DICE.",
    );
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const sessionId = resolvedResult?.sessionId || session?.id;
    const settlementSummary = resolvedResult?.settlementSummary;
    if (!sessionId || !settlementSummary) return;
    applyDicePickSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Number(settlementResult.nextBalance || 0);
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = setTimeout(() => {
          resetRoundAfterResultPopup();
        }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
        return;
      }

      const delta = Number(settlementSummary.netDelta || 0);
      const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
      if (settlementResult.applied) {
        setSessionNotice(`Settled (${deltaLabel}). Vault: ${authoritativeBalance}.`);
        setStats(prev => {
          const entryCost = Number(settlementSummary.entryCost || QUICK_FLIP_CONFIG.entryCost);
          const payoutReturn = Number(settlementSummary.payoutReturn || 0);
          return {
            ...prev,
            totalGames: Number(prev.totalGames || 0) + 1,
            wins: Number(prev.wins || 0) + (resolvedResult?.isWin ? 1 : 0),
            losses: Number(prev.losses || 0) + (resolvedResult?.isWin ? 0 : 1),
            totalPlay:
              Number(prev.totalPlay || 0) + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
            totalWon: Number(prev.totalWon || 0) + payoutReturn,
            biggestWin: Math.max(Number(prev.biggestWin || 0), resolvedResult?.isWin ? payoutReturn : 0),
            lowWins:
              Number(prev.lowWins || 0) +
              (resolvedResult?.isWin && String(resolvedResult?.zone || "") === "low" ? 1 : 0),
            highWins:
              Number(prev.highWins || 0) +
              (resolvedResult?.isWin && String(resolvedResult?.zone || "") === "high" ? 1 : 0),
          };
        });
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
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id, uiState, openResultPopup]);

  function hydrateResolvedFromSession(sessionPayload) {
    const fromDice = sessionPayload?.dicePick?.resolvedResult;
    const summary =
      fromDice && typeof fromDice === "object"
        ? fromDice
        : sessionPayload?.serverOutcomeSummary && sessionPayload?.sessionStatus === "resolved"
          ? sessionPayload.serverOutcomeSummary
          : {};
    if (sessionPayload?.sessionStatus !== "resolved") return null;
    return {
      sessionId: sessionPayload?.id || null,
      sessionStatus: sessionPayload?.sessionStatus || "resolved",
      zone: summary.zone || null,
      roll: Number.isFinite(Number(summary.roll)) ? Number(summary.roll) : null,
      isWin: Boolean(summary.isWin),
      resolvedAt: summary.resolvedAt || sessionPayload?.resolvedAt || null,
      settlementSummary: summary.settlementSummary || null,
    };
  }

  function applySessionReadState(sessionPayload, options = {}) {
    const { resumed = false, localChoiceToKeep = null } = options;
    setSession(sessionPayload);

    const readState = String(sessionPayload?.readState || "");
    const diceZone = sessionPayload?.dicePick?.zone || null;
    const diceSubmitEventId = sessionPayload?.dicePick?.submitEventId || null;
    const resolved = hydrateResolvedFromSession(sessionPayload);

    if (readState === "resolved" || resolved) {
      if (resolved) setResolvedResult(resolved);
      setEventInfo(null);
      setSelectedZone("");
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Resumed already resolved session." : "Session already resolved on server.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_submitted") {
      setSelectedZone(diceZone || "");
      setEventInfo({
        eventId: diceSubmitEventId,
        eventType: "client_action",
      });
      setUiState(UI_STATE.CHOICE_SUBMITTED);
      setSessionNotice("Resumed session with locked zone. Ready to resolve.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      if (localChoiceToKeep === "low" || localChoiceToKeep === "high") {
        setSelectedZone(localChoiceToKeep);
      } else {
        setSelectedZone("");
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
      setSession(null);
      setSelectedZone("");
      setEventInfo(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        sessionPayload?.sessionStatus === "expired"
          ? "Session expired. Choose LOW or HIGH and press ROLL DICE."
          : "Session ended. Choose LOW or HIGH and press ROLL DICE.",
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
        "x-solo-v2-player": "dice-pick-client",
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

  /**
   * Create or resume a server session (authoritative). Preserves local pre-selected side via localChoiceToKeep on resume.
   * Gift rounds: sessionMode freeplay, stake SOLO_V2_GIFT_ROUND_STAKE; consume one gift only after status "created".
   * @returns {{ ok: true, session: object } | { ok: false }}
   */
  async function bootstrapDicePickSession(wager, activeCycle, localChoiceToKeep, createSessionMode, giftRoundMeta) {
    const isGiftRound = Boolean(giftRoundMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    setSession(null);
    setEventInfo(null);
    setResolvedResult(null);

    try {
      const response = await fetch("/api/solo-v2/sessions/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": "dice-pick-client",
        },
        body: JSON.stringify({
          gameKey: "dice_pick",
          sessionMode: createSessionMode,
          entryAmount: wager,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      const result = classifySoloV2ApiResult(response, payload);
      const status = String(payload?.status || "");

      dicePickDebug("fetch_done", {
        httpStatus: response.status,
        classify: result,
        apiStatus: status,
        sessionId: payload?.session?.id ?? null,
        rawPayload: payload,
      });

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "created" && payload?.session) {
        if (isGiftRound) {
          if (!soloV2GiftConsumeOne()) {
            setSession(null);
            setUiState(UI_STATE.IDLE);
            setErrorMessage("No gift available. Try again after the next recharge.");
            return { ok: false };
          }
          giftRoundMeta?.onGiftConsumed?.();
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => giftRoundMeta?.onGiftConsumed?.());
          }
        }
        setSession(payload.session);
        setSessionNotice("");
        setErrorMessage("");
        setUiState(UI_STATE.SESSION_CREATED);
        dicePickDebug("branch_created", { sessionId: payload.session?.id });
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
        dicePickDebug("readSessionTruth_result", {
          halted: Boolean(readResult?.halted),
          ok: readResult?.ok,
          readState: readResult?.session?.readState,
        });
        if (readResult?.halted) return { ok: false };
        if (!readResult?.ok) {
          setSession(null);
          setSelectedZone("");
          setEventInfo(null);
          setResolvedResult(null);
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }

        applySessionReadState(readResult.session, { resumed: true, localChoiceToKeep });
        dicePickDebug("after_applySessionReadState", { readState: String(readResult.session?.readState || "") });
        const rs = String(readResult.session?.readState || "");
        const st = String(readResult.session?.sessionStatus || "");
        if (rs === "invalid" || st === "expired" || st === "cancelled") {
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

  async function submitZoneAndResolveFlow(sessionId, zone, activeCycle) {
    if (!sessionId || (zone !== "low" && zone !== "high")) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_CHOICE);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": "dice-pick-client",
        },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: {
            gameKey: "dice_pick",
            action: "dice_pick_submit",
            zone,
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
          setSessionNotice("Zone already locked. Resolving...");
        } else {
          setSessionNotice("Rolling...");
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
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Zone submission unavailable."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "choice_already_submitted") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (!readResult?.ok) {
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return;
        }
        applySessionReadState(readResult.session, { resumed: true });
        if (String(readResult?.readStatus || "") === "choice_submitted") {
          setSessionNotice("A zone is already locked on server. Resolving.");
          await handleResolveSession({ sessionIdOverride: readResult.session.id });
        }
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "invalid_session_state") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (readResult?.ok) {
          applySessionReadState(readResult.session, { resumed: true });
          if (String(readResult?.readStatus || "") === "choice_submitted") {
            setSessionNotice("Session already has a locked zone. Resolving now.");
            await handleResolveSession({ sessionIdOverride: readResult.session.id });
          }
          return;
        }
        recoverStaleRound(buildSoloV2ApiErrorMessage(payload, "Session no longer accepts zone submit."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          recoverStaleRound(msg || "Session expired. Choose LOW or HIGH and press ROLL DICE.");
          return;
        }
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Zone submission rejected."));
        return;
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Zone submission rejected."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error while submitting zone.");
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
    const zone = selectedZone;
    if (zone !== "low" && zone !== "high") {
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }

    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < DICE_PICK_MIN_WAGER) return;
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
        const boot = await bootstrapDicePickSession(wager, activeCycle, zone, createSessionMode, {
          isGiftRound,
          onGiftConsumed: () => giftRefreshRef.current?.(),
        });
        if (!boot.ok || activeCycle !== cycleRef.current) return;
        if (isGiftRound && typeof window !== "undefined" && window.requestAnimationFrame) {
          giftRefreshRef.current?.();
          window.requestAnimationFrame(() => giftRefreshRef.current?.());
        }
        if (boot.alreadyTerminal) return;
        sessionId = boot.session?.id;
        readStateKnown = String(boot.session?.readState || "");
      }

      if (!sessionId || activeCycle !== cycleRef.current) return;

      if (readStateKnown === "choice_submitted") {
        await handleResolveSession({ sessionIdOverride: sessionId });
        return;
      }

      await submitZoneAndResolveFlow(sessionId, zone, activeCycle);
    } finally {
      if (isGiftRound) {
        giftRoundRef.current = false;
      }
    }
  }

  function handleSelectZone(zone) {
    if (
      uiState === UI_STATE.LOADING ||
      uiState === UI_STATE.SUBMITTING_CHOICE ||
      uiState === UI_STATE.CHOICE_SUBMITTED ||
      uiState === UI_STATE.RESOLVING
    ) {
      return;
    }
    setSelectedZone(zone);
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
      const response = await fetch("/api/solo-v2/dice-pick/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": "dice-pick-client",
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
        terminalPopupEligibleRef.current = true;
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
  const hasValidZone = selectedZone === "low" || selectedZone === "high";
  const wagerPlayable =
    vaultReady && numericWager >= DICE_PICK_MIN_WAGER && vaultBalance >= numericWager;

  const inActiveRunUi = [
    UI_STATE.SESSION_CREATED,
    UI_STATE.CHOICE_SELECTED,
    UI_STATE.CHOICE_SUBMITTED,
    UI_STATE.SUBMITTING_CHOICE,
    UI_STATE.RESOLVING,
    UI_STATE.LOADING,
  ].includes(uiState);

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= DICE_PICK_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  const sessionLocksSummary = runEntryFromSession != null && inActiveRunUi;

  const potentialWin = Math.floor(numericWager * DICE_PICK_WIN_MULTIPLIER);
  const summaryPlay = sessionLocksSummary ? runEntryFromSession : numericWager;
  const summaryWin = sessionLocksSummary
    ? Math.floor(Number(summaryPlay) * DICE_PICK_WIN_MULTIPLIER)
    : potentialWin;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= DICE_PICK_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to play.`
    : "";

  const isFlipping = uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;
  const strip = dicePickRoundStripModel(uiState);

  let payoutBandLabel = "Payout if win";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `×${DICE_PICK_WIN_MULTIPLIER} multiplier · play ${formatCompact(summaryPlay)}`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary?.payoutReturn ?? 0)));
    payoutBandLabel = resolvedResult.isWin ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    const rz = String(resolvedResult.zone || "").toLowerCase();
    const pickLabel = rz === "low" ? "LOW" : rz === "high" ? "HIGH" : "—";
    const rNum = Number.isFinite(Number(resolvedResult.roll)) ? Number(resolvedResult.roll) : "—";
    payoutCaption = `Die ${rNum} · pick ${pickLabel}`;
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const deltaVault = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${deltaVault > 0 ? "+" : ""}${formatCompact(deltaVault)}` : "";

  let popupTitle = "—";
  let popupLine2 = "—";
  let popupLine3 = "—";
  if (resolvedResult) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary?.payoutReturn ?? 0)));
    const rz = String(resolvedResult.zone || "").toLowerCase();
    const pickLabel = rz === "low" ? "LOW" : rz === "high" ? "HIGH" : "—";
    const rNum = Number.isFinite(Number(resolvedResult.roll)) ? Number(resolvedResult.roll) : "—";
    popupTitle = resolvedIsWin ? "YOU WIN" : "YOU LOSE";
    popupLine2 = `Return ${formatCompact(pr)}`;
    popupLine3 = `Pick ${pickLabel} · rolled ${rNum}`;
  }

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (
        /Session expired\. Press START ROUND|Session ended\. Press START ROUND|no longer valid\. Press START ROUND|Session expired\. Choose LOW or HIGH and press ROLL DICE|Session ended\. Choose LOW or HIGH and press ROLL DICE|no longer valid\. Choose LOW or HIGH and press ROLL DICE/i.test(
          s,
        )
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const canRollDice =
    wagerPlayable &&
    hasValidZone &&
    ![
      UI_STATE.LOADING,
      UI_STATE.SUBMITTING_CHOICE,
      UI_STATE.CHOICE_SUBMITTED,
      UI_STATE.RESOLVING,
      UI_STATE.PENDING_MIGRATION,
    ].includes(uiState);

  const busyFooter =
    uiState === UI_STATE.LOADING ||
    uiState === UI_STATE.SUBMITTING_CHOICE ||
    uiState === UI_STATE.CHOICE_SUBMITTED ||
    uiState === UI_STATE.RESOLVING;

  const isPrimaryLoading =
    uiState === UI_STATE.LOADING || uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;

  const primaryActionLabel = hasValidZone ? "ROLL DICE" : "Choose LOW or HIGH";

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
    if (canRollDice) {
      void runOneClickRound();
    }
  }

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (!hasValidZone) {
      setErrorMessage("Choose LOW or HIGH to play a gift round.");
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
  }, [vaultReady, hasValidZone, giftShell.giftCount, uiState]);

  return (
    <SoloV2GameShell
      title="Dice Pick"
      subtitle="Fair zone, one roll."
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
        canEditPlay: !busyFooter,
        compactAmountDisplayWhenBlurred: true,
        formatPresetLabel: v => formatCompact(v),
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            const next = Math.min(MAX_WAGER, Math.max(0, c - DICE_PICK_MIN_WAGER));
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
          setWagerInput(String(DICE_PICK_MIN_WAGER));
        },
        primaryActionLabel,
        primaryActionDisabled: !canRollDice,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "ROLLING...",
        onPrimaryAction: handlePrimaryCta,
        errorMessage: errorMessage || stakeHint,
        desktopPayout: {
          label: payoutBandLabel,
          value: payoutBandValue,
        },
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <DicePickGameplayPanel
          uiState={uiState}
          selectedZone={selectedZone}
          isRolling={isFlipping}
          onSelectZone={handleSelectZone}
          resolvedRoll={
            uiState === UI_STATE.RESOLVED && Number.isFinite(Number(resolvedResult?.roll))
              ? Number(resolvedResult.roll)
              : null
          }
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
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Dice Pick is a single d6 round: choose LOW (1–3) or HIGH (4–6), set your play amount, then press ROLL DICE.
            The server resolves the outcome before the die animation finishes, then your shared vault is updated from that
            result.
          </p>
          <p>
            A winning zone pays ×{DICE_PICK_WIN_MULTIPLIER} on your stake for this release (96% RTP design). Gift rounds
            use freeplay mode: a loss does not debit your vault; a win credits the full payout.
          </p>
          <p>
            After a round ends, the board stays on the final face until you start again — adjust zone or stake and press
            ROLL DICE explicitly; there is no auto-start.
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
          <p>LOW wins: {stats.lowWins}</p>
          <p>HIGH wins: {stats.highWins}</p>
        </div>
      }
      resultState={null}
    />
  );
}
