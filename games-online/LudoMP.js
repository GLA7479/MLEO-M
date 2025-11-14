// games-online/LudoMP.js
// Single entry: Ludo game with mode selector:
//  - Online MP (Supabase, 2-4 players)
//  - Vs Bot (local, 1v1)
// Uses lib/ludoEngine.js

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  createInitialBoard,
  listMovablePieces,
  applyMove,
  nextTurnSeat,
  LUDO_PIECES_PER_PLAYER,
  LUDO_TRACK_LEN,
} from "../lib/ludoEngine";

const TURN_SECONDS = Number(process.env.NEXT_PUBLIC_LUDO_TURN_SECONDS || 30);
const MIN_BUYIN_OPTIONS = {
  "1K": 1_000,
  "10K": 10_000,
  "100K": 100_000,
  "1M": 1_000_000,
  "10M": 10_000_000,
  "100M": 100_000_000,
};

// ---------- Vault helpers ----------
function safeRead(key, def) {
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : def;
  } catch {
    return def;
  }
}
function safeWrite(key, val) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // ignore
  }
}
function readVault() {
  const rush = safeRead("mleo_rush_core_v4", {});
  return Math.max(0, Number(rush.vault || 0));
}
function writeVault(nextValue) {
  const rush = safeRead("mleo_rush_core_v4", {});
  rush.vault = Math.max(0, Math.floor(Number(nextValue || 0)));
  safeWrite("mleo_rush_core_v4", rush);
  if (typeof window !== "undefined" && typeof window.updateVaultCallback === "function") {
    window.updateVaultCallback(readVault());
  }
}
function fmt(n) {
  n = Math.floor(Number(n || 0));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
}

// =================== PUBLIC ENTRY ===================

export default function LudoMP({ roomId, playerName, vault, setVaultBoth, tierCode = "10K" }) {
  // Single vault bridge, used both by MP and Bot
  useEffect(() => {
    window.updateVaultCallback = setVaultBoth;
    return () => {
      delete window.updateVaultCallback;
    };
  }, [setVaultBoth]);

  const [mode, setMode] = useState(null); // null | "online" | "bot"

  // Simple overlay menu for mode selection
  if (!mode) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">
        <div className="bg-black/70 border border-white/20 rounded-2xl p-4 sm:p-6 max-w-sm w-full flex flex-col gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold mb-1">Ludo</div>
            <div className="text-xs text-white/70">
              Choose how you want to play
            </div>
          </div>
          <button
            onClick={() => setMode("online")}
            className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
          >
            Online • 2–4 Players
          </button>
          <button
            onClick={() => setMode("bot")}
            className="w-full px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm font-semibold"
          >
            Vs Bot • 1v1
          </button>
          <div className="text-[11px] text-white/60 text-center">
            Vault: {fmt(vault)}
          </div>
        </div>
      </div>
    );
  }

  // Top-level wrapper with "Back to mode menu" button
  return (
    <div className="w-full h-full flex flex-col text-white">
      <div className="flex items-center justify-between bg-black/40 px-3 py-2 rounded-lg text-xs sm:text-sm mb-2">
        <div className="flex flex-col">
          <span className="font-semibold">Ludo {mode === "online" ? "Online" : "vs Bot"}</span>
          {mode === "online" && roomId && (
            <span className="text-white/60">Room: {roomId.slice(0, 8)}…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/70 text-xs">Vault: {fmt(vault)}</span>
          <button
            onClick={() => setMode(null)}
            className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px]"
          >
            Mode
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {mode === "online" ? (
          <LudoOnline
            roomId={roomId}
            playerName={playerName}
            vault={vault}
            tierCode={tierCode}
          />
        ) : (
          <LudoVsBot vault={vault} />
        )}
      </div>
    </div>
  );
}

// =================== ONLINE MULTIPLAYER ===================

function LudoOnline({ roomId, playerName, vault, tierCode }) {
  const name = playerName || "Guest";
  const clientId = useMemo(() => getClientId(), []);
  const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;

  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");
  const tickRef = useRef(null);

  const isLeader = useMemo(() => {
    if (!roomMembers.length || !name) return false;
    const sorted = [...roomMembers].sort((a, b) =>
      (a.player_name || "").localeCompare(b.player_name || "")
    );
    return sorted[0]?.player_name === name;
  }, [roomMembers, name]);

  const seatMap = useMemo(
    () => new Map(players.map((p) => [p.seat_index, p])),
    [players]
  );
  const myRow = players.find((p) => p.client_id === clientId) || null;
  const mySeat = myRow?.seat_index ?? null;

  // sessions channel
  useEffect(() => {
    if (!roomId) return;

    const ch = supabase
      .channel("ludo_sessions:" + roomId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ludo_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data } = await supabase
            .from("ludo_sessions")
            .select("*")
            .eq("room_id", roomId)
            .maybeSingle();
          setSes(data || null);
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await supabase
            .from("ludo_sessions")
            .select("*")
            .eq("room_id", roomId)
            .maybeSingle();
          setSes(data || null);
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });

    return () => {
      ch.unsubscribe();
    };
  }, [roomId, name]);

  // players channel
  useEffect(() => {
    if (!ses?.id) return;

    const ch = supabase
      .channel("ludo_players:" + ses.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ludo_players",
          filter: `session_id=eq.${ses.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("ludo_players")
            .select("*")
            .eq("session_id", ses.id)
            .order("seat_index");
          setPlayers(data || []);
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await supabase
            .from("ludo_players")
            .select("*")
            .eq("session_id", ses.id)
            .order("seat_index");
          setPlayers(data || []);
        }
      });
    return () => ch.unsubscribe();
  }, [ses?.id]);

  // timer
  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(async () => {
      if (!ses?.turn_deadline || ses.stage !== "playing") return;
      const d = new Date(ses.turn_deadline).getTime();
      if (Date.now() >= d) {
        await autoAct();
      }
    }, 250);
    return () => clearInterval(tickRef.current);
  }, [ses?.turn_deadline, ses?.stage, ses?.current_turn, mySeat]);

  async function fetchSession() {
    if (!ses?.id) return null;
    const { data } = await supabase.from("ludo_sessions").select("*").eq("id", ses.id).single();
    if (data) setSes(data);
    return data;
  }

  async function autoAct() {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const b = s.board_state || {};
    const turnSeat = b.turnSeat ?? s.current_turn;
    if (mySeat == null || mySeat !== turnSeat) return;

    if (!b.dice) {
      await doRoll();
      return;
    }
    const moves = listMovablePieces(b, turnSeat, b.dice);
    if (!moves.length) {
      await endTurn(b);
      return;
    }
    await bumpDeadline();
  }

  async function bumpDeadline() {
    if (!ses?.id) return;
    await supabase
      .from("ludo_sessions")
      .update({
        turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
      })
      .eq("id", ses.id);
  }

  const ensureSession = useCallback(
    async (room) => {
      const { data: upserted, error } = await supabase
        .from("ludo_sessions")
        .upsert(
          {
            room_id: room,
            stage: "lobby",
            seat_count: 4,
            board_state: null,
            current: {
              __double__: { value: 1, proposed_by: null, awaiting: null },
              __entry__: MIN_BUYIN_OPTIONS[tierCode] ?? 0,
              __result__: null,
            },
            current_turn: null,
            turn_deadline: null,
          },
          { onConflict: "room_id", ignoreDuplicates: false }
        )
        .select()
        .single();
      if (error && error.code !== "23505") {
        throw error;
      }
      if (upserted) return upserted;
      const { data: existing } = await supabase
        .from("ludo_sessions")
        .select("*")
        .eq("room_id", room)
        .single();
      return existing;
    },
    [tierCode]
  );

  const takeSeat = useCallback(
    async (seatIndex) => {
      if (!clientId) {
        setMsg("Client not recognized");
        return;
      }
      if (readVault() < minRequired) {
        setMsg(`Minimum buy-in is ${fmt(minRequired)}`);
        return;
      }
      let session = ses;
      if (!session || !session.id) {
        session = await ensureSession(roomId);
        setSes(session);
      }
      const { data: occupied } = await supabase
        .from("ludo_players")
        .select("id,client_id")
        .eq("session_id", session.id)
        .eq("seat_index", seatIndex)
        .maybeSingle();

      if (occupied && occupied.client_id && occupied.client_id !== clientId) {
        setMsg("Seat taken");
        return;
      }

      const { data: mine } = await supabase
        .from("ludo_players")
        .select("id,seat_index")
        .eq("session_id", session.id)
        .eq("client_id", clientId)
        .maybeSingle();

      if (mine && mine.seat_index !== seatIndex) {
        await supabase.from("ludo_players").update({ seat_index: seatIndex }).eq("id", mine.id);
      } else if (!mine) {
        await supabase
          .from("ludo_players")
          .insert({
            session_id: session.id,
            seat_index: seatIndex,
            player_name: name,
            client_id: clientId,
          });
      }
      setMsg("");
    },
    [clientId, ensureSession, minRequired, name, roomId, ses]
  );

  const leaveSeat = useCallback(async () => {
    if (!ses?.id || !clientId) return;
    await supabase
      .from("ludo_players")
      .delete()
      .eq("session_id", ses.id)
      .eq("client_id", clientId);
  }, [clientId, ses?.id]);

  const startGame = useCallback(async () => {
    if (!isLeader) {
      setMsg("Only leader can start");
      return;
    }
    if (!ses?.id) return;
    const seated = players.filter((p) => p.seat_index != null);
    if (seated.length < 2) {
      setMsg("Need at least 2 players seated");
      return;
    }
    const vaultNow = readVault();
    if (vaultNow < minRequired) {
      setMsg(`Need at least ${fmt(minRequired)} in vault`);
      return;
    }
    const activeSeats = seated.map((p) => p.seat_index).sort((a, b) => a - b);
    const initialBoard = createInitialBoard(activeSeats);
    const entry = MIN_BUYIN_OPTIONS[tierCode] ?? 0;

    if (mySeat != null && vaultNow >= entry) {
      writeVault(vaultNow - entry);
    }

    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        stage: "playing",
        board_state: initialBoard,
        current: {
          __double__: { value: 1, proposed_by: null, awaiting: null },
          __entry__: entry,
          __result__: null,
        },
        current_turn: initialBoard.turnSeat,
        turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
      })
      .eq("id", ses.id)
      .select()
      .single();

    if (error) {
      setMsg(error.message || "Failed to start game");
    } else {
      setSes(data);
      setMsg("");
    }
  }, [isLeader, ses?.id, players, minRequired, tierCode, mySeat]);

  async function doRoll() {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const b = s.board_state || {};
    const turnSeat = b.turnSeat ?? s.current_turn;
    if (mySeat == null || mySeat !== turnSeat) return;
    if (b.dice != null) return;

    const dice = 1 + Math.floor(Math.random() * 6);
    const next = { ...b, dice, lastDice: dice };

    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        board_state: next,
        turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
      })
      .eq("id", s.id)
      .select()
      .single();

    if (!error && data) {
      setSes(data);
    }
  }

  async function endTurn(boardOverride) {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const b = boardOverride || s.board_state || {};
    if (b.winner != null) {
      await finishGame(b);
      return;
    }
    const updated = { ...b };
    updated.turnSeat = nextTurnSeat(updated);
    updated.dice = null;
    updated.lastDice = null;

    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        board_state: updated,
        current_turn: updated.turnSeat,
        turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
      })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSes(data);
    }
  }

  async function finishGame(boardOverride) {
    const s = await fetchSession();
    if (!s) return;
    const b = boardOverride || s.board_state || {};
    const winnerSeat = b.winner;
    if (winnerSeat == null) return;

    const current = s.current || {};
    const doubleState = current.__double__ || { value: 1 };
    const entry = current.__entry__ ?? (MIN_BUYIN_OPTIONS[tierCode] ?? 0);
    const activeSeats = b.activeSeats || [];
    const multiplier = doubleState.value || 1;
    const pot = entry * activeSeats.length * multiplier;

    if (mySeat === winnerSeat) {
      const cur = readVault();
      writeVault(cur + pot);
    }

    const result = {
      winner: winnerSeat,
      multiplier,
      payout: pot,
      timestamp: Date.now(),
    };

    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        stage: "finished",
        board_state: b,
        current_turn: null,
        turn_deadline: null,
        current: {
          ...current,
          __double__: {
            ...(doubleState || {}),
            value: multiplier,
            proposed_by: null,
            awaiting: null,
          },
          __result__: result,
        },
      })
      .eq("id", s.id)
      .select()
      .single();

    if (!error && data) {
      setSes(data);
    }
  }

  async function onPieceClick(pieceIndex) {
    if (ses?.stage !== "playing") return;
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const b = s.board_state || {};
    const turnSeat = b.turnSeat ?? s.current_turn;
    if (mySeat == null || mySeat !== turnSeat) return;
    if (!b.dice) return;
    const moves = listMovablePieces(b, mySeat, b.dice);
    if (!moves.includes(pieceIndex)) {
      setMsg("No legal move for that piece");
      return;
    }
    const { ok, board: next } = applyMove(b, mySeat, pieceIndex, b.dice);
    if (!ok) {
      setMsg("Move is not allowed");
      return;
    }

    if (next.winner != null) {
      const { data, error } = await supabase
        .from("ludo_sessions")
        .update({
          board_state: next,
          stage: "finished",
          current_turn: null,
          turn_deadline: null,
        })
        .eq("id", s.id)
        .select()
        .single();
      if (!error && data) {
        setSes(data);
      }
      await finishGame(next);
      return;
    }

    next.turnSeat = nextTurnSeat(next);
    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        board_state: next,
        current_turn: next.turnSeat,
        turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
      })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSes(data);
    }
  }

  // Double (2 players only for now)
  const canOfferDouble = useMemo(() => {
    if (!ses || ses.stage !== "playing") return false;
    const b = ses.board_state || {};
    const activeSeats = b.activeSeats || [];
    if (activeSeats.length !== 2) return false;
    if (mySeat == null || mySeat !== (b.turnSeat ?? ses.current_turn)) return false;
    const current = ses.current || {};
    const dbl = current.__double__ || { value: 1, proposed_by: null, awaiting: null };
    if (dbl.awaiting != null) return false;
    return true;
  }, [ses, mySeat]);

  async function offerDouble() {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const b = s.board_state || {};
    const activeSeats = b.activeSeats || [];
    if (activeSeats.length !== 2) {
      setMsg("Double is only enabled for 2-player games for now.");
      return;
    }
    if (mySeat == null || mySeat !== (b.turnSeat ?? s.current_turn)) return;
    const current = s.current || {};
    const dbl = current.__double__ || { value: 1, proposed_by: null, awaiting: null };
    if (dbl.awaiting != null) return;

    const opponentSeat = activeSeats.find((x) => x !== mySeat);
    const nextDouble = {
      value: dbl.value || 1,
      proposed_by: mySeat,
      awaiting: opponentSeat,
    };

    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        current: {
          ...current,
          __double__: nextDouble,
        },
      })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSes(data);
      setMsg("Double proposed");
    }
  }

  async function respondDouble(answer) {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const current = s.current || {};
    const dbl = current.__double__ || { value: 1, proposed_by: null, awaiting: null };
    if (dbl.awaiting == null || mySeat == null || mySeat !== dbl.awaiting) return;

    if (answer === "decline") {
      const b = s.board_state || {};
      const nextBoard = { ...b, winner: dbl.proposed_by };
      await finishGame(nextBoard);
      return;
    }

    if (answer === "accept") {
      const nextDouble = {
        value: (dbl.value || 1) * 2,
        proposed_by: null,
        awaiting: null,
      };
      const { data, error } = await supabase
        .from("ludo_sessions")
        .update({
          current: {
            ...current,
            __double__: nextDouble,
          },
        })
        .eq("id", s.id)
        .select()
        .single();
      if (!error && data) {
        setSes(data);
      }
    }
  }

  if (!roomId) {
    return (
      <div className="w-full h-full grid place-items-center text-white/70 text-sm">
        Select or create a room.
      </div>
    );
  }

  const board = ses?.board_state || null;
  const current = ses?.current || {};
  const doubleState = current.__double__ || { value: 1, proposed_by: null, awaiting: null };

  const statusText = (() => {
    if (!ses) return "Loading...";
    if (ses.stage === "lobby") return "Waiting in lobby";
    if (ses.stage === "playing") {
      if (board?.winner != null) return `Winner: seat ${board.winner}`;
      const turnSeat = board?.turnSeat ?? ses.current_turn;
      return `Turn: Seat ${turnSeat} | Dice: ${board?.dice ?? "-"}`;
    }
    if (ses.stage === "finished") {
      const res = current.__result__;
      if (res?.winner != null) {
        return `Game finished. Winner seat ${res.winner}, payout x${res.multiplier ?? 1}`;
      }
      return "Game finished.";
    }
    return "Unknown state";
  })();

  const seats = 4;

  return (
    <div className="w-full h-full flex flex-col gap-2 text-white">
      {/* Seats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {Array.from({ length: seats }).map((_, idx) => {
          const row = seatMap.get(idx) || null;
          const isMe = row?.client_id === clientId;
          return (
            <button
              key={idx}
              onClick={() => takeSeat(idx)}
              className={`border rounded-md px-2 py-1 flex flex-col items-center justify-center ${
                isMe ? "bg-emerald-600/40 border-emerald-400" : "bg-black/40 border-white/20"
              }`}
            >
              <span className="font-semibold">Seat {idx}</span>
              <span className="text-white/70">
                {row?.player_name || "Empty"}
                {isMe ? " (You)" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center text-xs">
        {mySeat != null && (
          <button
            onClick={leaveSeat}
            className="px-3 py-1 rounded bg-red-600/80 hover:bg-red-500"
          >
            Leave seat
          </button>
        )}
        <button
          onClick={startGame}
          className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500"
        >
          Start game
        </button>
        <button
          onClick={doRoll}
          disabled={
            !ses ||
            ses.stage !== "playing" ||
            mySeat == null ||
            board?.turnSeat !== mySeat ||
            board?.dice != null
          }
          className="px-3 py-1 rounded bg-blue-600/80 hover:bg-blue-500 disabled:bg-gray-600/60"
        >
          Roll ({board?.dice ?? "-"})
        </button>
        <button
          onClick={offerDouble}
          disabled={!canOfferDouble}
          className="px-3 py-1 rounded bg-yellow-500/80 hover:bg-yellow-400 disabled:bg-gray-600/60"
        >
          Double x{doubleState.value ?? 1}
        </button>
        {doubleState.awaiting === mySeat && (
          <>
            <button
              onClick={() => respondDouble("accept")}
              className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500"
            >
              Accept
            </button>
            <button
              onClick={() => respondDouble("decline")}
              className="px-3 py-1 rounded bg-red-600/80 hover:bg-red-500"
            >
              Decline
            </button>
          </>
        )}
      </div>

      {/* Status */}
      <div className="text-xs text-white/80 bg-black/40 rounded px-3 py-1">
        {statusText}
        {msg && <span className="ml-2 text-amber-300">{msg}</span>}
      </div>

      {/* Board */}
      <div className="flex-1 min-h-[260px] bg-black/40 rounded-lg p-3 flex flex-col gap-2">
        {board ? (
          <>
            <LudoBoard board={board} onPieceClick={onPieceClick} mySeat={mySeat} />
            <div className="text-[11px] text-white/60">
              * Images path for dog pieces:&nbsp;
              <code>/imege/ludo/dog_0.png ... dog_3.png</code>
            </div>
          </>
        ) : (
          <div className="w-full h-full grid place-items-center text-white/60 text-sm">
            Game not started yet.
          </div>
        )}
      </div>
    </div>
  );
}

// =================== VS BOT (LOCAL) ===================

function LudoVsBot({ vault }) {
  const [board, setBoard] = useState(() => createInitialBoard([0, 1]));
  const [stage, setStage] = useState("lobby"); // 'lobby' | 'playing' | 'finished'
  const [msg, setMsg] = useState("");
  const [deadline, setDeadline] = useState(null);

  const buyIn = 1000;
  const vaultBalance = vault;
  const mySeat = 0;
  const botSeat = 1;

  const canStart = useMemo(() => {
    return stage === "lobby" && vaultBalance >= buyIn;
  }, [stage, vaultBalance, buyIn]);

  function resetGame() {
    setBoard(createInitialBoard([0, 1]));
    setStage("lobby");
    setDeadline(null);
    setMsg("");
  }

  function startGame() {
    if (!canStart) {
      setMsg(`Need ${fmt(buyIn)} in vault`);
      return;
    }
    writeVault(vaultBalance - buyIn);
    const initial = createInitialBoard([0, 1]);
    setBoard(initial);
    setStage("playing");
    setDeadline(Date.now() + TURN_SECONDS * 1000);
    setMsg("");
  }

  function doRoll() {
    if (stage !== "playing") return;
    if (board.winner != null) return;
    const turnSeat = board.turnSeat;
    if (turnSeat !== mySeat) return;
    if (board.dice != null) return;
    const dice = 1 + Math.floor(Math.random() * 6);
    setBoard((prev) => ({ ...prev, dice, lastDice: dice }));
    setDeadline(Date.now() + TURN_SECONDS * 1000);
  }

  function onPieceClick(pieceIndex) {
    if (stage !== "playing") return;
    if (board.winner != null) return;
    const turnSeat = board.turnSeat;
    if (turnSeat !== mySeat) return;
    if (!board.dice) return;
    const moves = listMovablePieces(board, mySeat, board.dice);
    if (!moves.includes(pieceIndex)) {
      setMsg("No legal move for that piece");
      return;
    }
    const { ok, board: next } = applyMove(board, mySeat, pieceIndex, board.dice);
    if (!ok) {
      setMsg("Move not allowed");
      return;
    }
    if (next.winner != null) {
      finishLocalGame(next);
      return;
    }
    next.turnSeat = nextTurnSeat(next);
    setBoard(next);
    setDeadline(Date.now() + TURN_SECONDS * 1000);
    setMsg("");
  }

  function finishLocalGame(nextBoard) {
    const winnerSeat = nextBoard.winner;
    setBoard(nextBoard);
    setStage("finished");
    setDeadline(null);
    if (winnerSeat === mySeat) {
      const cur = readVault();
      writeVault(cur + buyIn * 2);
      setMsg("You won!");
    } else {
      setMsg("Bot won");
    }
  }

  // Simple bot logic
  useEffect(() => {
    if (stage !== "playing") return;
    if (board.winner != null) return;
    const turnSeat = board.turnSeat;
    if (turnSeat !== botSeat) return;

    // bot roll
    if (!board.dice) {
      const dice = 1 + Math.floor(Math.random() * 6);
      setTimeout(() => {
        setBoard((prev) => ({ ...prev, dice, lastDice: dice }));
        setDeadline(Date.now() + TURN_SECONDS * 1000);
      }, 600);
      return;
    }

    const dice = board.dice;
    const movable = listMovablePieces(board, botSeat, dice);
    if (!movable.length) {
      setTimeout(() => {
        const next = { ...board, dice: null, lastDice: dice };
        next.turnSeat = nextTurnSeat(next);
        setBoard(next);
        setDeadline(Date.now() + TURN_SECONDS * 1000);
      }, 600);
      return;
    }

    // choose best move (simple heuristic)
    let best = movable[0];
    let bestScore = -1;
    for (const pieceIndex of movable) {
      const { board: next } = applyMove(board, botSeat, pieceIndex, dice);
      const pieces = next.pieces[String(botSeat)] || [];
      const pos = pieces[pieceIndex];
      let score = 0;
      if (pos >= LUDO_TRACK_LEN + LUDO_PIECES_PER_PLAYER) score += 100;
      score += pos;
      if (score > bestScore) {
        bestScore = score;
        best = pieceIndex;
      }
    }

    setTimeout(() => {
      const { ok, board: next } = applyMove(board, botSeat, best, dice);
      if (!ok) {
        const next2 = { ...board, dice: null, lastDice: dice };
        next2.turnSeat = nextTurnSeat(next2);
        setBoard(next2);
        setDeadline(Date.now() + TURN_SECONDS * 1000);
        return;
      }
      if (next.winner != null) {
        finishLocalGame(next);
        return;
      }
      next.turnSeat = nextTurnSeat(next);
      setBoard(next);
      setDeadline(Date.now() + TURN_SECONDS * 1000);
    }, 800);
  }, [board, stage]);

  // local deadline
  useEffect(() => {
    if (!deadline || stage !== "playing") return;
    const t = setInterval(() => {
      if (Date.now() >= deadline) {
        const turnSeat = board.turnSeat;
        if (board.winner != null) {
          clearInterval(t);
          return;
        }
        if (!board.dice) {
          if (turnSeat === mySeat) {
            doRoll();
          }
        } else {
          const dice = board.dice;
          const moves = listMovablePieces(board, turnSeat, dice);
          if (!moves.length) {
            const next = { ...board, dice: null, lastDice: dice };
            next.turnSeat = nextTurnSeat(next);
            setBoard(next);
          }
        }
        setDeadline(Date.now() + TURN_SECONDS * 1000);
      }
    }, 500);
    return () => clearInterval(t);
  }, [deadline, board, stage]);

  const statusText = (() => {
    if (stage === "lobby") return "Ready to start vs Bot";
    if (stage === "playing") {
      if (board.winner === mySeat) return "You win!";
      if (board.winner === botSeat) return "Bot wins.";
      return `Turn: ${board.turnSeat === mySeat ? "You" : "Bot"} | Dice: ${
        board.dice ?? "-"
      }`;
    }
    if (stage === "finished") {
      return board.winner === mySeat ? "Game finished – You win!" : "Game finished – Bot wins";
    }
    return "";
  })();

  return (
    <div className="w-full h-full flex flex-col gap-2 text-white">
      <div className="flex gap-2 items-center text-xs">
        <button
          onClick={startGame}
          disabled={!canStart}
          className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:bg-gray-600/60"
        >
          Start vs Bot
        </button>
        <button
          onClick={resetGame}
          className="px-3 py-1 rounded bg-slate-600/80 hover:bg-slate-500"
        >
          Reset
        </button>
        <button
          onClick={doRoll}
          disabled={!(stage === "playing" && board.turnSeat === mySeat && board.dice == null)}
          className="px-3 py-1 rounded bg-blue-600/80 hover:bg-blue-500 disabled:bg-gray-600/60"
        >
          Roll ({board.dice ?? "-"})
        </button>
      </div>

      <div className="text-xs text-white/80 bg-black/40 rounded px-3 py-1">
        {statusText}
        {msg && <span className="ml-2 text-amber-300">{msg}</span>}
      </div>

      <div className="flex-1 min-h-[260px] bg-black/40 rounded-lg p-3">
        <LudoBoardLocal board={board} mySeat={mySeat} onPieceClick={onPieceClick} />
      </div>
    </div>
  );
}

// =================== BOARD COMPONENTS ===================

function LudoBoard({ board, onPieceClick, mySeat }) {
  const active = board.activeSeats || [];
  const pieces = board.pieces || {};
  const colorClasses = ["bg-red-500", "bg-sky-500", "bg-emerald-500", "bg-amber-400"];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full">
      {active.map((seat) => {
        const seatKeyStr = String(seat);
        const arr = pieces[seatKeyStr] || [];
        const cls = colorClasses[seat] || "bg-white/40";
        const isTurn = board.turnSeat === seat;

        return (
          <div
            key={seat}
            className="flex flex-col gap-1 border border-white/15 rounded-lg p-2 bg-black/40"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full ${cls}`} />
                <span className="font-semibold">Seat {seat}</span>
              </div>
              <div className="text-white/70">
                {isTurn ? "Your turn" : ""}
                {board.winner === seat && " (Winner)"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {arr.map((pos, idx) => {
                const inYard = pos < 0;
                const finished =
                  pos >= LUDO_TRACK_LEN + LUDO_PIECES_PER_PLAYER ||
                  board.finished?.[seatKeyStr] >= LUDO_PIECES_PER_PLAYER;
                const canClick = mySeat === seat && board.dice && !finished;
                const label = inYard ? "Yard" : finished ? "Home" : `Pos ${pos}`;
                const imgSrc = `/imege/ludo/dog_${seat}.png`;

                return (
                  <button
                    key={idx}
                    onClick={() => canClick && onPieceClick(idx)}
                    className={`flex items-center gap-2 px-2 py-1 rounded border text-[11px] ${
                      canClick
                        ? "border-white/60 bg-white/10 hover:bg-white/20"
                        : "border-white/20 bg-white/5"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-black/60 flex items-center justify-center">
                      <img
                        src={imgSrc}
                        alt="dog"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-semibold">Piece {idx + 1}</span>
                      <span className="text-white/60">{label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LudoBoardLocal({ board, mySeat, onPieceClick }) {
  const colors = ["red", "blue"];
  const colorClasses = ["bg-red-500", "bg-sky-500"];
  const pieces = board.pieces || {};

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full">
      {[0, 1].map((seat) => {
        const arr = pieces[String(seat)] || [];
        const cls = colorClasses[seat] || "bg-white/40";
        const isTurn = board.turnSeat === seat;
        const canClick = seat === mySeat && board.dice && board.turnSeat === mySeat;

        return (
          <div
            key={seat}
            className="flex flex-col gap-1 border border-white/15 rounded-lg p-2 bg-black/40"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full ${cls}`} />
                <span className="font-semibold">{seat === mySeat ? "You" : "Bot"}</span>
              </div>
              <div className="text-white/70">
                {isTurn ? "Turn" : ""}
                {board.winner === seat && " (Winner)"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {arr.map((pos, idx) => {
                const inYard = pos < 0;
                const finished =
                  pos >= LUDO_TRACK_LEN + LUDO_PIECES_PER_PLAYER ||
                  board.finished?.[String(seat)] >= LUDO_PIECES_PER_PLAYER;
                const label = inYard ? "Yard" : finished ? "Home" : `Pos ${pos}`;
                const imgSrc = `/imege/ludo/dog_${seat}.png`;
                const pieceCanClick = canClick && listMovablePieces(board, seat, board.dice).includes(idx);

                return (
                  <button
                    key={idx}
                    onClick={() => pieceCanClick && onPieceClick(idx)}
                    className={`flex items-center gap-2 px-2 py-1 rounded border text-[11px] ${
                      pieceCanClick
                        ? "border-white/60 bg-white/10 hover:bg-white/20"
                        : "border-white/20 bg-white/5"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-black/60 flex items-center justify-center">
                      <img
                        src={imgSrc}
                        alt="dog"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-semibold">Piece {idx + 1}</span>
                      <span className="text-white/60">{label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

