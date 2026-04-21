import { useEffect, useMemo, useState } from "react";
import { ONLINE_V2_GAME_KINDS, ONLINE_V2_MIN_STAKE_UNITS } from "../../../lib/online-v2/ov2Economy";
import { isOv2ColorClashStakeUnitsAllowed } from "../../../lib/online-v2/colorclash/ov2ColorClashStakes";
import { isOv2FleetHuntStakeUnitsAllowed } from "../../../lib/online-v2/fleethunt/ov2FleetHuntStakes";
import { isOv2GoalDuelStakeUnitsAllowed } from "../../../lib/online-v2/goal-duel/ov2GoalDuelStakes";

function defaultMaxPlayersForProduct(productId) {
  if (productId === ONLINE_V2_GAME_KINDS.BINGO) return 8;
  if (productId === ONLINE_V2_GAME_KINDS.FLEET_HUNT) return 2;
  if (productId === ONLINE_V2_GAME_KINDS.GOAL_DUEL) return 2;
  if (productId === ONLINE_V2_GAME_KINDS.TANKS) return 2;
  return 4;
}

export default function Ov2SharedCreateRoomModal({ open, games, selectedGameId, onClose, onSubmit, busy }) {
  const [title, setTitle] = useState("");
  const [productGameId, setProductGameId] = useState(selectedGameId || games[0]?.id || "");
  const [stakeInput, setStakeInput] = useState(String(ONLINE_V2_MIN_STAKE_UNITS));
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(() =>
    defaultMaxPlayersForProduct(selectedGameId || games[0]?.id || "")
  );
  const [visibilityMode, setVisibilityMode] = useState("public");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    const id = selectedGameId || games[0]?.id || "";
    setProductGameId(id);
    setMaxPlayers(defaultMaxPlayersForProduct(id));
    setMinPlayers(2);
  }, [open, selectedGameId, games]);

  const entryParsed = Math.floor(Number(stakeInput));
  const entryOkBase = stakeInput.trim() !== "" && Number.isFinite(entryParsed) && entryParsed >= ONLINE_V2_MIN_STAKE_UNITS;
  const entryOk =
    entryOkBase &&
    (productGameId !== ONLINE_V2_GAME_KINDS.COLOR_CLASH || isOv2ColorClashStakeUnitsAllowed(entryParsed)) &&
    (productGameId !== ONLINE_V2_GAME_KINDS.FLEET_HUNT || isOv2FleetHuntStakeUnitsAllowed(entryParsed)) &&
    (productGameId !== ONLINE_V2_GAME_KINDS.GOAL_DUEL || isOv2GoalDuelStakeUnitsAllowed(entryParsed));

  const canSubmit = useMemo(() => {
    if (!productGameId) return false;
    if (minPlayers < 1 || maxPlayers < 1 || minPlayers > maxPlayers) return false;
    if (!entryOk) return false;
    if (visibilityMode === "private" && !password.trim()) return false;
    return true;
  }, [productGameId, entryOk, minPlayers, maxPlayers, visibilityMode, password]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-zinc-950 p-3">
        <div className="mb-2 text-sm font-bold text-white">Create room</div>
        <div className="space-y-2">
          <select
            value={productGameId}
            onChange={e => {
              const id = e.target.value;
              setProductGameId(id);
              setMaxPlayers(defaultMaxPlayersForProduct(id));
              setMinPlayers(2);
            }}
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
            type="text"
            inputMode="numeric"
            value={stakeInput}
            onChange={e => setStakeInput(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white"
            placeholder="Room entry per seat"
          />
          <div className="text-[11px] text-zinc-500">
            Minimum {ONLINE_V2_MIN_STAKE_UNITS}.
            {productGameId === ONLINE_V2_GAME_KINDS.COLOR_CLASH ? (
              <span className="block text-zinc-400">Color Clash entry: 100, 1K, 10K, or 100K only.</span>
            ) : null}
            {productGameId === ONLINE_V2_GAME_KINDS.FLEET_HUNT ? (
              <span className="block text-zinc-400">Fleet Hunt entry: 100, 1K, 10K, or 100K only.</span>
            ) : null}
            {productGameId === ONLINE_V2_GAME_KINDS.GOAL_DUEL ? (
              <span className="block text-zinc-400">Goal Duel entry: 100, 1K, 10K, or 100K only.</span>
            ) : null}
          </div>
          {stakeInput.trim() !== "" && !entryOkBase ? (
            <div className="text-[11px] text-amber-200">Enter at least {ONLINE_V2_MIN_STAKE_UNITS}.</div>
          ) : null}
          {stakeInput.trim() !== "" && entryOkBase && productGameId === ONLINE_V2_GAME_KINDS.COLOR_CLASH && !isOv2ColorClashStakeUnitsAllowed(entryParsed) ? (
            <div className="text-[11px] text-amber-200">Color Clash allows only 100, 1,000, 10,000, or 100,000 per seat.</div>
          ) : null}
          {stakeInput.trim() !== "" && entryOkBase && productGameId === ONLINE_V2_GAME_KINDS.FLEET_HUNT && !isOv2FleetHuntStakeUnitsAllowed(entryParsed) ? (
            <div className="text-[11px] text-amber-200">Fleet Hunt allows only 100, 1,000, 10,000, or 100,000 per seat.</div>
          ) : null}
          {stakeInput.trim() !== "" && entryOkBase && productGameId === ONLINE_V2_GAME_KINDS.GOAL_DUEL && !isOv2GoalDuelStakeUnitsAllowed(entryParsed) ? (
            <div className="text-[11px] text-amber-200">Goal Duel allows only 100, 1,000, 10,000, or 100,000 per seat.</div>
          ) : null}
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
                stake_per_seat: entryParsed,
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

