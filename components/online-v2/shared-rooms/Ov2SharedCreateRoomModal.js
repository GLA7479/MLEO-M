import { useMemo, useState } from "react";
import { ONLINE_V2_MIN_STAKE_UNITS } from "../../../lib/online-v2/ov2Economy";

export default function Ov2SharedCreateRoomModal({ open, games, selectedGameId, onClose, onSubmit, busy }) {
  const [title, setTitle] = useState("");
  const [productGameId, setProductGameId] = useState(selectedGameId || games[0]?.id || "");
  const [stakePerSeat, setStakePerSeat] = useState(ONLINE_V2_MIN_STAKE_UNITS);
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [visibilityMode, setVisibilityMode] = useState("public");
  const [password, setPassword] = useState("");

  const canSubmit = useMemo(() => {
    if (!productGameId) return false;
    if (minPlayers < 1 || maxPlayers < 1 || minPlayers > maxPlayers) return false;
    const entry = Math.floor(Number(stakePerSeat));
    if (!Number.isFinite(entry) || entry < ONLINE_V2_MIN_STAKE_UNITS) return false;
    if (visibilityMode === "private" && !password.trim()) return false;
    return true;
  }, [productGameId, stakePerSeat, minPlayers, maxPlayers, visibilityMode, password]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-zinc-950 p-3">
        <div className="mb-2 text-sm font-bold text-white">Create room</div>
        <div className="space-y-2">
          <select
            value={productGameId}
            onChange={e => setProductGameId(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
          >
            {games.map(g => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Room title"
            maxLength={40}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white placeholder:text-zinc-500"
          />
          <input
            type="number"
            min={ONLINE_V2_MIN_STAKE_UNITS}
            step={1}
            value={stakePerSeat}
            onChange={e =>
              setStakePerSeat(Math.max(ONLINE_V2_MIN_STAKE_UNITS, Math.floor(Number(e.target.value) || 0)))
            }
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
            placeholder="Room entry per seat"
          />
          <div className="text-[11px] text-zinc-500">Minimum {ONLINE_V2_MIN_STAKE_UNITS}.</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              value={minPlayers}
              onChange={e => setMinPlayers(Math.max(1, Number(e.target.value) || 1))}
              className="rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
              placeholder="Min players"
            />
            <input
              type="number"
              min={1}
              value={maxPlayers}
              onChange={e => setMaxPlayers(Math.max(1, Number(e.target.value) || 1))}
              className="rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
              placeholder="Max players"
            />
          </div>
          <select
            value={visibilityMode}
            onChange={e => setVisibilityMode(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
          >
            <option value="public">Public</option>
            <option value="private">Private (listed + password)</option>
            <option value="hidden">Hidden (code only)</option>
          </select>
          {(visibilityMode === "private" || visibilityMode === "hidden") && (
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="Password (optional for hidden)"
              className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white placeholder:text-zinc-500"
            />
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/20 bg-white/10 py-2 text-xs font-semibold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() =>
              onSubmit({
                product_game_id: productGameId,
                title,
                stake_per_seat: Math.floor(Number(stakePerSeat)),
                min_players: minPlayers,
                max_players: maxPlayers,
                visibility_mode: visibilityMode,
                password_plaintext: password || null,
              })
            }
            className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-100 disabled:opacity-45"
          >
            {busy ? "Creating..." : "Create room"}
          </button>
        </div>
      </div>
    </div>
  );
}

