import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOv2UiPreviewOptional } from "../lib/online-v2/dev/Ov2UiPreviewContext";
import {
  fetchOv2DominoesSnapshot,
  OV2_DOMINOES_PRODUCT_GAME_ID,
  requestOv2DominoesDraw,
  requestOv2DominoesMarkTurnTimeout,
  requestOv2DominoesOfferDouble,
  requestOv2DominoesPass,
  requestOv2DominoesPlayTile,
  requestOv2DominoesRequestRematch,
  requestOv2DominoesCancelRematch,
  requestOv2DominoesRespondDouble,
  requestOv2DominoesStartNextMatch,
  subscribeOv2DominoesSnapshot,
} from "../lib/online-v2/dominoes/ov2DominoesSessionAdapter";
import { requestOv2DominoesClaimSettlement } from "../lib/online-v2/dominoes/ov2DominoesSettlement";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2DominoesSession(baseContext) {
  const preview = useOv2UiPreviewOptional("dominoes");
  if (preview) return preview;
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const activeSessionKey =
    room?.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id)
      : "";
  const selfKey = baseContext?.self?.participant_key?.trim() || null;
  const isHost = Boolean(room?.host_participant_key && selfKey && room.host_participant_key === selfKey);

  const [snap, setSnap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);
  const [vaultClaimError, setVaultClaimError] = useState("");
  const [vaultClaimRetryTick, setVaultClaimRetryTick] = useState(0);
  const [settlementPrizeAmount, setSettlementPrizeAmount] = useState(/** @type {number|null} */ (null));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const vaultFinishedRef = useRef(/** @type {string|null} */ (null));
  const vaultLinesAppliedForSessionRef = useRef(/** @type {Set<string>} */ (new Set()));
  const snapRef = useRef(/** @type {typeof snap} */ (null));
  const processedTurnTimeoutKeysRef = useRef(/** @type {Set<string>} */ (new Set()));
  const vaultClaimInFlightRef = useRef(false);

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    processedTurnTimeoutKeysRef.current.clear();
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    setSettlementPrizeAmount(null);
    vaultClaimInFlightRef.current = false;
  }, [roomId, activeSessionKey]);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_DOMINOES_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2DominoesSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(prev => ov2PreferNewerSnapshot(prev, s ?? null));
    })();
    const unsub = subscribeOv2DominoesSnapshot(roomId, {
      participantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setSnap(prev => ov2PreferNewerSnapshot(prev, s));
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, selfKey, activeSessionKey]);

  useEffect(() => {
    if (!snap || String(snap.phase || "").toLowerCase() !== "finished" || !roomId || !selfKey) return;
    const sid = String(snap.sessionId || "").trim();
    if (!sid || vaultFinishedRef.current === sid) return;
    if (vaultClaimInFlightRef.current) return;
    vaultClaimInFlightRef.current = true;
    setSettlementPrizeAmount(null);
    setVaultClaimBusy(true);
    setVaultClaimError("");
    void (async () => {
      try {
        const claim = await requestOv2DominoesClaimSettlement(roomId, selfKey);
        if (!claim.ok) {
          setVaultClaimError(String(claim.error || claim.message || "Could not update balance."));
        } else {
          if (Array.isArray(claim.lines) && claim.lines.length > 0) {
            if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
              await applyBoardPathSettlementClaimLinesToVault(claim.lines, OV2_DOMINOES_PRODUCT_GAME_ID);
              vaultLinesAppliedForSessionRef.current.add(sid);
            }
          }
          const ta = claim.total_amount != null ? Number(claim.total_amount) : NaN;
          if (Number.isFinite(ta) && ta >= 0) setSettlementPrizeAmount(ta);
          setVaultClaimError("");
          vaultFinishedRef.current = sid;
        }
      } catch (e) {
        setVaultClaimError(e instanceof Error ? e.message : String(e));
      } finally {
        vaultClaimInFlightRef.current = false;
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
        setVaultClaimBusy(false);
      }
    })();
  }, [snap, roomId, selfKey, vaultClaimRetryTick]);

  const retryVaultClaim = useCallback(() => {
    vaultFinishedRef.current = null;
    vaultClaimInFlightRef.current = false;
    setVaultClaimError("");
    setVaultClaimRetryTick(t => t + 1);
  }, []);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_DOMINOES_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    if (!s || String(s.phase || "").toLowerCase() !== "playing") return undefined;
    const dl = s.turnDeadline != null ? Number(s.turnDeadline) : NaN;
    const sid = String(s.sessionId || "").trim();
    if (!sid || !Number.isFinite(dl)) return undefined;
    const turnSeat = s.turnSeat != null ? Number(s.turnSeat) : NaN;
    const pd = s.pendingDouble && typeof s.pendingDouble === "object" ? s.pendingDouble : null;
    const dlSeat = pd?.responder_seat != null ? Number(pd.responder_seat) : turnSeat;
    if (!Number.isInteger(dlSeat) || (dlSeat !== 0 && dlSeat !== 1)) return undefined;
    const turnKey = `${sid}|${dl}|${dlSeat}|${pd ? "dbl" : "mv"}`;
    if (processedTurnTimeoutKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, dl - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedTurnTimeoutKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur || String(cur.phase || "").toLowerCase() !== "playing") return;
        const vdl = cur.turnDeadline != null ? Number(cur.turnDeadline) : NaN;
        const vsid = String(cur.sessionId || "").trim();
        const vPd = cur.pendingDouble && typeof cur.pendingDouble === "object" ? cur.pendingDouble : null;
        const vDlSeat = vPd?.responder_seat != null ? Number(vPd.responder_seat) : Number(cur.turnSeat);
        const vkey = `${vsid}|${vdl}|${vDlSeat}|${vPd ? "dbl" : "mv"}`;
        if (vkey !== turnKey || Date.now() < vdl) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2DominoesMarkTurnTimeout(roomId, selfKey, {
          revision: cur.revision,
        });
        if (r.ok && r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
        const sn = r.snapshot && typeof r.snapshot === "object" ? r.snapshot : null;
        const revAfter = sn?.revision != null ? Number(sn.revision) : NaN;
        const phaseAfter = sn ? String(sn.phase || "").toLowerCase() : "";
        if (
          r.ok &&
          sn &&
          (phaseAfter === "finished" || (Number.isFinite(revBefore) && Number.isFinite(revAfter) && revAfter !== revBefore))
        ) {
          processedTurnTimeoutKeysRef.current.add(turnKey);
        }
      })();
    }, ms);
    return () => window.clearTimeout(t);
  }, [
    roomId,
    selfKey,
    roomProductId,
    snap?.sessionId,
    snap?.turnDeadline,
    snap?.turnSeat,
    snap?.phase,
    snap?.revision,
    snap?.pendingDouble,
  ]);

  const playTile = useCallback(
    async (handIndex, side) => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (busy) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2DominoesPlayTile(roomId, selfKey, handIndex, side, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Move failed");
          return { ok: false };
        }
        if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
        return { ok: true };
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snap, busy]
  );

  const drawOne = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2DominoesDraw(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Draw failed");
        return { ok: false };
      }
      if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
      return { ok: true };
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snap, busy]);

  const passTurn = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2DominoesPass(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Pass failed");
        return { ok: false };
      }
      if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
      return { ok: true };
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snap, busy]);

  const offerDouble = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2DominoesOfferDouble(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Could not propose stake increase");
        return { ok: false };
      }
      if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
      return { ok: true };
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snap, busy]);

  const respondDouble = useCallback(
    async accept => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (busy) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2DominoesRespondDouble(roomId, selfKey, accept, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Response failed");
          return { ok: false };
        }
        if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
        return { ok: true };
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snap, busy]
  );

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2DominoesRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2DominoesCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2DominoesStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  /**
   * @param {Record<string, unknown>|null|undefined} res
   */
  const parseResultVm = useCallback(res => {
    if (!res || typeof res !== "object") {
      return {
        result: null,
        resultWinner: null,
        resultDraw: false,
        resultBlocked: false,
        resultEmptyHand: false,
        resultDoubleDeclined: false,
        resultDoubleTimeout: false,
        resultTimeoutLoserSeat: null,
        resultForfeitBy: "",
        resultPrize: null,
        resultLossPerSeat: null,
        resultStakeMultiplier: null,
        resultPipTotalsBySeat: /** @type {{ 0: number|null, 1: number|null } | null} */ (null),
      };
    }
    const wRaw = res.winner;
    const resultWinner =
      wRaw !== null && wRaw !== undefined && String(wRaw) !== "" && Number.isFinite(Number(wRaw))
        ? Number(wRaw)
        : null;
    const ptIn = res.pipTotals && typeof res.pipTotals === "object" ? /** @type {Record<string, unknown>} */ (res.pipTotals) : null;
    let resultPipTotalsBySeat = null;
    if (ptIn) {
      const p0 = Number(ptIn["0"] ?? ptIn[0]);
      const p1 = Number(ptIn["1"] ?? ptIn[1]);
      resultPipTotalsBySeat = {
        0: Number.isFinite(p0) ? p0 : null,
        1: Number.isFinite(p1) ? p1 : null,
      };
    }
    const pr = res.prize;
    const resultPrize = pr != null && Number.isFinite(Number(pr)) ? Number(pr) : null;
    const ls = res.lossPerSeat;
    const resultLossPerSeat = ls != null && Number.isFinite(Number(ls)) ? Number(ls) : null;
    const sm = res.stakeMultiplier;
    const resultStakeMultiplier =
      sm != null && Number.isFinite(Number(sm)) ? Math.max(1, Math.min(16, Math.floor(Number(sm)))) : null;
    const tls = res.timeout_loser_seat;
    const resultTimeoutLoserSeat =
      tls !== null && tls !== undefined && String(tls) !== "" && Number.isFinite(Number(tls)) ? Number(tls) : null;
    const fb = res.forfeit_by;
    const resultForfeitBy = fb != null && String(fb).trim() !== "" ? String(fb).trim() : "";
    return {
      result: res,
      resultWinner,
      resultDraw: res.draw === true,
      resultBlocked: res.blocked === true,
      resultEmptyHand: res.empty_hand === true,
      resultDoubleDeclined: res.double_declined === true,
      resultDoubleTimeout: res.double_timeout === true,
      resultTimeoutLoserSeat,
      resultForfeitBy,
      resultPrize,
      resultLossPerSeat,
      resultStakeMultiplier,
      resultPipTotalsBySeat,
    };
  }, []);

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const line = Array.isArray(snap?.line) ? snap.line : [];
    const missed = snap?.missedTurns && typeof snap.missedTurns === "object" ? snap.missedTurns : {};
    const m0 = Math.max(0, Math.min(3, Number(missed["0"] ?? missed[0] ?? 0) || 0));
    const m1 = Math.max(0, Math.min(3, Number(missed["1"] ?? missed[1] ?? 0) || 0));
    const turnDeadline = snap?.turnDeadline != null && Number.isFinite(Number(snap.turnDeadline)) ? Number(snap.turnDeadline) : null;
    const turnTimeLeftMs =
      phase === "playing" && turnDeadline != null ? Math.max(0, turnDeadline - nowMs) : null;
    const turnTimeLeftSec = turnTimeLeftMs != null ? Math.ceil(turnTimeLeftMs / 1000) : null;
    const pd = snap?.pendingDouble && typeof snap.pendingDouble === "object" ? snap.pendingDouble : null;
    const ddl =
      pd && pd.deadline_ms != null && Number.isFinite(Number(pd.deadline_ms)) ? Math.floor(Number(pd.deadline_ms)) : null;
    const doubleTimeLeftMs =
      phase === "playing" && snap?.mustRespondDouble === true && ddl != null ? Math.max(0, ddl - nowMs) : null;
    const doubleTimeLeftSec = doubleTimeLeftMs != null ? Math.ceil(doubleTimeLeftMs / 1000) : null;
    const board = snap?.board && typeof snap.board === "object" ? snap.board : {};
    const resParsed =
      phase === "finished" && snap?.result && typeof snap.result === "object"
        ? parseResultVm(/** @type {Record<string, unknown>} */ (snap.result))
        : parseResultVm(null);
    return {
      phase,
      line,
      board,
      turnSeat: snap?.turnSeat ?? null,
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      turnDeadline,
      turnTimeLeftMs,
      turnTimeLeftSec,
      doubleDeadlineMs: ddl,
      doubleTimeLeftMs,
      doubleTimeLeftSec,
      missedStreakBySeat: { 0: m0, 1: m1 },
      myHand: Array.isArray(snap?.myHand) ? snap.myHand : [],
      oppHandCount: snap?.oppHandCount ?? 0,
      boneyardCount: snap?.boneyardCount ?? 0,
      stakeMultiplier: snap?.stakeMultiplier ?? 1,
      doublesAccepted: snap?.doublesAccepted ?? 0,
      pendingDouble: pd,
      canClientPlayTiles: snap?.canClientPlayTiles === true,
      canOfferDouble: snap?.canOfferDouble === true,
      mustRespondDouble: snap?.mustRespondDouble === true,
      ...resParsed,
    };
  }, [snap, nowMs, parseResultVm]);

  return {
    snapshot: snap,
    vm,
    busy,
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
    settlementPrizeAmount,
    err,
    setErr,
    playTile,
    drawOne,
    passTurn,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
