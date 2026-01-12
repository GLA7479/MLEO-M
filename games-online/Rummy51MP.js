// games-online/Rummy51MP.js
// Multiplayer Rummy 51 (classic): initial meld >= 51 points, jokers wild, Ace can be high (also allows A-2-3).
// Built in the same style as BlackjackMP.js (Supabase + room_id + seat lobby + realtime sync + VAULT).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import RoomBrowser from "../components/online/RoomBrowser";

// ---------- Constants ----------
const MIN_BUYIN_OPTIONS = {
  '1K': 1_000,
  '10K': 10_000,
  '100K': 100_000,
  '1M': 1_000_000,
  '10M': 10_000_000,
  '100M': 100_000_000,
};

// ---------- helpers ----------
const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };

function cardFace(card) {
  return (card || "").split(":")[0];
}
function cardCopy(card) {
  return (card || "").split(":")[1] || "";
}
function isJoker(card) {
  return cardFace(card) === "JK";
}
function cardSuit(card) {
  if (isJoker(card)) return null;
  const f = cardFace(card);
  return f.slice(-1);
}
function cardRankToken(card) {
  if (isJoker(card)) return null;
  const f = cardFace(card);
  return f.slice(0, -1);
}
function rankToInt(tok) {
  if (!tok) return null;
  if (tok === "A") return 14;
  if (tok === "K") return 13;
  if (tok === "Q") return 12;
  if (tok === "J") return 11;
  if (tok === "T") return 10;
  return Number(tok);
}
function pointsFromRankInt(r) {
  if (r == null) return 0;
  if (r === 14) return 11;
  if (r >= 11) return 10;
  return r;
}
function cardLabel(card) {
  if (!card) return "";
  if (isJoker(card)) return `JOKER:${cardCopy(card)}`;
  const tok = cardRankToken(card);
  const s = cardSuit(card);
  const rank = tok === "T" ? "10" : tok;
  return `${SUIT_SYMBOL[s] || s}${rank}`;
}

function sortHand(a, b) {
  // Jokers last
  const aj = isJoker(a);
  const bj = isJoker(b);
  if (aj && !bj) return 1;
  if (!aj && bj) return -1;

  const sa = cardSuit(a) || "";
  const sb = cardSuit(b) || "";
  if (sa !== sb) return sa.localeCompare(sb);

  const ra = rankToInt(cardRankToken(a));
  const rb = rankToInt(cardRankToken(b));
  return (ra || 0) - (rb || 0);
}

// Client-side validator (used only for UX; server still validates open/meld/layoff).
function analyzeMeld(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return { ok: false };

  const jokers = cards.filter(isJoker);
  const nonj = cards.filter((c) => !isJoker(c));
  if (nonj.length === 0) return { ok: false };

  // Try set (3-4): same rank, different suits
  if (cards.length <= 4) {
    const r0 = rankToInt(cardRankToken(nonj[0]));
    if (nonj.every((c) => rankToInt(cardRankToken(c)) === r0)) {
      const suits = nonj.map(cardSuit);
      const unique = new Set(suits);
      if (unique.size === suits.length) {
        return { ok: true, type: "set", points: (cards.length) * pointsFromRankInt(r0) };
      }
    }
  }

  // Try run: same suit for non-jokers, consecutive with gaps filled by jokers
  const suit0 = cardSuit(nonj[0]);
  if (!nonj.every((c) => cardSuit(c) === suit0)) return { ok: false };

  const n = cards.length;
  const nr = nonj.map((c) => rankToInt(cardRankToken(c)));
  if (new Set(nr).size !== nr.length) return { ok: false };

  // brute force start (1..14-n+1)
  for (let start = 1; start <= 14 - n + 1; start++) {
    const target = [];
    for (let k = 0; k < n; k++) target.push(start + k);
    if (nr.every((x) => target.includes(x))) {
      const pts = target.reduce((sum, r) => sum + pointsFromRankInt(r === 1 ? 14 : r), 0);
      // Note: server uses Ace=11 always. Here, treat rank 1 as Ace as well.
      return { ok: true, type: "run", points: pts, suit: suit0 };
    }
  }

  return { ok: false };
}

// Vault helpers
function safeRead(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, val) {
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function readVault() {
  const rushData = safeRead("mleo_rush_core_v4", {});
  return Math.max(0, Number(rushData.vault || 0));
}

function writeVault(v) {
  const rushData = safeRead("mleo_rush_core_v4", {});
  rushData.vault = Math.max(0, Math.floor(v));
  safeWrite("mleo_rush_core_v4", rushData);
  
  if (window.updateVaultCallback) {
    window.updateVaultCallback(rushData.vault);
  }
}

function fmt(n) {
  n = Math.floor(Number(n || 0));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
}

// ---------- Component ----------
export default function Rummy51MP({ roomId: propRoomId, playerName, vault, setVaultBoth, tierCode = "10K" }) {
  const [currentRoomId, setCurrentRoomId] = useState(propRoomId || null);
  const name = playerName || "Guest";
  const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;
  const entryFee = minRequired;

  const clientId = useMemo(() => getClientId("rummy51"), []);
  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [members, setMembers] = useState([]);
  const [msg, setMsg] = useState("");

  const [selected, setSelected] = useState([]); // selected cards in my hand
  const [pendingMelds, setPendingMelds] = useState([]); // array of {cards:[...], type, points}
  const [selectedMeldId, setSelectedMeldId] = useState(null);
  const [layoffSide, setLayoffSide] = useState("right");

  // Vault sync
  useEffect(() => {
    const handler = (nextValue) => {
      if (typeof setVaultBoth === "function") {
        setVaultBoth(nextValue);
      }
    };
    window.updateVaultCallback = handler;
    handler(readVault());
    return () => {
      if (window.updateVaultCallback === handler) {
        delete window.updateVaultCallback;
      }
    };
  }, [setVaultBoth]);

  const myPlayer = useMemo(() => {
    if (!ses?.id) return null;
    return players.find((p) => p.client_id === clientId) || null;
  }, [players, ses?.id, clientId]);

  const mySeat = myPlayer?.seat_index ?? null;

  const isMyTurn = useMemo(() => {
    if (!ses || ses.stage !== "playing") return false;
    if (mySeat == null) return false;
    return ses.turn_seat === mySeat;
  }, [ses, mySeat]);

  const myHand = useMemo(() => {
    const h = Array.isArray(myPlayer?.hand) ? [...myPlayer.hand] : [];
    h.sort(sortHand);
    return h;
  }, [myPlayer?.hand]);

  const discardTop = useMemo(() => {
    const d = Array.isArray(ses?.discard) ? ses.discard : [];
    return d.length ? d[d.length - 1] : null;
  }, [ses?.discard]);

  const melds = useMemo(() => {
    const m = ses?.melds;
    return Array.isArray(m) ? m : [];
  }, [ses?.melds]);

  const refreshSession = useCallback(async (rid) => {
    const { data } = await supabase
      .from("rummy51_sessions")
      .select("*")
      .eq("room_id", rid)
      .single();
    if (data) setSes(data);
  }, []);

  const refreshPlayers = useCallback(async (sessionId) => {
    const { data } = await supabase
      .from("rummy51_players")
      .select("*")
      .eq("session_id", sessionId)
      .order("seat_index");
    setPlayers(data || []);
  }, []);

  // Ensure / create session
  const ensureSession = useCallback(async () => {
    if (!currentRoomId) return null;
    const { data, error } = await supabase.rpc("rummy51_ensure_session", {
      p_room_id: currentRoomId,
      p_seat_count: 6,
      p_entry_fee: entryFee,
    });
    if (error) {
      setMsg(error.message || "Failed to load room");
      return null;
    }
    setSes(data);
    await refreshPlayers(data.id);
    return data;
  }, [currentRoomId, entryFee, refreshPlayers]);

  // Presence + realtime
  useEffect(() => {
    if (!currentRoomId) return;
    let cancelled = false;

    const ch = supabase
      .channel("rummy51_room:" + currentRoomId, { config: { presence: { key: clientId } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "rummy51_sessions", filter: `room_id=eq.${currentRoomId}` }, async () => {
        if (cancelled) return;
        await refreshSession(currentRoomId);
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const list = Object.values(state).flat();
        setMembers(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const s = await ensureSession();
          if (!cancelled && s?.id) {
            await refreshPlayers(s.id);
          }
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [currentRoomId, clientId, name, ensureSession, refreshPlayers, refreshSession]);

  useEffect(() => {
    if (!ses?.id) return;
    let cancelled = false;

    const chP = supabase
      .channel("rummy51_players:" + ses.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "rummy51_players", filter: `session_id=eq.${ses.id}` }, async () => {
        if (cancelled) return;
        await refreshPlayers(ses.id);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(chP);
    };
  }, [ses?.id, refreshPlayers]);

  // Charge entry fee when taking seat
  const takeSeat = useCallback(
    async (seatIndex) => {
      setMsg("");
      
      // Check vault
      const vaultNow = readVault();
      if (vaultNow < entryFee) {
        setMsg(`Need at least ${fmt(entryFee)} in vault to join`);
        return;
      }

      const s = ses?.id ? ses : await ensureSession();
      if (!s?.id) return;

      // Charge vault
      writeVault(vaultNow - entryFee);
      if (setVaultBoth) setVaultBoth(readVault());

      const { error } = await supabase.rpc("rummy51_take_seat", {
        p_room_id: currentRoomId,
        p_seat_index: seatIndex,
        p_client_id: clientId,
        p_player_name: name,
      });
      if (error) {
        // Refund on error
        writeVault(vaultNow);
        if (setVaultBoth) setVaultBoth(readVault());
        setMsg(error.message || "Seat failed");
        return;
      }
      await refreshPlayers(s.id);
    },
    [ses, ensureSession, currentRoomId, clientId, name, refreshPlayers, entryFee, setVaultBoth]
  );

  const leaveSeat = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { error } = await supabase.rpc("rummy51_leave_seat", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) setMsg(error.message || "Leave failed");
    await refreshPlayers(ses.id);
  }, [ses?.id, clientId, refreshPlayers]);

  const startGame = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { data, error } = await supabase.rpc("rummy51_start_round", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) {
      setMsg(error.message || "Start failed");
      return;
    }
    setPendingMelds([]);
    setSelected([]);
    setSelectedMeldId(null);
    setSes(data);
    await refreshPlayers(ses.id);
  }, [ses?.id, clientId, refreshPlayers]);

  // ---------- gameplay actions ----------
  const drawStock = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { data, error } = await supabase.rpc("rummy51_draw_stock", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) setMsg(error.message || "Draw failed");
    if (data) setSes(data);
  }, [ses?.id, clientId]);

  const drawDiscard = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { data, error } = await supabase.rpc("rummy51_draw_discard", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) setMsg(error.message || "Draw failed");
    if (data) setSes(data);
  }, [ses?.id, clientId]);

  const addPendingMeld = useCallback(() => {
    setMsg("");
    const cards = [...selected];
    const a = analyzeMeld(cards);
    if (!a.ok) {
      setMsg("Invalid meld selection (need valid set/run, 3+ cards, suits/ranks rules).");
      return;
    }
    setPendingMelds((prev) => [...prev, { cards, type: a.type, points: a.points }]);
    setSelected([]);
  }, [selected]);

  const removePendingMeld = useCallback((idx) => {
    setPendingMelds((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const open51 = useCallback(async () => {
    if (!ses?.id) return;
    if (!myPlayer) return;
    setMsg("");
    if (myPlayer.has_opened) {
      setMsg("Already opened.");
      return;
    }
    if (pendingMelds.length === 0) {
      setMsg("Add at least one meld to open.");
      return;
    }
    const total = pendingMelds.reduce((s, m) => s + (m.points || 0), 0);
    if (total < 51) {
      setMsg(`Need 51+ points to open (you have ${total}).`);
      return;
    }

    const { data, error } = await supabase.rpc("rummy51_open", {
      p_session_id: ses.id,
      p_client_id: clientId,
      p_melds: pendingMelds.map((m) => m.cards),
    });
    if (error) {
      setMsg(error.message || "Open failed");
      return;
    }
    setPendingMelds([]);
    setSelected([]);
    if (data) setSes(data);
  }, [ses?.id, myPlayer, pendingMelds, clientId]);

  const playMeld = useCallback(async () => {
    if (!ses?.id) return;
    if (!myPlayer?.has_opened) {
      setMsg("You must OPEN (51+) first.");
      return;
    }
    setMsg("");
    const cards = [...selected];
    const a = analyzeMeld(cards);
    if (!a.ok) {
      setMsg("Invalid meld.");
      return;
    }
    const { data, error } = await supabase.rpc("rummy51_new_meld", {
      p_session_id: ses.id,
      p_client_id: clientId,
      p_cards: cards,
    });
    if (error) setMsg(error.message || "Meld failed");
    if (data) setSes(data);
    setSelected([]);
  }, [ses?.id, myPlayer?.has_opened, selected, clientId]);

  const layoff = useCallback(async () => {
    if (!ses?.id) return;
    if (!myPlayer?.has_opened) {
      setMsg("You must OPEN (51+) first.");
      return;
    }
    if (!selectedMeldId) {
      setMsg("Pick a meld on table first.");
      return;
    }
    if (selected.length !== 1) {
      setMsg("Select exactly 1 card to lay off.");
      return;
    }
    const card = selected[0];
    setMsg("");

    const { data, error } = await supabase.rpc("rummy51_layoff", {
      p_session_id: ses.id,
      p_client_id: clientId,
      p_card: card,
      p_meld_id: selectedMeldId,
      p_side: layoffSide,
    });
    if (error) setMsg(error.message || "Layoff failed");
    if (data) setSes(data);
    setSelected([]);
  }, [ses?.id, myPlayer?.has_opened, selectedMeldId, selected, clientId, layoffSide]);

  const discard = useCallback(async () => {
    if (!ses?.id) return;
    if (selected.length !== 1) {
      setMsg("Select exactly 1 card to discard.");
      return;
    }
    const card = selected[0];
    setMsg("");
    const { data, error } = await supabase.rpc("rummy51_discard", {
      p_session_id: ses.id,
      p_client_id: clientId,
      p_card: card,
    });
    if (error) setMsg(error.message || "Discard failed");
    if (data) setSes(data);
    setSelected([]);
  }, [ses?.id, selected, clientId]);

  // ---------- UI ----------
  const seatedPlayers = useMemo(() => players.filter((p) => p.seat_index != null).sort((a, b) => a.seat_index - b.seat_index), [players]);

  const openPoints = useMemo(() => pendingMelds.reduce((s, m) => s + (m.points || 0), 0), [pendingMelds]);

  function toggleSelect(card) {
    setSelected((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card);
      return [...prev, card];
    });
  }

  // Show Room Browser if no roomId
  if (!currentRoomId) {
    return (
      <div className="w-full min-h-[calc(100vh-80px)] text-white">
        <div className="max-w-4xl mx-auto p-4">
          <div className="text-2xl font-bold mb-4">Rummy 51 • Multiplayer</div>
          <div className="text-xs text-white/60 mb-4">Initial meld must be 51+ points. Jokers are wild. Sets up to 4 suits. Runs 3+.</div>
          <div className="text-sm text-white/70 mb-4">Entry fee: {fmt(entryFee)} • Vault: {fmt(readVault())}</div>
          <RoomBrowser
            gameId="rummy51"
            playerName={name}
            onJoinRoom={(roomId, tier) => {
              setCurrentRoomId(roomId);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-80px)] text-white">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold">Rummy 51 • Multiplayer</div>
            <div className="text-xs text-white/60">Initial meld must be 51+ points. Jokers are wild. Sets up to 4 suits. Runs 3+.</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-white/60">Entry: {fmt(entryFee)} • Vault: {fmt(readVault())}</div>
            <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm" onClick={() => setCurrentRoomId(null)}>
              Leave Room
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10">Room: <span className="font-semibold">{currentRoomId}</span></div>
            <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10">Online: {members.length}</div>
            {ses?.stage && <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10">Stage: <span className="font-semibold">{ses.stage}</span></div>}
            {msg && <div className="px-3 py-2 rounded-xl bg-red-500/20 border border-red-400/30 text-red-100 rounded-xl">{msg}</div>}
          </div>

          {/* Lobby */}
          {ses?.stage !== "playing" && (
            <div className="mt-4 grid lg:grid-cols-2 gap-4">
              <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="font-semibold mb-2">Seats</div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const p = players.find((x) => x.seat_index === i);
                    const mine = p?.client_id === clientId;
                    return (
                      <button
                        key={i}
                        onClick={() => takeSeat(i)}
                        className={`p-3 rounded-xl border text-left ${
                          p
                            ? mine
                              ? "bg-emerald-600/30 border-emerald-400/40"
                              : "bg-white/5 border-white/10"
                            : "bg-black/30 border-white/10 hover:bg-black/40"
                        }`}
                      >
                        <div className="text-xs text-white/60">Seat {i + 1}</div>
                        <div className="font-semibold">{p ? p.player_name : "Empty"}</div>
                        {mine && <div className="text-[11px] text-white/70">You</div>}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={leaveSeat} disabled={!myPlayer}>
                    Leave seat
                  </button>
                  <button
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold"
                    onClick={startGame}
                    disabled={seatedPlayers.length < 2}
                    title={seatedPlayers.length < 2 ? "Need 2+ seated" : "Start"}
                  >
                    Start round
                  </button>
                </div>
              </div>

              <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="font-semibold mb-2">Players</div>
                <div className="space-y-2">
                  {seatedPlayers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 border border-white/10">
                      <div className="font-semibold">{p.player_name}</div>
                      <div className="text-xs text-white/60">Seat {p.seat_index + 1}</div>
                    </div>
                  ))}
                </div>
                {ses?.winner_name && (
                  <div className="mt-4 p-3 rounded-xl bg-emerald-600/20 border border-emerald-400/30">
                    <div className="text-xs text-white/70">Last winner</div>
                    <div className="font-semibold">{ses.winner_name}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Playing */}
          {ses?.stage === "playing" && (
            <div className="mt-4 grid lg:grid-cols-3 gap-4">
              {/* Table */}
              <div className="lg:col-span-2 rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10">
                    Turn: <span className="font-semibold">Seat {(ses.turn_seat ?? 0) + 1}</span>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10">
                    Phase: <span className="font-semibold">{ses.turn_phase}</span>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10">
                    Stock: <span className="font-semibold">{Array.isArray(ses.stock) ? ses.stock.length : 0}</span>
                  </div>
                  <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10">
                    Discard: <span className="font-semibold">{discardTop ? cardLabel(discardTop) : "—"}</span>
                  </div>
                  {isMyTurn && <div className="text-emerald-300 font-semibold">Your turn</div>}
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-xl p-3 bg-black/30 border border-white/10">
                    <div className="text-xs text-white/60 mb-2">Melds on table (click to target for layoff)</div>
                    <div className="space-y-2">
                      {melds.length === 0 && <div className="text-sm text-white/60">No melds yet.</div>}
                      {melds.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMeldId(m.id)}
                          className={`w-full text-left px-3 py-2 rounded-xl border ${
                            selectedMeldId === m.id ? "bg-emerald-600/20 border-emerald-400/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">
                              {m.type?.toUpperCase()} {m.suit ? SUIT_SYMBOL[m.suit] : ""} • Seat {(m.owner_seat ?? 0) + 1}
                            </div>
                            <div className="text-xs text-white/60">{m.cards?.length || 0} cards</div>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {(m.cards || []).map((c, idx) => (
                              <span key={idx} className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-sm">
                                {cardLabel(c)}
                              </span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* My panel */}
              <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="font-semibold mb-2">You</div>
                <div className="text-sm text-white/70">
                  {myPlayer ? (
                    <>
                      <div>Name: <span className="font-semibold">{myPlayer.player_name}</span></div>
                      <div>Seat: <span className="font-semibold">{(mySeat ?? 0) + 1}</span></div>
                      <div>Opened: <span className="font-semibold">{myPlayer.has_opened ? "Yes" : "No"}</span></div>
                      <div>Hand: <span className="font-semibold">{myHand.length}</span></div>
                    </>
                  ) : (
                    <div className="text-white/60">Take a seat to play.</div>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  <button className="w-full px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={leaveSeat} disabled={!myPlayer}>
                    Leave seat
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold" onClick={drawStock} disabled={!isMyTurn || ses.turn_phase !== "draw"}>
                      Draw stock
                    </button>
                    <button className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold" onClick={drawDiscard} disabled={!isMyTurn || ses.turn_phase !== "draw" || !discardTop}>
                      Take discard
                    </button>
                  </div>

                  <div className="rounded-xl p-3 bg-black/30 border border-white/10">
                    <div className="text-xs text-white/60 mb-2">Selected: {selected.length}</div>
                    <div className="flex flex-wrap gap-2">
                      {selected.map((c) => (
                        <span key={c} className="px-2 py-1 rounded-lg bg-emerald-600/20 border border-emerald-400/30 text-sm">
                          {cardLabel(c)}
                        </span>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold" onClick={playMeld} disabled={!isMyTurn || ses.turn_phase !== "meld" || selected.length < 3}>
                        New meld
                      </button>
                      <button className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold" onClick={discard} disabled={!isMyTurn || ses.turn_phase !== "discard" || selected.length !== 1}>
                        Discard
                      </button>
                    </div>

                    <div className="mt-2">
                      <div className="text-xs text-white/60 mb-1">Layoff target</div>
                      <div className="flex gap-2">
                        <select className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10" value={layoffSide} onChange={(e) => setLayoffSide(e.target.value)}>
                          <option value="left">Left (run)</option>
                          <option value="right">Right (run)</option>
                        </select>
                        <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={layoff} disabled={!isMyTurn || ses.turn_phase !== "meld" || selected.length !== 1 || !selectedMeldId}>
                          Layoff
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Opening builder */}
                  <div className="rounded-xl p-3 bg-black/30 border border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">Open (51+)</div>
                        <div className="text-xs text-white/60">Build melds, then open once.</div>
                      </div>
                      <div className="text-sm font-semibold">{openPoints} / 51</div>
                    </div>

                    <div className="mt-2 flex gap-2">
                      <button className="flex-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15" onClick={addPendingMeld} disabled={!isMyTurn || ses.turn_phase !== "meld" || selected.length < 3}>
                        Add meld
                      </button>
                      <button className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold" onClick={open51} disabled={!isMyTurn || ses.turn_phase !== "meld" || pendingMelds.length === 0 || (myPlayer?.has_opened ?? false)}>
                        OPEN
                      </button>
                    </div>

                    <div className="mt-2 space-y-2">
                      {pendingMelds.length === 0 && <div className="text-xs text-white/60">No pending melds.</div>}
                      {pendingMelds.map((m, idx) => (
                        <div key={idx} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-white/70">{m.type?.toUpperCase()} • {m.points} pts</div>
                            <button className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15" onClick={() => removePendingMeld(idx)}>
                              remove
                            </button>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {m.cards.map((c) => (
                              <span key={c} className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-sm">
                                {cardLabel(c)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>

              {/* My hand */}
              <div className="lg:col-span-3 rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Your hand</div>
                  <div className="text-xs text-white/60">Click to select cards</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {myHand.map((c) => {
                    const sel = selected.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => toggleSelect(c)}
                        className={`px-3 py-2 rounded-xl border text-sm ${
                          sel ? "bg-emerald-600/20 border-emerald-400/40" : "bg-black/30 border-white/10 hover:bg-black/40"
                        }`}
                      >
                        {cardLabel(c)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
