import { useEffect, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../../lib/supabaseClients";

const TIER_OPTIONS = ['1K','10K','100K','1M','10M','100M'];
const TIERED_GAMES = ['poker', 'backgammon', 'roulette', 'blackjack'];

export default function RoomBrowser({ gameId, playerName, onJoinRoom }) {
  const [rooms, setRooms] = useState([]);
  const [title, setTitle] = useState("");
  const [usePasscode, setUsePasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [creating, setCreating] = useState(false);
  const [tier, setTier] = useState('10K');

  async function loadRooms() {
    const { data: roomsData, error: roomsError } = await supabase
      .from("arcade_rooms")
      .select("id, title, is_locked, passcode, created_at, meta")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });
    
    if (roomsError) return;
    
    // Get player count for each room
    const roomsWithPlayers = await Promise.all(
      (roomsData || []).map(async (room) => {
        const { count } = await supabase
          .from("arcade_room_players")
          .select("*", { count: "exact", head: true })
          .eq("room_id", room.id);
        
        return { ...room, player_count: count || 0 };
      })
    );
    
    setRooms(roomsWithPlayers);
  }

  useEffect(() => {
    loadRooms();
    const ch = supabase
      .channel(`rooms:${gameId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "arcade_rooms", filter: `game_id=eq.${gameId}` }, loadRooms)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "arcade_rooms", filter: `game_id=eq.${gameId}` }, loadRooms)
      // Add player count updates
      .on("postgres_changes", { event: "*", schema: "public", table: "arcade_room_players" }, loadRooms)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [gameId]);

  async function createRoom() {
    if (!title.trim()) return;
    setCreating(true);
    const payload = TIERED_GAMES.includes(gameId)
      ? { game_id: gameId, title, is_locked: !!usePasscode, passcode: usePasscode ? passcode.trim() || null : null, meta: { tier_code: tier } }
      : { game_id: gameId, title, is_locked: !!usePasscode, passcode: usePasscode ? passcode.trim() || null : null };
    await supabase.from("arcade_rooms").insert(payload);
    setTitle("");
    setPasscode("");
    setUsePasscode(false);
    setCreating(false);
    loadRooms();
  }

  async function joinRoom(room) {
    // Check if player name is entered
    if (!playerName || playerName.trim() === '') {
      alert('Please enter your player name to join a room!');
      return;
    }

    // If room is passcode-protected, ask for code
    if (room.is_locked) {
      const code = prompt("Enter room passcode:") || "";
      if ((room.passcode || "") !== code.trim()) {
        alert("Wrong passcode");
        return;
      }
    }
    const client_id = getClientId();
    await supabase
      .from("arcade_room_players")
      .upsert({ 
        room_id: room.id, 
        client_id, 
        player_name: playerName || "Guest", 
        joined_at: new Date().toISOString() 
      }, { onConflict: "room_id,client_id" });
    const tierCode = room?.meta?.tier_code || '10K';
    onJoinRoom?.(room.id, TIERED_GAMES.includes(gameId) ? tierCode : undefined);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-white/80 text-sm">Public rooms</div>
      <div className="flex flex-col gap-2 max-h-[40vh] overflow-auto pr-1">
        {rooms.length === 0 && (
          <div className="text-white/50 text-sm">No rooms yet. Create one!</div>
        )}
        {rooms.map(r => {
          const tierCode = r?.meta?.tier_code || '10K';
          return (
            <div key={r.id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-2">
              <div className="flex-1">
                <div className="text-white font-semibold text-sm truncate">{r.title} {TIERED_GAMES.includes(gameId) && (<span className="text-white/50 text-[11px]">• {tierCode}</span>)}</div>
                <div className="flex items-center gap-2 text-white/50 text-[11px]">
                  <span>{new Date(r.created_at).toLocaleString()}</span>
                  <span className="text-emerald-400">•</span>
                  <span className="text-emerald-400">{r.player_count} players</span>
                </div>
              </div>
              {r.is_locked && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">LOCKED</span>}
              <button onClick={() => joinRoom(r)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs">JOIN</button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-white/80 text-sm">Create a room</div>
      <div className="flex flex-col gap-2">
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Room title" className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400" />
        <label className="flex items-center gap-2 text-white/70 text-xs">
          <input type="checkbox" checked={usePasscode} onChange={e=>setUsePasscode(e.target.checked)} />
          Protect with passcode
        </label>
        {usePasscode && (
          <input value={passcode} onChange={e=>setPasscode(e.target.value)} placeholder="Passcode" className="w-full px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400" />
        )}
        {TIERED_GAMES.includes(gameId) && (
          <div className="flex items-center gap-2">
            <label className="text-white/70 text-xs">Tier</label>
            <select
              value={tier}
              onChange={e=>setTier(e.target.value)}
              className="px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs"
            >
              {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        <button onClick={createRoom} disabled={creating} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs">{creating? '...' : 'CREATE'}</button>
      </div>
    </div>
  );
}
