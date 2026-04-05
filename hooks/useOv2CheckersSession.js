import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOv2CheckersSnapshot,
  OV2_CHECKERS_PRODUCT_GAME_ID,
  requestOv2CheckersApplyStep,
  requestOv2CheckersCancelRematch,
  requestOv2CheckersMarkTurnTimeout,
  requestOv2CheckersRequestRematch,
  requestOv2CheckersStartNextMatch,
  subscribeOv2CheckersSnapshot,
} from "../lib/online-v2/checkers/ov2CheckersSessionAdapter";
import { requestOv2CheckersClaimSettlement } from "../lib/online-v2/checkers/ov2CheckersSettlement";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import {
  normalizeOv2CheckersCells,
  ov2CheckersLegalTosForFrom,
} from "../lib/online-v2/checkers/ov2CheckersClientLegality";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2CheckersSession(baseContext) {
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const vaultFinishedRef = useRef(/** @type {string|null} */ (null));
  const vaultLinesAppliedForSessionRef = useRef(/** @type {Set<string>} */ (new Set()));
  const snapRef = useRef(/** @type {typeof snap} */ (null));
  const processedTurnTimeoutKeysRef = useRef(/** @type {Set<string>} */ (new Set()));

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    processedTurnTimeoutKeysRef.current.clear();
    setVaultClaimBusy(false);
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
    if (!roomId || roomProductId !== OV2_CHECKERS_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2CheckersSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(s ?? null);
    })();
    const unsub = subscribeOv2CheckersSnapshot(roomId, {
      participantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setSnap(s);
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
    vaultFinishedRef.current = sid;
    setVaultClaimBusy(true);
    void (async () => {
      try {
        const claim = await requestOv2CheckersClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyBoardPathSettlementClaimLinesToVault(claim.lines, OV2_CHECKERS_PRODUCT_GAME_ID);
            vaultLinesAppliedForSessionRef.current.add(sid);
          }
        } else if (!claim.ok) {
          vaultFinishedRef.current = null;
        }
      } catch {
        vaultFinishedRef.current = null;
      } finally {
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
        setVaultClaimBusy(false);
      }
    })();
  }, [snap, roomId, selfKey]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_CHECKERS_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    if (!s || String(s.phase || "").toLowerCase() !== "playing") return undefined;
    const dl = s.turnDeadline != null ? Number(s.turnDeadline) : NaN;
    const sid = String(s.sessionId || "").trim();
    const turn = s.turnSeat != null ? Number(s.turnSeat) : NaN;
    if (!sid || !Number.isFinite(dl) || !Number.isInteger(turn) || (turn !== 0 && turn !== 1)) return undefined;
    const turnKey = `${sid}|${dl}|${turn}`;
    if (processedTurnTimeoutKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, dl - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedTurnTimeoutKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur || String(cur.phase || "").toLowerCase() !== "playing") return;
        const vdl = cur.turnDeadline != null ? Number(cur.turnDeadline) : NaN;
        const vsid = String(cur.sessionId || "").trim();
        const vturn = cur.turnSeat != null ? Number(cur.turnSeat) : NaN;
        const vkey = `${vsid}|${vdl}|${vturn}`;
        if (vkey !== turnKey || Date.now() < vdl) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2CheckersMarkTurnTimeout(roomId, selfKey, {
          revision: cur.revision,
        });
        if (r.ok && r.snapshot) setSnap(r.snapshot);
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
  ]);

  const applyStep = useCallback(
    async (fromIdx, toIdx) => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2CheckersApplyStep(roomId, selfKey, fromIdx, toIdx, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Move failed");
          return { ok: false };
        }
        if (r.snapshot) setSnap(r.snapshot);
        return { ok: true };
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snap]
  );

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2CheckersRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2CheckersCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2CheckersStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const board = snap?.board && typeof snap.board === "object" ? snap.board : {};
    const cellsRaw = board.cells;
    const cells = normalizeOv2CheckersCells(Array.isArray(cellsRaw) ? cellsRaw : []);
    const missed = snap?.missedTurns && typeof snap.missedTurns === "object" ? snap.missedTurns : {};
    const m0 = Math.max(0, Math.min(3, Number(missed["0"] ?? missed[0] ?? 0) || 0));
    const m1 = Math.max(0, Math.min(3, Number(missed["1"] ?? missed[1] ?? 0) || 0));
    const turnDeadline = snap?.turnDeadline != null && Number.isFinite(Number(snap.turnDeadline)) ? Number(snap.turnDeadline) : null;
    const turnTimeLeftMs =
      phase === "playing" && turnDeadline != null ? Math.max(0, turnDeadline - nowMs) : null;
    const turnTimeLeftSec = turnTimeLeftMs != null ? Math.ceil(turnTimeLeftMs / 1000) : null;
    const turnSeat = snap?.turnSeat ?? null;
    const mySeatVm = snap?.mySeat ?? null;
    const jumpChainAtVm =
      snap?.jumpChainAt != null && Number.isFinite(Number(snap.jumpChainAt)) ? Number(snap.jumpChainAt) : null;
    const chainLegals =
      phase === "playing" && jumpChainAtVm != null && turnSeat != null
        ? ov2CheckersLegalTosForFrom(cells, turnSeat, jumpChainAtVm, jumpChainAtVm)
        : [];
    const chainUnblocks =
      jumpChainAtVm != null &&
      chainLegals.length > 0 &&
      mySeatVm != null &&
      turnSeat != null &&
      Number(mySeatVm) === Number(turnSeat);
    return {
      phase,
      cells,
      turnSeat,
      mySeat: mySeatVm,
      winnerSeat: snap?.winnerSeat ?? null,
      canClientMove: snap?.canClientMove === true || chainUnblocks,
      readOnly: snap?.boardViewReadOnly === true && !chainUnblocks,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      turnDeadline,
      turnTimeLeftSec,
      missedStreakBySeat: { 0: m0, 1: m1 },
      jumpChainAt: jumpChainAtVm,
    };
  }, [snap, nowMs]);

  return {
    snapshot: snap,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    applyStep,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
