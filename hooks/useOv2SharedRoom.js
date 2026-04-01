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

  const inFlightRef = useRef(false);

  const me = useMemo(
    () => members.find(m => m.participant_key === participantKey) || null,
    [members, participantKey]
  );

  const isHost = useMemo(
    () => Boolean(room && me && room.host_member_id && room.host_member_id === me.id),
    [room, me]
  );

  const loadSnapshot = useCallback(
    async (opts = { silent: false }) => {
      if (!roomId || inFlightRef.current) return;
      inFlightRef.current = true;
      if (!opts.silent) setLoading(true);
      setError("");
      try {
        await reconnectOv2RoomMember({ room_id: roomId, participant_key: participantKey }).catch(() => {});
        const out = await getOv2RoomSnapshot({
          room_id: roomId,
          viewer_participant_key: participantKey,
        });
        setRoom(out.room || null);
        setMembers(Array.isArray(out.members) ? out.members : []);
        setLastLoadedAt(Date.now());
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        inFlightRef.current = false;
        if (!opts.silent) setLoading(false);
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

