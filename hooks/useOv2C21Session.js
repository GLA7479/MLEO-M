import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";
import { getOv2ParticipantId } from "../lib/online-v2/ov2ParticipantId";
import { isOv2RoomIdQueryParam } from "../lib/online-v2/onlineV2GameRegistry";
import { postOv2C21Operate } from "../lib/online-v2/c21/ov2C21Api";
import { creditOnlineV2VaultForSettlementLine, readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { OV2_C21_PRODUCT_GAME_ID } from "../lib/online-v2/c21/ov2C21TableIds";

async function applyVaultEffects(effects, selfParticipantKey) {
  const selfPk = String(selfParticipantKey || "").trim();
  for (const e of effects || []) {
    if (!e || typeof e !== "object") continue;
    const gid = String(e.gameId || OV2_C21_PRODUCT_GAME_ID);
    if (e.kind === "debit") {
      /** Main and action debits are applied server-side in `/api/ov2-c21/operate`. */
      continue;
    }
    if (e.kind === "credit") {
      const pk = String(e.participantKey || "").trim();
      if (pk && selfPk && pk !== selfPk) continue;
      const amt = Math.max(0, Math.floor(Number(e.amount) || 0));
      if (amt > 0) {
        await creditOnlineV2VaultForSettlementLine(amt, gid, e.idempotencyKey);
      }
    }
  }
}

function c21TimingOn() {
  return typeof window !== "undefined" && window.localStorage?.getItem("ov2_c21_timing") === "1";
}

/** Same contract as CC: only force a server vault read when this response actually moved money or hints cross-player credits. */
function shouldPullAuthoritativeVaultAfterC21(json) {
  if (!json?.ok) return false;
  return Boolean(
    json.vaultTouchedForCaller ||
      (Array.isArray(json.vaultEffects) && json.vaultEffects.length > 0) ||
      json.localVaultRefreshHint,
  );
}

/** `forceServer` bypasses pending-delta skip so HUD matches server after commits/credits. */
async function pullAuthoritativeVaultAfterC21() {
  try {
    await readOnlineV2Vault({ fresh: true, forceServer: true });
  } catch {
    /* ignore */
  }
}

/**
 * Off the operate/tick unlock path — applies client-side credits then optional authoritative balance pull.
 */
async function flushC21OperateSideEffects(json, participantKey, traceCtx) {
  const { op = "?", tTap = 0, tAfterApply = 0 } = traceCtx || {};
  const timing = c21TimingOn();
  const tVaultStart = timing ? performance.now() : 0;
  if (timing && tTap > 0) {
    console.log("[ov2-c21-timing]", {
      phase: "vault_deferred_start",
      op,
      msSinceTap: Math.round(tVaultStart - tTap),
      msSinceStateApply: Math.round(tVaultStart - tAfterApply),
    });
  }
  try {
    if (json?.vaultEffects?.length) {
      await applyVaultEffects(json.vaultEffects, participantKey);
    }
    if (shouldPullAuthoritativeVaultAfterC21(json)) {
      await pullAuthoritativeVaultAfterC21();
    }
  } finally {
    if (timing && tTap > 0) {
      const tEnd = performance.now();
      console.log("[ov2-c21-timing]", {
        phase: "vault_deferred_end",
        op,
        msSinceTap: Math.round(tEnd - tTap),
        deferredVaultMs: Math.round(tEnd - tVaultStart),
      });
    }
  }
}

export function useOv2C21Session(roomId, tableStakeUnits) {
  const resolvedRoomId = useMemo(() => {
    const s = String(roomId ?? "").trim();
    return s && isOv2RoomIdQueryParam(s) ? s : null;
  }, [roomId]);

  const [engine, setEngine] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [operateBusy, setOperateBusy] = useState(false);
  const participantKey = useMemo(() => getOv2ParticipantId(), []);
  const tickBusyRef = useRef(false);
  const lastTickAtRef = useRef(0);
  /** Synchronous guard: React state can lag one frame so double-taps must not enqueue two operates. */
  const operateInFlightRef = useRef(false);

  const reloadFromDb = useCallback(async () => {
    if (!resolvedRoomId) return;
    setLoadError("");
    const { data, error } = await supabase
      .from("ov2_c21_live_state")
      .select("engine, match_seq, revision")
      .eq("room_id", resolvedRoomId)
      .maybeSingle();
    if (error) {
      setLoadError(error.message || String(error));
      return;
    }
    if (data?.engine && typeof data.engine === "object") {
      setEngine(data.engine);
    }
  }, [resolvedRoomId]);

  useEffect(() => {
    void reloadFromDb();
  }, [reloadFromDb]);

  useEffect(() => {
    if (!resolvedRoomId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const json = await postOv2C21Operate({
          roomId: resolvedRoomId,
          participantKey,
          op: "tick",
          payload: {},
        });
        if (cancelled) return;
        if (json?.engine) setEngine(json.engine);
        void flushC21OperateSideEffects(json, participantKey, { op: "tick_mount" }).catch(() => {});
      } catch {
        /* table may not exist until migration */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedRoomId, participantKey]);

  useEffect(() => {
    if (!resolvedRoomId) return undefined;
    const channel = supabase
      .channel(`ov2_c21_${resolvedRoomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_c21_live_state", filter: `room_id=eq.${resolvedRoomId}` },
        payload => {
          const row = payload.new || payload.old;
          if (row?.engine && typeof row.engine === "object") {
            setEngine(row.engine);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedRoomId]);

  const operate = useCallback(
    async (op, payload = {}) => {
      if (!resolvedRoomId) return { ok: false };
      if (operateInFlightRef.current) return { ok: false, skipped: true };
      operateInFlightRef.current = true;
      setOperateBusy(true);
      const timing = c21TimingOn();
      const tTap = timing ? performance.now() : 0;
      let tAfterResponse = 0;
      let tAfterApply = 0;
      try {
        const json = await postOv2C21Operate({
          roomId: resolvedRoomId,
          participantKey,
          op,
          payload,
        });
        tAfterResponse = timing ? performance.now() : 0;
        if (json?.engine) setEngine(json.engine);
        tAfterApply = timing ? performance.now() : 0;
        void flushC21OperateSideEffects(json, participantKey, { op, tTap, tAfterApply }).catch(() => {});
        if (timing) {
          console.log("[ov2-c21-timing]", {
            phase: "operate_state_applied",
            op,
            msTapToResponse: Math.round(tAfterResponse - tTap),
            msResponseToApply: Math.round(tAfterApply - tAfterResponse),
          });
        }
        return { ok: Boolean(json?.ok), json };
      } catch (e) {
        return { ok: false, error: e };
      } finally {
        const tBusyOff = timing ? performance.now() : 0;
        operateInFlightRef.current = false;
        setOperateBusy(false);
        if (timing && tTap > 0 && tAfterApply > 0) {
          console.log("[ov2-c21-timing]", {
            phase: "busy_released",
            op,
            msApplyToBusyOff: Math.round(tBusyOff - tAfterApply),
            msTapToBusyOff: Math.round(tBusyOff - tTap),
          });
        } else if (timing && tTap > 0) {
          console.log("[ov2-c21-timing]", {
            phase: "busy_released",
            op,
            msTapToBusyOff: Math.round(tBusyOff - tTap),
            note: "no_state_apply_mark",
          });
        }
      }
    },
    [resolvedRoomId, participantKey],
  );

  useEffect(() => {
    if (!resolvedRoomId) return undefined;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now - lastTickAtRef.current < 900) return;
      if (tickBusyRef.current) return;
      tickBusyRef.current = true;
      lastTickAtRef.current = now;
      void (async () => {
        try {
          const json = await postOv2C21Operate({
            roomId: resolvedRoomId,
            participantKey,
            op: "tick",
            payload: {},
          });
          if (json?.engine) setEngine(json.engine);
          void flushC21OperateSideEffects(json, participantKey, { op: "tick_interval" }).catch(() => {});
        } catch {
          /* ignore tick errors — next poll retries */
        } finally {
          tickBusyRef.current = false;
        }
      })();
    }, 1000);
    return () => window.clearInterval(id);
  }, [resolvedRoomId, participantKey]);

  return {
    engine,
    tableStakeUnits,
    participantKey,
    loadError,
    operateBusy,
    operate,
    reloadFromDb,
  };
}
