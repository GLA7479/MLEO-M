import { useEffect, useRef, useState } from "react";
import MysteryChamberBoard from "../components/solo-v2/MysteryChamberBoard";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
  SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS,
} from "../components/solo-v2/SoloV2ResultPopup";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import {
  MYSTERY_CHAMBER_CHAMBER_COUNT,
  MYSTERY_CHAMBER_MIN_WAGER,
  MYSTERY_CHAMBER_SAFE_COUNT_BY_STEP,
  MYSTERY_CHAMBER_SIGIL_GLYPHS,
  mysteryChamberMaxPotentialReturn,
  mysteryChamberStartingSecured,
  normalizeMysteryChamberVaultSettlement,
} from "../lib/solo-v2/mysteryChamberConfig";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import { SOLO_V2_GIFT_ROUND_STAKE, soloV2GiftConsumeOne } from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import {
  applyMysteryChamberSettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";
import {
  averageChamberReached,
  chamberClearRatePercent,
  loadMysteryChamberPickDedupe,
  mysteryChamberTerminalAlreadyRecorded,
  readMysteryChamberStats,
  recordMysteryChamberTerminal,
  recordMysteryChamberTurnComplete,
  rememberMysteryChamberPickDedupe,
  rememberMysteryChamberTerminal,
  runsWithReturn,
  totalSuccessfulSafePicks,
  writeMysteryChamberStats,
} from "../lib/solo-v2/mysteryChamberLocalStats";

const GAME_KEY = "mystery_chamber";
const PLAYER_HEADER = "mystery-chamber-client";

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
const REVEAL_READABLE_MS = 620;
const SUCCESS_ANIM_CLEAR_MS = 400;
/** After a safe chamber, hold the chosen sigil highlighted and block new picks until the next chamber is obvious. */
const CHAMBER_INTERSTITIAL_MS = 720;

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function defaultVisuals() {
  return ["idle", "idle", "idle", "idle"];
}

function mergeMysteryChamberSafeIndices(...lists) {
  const s = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      const n = Math.floor(Number(x));
      if (n >= 0 && n <= 3) s.add(n);
    }
  }
  return [...s].sort((a, b) => a - b);
}

function safeSigilRowFromResultGrid(r) {
  const fi = r.finalChamberIndex ?? r.chamberIndex;
  if (!Array.isArray(r?.safeSigilSets) || r.safeSigilSets.length !== MYSTERY_CHAMBER_CHAMBER_COUNT) {
    return [];
  }
  if (fi == null) return [];
  const idx = Math.floor(Number(fi));
  if (!Number.isFinite(idx) || idx < 0 || idx >= MYSTERY_CHAMBER_CHAMBER_COUNT) return [];
  const row = r.safeSigilSets[idx];
  if (!Array.isArray(row)) return [];
  return row.map(x => Math.floor(Number(x))).filter(n => n >= 0 && n <= 3);
}

/** Full safe set for the failing step: union server reveal + grid row (authoritative for all greens). */
function safeSigilSetFromApiResult(r) {
  const a =
    Array.isArray(r?.safeSigilSet) && r.safeSigilSet.length
      ? r.safeSigilSet.map(x => Math.floor(Number(x))).filter(n => n >= 0 && n <= 3)
      : [];
  const b =
    Array.isArray(r?.safeSigilSetRevealed) && r.safeSigilSetRevealed.length
      ? r.safeSigilSetRevealed.map(x => Math.floor(Number(x))).filter(n => n >= 0 && n <= 3)
      : [];
  const c = safeSigilRowFromResultGrid(r);
  const merged = mergeMysteryChamberSafeIndices(a, b, c);
  if (merged.length) return merged;
  if (r?.safeSigil != null) {
    const x = Math.floor(Number(r.safeSigil));
    return x >= 0 && x <= 3 ? [x] : [];
  }
  return [];
}

function mysteryChamberChosenSigilFromResult(r) {
  const raw = r.chosenSigil ?? r.lastChosenSigil;
  if (raw == null) return null;
  const c = Math.floor(Number(raw));
  return c >= 0 && c <= 3 ? c : null;
}

/**
 * Fail reveal greens (server safe list is full truth for the step; count follows chamber depth).
 * Chamber 1: all tiles except wrong (3 green). Chamber 2: both server safes. Chamber 3: one green.
 * Chamber 4: server safe(s). Wrong pick stays red (painted after greens).
 */
function mysteryChamberFailRevealGreenIndices(finalChamberIndex, chosenWrong, serverSafeFull) {
  const safes = mergeMysteryChamberSafeIndices(serverSafeFull);
  const fi = Math.floor(Number(finalChamberIndex));
  const w = chosenWrong;
  if (!Number.isFinite(fi) || fi < 0 || fi > 3) {
    return safes;
  }
  if (fi === 0 && Number.isFinite(w) && w >= 0 && w <= 3) {
    return [0, 1, 2, 3].filter(i => i !== w);
  }
  if (fi === 1) {
    return safes;
  }
  if (fi === 2) {
    if (safes.length <= 1) return safes;
    return [safes[0]];
  }
  return safes;
}

function visualsFromPersistedBoard(pb) {
  const v = defaultVisuals();
  if (!pb || !pb.terminalKind) return v;
  if (pb.terminalKind === "fail") {
    const fullSafe = safeSigilSetFromApiResult(pb);
    const fi = pb.finalChamberIndex != null ? Math.floor(Number(pb.finalChamberIndex)) : 0;
    const chosen = mysteryChamberChosenSigilFromResult(pb);
    const w = chosen != null ? chosen : -1;
    const greens = mysteryChamberFailRevealGreenIndices(
      Number.isFinite(fi) ? fi : 0,
      w,
      fullSafe,
    );
    for (const si of greens) {
      if (si >= 0 && si <= 3) v[si] = "safe";
    }
    if (chosen != null) v[chosen] = "fail";
    for (let i = 0; i < 4; i += 1) {
      if (v[i] === "idle") v[i] = "muted";
    }
    return v;
  }
  if (pb.terminalKind === "full_clear") {
    const c = Math.floor(Number(pb.chosenSigil));
    if (c >= 0 && c <= 3) {
      v[c] = "safe";
      for (let i = 0; i < 4; i += 1) if (i !== c) v[i] = "muted";
    }
    return v;
  }
  if (pb.terminalKind === "cashout") {
    return ["muted", "muted", "muted", "muted"];
  }
  return v;
}

function withNormalizedMysterySettlement(resultLike, sessionMode) {
  if (!resultLike?.settlementSummary) return resultLike;
  return {
    ...resultLike,
    settlementSummary: normalizeMysteryChamberVaultSettlement(resultLike.settlementSummary, sessionMode),
  };
}

function visualsFromLocalAnim(anim) {
  const v = defaultVisuals();
  if (!anim) return v;
  if (anim.phase === "success") {
    const c = Math.floor(Number(anim.chosen));
    if (!Number.isFinite(c) || c < 0 || c > 3) return v;
    v[c] = "pending";
    for (let i = 0; i < 4; i += 1) if (i !== c) v[i] = "muted";
    return v;
  }
  if (anim.phase === "fail") {
    const fullSafe = Array.isArray(anim.safeSet)
      ? anim.safeSet.map(x => Math.floor(Number(x))).filter(n => n >= 0 && n <= 3)
      : anim.safe != null
        ? [Math.floor(Number(anim.safe))].filter(n => n >= 0 && n <= 3)
        : [];
    const fiRaw = anim.failChamberIndex;
    const fi = fiRaw != null ? Math.floor(Number(fiRaw)) : 0;
    const chosenRaw = anim.chosen;
    const w =
      chosenRaw != null && chosenRaw !== ""
        ? Math.floor(Number(chosenRaw))
        : Number.NaN;
    const greens = mysteryChamberFailRevealGreenIndices(
      Number.isFinite(fi) ? fi : 0,
      Number.isFinite(w) && w >= 0 && w <= 3 ? w : -1,
      fullSafe,
    );
    for (const si of greens) {
      if (si >= 0 && si <= 3) v[si] = "safe";
    }
    if (Number.isFinite(w) && w >= 0 && w <= 3) v[w] = "fail";
    for (let i = 0; i < 4; i += 1) {
      if (v[i] === "idle") v[i] = "muted";
    }
    return v;
  }
  return v;
}

function MysteryChamberGameplayPanel({
  sessionNotice,
  statusTop,
  statusSub,
  playing,
  sigilVisuals,
  sigilPickDisabled,
  onSigilPick,
  hintLine,
  exitVisible,
  exitDisabled,
  onExitNow,
  revealPulse,
  resultPopupOpen,
  resolvedIsWin,
  popupTitle,
  popupLine2,
  popupLine3,
  resultVaultLabel,
  securedCaption = "",
}) {
  const ch = playing?.chamberCount ?? MYSTERY_CHAMBER_CHAMBER_COUNT;
  const cur = Math.max(0, Math.floor(Number(playing?.currentChamberIndex) || 0));
  const cleared = Math.max(0, Math.floor(Number(playing?.chambersCleared) || 0));
  const sec = playing?.securedReturn != null ? Math.floor(Number(playing.securedReturn)) : 0;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-0 text-center sm:px-2 sm:pt-1">
      <div className="flex min-h-0 flex-1 flex-col">
        <MysteryChamberBoard
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          chamberTotal={ch}
          currentChamberIndex={cur}
          chambersCleared={cleared}
          securedReturnLabel={formatCompact(sec)}
          securedCaption={securedCaption}
          sigilVisuals={sigilVisuals}
          sigilPickDisabled={sigilPickDisabled}
          onSigilPick={onSigilPick}
          hintLine={hintLine}
          exitVisible={exitVisible}
          exitDisabled={exitDisabled}
          onExitNow={onExitNow}
          revealPulse={revealPulse}
        />
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        resultTone={resolvedIsWin ? "win" : "lose"}
        animationKey={`${popupLine2}-${popupLine3}-${resultVaultLabel}`}
        vaultSlot={
          resultPopupOpen ? (
            <SoloV2ResultPopupVaultLine isWin={resolvedIsWin} tone={resolvedIsWin ? "win" : "lose"} deltaLabel={resultVaultLabel} />
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

export default function MysteryChamberPage() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(MYSTERY_CHAMBER_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [inMysteryLoop, setInMysteryLoop] = useState(false);
  const [persistedBoard, setPersistedBoard] = useState(null);
  const [localAnim, setLocalAnim] = useState(null);
  const [interstitialSafeSigil, setInterstitialSafeSigil] = useState(null);
  const [revealPulse, setRevealPulse] = useState(false);
  const [mcLocalStats, setMcLocalStats] = useState(() => readMysteryChamberStats());

  const inMysteryLoopRef = useRef(false);
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
  const localAnimTimerRef = useRef(null);
  const postSuccessInterstitialTimerRef = useRef(null);
  const interstitialSafeSigilRef = useRef(null);

  const giftShell = useSoloV2GiftShellState();

  useEffect(() => {
    giftRefreshRef.current = giftShell.refresh;
  }, [giftShell.refresh]);

  useEffect(() => {
    return () => {
      if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
      if (localAnimTimerRef.current) clearTimeout(localAnimTimerRef.current);
      if (postSuccessInterstitialTimerRef.current) clearTimeout(postSuccessInterstitialTimerRef.current);
    };
  }, []);

  useEffect(() => {
    interstitialSafeSigilRef.current = null;
    setInterstitialSafeSigil(null);
    if (postSuccessInterstitialTimerRef.current) {
      clearTimeout(postSuccessInterstitialTimerRef.current);
      postSuccessInterstitialTimerRef.current = null;
    }
  }, [session?.id]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    inMysteryLoopRef.current = inMysteryLoop;
  }, [inMysteryLoop]);

  useEffect(() => {
    wagerInputRef.current = wagerInput;
  }, [wagerInput]);

  useEffect(() => {
    vaultBalanceRef.current = vaultBalance;
  }, [vaultBalance]);

  useEffect(() => {
    writeMysteryChamberStats(mcLocalStats);
  }, [mcLocalStats]);

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
    const normalized = normalizeMysteryChamberVaultSettlement(
      settlementSummary,
      session?.sessionMode ?? sessionRef.current?.sessionMode,
    );
    applyMysteryChamberSettlementOnce(sessionId, normalized).then(settlementResult => {
      if (!settlementResult) return;
      if (settlementResult.error) {
        setErrorMessage(settlementResult.error);
        return;
      }
      const delta = Number(normalized.netDelta || 0);
      if (settlementResult.applied && delta !== 0) {
        const sign = delta > 0 ? "+" : "";
        setSessionNotice(`Vault ${sign}${formatCompact(delta)}`);
      }
    });
  }, [resolvedResult?.sessionId, resolvedResult?.settlementSummary, session?.id, session?.sessionMode]);

  function openResultPopup() {
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(true);
    resultPopupTimerRef.current = window.setTimeout(() => {
      resultPopupTimerRef.current = null;
      dismissResultPopupAfterTerminalRun();
    }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
  }

  /** After a terminal run, close popup only — keep resolved board; next run starts only on START. */
  function dismissResultPopupAfterTerminalRun() {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setResultPopupOpen(false);
    setInMysteryLoop(false);
    setLocalAnim(null);
    setRevealPulse(false);
  }

  function applySessionReadState(sessionPayload, { resumed = false } = {}) {
    const mc = sessionPayload?.mysteryChamber;
    const readState = String(mc?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && mc?.resolvedResult) {
      setInMysteryLoop(false);
      setResolvedResult(
        withNormalizedMysterySettlement(
          {
            ...mc.resolvedResult,
            sessionId: sessionPayload.id,
            settlementSummary: mc.resolvedResult.settlementSummary,
          },
          sessionPayload.sessionMode,
        ),
      );
      setUiState(UI_STATE.RESOLVED);
      setSessionNotice(resumed ? "Run finished (restored)." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "pick_conflict") {
      setInMysteryLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting picks — refresh and try again.");
      return;
    }

    if (readState === "choice_submitted") {
      setInMysteryLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Resolving…" : "Resolving…");
      setErrorMessage("");
      return;
    }

    if (readState === "choice_required") {
      setInMysteryLoop(true);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setPersistedBoard(null);
      setLocalAnim(null);
      setSessionNotice(resumed ? "Session restored." : "");
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInMysteryLoop(false);
      setSession(null);
      setResolvedResult(null);
      setPersistedBoard(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(st === "expired" ? "Session expired." : "Session ended.");
      return;
    }

    setInMysteryLoop(false);
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
    const preserveBoard = Boolean(giftRoundMeta?.preserveBoardAfterRound);
    createInFlightRef.current = true;
    setUiState(UI_STATE.LOADING);
    setErrorMessage("");
    setSession(null);
    setResolvedResult(null);
    if (!preserveBoard) {
      setPersistedBoard(null);
      setLocalAnim(null);
    }

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
        const readResult = await readSessionTruth(payload.session.id, activeCycle);
        if (readResult?.halted) return { ok: false };
        if (!readResult?.ok) {
          setUiState(readResult.state);
          setErrorMessage(readResult.message);
          return { ok: false };
        }
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
    const response = await fetch("/api/solo-v2/mystery-chamber/resolve", {
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

  function schedulePostSuccessChamberSequence(chosenSigilRaw) {
    const c = Math.floor(Number(chosenSigilRaw));
    const chosenOk = Number.isFinite(c) && c >= 0 && c <= 3;

    if (localAnimTimerRef.current) clearTimeout(localAnimTimerRef.current);
    if (postSuccessInterstitialTimerRef.current) clearTimeout(postSuccessInterstitialTimerRef.current);

    localAnimTimerRef.current = window.setTimeout(() => {
      localAnimTimerRef.current = null;
      setLocalAnim(null);
      setRevealPulse(false);
      if (!chosenOk) {
        return;
      }
      interstitialSafeSigilRef.current = c;
      setInterstitialSafeSigil(c);
      postSuccessInterstitialTimerRef.current = window.setTimeout(() => {
        postSuccessInterstitialTimerRef.current = null;
        interstitialSafeSigilRef.current = null;
        setInterstitialSafeSigil(null);
      }, CHAMBER_INTERSTITIAL_MS);
    }, SUCCESS_ANIM_CLEAR_MS);
  }

  async function handleResolvePick(sessionId, activeCycle) {
    if (resolveInFlightRef.current) return;
    resolveInFlightRef.current = true;
    setUiState(UI_STATE.RESOLVING);
    setRevealPulse(true);
    try {
      const { response, payload, halted } = await postResolve(sessionId, {}, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const api = classifySoloV2ApiResult(response, payload);

      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "turn_complete" && payload?.result) {
        const r = payload.result;
        const peid = Number(r.pickEventId);
        if (
          Number.isFinite(peid) &&
          peid > 0 &&
          r.chamberIndex != null &&
          r.sigilIndex != null &&
          !loadMysteryChamberPickDedupe(sessionId).has(peid)
        ) {
          rememberMysteryChamberPickDedupe(sessionId, peid);
          setMcLocalStats(prev =>
            recordMysteryChamberTurnComplete(prev, {
              chamberIndex: r.chamberIndex,
              sigilIndex: r.sigilIndex,
            }),
          );
        }
        setLocalAnim({ chosen: r.sigilIndex, phase: "success" });
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        setUiState(UI_STATE.SESSION_ACTIVE);
        schedulePostSuccessChamberSequence(r.sigilIndex);
        return;
      }

      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const r = payload.result;
        const readResult = await readSessionTruth(sessionId, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
        }

        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console -- dev-only fairness trace
          console.info("[MysteryChamber][dev] resolve_terminal", {
            sessionId,
            terminalKind: r.terminalKind,
            chosenSigil: r.chosenSigil,
            safeSigilSet: safeSigilSetFromApiResult(r),
            chamberIndex: r.chamberIndex ?? r.finalChamberIndex,
          });
        }

        const revealedSet = safeSigilSetFromApiResult(r);

        if (!mysteryChamberTerminalAlreadyRecorded(sessionId)) {
          rememberMysteryChamberTerminal(sessionId);
          const entry = Math.max(
            0,
            Math.floor(Number(r.settlementSummary?.entryCost ?? sessionRef.current?.entryAmount ?? 0)),
          );
          const payout = Math.max(
            0,
            Math.floor(Number(r.payoutReturn ?? r.settlementSummary?.payoutReturn ?? 0)),
          );
          const fc = r.finalChamberIndex ?? r.chamberIndex ?? 0;
          const cc = Math.max(
            0,
            Math.floor(
              Number(r.chambersCleared ?? readResult?.session?.serverOutcomeSummary?.chambersCleared) || 0,
            ),
          );
          const tk = r.terminalKind;
          const chosen = r.chosenSigil ?? r.lastChosenSigil;
          setMcLocalStats(prev =>
            recordMysteryChamberTerminal(prev, {
              terminalKind: tk,
              entryCost: entry,
              payoutReturn: payout,
              finalChamberIndex: fc,
              chambersCleared: cc,
              chosenSigil: chosen,
              safeSigilSet: tk === "fail" ? revealedSet : [],
            }),
          );
        }

        const chosenForBoard = mysteryChamberChosenSigilFromResult(r);

        if (r.terminalKind === "fail") {
          setLocalAnim({
            chosen: chosenForBoard != null ? chosenForBoard : undefined,
            safeSet: revealedSet,
            failChamberIndex: r.finalChamberIndex ?? r.chamberIndex,
            phase: "fail",
          });
        } else {
          setLocalAnim({ chosen: r.chosenSigil, phase: "success" });
        }

        setPersistedBoard({
          terminalKind: r.terminalKind,
          chosenSigil: chosenForBoard != null ? chosenForBoard : r.chosenSigil,
          lastChosenSigil: r.lastChosenSigil ?? chosenForBoard,
          safeSigilSet: revealedSet,
          safeSigilSets: r.safeSigilSets,
          finalChamberIndex: r.finalChamberIndex ?? r.chamberIndex,
          chambersCleared: r.chambersCleared ?? readResult?.session?.serverOutcomeSummary?.chambersCleared,
        });

        setResolvedResult(
          withNormalizedMysterySettlement(
            {
              ...r,
              sessionId: r.sessionId || sessionId,
              settlementSummary: r.settlementSummary,
              isWin: Boolean(r.isWin),
            },
            sessionRef.current?.sessionMode,
          ),
        );
        setUiState(UI_STATE.RESOLVED);
        setRevealPulse(false);

        window.setTimeout(() => {
          openResultPopup();
        }, REVEAL_READABLE_MS);
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
      setRevealPulse(false);
      setLocalAnim(null);
      interstitialSafeSigilRef.current = null;
      setInterstitialSafeSigil(null);
      if (localAnimTimerRef.current) {
        clearTimeout(localAnimTimerRef.current);
        localAnimTimerRef.current = null;
      }
      if (postSuccessInterstitialTimerRef.current) {
        clearTimeout(postSuccessInterstitialTimerRef.current);
        postSuccessInterstitialTimerRef.current = null;
      }
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

  async function handleSigilPick(sigilIndex) {
    if (interstitialSafeSigilRef.current != null) return;
    const sid = sessionRef.current?.id;
    const mc = sessionRef.current?.mysteryChamber;
    if (sid == null || String(mc?.readState || "") !== "choice_required") return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dev-only fairness trace (compare to server logs when SOLO_V2_DEBUG_MYSTERY_CHAMBER=1)
      console.info("[MysteryChamber][dev] client_pick", {
        sessionId: sid,
        sigilIndexSent: sigilIndex,
        currentChamberIndex: mc?.playing?.currentChamberIndex,
      });
    }

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
            action: "mystery_chamber_pick",
            gameKey: GAME_KEY,
            sigilIndex,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolvePick(sid, activeCycle);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && st === "pick_conflict") {
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
          setInMysteryLoop(false);
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

  async function handleExitNow() {
    const sid = sessionRef.current?.id;
    if (sid == null) return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;
    resolveInFlightRef.current = true;
    setUiState(UI_STATE.RESOLVING);
    setErrorMessage("");
    const activeCycle = cycleRef.current;

    try {
      const { response, payload, halted } = await postResolve(sid, { action: "cashout" }, activeCycle);
      if (halted) return;
      const status = String(payload?.status || "");
      const api = classifySoloV2ApiResult(response, payload);

      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "resolved" && payload?.result) {
        const r = payload.result;
        const readResult = await readSessionTruth(sid, activeCycle);
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
        }
        if (!mysteryChamberTerminalAlreadyRecorded(sid)) {
          rememberMysteryChamberTerminal(sid);
          const entry = Math.max(
            0,
            Math.floor(Number(r.settlementSummary?.entryCost ?? sessionRef.current?.entryAmount ?? 0)),
          );
          const payout = Math.max(
            0,
            Math.floor(Number(r.payoutReturn ?? r.settlementSummary?.payoutReturn ?? 0)),
          );
          const fc = r.finalChamberIndex ?? r.chamberIndex ?? 0;
          const cc = Math.max(
            0,
            Math.floor(
              Number(r.chambersCleared ?? readResult?.session?.serverOutcomeSummary?.chambersCleared) || 0,
            ),
          );
          setMcLocalStats(prev =>
            recordMysteryChamberTerminal(prev, {
              terminalKind: "cashout",
              entryCost: entry,
              payoutReturn: payout,
              finalChamberIndex: fc,
              chambersCleared: cc,
              chosenSigil: r.chosenSigil ?? r.lastChosenSigil,
              safeSigilSet: [],
            }),
          );
        }
        setPersistedBoard({
          terminalKind: "cashout",
          chosenSigil: null,
          safeSigil: null,
          chambersCleared: r.chambersCleared,
        });
        setResolvedResult(
          withNormalizedMysterySettlement(
            {
              ...r,
              sessionId: r.sessionId || sid,
              settlementSummary: r.settlementSummary,
              isWin: Boolean(r.isWin),
            },
            sessionRef.current?.sessionMode,
          ),
        );
        setUiState(UI_STATE.RESOLVED);
        window.setTimeout(() => openResultPopup(), REVEAL_READABLE_MS);
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Exit failed."));
      const readResult = await readSessionTruth(sid, activeCycle);
      if (readResult?.ok && readResult.session) {
        setSession(readResult.session);
        applySessionReadState(readResult.session, { resumed: true });
      }
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      resolveInFlightRef.current = false;
    }
  }

  async function runStartMysteryChamber() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < MYSTERY_CHAMBER_MIN_WAGER) return;
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
    if (isGiftRound && boot?.ok && typeof window !== "undefined" && window.requestAnimationFrame) {
      giftRefreshRef.current?.();
      window.requestAnimationFrame(() => giftRefreshRef.current?.());
    }
    if (!boot.ok || boot.alreadyTerminal) return;
    setInMysteryLoop(true);
    const mc = boot.session?.mysteryChamber;
    if (mc?.readState === "choice_submitted" && mc?.canResolveTurn) {
      void handleResolvePick(boot.session.id, activeCycle);
    }
  }

  useEffect(() => {
    const sid = session?.id;
    const mc = session?.mysteryChamber;
    if (!sid || !mc || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!mc.canResolveTurn) return;
    if (mc.readState !== "choice_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePick(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.mysteryChamber?.readState, session?.mysteryChamber?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= MYSTERY_CHAMBER_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION ||
    uiState === UI_STATE.RESOLVED;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= MYSTERY_CHAMBER_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
    !inMysteryLoop &&
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(uiState) &&
    (uiState === UI_STATE.IDLE ||
      uiState === UI_STATE.UNAVAILABLE ||
      uiState === UI_STATE.RESOLVED);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  const mcSnap = session?.mysteryChamber;
  const playing = mcSnap?.playing;
  const readState = String(mcSnap?.readState || "");

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= MYSTERY_CHAMBER_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  const sessionLocksSummary =
    runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVING);

  const previewMaxClear = mysteryChamberMaxPotentialReturn(numericWager);
  const previewStartingSecured = mysteryChamberStartingSecured(numericWager);

  let summaryPlay = sessionLocksSummary ? runEntryFromSession : numericWager;
  let summaryWin = sessionLocksSummary
    ? playing?.securedReturn != null
      ? Math.floor(Number(playing.securedReturn))
      : mysteryChamberStartingSecured(runEntryFromSession)
    : previewMaxClear;
  const summarySecondStatLabel = sessionLocksSummary ? "Secured" : "Max clear";

  const busyFooter =
    uiState === UI_STATE.SUBMITTING_PICK || uiState === UI_STATE.RESOLVING || uiState === UI_STATE.LOADING;

  const sigilPickDisabled =
    busyFooter ||
    uiState !== UI_STATE.SESSION_ACTIVE ||
    readState !== "choice_required" ||
    Boolean(localAnim) ||
    interstitialSafeSigil != null;

  let sigilVisuals = defaultVisuals();
  if (localAnim) {
    sigilVisuals = visualsFromLocalAnim(localAnim);
  } else if (interstitialSafeSigil != null) {
    const c = Math.floor(Number(interstitialSafeSigil));
    if (Number.isFinite(c) && c >= 0 && c <= 3) {
      sigilVisuals = defaultVisuals();
      sigilVisuals[c] = "safe";
      for (let i = 0; i < 4; i += 1) {
        if (i !== c) sigilVisuals[i] = "muted";
      }
    }
  } else if (uiState === UI_STATE.RESOLVED && persistedBoard) {
    sigilVisuals = visualsFromPersistedBoard(persistedBoard);
  }

  const exitVisible =
    uiState === UI_STATE.SESSION_ACTIVE &&
    readState === "choice_required" &&
    Boolean(mcSnap?.canCashOut) &&
    !localAnim &&
    interstitialSafeSigil == null;
  const exitDisabled = busyFooter;

  let statusTop = "Press START MYSTERY CHAMBER to begin.";
  let statusSub =
    "Chambers 1–3 each have two safe sigils; chamber 4 has one. Four sigils shown every chamber.";
  let hintLine = "\u00a0";

  const cleared = playing?.chambersCleared ?? 0;
  const curCh = playing?.currentChamberIndex ?? 0;

  if (uiState === UI_STATE.SESSION_ACTIVE && readState === "choice_submitted") {
    statusTop = "Resolving…";
    statusSub = "Checking your sigil on the server.";
  } else if (interstitialSafeSigil != null) {
    const nextHuman = Math.min(
      MYSTERY_CHAMBER_CHAMBER_COUNT,
      Math.max(1, Math.floor(Number(curCh) || 0) + 1),
    );
    statusTop = "Chamber cleared — safe path.";
    statusSub = `Next: Chamber ${nextHuman} of ${MYSTERY_CHAMBER_CHAMBER_COUNT}. Sigils unlock in a moment — then choose again; the same glyph is a new pick for this chamber.`;
  } else if (uiState === UI_STATE.SESSION_ACTIVE && readState === "choice_required" && !localAnim) {
    statusTop = `Chamber ${curCh + 1} of ${MYSTERY_CHAMBER_CHAMBER_COUNT}. Exit now or continue.`;
    const nSafe = MYSTERY_CHAMBER_SAFE_COUNT_BY_STEP[curCh] ?? 1;
    statusSub =
      nSafe === 2
        ? "Two of four sigils are safe — pick one to continue."
        : "Only one sigil is safe in this chamber — choose carefully.";
  }
  if (localAnim?.phase === "success") {
    statusTop = "Safe path found.";
    const nextHuman = (playing?.currentChamberIndex ?? curCh) + 1;
    statusSub = `Chamber ${Math.min(MYSTERY_CHAMBER_CHAMBER_COUNT, Math.max(1, nextHuman))} — choose your next sigil.`;
  }
  if (localAnim?.phase === "fail") {
    const fc = Math.floor(
      Number(localAnim.failChamberIndex ?? persistedBoard?.finalChamberIndex ?? 0) || 0,
    );
    statusTop = `Wrong sigil. The run ended in Chamber ${fc + 1}.`;
    statusSub = "The run is over.";
  }
  if (uiState === UI_STATE.RESOLVED && persistedBoard?.terminalKind === "cashout") {
    statusTop = `Exited after ${persistedBoard.chambersCleared || cleared || 0} chamber(s) cleared.`;
    statusSub = "Secured return paid.";
  }
  if (uiState === UI_STATE.RESOLVED && persistedBoard?.terminalKind === "full_clear") {
    statusTop = "Final chamber cleared.";
    statusSub = "Maximum secured return.";
  }
  if (uiState === UI_STATE.RESOLVED && persistedBoard?.terminalKind === "fail" && !localAnim) {
    const fc = persistedBoard?.finalChamberIndex ?? 0;
    statusTop = `Wrong sigil. The run ended in Chamber ${fc + 1}.`;
    statusSub = "The run is over.";
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin ?? resolvedResult?.settlementSummary?.isWin);
  const tk = String(resolvedResult?.terminalKind || "");
  const delta = Number(resolvedResult?.settlementSummary?.netDelta ?? 0);
  const resultVaultLabel =
    resolvedResult?.settlementSummary != null ? `${delta > 0 ? "+" : ""}${formatCompact(delta)}` : "";

  let popupTitle = resolvedIsWin ? "RUN COMPLETE" : "RUN ENDED";
  let popupLine2 = "—";
  let popupLine3 = "—";
  if (resolvedResult) {
    const ret = formatCompact(Math.max(0, Math.floor(Number(resolvedResult.payoutReturn) || 0)));
    const ch = Math.max(0, Math.floor(Number(resolvedResult.chambersCleared) || 0));
    popupLine2 = `Return ${ret}`;
    if (tk === "fail") {
      popupTitle = "RUN ENDED";
      popupLine3 = `Failed in chamber · ${ch} cleared before loss`;
    } else if (tk === "cashout") {
      popupTitle = "EXITED";
      popupLine3 = `${ch} chamber(s) cleared · secured return`;
    } else if (tk === "full_clear") {
      popupTitle = "FULL CLEAR";
      popupLine3 = "All four chambers · maximum return";
    }
  }

  function handleGiftPlay() {
    if (!vaultReady) {
      setErrorMessage("Shared vault unavailable.");
      return;
    }
    if (giftShell.giftCount < 1) return;
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    giftRoundRef.current = true;
    void runStartMysteryChamber();
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

  const previewPlayingForPanel = {
    chamberCount: MYSTERY_CHAMBER_CHAMBER_COUNT,
    currentChamberIndex: 0,
    chambersCleared: 0,
    securedReturn: previewStartingSecured,
  };

  const playingForPanel =
    uiState === UI_STATE.RESOLVED && persistedBoard
      ? {
          chamberCount: MYSTERY_CHAMBER_CHAMBER_COUNT,
          currentChamberIndex: Math.min(
            MYSTERY_CHAMBER_CHAMBER_COUNT - 1,
            Math.floor(
              Number(resolvedResult?.finalChamberIndex ?? persistedBoard.finalChamberIndex) || 0,
            ),
          ),
          chambersCleared: Math.max(
            0,
            Math.floor(Number(persistedBoard.chambersCleared ?? resolvedResult?.chambersCleared) || 0),
          ),
          securedReturn: Math.max(0, Math.floor(Number(resolvedResult?.payoutReturn) || 0)),
        }
      : sessionLocksSummary
        ? playing
        : previewPlayingForPanel;

  const boardShowsIdlePreview =
    !sessionLocksSummary && !(uiState === UI_STATE.RESOLVED && persistedBoard);
  const securedCaptionBoard = boardShowsIdlePreview
    ? `Full clear (${MYSTERY_CHAMBER_CHAMBER_COUNT} chambers): ${formatCompact(previewMaxClear)}`
    : "";

  const mcSt = mcLocalStats;
  const safePickTotal = totalSuccessfulSafePicks(mcSt);
  const runsReturned = runsWithReturn(mcSt);
  const avgDepth = averageChamberReached(mcSt);
  const netFlow = mcSt.totalReturned - mcSt.totalPlayed;
  const fmtMcPct = p => (p == null || Number.isNaN(p) ? "—" : `${p.toFixed(1)}%`);

  return (
    <SoloV2GameShell
      title="Mystery Chamber"
      subtitle="Advance through the chamber run."
      layoutMaxWidthClass="max-w-full sm:max-w-2xl"
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
            <span className="shrink-0">{summarySecondStatLabel}</span>
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - MYSTERY_CHAMBER_MIN_WAGER)));
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
          setWagerInput(String(MYSTERY_CHAMBER_MIN_WAGER));
        },
        primaryActionLabel: "START MYSTERY CHAMBER",
        primaryActionDisabled: !canStart,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => {
          void runStartMysteryChamber();
        },
        errorMessage: errorMessage || stakeHint,
      }}
      soloV2FooterWrapperClassName={busyFooter ? "opacity-95" : ""}
      gameplaySlot={
        <MysteryChamberGameplayPanel
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          playing={playingForPanel}
          sigilVisuals={sigilVisuals}
          sigilPickDisabled={sigilPickDisabled}
          onSigilPick={handleSigilPick}
          hintLine={hintLine}
          exitVisible={exitVisible}
          exitDisabled={exitDisabled}
          onExitNow={handleExitNow}
          revealPulse={revealPulse}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          popupTitle={popupTitle}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
          securedCaption={securedCaptionBoard}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Four chambers; each shows four sigils. Chambers 1–3 each have two safe sigils (either is a valid path). Chamber
            4 has exactly one safe sigil. Each safe chamber multiplies your secured return on the ladder (×1.07 → ×1.08 →
            ×1.09 → ×1.12). Picking a non-safe sigil ends the run.
          </p>
          <p>
            After any safe chamber you may exit with your secured return or continue. Outcomes are sealed on the server;
            picks are validated and resolved there.
          </p>
        </div>
      }
      statsContent={
        <div className="space-y-2">
          <p>Total runs: {mcSt.totalRuns}</p>
          <p>Successful safe picks: {safePickTotal}</p>
          <p>Runs with a return: {runsReturned}</p>
          <p>Full clears: {mcSt.fullClears}</p>
          <p>Exit now: {mcSt.cashouts}</p>
          <p>Failed runs: {mcSt.failures}</p>
          <p>Chamber 1 safe-pick rate: {fmtMcPct(chamberClearRatePercent(mcSt, 0))}</p>
          <p>Chamber 2 safe-pick rate: {fmtMcPct(chamberClearRatePercent(mcSt, 1))}</p>
          <p>Chamber 3 safe-pick rate: {fmtMcPct(chamberClearRatePercent(mcSt, 2))}</p>
          <p>Chamber 4 safe-pick rate: {fmtMcPct(chamberClearRatePercent(mcSt, 3))}</p>
          <p>Average deepest chamber: {avgDepth == null ? "—" : avgDepth.toFixed(2)}</p>
          <p>Total played: {formatCompact(mcSt.totalPlayed)}</p>
          <p>Total returned: {formatCompact(mcSt.totalReturned)}</p>
          <p>Best return: {formatCompact(mcSt.bestReturn)}</p>
          <p>Net flow (returned − played): {formatCompact(netFlow)}</p>
          <p>
            Picks by sigil:{" "}
            {MYSTERY_CHAMBER_SIGIL_GLYPHS.map((g, i) => `${g} ${mcSt.picksBySigil[i] || 0}`).join(" · ")}
          </p>
        </div>
      }
      resultState={null}
    />
  );
}
