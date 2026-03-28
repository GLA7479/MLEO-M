import { useEffect, useRef, useState } from "react";
import TwentyOneChallengeBoard from "../components/solo-v2/TwentyOneChallengeBoard";
import SoloV2ResultPopup, {
  SoloV2ResultPopupVaultLine,
  SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS,
} from "../components/solo-v2/SoloV2ResultPopup";
import SoloV2GameShell from "../components/solo-v2/SoloV2GameShell";
import { formatCompactNumber as formatCompact } from "../lib/solo-v2/formatCompactNumber";
import { handTotal, upCardShowValue } from "../lib/solo-v2/challenge21HandMath";
import { CHALLENGE_21_MIN_WAGER } from "../lib/solo-v2/challenge21Config";
import { SOLO_V2_SESSION_MODE } from "../lib/solo-v2/server/sessionTypes";
import {
  SOLO_V2_GIFT_ROUND_STAKE,
  soloV2GiftConsumeOne,
} from "../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../lib/solo-v2/useSoloV2GiftShellState";
import {
  applyChallenge21SettlementOnce,
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../lib/solo-v2/quickFlipLocalVault";
import {
  SOLO_V2_API_RESULT,
  buildSoloV2ApiErrorMessage,
  classifySoloV2ApiResult,
  isSoloV2EventRejectedStaleSessionMessage,
} from "../lib/solo-v2/soloV2ApiResult";

const GAME_KEY = "challenge_21";
const PLAYER_HEADER = "challenge-21-client";

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

/** Card reveal pacing (ms): visible but not sluggish */
const C21_REVEAL_CARD_MS = 420;
const C21_REVEAL_GAP_MS = 180;
const C21_POST_SEQUENCE_BEAT_MS = 520;

function sleep(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function parseWagerInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_WAGER, Math.max(0, n));
}

function extraStakeForChallenge21Action(decision, playing, baseWager) {
  const w = Math.max(CHALLENGE_21_MIN_WAGER, Math.floor(Number(baseWager) || 0));
  if (decision === "insurance_accept") return Math.floor(w / 2);
  if (decision === "split") return w;
  if (decision === "double") {
    const stakes = playing?.handStakes;
    const i = Math.max(0, Math.floor(Number(playing?.activeHandIndex) || 0));
    if (Array.isArray(stakes) && stakes[i] != null) return Math.max(0, Math.floor(Number(stakes[i])));
    return w;
  }
  return 0;
}

function Challenge21GameplayPanel({
  sessionNotice,
  statusTop,
  statusSub,
  playerHands,
  activeHandIndex,
  playerHand,
  opponentVisibleHand,
  opponentHandResolved,
  holeHidden,
  presentation,
  allowedDecisions,
  insurancePending,
  entryAmount,
  onBoardAction,
  actionsHidden,
  resultPopupOpen,
  resolvedIsWin,
  resultTone,
  popupLine2,
  popupLine3,
  resultVaultLabel,
  popupTitle,
}) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col px-1 pt-1 text-center sm:px-2">
      <div className="flex min-h-0 flex-1 flex-col">
        <TwentyOneChallengeBoard
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          playerHands={playerHands}
          activeHandIndex={activeHandIndex}
          playerHand={playerHand}
          opponentVisibleHand={opponentVisibleHand}
          opponentHandResolved={opponentHandResolved}
          holeHidden={holeHidden}
          presentation={presentation}
          allowedDecisions={allowedDecisions}
          insurancePending={insurancePending}
          entryAmount={entryAmount}
          onAction={onBoardAction}
          actionsHidden={actionsHidden}
        />
      </div>

      <SoloV2ResultPopup
        open={resultPopupOpen}
        isWin={resolvedIsWin}
        resultTone={resultTone}
        animationKey={`${popupLine2}-${popupLine3}-${resultTone}-${resultVaultLabel}`}
        vaultSlot={
          resultPopupOpen ? (
            <SoloV2ResultPopupVaultLine isWin={resolvedIsWin} tone={resultTone} deltaLabel={resultVaultLabel} />
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

export default function Challenge21Page() {
  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReady, setVaultReady] = useState(false);
  const [wagerInput, setWagerInput] = useState(String(CHALLENGE_21_MIN_WAGER));
  const [session, setSession] = useState(null);
  const [uiState, setUiState] = useState(UI_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const [resolvedResult, setResolvedResult] = useState(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [inChallengeLoop, setInChallengeLoop] = useState(false);
  const [persistedLastRound, setPersistedLastRound] = useState(null);

  const inChallengeLoopRef = useRef(false);
  const preserveBoardAfterRoundRef = useRef(false);
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
  const presentationRunIdRef = useRef(0);
  const dealAnimatedKeyRef = useRef(null);
  const splitAnimatedKeyRef = useRef(null);
  const presentationLockRef = useRef(false);

  const [boardPresentation, setBoardPresentation] = useState(null);
  const [resolveAnimating, setResolveAnimating] = useState(false);

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
    inChallengeLoopRef.current = inChallengeLoop;
  }, [inChallengeLoop]);

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
    applyChallenge21SettlementOnce(sessionId, settlementSummary).then(settlementResult => {
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

  async function prepareNextChallengeRound() {
    if (resultPopupTimerRef.current) {
      clearTimeout(resultPopupTimerRef.current);
      resultPopupTimerRef.current = null;
    }
    presentationRunIdRef.current += 1;
    presentationLockRef.current = false;
    setBoardPresentation(null);
    setResolveAnimating(false);
    submitInFlightRef.current = false;
    resolveInFlightRef.current = false;
    setResultPopupOpen(false);
    setResolvedResult(null);
    setSessionNotice("");

    if (!inChallengeLoopRef.current) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setPersistedLastRound(null);
      return;
    }

    if (!vaultReady) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInChallengeLoop(false);
      setErrorMessage("Shared vault unavailable.");
      setPersistedLastRound(null);
      return;
    }

    const wager = parseWagerInput(wagerInputRef.current);
    if (wager < CHALLENGE_21_MIN_WAGER) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInChallengeLoop(false);
      setErrorMessage(`Minimum stake is ${CHALLENGE_21_MIN_WAGER}.`);
      setPersistedLastRound(null);
      return;
    }
    if (vaultBalanceRef.current < wager) {
      createInFlightRef.current = false;
      setSession(null);
      setUiState(UI_STATE.IDLE);
      setInChallengeLoop(false);
      setErrorMessage(`Insufficient vault balance. Need ${wager} for this round.`);
      setPersistedLastRound(null);
      return;
    }

    cycleRef.current += 1;
    const activeCycle = cycleRef.current;
    preserveBoardAfterRoundRef.current = true;
    const boot = await bootstrapSession(wager, activeCycle, SOLO_V2_SESSION_MODE.STANDARD, {
      isGiftRound: false,
      preserveBoardAfterRound: true,
    });
    if (!boot.ok || boot.alreadyTerminal) {
      setInChallengeLoop(false);
      preserveBoardAfterRoundRef.current = false;
      return;
    }
    const c21 = boot.session?.challenge21;
    if (c21?.readState === "action_submitted" && c21?.canResolveTurn) {
      void handleResolvePendingAction(boot.session.id, activeCycle);
    }
  }

  function openResultPopup() {
    if (resultPopupTimerRef.current) clearTimeout(resultPopupTimerRef.current);
    setResultPopupOpen(true);
    resultPopupTimerRef.current = window.setTimeout(() => {
      resultPopupTimerRef.current = null;
      void prepareNextChallengeRound();
    }, SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS);
  }

  function dealerSlotsFromPlayingSnapshot(p) {
    const up = p?.opponentVisibleHand?.[0];
    if (!up) return [];
    const holeHidden = p?.holeHidden !== false;
    if (holeHidden) return [{ code: up, hidden: false }, { code: null, hidden: true }];
    return (p.opponentVisibleHand || []).map(c => ({ code: c, hidden: false }));
  }

  function clonePlayingSnapshot(p) {
    if (!p || typeof p !== "object") return null;
    return {
      opponentVisibleHand: Array.isArray(p.opponentVisibleHand) ? [...p.opponentVisibleHand] : [],
      playerHands: Array.isArray(p.playerHands) ? p.playerHands.map(h => [...h]) : [],
      playerHand: Array.isArray(p.playerHand) ? [...p.playerHand] : [],
      holeHidden: p.holeHidden !== false,
      activeHandIndex: p.activeHandIndex,
    };
  }

  function applyRoundOutcomeToUi(r, sid, { openPopup = true } = {}) {
    setResolvedResult({
      ...r,
      sessionId: r.sessionId || sid,
      settlementSummary: r.settlementSummary,
    });
    const ph = Array.isArray(r.playerHand) ? [...r.playerHand] : [];
    const phs =
      Array.isArray(r.playerHands) && r.playerHands.length > 0
        ? r.playerHands.map(h => (Array.isArray(h) ? [...h] : []))
        : [ph];
    setPersistedLastRound({
      playerHands: phs,
      playerHand: ph,
      opponentHand: Array.isArray(r.opponentHand) ? [...r.opponentHand] : [],
      playerTotal: r.playerTotal,
      opponentTotal: r.opponentTotal,
      isWin: Boolean(r.isWin),
      isPush: Boolean(r.isPush),
      outcome: r.outcome,
      handResults: r.handResults,
      insuranceReturn: r.insuranceReturn,
      insuranceStake: r.insuranceStake,
      blackjackWin: Boolean(r.blackjackWin),
    });
    setUiState(UI_STATE.RESOLVED);
    setResolveAnimating(false);
    setBoardPresentation(null);
    if (openPopup) openResultPopup();
  }

  async function runDealerRevealThenFinish(prevPlaying, result, sessionId, runId) {
    const finalOpp = Array.isArray(result.opponentHand) ? result.opponentHand : [];
    const ph = Array.isArray(result.playerHand) ? [...result.playerHand] : [];
    const phs =
      Array.isArray(result.playerHands) && result.playerHands.length > 0
        ? result.playerHands.map(h => (Array.isArray(h) ? [...h] : []))
        : [ph];
    const activeIdx = Math.max(0, Math.floor(Number(prevPlaying?.activeHandIndex) || 0));
    if (finalOpp.length === 0) {
      applyRoundOutcomeToUi(result, sessionId, { openPopup: true });
      return;
    }
    if (finalOpp.length === 1) {
      presentationLockRef.current = true;
      setResolveAnimating(true);
      setBoardPresentation({
        dealerSlots: [{ code: finalOpp[0], hidden: false }],
        playerHands: phs,
        pulseKeys: [],
        activeHandIndex: activeIdx,
      });
      await sleep(C21_POST_SEQUENCE_BEAT_MS);
      if (runId !== presentationRunIdRef.current) return;
      presentationLockRef.current = false;
      setBoardPresentation(null);
      applyRoundOutcomeToUi(result, sessionId, { openPopup: true });
      return;
    }
    presentationLockRef.current = true;
    setResolveAnimating(true);
    let startSlots = dealerSlotsFromPlayingSnapshot(prevPlaying);
    if (startSlots.length === 0) {
      if (finalOpp.length >= 2) {
        startSlots = [
          { code: finalOpp[0], hidden: false },
          { code: null, hidden: true },
        ];
      } else if (finalOpp.length === 1) {
        startSlots = [{ code: finalOpp[0], hidden: false }];
      }
    }
    setBoardPresentation({
      dealerSlots: startSlots,
      playerHands: phs,
      pulseKeys: [],
      activeHandIndex: activeIdx,
    });
    await sleep(C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    const hadHoleHidden =
      prevPlaying != null ? prevPlaying.holeHidden !== false : finalOpp.length >= 2;
    if (hadHoleHidden) {
      setBoardPresentation({
        dealerSlots: [
          { code: finalOpp[0], hidden: false },
          { code: null, hidden: true },
        ],
        playerHands: phs,
        pulseKeys: [],
        activeHandIndex: activeIdx,
      });
      await sleep(C21_REVEAL_GAP_MS + 120);
      if (runId !== presentationRunIdRef.current) return;
    }
    let slots = [
      { code: finalOpp[0], hidden: false },
      { code: finalOpp[1], hidden: false },
    ];
    setBoardPresentation({ dealerSlots: slots, playerHands: phs, pulseKeys: [`o-1`], activeHandIndex: activeIdx });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    for (let i = 2; i < finalOpp.length; i++) {
      slots = [...slots, { code: finalOpp[i], hidden: false }];
      setBoardPresentation({
        dealerSlots: slots,
        playerHands: phs,
        pulseKeys: [`o-${i}`],
        activeHandIndex: activeIdx,
      });
      await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
      if (runId !== presentationRunIdRef.current) return;
    }
    await sleep(C21_POST_SEQUENCE_BEAT_MS);
    if (runId !== presentationRunIdRef.current) return;
    presentationLockRef.current = false;
    setBoardPresentation(null);
    applyRoundOutcomeToUi(result, sessionId, { openPopup: true });
  }

  async function runBootstrapResolvedPresentation(rr, sessionPayload) {
    const runId = ++presentationRunIdRef.current;
    const opp = Array.isArray(rr.opponentHand) ? rr.opponentHand : [];
    const ph = Array.isArray(rr.playerHand) ? [...rr.playerHand] : [];
    const phs =
      Array.isArray(rr.playerHands) && rr.playerHands.length > 0
        ? rr.playerHands.map(h => (Array.isArray(h) ? [...h] : []))
        : [ph];
    const p0 = phs[0]?.[0];
    const p1 = phs[0]?.[1];
    const up = opp[0];
    if (!up || !p0) {
      applyRoundOutcomeToUi({ ...rr, sessionId: sessionPayload.id }, sessionPayload.id, { openPopup: true });
      return;
    }
    presentationLockRef.current = true;
    setResolveAnimating(true);
    setBoardPresentation({
      dealerSlots: [{ code: up, hidden: false }],
      playerHands: [[]],
      pulseKeys: [`o-0`],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    setBoardPresentation({
      dealerSlots: [{ code: up, hidden: false }],
      playerHands: [[p0]],
      pulseKeys: [`p-0-0`],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    setBoardPresentation({
      dealerSlots: [
        { code: up, hidden: false },
        { code: null, hidden: true },
      ],
      playerHands: [[p0]],
      pulseKeys: ["o-hole"],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    const handsAfterP2 = p1 != null ? [[p0, p1]] : [[p0]];
    setBoardPresentation({
      dealerSlots: [
        { code: up, hidden: false },
        { code: null, hidden: true },
      ],
      playerHands: handsAfterP2,
      pulseKeys: p1 != null ? [`p-0-1`] : [],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    const synthPrev = {
      opponentVisibleHand: [up],
      holeHidden: true,
    };
    await runDealerRevealThenFinish(synthPrev, { ...rr, playerHands: phs, playerHand: ph }, sessionPayload.id, runId);
  }

  async function runInitialDealPresentation(playing, runId) {
    const up = playing?.opponentVisibleHand?.[0];
    const hands = Array.isArray(playing?.playerHands) && playing.playerHands.length > 0 ? playing.playerHands : [];
    const h0 = hands[0] || playing?.playerHand || [];
    const p0 = h0[0];
    const p1 = h0[1];
    if (!up || !p0 || p1 == null) return;
    presentationLockRef.current = true;
    setBoardPresentation({
      dealerSlots: [{ code: up, hidden: false }],
      playerHands: [[]],
      pulseKeys: [`o-0`],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    setBoardPresentation({
      dealerSlots: [{ code: up, hidden: false }],
      playerHands: [[p0]],
      pulseKeys: [`p-0-0`],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    setBoardPresentation({
      dealerSlots: [
        { code: up, hidden: false },
        { code: null, hidden: true },
      ],
      playerHands: [[p0]],
      pulseKeys: ["o-hole"],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    setBoardPresentation({
      dealerSlots: [
        { code: up, hidden: false },
        { code: null, hidden: true },
      ],
      playerHands: [[p0, p1]],
      pulseKeys: [`p-0-1`],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS);
    if (runId !== presentationRunIdRef.current) return;
    presentationLockRef.current = false;
    setBoardPresentation(null);
  }

  async function runHitOrDoublePresentation(prev, next, runId) {
    const prevHands = Array.isArray(prev.playerHands) && prev.playerHands.length ? prev.playerHands : [prev.playerHand || []];
    const nextHands = Array.isArray(next.playerHands) && next.playerHands.length ? next.playerHands : [next.playerHand || []];
    const ai = Math.max(0, Math.floor(Number(next.activeHandIndex) || 0));
    const before = (prevHands[ai] || []).length;
    const after = (nextHands[ai] || []).length;
    if (after <= before || after !== before + 1) return;
    presentationLockRef.current = true;
    const trunc = nextHands.map((h, i) => (i === ai ? h.slice(0, -1) : [...h]));
    setBoardPresentation({
      dealerSlots: dealerSlotsFromPlayingSnapshot(next),
      playerHands: trunc,
      pulseKeys: [],
      activeHandIndex: ai,
    });
    await sleep(C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    const newKey = `p-${ai}-${after - 1}`;
    setBoardPresentation({
      dealerSlots: dealerSlotsFromPlayingSnapshot(next),
      playerHands: nextHands.map(h => [...h]),
      pulseKeys: [newKey],
      activeHandIndex: ai,
    });
    await sleep(C21_REVEAL_CARD_MS);
    if (runId !== presentationRunIdRef.current) return;
    presentationLockRef.current = false;
    setBoardPresentation(null);
  }

  async function runSplitPresentation(prev, next, runId) {
    const nextHands = Array.isArray(next.playerHands) ? next.playerHands : [];
    if (nextHands.length !== 2) return;
    const c00 = nextHands[0]?.[0];
    const c10 = nextHands[1]?.[0];
    const c01 = nextHands[0]?.[1];
    const c11 = nextHands[1]?.[1];
    if (!c00 || !c10) return;
    presentationLockRef.current = true;
    setBoardPresentation({
      dealerSlots: dealerSlotsFromPlayingSnapshot(next),
      playerHands: [[c00], [c10]],
      pulseKeys: ["p-0-0", "p-1-0"],
      activeHandIndex: 0,
    });
    await sleep(C21_REVEAL_CARD_MS + C21_REVEAL_GAP_MS);
    if (runId !== presentationRunIdRef.current) return;
    if (c01 != null && c11 != null) {
      setBoardPresentation({
        dealerSlots: dealerSlotsFromPlayingSnapshot(next),
        playerHands: [
          [c00, c01],
          [c10, c11],
        ],
        pulseKeys: ["p-0-1", "p-1-1"],
        activeHandIndex: 0,
      });
      await sleep(C21_REVEAL_CARD_MS);
    }
    if (runId !== presentationRunIdRef.current) return;
    presentationLockRef.current = false;
    setBoardPresentation(null);
  }

  function applySessionReadState(sessionPayload, { resumed = false, immediateOutcomePresentation = false } = {}) {
    const c21 = sessionPayload?.challenge21;
    const readState = String(c21?.readState || sessionPayload?.readState || "");
    const st = String(sessionPayload?.sessionStatus || "");

    if (st === "resolved" && c21?.resolvedResult) {
      setInChallengeLoop(!resumed);
      setSessionNotice(resumed ? "Round finished (restored)." : "");
      setErrorMessage("");
      const rr = {
        ...c21.resolvedResult,
        sessionId: sessionPayload.id,
        settlementSummary: c21.resolvedResult.settlementSummary,
      };
      if (immediateOutcomePresentation && !resumed) {
        setUiState(UI_STATE.RESOLVING);
        void runBootstrapResolvedPresentation(rr, sessionPayload);
        return;
      }
      setResolvedResult(rr);
      setUiState(UI_STATE.RESOLVED);
      if (immediateOutcomePresentation) {
        const ph = Array.isArray(rr.playerHand) ? [...rr.playerHand] : [];
        const phs =
          Array.isArray(rr.playerHands) && rr.playerHands.length > 0
            ? rr.playerHands.map(h => (Array.isArray(h) ? [...h] : []))
            : [ph];
        setPersistedLastRound({
          playerHands: phs,
          playerHand: ph,
          opponentHand: Array.isArray(rr.opponentHand) ? [...rr.opponentHand] : [],
          playerTotal: rr.playerTotal,
          opponentTotal: rr.opponentTotal,
          isWin: Boolean(rr.isWin),
          isPush: Boolean(rr.isPush),
          outcome: rr.outcome,
          handResults: rr.handResults,
          insuranceReturn: rr.insuranceReturn,
          insuranceStake: rr.insuranceStake,
          blackjackWin: Boolean(rr.blackjackWin),
        });
        openResultPopup();
      }
      return;
    }

    if (readState === "action_conflict") {
      setInChallengeLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice("");
      setErrorMessage("Conflicting actions — refresh and try again.");
      return;
    }

    if (readState === "action_submitted") {
      setInChallengeLoop(true);
      setUiState(UI_STATE.SESSION_ACTIVE);
      setSessionNotice(resumed ? "Finishing your action…" : "Resolving…");
      setErrorMessage("");
      return;
    }

    if (readState === "ready") {
      setInChallengeLoop(true);
      setResolvedResult(null);
      setUiState(UI_STATE.SESSION_ACTIVE);
      if (preserveBoardAfterRoundRef.current) {
        preserveBoardAfterRoundRef.current = false;
        setSessionNotice("");
        setErrorMessage("");
        return;
      }
      setPersistedLastRound(null);
      setSessionNotice(
        resumed ? "Session restored." : "Choose an action. Insurance when the opponent shows an ace.",
      );
      setErrorMessage("");
      return;
    }

    if (readState === "invalid" || st === "expired" || st === "cancelled") {
      setInChallengeLoop(false);
      setSession(null);
      setResolvedResult(null);
      setPersistedLastRound(null);
      setUiState(UI_STATE.IDLE);
      setSessionNotice("");
      setErrorMessage(
        st === "expired" ? "Session expired. Press START 21 CHALLENGE." : "Session ended. Press START 21 CHALLENGE.",
      );
      return;
    }

    setInChallengeLoop(false);
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
      setPersistedLastRound(null);
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
        applySessionReadState(readResult.session, {
          resumed: false,
          immediateOutcomePresentation: readResult.session?.sessionStatus === "resolved",
        });
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
        applySessionReadState(readResult.session, { resumed: true, immediateOutcomePresentation: false });
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
    const response = await fetch("/api/solo-v2/challenge-21/resolve", {
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

  async function handleResolvePendingAction(sessionId, activeCycle) {
    if (resolveInFlightRef.current) return;
    resolveInFlightRef.current = true;
    setUiState(UI_STATE.RESOLVING);
    const playingBefore = clonePlayingSnapshot(sessionRef.current?.challenge21?.playing);
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
        const runId = ++presentationRunIdRef.current;
        await runDealerRevealThenFinish(playingBefore, r, sessionId, runId);
        return;
      }

      if (api === SOLO_V2_API_RESULT.SUCCESS && status === "in_progress" && payload?.result) {
        const runId = ++presentationRunIdRef.current;
        const readResult = await readSessionTruth(sessionId, activeCycle);
        const nextPlaying = readResult?.ok ? readResult.session?.challenge21?.playing : null;
        if (playingBefore && nextPlaying) {
          const prevN = playingBefore.playerHands?.length || 0;
          const nextN = nextPlaying.playerHands?.length || 0;
          if (prevN === 1 && nextN === 2) {
            const sk = `split-${sessionId}-${JSON.stringify(nextPlaying.playerHands)}`;
            if (splitAnimatedKeyRef.current !== sk) {
              splitAnimatedKeyRef.current = sk;
              await runSplitPresentation(playingBefore, nextPlaying, runId);
            }
          } else {
            await runHitOrDoublePresentation(playingBefore, nextPlaying, runId);
          }
        }
        if (readResult?.ok && readResult.session) {
          setSession(readResult.session);
          applySessionReadState(readResult.session, { resumed: true });
        }
        setUiState(UI_STATE.SESSION_ACTIVE);
        return;
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Resolve failed."));
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

  async function submitAction(decision) {
    const sid = sessionRef.current?.id;
    const c21 = sessionRef.current?.challenge21;
    if (sid == null || String(c21?.readState || "") !== "ready") return;
    if (submitInFlightRef.current || resolveInFlightRef.current) return;

    const playing = c21?.playing;
    const baseW = Math.max(
      CHALLENGE_21_MIN_WAGER,
      Math.floor(Number(sessionRef.current?.entryAmount) || 0),
    );
    const extra = extraStakeForChallenge21Action(decision, playing, baseW);
    if (extra > 0 && vaultBalanceRef.current < extra) {
      setErrorMessage(`Need ${formatCompact(extra)} in vault for this action.`);
      return;
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
            action: "challenge_21_action",
            gameKey: GAME_KEY,
            decision,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (activeCycle !== cycleRef.current) return;
      const api = classifySoloV2ApiResult(response, payload);
      const st = String(payload?.status || "");

      if (api === SOLO_V2_API_RESULT.SUCCESS && st === "accepted") {
        await handleResolvePendingAction(sid, activeCycle);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && (st === "action_conflict" || st === "turn_pending")) {
        const rr = await readSessionTruth(sid, activeCycle);
        if (rr?.ok && rr.session) {
          setSession(rr.session);
          applySessionReadState(rr.session, { resumed: true });
        }
        setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Action rejected — state refreshed."));
        setUiState(UI_STATE.SESSION_ACTIVE);
        return;
      }

      if (api === SOLO_V2_API_RESULT.CONFLICT && st === "event_rejected") {
        const msg = buildSoloV2ApiErrorMessage(payload, "");
        if (isSoloV2EventRejectedStaleSessionMessage(msg)) {
          setSession(null);
          setInChallengeLoop(false);
          setUiState(UI_STATE.IDLE);
          setErrorMessage(msg || "Session expired.");
          return;
        }
      }

      setErrorMessage(buildSoloV2ApiErrorMessage(payload, "Action failed."));
      setUiState(UI_STATE.SESSION_ACTIVE);
    } catch (_e) {
      setErrorMessage("Network error while sending action.");
      setUiState(UI_STATE.SESSION_ACTIVE);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function runStartChallenge() {
    if (createInFlightRef.current || submitInFlightRef.current || resolveInFlightRef.current) return;
    const isGiftRound = giftRoundRef.current;
    if (!vaultReady) {
      setUiState(UI_STATE.UNAVAILABLE);
      setErrorMessage("Shared vault unavailable.");
      if (isGiftRound) giftRoundRef.current = false;
      return;
    }
    const wager = isGiftRound ? SOLO_V2_GIFT_ROUND_STAKE : parseWagerInput(wagerInput);
    if (!isGiftRound && wager < CHALLENGE_21_MIN_WAGER) return;
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
    setInChallengeLoop(true);
    const c21Boot = boot.session?.challenge21;
    if (c21Boot?.readState === "action_submitted" && c21Boot?.canResolveTurn) {
      void handleResolvePendingAction(boot.session.id, activeCycle);
    }
  }

  function handleNextHand() {
    if (!persistedLastRound) return;
    presentationRunIdRef.current += 1;
    presentationLockRef.current = false;
    setBoardPresentation(null);
    setResolveAnimating(false);
    setPersistedLastRound(null);
    setSessionNotice("");
  }

  useEffect(() => {
    dealAnimatedKeyRef.current = null;
    splitAnimatedKeyRef.current = null;
  }, [session?.id]);

  useEffect(() => {
    const rs = String(session?.challenge21?.readState || "");
    if (!session?.id || rs !== "ready") return;
    if (persistedLastRound || resolvedResult || resolveAnimating) return;
    if (uiState !== UI_STATE.SESSION_ACTIVE) return;
    const p = session?.challenge21?.playing;
    if (!p?.playerHands?.[0] || p.playerHands[0].length < 2) return;
    const fp = `deal-${session.id}`;
    if (dealAnimatedKeyRef.current === fp) return;
    dealAnimatedKeyRef.current = fp;
    const runId = ++presentationRunIdRef.current;
    void runInitialDealPresentation(p, runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: deal once per session when ready
  }, [
    session?.id,
    session?.challenge21?.readState,
    session?.challenge21?.playing,
    persistedLastRound,
    resolvedResult,
    resolveAnimating,
    uiState,
  ]);

  useEffect(() => {
    const sid = session?.id;
    const c21 = session?.challenge21;
    if (!sid || !c21 || uiState !== UI_STATE.SESSION_ACTIVE) return;
    if (!c21.canResolveTurn) return;
    if (c21.readState !== "action_submitted") return;
    if (resolveInFlightRef.current || submitInFlightRef.current) return;
    void handleResolvePendingAction(sid, cycleRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume-only resolve
  }, [session?.id, session?.challenge21?.readState, session?.challenge21?.canResolveTurn, uiState]);

  const numericWager = parseWagerInput(wagerInput);
  const wagerPlayable =
    vaultReady && numericWager >= CHALLENGE_21_MIN_WAGER && vaultBalance >= numericWager;

  const idleLike =
    uiState === UI_STATE.IDLE ||
    uiState === UI_STATE.UNAVAILABLE ||
    uiState === UI_STATE.PENDING_MIGRATION;
  const stakeExceedsVault =
    vaultReady &&
    idleLike &&
    numericWager >= CHALLENGE_21_MIN_WAGER &&
    vaultBalance < numericWager;
  const stakeHint = stakeExceedsVault
    ? `Stake exceeds available vault (${formatCompact(vaultBalance)}). Lower amount to start.`
    : "";

  const canStart =
    !inChallengeLoop &&
    wagerPlayable &&
    ![UI_STATE.LOADING, UI_STATE.SUBMITTING_PICK, UI_STATE.RESOLVING, UI_STATE.PENDING_MIGRATION].includes(
      uiState,
    ) &&
    (uiState === UI_STATE.IDLE || uiState === UI_STATE.UNAVAILABLE);

  const isPrimaryLoading = uiState === UI_STATE.LOADING;

  const c21Snap = session?.challenge21;
  const playing = c21Snap?.playing;

  const runEntryFromSession =
    session != null &&
    Number(session.entryAmount) >= CHALLENGE_21_MIN_WAGER &&
    Number.isFinite(Number(session.entryAmount))
      ? Math.floor(Number(session.entryAmount))
      : null;

  let summaryPlay = numericWager;
  const baseForHud = Math.max(CHALLENGE_21_MIN_WAGER, numericWager);
  let summaryWin = Math.floor(baseForHud * 2.5);

  const inActiveRunUi =
    uiState === UI_STATE.SESSION_ACTIVE ||
    uiState === UI_STATE.SUBMITTING_PICK ||
    uiState === UI_STATE.RESOLVING ||
    uiState === UI_STATE.LOADING;

  if (runEntryFromSession != null && (inActiveRunUi || uiState === UI_STATE.RESOLVED)) {
    summaryPlay = runEntryFromSession;
    summaryWin = Math.floor(runEntryFromSession * 2.5);
  }

  if (uiState === UI_STATE.RESOLVED && resolvedResult?.settlementSummary) {
    const ss = resolvedResult.settlementSummary;
    summaryPlay = Math.max(0, Math.floor(Number(ss.totalRisked ?? ss.entryCost) || summaryPlay));
    summaryWin = Math.max(0, Math.floor(Number(ss.payoutReturn) || 0));
  }

  const resolvedIsWin = Boolean(resolvedResult?.isWin);
  const resolvedIsPush = Boolean(resolvedResult?.isPush);
  const resultTone = resolvedIsPush ? "push" : resolvedIsWin ? "win" : "lose";
  const popupTitle = resolvedIsPush ? "PUSH" : resolvedIsWin ? "YOU WIN" : "YOU LOSE";

  const pt = Number(resolvedResult?.playerTotal);
  const ot = Number(resolvedResult?.opponentTotal);
  const popupLine2 =
    Number.isFinite(pt) && Number.isFinite(ot) ? `You ${pt} · Opponent ${ot}` : "Round finished";
  const premiumNat = Boolean(resolvedResult?.premiumNaturalWin);
  const oppNatBeat =
    !resolvedIsWin &&
    !resolvedIsPush &&
    Boolean(resolvedResult?.opponentNatural21) &&
    !resolvedResult?.playerBust;
  const bothNatPush =
    resolvedIsPush && Boolean(resolvedResult?.resolvedViaNatural21 && resolvedResult?.playerNatural21);
  const insRet = Number(resolvedResult?.insuranceReturn || 0);
  const insStake = Number(resolvedResult?.insuranceStake || 0);
  const multiHands = Array.isArray(resolvedResult?.handResults) && resolvedResult.handResults.length > 1;

  let popupLine3 = resolvedIsPush
    ? bothNatPush
      ? "Both natural 21 — stake returned."
      : "Same total — stake returned."
    : resolvedIsWin
      ? premiumNat || resolvedResult?.blackjackWin
        ? "Blackjack pays 2.5× on that hand."
        : multiHands
          ? "One or more hands won this round."
          : "Your total wins this round."
      : resolvedResult?.playerBust
        ? "You went over 21."
        : oppNatBeat
          ? "Opponent reached 21 with their first two cards."
          : "Opponent wins this round.";
  if (insStake > 0 && insRet > 0) {
    popupLine3 = `${popupLine3} Insurance paid.`;
  } else if (insStake > 0 && insRet === 0 && !resolvedIsPush) {
    popupLine3 = `${popupLine3} Insurance did not hit.`;
  }

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
    void runStartChallenge();
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
    uiState === UI_STATE.LOADING ||
    Boolean(boardPresentation) ||
    resolveAnimating;

  const readState = String(c21Snap?.readState || "");
  const needsNextHand =
    inChallengeLoop &&
    persistedLastRound &&
    uiState === UI_STATE.SESSION_ACTIVE &&
    readState === "ready";

  const allowedDecisionsLive = Array.isArray(playing?.allowedDecisions) ? playing.allowedDecisions : [];
  const insurancePendingLive = Boolean(playing?.insurancePending);
  const activeIdxLive = Math.max(0, Math.floor(Number(playing?.activeHandIndex) || 0));

  const resolved = uiState === UI_STATE.RESOLVED && resolvedResult;
  const persisted = persistedLastRound;

  let displayPlayerHands = [];
  let displayPlayer = [];
  let displayActiveIndex = 0;
  let displayOppVisible = [];
  let displayOppResolved = null;
  let holeHidden = true;

  if (resolved && resolvedResult) {
    const ph = Array.isArray(resolvedResult.playerHand) ? resolvedResult.playerHand : [];
    displayPlayerHands =
      Array.isArray(resolvedResult.playerHands) && resolvedResult.playerHands.length > 0
        ? resolvedResult.playerHands.map(h => (Array.isArray(h) ? h : []))
        : [ph];
    displayPlayer = ph;
    displayOppResolved = Array.isArray(resolvedResult.opponentHand) ? resolvedResult.opponentHand : [];
    holeHidden = false;
  } else if (persisted) {
    const ph = Array.isArray(persisted.playerHand) ? persisted.playerHand : [];
    displayPlayerHands =
      Array.isArray(persisted.playerHands) && persisted.playerHands.length > 0
        ? persisted.playerHands.map(h => (Array.isArray(h) ? h : []))
        : [ph];
    displayPlayer = ph;
    displayOppResolved = persisted.opponentHand || [];
    holeHidden = false;
  } else if (playing) {
    displayPlayerHands = Array.isArray(playing.playerHands) ? playing.playerHands : [];
    displayPlayer = playing.playerHand || [];
    displayActiveIndex = activeIdxLive;
    displayOppVisible = playing.opponentVisibleHand || [];
    holeHidden = playing.holeHidden !== false;
  }

  const panelPlayerHands = boardPresentation?.playerHands ?? displayPlayerHands;
  const panelActiveIndex =
    boardPresentation?.activeHandIndex != null ? boardPresentation.activeHandIndex : displayActiveIndex;

  const actionsHidden =
    Boolean(persisted) ||
    resolved ||
    uiState !== UI_STATE.SESSION_ACTIVE ||
    readState !== "ready" ||
    Boolean(boardPresentation) ||
    resolveAnimating;

  let statusTop = "Reach 21 without going over.";
  let statusSub = "Press START 21 CHALLENGE to begin.";
  if (inChallengeLoop && uiState === UI_STATE.SESSION_ACTIVE && readState === "ready" && !persisted) {
    if (insurancePendingLive) {
      statusTop = "Opponent shows an ace — insurance offered.";
      statusSub = "Half stake side bet pays 2:1 if they have blackjack.";
    } else {
      statusTop = "Hit, stand, double, or split when available.";
      const live = displayPlayerHands[displayActiveIndex] || displayPlayer;
      const pv = live.length ? handTotal(live) : null;
      const ov = upCardShowValue(displayOppVisible.length ? displayOppVisible : displayOppResolved || []);
      statusSub =
        pv != null && live.length >= 1
          ? `${displayPlayerHands.length > 1 ? `Hand ${displayActiveIndex + 1}: ` : ""}You ${pv}. Opponent shows ${ov || "—"}.`
          : "\u00a0";
    }
  } else if (persisted && inChallengeLoop && readState === "ready") {
    statusTop = `Last round: ${persisted.isPush ? "Push" : persisted.isWin ? "You won" : "You lost"}.`;
    statusSub = "Tap NEXT HAND to continue.";
  } else if (uiState === UI_STATE.RESOLVED && resolvedResult) {
    const r = resolvedResult;
    if (r.playerBust) {
      statusTop = `You busted at ${r.playerTotal}.`;
      statusSub = "\u00a0";
    } else if (r.isPush) {
      statusTop = `Push at ${r.playerTotal}.`;
      statusSub = "\u00a0";
    } else if (r.isWin) {
      statusTop = r.blackjackWin || r.premiumNaturalWin ? "Blackjack — you win." : `You win with ${r.playerTotal}.`;
      statusSub =
        r.insuranceReturn > 0 && r.insuranceStake > 0
          ? `Insurance returned ${formatCompact(r.insuranceReturn)}.`
          : "\u00a0";
    } else {
      statusTop = `You ${r.playerTotal} · Opponent ${r.opponentTotal}.`;
      statusSub = "\u00a0";
    }
  }

  return (
    <SoloV2GameShell
      title="21 Challenge"
      subtitle="Reach 21 without going over."
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
            Win{" "}
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
            return String(Math.min(MAX_WAGER, Math.max(0, c - CHALLENGE_21_MIN_WAGER)));
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
          setWagerInput(String(CHALLENGE_21_MIN_WAGER));
        },
        primaryActionLabel: needsNextHand ? "NEXT HAND" : "START 21 CHALLENGE",
        primaryActionDisabled: needsNextHand ? false : !canStart,
        primaryActionLoading: isPrimaryLoading,
        primaryLoadingLabel: "STARTING…",
        onPrimaryAction: () => {
          if (needsNextHand) handleNextHand();
          else void runStartChallenge();
        },
        errorMessage: errorMessage || stakeHint,
      }}
      gameplaySlot={
        <Challenge21GameplayPanel
          sessionNotice={sessionNotice}
          statusTop={statusTop}
          statusSub={statusSub}
          playerHands={panelPlayerHands}
          activeHandIndex={panelActiveIndex}
          playerHand={displayPlayer}
          opponentVisibleHand={displayOppVisible}
          opponentHandResolved={displayOppResolved}
          holeHidden={holeHidden}
          presentation={boardPresentation}
          allowedDecisions={actionsHidden ? [] : allowedDecisionsLive}
          insurancePending={insurancePendingLive}
          entryAmount={runEntryFromSession ?? numericWager}
          onBoardAction={d => {
            if (busyFooter || actionsHidden) return;
            void submitAction(d);
          }}
          actionsHidden={actionsHidden}
          resultPopupOpen={resultPopupOpen}
          resolvedIsWin={resolvedIsWin}
          resultTone={resultTone}
          popupLine2={popupLine2}
          popupLine3={popupLine3}
          resultVaultLabel={resultVaultLabel}
          popupTitle={popupTitle}
        />
      }
      helpContent={
        <div className="space-y-2">
          <p>
            Two cards each to start; one opponent card stays hidden until the right time. HIT, STAND, DOUBLE (one card,
            double stake on that hand), or SPLIT matching ranks once. Split aces receive one card each and then stand.
            When the opponent shows an ace, INSURE or DECLINE before play continues — insurance is half your stake and
            pays 2:1 if they have blackjack.
          </p>
          <p>
            Blackjack (natural 21 on your first two cards, not after a split) pays 2.5× return on that hand. Other wins pay
            2×; push returns your stake; bust loses. The opponent draws to 17 or higher and stands on all 17.
          </p>
        </div>
      }
      resultState={null}
    />
  );
}
