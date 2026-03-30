import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../Layout";
import {
  clampSuggestedOnlineV2Stake,
  ONLINE_V2_MIN_STAKE_UNITS,
} from "../../lib/online-v2/ov2Economy";
import { ONLINE_V2_REGISTRY } from "../../lib/online-v2/onlineV2GameRegistry";
import { getOv2ParticipantId } from "../../lib/online-v2/ov2ParticipantId";
import { createOv2Room, fetchOv2MemberCounts, fetchOv2Rooms } from "../../lib/online-v2/ov2RoomsApi";
import { peekOnlineV2Vault, readOnlineV2Vault } from "../../lib/online-v2/onlineV2VaultBridge";
import OnlineV2VaultStrip from "./OnlineV2VaultStrip";
import Ov2RoomLobby from "./Ov2RoomLobby";

const OV2_DISPLAY_NAME_KEY = "ov2_display_name_v1";

function isOv2HubEnabled() {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ONLINE_V2_ENABLED === "false") {
    return false;
  }
  return true;
}

function fmtStake(n) {
  const v = Math.floor(Number(n) || 0);
  return v.toLocaleString();
}

/**
 * OV2 rooms utility: create / list / open lobby. Inner content may scroll; outer main is fixed viewport.
 */
export default function OnlineV2RoomsScreen() {
  const enabled = isOv2HubEnabled();
  const games = useMemo(() => ONLINE_V2_REGISTRY, []);

  const [filterGameId, setFilterGameId] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [stakeInput, setStakeInput] = useState(
    String(ONLINE_V2_REGISTRY[0]?.defaultStakeUnits ?? ONLINE_V2_MIN_STAKE_UNITS)
  );
  const [createGameId, setCreateGameId] = useState(ONLINE_V2_REGISTRY[0]?.id ?? "");

  const [rooms, setRooms] = useState([]);
  const [memberCounts, setMemberCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(OV2_DISPLAY_NAME_KEY) || "";
    setDisplayName(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !displayName) return;
    window.localStorage.setItem(OV2_DISPLAY_NAME_KEY, displayName);
  }, [displayName]);

  const loadRooms = useCallback(async () => {
    if (!enabled) return;
    setMsg("");
    try {
      const list = await fetchOv2Rooms(filterGameId);
      setRooms(list);
      const ids = list.map(r => r.id);
      const counts = await fetchOv2MemberCounts(ids);
      setMemberCounts(counts);
    } catch (e) {
      setMsg(e?.message || String(e));
      setRooms([]);
      setMemberCounts({});
    }
  }, [enabled, filterGameId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    const g = games.find(x => x.id === filterGameId);
    if (g) setStakeInput(String(g.defaultStakeUnits));
  }, [filterGameId, games]);

  async function ensureBalanceForStake(stake) {
    await readOnlineV2Vault({ fresh: true }).catch(() => {});
    const bal = Math.floor(Number(peekOnlineV2Vault().balance) || 0);
    if (bal < stake) {
      setMsg(`Need at least ${fmtStake(stake)} coins (have ${fmtStake(bal)}).`);
      return false;
    }
    return true;
  }

  async function onCreate() {
    if (!displayName.trim()) {
      setMsg("Set a display name.");
      return;
    }
    const product_game_id = filterGameId || createGameId;
    if (!product_game_id) {
      setMsg("Choose a game.");
      return;
    }
    const stake = clampSuggestedOnlineV2Stake(stakeInput);
    if (!(await ensureBalanceForStake(stake))) return;

    setBusy(true);
    setMsg("");
    try {
      await createOv2Room({
        product_game_id,
        title: newTitle.trim() || "Table",
        stake_per_seat: stake,
        host_participant_key: getOv2ParticipantId(),
        display_name: displayName.trim(),
      });
      setNewTitle("");
      await loadRooms();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (enabled && selectedRoomId) {
    return (
      <Layout title="Online V2 — Rooms">
        <main
          className="online-v2-rooms-main flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
          style={{
            paddingTop: "max(8px, env(safe-area-inset-top))",
            paddingBottom: "max(8px, env(safe-area-inset-bottom))",
          }}
        >
          <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-1 flex-col gap-2 px-2 md:max-w-4xl md:px-4 lg:max-w-5xl lg:gap-2 lg:px-6 xl:max-w-6xl xl:gap-2.5 xl:px-8 2xl:max-w-7xl">
            <header className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-2 py-2 md:px-3 lg:px-4 lg:py-2.5 xl:px-5">
              <div className="min-w-0 flex-1 text-center">
                <h1 className="truncate text-sm font-extrabold">Room</h1>
              </div>
              <OnlineV2VaultStrip />
            </header>
            <Ov2RoomLobby
              roomId={selectedRoomId}
              participantId={participantId}
              displayName={displayName}
              onBack={() => setSelectedRoomId(null)}
              onRoomChanged={() => void loadRooms()}
            />
          </div>
        </main>
      </Layout>
    );
  }

  return (
    <Layout title="Online V2 — Rooms">
      <main
        className="online-v2-rooms-main flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-1 flex-col gap-2 px-2 md:max-w-4xl md:px-4 lg:max-w-5xl lg:gap-2 lg:px-6 xl:max-w-6xl xl:gap-2.5 xl:px-8 2xl:max-w-7xl">
          <header className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-2 py-2 md:px-3 lg:gap-2 lg:px-4 lg:py-2.5 xl:px-5">
            <Link
              href="/online-v2"
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white lg:px-3 lg:py-1.5 lg:text-sm"
            >
              Back
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <h1 className="truncate text-sm font-extrabold sm:text-base lg:text-lg xl:text-xl">Rooms & lobby</h1>
              <p className="truncate text-[11px] text-zinc-300 lg:text-xs xl:text-sm">Create, join, ready, start</p>
            </div>
            <OnlineV2VaultStrip />
          </header>

          {!enabled ? (
            <div className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
              Online V2 is disabled (NEXT_PUBLIC_ONLINE_V2_ENABLED=false).
            </div>
          ) : null}

          {enabled ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 pb-1">
                <div className="flex flex-col gap-2 md:gap-3 xl:grid xl:grid-cols-[minmax(280px,400px)_1fr] xl:items-start xl:gap-6 2xl:grid-cols-[minmax(300px,440px)_1fr] 2xl:gap-8">
                  <div className="flex min-w-0 flex-col gap-2 md:gap-3">
                    <div className="flex flex-wrap gap-1 md:gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFilterGameId(null)}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold md:px-2.5 md:py-1.5 md:text-xs lg:text-sm ${
                          filterGameId == null
                            ? "border-emerald-500/50 bg-emerald-900/40 text-emerald-100"
                            : "border-white/15 bg-white/5 text-zinc-300"
                        }`}
                      >
                        All games
                      </button>
                      {games.map(g => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setFilterGameId(g.id)}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-semibold md:px-2.5 md:py-1.5 md:text-xs lg:text-sm ${
                            filterGameId === g.id
                              ? "border-emerald-500/50 bg-emerald-900/40 text-emerald-100"
                              : "border-white/15 bg-white/5 text-zinc-300"
                          }`}
                        >
                          {g.title}
                        </button>
                      ))}
                    </div>

                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 lg:text-xs">Display name</span>
                      <input
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        maxLength={24}
                        placeholder="Name"
                        className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 lg:px-3 lg:py-2 lg:text-base"
                      />
                    </label>

                    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-2 md:gap-3 md:p-3 lg:p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 lg:text-xs">Create room</div>
                      {!filterGameId ? (
                        <select
                          value={createGameId}
                          onChange={e => setCreateGameId(e.target.value)}
                          className="rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white lg:py-2 lg:text-sm"
                        >
                          {games.map(g => (
                            <option key={g.id} value={g.id}>
                              {g.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-[11px] text-zinc-400 lg:text-sm">
                          Game: {games.find(g => g.id === filterGameId)?.title}
                        </div>
                      )}
                      <input
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        placeholder="Room title"
                        maxLength={40}
                        className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 lg:px-3 lg:py-2 lg:text-base"
                      />
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-zinc-500 lg:text-xs">Stake / seat (min {ONLINE_V2_MIN_STAKE_UNITS})</span>
                        <input
                          type="number"
                          min={ONLINE_V2_MIN_STAKE_UNITS}
                          value={stakeInput}
                          onChange={e => setStakeInput(e.target.value)}
                          className="rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white lg:px-3 lg:py-2 lg:text-base"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onCreate()}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-800/40 py-2 text-xs font-bold text-emerald-100 disabled:opacity-50 lg:rounded-xl lg:py-2.5 lg:text-sm xl:text-base"
                      >
                        {busy ? "…" : "Create"}
                      </button>
                    </div>
                  </div>

                  <div className="flex min-h-0 min-w-0 flex-col gap-2 xl:min-h-[200px]">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 lg:text-xs">Room list</h2>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void loadRooms()}
                        className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-zinc-300 md:text-xs lg:px-3 lg:py-1 lg:text-sm"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="space-y-1.5 md:space-y-2">
                      {rooms.length === 0 ? (
                        <p className="text-[11px] text-zinc-500 lg:text-sm">No rooms{filterGameId ? " for this game" : ""}.</p>
                      ) : (
                        rooms.map(r => {
                          const n = memberCounts[r.id] ?? 0;
                          const isHost = participantId && r.host_participant_key === participantId;
                          const canOpen = r.lifecycle_phase === "lobby" || r.lifecycle_phase === "pending_start";
                          return (
                            <div
                              key={r.id}
                              className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] sm:flex-row sm:items-center sm:justify-between md:p-3 lg:text-sm"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold text-white">{r.title || "Table"}</div>
                                <div className="mt-0.5 text-zinc-500">
                                  {r.product_game_id} · {r.lifecycle_phase} · stake {fmtStake(r.stake_per_seat)} · {n} in room
                                  {isHost ? " · host" : ""}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={busy || !canOpen}
                                onClick={() => setSelectedRoomId(r.id)}
                                className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 lg:px-4 lg:py-2 lg:text-sm"
                              >
                                Open
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {msg ? (
                      <div className="rounded-lg border border-red-500/30 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-200 lg:p-3 lg:text-sm">
                        {msg}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </Layout>
  );
}
