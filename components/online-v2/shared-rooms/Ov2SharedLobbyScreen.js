import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createOv2Room,
  joinOv2Room,
  joinOv2RoomByCode,
  listOv2Rooms,
  Ov2SharedRoomRpcError,
} from "../../../lib/online-v2/room-api/ov2SharedRoomsApi";
import {
  getOv2DefaultMaxPlayersForProduct,
  isOv2ActiveSharedProductId,
  ONLINE_V2_GAME_IDS,
  ONLINE_V2_SHARED_LOBBY_GAMES,
} from "../../../lib/online-v2/onlineV2GameRegistry";
import Ov2SharedCreateRoomModal from "./Ov2SharedCreateRoomModal";
import Ov2SharedJoinByCodeModal from "./Ov2SharedJoinByCodeModal";
import Ov2SharedQuickMatchBar from "./Ov2SharedQuickMatchBar";
import Ov2SharedRoomDirectory from "./Ov2SharedRoomDirectory";

/** Large tile identity — presentation only. */
const GAME_TILE_EMOJI = {
  [ONLINE_V2_GAME_IDS.LUDO]: "🎲",
  [ONLINE_V2_GAME_IDS.RUMMY51]: "🃏",
  [ONLINE_V2_GAME_IDS.BINGO]: "🎱",
  [ONLINE_V2_GAME_IDS.BACKGAMMON]: "🏛️",
  [ONLINE_V2_GAME_IDS.CHECKERS]: "⚫",
  [ONLINE_V2_GAME_IDS.CHESS]: "♟️",
  [ONLINE_V2_GAME_IDS.DOMINOES]: "🧱",
  [ONLINE_V2_GAME_IDS.FOURLINE]: "🔵",
  [ONLINE_V2_GAME_IDS.FLIPGRID]: "🔲",
  [ONLINE_V2_GAME_IDS.MELDMATCH]: "🧩",
  [ONLINE_V2_GAME_IDS.COLOR_CLASH]: "🎨",
  [ONLINE_V2_GAME_IDS.FLEET_HUNT]: "🛸",
  [ONLINE_V2_GAME_IDS.GOAL_DUEL]: "⚽",
};

const MOBILE_MAX = 767.98;

function useIsNarrowLobby() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

/** Tile count for desktop game column (not used on narrow mobile Games tab — fixed 4). */
function useDesktopTilesPerPage() {
  const [n, setN] = useState(6);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const apply = () => setN(mqLg.matches ? 8 : 6);
    apply();
    mqLg.addEventListener("change", apply);
    return () => mqLg.removeEventListener("change", apply);
  }, []);
  return n;
}

export default function Ov2SharedLobbyScreen({
  participantId,
  displayName,
  onDisplayNameChange,
  onEnterRoom,
}) {
  const [selectedGameId, setSelectedGameId] = useState(
    () => ONLINE_V2_SHARED_LOBBY_GAMES[0]?.id ?? null
  );
  const [rooms, setRooms] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);
  const listRequestIdRef = useRef(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [pickerPage, setPickerPage] = useState(0);
  /** Visual-only mobile panel: which stack is shown (< md). */
  const [mobileLobbyTab, setMobileLobbyTab] = useState("games");
  const isNarrow = useIsNarrowLobby();
  const desktopTilesPerPage = useDesktopTilesPerPage();

  const tilesPerPage = isNarrow ? 4 : desktopTilesPerPage;

  const games = useMemo(() => ONLINE_V2_SHARED_LOBBY_GAMES, []);
  const gameTitleById = useMemo(() => {
    const out = {};
    for (const g of ONLINE_V2_SHARED_LOBBY_GAMES) out[g.id] = g.title;
    return out;
  }, []);

  const pickerItems = useMemo(
    () =>
      games.map(g => ({
        key: g.id,
        id: g.id,
        title: g.title,
        emoji: GAME_TILE_EMOJI[g.id] || "🕹️",
        meta: `Up to ${getOv2DefaultMaxPlayersForProduct(g.id)} players`,
      })),
    [games]
  );

  useEffect(() => {
    if (!games.length) return;
    if (selectedGameId == null || !games.some(g => g.id === selectedGameId)) {
      setSelectedGameId(games[0].id);
    }
  }, [games, selectedGameId]);

  const totalPages = Math.max(1, Math.ceil(pickerItems.length / tilesPerPage));

  useEffect(() => {
    setPickerPage(p => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const pageSlice = useMemo(() => {
    const start = pickerPage * tilesPerPage;
    return pickerItems.slice(start, start + tilesPerPage);
  }, [pickerItems, pickerPage, tilesPerPage]);

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
      if (e instanceof Ov2SharedRoomRpcError) {
        const c = String(e.code || "").toLowerCase();
        if (c === "room_not_found_or_invalid_credentials") {
          setMsg("Invalid room code or password.");
        } else if (c === "room_full") {
          setMsg("This room is full.");
        } else if (c === "invalid_state") {
          setMsg(e.message || "This room is not open for join.");
        } else if (c === "migration_required") {
          setMsg(e.message || "Could not complete join. Try again or contact support.");
        } else {
          setMsg(e.message || "Could not join this room.");
        }
      } else {
        setMsg(e?.message || String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const showGamesColumn =
    !isNarrow || mobileLobbyTab === "games";
  const showRoomsColumn =
    !isNarrow || mobileLobbyTab === "rooms";

  /** Narrow Games tab: capped grid height so picker + pager + Auto Match fit without page/tab scroll. */
  const gameGridClass = isNarrow
    ? "grid h-[min(35dvh,286px)] min-h-0 w-full shrink-0 grid-cols-2 grid-rows-2 gap-[5px] [grid-template-rows:repeat(2,minmax(0,1fr))]"
    : "grid min-h-0 w-full flex-1 grid-cols-3 grid-rows-2 gap-3 lg:grid-cols-4 lg:gap-3.5";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden px-1.5 pb-1 pt-1 md:gap-2 md:px-2 md:pb-2 md:pt-2 lg:px-3 lg:pb-3 lg:pt-3">
      {/* Compact identity row — no tall framed card */}
      <div className="flex shrink-0 items-stretch gap-2 border-b border-white/[0.08] pb-1.5 md:pb-2">
        <input
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
          maxLength={24}
          placeholder="Display name"
          className="min-w-0 flex-1 rounded-lg border border-white/14 bg-black/50 px-2.5 py-1.5 text-sm text-white shadow-inner placeholder:text-zinc-500 md:rounded-xl md:px-3 md:py-2"
        />
        <button
          type="button"
          disabled={listRefreshing}
          aria-busy={listRefreshing}
          onClick={() => void loadRooms({ silent: false })}
          className="shrink-0 touch-manipulation rounded-lg border border-white/20 bg-white/12 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 md:rounded-xl md:text-sm"
        >
          {listRefreshing ? "…" : "Refresh"}
        </button>
      </div>

      {/* Mobile-only segmented switch — visual panel only */}
      <div
        className="flex shrink-0 rounded-xl border border-white/12 bg-black/40 p-0.5 md:hidden"
        role="tablist"
        aria-label="Lobby view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileLobbyTab === "games"}
          className={`min-h-[36px] flex-1 touch-manipulation rounded-lg px-2 text-xs font-extrabold transition ${
            mobileLobbyTab === "games"
              ? "bg-white/14 text-white shadow-sm"
              : "text-zinc-400"
          }`}
          onClick={() => setMobileLobbyTab("games")}
        >
          Games
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileLobbyTab === "rooms"}
          className={`min-h-[36px] flex-1 touch-manipulation rounded-lg px-2 text-xs font-extrabold transition ${
            mobileLobbyTab === "rooms"
              ? "bg-white/14 text-white shadow-sm"
              : "text-zinc-400"
          }`}
          onClick={() => setMobileLobbyTab("rooms")}
        >
          Rooms
        </button>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden md:gap-2 ${
          isNarrow && mobileLobbyTab === "games" ? "gap-1" : "gap-2"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row md:gap-3 lg:gap-4">
        {/* Game picker column */}
        <div
          className={`min-h-0 min-w-0 flex-col overflow-hidden lg:flex-[0.9] ${
            showGamesColumn
              ? "flex flex-1 md:flex-[0.95]"
              : "hidden md:flex md:flex-1 md:flex-col md:flex-[0.95]"
          }`}
        >
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/14 bg-gradient-to-b from-zinc-900/90 via-zinc-950/80 to-black shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_rgba(0,0,0,0.45)] md:rounded-3xl md:p-3 lg:p-4 ${
              isNarrow ? "p-[6px]" : "p-1.5"
            }`}
          >
            <p
              className={`shrink-0 text-center font-bold uppercase tracking-[0.2em] text-zinc-500 md:text-[11px] ${
                isNarrow ? "hidden" : "text-[10px]"
              }`}
            >
              Pick a game
            </p>
            <div className={`${gameGridClass} ${isNarrow ? "mt-0" : "mt-1.5 min-h-0 md:mt-3"}`}>
              {pageSlice.map(item => {
                const selected = selectedGameId === item.id;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedGameId(item.id)}
                    className={`group flex min-h-0 touch-manipulation flex-col overflow-hidden text-left shadow-[0_14px_40px_rgba(0,0,0,0.35)] transition md:rounded-[1.35rem] md:border-2 md:px-3 md:py-3 ${
                      isNarrow
                        ? "rounded-lg border px-1 py-1"
                        : "rounded-2xl border-2 px-1.5 py-1.5"
                    } ${
                      selected
                        ? isNarrow
                          ? "border-emerald-400/70 bg-gradient-to-b from-emerald-900/65 to-emerald-950/55 ring-1 ring-emerald-400/35"
                          : "border-emerald-400/70 bg-gradient-to-b from-emerald-900/65 to-emerald-950/55 ring-2 ring-emerald-400/40"
                        : "border-white/14 bg-gradient-to-b from-white/[0.07] to-black/50 hover:border-white/25 hover:from-white/[0.09]"
                    } `}
                  >
                    <div
                      className={`flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-0.5 md:gap-2 md:px-0.5 md:pt-0 ${
                        isNarrow ? "gap-0 pt-0" : "gap-1 pt-0.5"
                      }`}
                    >
                      <span
                        className={`select-none leading-none ${
                          isNarrow
                            ? "text-[clamp(1.68rem,9.8vmin,2.38rem)]"
                            : "text-[clamp(2.75rem,10vmin,4.25rem)]"
                        }`}
                        aria-hidden
                      >
                        {item.emoji}
                      </span>
                      <span
                        className={`line-clamp-2 text-center leading-tight text-white md:leading-snug ${
                          isNarrow
                            ? "text-[15px] font-black tracking-tight drop-shadow-sm"
                            : "text-base font-extrabold lg:text-lg"
                        }`}
                      >
                        {item.title}
                      </span>
                      <span
                        className={`line-clamp-1 text-center font-medium md:font-medium ${
                          isNarrow ? "text-[9.5px] leading-tight text-zinc-500" : "text-xs text-zinc-400 lg:text-[13px]"
                        }`}
                      >
                        {item.meta}
                      </span>
                    </div>
                    <span
                      className={`mt-auto flex w-full shrink-0 items-center justify-center font-black tracking-wide md:rounded-xl ${
                        isNarrow
                          ? "mt-0.5 min-h-[42px] rounded-md py-0 text-[12px] leading-none"
                          : "mt-2 h-11 rounded-lg text-sm md:h-12 md:text-[15px]"
                      } ${
                        selected
                          ? "bg-emerald-400/25 text-emerald-50"
                          : "bg-white/14 text-zinc-50 group-hover:bg-white/20"
                      }`}
                    >
                      {selected ? "Selected" : "Tap to choose"}
                    </span>
                  </button>
                );
              })}
              {Array.from({ length: Math.max(0, tilesPerPage - pageSlice.length) }).map((_, i) => (
                <div
                  key={`pad-${i}`}
                  className={`pointer-events-none min-h-0 border-dashed border-white/[0.06] bg-white/[0.02] md:rounded-[1.35rem] md:border-2 ${
                    isNarrow ? "rounded-lg border" : "rounded-2xl border-2"
                  }`}
                  aria-hidden
                />
              ))}
            </div>

            {totalPages > 1 ? (
              <div
                className={`flex shrink-0 items-center justify-center md:mt-3 ${
                  isNarrow ? "mt-1 gap-2 py-0.5" : "mt-2 gap-3"
                }`}
              >
                <button
                  type="button"
                  className={`touch-manipulation flex items-center justify-center rounded-full border-2 font-extrabold text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition active:scale-95 disabled:opacity-35 disabled:active:scale-100 ${
                    isNarrow
                      ? "min-h-[44px] min-w-[44px] border-white/35 bg-gradient-to-b from-white/22 to-white/10 text-2xl leading-none ring-1 ring-white/15"
                      : "min-h-[48px] min-w-[48px] border-white/30 bg-gradient-to-b from-white/20 to-white/10 text-2xl leading-none ring-1 ring-white/10"
                  }`}
                  disabled={pickerPage <= 0}
                  onClick={() => setPickerPage(p => Math.max(0, p - 1))}
                  aria-label="Previous games"
                >
                  ‹
                </button>
                <div className={`flex items-center ${isNarrow ? "gap-1.5" : "gap-1.5"}`} role="tablist" aria-label="Game pages">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={i === pickerPage}
                      className={`rounded-full touch-manipulation transition-all ${
                        isNarrow ? "h-1.5 w-1.5" : "h-2.5"
                      } ${i === pickerPage ? (isNarrow ? "w-4 bg-emerald-400" : "w-7 bg-emerald-400") : isNarrow ? "bg-white/22 hover:bg-white/40" : "w-2.5 bg-white/22 hover:bg-white/40"}`}
                      onClick={() => setPickerPage(i)}
                      aria-label={`Games page ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className={`touch-manipulation flex items-center justify-center rounded-full border-2 font-extrabold text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition active:scale-95 disabled:opacity-35 disabled:active:scale-100 ${
                    isNarrow
                      ? "min-h-[44px] min-w-[44px] border-white/35 bg-gradient-to-b from-white/22 to-white/10 text-2xl leading-none ring-1 ring-white/15"
                      : "min-h-[48px] min-w-[48px] border-white/30 bg-gradient-to-b from-white/20 to-white/10 text-2xl leading-none ring-1 ring-white/10"
                  }`}
                  disabled={pickerPage >= totalPages - 1}
                  onClick={() => setPickerPage(p => Math.min(totalPages - 1, p + 1))}
                  aria-label="Next games"
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Rooms stack: directory, quick match, actions */}
        <div
          className={`min-h-0 min-w-0 flex-col gap-2 overflow-hidden md:min-w-0 md:flex-1 ${
            showRoomsColumn
              ? "flex flex-1"
              : "hidden md:flex md:flex-1 md:flex-col"
          }`}
        >
          {/* Desktop always; mobile only on Rooms tab — then directory (Quick Match on narrow is on Games tab only) */}
          {(!isNarrow || mobileLobbyTab === "rooms") && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="touch-manipulation min-h-[44px] flex-1 rounded-xl border border-emerald-500/50 bg-emerald-950/50 py-2 text-xs font-extrabold text-emerald-50 shadow-[0_10px_28px_rgba(16,185,129,0.12)] md:min-h-[48px] md:rounded-2xl md:py-2.5 md:text-sm"
              >
                Create room
              </button>
              <button
                type="button"
                onClick={() => setCodeOpen(true)}
                className="touch-manipulation min-h-[44px] flex-1 rounded-xl border border-sky-500/50 bg-sky-950/45 py-2 text-xs font-extrabold text-sky-50 shadow-[0_10px_28px_rgba(14,165,233,0.12)] md:min-h-[48px] md:rounded-2xl md:py-2.5 md:text-sm"
              >
                Join by code
              </button>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden md:gap-2.5">
            {!isNarrow ? (
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
            ) : null}

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-2xl border border-white/12 bg-black/35 p-2 shadow-inner md:rounded-3xl md:p-3"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <Ov2SharedRoomDirectory
                rooms={rooms}
                busy={busy}
                gameTitleById={gameTitleById}
                onJoinRoom={handleJoin}
              />
            </div>
          </div>
        </div>
        </div>

        {/* Mobile Games: compact Auto Match — descendant tightening only (no QuickMatch source edits); no inner scroll */}
        {isNarrow && mobileLobbyTab === "games" ? (
          <div className="shrink-0 overflow-hidden rounded-lg border border-white/12 bg-black/35 px-1 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] [&>div]:!space-y-1 [&>div]:!rounded-lg [&>div]:!border-amber-500/20 [&>div]:!p-1.5 [&>div]:!text-[10px] [&_button]:!min-h-0 [&_button]:!rounded-md [&_button]:!py-1 [&_button]:!text-[10px] [&_button]:!leading-tight [&_p]:!my-0 [&_p]:!text-[10px] [&_p]:!leading-snug [&_ul]:!max-h-9 [&_ul]:!overflow-hidden [&_ul]:!text-[10px] [&_.mb-1]:!mb-0 [&_.flex-wrap]:!gap-1">
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
          </div>
        ) : null}
      </div>

      {msg ? (
        <div className="shrink-0 rounded-xl border border-red-500/35 bg-red-950/40 px-2 py-1.5 text-xs text-red-100">
          {msg}
        </div>
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
