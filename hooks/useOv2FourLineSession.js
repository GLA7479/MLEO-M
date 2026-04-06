import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOv2UiPreviewOptional } from "../lib/online-v2/dev/Ov2UiPreviewContext";
import {
  fetchOv2FourLineSnapshot,
  OV2_FOURLINE_PRODUCT_GAME_ID,
  requestOv2FourLineMarkTurnTimeout,
  requestOv2FourLineOfferDouble,
  requestOv2FourLinePlayColumn,
  requestOv2FourLineRequestRematch,
  requestOv2FourLineCancelRematch,
  requestOv2FourLineRespondDouble,
  requestOv2FourLineStartNextMatch,
  subscribeOv2FourLineSnapshot,
} from "../lib/online-v2/fourline/ov2FourLineSessionAdapter";
import { requestOv2FourLineClaimSettlement } from "../lib/online-v2/fourline/ov2FourLineSettlement";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2FourLineSession(baseContext) {
  const preview = useOv2UiPreviewOptional("fourline");
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
    if (!roomId || roomProductId !== OV2_FOURLINE_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2FourLineSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(s ?? null);
    })();
    const unsub = subscribeOv2FourLineSnapshot(roomId, {
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
        const claim = await requestOv2FourLineClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyBoardPathSettlementClaimLinesToVault(claim.lines, OV2_FOURLINE_PRODUCT_GAME_ID);
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
    if (!roomId || !selfKey || roomProductId !== OV2_FOURLINE_PRODUCT_GAME_ID) return undefined;
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
        const r = await requestOv2FourLineMarkTurnTimeout(roomId, selfKey, {
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
    snap?.pendingDouble,
  ]);

  const playColumn = useCallback(
    async col => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2FourLinePlayColumn(roomId, selfKey, col, { revision: snap.revision });
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

  const offerDouble = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2FourLineOfferDouble(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Could not propose stake increase");
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
  }, [roomId, selfKey, snap]);

  const respondDouble = useCallback(
    async accept => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2FourLineRespondDouble(roomId, selfKey, accept, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Response failed");
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
    return requestOv2FourLineRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2FourLineCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2FourLineStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const missed = snap?.missedTurns && typeof snap.missedTurns === "object" ? snap.missedTurns : {};
    const m0 = Math.max(0, Math.min(3, Number(missed["0"] ?? missed[0] ?? 0) || 0));
    const m1 = Math.max(0, Math.min(3, Number(missed["1"] ?? missed[1] ?? 0) || 0));
    const turnDeadline = snap?.turnDeadline != null && Number.isFinite(Number(snap.turnDeadline)) ? Number(snap.turnDeadline) : null;
    const turnTimeLeftMs =
      phase === "playing" && turnDeadline != null ? Math.max(0, turnDeadline - nowMs) : null;
    const turnTimeLeftSec = turnTimeLeftMs != null ? Math.ceil(turnTimeLeftMs / 1000) : null;
    return {
      phase,
      turnSeat: snap?.turnSeat ?? null,
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      turnDeadline,
      turnTimeLeftSec,
      missedStreakBySeat: { 0: m0, 1: m1 },
      cells: Array.isArray(snap?.cells) ? snap.cells : [],
      lastMove: snap?.lastMove ?? null,
      stakeMultiplier: snap?.stakeMultiplier ?? 1,
      doublesAccepted: snap?.doublesAccepted ?? 0,
      pendingDouble: snap?.pendingDouble ?? null,
      canOfferDouble: snap?.canOfferDouble === true,
      mustRespondDouble: snap?.mustRespondDouble === true,
    };
  }, [snap, nowMs]);

  return {
    snapshot: snap,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    playColumn,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
