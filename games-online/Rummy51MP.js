
// games-online/Rummy51MP.js
// Rummy 51 (Classic) — Multiplayer UI v2
// - Real "table" feel (green felt), card images, hand tray, drag-to-discard
// - Other players: name + remaining card count only
// - Animations (draw/discard) + simple SFX (no asset files needed)
// Backend: uses RPC functions from rummy51_supabase.sql (ensure_session/take_seat/start_round/draw/open/new_meld/layoff/discard)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";

// -----------------------------
// Helpers
// -----------------------------
const SEATS = 6;
const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };

function fmt(n) {
  const x = Number(n || 0);
  if (x >= 1_000_000_000) return `${(x / 1_000_000_000).toFixed(2)}B`;
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(2)}M`;
  if (x >= 1_000) return `${(x / 1_000).toFixed(2)}K`;
  return `${x}`;
}

function parseTierCode(tierCode) {
  // "1K" | "10K" | "100K" | "1M" etc
  const s = String(tierCode || "").toUpperCase();
  if (s.endsWith("K")) return Math.round(Number(s.slice(0, -1)) * 1_000);
  if (s.endsWith("M")) return Math.round(Number(s.slice(0, -1)) * 1_000_000);
  if (s.endsWith("B")) return Math.round(Number(s.slice(0, -1)) * 1_000_000_000);
  const num = Number(s);
  return Number.isFinite(num) ? num : 10_000;
}

function cardFace(card) {
  return (card || "").split(":")[0]; // "AS" / "TD" / "7H" / "JK"
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
  const n = Number(tok);
  return Number.isFinite(n) ? n : null;
}
function pointsFromRankInt(r) {
  if (r == null) return 0;
  if (r === 14) return 11;
  if (r >= 11) return 10;
  return r;
}
function cardLabel(card) {
  if (!card) return "";
  if (isJoker(card)) return `🃏`;
  const tok = cardRankToken(card);
  const s = cardSuit(card);
  const rank = tok === "T" ? "10" : tok;
  return `${rank}${SUIT_SYMBOL[s] || s}`;
}
function sortHandDefault(a, b) {
  // Jokers last, suit then rank
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
function sortHandByRank(a, b) {
  const aj = isJoker(a);
  const bj = isJoker(b);
  if (aj && !bj) return 1;
  if (!aj && bj) return -1;

  const ra = rankToInt(cardRankToken(a)) || 0;
  const rb = rankToInt(cardRankToken(b)) || 0;
  if (ra !== rb) return ra - rb;

  const sa = cardSuit(a) || "";
  const sb = cardSuit(b) || "";
  return sa.localeCompare(sb);
}

// Client-side validator (UX only; server enforces)
function analyzeMeld(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return { ok: false };

  const jokers = cards.filter(isJoker);
  const nonj = cards.filter((c) => !isJoker(c));
  if (nonj.length === 0) return { ok: false };

  // SET (3-4): same rank, different suits
  if (cards.length <= 4) {
    const r0 = rankToInt(cardRankToken(nonj[0]));
    if (nonj.every((c) => rankToInt(cardRankToken(c)) === r0)) {
      const suits = nonj.map(cardSuit);
      if (new Set(suits).size === suits.length) {
        return { ok: true, type: "set", points: cards.length * pointsFromRankInt(r0) };
      }
    }
  }

  // RUN (3+): same suit for non-jokers, consecutive with jokers filling gaps (A can be high; also allow A-2-3)
  const suit0 = cardSuit(nonj[0]);
  if (!nonj.every((c) => cardSuit(c) === suit0)) return { ok: false };

  const n = cards.length;
  const nr = nonj.map((c) => rankToInt(cardRankToken(c)));
  if (new Set(nr).size !== nr.length) return { ok: false };

  for (let start = 1; start <= 14 - n + 1; start++) {
    const target = [];
    for (let k = 0; k < n; k++) target.push(start + k);

    if (nr.every((x) => target.includes(x))) {
      // points: Ace always 11; face 10; others numeric
      const pts = target.reduce((sum, r) => {
        const rr = r === 1 ? 14 : r; // treat 1 as Ace if used in A-2-3
        return sum + pointsFromRankInt(rr);
      }, 0);
      return { ok: true, type: "run", points: pts, suit: suit0 };
    }
  }

  return { ok: false };
}

// -----------------------------
// SFX (no external assets)
// -----------------------------
function useSfx() {
  const ctxRef = useRef(null);

  const play = useCallback((kind) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!ctxRef.current) ctxRef.current = new AudioCtx();
      const ctx = ctxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      const now = ctx.currentTime;
      let f = 440;
      let dur = 0.08;
      let type = "triangle";

      if (kind === "draw") { f = 620; dur = 0.06; type = "triangle"; }
      if (kind === "discard") { f = 260; dur = 0.07; type = "square"; }
      if (kind === "meld") { f = 520; dur = 0.09; type = "sine"; }
      if (kind === "win") { f = 780; dur = 0.14; type = "sine"; }
      if (kind === "error") { f = 140; dur = 0.10; type = "sawtooth"; }

      o.type = type;
      o.frequency.setValueAtTime(f, now);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      o.connect(g);
      g.connect(ctx.destination);

      o.start(now);
      o.stop(now + dur + 0.02);
    } catch {}
  }, []);

  return { play };
}

// -----------------------------
// Card UI (uses same back as Poker/Blackjack)
// -----------------------------
function toDeckApiCode(card) {
  if (!card) return null;
  const face = cardFace(card);
  if (face === "JK") return null;
  const r = face.slice(0, -1);
  const s = face.slice(-1);
  const rankMap = { A: "A", K: "K", Q: "Q", J: "J", T: "0" };
  const suitMap = { S: "S", H: "H", D: "D", C: "C" };
  const rr = rankMap[r] || r;
  const ss = suitMap[s] || s;
  return `${rr}${ss}`;
}

function PlayingCard({
  card,
  faceDown = false,
  selected = false,
  size = "md",
  dim = false,
  draggable = false,
  onClick,
  onDragStart,
}) {
  const sizeCls =
    size === "sm"
      ? "w-[40px] h-[56px] md:w-[46px] md:h-[66px]"
      : "w-[54px] h-[76px] md:w-[66px] md:h-[94px]";

  const base =
    `relative ${sizeCls} rounded-md overflow-hidden shadow-lg border transition-transform duration-150 ` +
    (selected ? "border-emerald-300 ring-2 ring-emerald-400/40 -translate-y-3" : "border-white/15") +
    (dim ? " opacity-70" : "");

  if (faceDown) {
    return (
      <div className={base}>
        <img
          src="/card-backs/poker-back.jpg"
          alt="Card back"
          className="w-full h-full object-cover rounded-md"
          draggable={false}
        />
      </div>
    );
  }

  if (isJoker(card)) {
    return (
      <button
        onClick={onClick}
        draggable={draggable}
        onDragStart={onDragStart}
        className={`${base} bg-white/10 flex items-center justify-center`}
        title="Joker"
      >
        <div className="text-base md:text-lg font-extrabold">🃏</div>
      </button>
    );
  }

  const code = toDeckApiCode(card);
  const url = code ? `https://deckofcardsapi.com/static/img/${code}.png` : null;

  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={`${base} bg-white/5`}
      title={cardLabel(card)}
    >
      {url ? (
        <img
          src={url}
          alt={card}
          className="w-full h-full object-cover"
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const fb = e.currentTarget.parentElement?.querySelector(".fallback");
            if (fb) fb.style.display = "flex";
          }}
        />
      ) : null}
      <div className="fallback hidden absolute inset-0 items-center justify-center bg-white text-black">
        <div className="text-xs font-bold">{cardLabel(card)}</div>
      </div>
    </button>
  );
}

// -----------------------------
// Animation overlay (draw/discard feel)
// -----------------------------
function AnimCard({ anim }) {
  // anim: { key, from, to, card, doneCb }
  const [atTo, setAtTo] = useState(false);

  useEffect(() => {
    if (!anim) return;
    const t = requestAnimationFrame(() => setAtTo(true));
    return () => cancelAnimationFrame(t);
  }, [anim?.key]);

  if (!anim) return null;

  const style = atTo
    ? {
        position: "fixed",
        left: anim.to.left,
        top: anim.to.top,
        width: anim.to.width,
        height: anim.to.height,
        transform: "translate(-50%, -50%)",
        transition: "all 260ms ease",
        pointerEvents: "none",
        zIndex: 9999,
      }
    : {
        position: "fixed",
        left: anim.from.left,
        top: anim.from.top,
        width: anim.from.width,
        height: anim.from.height,
        transform: "translate(-50%, -50%)",
        transition: "all 260ms ease",
        pointerEvents: "none",
        zIndex: 9999,
      };

  return (
    <div
      style={style}
      onTransitionEnd={() => {
        try { anim.doneCb?.(); } catch {}
      }}
    >
      <PlayingCard card={anim.card} size="md" />
    </div>
  );
}

// -----------------------------
// Main Component
// -----------------------------
export default function Rummy51MP({ roomId, playerName, vault, setVaultBoth, tierCode = "10K" }) {
  const { play } = useSfx();
  const clientId = useMemo(() => getClientId("rummy51"), []);
  const name = playerName || "Guest";
  const entry = useMemo(() => parseTierCode(tierCode), [tierCode]);

  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");

  const [selected, setSelected] = useState([]); // selected cards in my hand
  const [pendingMelds, setPendingMelds] = useState([]); // [{cards, type, points}]
  const [selectedMeldId, setSelectedMeldId] = useState(null);
  const [layoffSide, setLayoffSide] = useState("right");
  const [handSortMode, setHandSortMode] = useState("suit"); // suit | rank

  const [dragCard, setDragCard] = useState(null);
  const [anim, setAnim] = useState(null);
  const animKeyRef = useRef(1);

  const stockRef = useRef(null);
  const discardRef = useRef(null);
  const handRef = useRef(null);

  const myRow = useMemo(() => players.find((p) => p.client_id === clientId) || null, [players, clientId]);
  const mySeat = myRow?.seat_index ?? null;

  const isPlaying = ses?.stage === "playing";
  const isMyTurn = useMemo(() => {
    if (!isPlaying) return false;
    if (mySeat == null) return false;
    return ses.turn_seat === mySeat;
  }, [isPlaying, mySeat, ses?.turn_seat]);

  const myHand = useMemo(() => {
    const h = Array.isArray(myRow?.hand) ? [...myRow.hand] : [];
    h.sort(handSortMode === "rank" ? sortHandByRank : sortHandDefault);
    return h;
  }, [myRow?.hand, handSortMode]);

  const discardTop = useMemo(() => {
    const d = Array.isArray(ses?.discard) ? ses.discard : [];
    return d.length ? d[d.length - 1] : null;
  }, [ses?.discard]);

  const melds = useMemo(() => (Array.isArray(ses?.melds) ? ses.melds : []), [ses?.melds]);

  const seatedPlayers = useMemo(
    () => players.filter((p) => p.seat_index != null).sort((a, b) => a.seat_index - b.seat_index),
    [players]
  );

  const openPoints = useMemo(() => pendingMelds.reduce((s, m) => s + (m.points || 0), 0), [pendingMelds]);

  const canDraw = isMyTurn && ses?.turn_phase === "draw";
  const canMeld = isMyTurn && ses?.turn_phase === "meld";
  const canDiscard = isMyTurn && ses?.turn_phase === "discard";

  // -----------------------------
  // Data sync
  // -----------------------------
  const ensureSession = useCallback(async () => {
    if (!roomId) return null;
    const { data, error } = await supabase.rpc("rummy51_ensure_session", {
      p_room_id: roomId,
      p_seat_count: SEATS,
      p_entry_fee: 0,
    });
    if (error) {
      setMsg(error.message || "Failed to load room");
      return null;
    }
    setSes(data);
    return data;
  }, [roomId]);

  const refreshSession = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase.from("rummy51_sessions").select("*").eq("room_id", roomId).single();
    if (data) setSes(data);
  }, [roomId]);

  const refreshPlayers = useCallback(async (sessionId) => {
    if (!sessionId) return;
    const { data } = await supabase
      .from("rummy51_players")
      .select("*")
      .eq("session_id", sessionId)
      .order("seat_index");
    setPlayers(data || []);
  }, []);

  // Presence + session realtime
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const ch = supabase
      .channel("rummy51_room:" + roomId, { config: { presence: { key: clientId } } })
      .on("postgres_changes", { event: "*", schema: "public", table: "rummy51_sessions", filter: `room_id=eq.${roomId}` }, async () => {
        if (cancelled) return;
        await refreshSession();
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const list = Object.values(state).flat();
        setRoomMembers(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const s = await ensureSession();
          if (!cancelled && s?.id) await refreshPlayers(s.id);
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [roomId, clientId, name, ensureSession, refreshPlayers, refreshSession]);

  // Players realtime
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

  // Actions realtime (for animation/sfx)
  useEffect(() => {
    if (!ses?.id) return;

    let cancelled = false;
    const chA = supabase
      .channel("rummy51_actions:" + ses.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rummy51_actions", filter: `session_id=eq.${ses.id}` }, (payload) => {
        if (cancelled) return;
        const a = payload.new;
        if (!a) return;

        // SFX + Anim
        const type = a.action_type;
        const seat = a.seat_index;
        const p = a.payload || {};
        const card = p.card;

        // Winner
        if (type === "WIN") play("win");

        // Only animate for my seat (feels personal)
        if (seat !== mySeat) {
          if (type === "DISCARD") play("discard");
          if (type === "DRAW_STOCK" || type === "DRAW_DISCARD") play("draw");
          return;
        }

        if ((type === "DRAW_STOCK" || type === "DRAW_DISCARD") && card) {
          play("draw");
          animateBetween(type === "DRAW_STOCK" ? "stock" : "discard", "hand", card);
        } else if (type === "DISCARD" && card) {
          play("discard");
          animateBetween("hand", "discard", card);
        } else if (type === "OPEN" || type === "NEW_MELD" || type === "LAYOFF") {
          play("meld");
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(chA);
    };
  }, [ses?.id, mySeat, play]);

  // -----------------------------
  // Animation helpers
  // -----------------------------
  const getAnchorRect = useCallback((which) => {
    const el =
      which === "stock" ? stockRef.current :
      which === "discard" ? discardRef.current :
      which === "hand" ? handRef.current :
      null;

    if (!el) return { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 66, height: 94 };

    const r = el.getBoundingClientRect();
    return {
      left: r.left + r.width / 2,
      top: r.top + r.height / 2,
      width: Math.min(66, r.width),
      height: Math.min(94, r.height),
    };
  }, []);

  const animateBetween = useCallback((from, to, card) => {
    const fromR = getAnchorRect(from);
    const toR = getAnchorRect(to);
    const key = animKeyRef.current++;

    setAnim({
      key,
      from: fromR,
      to: toR,
      card,
      doneCb: () => {
        // clear only if same key
        setAnim((cur) => (cur?.key === key ? null : cur));
      },
    });
  }, [getAnchorRect]);

  // -----------------------------
  // Lobby / game RPC
  // -----------------------------
  const takeSeat = useCallback(async (seatIndex) => {
    if (!roomId) return;
    setMsg("");
    const { error } = await supabase.rpc("rummy51_take_seat", {
      p_room_id: roomId,
      p_seat_index: seatIndex,
      p_client_id: clientId,
      p_player_name: name,
    });
    if (error) {
      play("error");
      setMsg(error.message || "Seat failed");
      return;
    }
    const s = ses?.id ? ses : await ensureSession();
    if (s?.id) await refreshPlayers(s.id);
  }, [roomId, clientId, name, ses?.id, ensureSession, refreshPlayers, play]);

  const leaveSeat = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { error } = await supabase.rpc("rummy51_leave_seat", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) {
      play("error");
      setMsg(error.message || "Leave failed");
      return;
    }
    await refreshPlayers(ses.id);
  }, [ses?.id, clientId, refreshPlayers, play]);

  const startRound = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { data, error } = await supabase.rpc("rummy51_start_round", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) {
      play("error");
      setMsg(error.message || "Start failed");
      return;
    }
    setPendingMelds([]);
    setSelected([]);
    setSelectedMeldId(null);
    setSes(data);
    await refreshPlayers(ses.id);
  }, [ses?.id, clientId, refreshPlayers, play]);

  const drawStock = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { data, error } = await supabase.rpc("rummy51_draw_stock", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) {
      play("error");
      setMsg(error.message || "Draw failed");
      return;
    }
    if (data) setSes(data);
  }, [ses?.id, clientId, play]);

  const drawDiscard = useCallback(async () => {
    if (!ses?.id) return;
    setMsg("");
    const { data, error } = await supabase.rpc("rummy51_draw_discard", {
      p_session_id: ses.id,
      p_client_id: clientId,
    });
    if (error) {
      play("error");
      setMsg(error.message || "Draw failed");
      return;
    }
    if (data) setSes(data);
  }, [ses?.id, clientId, play]);

  const addPendingMeld = useCallback(() => {
    setMsg("");
    const cards = [...selected];
    const a = analyzeMeld(cards);
    if (!a.ok) {
      play("error");
      setMsg("Invalid meld (need valid set/run, 3+ cards).");
      return;
    }
    setPendingMelds((prev) => [...prev, { cards, type: a.type, points: a.points }]);
    setSelected([]);
  }, [selected, play]);

  const removePendingMeld = useCallback((idx) => {
    setPendingMelds((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const open51 = useCallback(async () => {
    if (!ses?.id || !myRow) return;
    setMsg("");
    if (myRow.has_opened) {
      play("error");
      setMsg("Already opened.");
      return;
    }
    if (pendingMelds.length === 0) {
      play("error");
      setMsg("Add at least one meld to open.");
      return;
    }
    const total = pendingMelds.reduce((s, m) => s + (m.points || 0), 0);
    if (total < 51) {
      play("error");
      setMsg(`Need 51+ points to open (you have ${total}).`);
      return;
    }

    const { data, error } = await supabase.rpc("rummy51_open", {
      p_session_id: ses.id,
      p_client_id: clientId,
      p_melds: pendingMelds.map((m) => m.cards),
    });
    if (error) {
      play("error");
      setMsg(error.message || "Open failed");
      return;
    }
    setPendingMelds([]);
    setSelected([]);
    if (data) setSes(data);
  }, [ses?.id, myRow, pendingMelds, clientId, play]);

  const playMeld = useCallback(async () => {
    if (!ses?.id) return;
    if (!myRow?.has_opened) {
      play("error");
      setMsg("You must OPEN (51+) first.");
      return;
    }
    setMsg("");
    const cards = [...selected];
    const a = analyzeMeld(cards);
    if (!a.ok) {
      play("error");
      setMsg("Invalid meld.");
      return;
    }

    const { data, error } = await supabase.rpc("rummy51_new_meld", {
      p_session_id: ses.id,
      p_client_id: clientId,
      p_cards: cards,
    });
    if (error) {
      play("error");
      setMsg(error.message || "Meld failed");
      return;
    }
    if (data) setSes(data);
    setSelected([]);
  }, [ses?.id, myRow?.has_opened, selected, clientId, play]);

  const layoff = useCallback(async () => {
    if (!ses?.id) return;
    if (!myRow?.has_opened) {
      play("error");
      setMsg("You must OPEN (51+) first.");
      return;
    }
    if (!selectedMeldId) {
      play("error");
      setMsg("Pick a meld on table first.");
      return;
    }
    if (selected.length !== 1) {
      play("error");
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
    if (error) {
      play("error");
      setMsg(error.message || "Layoff failed");
      return;
    }
    if (data) setSes(data);
    setSelected([]);
  }, [ses?.id, myRow?.has_opened, selected, selectedMeldId, layoffSide, clientId, play]);

  const discard = useCallback(async (cardOverride) => {
    if (!ses?.id) return;
    const card = cardOverride || (selected.length === 1 ? selected[0] : null);
    if (!card) {
      play("error");
      setMsg("Select exactly 1 card to discard.");
      return;
    }
    setMsg("");

    const { data, error } = await supabase.rpc("rummy51_discard", {
      p_session_id: ses.id,
      p_client_id: clientId,
      p_card: card,
    });
    if (error) {
      play("error");
      setMsg(error.message || "Discard failed");
      return;
    }
    if (data) setSes(data);
    setSelected([]);
  }, [ses?.id, selected, clientId, play]);

  // -----------------------------
  // UI helpers
  // -----------------------------
  const toggleSelect = useCallback((card) => {
    setSelected((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));
  }, []);

  const seatsWithMeta = useMemo(() => {
    const seatToPlayer = new Map();
    for (const p of seatedPlayers) {
      if (p.seat_index != null) seatToPlayer.set(p.seat_index, p);
    }

    // Seat positions around table (percentage coords)
    // 0 bottom center, then clockwise like poker-ish
    const coords = [
      { x: 50, y: 78, s: 1.1 }, // seat 1 (index 0) bottom-center (YOU)
      { x: 18, y: 68, s: 0.95 },
      { x: 18, y: 30, s: 0.90 },
      { x: 50, y: 18, s: 0.95 },
      { x: 82, y: 30, s: 0.90 },
      { x: 82, y: 68, s: 0.95 },
    ];

    return Array.from({ length: SEATS }).map((_, i) => {
      const p = seatToPlayer.get(i) || null;
      const me = p?.client_id === clientId;
      const isTurn = isPlaying && ses?.turn_seat === i;
      const hasOpened = !!p?.has_opened;
      const count = Array.isArray(p?.hand) ? p.hand.length : 0;

      return {
        seat: i,
        player: p,
        me,
        isTurn,
        hasOpened,
        count,
        pos: coords[i] || { x: 50, y: 50, s: 1 },
      };
    });
  }, [seatedPlayers, clientId, isPlaying, ses?.turn_seat]);

  // Drag-to-discard
  const onHandDragStart = useCallback((e, card) => {
    try {
      setDragCard(card);
      e.dataTransfer.setData("text/plain", card);
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  }, []);

  const onDiscardDrop = useCallback((e) => {
    e.preventDefault();
    if (!canDiscard) return;
    const card = e.dataTransfer.getData("text/plain") || dragCard;
    if (!card) return;
    discard(card);
    setDragCard(null);
  }, [canDiscard, dragCard, discard]);

  const onDiscardDragOver = useCallback((e) => {
    if (!canDiscard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, [canDiscard]);

  // -----------------------------
  // Render
  // -----------------------------
  if (!roomId) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/70">
        Missing roomId
      </div>
    );
  }

  // Header values
  const vaultNum = Number(vault || 0);
  const pot = entry * seatedPlayers.length;

  return (
    <div className="w-full h-full flex flex-col gap-3 text-white">
      {/* Overlay animated card */}
      <AnimCard anim={anim} />

      {/* Top Bar (match your Blackjack style) */}
      <div className="w-full max-w-6xl mx-auto px-2 sm:px-4">
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">Rummy 51</div>
            <div className="text-xs text-white/70">
              Room: <span className="font-semibold">{roomId.slice(0, 8)}…</span> · Online: {roomMembers.length} ·
              Stage: <span className="font-semibold">{ses?.stage || "…"}</span>
            </div>
          </div>
          <div className="text-right text-xs sm:text-sm">
            <div className="text-white/80">Min: <span className="font-semibold">{fmt(entry)}</span></div>
            <div className="text-emerald-300 font-semibold">Vault: {fmt(vaultNum)}</div>
          </div>
        </div>

        {msg && (
          <div className="mt-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/25 text-red-100 text-sm">
            {msg}
          </div>
        )}
      </div>

      {/* Main table */}
      <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 px-2 sm:px-4 pb-2">
        <div className="h-full min-h-[520px] rounded-2xl border border-white/10 overflow-hidden bg-[#0f3e1f] bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.35)_0%,transparent_70%)] relative">
          {/* Meld rail (top) */}
          <div className="absolute top-2 left-2 right-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-white/80 font-semibold">
                Melds on table: <span className="text-white/70">{melds.length}</span>
              </div>
              <div className="text-xs text-white/70">
                Pot (UI): <span className="font-semibold">{fmt(pot)}</span>
              </div>
            </div>

            <div className="mt-2 overflow-x-auto no-scrollbar">
              <div className="inline-flex gap-3">
                {melds.length === 0 && (
                  <div className="text-xs text-white/60 px-3 py-2 rounded-xl bg-black/25 border border-white/10">
                    No melds yet.
                  </div>
                )}

                {melds.map((m) => {
                  const active = selectedMeldId === m.id;
                  const cards = Array.isArray(m.cards) ? m.cards : [];
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMeldId(m.id)}
                      className={`px-2 py-2 rounded-xl border transition-all ${
                        active ? "bg-emerald-600/20 border-emerald-300/40" : "bg-black/25 border-white/10 hover:bg-black/35"
                      }`}
                      title="Click to target for layoff"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-white/80 font-semibold">
                          {String(m.type || "").toUpperCase()} {m.suit ? SUIT_SYMBOL[m.suit] : ""} · Seat {(m.owner_seat ?? 0) + 1}
                        </div>
                        <div className="text-[11px] text-white/60">{cards.length}</div>
                      </div>

                      <div className="mt-2 flex items-end">
                        {cards.slice(-8).map((c, idx) => (
                          <div key={idx} className={idx === 0 ? "" : "-ml-6"}>
                            <PlayingCard card={c} size="sm" dim={idx < cards.slice(-8).length - 3} />
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stock + Discard (center) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-[11px] text-white/70 mb-1">STOCK</div>
                <div ref={stockRef} className="inline-block">
                  <PlayingCard faceDown size="md" />
                </div>
                <div className="mt-1 text-[11px] text-white/60">
                  {Array.isArray(ses?.stock) ? ses.stock.length : 0}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[11px] text-white/70 mb-1">DISCARD</div>
                <div
                  ref={discardRef}
                  className={`inline-block ${canDiscard ? "ring-2 ring-amber-400/30 rounded-md" : ""}`}
                  onDrop={onDiscardDrop}
                  onDragOver={onDiscardDragOver}
                  title={canDiscard ? "Drop a card here to discard" : "Discard pile"}
                >
                  {discardTop ? <PlayingCard card={discardTop} size="md" /> : <PlayingCard faceDown size="md" />}
                </div>
                <div className="mt-1 text-[11px] text-white/60">
                  {Array.isArray(ses?.discard) ? ses.discard.length : 0}
                </div>
              </div>
            </div>
          </div>

          {/* Seats around table */}
          {seatsWithMeta.map((s) => {
            const p = s.player;
            const isMe = s.me;
            const isTurn = s.isTurn;
            const label = p ? p.player_name : "Empty";
            const count = p ? s.count : 0;

            return (
              <div
                key={s.seat}
                className={`absolute rounded-xl border shadow-lg transition-all ${
                  isTurn ? "border-yellow-400 bg-yellow-400/15 ring-2 ring-yellow-400/25" :
                  isMe ? "border-purple-400 bg-purple-400/15" :
                  "border-white/15 bg-black/20"
                }`}
                style={{
                  left: `${s.pos.x}%`,
                  top: `${s.pos.y}%`,
                  transform: `translate(-50%, -50%) scale(${s.pos.s})`,
                  minWidth: isMe ? "150px" : "160px",
                }}
              >
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold truncate max-w-[120px]">
                      {label}{isMe ? " (You)" : ""}
                    </div>
                    {p && (
                      <div className="text-[11px] text-white/70">
                        Seat {s.seat + 1}
                      </div>
                    )}
                  </div>

                  {p ? (
                    <div className="mt-1 text-[11px] text-white/70 flex items-center justify-between">
                      <div>{count} cards</div>
                      <div className={`${p.has_opened ? "text-emerald-300" : "text-white/50"}`}>
                        {p.has_opened ? "Opened" : "Not opened"}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => takeSeat(s.seat)}
                      className="mt-2 w-full px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold"
                      disabled={ses?.stage !== "lobby"}
                      title={ses?.stage !== "lobby" ? "Game in progress" : "Take seat"}
                    >
                      TAKE SEAT
                    </button>
                  )}
                </div>

                {p && (
                  <div className={`absolute -top-2 -right-2 w-3 h-3 rounded-full ${isTurn ? "bg-yellow-400 animate-pulse" : "bg-white/20"}`} />
                )}
              </div>
            );
          })}

          {/* Bottom hint */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-white/60">
            <div>
              Turn: <span className="text-white/80 font-semibold">Seat {(ses?.turn_seat ?? 0) + 1}</span> · Phase:{" "}
              <span className="text-white/80 font-semibold">{ses?.turn_phase || "—"}</span>
            </div>
            <div className="hidden sm:block">
              Tip: drag a card onto discard pile to throw it (your turn, discard phase)
            </div>
          </div>
        </div>
      </div>

      {/* Bottom panel (hand + actions), like your Blackjack layout */}
      <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 pb-4">
        <div className="grid md:grid-cols-3 gap-3">
          {/* Hand tray */}
          <div className="md:col-span-2 rounded-2xl bg-white/5 border border-white/10 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">Your hand</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHandSortMode((m) => (m === "suit" ? "rank" : "suit"))}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold"
                >
                  Sort: {handSortMode === "suit" ? "Suit" : "Rank"}
                </button>
                <div className="text-xs text-white/60">{myHand.length} cards</div>
              </div>
            </div>

            <div ref={handRef} className="mt-2 overflow-x-auto whitespace-nowrap no-scrollbar py-2">
              <div className="inline-flex items-end">
                {myHand.map((c, idx) => {
                  const sel = selected.includes(c);
                  return (
                    <div key={c} className={idx === 0 ? "" : "-ml-8 md:-ml-10"}>
                      <PlayingCard
                        card={c}
                        selected={sel}
                        size="md"
                        draggable={true}
                        onDragStart={(e) => onHandDragStart(e, c)}
                        onClick={() => toggleSelect(c)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending open melds panel (compact) */}
            {!myRow?.has_opened && (
              <div className="mt-2 rounded-xl bg-black/25 border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold">Open (51+)</div>
                    <div className="text-[11px] text-white/60">Build melds, then OPEN once.</div>
                  </div>
                  <div className="text-sm font-bold">{openPoints} / 51</div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={addPendingMeld}
                    disabled={!canMeld || selected.length < 3}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      !canMeld || selected.length < 3
                        ? "bg-white/5 border border-white/10 text-white/40"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    Add Meld
                  </button>

                  <button
                    onClick={open51}
                    disabled={!canMeld || pendingMelds.length === 0 || openPoints < 51}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      !canMeld || pendingMelds.length === 0 || openPoints < 51
                        ? "bg-white/5 border border-white/10 text-white/40"
                        : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    OPEN
                  </button>

                  {pendingMelds.length > 0 && (
                    <button
                      onClick={() => { setPendingMelds([]); setSelected([]); }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {pendingMelds.length > 0 && (
                  <div className="mt-2 grid sm:grid-cols-2 gap-2">
                    {pendingMelds.map((m, i) => (
                      <div key={i} className="rounded-xl bg-white/5 border border-white/10 p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-white/70">
                            {String(m.type || "").toUpperCase()} · {m.points} pts
                          </div>
                          <button
                            onClick={() => removePendingMeld(i)}
                            className="text-[11px] px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15"
                          >
                            remove
                          </button>
                        </div>
                        <div className="mt-2 flex items-end">
                          {m.cards.map((c, idx) => (
                            <div key={idx} className={idx === 0 ? "" : "-ml-6"}>
                              <PlayingCard card={c} size="sm" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions + status */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
            <div className="text-sm font-bold">Actions</div>
            <div className="text-xs text-white/60 mt-1">
              Your turn: <span className="font-semibold">{isMyTurn ? "YES" : "NO"}</span>
            </div>

            {/* Action buttons (match Blackjack sizing) */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={drawStock}
                disabled={!canDraw}
                className={`px-3 py-2 rounded-lg text-sm font-bold ${
                  !canDraw ? "bg-white/5 border border-white/10 text-white/40" : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                DRAW
              </button>

              <button
                onClick={drawDiscard}
                disabled={!canDraw || !discardTop}
                className={`px-3 py-2 rounded-lg text-sm font-bold ${
                  !canDraw || !discardTop ? "bg-white/5 border border-white/10 text-white/40" : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                TAKE
              </button>

              <button
                onClick={playMeld}
                disabled={!canMeld || !myRow?.has_opened || selected.length < 3}
                className={`px-3 py-2 rounded-lg text-sm font-bold ${
                  !canMeld || !myRow?.has_opened || selected.length < 3
                    ? "bg-white/5 border border-white/10 text-white/40"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                MELD
              </button>

              <button
                onClick={layoff}
                disabled={!canMeld || !myRow?.has_opened || selected.length !== 1 || !selectedMeldId}
                className={`px-3 py-2 rounded-lg text-sm font-bold ${
                  !canMeld || !myRow?.has_opened || selected.length !== 1 || !selectedMeldId
                    ? "bg-white/5 border border-white/10 text-white/40"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                LAYOFF
              </button>

              <button
                onClick={() => discard()}
                disabled={!canDiscard || selected.length !== 1}
                className={`px-3 py-2 rounded-lg text-sm font-bold col-span-2 ${
                  !canDiscard || selected.length !== 1
                    ? "bg-white/5 border border-white/10 text-white/40"
                    : "bg-rose-600 hover:bg-rose-500"
                }`}
                title="You can also drag a card onto discard pile"
              >
                DISCARD
              </button>
            </div>

            {/* Layoff side selector */}
            <div className="mt-2 flex items-center gap-2">
              <div className="text-xs text-white/60">Layoff side:</div>
              <select
                className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm"
                value={layoffSide}
                onChange={(e) => setLayoffSide(e.target.value)}
              >
                <option value="left">Left (run)</option>
                <option value="right">Right (run)</option>
              </select>
            </div>

            {/* Selected display */}
            <div className="mt-3 rounded-xl bg-black/25 border border-white/10 p-2">
              <div className="text-xs text-white/70">Selected: {selected.length}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {selected.slice(0, 6).map((c) => (
                  <span key={c} className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
                    {cardLabel(c)}
                  </span>
                ))}
                {selected.length > 6 && <span className="text-xs text-white/50">+{selected.length - 6} more</span>}
              </div>
            </div>

            {/* Lobby controls */}
            <div className="mt-3 rounded-xl bg-black/25 border border-white/10 p-3">
              <div className="text-xs font-semibold mb-2">Table</div>
              <div className="flex gap-2">
                <button
                  onClick={leaveSeat}
                  disabled={!myRow}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold ${
                    !myRow ? "bg-white/5 border border-white/10 text-white/40" : "bg-white/10 hover:bg-white/15"
                  }`}
                >
                  Leave seat
                </button>
                <button
                  onClick={startRound}
                  disabled={seatedPlayers.length < 2}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold ${
                    seatedPlayers.length < 2 ? "bg-white/5 border border-white/10 text-white/40" : "bg-amber-500 hover:bg-amber-400 text-black"
                  }`}
                >
                  Start round
                </button>
              </div>
              <div className="mt-2 text-[11px] text-white/60">
                Need 2+ seated. Best on desktop; mobile also works with horizontal hand scroll.
              </div>
            </div>

            {/* Winner */}
            {ses?.stage === "finished" && (
              <div className="mt-3 rounded-xl bg-emerald-600/20 border border-emerald-400/30 p-3">
                <div className="text-xs text-white/70">Winner</div>
                <div className="text-sm font-bold">{ses.winner_name || `Seat ${(ses.winner_seat ?? 0) + 1}`}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
