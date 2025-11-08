import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";

const TURN_PAUSE_MS = 1200;
const MATCH_BUYIN = 1000;
const MAX_ROUNDS_PER_MATCH = 1000;

const MIN_BUYIN_OPTIONS = {
  "1K": 1_000,
  "10K": 10_000,
  "100K": 100_000,
  "1M": 1_000_000,
  "10M": 10_000_000,
  "100M": 100_000_000,
};

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
  rush.vault = Math.max(0, Math.floor(nextValue));
  safeWrite("mleo_rush_core_v4", rush);
  if (window.updateVaultCallback) window.updateVaultCallback(rush.vault);
}

function fmt(n) {
  const value = Math.floor(Number(n || 0));
  if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (value >= 1e3) return (value / 1e3).toFixed(2) + "K";
  return String(value);
}

const SUITS = ["h", "d", "c", "s"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

function newDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(code) {
  const rank = code?.slice(0, -1) || "";
  const idx = RANKS.indexOf(rank);
  return idx < 0 ? -1 : idx;
}

const suitIcon = (suit) =>
  suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "c" ? "♣" : "♠";

const suitClass = (suit) =>
  suit === "h" || suit === "d" ? "text-red-400" : "text-blue-300";

function Card({ code, size = "lg", hidden = false }) {
  if (!code && !hidden) return null;
  const base =
    size === "lg"
      ? "w-16 h-24 text-xl"
      : size === "md"
      ? "w-12 h-18 text-lg"
      : "w-10 h-14 text-base";

  if (hidden) {
    return (
      <div
        className={`inline-flex items-center justify-center border border-white/30 rounded ${base} font-bold bg-white/10`}
      >
        <span>🂠</span>
      </div>
    );
  }

  const rank = code.slice(0, -1);
  const suit = code.slice(-1);

  return (
    <div
      className={`inline-flex items-center justify-center border border-white/30 rounded ${base} font-bold bg-gradient-to-b from-white/10 to-white/5 shadow ${suitClass(
        suit
      )}`}
    >
      <span className="leading-none">
        {rank}
        {suitIcon(suit)}
      </span>
    </div>
  );
}

export default function WarMP({
  roomId,
  playerName,
  vault,
  setVaultBoth,
  tierCode = "10K",
}) {
  useEffect(() => {
    window.updateVaultCallback = setVaultBoth;
    return () => {
      delete window.updateVaultCallback;
    };
  }, [setVaultBoth]);

  const name = playerName || "Guest";
  const clientId = useMemo(() => getClientId(), []);
  const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;

  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");
  const roundRef = useRef(0);

  const isLeader = useMemo(() => {
    if (!roomMembers.length || !name) return false;
    const sorted = [...roomMembers].sort((a, b) =>
      (a.player_name || "").localeCompare(b.player_name || "")
    );
    return sorted[0]?.player_name === name;
  }, [roomMembers, name]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`war_sessions:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "war_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data } = await supabase
            .from("war_sessions")
            .select("*")
            .eq("room_id", roomId)
            .maybeSingle();
          if (data) roundRef.current = data.round_no ?? roundRef.current;
          setSes(data || null);
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await supabase
            .from("war_sessions")
            .select("*")
            .eq("room_id", roomId)
            .maybeSingle();
          if (data) roundRef.current = data.round_no ?? 0;
          setSes(data || null);
          await channel.track({
            player_name: name,
            online_at: new Date().toISOString(),
          });
        }
      });
    return () => {
      channel.unsubscribe();
    };
  }, [roomId, name]);

  useEffect(() => {
    if (!ses?.id) return;
    const channel = supabase
      .channel(`war_players:${ses.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "war_players",
          filter: `session_id=eq.${ses.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("war_players")
            .select("*")
            .eq("session_id", ses.id)
            .order("seat_index");
          setPlayers(data || []);
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { data } = await supabase
            .from("war_players")
            .select("*")
            .eq("session_id", ses.id)
            .order("seat_index");
          setPlayers(data || []);
        }
      });
    return () => channel.unsubscribe();
  }, [ses?.id]);

  const seats = 2;
  const seatMap = useMemo(
    () => new Map(players.map((p) => [p.seat_index, p])),
    [players]
  );
  const myRow = players.find((p) => p.client_id === clientId) || null;
  const mySeat = myRow?.seat_index ?? null;

  const ensureSession = useCallback(async (room) => {
    const { data: upserted, error } = await supabase
      .from("war_sessions")
      .upsert(
        {
          room_id: room,
          stage: "lobby",
          seat_count: 2,
          deck: newDeck(),
          piles: { "0": [], "1": [] },
          current: {
            "0": null,
            "1": null,
            "__ready__": { "0": false, "1": false },
            "__deadline__": null,
          },
          stash: [],
          war_face_down: 1,
          round_no: 0,
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
      .from("war_sessions")
      .select("*")
      .eq("room_id", room)
      .single();
    return existing;
  }, []);

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
        .from("war_players")
        .select("id,client_id")
        .eq("session_id", session.id)
        .eq("seat_index", seatIndex)
        .maybeSingle();
      if (occupied && occupied.client_id && occupied.client_id !== clientId) {
        setMsg("Seat taken");
        return;
      }
      const { data: mine } = await supabase
        .from("war_players")
        .select("id,seat_index")
        .eq("session_id", session.id)
        .eq("client_id", clientId)
        .maybeSingle();
      if (mine && mine.seat_index !== seatIndex) {
        await supabase
          .from("war_players")
          .update({ seat_index: seatIndex, player_name: name })
          .eq("id", mine.id);
        setMsg("");
        return;
      }
      if (!mine) {
        const { error } = await supabase.from("war_players").upsert(
          {
            session_id: session.id,
            seat_index: seatIndex,
            player_name: name,
            client_id: clientId,
          },
          { onConflict: "session_id,seat_index", ignoreDuplicates: false }
        );
        if (error) {
          setMsg(
            error.message?.includes("duplicate") ? "Seat taken" : error.message
          );
          return;
        }
      }
      setMsg("");
    },
    [clientId, ensureSession, minRequired, name, roomId, ses]
  );

  const leaveSeat = useCallback(async () => {
    if (!myRow) return;
    await supabase.from("war_players").delete().eq("id", myRow.id);
  }, [myRow]);

  const splitDeckEven = (deck) => {
    const a = [];
    const b = [];
    deck.forEach((card, idx) => {
      if (idx % 2 === 0) a.push(card);
      else b.push(card);
    });
    return { a, b };
  };

  const fetchSession = useCallback(async () => {
    if (!ses?.id) return null;
    const { data } = await supabase
      .from("war_sessions")
      .select("*")
      .eq("id", ses.id)
      .single();
    return data;
  }, [ses?.id]);

  const startMatch = useCallback(async () => {
    if (!isLeader) {
      setMsg("Only leader can start");
      return;
    }
    const seated = players.filter((p) => p.seat_index !== null);
    if (seated.length < 2) {
      setMsg("Need 2 players seated");
      return;
    }
    setMsg("");
    const vaultBalance = readVault();
    if (mySeat !== null && vaultBalance >= MATCH_BUYIN) {
      writeVault(vaultBalance - MATCH_BUYIN);
    }
    const deck = newDeck();
    const { a, b } = splitDeckEven(deck);
    const payload = {
      stage: "dealing",
      deck: [],
      piles: { "0": a, "1": b },
      current: {
        "0": null,
        "1": null,
        "__ready__": { "0": false, "1": false },
        "__deadline__": new Date(Date.now() + 5000).toISOString(),
      },
      stash: [],
      round_no: 0,
      next_round_at: null,
    };
    roundRef.current = 0;
    await supabase.from("war_sessions").update(payload).eq("id", ses.id);
  }, [isLeader, mySeat, players, ses?.id]);

  const popTop = (pile) => {
    if (!Array.isArray(pile) || pile.length === 0) return null;
    const [top, ...rest] = pile;
    return { top, rest };
  };

  const pushBottom = (pile, cards) => [...pile, ...cards];

  const compareCards = (a, b) => {
    const va = cardValue(a);
    const vb = cardValue(b);
    if (va > vb) return 0;
    if (vb > va) return 1;
    return -1;
  };

  const doFlip = useCallback(async () => {
    const s = await fetchSession();
    if (!s) return;
    if (!["dealing", "flip", "compare"].includes(s.stage)) return;
    const piles = s.piles || { "0": [], "1": [] };
    const pop0 = popTop(piles["0"]);
    const pop1 = popTop(piles["1"]);
    const nextPiles = { "0": pop0?.rest ?? [], "1": pop1?.rest ?? [] };
    const currentState = {
      "0": pop0?.top ?? null,
      "1": pop1?.top ?? null,
      "__ready__": { "0": false, "1": false },
      "__deadline__": null,
    };
    const stash = [
      ...(s.stash || []),
      ...[currentState["0"], currentState["1"]].filter(Boolean),
    ];
    await supabase
      .from("war_sessions")
      .update({
        stage: "compare",
        piles: nextPiles,
        current: currentState,
        stash,
        next_round_at: new Date(Date.now() + TURN_PAUSE_MS).toISOString(),
      })
      .eq("id", s.id);
  }, [fetchSession]);

  const doWarStep = useCallback(async () => {
    const s = await fetchSession();
    if (!s) return;
    const piles = s.piles || { "0": [], "1": [] };
    let stash = [...(s.stash || [])];
    const nextPiles = {
      "0": [...(piles["0"] || [])],
      "1": [...(piles["1"] || [])],
    };
    for (const seat of ["0", "1"]) {
      for (let i = 0; i < (s.war_face_down || 1); i += 1) {
        const popped = popTop(nextPiles[seat]);
        if (!popped) break;
        stash.push(popped.top);
        nextPiles[seat] = popped.rest;
      }
    }
    const pop0 = popTop(nextPiles["0"]);
    const pop1 = popTop(nextPiles["1"]);
    if (pop0) nextPiles["0"] = pop0.rest;
    if (pop1) nextPiles["1"] = pop1.rest;
    const currentState = {
      "0": pop0?.top ?? null,
      "1": pop1?.top ?? null,
      "__ready__": { "0": false, "1": false },
      "__deadline__": null,
    };
    stash = [
      ...stash,
      ...[currentState["0"], currentState["1"]].filter(Boolean),
    ];
    await supabase
      .from("war_sessions")
      .update({
        stage: "compare",
        piles: nextPiles,
        current: currentState,
        stash,
        next_round_at: new Date(Date.now() + TURN_PAUSE_MS).toISOString(),
      })
      .eq("id", s.id);
  }, [fetchSession]);

  const finishMatch = useCallback(
    async (winnerSeat) => {
      try {
        const vaultBalance = readVault();
        if (mySeat !== null && mySeat === winnerSeat) {
          writeVault(vaultBalance + MATCH_BUYIN * 2);
        }
      } catch {
        // ignore
      }
      await supabase
        .from("war_sessions")
        .update({ stage: "ended", next_round_at: null })
        .eq("id", ses.id);
    },
    [mySeat, ses?.id]
  );

  const resolveCompare = useCallback(async () => {
    const s = await fetchSession();
    if (!s) return;
    const a = s.current?.["0"];
    const b = s.current?.["1"];
    const piles = s.piles || { "0": [], "1": [] };
    const stash = s.stash || [];
    const noCard0 = !a && piles["0"].length === 0;
    const noCard1 = !b && piles["1"].length === 0;
    if (noCard0 || noCard1) {
      const winner = noCard1 ? 0 : 1;
      await finishMatch(winner);
      return;
    }
    const result = a && b ? compareCards(a, b) : a ? 0 : 1;
    if (result === -1) {
      await supabase
        .from("war_sessions")
        .update({
          stage: "war",
          next_round_at: new Date(Date.now() + TURN_PAUSE_MS).toISOString(),
        })
        .eq("id", s.id);
      return;
    }
    const winnerSeat = result;
    const nextPiles = { ...piles };
    nextPiles[String(winnerSeat)] = pushBottom(
      piles[String(winnerSeat)] || [],
      stash
    );
    roundRef.current += 1;
    if (roundRef.current >= MAX_ROUNDS_PER_MATCH) {
      const len0 = (nextPiles["0"] || []).length;
      const len1 = (nextPiles["1"] || []).length;
      await finishMatch(len0 >= len1 ? 0 : 1);
      return;
    }
    await supabase
      .from("war_sessions")
      .update({
        stage: "dealing",
        piles: nextPiles,
        current: {
          "0": null,
          "1": null,
          "__ready__": { "0": false, "1": false },
          "__deadline__": new Date(Date.now() + 5000).toISOString(),
        },
        stash: [],
        round_no: roundRef.current,
        next_round_at: null,
      })
      .eq("id", s.id);
  }, [fetchSession, finishMatch]);

  const autopilotBusy = useRef(false);

  const handleFlipPhase = useCallback(
    async (session) => {
      if (!session) return;
      const currentState = session.current || {};
      const ready = currentState.__ready__ || { "0": false, "1": false };
      const deadlineISO = currentState.__deadline__;
      const now = Date.now();
      if (!deadlineISO) {
        const deadline = new Date(now + 5000).toISOString();
        await supabase
          .from("war_sessions")
          .update({
            current: {
              ...currentState,
              "__ready__": ready,
              "__deadline__": deadline,
            },
          })
          .eq("id", session.id);
        return;
      }
      const deadline = new Date(deadlineISO).getTime();
      const allReady = ready["0"] && ready["1"];
      if (!allReady && now < deadline) return;
      await doFlip();
    },
    [doFlip]
  );

  const triggerFlip = useCallback(
    async (seatIndex) => {
      if (!ses?.id) return;
      if (ses?.stage !== "dealing") return;
      const currentState = ses.current || {};
      const ready = currentState.__ready__ || { "0": false, "1": false };
      const key = String(seatIndex);
      if (ready[key]) return;
      const nextReady = { ...ready, [key]: true };
      const deadline =
        currentState.__deadline__ ||
        new Date(Date.now() + 5000).toISOString();
      const updatedCurrent = {
        ...currentState,
        "__ready__": nextReady,
        "__deadline__": deadline,
      };
      const { data, error } = await supabase
        .from("war_sessions")
        .update({ current: updatedCurrent })
        .eq("id", ses.id)
        .select("current")
        .single();
      if (!error && data) {
        setSes((prev) =>
          prev ? { ...prev, current: data.current } : prev
        );
      }
    },
    [ses]
  );

  useEffect(() => {
    if (!isLeader || !ses?.id) return;
    const timer = setInterval(async () => {
      if (autopilotBusy.current) return;
      autopilotBusy.current = true;
      try {
        const session = await fetchSession();
        if (!session) {
          if (roomId) await ensureSession(roomId);
          return;
        }
        const seatedCount = players.filter((p) => p.seat_index !== null).length;
        if (session.stage === "lobby") {
          if (seatedCount === 2) {
            await startMatch();
          }
          return;
        }
        if (
          session.next_round_at &&
          Date.now() < new Date(session.next_round_at).getTime()
        ) {
          return;
        }
        switch (session.stage) {
          case "dealing":
          case "flip":
            await handleFlipPhase(session);
            break;
          case "compare":
            await resolveCompare();
            break;
          case "war":
            await doWarStep();
            break;
          default:
            break;
        }
      } finally {
        autopilotBusy.current = false;
      }
    }, 400);
    return () => clearInterval(timer);
  }, [
    ensureSession,
    fetchSession,
    doFlip,
    doWarStep,
    isLeader,
    players,
    resolveCompare,
    roomId,
    ses?.id,
    ses?.stage,
    ses?.next_round_at,
    startMatch,
    handleFlipPhase,
  ]);

  const status = useMemo(() => {
    if (!ses) return "Loading…";
    switch (ses.stage) {
      case "lobby":
        return "Waiting for players…";
      case "dealing":
        return "Dealing…";
      case "flip":
        return "Flip!";
      case "compare":
        return "Comparing cards…";
      case "war":
        return "WAR!";
      case "ended":
        return "Match ended";
      default:
        return "…";
    }
  }, [ses]);

  const piles = ses?.piles || { "0": [], "1": [] };
  const current = ses?.current || { "0": null, "1": null };

  const Seat = ({ index }) => {
    const row = seatMap.get(index);
    const mine = row?.client_id === clientId;
    const label = index === 0 ? "Player A" : "Player B";
    const pile = piles[String(index)] || [];
    const pileCount = fmt(pile.length);
    const currentState = ses?.current || {};
    const currentCard = currentState[String(index)] || null;
    const readyMeta = currentState.__ready__ || { "0": false, "1": false };
    const readyForSeat = readyMeta[String(index)] || false;
    return (
      <div
        className={`flex flex-col h-full min-h-[240px] gap-3 p-4 rounded-xl border border-white/10 bg-white/5 ${
          mine ? "ring-2 ring-emerald-400" : ""
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-white/60">{label}</div>
            <div className="text-lg font-bold text-white/90">
              {row?.player_name || "—"}
            </div>
          </div>
          <div className="text-right text-xs text-white/60">
            <div>Pile: {pileCount}</div>
            <div>Stage: {status}</div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <Card code={currentCard} size="lg" hidden={!currentCard} />
        </div>

        <div className="text-xs text-white/65 text-center">
          Remaining cards: {pileCount}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          {mine && ses?.stage === "dealing" ? (
            <button
              onClick={() => triggerFlip(index)}
              disabled={readyForSeat}
              className={`h-10 rounded text-white text-sm font-semibold ${
                readyForSeat
                  ? "bg-white/10 border border-white/20 opacity-70 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {readyForSeat ? "Waiting..." : "Flip Card"}
            </button>
          ) : row ? (
            <div className="h-10" aria-hidden="true" />
          ) : (
            <button
              onClick={() => takeSeat(index)}
              className="h-10 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Take Seat
            </button>
          )}

        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full h-full gap-3 px-2 py-3 text-white/90">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
        <div className="font-semibold">War Multiplayer</div>
        <div className="flex items-center gap-3 text-sm text-white/70">
          <span>Stage: {status}</span>
          <span>Vault: {fmt(readVault())}</span>
          <span>Min buy-in: {fmt(minRequired)}</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 auto-rows-fr">
        <Seat index={0} />
        <Seat index={1} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <div className="text-sm text-white/70">
          Round: <span className="font-semibold text-white">{roundRef.current}</span>
        </div>
        <div className="flex items-center gap-2">
          {isLeader && ses?.stage === "lobby" && (
            <button
              onClick={startMatch}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Start Match
            </button>
          )}
          {isLeader && ses?.stage === "ended" && (
            <button
              onClick={async () => {
                roundRef.current = 0;
                await supabase
                  .from("war_sessions")
                  .update({
                    stage: "lobby",
                    deck: newDeck(),
                    piles: { "0": [], "1": [] },
                    current: { "0": null, "1": null },
                    stash: [],
                    next_round_at: null,
                    round_no: 0,
                  })
                  .eq("id", ses.id);
              }}
              className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              Reset Lobby
            </button>
          )}
        </div>
        {msg && <div className="text-rose-300 text-sm">{msg}</div>}
      </div>


    </div>
  );
}


