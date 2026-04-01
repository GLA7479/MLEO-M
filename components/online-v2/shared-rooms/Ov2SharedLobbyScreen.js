import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  const games = useMemo(() => ONLINE_V2_SHARED_LOBBY_GAMES, []);
  const gameTitleById = useMemo(() => {
    const out = {};
    for (const g of ONLINE_V2_SHARED_LOBBY_GAMES) out[g.id] = g.title;
    return out;
  }, []);

  const loadRooms = useCallback(async () => {
    setMsg("");
    try {
      const out = await listOv2Rooms({ product_game_id: selectedGameId, limit: 80 });
      const raw = Array.isArray(out.rooms) ? out.rooms : [];
      const list = raw.filter(r => r && isOv2ActiveSharedProductId(r.product_game_id));
      setRooms(list);
    } catch (e) {
      setMsg(e?.message || String(e));
      setRooms([]);
    }
  }, [selectedGameId]);

  useEffect(() => {
    void loadRooms();
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
      await loadRooms();
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
      await loadRooms();
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
      await loadRooms();
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
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            value={displayName}
            onChange={e => onDisplayNameChange(e.target.value)}
            maxLength={24}
            placeholder="Display name"
            className="flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white placeholder:text-zinc-500"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadRooms()}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold"
          >
            Refresh
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

