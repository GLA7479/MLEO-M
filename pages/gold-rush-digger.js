import { useEffect, useRef, useState } from "react";
import GoldRushDiggerBoard from "../components/solo-v2/GoldRushDiggerBoard";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
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
import { GOLD_RUSH_DIGGER_MIN_WAGER } from "../lib/solo-v2/goldRushDiggerConfig";
import {
  applyGoldRushDiggerSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "gold_rush_digger";
const PLAYER_HEADER = "gold-rush-digger-client";

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

function GoldRushGameplayPanel({
  session,
  uiState,
  pulseCell,
  shakeCell,
  onDigColumn,
  canCashOut,
  cashOutLoading,
  onCashOut,
  sessionNotice,
  resultPopupOpen,
  resolvedIsWin,
  resultTitle,
  resultVaultLabel,
}) {
  const gr = session?.goldRushDigger;
  const playing = gr?.playing;
  const rr = gr?.resolvedResult;
  const isTerminal = Boolean(rr) || session?.sessionStatus === "resolved";
  const revealBombs = isTerminal && Array.isArray(rr?.bombColumns);
  const bombColumns = revealBombs ? rr.bombColumns : null;
  const digHistory = isTerminal ? rr?.digHistory || [] : playing?.digHistory || [];
  const rowCount = Math.floor(Number(playing?.rowCount ?? 6)) || 6;
  const columnCount = Math.floor(Number(playing?.columnCount ?? 3)) || 3;

  const busy =
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  const canDig =
    !busy &&
    !isTerminal &&
    gr?.readState === "choice_required" &&
    uiState === UI_STATE.SESSION_ACTIVE;

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden px-2 pt-1 text-center sm:max-w-lg">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="h-12 shrink-0 px-1">
          <p className="line-clamp-2 text-[11px] leading-snug text-zinc-400">{sessionNotice || "\u00a0"}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-1">
          <GoldRushDiggerBoard
            rowCount={rowCount}
            columnCount={columnCount}
            currentRowIndex={isTerminal ? rowCount : Math.floor(Number(playing?.currentRowIndex ?? 0))}
            digHistory={digHistory}
            bombColumns={bombColumns}
            revealBombs={revealBombs}
            disabled={!canDig}
            pulseCell={pulseCell}
            shakeCell={shakeCell}
            onDigColumn={onDigColumn}
          />
        </div>
        <div className="h-11 shrink-0">
          <button
            type="button"
            disabled={!canCashOut || cashOutLoading || busy || isTerminal}
            onClick={onCashOut}
            className={`w-full rounded-lg border px-3 py-2 text-xs font-extrabold uppercase tracking-wide ${
              !canCashOut || cashOutLoading || busy || isTerminal
                ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
                : "border-amber-400/45 bg-amber-900/35 text-amber-100 hover:bg-amber-800/40"
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

export default function GoldRushDiggerPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(GOLD_RUSH_DIGGER_MIN_WAGER));
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

  const giftShell = useSoloV2GiftShellState();

  useEffect(() => {
    giftRefreshRef.current = giftShell.refresh;
  }, [giftShell.refresh]);

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
    applyGoldRushDiggerSettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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

  function openResultPopup() {
    setResultPopupOpen(true);
    const t = window.setTimeout(() => setResultPopupOpen(false), 2200);
    return () => window.clearTimeout(t);
  }

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const gr = sessionPayload?.goldRushDigger;
    const readState = String(gr?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && gr?.resolvedResult) {
      setResolvedResult({
        ...gr.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: gr.resolvedResult.settlementSummary,
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
      setSessionNotice(resumed ? "Pick locked — resolving." : "Resolving your dig…");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required" || readState === "ready") {
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Resumed active run." : "Pick a spot on the current row.");
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
    const response = await fetch("/api/solo-v2/gold-rush-digger/resolve", {
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
        setPulseCell({ rowIndex: r.rowIndex, column: r.column });
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
        if (r.terminalKind === "bomb") {
          setShakeCell({ rowIndex: r.finalRowIndex ?? r.rowIndex, column: r.lastPickColumn ?? r.column });
          window.setTimeout(() => setShakeCell(null), 900);
        }
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        setResolvedResult(r);
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

  async function handleDigColumn(col) {
      const sid = sessionRef.current?.id;
      const playing = sessionRef.current?.goldRushDigger?.playing;
      const row = playing?.currentRowIndex;
      if (sid == null || !Number.isFinite(Number(row)) || !Number.isFinite(Number(col))) return;
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
              action: "gold_rush_pick",
              gameKey: GAME_KEY,
              rowIndex: row,
              column: col,
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
        setResolvedResult(payload.result);
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
    if (!isGiftRound && wager < GOLD_RUSH_DIGGER_MIN_WAGER) return;
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
    const gr = boot.session?.goldRushDigger;
    if (gr?.readState === "choice_submitted") {
      await handleResolveAfterPick(boot.session.id, activeCycle);
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const gr = session?.goldRushDigger;
    if (!sid || !gr || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (gr.readState !== "choice_submitted" || !gr.canResolveTurn) return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolveAfterPick(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional resume-only resolve
  }, [session?.id, session?.goldRushDigger?.readState, session?.goldRushDigger?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= GOLD_RUSH_DIGGER_MIN_WAGER && vaultBalance >= numericWager;

  const canStart =
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(
      uiState,
    ) &&
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE || uiState === UI_STATE.RESOLVED);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  const gr = session?.goldRushDigger;
  const playing = gr?.playing;
  const nextMult = playing?.nextMultiplier;
  const nextPay = playing?.nextPayout;

  const terminalKind = resolvedResult?.terminalKind;
  let resultTitle = "Run complete";
  if (terminalKind === "bomb") resultTitle = "Bomb — run lost";
  else if (terminalKind === "full_clear") resultTitle = "Full clear — top win!";
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

  return (
    <SoloV2GameShell
      title="Gold Rush Digger"
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
        playing && uiState !== UI_STATE.RESOLVED ? (
          <>
            <span className="shrink-0 whitespace-nowrap text-zinc-500">
              Next{" "}
              <span className="font-semibold tabular-nums text-amber-200/90">
                {nextMult != null ? `${nextMult}x` : "—"}
              </span>
            </span>
            <span className="shrink-0 text-zinc-600" aria-hidden>
              ·
            </span>
            <span className="shrink-0 whitespace-nowrap text-zinc-500">
              Pay{" "}
              <span className="font-semibold tabular-nums text-lime-200/90">
                {nextPay != null ? formatCompact(nextPay) : "—"}
              </span>
            </span>
          </>
        ) : null
      }
      soloV2Footer={{
        betPresets: BET_PRESETS,
        wagerInput,
        wagerNumeric: numericWager,
        canEditPlay: uiState !== UI_STATE.RESOLVING && uiState !== UI_STATE.SUBMITTING_PICK && canStart,
        onPresetAmount: handlePresetClick,
        onDecreaseAmount: () => {
          clearPresetChain();
          setWagerInput(prev => {
            const c = parseWagerInput(prev);
            return String(Math.min(MAX_WAGER, Math.max(0, c - GOLD_RUSH_DIGGER_MIN_WAGER)));
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
          setWagerInput(String(GOLD_RUSH_DIGGER_MIN_WAGER));
        },
        primaryActionLabel: uiState === UI_STATE.RESOLVED ? "PLAY AGAIN" : "START RUN",
        primaryActionDisabled: !canStart && uiState !== UI_STATE.RESOLVED,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => {
          if (uiState === UI_STATE.RESOLVED) {
            setSession(null);
            setResolvedResult(null);
            setUiState(UI_STATE.IDLE);
            setSessionNotice("");
            setErrorMessage("");
            return;
          }
          void runStartRun();
        },
        errorMessage,
      }}
      gameplaySlot={
        <GoldRushGameplayPanel
          session={session}
          uiState={uiState}
          pulseCell={pulseCell}
          shakeCell={shakeCell}
          onDigColumn={handleDigColumn}
          canCashOut={Boolean(gr?.canCashOut)}
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
          <p>Six rows, three spots each — one bomb per row. Dig one spot per row.</p>
          <p>Safe digs advance the ladder; a bomb ends the run. Clear row six for the top multiplier.</p>
          <p>Cash out is server-authoritative on your secured payout.</p>
        </div>
      }
      resultState={null}
    />
  );
}
