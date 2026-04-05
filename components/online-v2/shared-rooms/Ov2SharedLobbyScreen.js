import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createOv2Room,
  joinOv2Room,
  joinOv2RoomByCode,
  listOv2Rooms,
} from "../../../lib/online-v2/room-api/ov2SharedRoomsApi";
import {
  isOv2ActiveSharedProductId,
  ONLINE_V2_SHARED_LOBBY_GAMES,
} from "../../../lib/online-v2/onlineV2GameRegistry";
import Ov2SharedCreateRoomModal from "./Ov2SharedCreateRoomModal";
import Ov2SharedJoinByCodeModal from "./Ov2SharedJoinByCodeModal";
import Ov2SharedQuickMatchBar from "./Ov2SharedQuickMatchBar";
import Ov2SharedRoomDirectory from "./Ov2SharedRoomDirectory";

export default function Ov2SharedLobbyScreen({
  participantId,
  displayName,
  onDisplayNameChange,
  onEnterRoom,
}) {
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);
  const listRequestIdRef = useRef(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const games = useMemo(() => ONLINE_V2_SHARED_LOBBY_GAMES, []);
  const gameTitleById = useMemo(() => {
    const out = {};
    for (const g of ONLINE_V2_SHARED_LOBBY_GAMES) out[g.id] = g.title;
    return out;
  }, []);

  const loadRooms = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    const rid = ++listRequestIdRef.current;
    if (!silent) setListRefreshing(true);
    setMsg("");
    try {
      const out = await listOv2Rooms({ product_game_id: selectedGameId, limit: 80 });
      if (rid !== listRequestIdRef.current) return;
      const raw = Array.isArray(out.rooms) ? out.rooms : [];
      const list = raw.filter(r => r && isOv2ActiveSharedProductId(r.product_game_id));
      setRooms(list);
    } catch (e) {
      if (rid !== listRequestIdRef.current) return;
      setMsg(e?.message || String(e));
      setRooms([]);
    } finally {
      if (rid === listRequestIdRef.current && !silent) setListRefreshing(false);
    }
  }, [selectedGameId]);

  useEffect(() => {
    void loadRooms({ silent: true });
  }, [loadRooms]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      void loadRooms({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [loadRooms]);

  async function handleCreate(payload) {
    if (!displayName.trim()) {
      setMsg("Set a display name first.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const out = await createOv2Room({
        ...payload,
        host_participant_key: participantId,
        display_name: displayName,
      });
      setCreateOpen(false);
      onEnterRoom(out.room?.id || null);
      await loadRooms({ silent: true });
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin({ room_id, password_plaintext }) {
    if (!displayName.trim()) {
      setMsg("Set a display name first.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await joinOv2Room({
        room_id,
        participant_key: participantId,
        display_name: displayName,
        password_plaintext,
      });
      onEnterRoom(room_id);
      await loadRooms({ silent: true });
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinByCode({ join_code, password_plaintext }) {
    if (!displayName.trim()) {
      setMsg("Set a display name first.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const out = await joinOv2RoomByCode({
        join_code,
        participant_key: participantId,
        display_name: displayName,
        password_plaintext,
      });
      setCodeOpen(false);
      onEnterRoom(out.room?.id || null);
      await loadRooms({ silent: true });
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="shrink-0 rounded-xl border border-white/10 bg-black/25 p-3">
        <div className="text-sm font-bold">Central lobby</div>
        <div className="mt-1 flex min-w-0 flex-row items-stretch gap-2">
          <input
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            maxLength={24}
            placeholder="Display name"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white placeholder:text-zinc-500"
          />
          <button
            type="button"
            disabled={listRefreshing}
            aria-busy={listRefreshing}
            onClick={() => void loadRooms({ silent: false })}
            className="shrink-0 touch-manipulation whitespace-nowrap rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60 sm:px-3"
          >
            {listRefreshing ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setSelectedGameId(null)}
          className={`rounded px-2 py-1 text-xs ${selectedGameId == null ? "bg-emerald-900/40 text-emerald-100" : "bg-white/10 text-zinc-200"}`}
        >
          All
        </button>
        {games.map(g => (
          <button
            key={g.id}
            type="button"
            onClick={() => setSelectedGameId(g.id)}
            className={`rounded px-2 py-1 text-xs ${selectedGameId === g.id ? "bg-emerald-900/40 text-emerald-100" : "bg-white/10 text-zinc-200"}`}
          >
            {g.title}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-100"
        >
          Create room
        </button>
        <button
          type="button"
          onClick={() => setCodeOpen(true)}
          className="flex-1 rounded-lg border border-sky-500/40 bg-sky-900/35 py-2 text-xs font-bold text-sky-100"
        >
          Join by code
        </button>
      </div>

      <Ov2SharedQuickMatchBar
        games={games}
        selectedGameId={selectedGameId}
        participantId={participantId}
        displayName={displayName}
        busy={busy}
        setBusy={setBusy}
        setMsg={setMsg}
        onEnterRoom={onEnterRoom}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-xl border border-white/10 bg-black/20 p-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <Ov2SharedRoomDirectory
          rooms={rooms}
          busy={busy}
          gameTitleById={gameTitleById}
          onJoinRoom={handleJoin}
        />
      </div>

      {msg ? (
        <div className="shrink-0 rounded border border-red-500/30 bg-red-950/30 px-2 py-1 text-xs text-red-200">{msg}</div>
      ) : null}

      <Ov2SharedCreateRoomModal
        open={createOpen}
        games={games}
        selectedGameId={selectedGameId}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        busy={busy}
      />
      <Ov2SharedJoinByCodeModal
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        onSubmit={handleJoinByCode}
        busy={busy}
      />
    </div>
  );
}

