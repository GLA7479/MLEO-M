import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase } from "../lib/supabaseClients";
import { getOv2ParticipantId } from "../lib/online-v2/ov2ParticipantId";
import { isOv2RoomIdQueryParam } from "../lib/online-v2/onlineV2GameRegistry";
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

/** Vault refresh only when this CC operate actually affected arcade wallet or hints cross-player credits. */
function shouldPullAuthoritativeVaultAfterCc(json) {
  if (!json?.ok) return false;
  return Boolean(
    json.vaultTouchedForCaller ||
      (Array.isArray(json.vaultEffects) && json.vaultEffects.length > 0) ||
      json.localVaultRefreshHint,
  );
}

/** Do not await in the operate/tick hot path — `readOnlineV2Vault(forceServer)` can take hundreds of ms and blocks action buttons via operateBusy. */
async function flushCcOperateSideEffects(json, participantKey) {
  if (json?.vaultEffects?.length) {
    await applyVaultEffects(json.vaultEffects, participantKey);
  }
  if (shouldPullAuthoritativeVaultAfterCc(json)) {
    await pullAuthoritativeVaultAfterCc();
  }
}

function ccClientTrace(tag, extra) {
  try {
    if (typeof window === "undefined" || window.localStorage?.getItem("ov2_cc_timing") !== "1") return;
    const eng = extra?.engine && typeof extra.engine === "object" ? extra.engine : null;
    const base = eng?.seats
      ? eng.seats
          .map((s, i) => (s?.participantKey ? i : -1))
          .filter(i => i >= 0)
      : [];
    const eligible = eng?.seats
      ? eng.seats
          .map((s, i) => {
            if (!s?.participantKey) return -1;
            const st = Math.floor(Number(s.stack) || 0);
            if (st <= 0 || s.sitOut) return -1;
            return i;
          })
          .filter(i => i >= 0)
      : [];
    const dealt = eng?.seats
      ? eng.seats.map((s, i) => (s?.participantKey && s.inCurrentHand ? i : -1)).filter(i => i >= 0)
      : [];
    const { engine: _engDrop, ...rest } = extra || {};
    console.log(
      "[ov2-cc-client-trace]",
      JSON.stringify({
        tag,
        wallMs: Date.now(),
        occupiedSeats: base,
        baseEligibleSeats: eligible,
        dealtSeatIndexes: dealt,
        ...rest,
      }),
    );
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
    if (ph === "between_hands" || ph === "idle") {
      setViewerHoleCards([]);
    } else if (handBumped && !Array.isArray(json?.viewerHoleCards)) {
      /** Realtime delivers engine-only rows; omitting the key is not proof holes are empty — hole nudge tick refills. */
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
  const resolvedRoomId = useMemo(() => {
    const s = String(roomId ?? "").trim();
    return s && isOv2RoomIdQueryParam(s) ? s : null;
  }, [roomId]);

  const [engine, setEngine] = useState(null);
  const [viewerHoleCards, setViewerHoleCards] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [operateBusy, setOperateBusy] = useState(false);
  const [operateSubmitStatus, setOperateSubmitStatus] = useState("idle");
  const participantKey = useMemo(() => getOv2ParticipantId(), []);
  const tickBusyRef = useRef(false);
  const tickPendingRef = useRef(false);
  const runBackgroundTickRef = useRef(() => Promise.resolve());
  const lastTickAtRef = useRef(0);
  const lastRevisionRef = useRef(-1);
  const lastHandSeqRef = useRef(-1);
  const operateDepthRef = useRef(0);
  /** Synchronous guard: React state can lag one frame so double-taps must not enqueue two operates. */
  const operateInFlightRef = useRef(false);
  /** Up to 3 urgent ticks per hand when seated in-hand but holes not yet hydrated (realtime is engine-only). */
  const holeTickNudgeRef = useRef({ hand: -1, n: 0 });

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
    if (!resolvedRoomId) return;
    setLoadError("");
    const { data, error } = await supabase
      .from("ov2_community_cards_live_state")
      .select("engine, match_seq, revision")
      .eq("room_id", resolvedRoomId)
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
  }, [resolvedRoomId]);

  useEffect(() => {
    void reloadFromDb();
  }, [reloadFromDb]);

  useEffect(() => {
    if (!resolvedRoomId) return undefined;
    const channel = supabase
      .channel(`ov2_cc_${resolvedRoomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ov2_community_cards_live_state",
          filter: `room_id=eq.${resolvedRoomId}`,
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
          const prevHand = lastHandSeqRef.current;
          const hs = Math.floor(Number(eng.handSeq) || 0);
          setEngine(eng);
          if (lastHandSeqRef.current >= 0 && hs !== lastHandSeqRef.current) {
            setViewerHoleCards([]);
          }
          lastHandSeqRef.current = hs;
          if (eng.phase === "between_hands" || eng.phase === "idle") {
            setViewerHoleCards([]);
          } else if (
            prevHand >= 0 &&
            hs > prevHand &&
            resolvedRoomId &&
            participantKey &&
            (eng.phase === "preflop" || eng.phase === "post_blinds")
          ) {
            const myIdx = Array.isArray(eng.seats)
              ? eng.seats.findIndex(s => s && s.participantKey === participantKey)
              : -1;
            const mine = myIdx >= 0 ? eng.seats[myIdx] : null;
            if (mine?.inCurrentHand) {
              void runBackgroundTickRef.current({ urgent: true });
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [resolvedRoomId, participantKey]);

  const mySeatInCurrentHand = useMemo(() => {
    if (!engine?.seats || !participantKey) return false;
    const s = engine.seats.find(x => x && x.participantKey === participantKey);
    return Boolean(s?.inCurrentHand);
  }, [engine, participantKey]);

  useEffect(() => {
    const hs = Math.floor(Number(engine?.handSeq) || 0);
    if (holeTickNudgeRef.current.hand !== hs) {
      holeTickNudgeRef.current = { hand: hs, n: 0 };
    }
  }, [engine?.handSeq]);

  useEffect(() => {
    if (!resolvedRoomId || !participantKey || !mySeatInCurrentHand) return;
    const hs = Math.floor(Number(engine?.handSeq) || 0);
    if (hs <= 0) return;
    const ph = engine?.phase;
    if (ph === "between_hands" || ph === "idle") return;
    if (viewerHoleCards.length > 0) return;
    if (holeTickNudgeRef.current.hand !== hs) return;
    if (holeTickNudgeRef.current.n >= 3) return;
    holeTickNudgeRef.current.n += 1;
    if (typeof window !== "undefined" && window.localStorage?.getItem("ov2_cc_timing") === "1") {
      ccClientTrace("hole_refetch_tick_scheduled", {
        handSeq: hs,
        phase: ph,
        nudgeAttempt: holeTickNudgeRef.current.n,
      });
    }
    void runBackgroundTickRef.current({ urgent: true });
  }, [resolvedRoomId, participantKey, mySeatInCurrentHand, engine?.handSeq, engine?.phase, viewerHoleCards.length]);

  const operate = useCallback(
    async (op, payload = {}) => {
      if (!resolvedRoomId) return { ok: false };
      if (operateInFlightRef.current) return { ok: false, skipped: true };
      operateInFlightRef.current = true;

      const clientOpId =
        op === "tick"
          ? ""
          : typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `cc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      const runPost = () =>
        postOv2CcOperate({
          roomId: resolvedRoomId,
          participantKey,
          op,
          payload,
          clientOpId: clientOpId || undefined,
          clientRevision: lastRevisionRef.current >= 0 ? lastRevisionRef.current : undefined,
        });

      const ccTiming =
        typeof window !== "undefined" && window.localStorage?.getItem("ov2_cc_timing") === "1";
      const t0 = ccTiming ? performance.now() : 0;
      let tAfterApply = 0;

      pushOperateBusy();
      setOperateSubmitStatus("sending");
      try {
        try {
          const json = await runPost();
          const tAfterNet = ccTiming ? performance.now() : 0;
          ingestOperateJson(json, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
          tAfterApply = ccTiming ? performance.now() : 0;
          void flushCcOperateSideEffects(json, participantKey).catch(() => {});
          if (ccTiming) {
            ccClientTrace("operate_state_applied", {
              op,
              clientOpId: clientOpId || null,
              revision: json?.revision,
              handSeq: json?.engine?.handSeq,
              phase: json?.engine?.phase,
              actingSeat: json?.engine?.actionSeat,
              engine: json?.engine,
            });
            console.log("[ov2-cc-timing]", {
              op,
              msToResponse: Math.round(tAfterNet - t0),
              msNetToApply: Math.round(tAfterApply - tAfterNet),
              clientRetried: false,
              duplicateAbsorbed: Boolean(json?.duplicateAbsorbed),
              tickNoop: Boolean(json?.tickNoop),
              sideEffectsDeferred: true,
            });
          }
          return { ok: Boolean(json?.ok), json, clientRetried: false };
        } catch (e) {
          const code = e?.payload?.code ?? e?.code;
          const status = e?.status ?? e?.payload?.status;

          if (e?.payload && typeof e.payload === "object" && e.payload.engine && typeof e.payload.engine === "object") {
            ingestOperateJson(e.payload, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
            tAfterApply = ccTiming ? performance.now() : 0;
          }

          if (code === "REVISION_CONFLICT" || status === 409) {
            if (ccTiming) {
              ccClientTrace("operate_409_before_retry", {
                op,
                clientOpId: clientOpId || null,
                revision: e?.payload?.revision,
                handSeq: e?.payload?.engine?.handSeq,
                phase: e?.payload?.engine?.phase,
                engine: e?.payload?.engine,
              });
            }
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
              const tAfterNet2 = ccTiming ? performance.now() : 0;
              ingestOperateJson(json2, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
              tAfterApply = ccTiming ? performance.now() : 0;
              void flushCcOperateSideEffects(json2, participantKey).catch(() => {});
              if (ccTiming) {
                ccClientTrace("operate_state_applied_retry", {
                  op,
                  clientOpId: clientOpId || null,
                  revision: json2?.revision,
                  handSeq: json2?.engine?.handSeq,
                  phase: json2?.engine?.phase,
                  actingSeat: json2?.engine?.actionSeat,
                  engine: json2?.engine,
                });
                console.log("[ov2-cc-timing]", {
                  op,
                  msToResponse: Math.round(tAfterNet2 - t0),
                  clientRetried: true,
                  resyncSkippedDb: skipReload,
                  duplicateAbsorbed: Boolean(json2?.duplicateAbsorbed),
                  sideEffectsDeferred: true,
                });
              }
              return { ok: Boolean(json2?.ok), json: json2, clientRetried: true };
            } catch (e2) {
              const code2 = e2?.payload?.code ?? e2?.code;
              if (e2?.payload?.engine && typeof e2.payload.engine === "object") {
                ingestOperateJson(e2.payload, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
                tAfterApply = ccTiming ? performance.now() : 0;
              }
              return { ok: false, error: e2, code: code2 };
            }
          }

          return { ok: false, error: e, code };
        }
      } finally {
        const tBusyOff = ccTiming ? performance.now() : 0;
        operateInFlightRef.current = false;
        setOperateSubmitStatus("idle");
        popOperateBusy();
        if (ccTiming && tAfterApply > 0) {
          console.log("[ov2-cc-timing]", {
            phase: "busy_released",
            msApplyToBusyOff: Math.round(tBusyOff - tAfterApply),
            msTapToBusyOff: Math.round(tBusyOff - t0),
          });
        }
      }
    },
    [resolvedRoomId, participantKey, pushOperateBusy, popOperateBusy, reloadFromDb],
  );

  useEffect(() => {
    if (!resolvedRoomId) return undefined;
    let cancelled = false;
    let timeoutId = 0;

    const applyTickIngest = json => {
      ingestOperateJson(json, lastRevisionRef, lastHandSeqRef, setEngine, setViewerHoleCards);
      void flushCcOperateSideEffects(json, participantKey).catch(() => {});
    };

    runBackgroundTickRef.current = async ({ urgent = false } = {}) => {
      if (cancelled) return;
      if (tickBusyRef.current) {
        tickPendingRef.current = true;
        return;
      }
      const now = Date.now();
      if (!urgent && now - lastTickAtRef.current < 850) return;
      tickBusyRef.current = true;
      lastTickAtRef.current = now;
      try {
        try {
          const json = await postOv2CcOperate({
            roomId: resolvedRoomId,
            participantKey,
            op: "tick",
            payload: {},
          });
          applyTickIngest(json);
        } catch (e) {
          const code = e?.payload?.code ?? e?.code;
          const status = e?.status ?? e?.payload?.status;
          const snap =
            e?.payload &&
            typeof e.payload === "object" &&
            e.payload.engine &&
            typeof e.payload.engine === "object" &&
            e.payload.revision != null;
          if (typeof window !== "undefined" && window.localStorage?.getItem("ov2_cc_timing") === "1") {
            ccClientTrace("tick_error", {
              op: "tick",
              code: code || null,
              status: status ?? null,
              had409Snapshot: Boolean(snap),
              engine: e?.payload?.engine,
            });
          }
          if ((code === "REVISION_CONFLICT" || status === 409) && snap) {
            applyTickIngest(e.payload);
            await new Promise(r => window.setTimeout(r, 40));
            const json2 = await postOv2CcOperate({
              roomId: resolvedRoomId,
              participantKey,
              op: "tick",
              payload: {},
            });
            applyTickIngest(json2);
          } else if (typeof console !== "undefined" && console.warn) {
            console.warn("[ov2-cc] tick failed", e?.message || e);
          }
        }
      } finally {
        tickBusyRef.current = false;
        if (tickPendingRef.current && !cancelled) {
          tickPendingRef.current = false;
          queueMicrotask(() => {
            void runBackgroundTickRef.current({ urgent: true });
          });
        }
      }
    };

    void runBackgroundTickRef.current({ urgent: true });

    const schedule = () => {
      if (cancelled) return;
      const delay = 950 + Math.floor(Math.random() * 550);
      timeoutId = window.setTimeout(() => {
        void runBackgroundTickRef.current({ urgent: false });
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      runBackgroundTickRef.current = () => Promise.resolve();
    };
  }, [resolvedRoomId, participantKey]);

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
