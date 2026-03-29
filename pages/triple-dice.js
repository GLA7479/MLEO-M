import { useCallback, useEffect, useRef, useState } from "react";
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
  normalizeTripleDiceZone,
  tripleDiceFormatFaces,
  tripleDiceProjectedPayout,
  tripleDiceWinChancePercent,
} from "../lib/solo-v2/tripleDiceConfig";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
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

const STATS_KEY = "solo_v2_triple_dice_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;
const REVEAL_READABLE_MS = 520;

const NEUTRAL_DICE = [2, 3, 4];

function buildOutcomeStatusLines(rolledTotal, dice, selectedZoneNorm, resolvedIsWin, showNextRoundHint) {
  const t = Math.floor(Number(rolledTotal));
  const d = Array.isArray(dice) ? dice : [];
  const pz = normalizeTripleDiceZone(selectedZoneNorm);
  const pickUp = pz ? pz.toUpperCase() : "—";
  if (!Number.isFinite(t) || d.length !== 3) {
    return { statusTop: "Round finished.", statusSub: "\u00a0" };
  }
  let statusTop = "";
  if (resolvedIsWin) {
    if (pz === "triple") {
      const face = Math.floor(Number(d[0]));
      statusTop = Number.isFinite(face) ? `Triple ${face}s. TRIPLE wins.` : "TRIPLE wins.";
    } else {
      statusTop = `Total ${t}. ${pickUp} wins.`;
    }
  } else {
    statusTop = `Total ${t}. Your pick was ${pickUp}.`;
  }
  const statusSub =
    showNextRoundHint && pz ? `Played ${pickUp} · tap Roll for next round` : "\u00a0";
  return { statusTop, statusSub };
}

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

function readTripleDiceStats() {
  if (typeof window === "undefined") {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
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
    };
  } catch {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalPlay: 0,
      totalWon: 0,
      biggestWin: 0,
    };
  }
}

function writeTripleDiceStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function tripleDiceStripModel(uiState, readState, rollingUi) {
  const stepTotal = 2;
  const rs = String(readState || "");
  if (uiState === UI_STATE.RESOLVED) {
    return { stepTotal, stepsComplete: 2, currentStepIndex: 1 };
  }
  if (
    rollingUi ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    (uiState === UI_STATE.SESSION_ACTIVE && rs === "roll_submitted")
  ) {
    return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  }
  if (uiState === UI_STATE.SESSION_ACTIVE && rs === "ready") {
    return { stepTotal, stepsComplete: 1, currentStepIndex: 1 };
  }
  if (uiState === UI_STATE.LOADING) {
    return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
  }
  return { stepTotal, stepsComplete: 0, currentStepIndex: 0 };
}

function TripleDiceGameplayPanel({
  selectedZone,
  onZoneChange,
  diceValues,
  diceMuted,
  totalDisplay,
  rollingUi,
  statusTop,
  statusSub,
  sessionNotice,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  stepLabels,
  payoutBandLabel,
  payoutBandValue,
  payoutCaption,
  onRoll,
  rollDisabled,
  optionPickerDisabled,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
}) {
  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || 2));
  const stripCleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1 lg:px-5 lg:pt-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-700/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex h-4 shrink-0 items-center justify-center px-2 sm:h-[1.125rem] lg:px-8">
          <p
            className={`line-clamp-1 w-full text-center text-[9px] font-semibold leading-tight text-violet-200/85 sm:text-[10px] ${
              showSession ? "opacity-100" : "opacity-0"
            }`}
          >
            {showSession ? sessionNotice : "\u00a0"}
          </p>
        </div>

        <div className="shrink-0 px-2.5 pb-0.5 pt-0 sm:px-3 sm:pb-1 lg:px-8">
          <div className="mb-0 flex items-center justify-between px-0.5 sm:mb-0.5">
            <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-violet-200/40 sm:text-[9px]">Round</span>
            <span className="text-[8px] font-semibold tabular-nums text-zinc-500 sm:text-[9px]">
              {Math.min(stripCleared + 1, total)} / {total}
            </span>
          </div>
          <div
            className="flex items-stretch justify-center gap-px rounded-lg border border-zinc-700/60 bg-zinc-950/80 p-px shadow-inner sm:gap-0.5 sm:rounded-xl sm:p-0.5"
            aria-label="Round progress"
          >
            {Array.from({ length: total }, (_, i) => {
              const done = i < stripCleared;
              const active = i === cur && !done;
              const label = stepLabels[i] ?? String(i + 1);
              return (
                <div
                  key={`td3-step-${i}`}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[5px] py-1 sm:rounded-md sm:py-1.5 ${
                    done
                      ? "bg-emerald-600/35 text-emerald-100"
                      : active
                        ? "bg-violet-500/25 text-violet-100 ring-1 ring-inset ring-violet-400/35"
                        : "bg-zinc-900/90 text-zinc-500"
                  }`}
                >
                  <span className="px-0.5 text-center text-[9px] font-extrabold uppercase tracking-wide sm:text-[10px]">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-2.5 pb-1 pt-0.5 sm:px-3 sm:pb-1.5 sm:pt-1 lg:px-8">
          <div className="flex flex-col items-center gap-0.5 rounded-xl border border-zinc-700/55 bg-zinc-950/70 px-2 py-1.5 sm:flex-row sm:items-baseline sm:justify-center sm:gap-2 sm:px-3 sm:py-2">
            <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-zinc-500 sm:text-[9px]">{payoutBandLabel}</span>
            <span className="text-sm font-black tabular-nums text-amber-100 sm:text-base">{payoutBandValue}</span>
          </div>
          <p
            className={`mt-1 line-clamp-2 min-h-[2.25rem] text-center text-[9px] font-semibold leading-snug text-zinc-400 sm:min-h-[2.5rem] sm:text-[10px] ${
              payoutCaption ? "opacity-100" : "opacity-0"
            }`}
          >
            {payoutCaption || "\u00a0"}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-1 pb-1 pt-0 sm:px-2 lg:px-4 lg:pb-2">
          <div className="flex min-h-0 flex-1 flex-col">
            <TripleDiceBoard
              sessionNotice=""
              hideSessionBanner
              statusTop={statusTop}
              statusSub={statusSub}
              diceValues={diceValues}
              diceMuted={diceMuted}
              totalDisplay={totalDisplay}
              selectedZone={selectedZone}
              onZoneChange={onZoneChange}
              rolling={rollingUi}
              onRoll={onRoll}
              rollDisabled={rollDisabled}
              optionPickerDisabled={optionPickerDisabled}
            />
          </div>
        </div>
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        resultTone={resolvedIsWin ? "win" : "lose"}
        animationKey={`${popupLine2}-${popupLine3}-${resolvedIsWin ? "w" : "l"}-${resultVaultLabel}`}
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
  const [selectedZone, setSelectedZone] = useState("mid");
  const [diceValues, setDiceValues] = useState(() => [...NEUTRAL_DICE]);
  const [rollingUi, setRollingUi] = useState(false);
  const [totalDisplay, setTotalDisplay] = useState("—");
  const [inTripleDiceLoop, setInTripleDiceLoop] = useState(false);
  const [persistedLastRound, setPersistedLastRound] = useState(null);
  const [stats, setStats] = useState(readTripleDiceStats);

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
  const terminalPopupEligibleRef = useRef(false);

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
    writeTripleDiceStats(stats);
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

  function resetRoundAfterResultPopup() {
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setResolvedResult(null);
    setResultPopupOpen(false);
    setUiState(UI_STATE.IDLE);
    setSessionNotice("");
    setInTripleDiceLoop(false);
    setPersistedLastRound(null);
    setDiceValues([...NEUTRAL_DICE]);
    setTotalDisplay("—");
    setRollingUi(false);
    if (rollAnimTimerRef.current) {
      clearInterval(rollAnimTimerRef.current);
      rollAnimTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyTripleDiceSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Math.max(0, Number(settlementResult.nextBalance || 0));
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        terminalPopupEligibleRef.current = false;
        if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
        resultPopupTimerRef.current = window.setTimeout(() => {
          resetRoundAfterResultPopup();
        }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
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
        window.setTimeout(() => {
          openResultPopup();
        }, REVEAL_READABLE_MS);
      }
    });
  }, [
    resolvedResult?.sessionId,
    resolvedResult?.settlementSummary,
    resolvedResult?.isWin,
    resolvedResult?.won,
    session?.id,
    uiState,
    openResultPopup,
  ]);

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
      setRollingUi(false);
      setDiceValues([...NEUTRAL_DICE]);
      setTotalDisplay("—");
      setPersistedLastRound(null);
      setSessionNotice(resumed ? "Session restored — adjust target and roll." : "Set your target, then tap Roll.");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInTripleDiceLoop(false);
      setSession(null);
      setResolvedResult(null);
      setPersistedLastRound(null);
      setDiceValues([...NEUTRAL_DICE]);
      setTotalDisplay("—");
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
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    setSession(null);
    setResolvedResult(null);
    setDiceValues([...NEUTRAL_DICE]);
    setTotalDisplay("—");
    setPersistedLastRound(null);

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
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => giftRoundMeta?.onGiftConsumed?.());
          }
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
    const won = Boolean(r.won ?? r.isWin ?? r.terminalKind === "full_clear");

    const finalize = () => {
      const totalStr = Number.isFinite(tot) ? String(tot) : "—";
      setDiceValues(dice);
      setRollingUi(false);
      setTotalDisplay(totalStr);
      setResolvedResult({
        ...r,
        sessionId: r.sessionId || sid,
        settlementSummary: r.settlementSummary,
      });
      const pz = normalizeTripleDiceZone(r.selectedZone);
      setPersistedLastRound({
        dice: [...dice],
        totalStr,
        playedZone: pz,
        isWin: won,
        rolledTotal: tot,
      });
      setInTripleDiceLoop(false);
      setUiState(UI_STATE.RESOLVED);
      terminalPopupEligibleRef.current = true;
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
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);

    const zone = normalizeTripleDiceZone(selectedZone);
    if (zone === null) return;

    submitInFlightRef.current = true;
    setPersistedLastRound(null);
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
            zone,
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
    if (isGiftRound && typeof window !== "undefined" && window.requestAnimationFrame) {
      giftRefreshRef.current?.();
      window.requestAnimationFrame(() => giftRefreshRef.current?.());
    }
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
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
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
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE || uiState === UI_STATE.RESOLVED);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (
        /Session expired\. Press START TRIPLE DICE|Session ended\. Press START TRIPLE DICE|no longer valid\. Press START TRIPLE DICE/i.test(
          s,
        )
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const tdSnap = session?.tripleDice;
  const playing = tdSnap?.playing;
  const readState = String(tdSnap?.readState || "");

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= TRIPLE_DICE_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  const normZone = normalizeTripleDiceZone(selectedZone) ?? "mid";
  let summaryWin = tripleDiceProjectedPayout(Math.max(TRIPLE_DICE_MIN_WAGER, numericWager), normZone);

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing?.entryAmount != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING)) {
    summaryWin = tripleDiceProjectedPayout(Math.floor(Number(playing.entryAmount)), normZone);
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
  const rt = Number(resolvedResult?.rolledTotal);
  const pickZone = normalizeTripleDiceZone(resolvedResult?.selectedZone);
  const diceArr = Array.isArray(resolvedResult?.dice) ? resolvedResult.dice : null;
  const facesStr = tripleDiceFormatFaces(diceArr);
  const rOk = Number.isFinite(rt) && pickZone != null;
  const pickLabel = pickZone ? pickZone.toUpperCase() : "—";
  const popupLine2 = rOk ? `Pick ${pickLabel} · ${facesStr} · total ${rt}` : "—";
  const popupLine3 = resolvedIsWin
    ? pickZone === "triple"
      ? "Three of a kind — your pick matched."
      : "Your pick matched this roll."
    : pickZone
      ? "Your pick did not match."
      : "NO MATCH";

  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}` : "";

  const handleZoneSelect = useCallback(z => {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    const v = normalizeTripleDiceZone(z);
    if (v) setSelectedZone(v);
  }, []);

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    if (
      [UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState)
    ) {
      return;
    }
    giftRoundRef.current = true;
    void runStartTripleDice();
  }, [vaultReady, giftShell.giftCount, uiState]);

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

  const rollDisabled =
    busyFooter || uiState !== UI_STATE.SESSION_ACTIVE || readState !== "ready" || rollingUi;

  const optionPickerDisabled =
    rollingUi ||
    (busyFooter && uiState !== UI_STATE.IDLE) ||
    (uiState === UI_STATE.SESSION_ACTIVE && readState !== "ready") ||
    uiState === UI_STATE.RESOLVED;

  const winChance = tripleDiceWinChancePercent(normZone);

  const strip = tripleDiceStripModel(uiState, readState, rollingUi);
  const stepLabels = ["Session", "Roll"];

  let payoutBandLabel = "Win if hit";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `${normZone.toUpperCase()} · ~${winChance.toFixed(2)}% hit`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary.payoutReturn ?? 0)));
    const won = Boolean(resolvedResult.isWin ?? resolvedResult.won);
    payoutBandLabel = won ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    const pz = normalizeTripleDiceZone(resolvedResult.selectedZone);
    const pzLabel = pz ? pz.toUpperCase() : "—";
    payoutCaption = pzLabel && pzLabel !== "—" ? `Played ${pzLabel} on this round` : "Round settled";
  }

  let statusTop = "Choose 1 of 4 options, then roll.";
  let statusSub = "Pick LOW, MID, HIGH, or TRIPLE — then START TRIPLE DICE.";
  if (rollingUi) {
    statusTop = "Rolling…";
    statusSub = "\u00a0";
  } else if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    const lines = buildOutcomeStatusLines(
      resolvedResult.rolledTotal,
      resolvedResult.dice,
      resolvedResult.selectedZone,
      resolvedIsWin,
      false,
    );
    statusTop = lines.statusTop;
    statusSub = lines.statusSub;
  } else if (
    persistedLastRound &&
    inTripleDiceLoop &&
    uiState === UI_STATE.SESSION_ACTIVE &&
    readState === "ready" &&
    !rollingUi
  ) {
    const pl = buildOutcomeStatusLines(
      persistedLastRound.rolledTotal,
      persistedLastRound.dice,
      persistedLastRound.playedZone,
      persistedLastRound.isWin,
      true,
    );
    statusTop = pl.statusTop;
    statusSub = pl.statusSub;
  } else if (inTripleDiceLoop && uiState === UI_STATE.SESSION_ACTIVE && readState === "ready" && !rollingUi) {
    statusTop = "Tap Roll when ready.";
    statusSub = `${normZone.toUpperCase()} · ${winChance.toFixed(2)}% hit rate`;
  }

  const diceMuted = !inTripleDiceLoop && idleLike;

  return (
    <SoloV2GameShell
      title="Triple Dice"
      subtitle="Pick lane, roll once."
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
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <TripleDiceGameplayPanel
          selectedZone={selectedZone}
          onZoneChange={handleZoneSelect}
          diceValues={diceValues}
          diceMuted={diceMuted}
          totalDisplay={totalDisplay}
          rollingUi={rollingUi}
          statusTop={statusTop}
          statusSub={statusSub}
          sessionNotice={sessionNotice}
          stepTotal={strip.stepTotal}
          stepsComplete={strip.stepsComplete}
          currentStepIndex={strip.currentStepIndex}
          stepLabels={stepLabels}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
          onRoll={handleRoll}
          rollDisabled={rollDisabled}
          optionPickerDisabled={optionPickerDisabled}
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
            Pick one lane — LOW (3–8), MID (9–11), HIGH (12–18), or TRIPLE (three matching faces). Stake locks on
            START TRIPLE DICE. Win odds and projected payout update with your pick before you roll.
          </p>
          <p>
            Tap Roll: the server rolls three fair dice. You win if the outcome fits your lane. TRIPLE only wins when
            all three dice show the same face; the sum does not decide that lane.
          </p>
          <p>
            Gift rounds use freeplay — a loss does not debit your vault; a win credits the full payout. After the result
            popup closes, the final dice stay visible — press START TRIPLE DICE explicitly for the next round; there is no
            auto-start or auto-chain.
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
