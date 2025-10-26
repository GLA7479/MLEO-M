import { useEffect, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../../lib/supabaseClients";

export default function RoomPresence({ roomId, playerName, onLeave }) {
  const [members, setMembers] = useState([]);

  async function load() {
    if (!roomId) return;
    const { data } = await supabase
      .from("arcade_room_players")
      .select("id, player_name, joined_at")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });
    setMembers(data || []);
  }

  useEffect(() => {
    if (!roomId) return;
    load();
    const ch = supabase
      .channel(`presence:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "arcade_room_players", filter: `room_id=eq.${roomId}` }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "arcade_room_players", filter: `room_id=eq.${roomId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [roomId]);

  async function leaveRoom() {
    // best-effort: delete by (room_id, client_id)
    const client_id = getClientId();
    await supabase.from("arcade_room_players").delete().match({ room_id: roomId, client_id });
    onLeave?.();
  }

  if (!roomId) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-white/80 text-sm">Players in room</div>
      <div className="flex flex-col gap-1 max-h-[30vh] overflow-auto pr-1">
        {members.length===0 && <div className="text-white/50 text-xs">No players yet</div>}
        {members.map(m => (
          <div key={m.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-2 py-1">
            <div className="text-white text-xs font-semibold truncate">{m.player_name || 'Guest'}</div>
            <div className="text-white/50 text-[11px]">{new Date(m.joined_at).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
      <button onClick={leaveRoom} className="mt-2 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs">LEAVE ROOM</button>
    </div>
  );
}
