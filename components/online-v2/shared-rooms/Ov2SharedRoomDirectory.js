import { useState } from "react";

function visibilityBadge(room) {
  if (room.visibility_mode === "private") return "Private";
  if (room.visibility_mode === "hidden") return "Hidden";
  return "Public";
}

export default function Ov2SharedRoomDirectory({
  rooms,
  busy,
  onJoinRoom,
}) {
  const [passwordByRoom, setPasswordByRoom] = useState({});
  return (
    <div className="space-y-2">
      {rooms.length === 0 ? <p className="text-xs text-zinc-500">No rooms for this game filter.</p> : null}
      {rooms.map(room => {
        const requiresPassword = room.visibility_mode === "private" || room.requires_password;
        return (
          <div key={room.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{room.title || "Room"}</div>
                <div className="text-xs text-zinc-400">
                  {room.product_game_id} • {visibilityBadge(room)} {requiresPassword ? "🔒" : ""}
                </div>
                <div className="text-xs text-zinc-500">
                  {room.min_players}-{room.max_players} players • {room.status}
                </div>
              </div>
            </div>
            {requiresPassword ? (
              <input
                value={passwordByRoom[room.id] || ""}
                onChange={e => setPasswordByRoom(p => ({ ...p, [room.id]: e.target.value }))}
                type="password"
                placeholder="Password"
                className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-zinc-500"
              />
            ) : null}
            <div className="mt-2">
              <button
                type="button"
                disabled={busy || room.status !== "OPEN"}
                onClick={() =>
                  onJoinRoom({
                    room_id: room.id,
                    password_plaintext: requiresPassword ? passwordByRoom[room.id] || null : null,
                  })
                }
                className="w-full rounded-lg border border-sky-500/35 bg-sky-900/30 py-1.5 text-xs font-semibold text-sky-100 disabled:opacity-45"
              >
                Join
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

