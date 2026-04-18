import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOv2TileRushDuelSnapshot,
  OV2_TILE_RUSH_DUEL_PRODUCT_GAME_ID,
  requestOv2TileRushDuelMarkMatchEvents,
  requestOv2TileRushDuelPing,
  requestOv2TileRushDuelRemovePair,
  requestOv2TileRushDuelRequestRematch,
  requestOv2TileRushDuelCancelRematch,
  requestOv2TileRushDuelStartNextMatch,
  subscribeOv2TileRushDuelSnapshot,
} from "../lib/online-v2/tilerushduel/ov2TileRushDuelSessionAdapter";
import { requestOv2TileRushDuelClaimSettlement } from "../lib/online-v2/tilerushduel/ov2TileRushDuelSettlement";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../lib/online-v2/ov2Economy";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2TileRushDuelSession(baseContext) {
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
  const processedDuelEndKeysRef = useRef(/** @type {Set<string>} */ (new Set()));

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    processedDuelEndKeysRef.current.clear();
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
    if (!roomId || roomProductId !== OV2_TILE_RUSH_DUEL_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2TileRushDuelSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(s ?? null);
    })();
    const unsub = subscribeOv2TileRushDuelSnapshot(roomId, {
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
        const claim = await requestOv2TileRushDuelClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyBoardPathSettlementClaimLinesToVault(claim.lines, ONLINE_V2_GAME_KINDS.TILE_RUSH_DUEL);
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
    if (!roomId || !selfKey || roomProductId !== OV2_TILE_RUSH_DUEL_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    const phase = s ? String(s.phase || "").toLowerCase() : "";
    if (phase !== "playing") return undefined;
    const dl = s.duelEndMs != null ? Number(s.duelEndMs) : NaN;
    const sid = String(s.sessionId || "").trim();
    if (!sid || !Number.isFinite(dl)) return undefined;
    const turnKey = `${sid}|duel|${dl}|${s.revision ?? 0}`;
    if (processedDuelEndKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, dl - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedDuelEndKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur) return;
        const ph = String(cur.phase || "").toLowerCase();
        if (ph !== "playing") return;
        const vdl = cur.duelEndMs != null ? Number(cur.duelEndMs) : NaN;
        const vsid = String(cur.sessionId || "").trim();
        const vkey = `${vsid}|duel|${vdl}|${cur.revision ?? 0}`;
        if (vkey !== turnKey || Date.now() < vdl) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2TileRushDuelMarkMatchEvents(roomId, selfKey, {
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
          processedDuelEndKeysRef.current.add(turnKey);
        }
      })();
    }, ms);
    return () => window.clearTimeout(t);
  }, [roomId, selfKey, roomProductId, snap?.sessionId, snap?.duelEndMs, snap?.phase, snap?.revision]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_TILE_RUSH_DUEL_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    if (!s || String(s.phase || "").toLowerCase() !== "playing") return undefined;
    const id = window.setInterval(() => {
      void requestOv2TileRushDuelMarkMatchEvents(roomId, selfKey, { revision: snapRef.current?.revision });
    }, 30000);
    return () => window.clearInterval(id);
  }, [roomId, selfKey, roomProductId, snap?.phase, snap?.sessionId]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_TILE_RUSH_DUEL_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    if (!s || String(s.phase || "").toLowerCase() !== "playing") return undefined;
    const tick = () => {
      void requestOv2TileRushDuelPing(roomId, selfKey, { revision: snapRef.current?.revision });
    };
    tick();
    const id = window.setInterval(tick, 25000);
    return () => window.clearInterval(id);
  }, [roomId, selfKey, roomProductId, snap?.phase, snap?.sessionId]);

  const removePair = useCallback(
    async (r1, c1, r2, c2) => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (snap.mySeat !== 0 && snap.mySeat !== 1) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2TileRushDuelRemovePair(roomId, selfKey, r1, c1, r2, c2, {
          mySeat: snap.mySeat,
          cols: snap.cols,
          revision: snap.revision,
        });
        if (!r.ok) {
          setErr(r.error || "Could not remove pair");
          return { ok: false, code: r.code };
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
    return requestOv2TileRushDuelRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2TileRushDuelCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2TileRushDuelStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const duelEndMs = snap?.duelEndMs != null && Number.isFinite(Number(snap.duelEndMs)) ? Number(snap.duelEndMs) : null;
    const duelTimeLeftSec =
      phase === "playing" && duelEndMs != null ? Math.max(0, Math.ceil((duelEndMs - nowMs) / 1000)) : null;
    return {
      phase,
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      tiles: Array.isArray(snap?.tiles) ? snap.tiles : [],
      rows: snap?.rows ?? 6,
      cols: snap?.cols ?? 4,
      score0: snap?.score0 ?? 0,
      score1: snap?.score1 ?? 0,
      myScore: snap?.myScore ?? null,
      duelEndMs,
      duelTimeLeftSec,
      remainingTiles: snap?.remainingTiles ?? null,
      result: snap?.result ?? null,
    };
  }, [snap, nowMs]);

  return {
    snapshot: snap,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    removePair,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
