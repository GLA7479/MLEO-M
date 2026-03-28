import { useEffect, useRef, useState } from "react";
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

const BET_PRESETS = [25, 100, 1000, 10000];
const MAX_WAGER = 1_000_000_000;

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function TreasureDoorsGameplayPanel({
  session,
  uiState,
  pulseCell,
  shakeCell,
  onPickDoor,
  canCashOut,
  cashOutLoading,
  onCashOut,
  sessionNotice,
  resultPopupOpen,
  resolvedIsWin,
  resultTitle,
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

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden px-2 pt-1 text-center sm:max-w-lg">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="h-12 shrink-0 px-1">
          <p className="line-clamp-2 text-[11px] leading-snug text-zinc-400">{sessionNotice || "\u00a0"}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-1">
          <TreasureDoorsBoard
            chamberCount={chamberCount}
            doorCount={doorCount}
            currentChamberIndex={currentChamberIndex}
            doorHistory={doorHistory}
            trapDoors={trapDoors}
            revealTraps={revealTraps}
            disabled={!canPick}
            pulseCell={pulseCell}
            shakeCell={shakeCell}
            onPickDoor={onPickDoor}
          />
        </div>
        <div className="h-11 shrink-0 sm:mt-3">
          <button
            type="button"
            disabled={!canCashOut || cashOutLoading || busy || isTerminal}
            onClick={onCashOut}
            className={`w-full rounded-lg border px-3 py-2 text-xs font-extrabold uppercase tracking-wide ${
              !canCashOut || cashOutLoading || busy || isTerminal
                ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
                : "border-teal-400/45 bg-teal-900/35 text-teal-100 hover:bg-teal-800/40"
            }`}
          >
            {cashOutLoading ? "Cashing out…" : "Cash out (secured)"}
          </button>
        </div>
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
    applyTreasureDoorsSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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
    createInFlightRef.current = false;
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setResultPopupOpen(false);
    setSession(null);
    setResolvedResult(null);
    setUiState(UI_STATE.IDLE);
    setSessionNotice("");
    setPulseCell(null);
    setShakeCell(null);
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
      setSessionNotice(resumed ? "Resumed finished run." : "Run finished.");
      setErrorMessage("");
      return;
    }

    if (readState === "pick_conflict") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Session conflict on picks. Refreshing…");
      return;
    }

    if (readState === "choice_submitted") {
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Pick locked — resolving." : "Resolving your door…");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Resumed active run." : "Pick a door in the current chamber.");
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
      if (halted) return;
      const status = String(payload?.status || "");
      const result = classifySoloV2ApiResult(response, payload);

      if (result === SOLO_V2_API_RESULT.SUCCESS && status === "turn_complete" && payload?.result) {
        const r = payload.result;
        setPulseCell({ chamberIndex: r.chamberIndex, door: r.door });
        window.setTimeout(() => setPulseCell(null), 650);
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.halted || !readResult?.ok) {
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
          sessionId: r.sessionId || sid,
          settlementSummary: r.settlementSummary || payload?.result?.settlementSummary,
        });
        setUiState(UI_STATE.RESOLVED);
        openResultPopup();
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      const readResult = await readSessionTruth(sessionId, activeCycle);
      if (readResult?.ok && readResult.session) {
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
      } else {
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
    submitInFlightRef.current = true;
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

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Pick failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setErrorMessage("Network error while submitting pick.");
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function handleCashOut() {
    const sid = session?.id;
    if (!sid || cashOutLoading || resolveInFlightRef.current) return;
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
        setResolvedResult({ ...payload.result, sessionId: sid });
        setUiState(UI_STATE.RESOLVED);
        openResultPopup();
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
    uiState === UI_STATE.PENDING_MIGRATION;
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
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  const td = session?.treasureDoors;
  const playing = td?.playing;

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

  const terminalKind = resolvedResult?.terminalKind;
  let resultTitle = "Run complete";
  if (terminalKind === "trap") resultTitle = "Trap — run lost";
  else if (terminalKind === "full_clear") resultTitle = "All chambers — top win!";
  else if (terminalKind === "cashout") resultTitle = "Cashed out";

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

  return (
    <SoloV2GameShell
      title="Treasure Doors"
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
            Play <span className="font-semibold tabular-nums text-amber-200/90">{formatCompact(summaryPlay)}</span>
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
      gameplaySlot={
        <TreasureDoorsGameplayPanel
          session={session}
          uiState={uiState}
          pulseCell={pulseCell}
          shakeCell={shakeCell}
          onPickDoor={handlePickDoor}
          canCashOut={Boolean(td?.canCashOut)}
          cashOutLoading={cashOutLoading}
          onCashOut={() => void handleCashOut()}
          sessionNotice={sessionNotice}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          resultTitle={resultTitle}
          resultVaultLabel={resultVaultLabel}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>Five chambers, three doors each — one trap per chamber. Pick one door per chamber.</p>
          <p>Safe picks advance and raise the secured multiplier; a trap ends the run. Clear all five for the top payout.</p>
          <p>Cash out is a server action on your current secured payout.</p>
        </div>
      }
      resultState={null}
    />
  );
}
