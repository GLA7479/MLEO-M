// games-online/CheckersMP.js
// Multiplayer Checkers (Draughts), JS, aligned with BackgammonMP patterns.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  initialBoardState,
  legalMovesFrom,
  applyStep,
  isFinished,
  winner,
  hasAnyMove,
  oppOf,
  rc,
} from "../lib/checkersEngine";

// ===== Config =====
const TURN_SECONDS = Number(process.env.NEXT_PUBLIC_CK_TURN_SECONDS || 35);
const MIN_PLAYERS_TO_START = 2;
const MATCH_BUYIN = Number(process.env.NEXT_PUBLIC_CK_BUYIN || 1000); // fallback

const MIN_BUYIN_OPTIONS = {
  "1K": 1_000,
  "10K": 10_000,
  "100K": 100_000,
  "1M": 1_000_000,
  "10M": 10_000_000,
  "100M": 100_000_000,
};

// ===== Vault helpers (same spirit as PokerMP/BackgammonMP) =====
function safeRead(k, d) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch { return d; } }
function safeWrite(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function readVault() { const rush = safeRead("mleo_rush_core_v4", {}); return Math.max(0, Number(rush.vault || 0)); }
function writeVault(v) { const rush = safeRead("mleo_rush_core_v4", {}); rush.vault = Math.max(0, Math.floor(v)); safeWrite("mleo_rush_core_v4", rush); if (window.updateVaultCallback) window.updateVaultCallback(rush.vault); }
function fmt(n) { n = Math.floor(Number(n || 0)); if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"; return String(n); }

function TurnCountdown({ deadline }) {
  const [left, setLeft] = useState(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setLeft(remaining);
    }, 100);
    return () => clearInterval(t);
  }, [deadline]);
  return (
    <div className={`px-3 py-1.5 rounded-lg font-bold text-sm transition-all ${
      left <= 10 ? "bg-red-600 animate-pulse" :
      left <= 20 ? "bg-amber-600" :
      "bg-emerald-600"
    } text-white shadow-lg`}>
      ⏱️ {left}s
    </div>
  );
}

function Piece({ ch, selected }) {
  if (!ch) return null;
  const isA = ch === "a" || ch === "A";
  const isKing = ch === "A" || ch === "B";
  return (
    <div
      className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full border-2 shadow-lg flex items-center justify-center font-black ${
        isA ? "bg-white text-black border-gray-400" : "bg-black text-white border-gray-600"
      } ${selected ? "ring-4 ring-yellow-400" : ""}`}
      style={{ boxShadow: "inset 0 2px 6px rgba(255,255,255,0.15), 0 6px 14px rgba(0,0,0,0.4)" }}
    >
      {isKing ? <span className="text-base md:text-lg">♛</span> : null}
    </div>
  );
}

export default function CheckersMP({ roomId, playerName, vault, setVaultBoth, tierCode = "10K" }) {
  useEffect(() => { window.updateVaultCallback = setVaultBoth; return () => { delete window.updateVaultCallback; }; }, [setVaultBoth]);

  const name = playerName || "Guest";
  const clientId = useMemo(() => getClientId(), []);
  const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;
  const BUYIN_PER_MATCH = minRequired > 0 ? minRequired : MATCH_BUYIN;

  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");

  const [selectedFrom, setSelectedFrom] = useState(null);
  const tickRef = useRef(null);

  const isLeader = useMemo(() => {
    if (!roomMembers.length || !name) return false;
    const sorted = [...roomMembers].sort((a, b) => a.player_name.localeCompare(b.player_name));
    return sorted[0]?.player_name === name;
  }, [roomMembers, name]);

  // ===== channel: sessions per room =====
  useEffect(() => {
    if (!roomId) return;

    const ch = supabase.channel("ck_sessions:" + roomId)
      .on("postgres_changes", { event: "*", schema: "public", table: "ck_sessions", filter: `room_id=eq.${roomId}` }, async () => {
        const { data } = await supabase.from("ck_sessions").select("*").eq("room_id", roomId).maybeSingle();
        setSes(data || null);
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          const { data } = await supabase.from("ck_sessions").select("*").eq("room_id", roomId).maybeSingle();
          setSes(data || null);
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });

    return () => ch.unsubscribe();
  }, [roomId, name]);

  // ===== channel: players per session =====
  useEffect(() => {
    if (!ses?.id) return;

    const ch = supabase.channel("ck_players:" + ses.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "ck_players", filter: `session_id=eq.${ses.id}` }, async () => {
        const { data } = await supabase.from("ck_players").select("*").eq("session_id", ses.id).order("seat_index");
        setPlayers(data || []);
      })
      .subscribe(async (st) => {
        if (st === "SUBSCRIBED") {
          const { data } = await supabase.from("ck_players").select("*").eq("session_id", ses.id).order("seat_index");
          setPlayers(data || []);
        }
      });

    return () => ch.unsubscribe();
  }, [ses?.id]);

  // ===== ensure session =====
  async function ensureCkSession(roomId) {
    const { data: existing } = await supabase
      .from("ck_sessions").select("*").eq("room_id", roomId).order("created_at", { ascending: false }).limit(1);

    if (existing && existing.length) return existing[0];

    const board = initialBoardState();
    const { data: created, error } = await supabase
      .from("ck_sessions")
      .insert({
        room_id: roomId,
        stage: "lobby",
        board_state: board,
        to_move: board.turn,
        current_turn: 0,
        turn_deadline: null,
      })
      .select().single();

    if (error) throw error;
    return created;
  }

  // ===== seats =====
  const seatMap = useMemo(() => new Map(players.map(p => [p.seat_index, p])), [players]);
  const myRow = players.find(p => p.client_id === clientId) || null;
  const mySeat = myRow?.seat_index ?? null;

  async function takeSeat(seatIndex) {
    if (!clientId) { setMsg("Client not recognized"); return; }
    if (readVault() < minRequired) { setMsg(`Minimum buy-in is ${fmt(minRequired)}`); return; }

    let session = ses;
    if (!session || !session.id) {
      session = await ensureCkSession(roomId);
      setSes(session);
    }

    // Don't allow seating if game already started
    if (session.stage !== "lobby") {
      setMsg("Game already in progress");
      return;
    }

    const { data: occ } = await supabase
      .from("ck_players").select("id,client_id").eq("session_id", session.id).eq("seat_index", seatIndex).maybeSingle();
    if (occ && occ.client_id && occ.client_id !== clientId) { setMsg("Seat taken"); return; }

    const { data: mine } = await supabase
      .from("ck_players").select("id,seat_index,client_id").eq("session_id", session.id).eq("client_id", clientId).maybeSingle();

    // If changing seats, refund previous buy-in first
    if (mine && mine.seat_index !== null && mine.seat_index !== seatIndex) {
      const v = readVault();
      writeVault(v + BUYIN_PER_MATCH); // refund previous buy-in
      await supabase.from("ck_players").update({ seat_index: seatIndex }).eq("id", mine.id);
      // Now charge for new seat
      const v2 = readVault();
      if (v2 < BUYIN_PER_MATCH) {
        setMsg(`Need ${fmt(BUYIN_PER_MATCH)} to take seat`);
        return;
      }
      writeVault(v2 - BUYIN_PER_MATCH);
      setMsg("");
      return;
    }

    if (!mine) {
      // Charge buy-in when taking a seat
      const v = readVault();
      if (v < BUYIN_PER_MATCH) {
        setMsg(`Need ${fmt(BUYIN_PER_MATCH)} to take seat`);
        return;
      }
      writeVault(v - BUYIN_PER_MATCH);

      const { error: upErr } = await supabase.from("ck_players").upsert({
        session_id: session.id,
        seat_index: seatIndex,
        player_name: playerName || "Guest",
        client_id: clientId,
        wins: 0,
      }, { onConflict: "session_id,seat_index", ignoreDuplicates: false });

      if (upErr) {
        // If insert failed, refund the buy-in
        const v2 = readVault();
        writeVault(v2 + BUYIN_PER_MATCH);
        setMsg(upErr.message?.includes("duplicate") ? "Seat taken" : upErr.message);
        return;
      }
    }

    setMsg("");
  }

  async function leaveSeat() {
    if (!myRow) return;
    
    // Refund buy-in if game hasn't started yet
    const session = await fetchSession();
    if (session && session.stage === "lobby") {
      const v = readVault();
      writeVault(v + BUYIN_PER_MATCH); // refund buy-in
    }
    
    await supabase.from("ck_players").delete().eq("id", myRow.id);
  }

  // ===== match start =====
  async function startMatch() {
    if (!isLeader) { setMsg("Only the leader can start the game"); return; }
    const seatedPlayers = players.filter(p => p.seat_index !== null);
    if (seatedPlayers.length < MIN_PLAYERS_TO_START) { setMsg(`Need ${MIN_PLAYERS_TO_START} players to start`); return; }

    let session = ses;
    if (!session || !session.id) {
      try {
        session = await ensureCkSession(roomId);
        setSes(session);
      } catch (err) {
        setMsg(err.message || "Failed to create session");
        return;
      }
    }

    const board = initialBoardState();

    // Buy-in already charged when taking seat, no need to charge again

    const { data, error } = await supabase.from("ck_sessions").update({
      stage: "playing",
      board_state: board,
      to_move: board.turn,
      current_turn: 0,
      turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
    }).eq("id", session.id).select().single();

    if (error) setMsg(error.message || "Failed to start game");
    else { if (data) setSes(data); setMsg(""); setSelectedFrom(null); }
  }

  async function fetchSession() {
    const { data } = await supabase.from("ck_sessions").select("*").eq("id", ses.id).single();
    return data;
  }

  async function bumpDeadline() {
    await supabase.from("ck_sessions").update({
      turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
    }).eq("id", ses.id);
  }

  async function finishGame(bState) {
    const w = winner(bState);
    const { data, error } = await supabase.from("ck_sessions").update({
      stage: "finished",
      board_state: bState,
      to_move: null,
      current_turn: null,
      turn_deadline: null,
    }).eq("id", ses.id).select().single();

    if (!error && data) setSes(data);

    // Winner gets all coins (2x buy-in since both players paid)
    if (w && BUYIN_PER_MATCH > 0) {
      const winnerSeat = w === "A" ? 0 : 1;
      if (mySeat === winnerSeat) {
        const cur = readVault();
        writeVault(cur + (BUYIN_PER_MATCH * 2)); // winner gets both players' buy-ins
      }
    }
  }

  // ===== timer (auto) =====
  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(async () => {
      if (!ses?.turn_deadline) return;
      const d = new Date(ses.turn_deadline).getTime();
      if (Date.now() >= d) await autoAct();
    }, 250);
    return () => clearInterval(tickRef.current);
  }, [ses?.turn_deadline, ses?.current_turn, ses?.stage, mySeat]);

  async function autoAct() {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;

    const b = JSON.parse(JSON.stringify(s.board_state));
    const turnSeat = b.turn === "A" ? 0 : 1;
    if (mySeat !== turnSeat) return; // only active client acts

    // If no move -> finish (opponent wins)
    if (!hasAnyMove(b, b.turn)) {
      await finishGame(b);
      return;
    }

    // Minimal auto: just extend time (no random moves)
    await bumpDeadline();
  }

  // ===== gameplay =====
  async function trySelect(fromIdx) {
    if (ses?.stage !== "playing") return;
    const b = ses?.board_state;
    if (!b) return;

    const turnSeat = b.turn === "A" ? 0 : 1;
    const isMyTurn = mySeat === turnSeat;
    if (!isMyTurn) return;

    // If forced capture continuation, only that piece can be selected
    if (b.forced_from != null && b.forced_from !== fromIdx) return;

    const ch = b.board?.[fromIdx] || null;
    if (!ch) return;

    const isMine = (b.turn === "A" && (ch === "a" || ch === "A")) || (b.turn === "B" && (ch === "b" || ch === "B"));
    if (!isMine) return;

    setSelectedFrom(prev => (prev === fromIdx ? null : fromIdx));
  }

  async function tryMove(toIdx) {
    if (ses?.stage !== "playing") return;
    if (selectedFrom == null) return;

    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;

    const b = JSON.parse(JSON.stringify(s.board_state));
    const turnSeat = b.turn === "A" ? 0 : 1;
    if (mySeat !== turnSeat) return;

    const res = applyStep(b, b.turn, selectedFrom, toIdx);
    if (!res.ok) { setMsg(res.error || "Illegal"); return; }

    const newB = res.state;

    // if finished after this step => finish
    if (isFinished(newB)) {
      await supabase.from("ck_sessions").update({
        board_state: newB,
        to_move: newB.turn,
        current_turn: newB.turn === "A" ? 0 : 1,
        turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
      }).eq("id", s.id);
      await finishGame(newB);
      setSelectedFrom(null);
      setMsg("");
      return;
    }

    // if continued capture, keep selection on same piece
    const nextSelected = res.continued ? toIdx : null;

    const { data, error } = await supabase.from("ck_sessions").update({
      board_state: newB,
      to_move: newB.turn,
      current_turn: newB.turn === "A" ? 0 : 1,
      turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
    }).eq("id", s.id).select().single();

    if (!error && data) setSes(data);

    setSelectedFrom(nextSelected);
    setMsg("");
  }

  // ===== UI computed =====
  if (!roomId) return <div className="w-full h-full grid place-items-center text-white/70">Select or create a room.</div>;

  const b = ses?.board_state || initialBoardState();
  const isPlaying = ses?.stage === "playing";
  const turnSeat = b.turn === "A" ? 0 : 1;
  const isMyTurn = isPlaying && mySeat === turnSeat;
  const seatedCount = players.filter(p => p.seat_index !== null).length;

  const legalToSet = useMemo(() => {
    if (!isPlaying || !isMyTurn || selectedFrom == null) return new Set();
    const m = legalMovesFrom(b, b.turn, selectedFrom);
    const s = new Set();
    for (const q of m.quiet) s.add(q.to);
    for (const c of m.caps) s.add(c.to);
    return s;
  }, [isPlaying, isMyTurn, b, selectedFrom]);

  const mustCapNow = useMemo(() => {
    if (!isPlaying || !isMyTurn || selectedFrom == null) return false;
    const m = legalMovesFrom(b, b.turn, selectedFrom);
    return !!m.mustCap;
  }, [isPlaying, isMyTurn, b, selectedFrom]);

  function squareColor(r, c) {
    const dark = (r + c) % 2 === 1;
    return dark ? "#3b2a1a" : "#d8c3a5";
  }

  return (
    <div className="w-full h-full flex flex-col p-1 md:p-2 gap-2">
      {/* Header */}
      <div className="flex items-center justify-between bg-white/5 rounded-xl p-2 border border-white/10">
        <div className="text-white font-bold text-sm md:text-lg">Checkers</div>
        <div className="flex items-center gap-2 text-white/80 text-xs">
          <span>Stage: {ses?.stage || "lobby"}</span>
          <span>Min: {fmt(minRequired)}</span>
          {isMyTurn && ses?.turn_deadline && <TurnCountdown deadline={ses.turn_deadline} />}
          <span>💰 {fmt(readVault())}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-2 overflow-auto">
        {(!myRow || myRow.seat_index === null) ? (
          <div className="flex-1 grid place-items-center">
            <div className="text-center max-w-md">
              <div className="text-white/90 mb-3 text-sm md:text-xl font-semibold">Choose your seat</div>
              <div className="flex items-center justify-center gap-6 mb-4">
                <button
                  onClick={() => takeSeat(0)}
                  disabled={players.some(p => p.seat_index === 0 && p.client_id !== clientId)}
                  className="px-6 py-4 rounded-xl bg-gradient-to-r from-amber-600/80 to-amber-700/80 border-2 border-amber-500/50 text-white hover:from-amber-700 hover:to-amber-800 font-bold text-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Seat A (White)
                </button>
                <button
                  onClick={() => takeSeat(1)}
                  disabled={players.some(p => p.seat_index === 1 && p.client_id !== clientId)}
                  className="px-6 py-4 rounded-xl bg-gradient-to-r from-gray-800/80 to-black/80 border-2 border-gray-600/50 text-white hover:from-gray-700 hover:to-black font-bold text-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Seat B (Black)
                </button>
              </div>

              <div className="text-white/70 text-sm mb-2">Seated: {seatedCount}/2</div>
              {msg && <div className="text-amber-300 mt-3 text-sm bg-amber-900/40 px-4 py-2 rounded-lg">{msg}</div>}

              {isLeader && seatedCount >= MIN_PLAYERS_TO_START && (
                <button
                  onClick={startMatch}
                  className="mt-4 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold text-lg shadow-lg hover:from-green-700 hover:to-emerald-700 transition-all"
                >
                  ▶ Start Game
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-2">
            {/* Board */}
            <div
              className="rounded-xl p-2 border-4 relative overflow-hidden shadow-2xl"
              style={{
                aspectRatio: "1 / 1",
                minHeight: "340px",
                maxHeight: "620px",
                width: "100%",
                backgroundColor: "#7a5a3a",
                borderColor: "#4a3420",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.2)",
              }}
            >
              <div className="grid grid-cols-8 grid-rows-8 gap-0 w-full h-full rounded-lg overflow-hidden">
                {Array.from({ length: 64 }).map((_, i) => {
                  const [r, c] = rc(i);
                  const dark = (r + c) % 2 === 1;
                  const ch = b.board?.[i] || null;
                  const isSelected = selectedFrom === i;
                  const isLegalTo = legalToSet.has(i);

                  const clickable = isPlaying && isMyTurn && dark && (
                    (ch && !isLegalTo) || isLegalTo
                  );

                  return (
                    <div
                      key={i}
                      className={`relative flex items-center justify-center select-none ${
                        clickable ? "cursor-pointer" : ""
                      }`}
                      style={{
                        backgroundColor: squareColor(r, c),
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                      }}
                      onClick={() => {
                        if (!isPlaying || !isMyTurn) return;
                        if (!dark) return;

                        if (ch) {
                          // select piece
                          trySelect(i);
                          return;
                        }
                        // empty dark square: if legal destination, move
                        if (isLegalTo) {
                          tryMove(i);
                          return;
                        }
                      }}
                    >
                      {/* Highlight rings */}
                      {isSelected && (
                        <div className="absolute inset-1 rounded-md ring-4 ring-yellow-400 pointer-events-none" />
                      )}
                      {isLegalTo && !ch && (
                        <div className="absolute inset-2 rounded-md ring-2 ring-green-400 pointer-events-none" />
                      )}

                      {/* Piece */}
                      <Piece ch={ch} selected={isSelected} />

                      {/* Forced capture hint */}
                      {mustCapNow && isSelected && (
                        <div className="absolute bottom-1 text-[10px] px-1.5 py-0.5 rounded bg-red-700/80 text-white font-bold">
                          CAPTURE!
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between bg-white/5 rounded-lg p-2 border border-white/10">
              <div className="text-white/80 text-xs">
                Turn: <span className="font-bold text-white">{b.turn === "A" ? "⚪ A" : "⚫ B"}</span>
                {isMyTurn && <span className="ml-2 text-emerald-400 font-bold">Your turn!</span>}
                {b.forced_from != null && isMyTurn && (
                  <span className="ml-2 text-amber-300 font-bold">Multi-capture: continue</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {ses?.stage === "lobby" ? (
                  <button
                    onClick={startMatch}
                    disabled={!isLeader || seatedCount < MIN_PLAYERS_TO_START}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-sm shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    START
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedFrom(null)}
                    className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Status */}
            {msg && (
              <div className="text-center">
                <div className="inline-block bg-amber-900/60 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-lg text-sm">
                  {msg}
                </div>
              </div>
            )}

            {/* Game Over */}
            {ses?.stage === "finished" && (
              <div className="bg-gradient-to-r from-emerald-900/80 to-green-900/80 border-2 border-emerald-500 rounded-xl p-4 text-center">
                <div className="text-white font-bold text-xl mb-2">Game Finished!</div>
                <div className="text-white">
                  Winner: {winner(b) === "A" ? "White (A)" : winner(b) === "B" ? "Black (B)" : "—"}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between bg-white/5 rounded-lg p-2 border border-white/10">
        <div className="text-white/80 text-xs">
          Player: <span className="font-bold text-white">{playerName || "Guest"}</span>
        </div>
        <div className="flex items-center gap-2">
          {(!myRow || myRow.seat_index === null) ? null : (
            <button
              onClick={leaveSeat}
              className="px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-700 text-white text-xs font-semibold transition-all"
            >
              LEAVE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
