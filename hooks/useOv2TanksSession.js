import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchOv2TanksSnapshot,
  requestOv2TanksClaimSettlement,
  requestOv2TanksPing,
  subscribeOv2TanksSnapshot,
} from "../lib/online-v2/tanks/ov2TanksSessionAdapter";
import { applyOv2SettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/ov2SettlementVaultDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../lib/online-v2/ov2Economy";

/**
 * @param {{ roomId: string|null|undefined, participantKey: string|null|undefined, enabled?: boolean }} params
 */
export function useOv2TanksSession(params) {
  const { roomId, participantKey, enabled = true } = params;
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState("");
  const vaultFinishedRef = useRef(null);
  const vaultClaimInFlightRef = useRef(false);
  const vaultLinesAppliedForSessionRef = useRef(new Set());

  const reload = useCallback(async () => {
    const rid = roomId != null ? String(roomId).trim() : "";
    const pk = participantKey != null ? String(participantKey).trim() : "";
    if (!rid || !pk || !enabled) {
      setSnapshot(null);
      return;
    }
    setLoadError("");
    try {
      const snap = await fetchOv2TanksSnapshot(rid, { participantKey: pk });
      setSnapshot(snap);
      if (!snap) setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setSnapshot(null);
    }
  }, [roomId, participantKey, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const rid = roomId != null ? String(roomId).trim() : "";
    const pk = participantKey != null ? String(participantKey).trim() : "";
    if (!rid || !pk || !enabled) return undefined;
    return subscribeOv2TanksSnapshot(rid, {
      participantKey: pk,
      onSnapshot: s => {
        setSnapshot(s);
        setLoadError("");
      },
    });
  }, [roomId, participantKey, enabled]);

  useEffect(() => {
    const rid = roomId != null ? String(roomId).trim() : "";
    const pk = participantKey != null ? String(participantKey).trim() : "";
    if (!rid || !pk || !enabled) return undefined;
    const id = window.setInterval(() => {
      void (async () => {
        const out = await requestOv2TanksPing(rid, pk);
        if (out.ok && out.snapshot) setSnapshot(out.snapshot);
      })();
    }, 2500);
    return () => window.clearInterval(id);
  }, [roomId, participantKey, enabled]);

  useEffect(() => {
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current = new Set();
  }, [roomId, participantKey]);

  useEffect(() => {
    const rid = roomId != null ? String(roomId).trim() : "";
    const pk = participantKey != null ? String(participantKey).trim() : "";
    if (!rid || !pk || !enabled) return;
    if (!snapshot || String(snapshot.phase || "") !== "finished") return;
    const sid = String(snapshot.sessionId || "").trim();
    if (!sid || vaultFinishedRef.current === sid) return;
    if (vaultClaimInFlightRef.current) return;
    vaultClaimInFlightRef.current = true;
    void (async () => {
      try {
        const claim = await requestOv2TanksClaimSettlement(rid, pk);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyOv2SettlementClaimLinesToVaultAndConfirm(
              claim.lines,
              ONLINE_V2_GAME_KINDS.TANKS,
              rid,
              pk
            );
            vaultLinesAppliedForSessionRef.current.add(sid);
          }
          vaultFinishedRef.current = sid;
        } else if (!claim.ok) {
          vaultFinishedRef.current = null;
        } else {
          vaultFinishedRef.current = sid;
        }
      } catch {
        vaultFinishedRef.current = null;
      } finally {
        vaultClaimInFlightRef.current = false;
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
      }
    })();
  }, [snapshot, roomId, participantKey, enabled]);

  return { snapshot, loadError, reload };
}
