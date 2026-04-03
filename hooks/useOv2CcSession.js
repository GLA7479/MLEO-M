import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";
import { getOv2ParticipantId } from "../lib/online-v2/ov2ParticipantId";
import { postOv2CcOperate } from "../lib/online-v2/community_cards/ov2CcApi";
import { creditOnlineV2VaultForSettlementLine, readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { OV2_CC_PRODUCT_GAME_ID } from "../lib/online-v2/community_cards/ov2CcTableIds";

async function applyVaultEffects(effects, selfParticipantKey) {
  const selfPk = String(selfParticipantKey || "").trim();
  for (const e of effects || []) {
    if (!e || typeof e !== "object") continue;
    const gid = String(e.gameId || OV2_CC_PRODUCT_GAME_ID);
    if (e.kind === "debit") continue;
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

async function pullAuthoritativeVaultAfterCc() {
  try {
    await readOnlineV2Vault({ fresh: true, forceServer: true });
  } catch {
    /* ignore */
  }
}

function ingestOperateJson(json, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards) {
  const revRaw = json?.revision;
  const rev = revRaw == null ? null : Math.max(0, Math.floor(Number(revRaw) || 0));
  if (rev != null && rev < lastRevisionRef.current) {
    return { applied: false, stale: true };
  }
  if (rev != null) {
    lastRevisionRef.current = rev;
  }
  if (json?.engine && typeof json.engine === "object") {
    const eng = json.engine;
    setEngine(eng);
    const hs = Math.floor(Number(eng.handSeq) || 0);
    const handBumped = lastHandSeqRef.current >= 0 && hs !== lastHandSeqRef.current;
    lastHandSeqRef.current = hs;
    const ph = eng.phase;
    if (ph === "between_hands" || ph === "idle" || handBumped) {
      setViewerHoleCards([]);
    }
    if (ph !== "between_hands" && ph !== "idle" && Array.isArray(json?.viewerHoleCards)) {
      setViewerHoleCards(json.viewerHoleCards.length ? json.viewerHoleCards : []);
    }
  } else if (Array.isArray(json?.viewerHoleCards)) {
    setViewerHoleCards(json.viewerHoleCards.length ? json.viewerHoleCards : []);
  }
  return { applied: true, stale: false };
}

export function useOv2CcSession(roomId) {
  const [engine, setEngine] = useState(null);
  const [viewerHoleCards, setViewerHoleCards] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [operateBusy, setOperateBusy] = useState(false);
  const [operateSubmitStatus, setOperateSubmitStatus] = useState("idle");
  const participantKey = useMemo(() => getOv2ParticipantId(), []);
  const tickBusyRef = useRef(false);
  const lastTickAtRef = useRef(0);
  const lastRevisionRef = useRef(-1);
  const lastHandSeqRef = useRef(-1);
  const operateDepthRef = useRef(0);

  const pushOperateBusy = useCallback(() => {
    operateDepthRef.current += 1;
    setOperateBusy(true);
  }, []);

  const popOperateBusy = useCallback(() => {
    operateDepthRef.current = Math.max(0, operateDepthRef.current - 1);
    if (operateDepthRef.current === 0) {
      setOperateBusy(false);
    }
  }, []);

  const reloadFromDb = useCallback(async () => {
    if (!roomId) return;
    setLoadError("");
    const { data, error } = await supabase
      .from("ov2_community_cards_live_state")
      .select("engine, match_seq, revision")
      .eq("room_id", roomId)
      .maybeSingle();
    if (error) {
      setLoadError(error.message || String(error));
      return;
    }
    if (data?.engine && typeof data.engine === "object") {
      const rev = Math.max(0, Math.floor(Number(data.revision) || 0));
      lastRevisionRef.current = rev;
      const eng = data.engine;
      const hs = Math.floor(Number(eng.handSeq) || 0);
      if (lastHandSeqRef.current >= 0 && hs !== lastHandSeqRef.current) {
        setViewerHoleCards([]);
      }
      lastHandSeqRef.current = hs;
      if (eng.phase === "between_hands" || eng.phase === "idle") {
        setViewerHoleCards([]);
      }
      setEngine(eng);
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
        const json = await postOv2CcOperate({
          roomId,
          participantKey,
          op: "tick",
          payload: {},
        });
        if (cancelled) return;
        ingestOperateJson(json, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
        if (json?.vaultEffects?.length) {
          await applyVaultEffects(json.vaultEffects, participantKey);
        }
        if (
          json?.ok &&
          (json.vaultTouchedForCaller || json.vaultEffects?.length || json.localVaultRefreshHint)
        ) {
          await pullAuthoritativeVaultAfterCc();
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
      .channel(`ov2_cc_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ov2_community_cards_live_state",
          filter: `room_id=eq.${roomId}`,
        },
        payload => {
          const row = payload.new || payload.old;
          if (!row?.engine || typeof row.engine !== "object") return;
          const revRaw = row.revision;
          const rev = revRaw == null ? null : Math.max(0, Math.floor(Number(revRaw) || 0));
          if (rev != null && rev < lastRevisionRef.current) {
            return;
          }
          if (rev != null) {
            lastRevisionRef.current = rev;
          }
          const eng = row.engine;
          setEngine(eng);
          const hs = Math.floor(Number(eng.handSeq) || 0);
          if (lastHandSeqRef.current >= 0 && hs !== lastHandSeqRef.current) {
            setViewerHoleCards([]);
          }
          lastHandSeqRef.current = hs;
          if (eng.phase === "between_hands" || eng.phase === "idle") {
            setViewerHoleCards([]);
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

      const clientOpId =
        op === "tick"
          ? ""
          : typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `cc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      const runPost = () =>
        postOv2CcOperate({
          roomId,
          participantKey,
          op,
          payload,
          clientOpId: clientOpId || undefined,
          clientRevision: lastRevisionRef.current >= 0 ? lastRevisionRef.current : undefined,
        });

      const finishOk = async json => {
        if (json?.vaultEffects?.length) {
          await applyVaultEffects(json.vaultEffects, participantKey);
        }
        if (json?.ok) {
          await pullAuthoritativeVaultAfterCc();
        }
      };

      const ccTiming =
        typeof window !== "undefined" && window.localStorage?.getItem("ov2_cc_timing") === "1";
      const t0 = ccTiming ? performance.now() : 0;

      pushOperateBusy();
      setOperateSubmitStatus("sending");
      try {
        try {
          const json = await runPost();
          ingestOperateJson(json, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
          await finishOk(json);
          if (ccTiming) {
            console.log("[ov2-cc-timing]", {
              op,
              msToResponse: Math.round(performance.now() - t0),
              clientRetried: false,
              duplicateAbsorbed: Boolean(json?.duplicateAbsorbed),
              tickNoop: Boolean(json?.tickNoop),
            });
          }
          return { ok: Boolean(json?.ok), json, clientRetried: false };
        } catch (e) {
          const code = e?.payload?.code ?? e?.code;
          const status = e?.status ?? e?.payload?.status;

          if (e?.payload && typeof e.payload === "object" && e.payload.engine && typeof e.payload.engine === "object") {
            ingestOperateJson(e.payload, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
          }

          if (code === "REVISION_CONFLICT" || status === 409) {
            setOperateSubmitStatus("resyncing");
            const skipReload =
              e?.payload &&
              typeof e.payload === "object" &&
              e.payload.engine &&
              typeof e.payload.engine === "object" &&
              e.payload.revision != null;
            if (!skipReload) {
              await reloadFromDb();
            }
            try {
              const json2 = await runPost();
              ingestOperateJson(json2, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
              await finishOk(json2);
              if (ccTiming) {
                console.log("[ov2-cc-timing]", {
                  op,
                  msToResponse: Math.round(performance.now() - t0),
                  clientRetried: true,
                  resyncSkippedDb: skipReload,
                  duplicateAbsorbed: Boolean(json2?.duplicateAbsorbed),
                });
              }
              return { ok: Boolean(json2?.ok), json: json2, clientRetried: true };
            } catch (e2) {
              const code2 = e2?.payload?.code ?? e2?.code;
              if (e2?.payload?.engine && typeof e2.payload.engine === "object") {
                ingestOperateJson(e2.payload, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
              }
              return { ok: false, error: e2, code: code2 };
            }
          }

          return { ok: false, error: e, code };
        }
      } finally {
        setOperateSubmitStatus("idle");
        popOperateBusy();
      }
    },
    [roomId, participantKey, pushOperateBusy, popOperateBusy, reloadFromDb],
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
          const json = await postOv2CcOperate({
            roomId,
            participantKey,
            op: "tick",
            payload: {},
          });
          ingestOperateJson(json, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
          if (json?.vaultEffects?.length) {
            await applyVaultEffects(json.vaultEffects, participantKey);
          }
          if (
            json?.ok &&
            (json.vaultTouchedForCaller || json.vaultEffects?.length || json.localVaultRefreshHint)
          ) {
            await pullAuthoritativeVaultAfterCc();
          }
        } catch {
          /* ignore */
        } finally {
          tickBusyRef.current = false;
        }
      })();
    }, 1000);
    return () => window.clearInterval(id);
  }, [roomId, participantKey]);

  return {
    engine,
    viewerHoleCards,
    participantKey,
    loadError,
    operateBusy,
    operateSubmitStatus,
    operate,
    reloadFromDb,
  };
}
