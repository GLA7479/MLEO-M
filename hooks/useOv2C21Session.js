import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";
import { getOv2ParticipantId } from "../lib/online-v2/ov2ParticipantId";
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

/** Align HUD + gating with server wallet after C21 API applied vault RPCs (bypasses pending-delta skip in balance read). */
async function pullAuthoritativeVaultAfterC21() {
  try {
    await readOnlineV2Vault({ fresh: true, forceServer: true });
  } catch {
    /* ignore */
  }
}

export function useOv2C21Session(roomId, tableStakeUnits) {
  const [engine, setEngine] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [operateBusy, setOperateBusy] = useState(false);
  const participantKey = useMemo(() => getOv2ParticipantId(), []);
  const tickBusyRef = useRef(false);
  const lastTickAtRef = useRef(0);
  /** Synchronous guard: React state can lag one frame so double-taps must not enqueue two operates. */
  const operateInFlightRef = useRef(false);

  const reloadFromDb = useCallback(async () => {
    if (!roomId) return;
    setLoadError("");
    const { data, error } = await supabase
      .from("ov2_c21_live_state")
      .select("engine, match_seq, revision")
      .eq("room_id", roomId)
      .maybeSingle();
    if (error) {
      setLoadError(error.message || String(error));
      return;
    }
    if (data?.engine && typeof data.engine === "object") {
      setEngine(data.engine);
    }
  }, [roomId]);

  useEffect(() => {
    void reloadFromDb();
  }, [reloadFromDb]);

  useEffect(() => {
    if (!roomId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const json = await postOv2C21Operate({
          roomId,
          participantKey,
          op: "tick",
          payload: {},
        });
        if (cancelled) return;
        if (json?.engine) setEngine(json.engine);
        if (json?.vaultEffects?.length) {
          await applyVaultEffects(json.vaultEffects, participantKey);
        }
        if (
          json?.ok &&
          (json.vaultTouchedForCaller ||
            json.vaultEffects?.length ||
            json.localVaultRefreshHint)
        ) {
          await pullAuthoritativeVaultAfterC21();
        }
      } catch {
        /* table may not exist until migration */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, participantKey]);

  useEffect(() => {
    if (!roomId) return undefined;
    const channel = supabase
      .channel(`ov2_c21_${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_c21_live_state", filter: `room_id=eq.${roomId}` },
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
  }, [roomId]);

  const operate = useCallback(
    async (op, payload = {}) => {
      if (!roomId) return { ok: false };
      if (operateInFlightRef.current) return { ok: false, skipped: true };
      operateInFlightRef.current = true;
      setOperateBusy(true);
      try {
        const json = await postOv2C21Operate({
          roomId,
          participantKey,
          op,
          payload,
        });
        if (json?.engine) setEngine(json.engine);
        if (json?.vaultEffects?.length) {
          await applyVaultEffects(json.vaultEffects, participantKey);
        }
        // Any successful operate may have changed server vault (commit/credit); always reconcile so UI never depends on response flag completeness.
        if (json?.ok) {
          await pullAuthoritativeVaultAfterC21();
        }
        return { ok: Boolean(json?.ok), json };
      } catch (e) {
        return { ok: false, error: e };
      } finally {
        operateInFlightRef.current = false;
        setOperateBusy(false);
      }
    },
    [roomId, participantKey],
  );

  useEffect(() => {
    if (!roomId) return undefined;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now - lastTickAtRef.current < 900) return;
      if (tickBusyRef.current) return;
      tickBusyRef.current = true;
      lastTickAtRef.current = now;
      void (async () => {
        try {
          const json = await postOv2C21Operate({
            roomId,
            participantKey,
            op: "tick",
            payload: {},
          });
          if (json?.engine) setEngine(json.engine);
          if (json?.vaultEffects?.length) {
            await applyVaultEffects(json.vaultEffects, participantKey);
          }
          if (
            json?.ok &&
            (json.vaultTouchedForCaller ||
              json.vaultEffects?.length ||
              json.localVaultRefreshHint)
          ) {
            await pullAuthoritativeVaultAfterC21();
          }
        } catch {
          /* ignore tick errors — next poll retries */
        } finally {
          tickBusyRef.current = false;
        }
      })();
    }, 1000);
    return () => window.clearInterval(id);
  }, [roomId, participantKey]);

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
