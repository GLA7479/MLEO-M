import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOv2UiPreviewOptional } from "../lib/online-v2/dev/Ov2UiPreviewContext";
import {
  fetchOv2GoalDuelSnapshot,
  OV2_GOAL_DUEL_PRODUCT_GAME_ID,
  requestOv2GoalDuelMarkMatchEvents,
  requestOv2GoalDuelPing,
  requestOv2GoalDuelStep,
  requestOv2GoalDuelRequestRematch,
  requestOv2GoalDuelCancelRematch,
  requestOv2GoalDuelStartNextMatch,
  subscribeOv2GoalDuelSnapshot,
} from "../lib/online-v2/goal-duel/ov2GoalDuelSessionAdapter";
import { requestOv2GoalDuelClaimSettlement } from "../lib/online-v2/goal-duel/ov2GoalDuelSettlement";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../lib/online-v2/ov2Economy";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2GoalDuelSession(baseContext) {
  const preview = useOv2UiPreviewOptional("goalduel");
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
  const processedMatchEndKeysRef = useRef(/** @type {Set<string>} */ (new Set()));
  const inputRef = useRef({ l: false, r: false, j: false, k: false });

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    processedMatchEndKeysRef.current.clear();
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
    if (!roomId || roomProductId !== OV2_GOAL_DUEL_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2GoalDuelSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(s ?? null);
    })();
    const unsub = subscribeOv2GoalDuelSnapshot(roomId, {
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
        const claim = await requestOv2GoalDuelClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyBoardPathSettlementClaimLinesToVault(claim.lines, ONLINE_V2_GAME_KINDS.GOAL_DUEL);
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
    if (!roomId || !selfKey || roomProductId !== OV2_GOAL_DUEL_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    const phase = s ? String(s.phase || "").toLowerCase() : "";
    if (phase !== "playing") return undefined;
    const me = s.matchEndMs != null ? Number(s.matchEndMs) : NaN;
    const sid = String(s.sessionId || "").trim();
    if (!sid || !Number.isFinite(me)) return undefined;
    const turnKey = `${sid}|match|${me}|${s.revision ?? 0}`;
    if (processedMatchEndKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, me - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedMatchEndKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur) return;
        const ph = String(cur.phase || "").toLowerCase();
        if (ph !== "playing") return;
        const vme = cur.matchEndMs != null ? Number(cur.matchEndMs) : NaN;
        const vsid = String(cur.sessionId || "").trim();
        const vkey = `${vsid}|match|${vme}|${cur.revision ?? 0}`;
        if (vkey !== turnKey || Date.now() < vme) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2GoalDuelMarkMatchEvents(roomId, selfKey, {
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
          processedMatchEndKeysRef.current.add(turnKey);
        }
      })();
    }, ms);
    return () => window.clearTimeout(t);
  }, [roomId, selfKey, roomProductId, snap?.sessionId, snap?.matchEndMs, snap?.phase, snap?.revision]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_GOAL_DUEL_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    if (!s || String(s.phase || "").toLowerCase() !== "playing") return undefined;
    const id = window.setInterval(() => {
      void requestOv2GoalDuelMarkMatchEvents(roomId, selfKey, { revision: snapRef.current?.revision });
    }, 30000);
    return () => window.clearInterval(id);
  }, [roomId, selfKey, roomProductId, snap?.phase, snap?.sessionId]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_GOAL_DUEL_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    if (!s || String(s.phase || "").toLowerCase() !== "playing") return undefined;
    const tick = () => {
      void requestOv2GoalDuelPing(roomId, selfKey, { revision: snapRef.current?.revision });
    };
    tick();
    const id = window.setInterval(tick, 25000);
    return () => window.clearInterval(id);
  }, [roomId, selfKey, roomProductId, snap?.phase, snap?.sessionId]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_GOAL_DUEL_PRODUCT_GAME_ID) return undefined;
    if (!snap || String(snap.phase || "").toLowerCase() !== "playing") return undefined;
    let cancelled = false;
    const loop = window.setInterval(() => {
      if (cancelled) return;
      const i = inputRef.current;
      void (async () => {
        const r = await requestOv2GoalDuelStep(roomId, selfKey, i.l, i.r, i.j, i.k, {
          revision: snapRef.current?.revision,
        });
        if (r.ok && r.snapshot) setSnap(r.snapshot);
      })();
    }, 45);
    return () => {
      cancelled = true;
      window.clearInterval(loop);
    };
  }, [roomId, selfKey, roomProductId, snap?.phase, snap?.sessionId]);

  const setInput = useCallback(partial => {
    inputRef.current = { ...inputRef.current, ...partial };
  }, []);

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2GoalDuelRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2GoalDuelCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2GoalDuelStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const matchEndMs = snap?.matchEndMs != null && Number.isFinite(Number(snap.matchEndMs)) ? Number(snap.matchEndMs) : null;
    const matchTimeLeftSec =
      phase === "playing" && matchEndMs != null ? Math.max(0, Math.ceil((matchEndMs - nowMs) / 1000)) : null;
    const pub = snap?.public && typeof snap.public === "object" ? snap.public : {};
    return {
      phase,
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      public: pub,
      score0: snap?.score0 ?? 0,
      score1: snap?.score1 ?? 0,
      myScore: snap?.myScore ?? null,
      matchEndMs,
      matchTimeLeftSec,
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
    setInput,
    inputRef,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
