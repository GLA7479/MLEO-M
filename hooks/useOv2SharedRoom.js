import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reconnectOv2RoomMember, getOv2RoomSnapshot } from "../lib/online-v2/room-api/ov2SharedRoomsApi";

/**
 * Shared room snapshot + reconnect loop (non-authoritative).
 * @param {{ roomId: string|null, participantKey: string, pollMs?: number }} params
 */
export function useOv2SharedRoom({ roomId, participantKey, pollMs = 3000 }) {
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [isEjected, setIsEjected] = useState(false);

  const roomIdRef = useRef(roomId);
  const participantKeyRef = useRef(participantKey);
  roomIdRef.current = roomId;
  participantKeyRef.current = participantKey;

  const inFlightRef = useRef(false);
  /** When true, a refresh was requested while another was in flight; run one silent follow-up load. */
  const pendingFollowUpRef = useRef(false);

  const me = useMemo(
    () => members.find(m => m.participant_key === participantKey) || null,
    [members, participantKey]
  );

  const isHost = useMemo(() => {
    if (!room || !me) return false;
    const role = String(me.role || "").toLowerCase();
    if (role === "host") return true;
    return Boolean(room.host_member_id && room.host_member_id === me.id);
  }, [room, me]);

  const loadSnapshot = useCallback(
    async (opts = { silent: false }) => {
      const id = roomIdRef.current;
      const pk = participantKeyRef.current;
      if (!id) return;
      if (inFlightRef.current) {
        pendingFollowUpRef.current = true;
        return;
      }
      inFlightRef.current = true;
      if (!opts.silent) setLoading(true);
      setError("");
      try {
        await reconnectOv2RoomMember({ room_id: id, participant_key: pk }).catch(() => {});
        const out = await getOv2RoomSnapshot({
          room_id: id,
          viewer_participant_key: pk,
        });
        if (roomIdRef.current !== id || participantKeyRef.current !== pk) return;
        setRoom(out.room || null);
        setMembers(Array.isArray(out.members) ? out.members : []);
        setLastLoadedAt(Date.now());
      } catch (e) {
        if (roomIdRef.current !== id || participantKeyRef.current !== pk) return;
        setError(e?.message || String(e));
      } finally {
        inFlightRef.current = false;
        if (!opts.silent) setLoading(false);
        if (pendingFollowUpRef.current) {
          pendingFollowUpRef.current = false;
          void loadSnapshot({ silent: true });
        }
      }
    },
    [roomId, participantKey]
  );

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setMembers([]);
      setError("");
      setIsEjected(false);
      pendingFollowUpRef.current = false;
      return;
    }
    void loadSnapshot();
  }, [roomId, loadSnapshot]);

  useEffect(() => {
    if (!roomId) return undefined;
    const t = setInterval(() => {
      void loadSnapshot({ silent: true });
    }, Math.max(1500, pollMs));
    return () => clearInterval(t);
  }, [roomId, pollMs, loadSnapshot]);

  useEffect(() => {
    if (!room) return;
    const meState = me?.member_state;
    const roomClosed = room.status === "CLOSED" || room.is_hard_closed === true;
    const ejected = meState === "ejected";
    setIsEjected(Boolean(roomClosed || ejected));
  }, [room, me]);

  return {
    room,
    members,
    me,
    isHost,
    loading,
    error,
    lastLoadedAt,
    isEjected,
    reload: loadSnapshot,
  };
}

