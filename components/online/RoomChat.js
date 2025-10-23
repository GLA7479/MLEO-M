import { useEffect, useRef, useState } from "react";
import { supabaseMP as supabase } from "../../lib/supabaseClients";

export default function RoomChat({ roomId, playerName }) {
  const [msgs, setMsgs] = useState([]);
  const [body, setBody] = useState("");
  const listRef = useRef(null);

  async function load() {
    const { data } = await supabase
      .from("arcade_messages")
      .select("id, player_name, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    setMsgs(data || []);
    scrollBottom();
  }
  function scrollBottom(){
    requestAnimationFrame(()=> listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }));
  }

  useEffect(() => {
    if (!roomId) return;
    load();
    const ch = supabase
      .channel(`chat:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "arcade_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        setMsgs(m => [...m, payload.new]);
        scrollBottom();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [roomId]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody("");
    await supabase.from("arcade_messages").insert({ room_id: roomId, player_name: playerName || "Guest", body: text });
  }

  if (!roomId) return null;

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-auto border border-white/10 rounded-lg p-2 bg-white/5">
        {msgs.map(m => (
          <div key={m.id} className="mb-1">
            <span className="text-emerald-300 text-xs font-semibold">{m.player_name || 'Guest'}:</span>
            <span className="text-white text-xs ml-2">{m.body}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={body} onChange={e=>setBody(e.target.value)} placeholder="Type a message…" className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-purple-400" />
        <button onClick={send} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs">SEND</button>
      </div>
    </div>
  );
}
