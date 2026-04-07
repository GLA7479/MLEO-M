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
  const gdDebug =
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    window.localStorage?.getItem("ov2_gd_debug") === "1";

  /** UI previews: real input ref + local physics so controls and canvas respond (no server). */
  const previewInputRef = useRef({ l: false, r: false, j: false, k: false, jTap: false, kTap: false });
  const previewSetInput = useCallback(partial => {
    const c = previewInputRef.current;
    if (partial.l !== undefined) c.l = partial.l;
    if (partial.r !== undefined) c.r = partial.r;
    if (partial.j !== undefined) c.j = partial.j;
    if (partial.k !== undefined) c.k = partial.k;
  }, []);
  const previewLivePublicRef = useRef(/** @type {Record<string, unknown>|null} */ (null));
  const previewVyRef = useRef(0);
  const previewWasJRef = useRef(false);
  const previewWasKRef = useRef(false);

  useEffect(() => {
    if (!preview) return undefined;
    let raf = 0;
    let last = typeof performance !== "undefined" ? performance.now() : Date.now();
    const loop = t => {
      const dt = Math.min(0.055, Math.max(0, (t - last) / 1000));
      last = t;
      const pub = previewLivePublicRef.current;
      if (pub && typeof pub === "object") {
        const mySeat = Number(preview.snapshot?.mySeat ?? 0);
        const inp = previewInputRef.current;
        /** Same as server `ov2_gd_sim_step`: l/r are world-x (screen left/right), both seats. */
        const effL = inp.l;
        const effR = inp.r;
        const arena = /** @type {Record<string, unknown>} */ (pub.arena || {});
        const aw = Number(arena.w ?? 800) || 800;
        const gy = Number(arena.groundY ?? 360) || 360;
        const gm = Number(arena.goalMargin ?? 48) || 48;
        const key = mySeat === 0 ? "p0" : "p1";
        const p = /** @type {Record<string, unknown>|undefined} */ (pub[key]);
        if (p && typeof p === "object") {
          const hw = Number(p.hw ?? 14) || 14;
          const hh = Number(p.hh ?? 22) || 22;
          const runSpeed = 260;
          let vx = 0;
          if (effL) vx -= runSpeed;
          if (effR) vx += runSpeed;
          const y0 = Number(p.y ?? gy - hh);
          const feet = y0 + hh;
          const onGround = feet >= gy - 2;
          if (inp.j && !previewWasJRef.current && onGround) {
            previewVyRef.current = -420;
          }
          previewWasJRef.current = Boolean(inp.j);
          previewVyRef.current += 980 * dt;
          let y = y0 + previewVyRef.current * dt;
          if (y + hh >= gy) {
            y = gy - hh;
            previewVyRef.current = 0;
          }
          p.y = y;
          let x = Number(p.x ?? 400) + vx * dt;
          const minX = hw;
          const maxX = aw - hw;
          p.x = Math.max(minX, Math.min(maxX, x));
        }
        const ball = /** @type {Record<string, unknown>|undefined} */ (pub.ball);
        if (ball && typeof ball === "object") {
          const kDown = Boolean(inp.k);
          if (kDown && !previewWasKRef.current) {
            const dir = mySeat === 0 ? 1 : -1;
            const bx = Number(ball.x ?? 400);
            const by = Number(ball.y ?? 220);
            const toBallX = bx - (Number(p?.x) || 0);
            const kickDir = Math.abs(toBallX) < 8 ? dir : Math.sign(toBallX) || dir;
            ball.x = bx + kickDir * 6;
            ball.y = by - 4;
          }
          previewWasKRef.current = kDown;
        }
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      previewLivePublicRef.current = null;
      previewVyRef.current = 0;
      previewWasJRef.current = false;
      previewWasKRef.current = false;
    };
  }, [preview]);

  if (preview) {
    if (!previewLivePublicRef.current) {
      const src = preview.snapshot?.public;
      try {
        previewLivePublicRef.current =
          src && typeof src === "object" ? structuredClone(/** @type {object} */ (src)) : {};
      } catch {
        previewLivePublicRef.current =
          src && typeof src === "object" ? JSON.parse(JSON.stringify(src)) : {};
      }
    }
    const pub = previewLivePublicRef.current;
    return {
      ...preview,
      vm: { ...preview.vm, public: pub },
      snapshot: { ...preview.snapshot, public: pub },
      inputRef: previewInputRef,
      setInput: previewSetInput,
      isUiPreview: true,
    };
  }

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
  const inputRef = useRef({ l: false, r: false, j: false, k: false, jTap: false, kTap: false });

  const gdDebugRef = useRef(
    /** @type {{
     *   enabled: boolean,
     *   lastStepSendMs: number,
     *   lastSnapshotReceiveMs: number,
     *   lastSend: { l: boolean, r: boolean, j: boolean, k: boolean }|null,
     *   lastRecv: { revision: number, mySeat: 0|1|null, p0x: number, p0y: number, p1x: number, p1y: number, bx: number, by: number }|null,
     * }} */ ({
      enabled: false,
      lastStepSendMs: 0,
      lastSnapshotReceiveMs: 0,
      lastSend: null,
      lastRecv: null,
    })
  );
  gdDebugRef.current.enabled = Boolean(gdDebug);

  useEffect(() => {
    if (!snap || String(snap.phase || "").toLowerCase() !== "playing") {
      const c = inputRef.current;
      c.l = c.r = c.j = c.k = c.jTap = c.kTap = false;
    }
  }, [snap?.phase, snap?.sessionId]);

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
        if (cancelled) return;
        if (gdDebug) {
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          const pub = s.public && typeof s.public === "object" ? s.public : {};
          const p0 = pub.p0 && typeof pub.p0 === "object" ? pub.p0 : {};
          const p1 = pub.p1 && typeof pub.p1 === "object" ? pub.p1 : {};
          const ball = pub.ball && typeof pub.ball === "object" ? pub.ball : {};
          gdDebugRef.current.lastSnapshotReceiveMs = now;
          gdDebugRef.current.lastRecv = {
            revision: Number(s.revision ?? 0) || 0,
            mySeat: s.mySeat === 0 || s.mySeat === 1 ? s.mySeat : null,
            p0x: Number(p0.x ?? NaN),
            p0y: Number(p0.y ?? NaN),
            p1x: Number(p1.x ?? NaN),
            p1y: Number(p1.y ?? NaN),
            bx: Number(ball.x ?? NaN),
            by: Number(ball.y ?? NaN),
          };
          // Throttle-ish: revision changes only.
          // eslint-disable-next-line no-console
          console.info("[ov2/gd][recv]", {
            rev: gdDebugRef.current.lastRecv.revision,
            seat: gdDebugRef.current.lastRecv.mySeat,
            p0: [gdDebugRef.current.lastRecv.p0x, gdDebugRef.current.lastRecv.p0y],
            p1: [gdDebugRef.current.lastRecv.p1x, gdDebugRef.current.lastRecv.p1y],
            b: [gdDebugRef.current.lastRecv.bx, gdDebugRef.current.lastRecv.by],
          });
        }
        setSnap(s);
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

  /**
   * Authoritative step RPC at a fixed cadence (not every RAF — avoids ~60 RPC/s).
   * Client render uses local presentation + smoothing; see Ov2GoalDuelScreen + ov2GoalDuelPresentation.js.
   */
  const GD_STEP_SEND_MS = 50;
  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_GOAL_DUEL_PRODUCT_GAME_ID) return undefined;
    if (!snap || String(snap.phase || "").toLowerCase() !== "playing") return undefined;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const i = inputRef.current;
      const liveSeat = snapRef.current?.mySeat;
      /**
       * Seat 1 receives a mirrored snapshot for viewer-relative visuals, so outbound left/right
       * must be swapped back into the server's world axes. Jump/kick taps are latched for one send
       * so short mobile taps cannot disappear entirely between 50 ms step intervals.
       */
      const sendL = liveSeat === 1 ? i.r : i.l;
      const sendR = liveSeat === 1 ? i.l : i.r;
      const sendJ = Boolean(i.j || i.jTap);
      const sendK = Boolean(i.k || i.kTap);
      i.jTap = false;
      i.kTap = false;
      if (gdDebug) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        gdDebugRef.current.lastStepSendMs = now;
        gdDebugRef.current.lastSend = { l: Boolean(sendL), r: Boolean(sendR), j: Boolean(sendJ), k: Boolean(sendK) };
        // eslint-disable-next-line no-console
        console.info("[ov2/gd][send]", {
          seat: liveSeat,
          rev: snapRef.current?.revision,
          send: gdDebugRef.current.lastSend,
          raw: { l: i.l, r: i.r, j: i.j, k: i.k, jTap: i.jTap, kTap: i.kTap },
        });
      }
      void (async () => {
        const resp = await requestOv2GoalDuelStep(roomId, selfKey, sendL, sendR, sendJ, sendK, {
          revision: snapRef.current?.revision,
        });
        if (resp.ok && resp.snapshot) setSnap(resp.snapshot);
        else if (!resp.ok && resp.code === "REVISION_MISMATCH" && roomId && selfKey) {
          const fresh = await fetchOv2GoalDuelSnapshot(roomId, { participantKey: selfKey });
          if (fresh) setSnap(fresh);
        }
      })();
    };
    const id = window.setInterval(tick, GD_STEP_SEND_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [roomId, selfKey, roomProductId, snap?.phase, snap?.sessionId]);

  const setInput = useCallback(partial => {
    const c = inputRef.current;
    if (partial.l !== undefined) c.l = partial.l;
    if (partial.r !== undefined) c.r = partial.r;
    if (partial.j !== undefined) c.j = partial.j;
    if (partial.k !== undefined) c.k = partial.k;
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
    gdDebug: gdDebugRef.current,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
    isUiPreview: false,
  };
}
