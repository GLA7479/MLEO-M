import { useCallback, useEffect, useRef, useState } from "react";
import TreasureDoorsBoard from "../components/solo-v2/TreasureDoorsBoard";
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
  TREASURE_DOORS_CHAMBER_COUNT,
  TREASURE_DOORS_DOOR_COUNT,
  TREASURE_DOORS_MIN_WAGER,
  TREASURE_DOORS_MULTIPLIER_LADDER,
  payoutForMultiplier,
} from "../lib/solo-v2/treasureDoorsConfig";
import { QUICK_FLIP_CONFIG } from "../lib/solo-v2/quickFlipConfig";
import {
  applyTreasureDoorsSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "treasure_doors";
const PLAYER_HEADER = "treasure-doors-client";

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

const STATS_KEY = "solo_v2_treasure_doors_stats_v1";
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

function readTreasureDoorsStats() {
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

function writeTreasureDoorsStats(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function treasureDoorsStripModel(chamberCount, uiState, nCleared, terminalKind) {
  const total = Math.max(1, Math.floor(Number(chamberCount) || TREASURE_DOORS_CHAMBER_COUNT));
  const cleared = Math.max(0, Math.min(total, Math.floor(Number(nCleared) || 0)));
  if (uiState === UI_STATE.RESOLVED && terminalKind === "full_clear") {
    return { stepTotal: total, stepsComplete: total, currentStepIndex: total - 1 };
  }
  return { stepTotal: total, stepsComplete: cleared, currentStepIndex: Math.min(cleared, total - 1) };
}

function TreasureDoorsGameplayPanel({
  session,
  uiState,
  pickUiLock,
  pulseCell,
  shakeCell,
  onPickDoor,
  canCashOut,
  cashOutLoading,
  onCashOut,
  sessionNotice,
  statusTop,
  statusSub,
  stepTotal,
  stepsComplete,
  currentStepIndex,
  stepLabels,
  payoutBandLabel,
  payoutBandValue,
  payoutCaption,
  resultPopupOpen,
  resolvedIsWin,
  popupLine2,
  popupLine3,
  resultVaultLabel,
}) {
  const td = session?.treasureDoors;
  const playing = td?.playing;
  const rr = td?.resolvedResult;
  const isTerminal = Boolean(rr) || session?.sessionStatus === "resolved";
  const revealTraps = isTerminal && Array.isArray(rr?.trapDoors);
  const trapDoors = revealTraps ? rr.trapDoors : null;
  const doorHistory = isTerminal ? rr?.doorHistory || [] : playing?.doorHistory || [];

  const chamberCount = Math.floor(Number(playing?.chamberCount ?? TREASURE_DOORS_CHAMBER_COUNT)) || TREASURE_DOORS_CHAMBER_COUNT;
  const doorCount = Math.floor(Number(playing?.doorCount ?? TREASURE_DOORS_DOOR_COUNT)) || TREASURE_DOORS_DOOR_COUNT;

  const busy =
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  const canPick =
    !busy &&
    !isTerminal &&
    td?.readState === "choice_required" &&
    uiState === UI_STATE.SESSION_ACTIVE;

  const currentChamberIndex = isTerminal
    ? chamberCount
    : Math.floor(Number(playing?.currentChamberIndex ?? 0));

  const pp = td?.pendingPick;
  const serverLockedDoor =
    !isTerminal &&
    td?.readState === "choice_submitted" &&
    pp != null &&
    Math.floor(Number(pp.chamberIndex)) === currentChamberIndex &&
    Number.isFinite(Number(pp.door))
      ? Math.floor(Number(pp.door))
      : null;
  const clientLockedDoor =
    !isTerminal &&
    pickUiLock != null &&
    pickUiLock.chamber === currentChamberIndex &&
    Number.isFinite(Number(pickUiLock.door))
      ? Math.floor(Number(pickUiLock.door))
      : null;
  const lockedDoorForChamber = serverLockedDoor ?? clientLockedDoor;

  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || chamberCount));
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

        <div className="shrink-0 px-2.5 pb-0 pt-0.5 text-center sm:px-3 sm:pb-0.5 sm:pt-0.5 lg:px-8">
          <div className="flex min-h-[1.875rem] items-start justify-center sm:min-h-[2rem]">
            <p className="line-clamp-2 w-full text-center text-[11px] font-bold leading-snug text-white sm:text-[13px] sm:leading-snug">
              {statusTop}
            </p>
          </div>
          <div className="flex min-h-[1.625rem] items-start justify-center sm:min-h-[1.75rem]">
            <p className="line-clamp-2 w-full text-center text-[9px] leading-snug text-zinc-400 sm:text-[10px]">{statusSub}</p>
          </div>
        </div>

        <div className="shrink-0 px-2.5 pb-0.5 pt-0 sm:px-3 sm:pb-1 lg:px-8">
          <div className="mb-0 flex items-center justify-between px-0.5 sm:mb-0.5">
            <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-violet-200/40 sm:text-[9px]">Chambers</span>
            <span className="text-[8px] font-semibold tabular-nums text-zinc-500 sm:text-[9px]">
              {Math.min(stripCleared + 1, total)} / {total}
            </span>
          </div>
          <div
            className="flex items-stretch justify-center gap-px rounded-lg border border-zinc-700/60 bg-zinc-950/80 p-px shadow-inner sm:gap-0.5 sm:rounded-xl sm:p-0.5"
            aria-label="Chamber progress"
          >
            {Array.from({ length: total }, (_, i) => {
              const done = i < stripCleared;
              const active = i === cur && !done;
              const label = stepLabels[i] ?? `CH${i + 1}`;
              return (
                <div
                  key={`td-step-${i}`}
                  className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[5px] py-1 sm:rounded-md sm:py-1.5 ${
                    done
                      ? "bg-emerald-600/35 text-emerald-100"
                      : active
                        ? "bg-violet-500/25 text-violet-100 ring-1 ring-inset ring-violet-400/35"
                        : "bg-zinc-900/90 text-zinc-500"
                  }`}
                >
                  <span className="px-0.5 text-center text-[8px] font-extrabold uppercase tracking-wide sm:text-[9px]">
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

        <div className="flex min-h-0 flex-1 flex-col px-1 pb-1 sm:px-2 lg:px-6 lg:pb-2">
          <div className="flex min-h-0 flex-1 flex-col py-0.5">
            <TreasureDoorsBoard
              chamberCount={chamberCount}
              doorCount={doorCount}
              currentChamberIndex={currentChamberIndex}
              doorHistory={doorHistory}
              trapDoors={trapDoors}
              revealTraps={revealTraps}
              disabled={!canPick}
              lockedDoorIndex={lockedDoorForChamber}
              pulseCell={pulseCell}
              shakeCell={shakeCell}
              onPickDoor={onPickDoor}
              terminalKind={rr?.terminalKind ?? null}
              finalChamberIndex={rr?.finalChamberIndex ?? null}
              lastPickDoor={rr?.lastPickDoor ?? null}
              hideChamberRunStrip
            />
          </div>

          <div className="mt-1 min-h-10 shrink-0 px-0.5 pb-1 sm:px-1 lg:px-0">
            <button
              type="button"
              disabled={!canCashOut || cashOutLoading || busy || isTerminal}
              onClick={onCashOut}
              className={`w-full rounded-lg border px-3 py-2 text-xs font-extrabold uppercase tracking-wide ${
                !canCashOut || cashOutLoading || busy || isTerminal
                  ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
                  : "border-amber-500/45 bg-amber-950/50 text-amber-100 hover:bg-amber-900/45"
              }`}
            >
              {cashOutLoading ? "Sealing vault…" : "Bank secured loot"}
            </button>
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

export default function TreasureDoorsPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(TREASURE_DOORS_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [pulseCell, setPulseCell] = useState(null);
  const [shakeCell, setShakeCell] = useState(null);
  const [cashOutLoading, setCashOutLoading] = useState(false);
  /** Locks the current chamber to one door immediately on pick (covers gap before server `pendingPick`). */
  const [pickUiLock, setPickUiLock] = useState(null);
  const [stats, setStats] = useState(readTreasureDoorsStats);

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

  useEffect(() => {
    setPickUiLock(null);
  }, [session?.id]);

  useEffect(() => {
    if (uiState === UI_STATE.RESOLVED || uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE) {
      setPickUiLock(null);
    }
  }, [uiState]);

  useEffect(() => {
    const td = session?.treasureDoors;
    const playing = td?.playing;
    if (!pickUiLock) return;
    const cur = Math.floor(Number(playing?.currentChamberIndex ?? 0));
    if (cur !== pickUiLock.chamber) {
      setPickUiLock(null);
      return;
    }
    if (td?.readState === "pick_conflict") {
      setPickUiLock(null);
    }
  }, [
    session?.treasureDoors?.playing?.currentChamberIndex,
    session?.treasureDoors?.readState,
    pickUiLock,
  ]);

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
    writeTreasureDoorsStats(stats);
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
    setPulseCell(null);
    setShakeCell(null);
    setPickUiLock(null);
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const settlementSummary = resolvedResult?.settlementSummary;
    const sessionId = resolvedResult?.sessionId || session?.id;
    if (!sessionId || !settlementSummary) return;
    applyTreasureDoorsSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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
    const td = sessionPayload?.treasureDoors;
    const readState = String(td?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && td?.resolvedResult) {
      setResolvedResult({
        ...td.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: td.resolvedResult.settlementSummary,
      });
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Run ended (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "pick_conflict") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting door picks — refreshing chamber state.");
      return;
    }

    if (readState === "choice_submitted") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Door locked — the vault decides…" : "Opening your door…");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      const ch = Math.floor(Number(td?.playing?.currentChamberIndex ?? 0)) + 1;
      const cleared = Array.isArray(td?.playing?.clearedChambers) ? td.playing.clearedChambers.length : 0;
      setSessionNotice(
        resumed
          ? cleared > 0
            ? `Chamber ${ch} — choose your door.`
            : "Run restored — step into the vault."
          : cleared > 0
            ? `Chamber cleared — enter chamber ${ch}.`
            : `Chamber ${ch} — pick one door.`,
      );
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
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    setSession(null);
    setResolvedResult(null);

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
    const response = await fetch("/api/solo-v2/treasure-doors/resolve", {
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

  async function handleResolveAfterPick(sessionId, activeCycle) {
    if (resolveInFlightRef.current) return;
    resolveInFlightRef.current = true;
    setUiState(UI_STATE.RESOLVING);
    try {
      const { response, payload, halted } = await postResolve(sessionId, {}, activeCycle);
      if (halted) {
        setPickUiLock(null);
        return;
      }
      const status = String(payload?.status || "");
      const result = classifySoloV2ApiResult(response, payload);

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "turn_complete" && payload?.result) {
        const r = payload.result;
        setPulseCell({ chamberIndex: r.chamberIndex, door: r.door });
        window.setTimeout(() => setPulseCell(null), 650);
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted || !readResult?.ok) {
          setPickUiLock(null);
          setUiState(UI_STATE.SESSION_ACTIVE);
          return;
        }
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
        return;
      }

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const r = payload.result;
        if (r.terminalKind === "trap") {
          setShakeCell({
            chamberIndex: r.finalChamberIndex ?? r.chamberIndex,
            door: r.lastPickDoor ?? r.door,
          });
          window.setTimeout(() => setShakeCell(null), 900);
        }
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        setResolvedResult({
          ...r,
          sessionId: r.sessionId || sessionId,
          settlementSummary: r.settlementSummary || payload?.result?.settlementSummary,
        });
        setUiState(UI_STATE.RESOLVED);
        terminalPopupEligibleRef.current = true;
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      const readResult = await readSessionTruth(sessionId, activeCycle);
      if (readResult?.ok && readResult.session) {
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
      } else {
        setPickUiLock(null);
        setUiState(UI_STATE.SESSION_ACTIVE);
      }
    } finally {
      resolveInFlightRef.current = false;
    }
  }

  async function handlePickDoor(door) {
    const sid = sessionRef.current?.id;
    const playing = sessionRef.current?.treasureDoors?.playing;
    const chamber = playing?.currentChamberIndex;
    if (sid == null || !Number.isFinite(Number(chamber)) || !Number.isFinite(Number(door))) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    submitInFlightRef.current = true;
    const chamberFloor = Math.floor(Number(chamber));
    const doorFloor = Math.floor(Number(door));
    setPickUiLock({ chamber: chamberFloor, door: doorFloor });
    setUiState(UI_STATE.SUBMITTING_PICK);
    setErrorMessage("");
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
            action: "treasure_doors_pick",
            gameKey: GAME_KEY,
            chamberIndex: chamber,
            door,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolveAfterPick(sid, activeCycle);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "pick_conflict" || st === "invalid_row")) {
        const rr = await readSessionTruth(sid, activeCycle);
        if (rr?.ok && rr.session) {
          setSession(rr.session);
          applySessionReadState(rr.session, { resumed: true });
        }
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick rejected — state refreshed."));
        setPickUiLock(null);
        setUiState(UI_STATE.SESSION_ACTIVE);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && st === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          setPickUiLock(null);
          setSession(null);
          setUiState(UI_STATE.IDLE);
          setErrorMessage(msg || "Session expired.");
          return;
        }
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick failed."));
      setPickUiLock(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setErrorMessage("Network error while submitting pick.");
      setPickUiLock(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function handleCashOut() {
    const sid = session?.id;
    if (!sid || cashOutLoading || resolveInFlightRef.current) return;
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    setResultPopupOpen(false);
    setCashOutLoading(true);
    const activeCycle = cycleRef.current;
    setUiState(UI_STATE.RESOLVING);
    try {
      const { response, payload, halted } = await postResolve(sid, { action: "cashout" }, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const api = classifySoloV2ApiResult(response, payload);
      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const readResult = await readSessionTruth(sid, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        const pr = payload.result;
        setResolvedResult({
          ...pr,
          sessionId: pr.sessionId || sid,
          settlementSummary: pr.settlementSummary ?? payload?.settlementSummary,
        });
        setUiState(UI_STATE.RESOLVED);
        terminalPopupEligibleRef.current = true;
        return;
      }
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Cash out failed."));
      const readResult = await readSessionTruth(sid, activeCycle);
      if (readResult?.ok && readResult.session) {
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
      }
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      setCashOutLoading(false);
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
    if (!isGiftRound && wager < TREASURE_DOORS_MIN_WAGER) return;
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
    if (!boot.ok || boot.alreadyTerminal) return;
    if (isGiftRound && typeof window !== "undefined" && window.requestAnimationFrame) {
      giftRefreshRef.current?.();
      window.requestAnimationFrame(() => giftRefreshRef.current?.());
    }
    const td = boot.session?.treasureDoors;
    if (td?.readState === "choice_submitted") {
      await handleResolveAfterPick(boot.session.id, activeCycle);
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const td = session?.treasureDoors;
    if (!sid || !td || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (td.readState !== "choice_submitted" || !td.canResolveTurn) return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolveAfterPick(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional resume-only resolve
  }, [session?.id, session?.treasureDoors?.readState, session?.treasureDoors?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= TREASURE_DOORS_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= TREASURE_DOORS_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
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
        /Session expired\. Press START RUN|Session ended\. Press START RUN|no longer valid\. Press START RUN/i.test(s)
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const td = session?.treasureDoors;
  const playing = td?.playing;
  const readState = String(td?.readState || "");

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= TREASURE_DOORS_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  const firstStepWinPreview = payoutForMultiplier(
    Math.max(TREASURE_DOORS_MIN_WAGER, numericWager),
    TREASURE_DOORS_MULTIPLIER_LADDER[0],
  );

  let summaryPlay = numericWager;
  let summaryWin = firstStepWinPreview;

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
  }

  if (playing && (uiState === UI_STATE.SESSION_ACTIVE || uiState === UI_STATE.SUBMITTING_PICK || uiState === UI_STATE.RESOLVING)) {
    const np = playing.nextPayout;
    const cp = playing.currentPayout;
    if (np != null && Number.isFinite(Number(np))) {
      summaryWin = Math.floor(Number(np));
    } else if (cp != null && Number.isFinite(Number(cp))) {
      summaryWin = Math.floor(Number(cp));
    }
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const chamberTotal =
    Math.floor(Number(playing?.chamberCount ?? TREASURE_DOORS_CHAMBER_COUNT)) || TREASURE_DOORS_CHAMBER_COUNT;
  const rrSnap = td?.resolvedResult;
  const terminalSession = Boolean(rrSnap) || session?.sessionStatus === "resolved";
  const nCleared = terminalSession && Array.isArray(rrSnap?.clearedChambers)
    ? rrSnap.clearedChambers.length
    : Array.isArray(playing?.clearedChambers)
      ? playing.clearedChambers.length
      : 0;
  const stripTerminalKind =
    uiState === UI_STATE.RESOLVED ? resolvedResult?.terminalKind ?? null : rrSnap?.terminalKind ?? null;
  const strip = treasureDoorsStripModel(chamberTotal, uiState, nCleared, stripTerminalKind);
  const stepLabels = Array.from({ length: strip.stepTotal }, (_, i) => `CH${i + 1}`);

  let statusTop = "Press START RUN when you are set.";
  let statusSub =
    "Set play in the bar below, then enter the vault. Each chamber has three doors — two safe, one trap sealed by the server.";

  if (uiState === UI_STATE.UNAVAILABLE) {
    statusTop = !vaultReady ? "Vault unavailable." : "Can't start this run.";
    statusSub = !vaultReady
      ? "Shared vault could not be opened. Return to the arcade and try again."
      : String(errorMessage || "").trim() || "Check your balance and connection, then try START RUN again.";
  } else if (uiState === UI_STATE.LOADING) {
    statusTop = "Starting run…";
    statusSub = "Opening or resuming a session with the server.";
  } else if (uiState === UI_STATE.SUBMITTING_PICK) {
    statusTop = "Submitting door…";
    statusSub = "Locking your pick with the server.";
  } else if (uiState === UI_STATE.RESOLVING || cashOutLoading) {
    statusTop = cashOutLoading ? "Sealing vault…" : "Opening the chamber…";
    statusSub = "Outcome is resolved on the server before the doors update.";
  } else if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    const won = Boolean(resolvedResult.isWin ?? resolvedResult.won);
    statusTop = won ? "Temple run closed in your favor." : "Temple run closed.";
    statusSub =
      "Adjust stake if needed, then press START RUN for another run — there is no auto-start after the popup.";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "pick_conflict") {
    statusTop = "State conflict.";
    statusSub = "Refreshing chamber state from the server.";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "choice_submitted") {
    statusTop = "Door locked — the vault decides…";
    statusSub = "Resolving this chamber on the server.";
  } else if (uiState === UI_STATE.SESSION_ACTIVE && (readState === "choice_required" || readState === "ready")) {
    statusTop = "Choose a door.";
    statusSub = "Two passages are safe; one is a trap — your pick is committed when you tap.";
  } else if (uiState === UI_STATE.PENDING_MIGRATION) {
    statusTop = "Migration pending.";
    statusSub = "This environment is updating. Try again shortly.";
  } else if (uiState === UI_STATE.IDLE) {
    statusTop = "Temple run.";
    statusSub = "Five sealed chambers, three doors each — survive the ladder or bank between safe rooms.";
  }

  let payoutBandLabel = "Secured loot";
  let payoutBandValue = formatCompact(summaryWin);
  let payoutCaption = `First safe chamber ×${TREASURE_DOORS_MULTIPLIER_LADDER[0]} on this play`;

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const pr = Math.max(0, Math.floor(Number(resolvedResult.settlementSummary.payoutReturn ?? 0)));
    const won = Boolean(resolvedResult.isWin ?? resolvedResult.won);
    payoutBandLabel = won ? "Return paid" : "Return this round";
    payoutBandValue = formatCompact(pr);
    const tk = resolvedResult.terminalKind;
    if (tk === "full_clear") payoutCaption = "Crown vault — every chamber cleared";
    else if (tk === "trap") {
      const fi = Math.floor(Number(resolvedResult.finalChamberIndex ?? 0));
      payoutCaption = Number.isFinite(fi) ? `Trap at chamber ${fi + 1}` : "Trap triggered — run lost";
    } else if (tk === "cashout") payoutCaption = "Banked secured loot — clean exit";
    else payoutCaption = "Round settled";
  }

  const terminalKind = resolvedResult?.terminalKind;
  let resultTitle = "Vault closed";
  if (terminalKind === "trap") resultTitle = "Trap triggered — run lost";
  else if (terminalKind === "full_clear") resultTitle = "Temple cleared — crown payout!";
  else if (terminalKind === "cashout") resultTitle = "Loot banked — clean exit";

  const resolvedIsWin = Boolean(resolvedResult?.isWin ?? resolvedResult?.won);
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null
      ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}`
      : "";

  const prPopup = Math.max(0, Math.floor(Number(resolvedResult?.settlementSummary?.payoutReturn ?? 0)));
  let popupLine2 = formatCompact(prPopup);
  let popupLine3 = resultTitle;
  if (terminalKind === "trap") {
    const fi = Math.floor(Number(resolvedResult?.finalChamberIndex ?? 0));
    popupLine2 = Number.isFinite(fi) ? `Trap · chamber ${fi + 1}` : "Trap door";
    popupLine3 = `${formatCompact(prPopup)} return`;
  } else if (terminalKind === "full_clear") {
    popupLine2 = `Crown · ${formatCompact(prPopup)}`;
    popupLine3 = "All chambers cleared";
  } else if (terminalKind === "cashout") {
    popupLine2 = `Banked ${formatCompact(prPopup)}`;
    popupLine3 = "Secured loot exit";
  }

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
    void runStartRun();
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

  return (
    <SoloV2GameShell
      title="Treasure Doors"
      subtitle="Doors, chambers, bank loot."
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
            <span className="font-semibold tabular-nums text-amber-200/90">{formatCompact(summaryPlay)}</span>
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - TREASURE_DOORS_MIN_WAGER)));
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
          setWagerInput(String(TREASURE_DOORS_MIN_WAGER));
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
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <TreasureDoorsGameplayPanel
          session={session}
          uiState={uiState}
          pickUiLock={pickUiLock}
          pulseCell={pulseCell}
          shakeCell={shakeCell}
          onPickDoor={handlePickDoor}
          canCashOut={Boolean(td?.canCashOut)}
          cashOutLoading={cashOutLoading}
          onCashOut={() => void handleCashOut()}
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          stepTotal={strip.stepTotal}
          stepsComplete={strip.stepsComplete}
          currentStepIndex={strip.currentStepIndex}
          stepLabels={stepLabels}
          payoutBandLabel={payoutBandLabel}
          payoutBandValue={payoutBandValue}
          payoutCaption={payoutCaption}
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
            You descend five sealed chambers. Each offers three heavy doors: two safe passages and one trap, sealed by
            the server before you choose. Surviving a chamber deepens the run and raises your secured payout on the
            multiplier ladder.
          </p>
          <p>
            After any safe chamber you can bank secured loot to exit cleanly, or keep descending toward the crown vault.
            Gift rounds use freeplay — a loss does not debit your vault; a win credits the full payout.
          </p>
          <p>
            After the result popup closes, the sealed board recap stays visible — press START RUN explicitly for the next
            round; there is no auto-start.
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
