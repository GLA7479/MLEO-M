import { useCallback, useEffect, useRef, useState } from "react";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
} from "../components/solo-v2/SoloV2ResultPopup";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import {
  SOLO_V2_GIFT_ROUND_STAKE,
  soloV2GiftConsumeOne,
} from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import { MYSTERY_BOX_MIN_WAGER, MYSTERY_BOX_WIN_MULTIPLIER } from "../lib/solo-v2/mysteryBoxConfig";
import {
  applyMysteryBoxSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const SOLO_V2_PLAYER = "mystery-box-client";
const GAME_KEY = "mystery_box";

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

const STATS_KEY = "solo_v2_mystery_box_stats_v1";
const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function readMysteryBoxStats() {
  if (typeof window === "undefined") {
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
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
    return { totalGames: 0, wins: 0, losses: 0, totalPlay: 0, totalWon: 0, biggestWin: 0 };
  }
}

function writeMysteryBoxStats(nextStats) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
  } catch {
    // ignore
  }
}

function boxLabel(index) {
  if (index === 0 || index === 1 || index === 2) return `Box ${index + 1}`;
  return "—";
}

function BoxButton({ index, label, selectedBox, disabled, onSelect }) {
  const isSelected = selectedBox === index;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(index)}
      className={`flex min-h-[72px] flex-1 flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-extrabold transition sm:min-h-[84px] ${
        isSelected
          ? "border-amber-400/55 bg-amber-500/25 text-amber-50 shadow-md shadow-amber-900/25"
          : "border-white/25 bg-white/[0.06] text-zinc-100 hover:bg-white/12"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <span className="text-2xl sm:text-3xl">{label}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pick</span>
    </button>
  );
}

function MysteryBoxGameplayPanel({
  uiState,
  selectedBox,
  isOpening,
  resultToast,
  onSelectBox,
  winningBoxIndex,
  pickedBoxIndex,
}) {
  const isPickLocked = uiState === UI_STATE.CHOICE_SUBMITTED;
  const canPick = !isOpening && uiState !== UI_STATE.LOADING && !isPickLocked;

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden px-2 pt-1 text-center sm:max-w-lg">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2 sm:py-4">
          <p className="mb-3 max-w-xs text-xs leading-relaxed text-zinc-400 sm:text-sm">
            One box holds the prize. The server picks the winning box when you open.
          </p>
          <div className="grid w-full grid-cols-3 gap-2 sm:gap-3">
            <BoxButton
              index={0}
              label="A"
              selectedBox={selectedBox}
              disabled={!canPick}
              onSelect={onSelectBox}
            />
            <BoxButton
              index={1}
              label="B"
              selectedBox={selectedBox}
              disabled={!canPick}
              onSelect={onSelectBox}
            />
            <BoxButton
              index={2}
              label="C"
              selectedBox={selectedBox}
              disabled={!canPick}
              onSelect={onSelectBox}
            />
          </div>
          {uiState !== UI_STATE.IDLE ? (
            <div className="mt-3 flex h-6 w-full max-w-sm shrink-0 flex-col justify-center sm:mt-4 sm:h-7">
              {uiState === UI_STATE.RESOLVED && winningBoxIndex !== null && winningBoxIndex !== undefined ? (
                <p className="text-xs text-zinc-400">
                  Winning box:{" "}
                  <span className="font-bold text-amber-200/95">{boxLabel(winningBoxIndex)}</span>
                </p>
              ) : (
                <p className="invisible text-xs leading-tight" aria-hidden>
                  Winning box: <span className="font-bold">A</span>
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <SoloV2ResultPopup
        open={Boolean(resultToast)}
        isWin={Boolean(resultToast?.isWin)}
        animationKey={`${resultToast?.outcomeLabel ?? ""}-${resultToast?.deltaLabel ?? ""}-${pickedBoxIndex ?? ""}`}
        vaultSlot={
          resultToast ? (
            <SoloV2ResultPopupVaultLine isWin={resultToast.isWin} deltaLabel={resultToast.deltaLabel} />
          ) : undefined
        }
      >
        <div className="text-[13px] font-black uppercase tracking-wide">
          {resultToast?.isWin ? "YOU WIN" : "YOU LOSE"}
        </div>
        <div className="mt-1 text-sm font-bold text-white">
          Your pick:{" "}
          <span className="text-amber-100">
            {pickedBoxIndex === 0 || pickedBoxIndex === 1 || pickedBoxIndex === 2
              ? `Box ${boxLabel(pickedBoxIndex)}`
              : "—"}
          </span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide opacity-90">
          {resultToast?.outcomeLabel ?? "—"}
        </div>
      </SoloV2ResultPopup>
    </div>
  );
}

export default function MysteryBoxPage() {
  const giftShell = useSoloV2GiftShellState();
  const giftRefreshRef = useRef(() => {});
  const giftRoundRef = useRef(false);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [session, setSession] = useState(null);
  const [selectedBox, setSelectedBox] = useState(null);
  const [, setEventInfo] = useState(null);
  const [resolvedResult, setResolvedResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [, setSessionNotice] = useState("");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(MYSTERY_BOX_MIN_WAGER));
  const lastPresetAmountRef = useRef(null);
  const [stats, setStats] = useState(readMysteryBoxStats);
  const [resultToast, setResultToast] = useState(null);
  const toastTimerRef = useRef(null);
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
    writeMysteryBoxStats(stats);
  }, [stats]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function recoverStaleRound(message, opts = {}) {
    const releaseCreateLock = opts.releaseCreateLock !== false;
    if (releaseCreateLock) createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setSession(null);
    setSelectedBox(null);
    setEventInfo(null);
    setResolvedResult(null);
    setSessionNotice("");
    setUiState(UI_STATE.IDLE);
    setErrorMessage(String(message || "").trim() || "This round is no longer valid. Pick a box and press OPEN BOX.");
  }

  useEffect(() => {
    if (uiState !== UI_STATE.RESOLVED) return;
    const sessionId = resolvedResult?.sessionId || session?.id;
    const settlementSummary = resolvedResult?.settlementSummary;
    if (!sessionId || !settlementSummary) return;
    applyMysteryBoxSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
      if (!settlementResult) return;
      const authoritativeBalance = Number(settlementResult.nextBalance || 0);
      setVaultBalance(authoritativeBalance);
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        setSessionNotice("Result resolved, but vault update failed.");
        return;
      }

      const delta = Number(settlementSummary.netDelta || 0);
      const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
      if (settlementResult.applied) {
        setSessionNotice(`Settled (${deltaLabel}). Vault: ${authoritativeBalance}.`);
        const entryCost = Number(settlementSummary.entryCost || MYSTERY_BOX_MIN_WAGER);
        const payoutReturn = Number(settlementSummary.payoutReturn || 0);
        setStats(prev => ({
          ...prev,
          totalGames: Number(prev.totalGames || 0) + 1,
          wins: Number(prev.wins || 0) + (resolvedResult?.isWin ? 1 : 0),
          losses: Number(prev.losses || 0) + (resolvedResult?.isWin ? 0 : 1),
          totalPlay:
            Number(prev.totalPlay || 0) + (settlementSummary.fundingSource === "gift" ? 0 : entryCost),
          totalWon: Number(prev.totalWon || 0) + payoutReturn,
          biggestWin: Math.max(Number(prev.biggestWin || 0), resolvedResult?.isWin ? payoutReturn : 0),
        }));
      } else {
        setSessionNotice(`Settlement already applied. Vault: ${authoritativeBalance}.`);
      }

      const toastDelta = Number(settlementSummary.netDelta || 0);
      const toastDeltaLabel = toastDelta >= 0 ? `+${toastDelta}` : `${toastDelta}`;
      const ob = resolvedResult?.outcome;
      const outcomeLabel =
        ob === 0 || ob === 1 || ob === 2 ? `Prize was in ${boxLabel(ob)}` : "Round complete";
      setResultToast({
        isWin: Boolean(resolvedResult?.isWin),
        deltaLabel: toastDeltaLabel,
        outcomeLabel,
      });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setResultToast(null);
      }, 2000);
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id, uiState]);

  function hydrateResolvedFromSession(sessionPayload) {
    const summary = sessionPayload?.mysteryBox?.resolvedResult || sessionPayload?.serverOutcomeSummary || {};
    if (sessionPayload?.sessionStatus !== "resolved") return null;
    return {
      sessionId: sessionPayload?.id || null,
      sessionStatus: sessionPayload?.sessionStatus || "resolved",
      choice: summary.choice ?? null,
      outcome: summary.outcome ?? null,
      isWin: Boolean(summary.isWin),
      resolvedAt: summary.resolvedAt || sessionPayload?.resolvedAt || null,
      settlementSummary: summary.settlementSummary || null,
    };
  }

  function applySessionReadState(sessionPayload, options = {}) {
    const { resumed = false, localChoiceToKeep = null } = options;
    setSession(sessionPayload);

    const readState = String(sessionPayload?.readState || "");
    const serverBox = sessionPayload?.mysteryBox?.boxChoice;
    const pickEventId = sessionPayload?.mysteryBox?.pickEventId || null;
    const resolved = hydrateResolvedFromSession(sessionPayload);

    if (readState === "resolved" || resolved) {
      if (resolved) setResolvedResult(resolved);
      setEventInfo(null);
      setSelectedBox(null);
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Resumed already resolved session." : "Session already resolved on server.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_submitted") {
      setSelectedBox(serverBox === 0 || serverBox === 1 || serverBox === 2 ? serverBox : null);
      setEventInfo({
        eventId: pickEventId,
        eventType: "client_action",
      });
      setUiState(UI_STATE.CHOICE_SUBMITTED);
      setSessionNotice("Resumed session with locked pick. Ready to open.");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      if (localChoiceToKeep === 0 || localChoiceToKeep === 1 || localChoiceToKeep === 2) {
        setSelectedBox(localChoiceToKeep);
      } else {
        setSelectedBox(null);
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
      createInFlightRef.current = false;
      submitInFlightRef.current = false;
      resolveInFlightRef.current = false;
      setSession(null);
      setSelectedBox(null);
      setEventInfo(null);
      setResolvedResult(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        sessionPayload?.sessionStatus === "expired"
          ? "Session expired. Pick a box and press OPEN BOX."
          : "Session ended. Pick a box and press OPEN BOX.",
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
        "x-solo-v2-player": SOLO_V2_PLAYER,
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

  function hasPersistedMysteryPick(session) {
    const c = session?.mysteryBox?.boxChoice;
    return c === 0 || c === 1 || c === 2;
  }

  function sessionTruthIsDead(sessionPayload, readStatus) {
    const rs = String(sessionPayload?.readState || "");
    const rss = String(readStatus || "");
    const st = String(sessionPayload?.sessionStatus || "");
    return (
      rss === "invalid" ||
      rs === "invalid" ||
      st === "expired" ||
      st === "cancelled"
    );
  }

  async function verifyMysteryPickPersisted(sessionId, activeCycle) {
    const readResult = await readSessionTruth(sessionId, activeCycle);
    if (readResult?.halted) return { halted: true };
    if (!readResult?.ok) return { ok: false, readResult };
    if (!hasPersistedMysteryPick(readResult.session)) {
      return { ok: false, readResult, missingPick: true };
    }
    return { ok: true, session: readResult.session };
  }

  async function bootstrapMysteryBoxSession(wager, activeCycle, localBoxToKeep, createSessionMode, giftRoundMeta) {
    const isGiftRound = Boolean(giftRoundMeta?.isGiftRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    setSession(null);
    setEventInfo(null);
    setResolvedResult(null);

    try {
      const createBody = {
        gameKey: GAME_KEY,
        sessionMode: createSessionMode,
        entryAmount: wager,
      };

      let response = await fetch("/api/solo-v2/sessions/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": SOLO_V2_PLAYER,
        },
        body: JSON.stringify(createBody),
      });

      let payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return { ok: false };
      let result = classifySoloV2ApiResult(response, payload);
      let status = String(payload?.status || "");

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "conflict_active_sessions") {
        recoverStaleRound("", { releaseCreateLock: false });
        setErrorMessage("Session sync issue — retrying…");
        await new Promise(r => setTimeout(r, 480));
        if (activeCycle !== cycleRef.current) return { ok: false };
        response = await fetch("/api/solo-v2/sessions/create", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-solo-v2-player": SOLO_V2_PLAYER,
          },
          body: JSON.stringify(createBody),
        });
        payload = await response.json().catch(() => null);
        if (activeCycle !== cycleRef.current) return { ok: false };
        result = classifySoloV2ApiResult(response, payload);
        status = String(payload?.status || "");
      }

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "created" && payload?.session) {
        if (isGiftRound) {
          if (!soloV2GiftConsumeOne()) {
            setSession(null);
            setUiState(UI_STATE.IDLE);
            setErrorMessage("No gift available. Try again after the next recharge.");
            return { ok: false };
          }
          giftRoundMeta?.onGiftConsumed?.();
        }
        setSession(payload.session);
        setSessionNotice("");
        setErrorMessage("");
        setUiState(UI_STATE.SESSION_CREATED);
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
        if (readResult?.halted) return { ok: false };
        if (!readResult?.ok) {
          setSession(null);
          setSelectedBox(null);
          setEventInfo(null);
          setResolvedResult(null);
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }

        applySessionReadState(readResult.session, { resumed: true, localChoiceToKeep: localBoxToKeep });
        const rs = String(readResult.session?.readState || "");
        const st = String(readResult.session?.sessionStatus || "");
        const rss = String(readResult.readStatus || "");
        if (sessionTruthIsDead(readResult.session, rss)) {
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

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "conflict_active_sessions") {
        recoverStaleRound("Couldn’t merge sessions. Tap OPEN BOX again.");
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

  async function submitPickAndResolveFlow(sessionId, boxIndex, activeCycle) {
    if (!sessionId || (boxIndex !== 0 && boxIndex !== 1 && boxIndex !== 2)) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;

    submitInFlightRef.current = true;
    setUiState(UI_STATE.SUBMITTING_CHOICE);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/solo-v2/sessions/${sessionId}/event`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": SOLO_V2_PLAYER,
        },
        body: JSON.stringify({
          eventType: "client_action",
          eventPayload: {
            gameKey: GAME_KEY,
            action: "mystery_box_pick",
            boxIndex,
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
          setSessionNotice("Pick already accepted. Opening...");
        } else {
          setSessionNotice("Opening...");
        }
        const verified = await verifyMysteryPickPersisted(sessionId, activeCycle);
        if (verified?.halted) return;
        if (!verified?.ok) {
          if (verified?.missingPick) {
            recoverStaleRound("Pick did not persist. Pick a box and press OPEN BOX again.");
            return;
          }
          setUiState(verified.readResult.state);
          setErrorMessage(verified.readResult.message);
          return;
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
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick submission unavailable."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "choice_already_submitted") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (!readResult?.ok) {
          recoverStaleRound(readResult.message || "Session no longer available.");
          return;
        }
        const rss = String(readResult.readStatus || "");
        const rs = String(readResult.session?.readState || "");
        const st = String(readResult.session?.sessionStatus || "");

        if (sessionTruthIsDead(readResult.session, rss)) {
          recoverStaleRound(
            st === "expired"
              ? "Session expired. Pick a box and press OPEN BOX."
              : "Session ended. Pick a box and press OPEN BOX.",
          );
          return;
        }

        if (st === "resolved" || rs === "resolved") {
          applySessionReadState(readResult.session, { resumed: true });
          return;
        }

        if (
          (rss === "choice_submitted" || rs === "choice_submitted") &&
          hasPersistedMysteryPick(readResult.session)
        ) {
          applySessionReadState(readResult.session, { resumed: true });
          setSessionNotice("Pick already locked on server. Resolving.");
          await handleResolveSession({ sessionIdOverride: readResult.session.id });
          return;
        }

        recoverStaleRound("Session state mismatch. Pick a box and press OPEN BOX again.");
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "invalid_session_state") {
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted) return;
        if (readResult?.ok) {
          const rss = String(readResult.readStatus || "");
          const rs = String(readResult.session?.readState || "");
          const st = String(readResult.session?.sessionStatus || "");

          if (sessionTruthIsDead(readResult.session, rss)) {
            recoverStaleRound(
              st === "expired"
                ? "Session expired. Pick a box and press OPEN BOX."
                : "Session ended. Pick a box and press OPEN BOX.",
            );
            return;
          }

          applySessionReadState(readResult.session, { resumed: true });

          if (st === "resolved" || rs === "resolved") {
            return;
          }

          if (
            (rss === "choice_submitted" || rs === "choice_submitted") &&
            hasPersistedMysteryPick(readResult.session)
          ) {
            setSessionNotice("Session already has a pick. Opening now.");
            await handleResolveSession({ sessionIdOverride: readResult.session.id });
          }
          return;
        }
        recoverStaleRound(buildSoloV2ApiErrorMessage(payload, "Session no longer accepts picks."));
        return;
      }

      if (result === SOLO_V2_API_RESULT.CONFLICT && status === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          recoverStaleRound(msg || "Session expired. Pick a box and press OPEN BOX.");
          return;
        }
        setUiState(UI_STATE.UNAVAILABLE);
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick submission rejected."));
        return;
      }

      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick submission rejected."));
    } catch (_error) {
      if (activeCycle !== cycleRef.current) return;
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Network error while submitting pick.");
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
    const box = selectedBox;
    if (box !== 0 && box !== 1 && box !== 2) {
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }

    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < MYSTERY_BOX_MIN_WAGER) return;
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
        const boot = await bootstrapMysteryBoxSession(wager, activeCycle, box, createSessionMode, {
          isGiftRound,
          onGiftConsumed: () => giftRefreshRef.current?.(),
        });
        if (!boot.ok || activeCycle !== cycleRef.current) return;
        if (boot.alreadyTerminal) return;
        sessionId = boot.session?.id;
        readStateKnown = String(boot.session?.readState || "");
      } else if (sessionId) {
        const truth = await readSessionTruth(sessionId, activeCycle);
        if (truth?.halted) return;
        if (!truth?.ok) {
          recoverStaleRound(truth.message || "Session no longer available.");
          return;
        }
        if (sessionTruthIsDead(truth.session, truth.readStatus)) {
          recoverStaleRound(
            String(truth.session?.sessionStatus || "") === "expired"
              ? "Session expired. Pick a box and press OPEN BOX."
              : "Session ended. Pick a box and press OPEN BOX.",
          );
          return;
        }

        const trs = String(truth.session?.readState || "");
        const tst = String(truth.session?.sessionStatus || "");
        if (trs === "resolved" || tst === "resolved") {
          applySessionReadState(truth.session, { resumed: true, localChoiceToKeep: box });
          return;
        }

        applySessionReadState(truth.session, { resumed: true, localChoiceToKeep: box });
        sessionId = truth.session?.id;
        readStateKnown = String(truth.session?.readState || "");
      }

      if (!sessionId || activeCycle !== cycleRef.current) return;

      if (readStateKnown === "choice_submitted") {
        const verified = await verifyMysteryPickPersisted(sessionId, activeCycle);
        if (verified?.halted) return;
        if (verified?.ok) {
          await handleResolveSession({ sessionIdOverride: sessionId });
          return;
        }
        if (verified?.missingPick) {
          recoverStaleRound("Pick did not persist. Pick a box and press OPEN BOX again.");
          return;
        }
        setUiState(verified.readResult.state);
        setErrorMessage(verified.readResult.message);
        return;
      }

      await submitPickAndResolveFlow(sessionId, box, activeCycle);
    } finally {
      if (isGiftRound) {
        giftRoundRef.current = false;
      }
    }
  }

  function handleSelectBox(index) {
    if (
      uiState === UI_STATE.LOADING ||
      uiState === UI_STATE.SUBMITTING_CHOICE ||
      uiState === UI_STATE.CHOICE_SUBMITTED ||
      uiState === UI_STATE.RESOLVING
    ) {
      return;
    }
    setSelectedBox(index);
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
      const response = await fetch("/api/solo-v2/mystery-box/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-solo-v2-player": SOLO_V2_PLAYER,
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
  const hasValidBox = selectedBox === 0 || selectedBox === 1 || selectedBox === 2;
  const wagerPlayable =
    vaultReady && numericWager >= MYSTERY_BOX_MIN_WAGER && vaultBalance >= numericWager;

  useEffect(() => {
    if (!wagerPlayable) return;
    setErrorMessage(prev => {
      const s = String(prev || "");
      if (
        /Session expired\. Pick a box|Session ended\. Pick a box|no longer valid\. Pick a box/i.test(s)
      ) {
        return "";
      }
      return s;
    });
  }, [wagerPlayable]);

  const canOpenBox =
    wagerPlayable &&
    hasValidBox &&
    ![
      UI_STATE.LOADING,
      UI_STATE.SUBMITTING_CHOICE,
      UI_STATE.CHOICE_SUBMITTED,
      UI_STATE.RESOLVING,
      UI_STATE.PENDING_MIGRATION,
    ].includes(uiState);

  const isPrimaryLoading =
    uiState === UI_STATE.LOADING || uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;

  const primaryActionLabel = hasValidBox ? "OPEN BOX" : "Choose a box";

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
    if (canOpenBox) {
      void runOneClickRound();
    }
  }

  const isOpening = uiState === UI_STATE.SUBMITTING_CHOICE || uiState === UI_STATE.RESOLVING;
  const potentialWin = Math.floor(numericWager * MYSTERY_BOX_WIN_MULTIPLIER);

  const winningBoxResolved =
    uiState === UI_STATE.RESOLVED && resolvedResult?.outcome !== null && resolvedResult?.outcome !== undefined
      ? Number(resolvedResult.outcome)
      : null;

  const handleGiftPlay = useCallback(() => {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (!hasValidBox) {
      setErrorMessage("Choose a box to play a gift round.");
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
  }, [vaultReady, hasValidBox, giftShell.giftCount, uiState]);

  return (
    <SoloV2GameShell
      title="Mystery Box"
      subtitle="Arcade Solo"
      gameplayScrollable={false}
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
            Play <span className="font-semibold tabular-nums text-amber-200/90">{formatCompact(numericWager)}</span>
          </span>
          <span className="shrink-0 text-zinc-600" aria-hidden>
            ·
          </span>
          <span className="shrink-0 whitespace-nowrap text-zinc-500">
            Win <span className="font-semibold tabular-nums text-lime-200/90">{formatCompact(potentialWin)}</span>
          </span>
        </>
      }
      soloV2Footer={{
        betPresets: BET_PRESETS,
        wagerInput,
        wagerNumeric: numericWager,
        canEditPlay: !isOpening,
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            const next = Math.min(MAX_WAGER, Math.max(0, c - MYSTERY_BOX_MIN_WAGER));
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
          setWagerInput(String(MYSTERY_BOX_MIN_WAGER));
        },
        primaryActionLabel,
        primaryActionDisabled: !canOpenBox,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "OPENING...",
        onPrimaryAction: handlePrimaryCta,
        errorMessage,
      }}
      gameplaySlot={
        <MysteryBoxGameplayPanel
          uiState={uiState}
          selectedBox={selectedBox}
          isOpening={isOpening}
          resultToast={resultToast}
          onSelectBox={handleSelectBox}
          winningBoxIndex={Number.isFinite(winningBoxResolved) ? winningBoxResolved : null}
          pickedBoxIndex={
            resolvedResult?.choice !== null && resolvedResult?.choice !== undefined
              ? resolvedResult.choice
              : selectedBox
          }
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>1. Tap a box (A, B, or C).</p>
          <p>2. Set your play amount and press OPEN BOX.</p>
          <p>3. The server picks the winning box. If it matches your pick, you win.</p>
          <p>Win pays about ×2.88 on your play (three boxes, ~96% RTP target).</p>
          <p>Vault updates after the server result, same shared vault as other Solo V2 games.</p>
        </div>
      }
      statsContent={
        <div className="space-y-2">
          <p>Total games: {stats.totalGames}</p>
          <p>Win rate: {stats.totalGames ? ((stats.wins / stats.totalGames) * 100).toFixed(1) : "0.0"}%</p>
          <p>Total play: {formatCompact(stats.totalPlay)}</p>
          <p>Total won: {formatCompact(stats.totalWon)}</p>
          <p>Biggest win: {formatCompact(stats.biggestWin)}</p>
          <p>Net profit: {formatCompact(stats.totalWon - stats.totalPlay)}</p>
        </div>
      }
      resultState={null}
    />
  );
}
