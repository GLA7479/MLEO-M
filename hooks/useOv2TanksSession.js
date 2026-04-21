import { useCallback, useEffect, useState } from "react";
import {
  fetchOv2TanksSnapshot,
  subscribeOv2TanksSnapshot,
} from "../lib/online-v2/tanks/ov2TanksSessionAdapter";

/**
 * @param {{ roomId: string|null|undefined, participantKey: string|null|undefined, enabled?: boolean }} params
 */
export function useOv2TanksSession(params) {
  const { roomId, participantKey, enabled = true } = params;
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState("");

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

  return { snapshot, loadError, reload };
}
