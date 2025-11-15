// games-online/LudoMP.js
// Single entry: Ludo game with mode selector:
//  - Online MP (Supabase, 2-4 players)
//  - Vs Bot (local, 1v1)
// Uses lib/ludoEngine.js

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  createInitialBoard,
  listMovablePieces,
  applyMove,
  nextTurnSeat,
  LUDO_PIECES_PER_PLAYER,
  LUDO_TRACK_LEN,
  LUDO_HOME_LEN,
  toGlobalIndex,
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
function currentVaultBalance(externalValue) {
  const val = Number(externalValue);
  if (!Number.isNaN(val) && val > 0) return val;
  return readVault();
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
      <div className="flex-1 min-h-0">
        {mode === "online" ? (
          <LudoOnline
            roomId={roomId}
            playerName={playerName}
            vault={vault}
            tierCode={tierCode}
            onBackToMode={() => setMode(null)}
          />
        ) : (
          <LudoVsBot vault={vault} onBackToMode={() => setMode(null)} />
        )}
      </div>
    </div>
  );
}

// =================== ONLINE MULTIPLAYER ===================

function LudoOnline({ roomId, playerName, vault, tierCode, onBackToMode }) {
  const name = playerName || "Guest";
  const baseClientIdRef = useRef(getClientId());
  const clientId = useMemo(() => {
    if (typeof window === "undefined") return baseClientIdRef.current;
    try {
      const SESSION_KEY = "mleo_ludo_tab_id";
      let tabId = sessionStorage.getItem(SESSION_KEY);
      if (!tabId) {
        const suffix =
          window.name && window.name.startsWith("mleo-ludo-tab-")
            ? window.name
            : `mleo-ludo-tab-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
        tabId = suffix;
        sessionStorage.setItem(SESSION_KEY, tabId);
        window.name = suffix;
      }
      return `${baseClientIdRef.current}::${tabId}`;
    } catch (err) {
      console.warn("LudoMP tab id error:", err);
      return baseClientIdRef.current;
    }
  }, []);
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
  const board = ses?.board_state || null;
  const current = ses?.current || {};
  const doubleState = current.__double__ || DEFAULT_DOUBLE_STATE;
  const currentPot = useMemo(() => {
    if (!current) return minRequired;
    const dblValue = current.__double__?.value || 1;
    const entry = current.__entry__ ?? minRequired;
    const playerCount = board?.activeSeats?.length || 0;
    return entry * playerCount * dblValue;
  }, [current, board, minRequired]);
  const myRow = players.find((p) => p.client_id === clientId) || null;
  const mySeat = myRow?.seat_index ?? null;

  const ensureSession = useCallback(
    async (room) => {
      // 1) מנסים למצוא כל ה-sessions של החדר הזה
      const { data: rows, error: fetchErr } = await supabase
        .from("ludo_sessions")
        .select("*")
        .eq("room_id", room)
        .order("id", { ascending: true });

      if (fetchErr) {
        console.error("ensureSession fetchErr:", fetchErr);
      }

      if (rows && rows.length > 0) {
        // תמיד עובדים רק עם ה-session הראשון (הוותיק)
        const primary = rows[0];
        const extraIds = rows.slice(1).map((r) => r.id);

        // אם בטעות נוצרו עוד sessions לאותו חדר – מעבירים אליהם שחקנים ומוחקים אותם
        if (extraIds.length > 0) {
          try {
            // מעבירים את כל השחקנים לשורה הראשית
            await supabase
              .from("ludo_players")
              .update({ session_id: primary.id })
              .in("session_id", extraIds);

            // מוחקים את ה-sessions המיותרים
            await supabase
              .from("ludo_sessions")
              .delete()
              .in("id", extraIds);
          } catch (mergeErr) {
            console.error("ensureSession mergeErr:", mergeErr);
          }
        }

        return primary;
      }

      // 2) אם אין בכלל session לחדר הזה – יוצרים אחד חדש
      const baseSession = {
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
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("ludo_sessions")
        .insert(baseSession)
        .select()
        .single();

      if (insertErr && !inserted) {
        // במקרה של מירוץ (race) – מישהו אחר כבר יצר session → לוקחים את הוותיק
        console.error("ensureSession insertErr:", insertErr);
        const { data: rows2 } = await supabase
          .from("ludo_sessions")
          .select("*")
          .eq("room_id", room)
          .order("id", { ascending: true });
        return rows2?.[0] ?? null;
      }

      return inserted;
    },
    [tierCode]
  );

  // sessions channel – תמיד עובדים רק עם ה-session הראשי לחדר (ensureSession)
  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;

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
          // בכל שינוי – דואגים שקיים רק session אחד ומעדכנים את כולם עליו
          const primary = await ensureSession(roomId);
          if (!cancelled) {
            setSes(primary || null);
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          // גם בעת החיבור הראשון – מאחדים sessions לחדר ומחזירים את הראשי
          const primary = await ensureSession(roomId);
          if (!cancelled) {
            setSes(primary || null);
          }
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });

    return () => {
      cancelled = true;
      ch.unsubscribe();
    };
  }, [roomId, name, ensureSession]);

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

  // 🔵 סנכרון session מהשרת כל ~1.5 שניות
  useEffect(() => {
    if (!ses?.id) return;

    let cancelled = false;

    const interval = setInterval(async () => {
      if (cancelled) return;
      await fetchSession(); // מביא את מצב המשחק המעודכן (stage, board_state וכו')
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ses?.id]);

  // 🔵 Auto-roll: בכל פעם שזה התור שלי ואין קובייה – זורק אוטומטית אחרי השהייה קצרה
  useEffect(() => {
    if (!ses || ses.stage !== "playing") return;

    const b = ses.board_state || {};
    const turnSeat = b.turnSeat ?? ses.current_turn;

    // רק אם זה התור שלי
    if (mySeat == null || mySeat !== turnSeat) return;

    // אם כבר יש dice – לא לזרוק שוב
    if (b.dice != null) return;

    // השהייה קטנה לפני הזריקה (כדי שמי שעוקב יראה שהגיע תור חדש)
    const timer = setTimeout(() => {
      // אותה פונקציית doRoll קיימת כבר למעלה
      doRoll();
    }, 800); // אם אתה רוצה 2 שניות – תחליף ל-2000

    return () => clearTimeout(timer);
  }, [ses?.id, ses?.stage, ses?.board_state, ses?.current_turn, mySeat]);

  async function fetchSession() {
    if (!ses?.id) return null;
    const { data, error } = await supabase
      .from("ludo_sessions")
      .select("*")
      .eq("id", ses.id)
      .single();

    if (error) {
      console.error("fetchSession error:", error);
      return null;
    }

    if (data) setSes(data);
    return data;
  }

  async function autoAct() {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;

    const b = s.board_state || {};
    const turnSeat = b.turnSeat ?? s.current_turn;

    // רק מי שבתורו מבצע אוטומציה
    if (mySeat == null || mySeat !== turnSeat) return;

    // אין קובייה → זורק אוטומטית
    if (!b.dice) {
      await doRoll();
      return;
    }

    // יש קובייה – בודק אם יש מהלך חוקי
    const moves = listMovablePieces(b, turnSeat, b.dice);

    // אין אף מהלך → מחכים ~2 שניות ואז מדלגים תור
    if (!moves.length) {
      setTimeout(() => {
        endTurn(b);
      }, 2000); // 2 שניות כדי לראות את הקובייה
      return;
    }

    // יש מהלכים → רק מרענן דד־ליין, שייתן לשחקן זמן להזיז
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

  const takeSeat = useCallback(
    async (seatIndex) => {
    if (!clientId) {
        setMsg("Client not recognized");
        return;
      }
      if (currentVaultBalance(vault) < minRequired) {
        setMsg(`Minimum buy-in is ${fmt(minRequired)}`);
        return;
      }
      let session = ses;
      if (!session || !session.id) {
        session = await ensureSession(roomId);
        setSes(session);
      }
      // אם הגענו לפה ועדיין אין session -> נצא עם הודעה במקום לקרוס
      if (!session || !session.id) {
        setMsg("Failed to create or load game session");
        return;
      }
      // אם קיימות רשומות ישנות עם ה-ID הישן (ללא סיומת), נעדכן אותן ל-ID של הטאב הנוכחי
      await supabase
        .from("ludo_players")
        .update({ client_id: clientId })
        .eq("session_id", session.id)
        .eq("client_id", baseClientIdRef.current);
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

      // 🔴 רענון לוקאלי של רשימת השחקנים – גם בלי Realtime
      const { data: updatedPlayers, error: playersErr } = await supabase
        .from("ludo_players")
        .select("*")
        .eq("session_id", session.id)
        .order("seat_index");

      if (playersErr) {
        console.error("takeSeat fetch players error:", playersErr);
      } else {
        setPlayers(updatedPlayers || []);
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

    // 🟣 שלב 1: לקרוא רשימת שחקנים עדכנית מה-DB (לא מה-state המקומי)
    const { data: freshPlayers, error: freshErr } = await supabase
      .from("ludo_players")
      .select("*")
      .eq("session_id", ses.id)
      .order("seat_index");

    if (freshErr) {
      console.error("startGame freshPlayers error:", freshErr);
      setMsg("Failed to read players from server");
      return;
    }

    // לעדכן גם את ה-state, כדי שהמסך יהיה מסונכרן
    setPlayers(freshPlayers || []);

    const seated = (freshPlayers || []).filter((p) => p.seat_index != null);

    if (seated.length < 2) {
      setMsg("Need at least 2 players seated");
      return;
    }

    const vaultNow = currentVaultBalance(vault);
    const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;

    if (vaultNow < minRequired) {
      setMsg(`Need at least ${fmt(minRequired)} in vault`);
      return;
    }

    // 🟣 שלב 2: קביעת ה-seats הפעילים
    const activeSeats = [...new Set(seated.map((p) => p.seat_index))].sort(
      (a, b) => a - b
    );
    const initialBoard = createInitialBoard(activeSeats);
    const entry = minRequired;

    // 🟣 שלב 3: הורדת הבאי-אין מהארנק למי שמחובר מהמכשיר הזה
    if (mySeat != null && vaultNow >= entry) {
      writeVault(vaultNow - entry);
    }

    // 🟣 שלב 4: עדכון session ל-"playing"
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
      console.error("startGame update session error:", error);
      setMsg(error.message || "Failed to start game");
    } else {
      setSes(data);
      setMsg("");
    }
  }, [isLeader, ses?.id, vault, tierCode, mySeat]);

  async function doRoll() {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;

    const b = s.board_state || {};
    const turnSeat = b.turnSeat ?? s.current_turn;

    // רק מי שבתורו זורק
    if (mySeat == null || mySeat !== turnSeat) return;

    // כבר יש קובייה? אי אפשר שוב
    if (b.dice != null) return;

    const dice = 1 + Math.floor(Math.random() * 6);
    const next = { ...b, dice, lastDice: dice };

    // קודם שומרים את מצב הקובייה ב-DB
    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        board_state: next,
        turn_deadline: new Date(Date.now() + TURN_SECONDS * 1000).toISOString(),
      })
      .eq("id", s.id)
      .select()
      .single();

    if (error) {
      console.error("doRoll error:", error);
      return;
    }

    // מעדכנים state מקומי
    setSes(data);

    // בודקים אם יש בכלל מהלך חוקי עם הקובייה הזו
    const moves = listMovablePieces(next, turnSeat, dice);

    // אין אף מהלך חוקי – נותנים לראות את הקובייה ~2 שניות ואז עוברים תור
    if (!moves.length) {
      setTimeout(() => {
        endTurn(next);
      }, 2000); // 2 שניות
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
    if (activeSeats.length < 2) return false;
    if (mySeat == null || mySeat !== (b.turnSeat ?? ses.current_turn)) return false;
    if (b.dice == null) return false;
    const dbl = ses.current?.__double__ || { proposed_by: null, awaiting: null, locks: {} };
    if (dbl.proposed_by != null || dbl.awaiting != null) return false;
    if (dbl.locks?.[mySeat]) return false;
    return true;
  }, [ses, mySeat]);

  async function offerDouble() {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const b = s.board_state || {};
    const activeSeats = b.activeSeats || [];
    if (mySeat == null || mySeat !== (b.turnSeat ?? s.current_turn)) return;
    if (b.dice == null) {
      setMsg("Roll the dice before doubling");
      return;
    }
    const current = s.current || {};
    const dbl = current.__double__ || DEFAULT_DOUBLE_STATE;
    if (dbl.proposed_by != null || dbl.awaiting != null) {
      setMsg("Another double proposal is pending");
      return;
    }
    if (dbl.locks?.[mySeat]) {
      setMsg("You already proposed double this round");
      return;
    }

    const locks = { ...(dbl.locks || {}), [mySeat]: true };
    const others = activeSeats.filter((seat) => seat !== mySeat);
    if (!others.length) {
      setMsg("No opponent to respond");
      return;
    }
    const [nextSeat, ...rest] = others;

    const nextDouble = {
      value: dbl.value || 1,
      proposed_by: mySeat,
      awaiting: nextSeat,
      pending: rest,
      locks,
      expires_at: Date.now() + 30_000,
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
    const dbl = current.__double__ || { value: 1, proposed_by: null, awaiting: null, locks: {}, expires_at: null };
    if (dbl.awaiting == null || mySeat == null || mySeat !== dbl.awaiting) return;

    if (answer === "decline") {
      const b = s.board_state || {};
      const nextBoard = { ...b, winner: dbl.proposed_by };
      await finishGame(nextBoard);
      return;
    }

    if (answer === "accept") {
      const b = s.board_state || {};
      const activeSeats = b.activeSeats || [];
      const locks = dbl.locks || {};
      const pending = dbl.pending || [];

      if (pending.length > 0) {
        const [nextSeat, ...rest] = pending;
        const nextDouble = {
          ...dbl,
          awaiting: nextSeat,
          pending: rest,
          expires_at: Date.now() + 30_000,
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
        return;
      }

      const allLocked = activeSeats.every((seat) => locks[seat]);

      const nextDouble = allLocked
        ? { ...DEFAULT_DOUBLE_STATE, value: (dbl.value || 1) * 2 }
        : { ...DEFAULT_DOUBLE_STATE, value: dbl.value || 1, locks };
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

  async function handleDoubleTimeout(expiredSeat) {
    const s = await fetchSession();
    if (!s || s.stage !== "playing") return;
    const current = s.current || {};
    const dbl = current.__double__ || { awaiting: null };
    if (dbl.awaiting !== expiredSeat) return;

    const b = s.board_state || {};
    const activeSeats = b.activeSeats || [];

    if (activeSeats.length <= 2) {
      const winnerSeat = dbl.proposed_by ?? activeSeats.find((seat) => seat !== expiredSeat) ?? null;
      const nextBoard = { ...b, winner: winnerSeat };
      await finishGame(nextBoard);
      return;
    }

    const updatedActive = activeSeats.filter((seat) => seat !== expiredSeat);
    const nextBoard = {
      ...b,
      activeSeats: updatedActive,
      pieces: { ...(b.pieces || {}) },
      finished: { ...(b.finished || {}) },
    };
    delete nextBoard.pieces[String(expiredSeat)];
    delete nextBoard.finished[String(expiredSeat)];
    if (!updatedActive.includes(nextBoard.turnSeat)) {
      nextBoard.turnSeat = updatedActive[0] ?? null;
    }

    const nextDouble = { ...DEFAULT_DOUBLE_STATE, value: dbl.value || 1 };
    const nextCurrent = { ...current, __double__: nextDouble };

    const { data, error } = await supabase
      .from("ludo_sessions")
      .update({
        board_state: nextBoard,
        current_turn: nextBoard.turnSeat,
        turn_deadline:
          nextBoard.turnSeat != null ? new Date(Date.now() + TURN_SECONDS * 1000).toISOString() : null,
        current: nextCurrent,
      })
      .eq("id", s.id)
      .select()
      .single();
    if (!error && data) {
      setSes(data);
      setMsg(`Seat ${expiredSeat + 1} forfeited double response`);
    }
  }

  useEffect(() => {
    if (!doubleState.awaiting || !doubleState.expires_at) return undefined;
    const ms = doubleState.expires_at - Date.now();
    if (ms <= 0) {
      handleDoubleTimeout(doubleState.awaiting);
      return undefined;
    }
    const timer = setTimeout(() => {
      handleDoubleTimeout(doubleState.awaiting);
    }, ms);
    return () => clearTimeout(timer);
  }, [doubleState.awaiting, doubleState.expires_at]);

  useEffect(() => {
    if (!doubleState.awaiting || !doubleState.expires_at) {
      setDoubleCountdown(null);
      return undefined;
    }
    const update = () => {
      setDoubleCountdown(Math.max(0, Math.ceil((doubleState.expires_at - Date.now()) / 1000)));
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [doubleState.awaiting, doubleState.expires_at]);

  if (!roomId) {
    return (
      <div className="w-full h-full grid place-items-center text-white/70 text-sm">
        Select or create a room.
      </div>
    );
  }

  const seats = 4;
  const inMatch = ses?.stage === "playing" && !!board;
  const liveTurnSeat = board?.turnSeat ?? ses?.current_turn ?? null;
  const { displayValue: diceDisplayValue, rolling: diceRolling } = useDiceRollAnimation(
    board?.dice ?? board?.lastDice ?? null
  );
  const controlBtnBase =
    "inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full border font-semibold text-[11px] uppercase tracking-wide shadow-md shadow-black/40 transition focus:outline-none focus:ring-2 focus:ring-white/30";
  const [doubleCountdown, setDoubleCountdown] = useState(null);

  return (
    <div className="w-full h-full flex flex-col gap-2 text-white" style={{ minHeight: '600px', height: '100%' }}>
      {/* Seats */}
      <div className="w-full overflow-x-auto">
        <div className="flex gap-2 text-[11px] min-w-[480px]">
        {Array.from({ length: seats }).map((_, idx) => {
          const row = seatMap.get(idx) || null;
          const isMe = row?.client_id === clientId;
          const seatColor = SEAT_HEX_COLORS[idx] || "rgba(255,255,255,0.1)";
          const isTurnSeat = liveTurnSeat === idx;
          return (
            <button
              key={idx}
              onClick={() => takeSeat(idx)}
              className={`border rounded-md px-2 py-1 flex flex-col items-center justify-center text-xs font-semibold transition flex-1 ${
                isMe
                  ? "border-white shadow-inner shadow-white/50"
                  : "border-white/30 shadow"
              } ${isTurnSeat ? "ring-2 ring-amber-300 animate-pulse" : ""}`}
              style={{
                background: `linear-gradient(135deg, ${seatColor}dd, ${seatColor}aa)`,
                color: "white",
                textShadow: "0 1px 2px rgba(0,0,0,0.7)",
              }}
            >
              <span className="font-semibold">{`Seat ${idx + 1}`}</span>
              <span className="text-white/70">
                {row?.player_name || "Empty"}
                {isMe ? " (You)" : ""}
              </span>
            </button>
          );
        })}
        </div>
      </div>
      {/* Board + Controls */}
      <div className="flex-1 min-h-[400px] h-full bg-black/40 rounded-lg p-3 flex flex-col gap-3 overflow-hidden" style={{ minHeight: '500px', height: '100%' }}>
        <div className="flex-1 h-full overflow-hidden" style={{ minHeight: '400px', height: '100%' }}>
          {board ? (
            <LudoBoard
              board={board}
              onPieceClick={onPieceClick}
              mySeat={mySeat}
              showSidebar={!inMatch}
              disableHighlights={diceRolling}
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-white/60 text-sm">
              Game not started yet.
            </div>
          )}
        </div>

        <div className="w-full text-xs flex flex-col gap-2 items-center">
          <div className="flex justify-center items-center flex-wrap gap-2">
            {msg && <span className="text-amber-300 text-center">{msg}</span>}
          </div>
          <div className="flex gap-2 items-center justify-center w-full flex-wrap">
            {mySeat != null && (
              <button
                onClick={leaveSeat}
                className={`${controlBtnBase} border-red-300/70 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 whitespace-nowrap flex-shrink-0`}
              >
                Leave seat
              </button>
            )}
            <button
              onClick={startGame}
              className={`${controlBtnBase} border-emerald-300/70 bg-gradient-to-r from-emerald-600 to-lime-500 hover:from-emerald-500 hover:to-lime-400 whitespace-nowrap flex-shrink-0`}
            >
              Start game
            </button>
            <button
              onClick={offerDouble}
              disabled={!canOfferDouble}
              className={`${controlBtnBase} border-amber-300/70 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0`}
            >
              Double x{doubleState.value ?? 1}
            </button>
            <div className="flex-shrink-0">
              <DiceDisplay
                displayValue={diceDisplayValue}
                rolling={diceRolling}
                seat={board?.dice != null ? board?.turnSeat : liveTurnSeat}
              />
            </div>
            {doubleState.awaiting != null && (
              <span className="text-amber-200 text-[10px] whitespace-nowrap flex-shrink-0">
                Waiting Seat {doubleState.awaiting + 1}
                {doubleCountdown != null ? ` • ${doubleCountdown}s` : ""}
              </span>
            )}
            {doubleState.awaiting === mySeat && (
              <>
                <button
                  onClick={() => respondDouble("accept")}
                  className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 whitespace-nowrap flex-shrink-0"
                >
                  Accept
                </button>
                <button
                  onClick={() => respondDouble("decline")}
                  className="px-3 py-1 rounded bg-red-600/80 hover:bg-red-500 whitespace-nowrap flex-shrink-0"
                >
                  Decline
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full bg-black/40 rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-semibold">Ludo Online</span>
          {roomId && (
            <span className="text-white/60">Room: {roomId.slice(0, 8)}…</span>
          )}
          <span className="text-white/60">Pot: {fmt(currentPot)} </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-xs">Vault: {fmt(vault)}</span>
          {onBackToMode && (
            <button
              onClick={onBackToMode}
              className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
            >
              Mode
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

// =================== VS BOT (LOCAL) ===================

function LudoVsBot({ vault, onBackToMode }) {
  const [board, setBoard] = useState(() => createInitialBoard([0, 1]));
  const [stage, setStage] = useState("lobby"); // 'lobby' | 'playing' | 'finished'
  const [msg, setMsg] = useState("");
  const [deadline, setDeadline] = useState(null);

  const buyIn = 1000;
  const vaultBalance = vault;
  const mySeat = 0;
  const botSeat = 1;
  const playingNow = stage === "playing";
  const { displayValue: diceDisplayValue, rolling: diceRolling } = useDiceRollAnimation(
    board.dice ?? board.lastDice ?? null
  );

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
    if (turnSeat !== mySeat) return;     // רק אתה זורק
    if (board.dice != null) return;      // כבר נזרקה קובייה

    const dice = 1 + Math.floor(Math.random() * 6);
    const nextBoard = { ...board, dice, lastDice: dice };

    // מעדכן את הלוח + דד־ליין רגיל
    setBoard(nextBoard);
    setDeadline(Date.now() + TURN_SECONDS * 1000);
    setMsg("");

    // בדיקה אם יש בכלל מהלך חוקי
    const moves = listMovablePieces(nextBoard, mySeat, dice);

    if (!moves.length) {
      // אין שום כלי שיכול לזוז → אחרי ~2 שניות עוברים תור
      setTimeout(() => {
        setBoard((prev) => {
          // שמירה ממצב לא עדכני
          if (
            prev !== nextBoard ||          // כבר נעשה שינוי אחר
            prev.turnSeat !== mySeat ||    // כבר לא התור שלך
            prev.dice !== dice ||          // הקובייה השתנתה
            stage !== "playing"
          ) {
            return prev;
          }

          const b2 = { ...prev, dice: null, lastDice: dice };
          b2.turnSeat = nextTurnSeat(b2);
          return b2;
        });
        setDeadline(Date.now() + TURN_SECONDS * 1000);
      }, 1800); // ~1.8 שניות – בתוך הטווח של 2–3 ששאלת
    }
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

  return (
    <div className="w-full h-full flex flex-col gap-2 text-white">
      <div className="flex gap-2 items-center text-xs flex-wrap">
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
        <DiceDisplay
          displayValue={diceDisplayValue}
          rolling={diceRolling}
          seat={board.dice != null ? board.turnSeat : board.turnSeat}
        />
      </div>

      <div className="text-xs text-white/80 bg-black/40 rounded px-3 py-2 flex items-center justify-between gap-2">
        <div />
        {msg && <span className="text-amber-300">{msg}</span>}
      </div>

      <div className="flex-1 min-h-[400px] h-full bg-black/40 rounded-lg p-3 overflow-hidden" style={{ minHeight: '500px', height: '100%' }}>
        <div className="w-full h-full" style={{ minHeight: '400px', height: '100%' }}>
          <LudoBoard
            board={board}
            mySeat={mySeat}
            onPieceClick={onPieceClick}
            showSidebar={!playingNow}
            disableHighlights={diceRolling}
          />
        </div>
      </div>

      <div className="w-full bg-black/40 rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-semibold">Ludo vs Bot</span>
          <span className="text-white/60">Buy-in: {fmt(buyIn)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-xs">Vault: {fmt(readVault())}</span>
          {onBackToMode && (
            <button
              onClick={onBackToMode}
              className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs"
            >
              Mode
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =================== BOARD COMPONENTS ===================

// ===== Helpers for board projection =====
const START_OFFSETS = [0, 13, 26, 39]; // נקודת התחלה לכל צבע על המסלול
const BOARD_SIZE_EXPR = "clamp(520px, min(96vw, 96vh), 820px)";
const TRACK_RADIUS = 36;
const SEAT_HEX_COLORS = ["#ef4444", "#38bdf8", "#22c55e", "#fbbf24"];
const SEAT_COLOR_LABELS = ["RED", "BLUE", "GREEN", "YELLOW"];
const FINISH_FLASH_MS = 2200;
const DEFAULT_DOUBLE_STATE = {
  value: 1,
  proposed_by: null,
  awaiting: null,
  pending: [],
  locks: {},
  expires_at: null,
};

function lightenColor(hex, factor = 0.25) {
  const normalized = hex?.replace("#", "") ?? "ffffff";
  if (normalized.length !== 6) return hex || "#ffffff";
  const num = parseInt(normalized, 16);
  const r = Math.min(255, Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * factor));
  const g = Math.min(255, Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * factor));
  const b = Math.min(255, Math.round((num & 0xff) + (255 - (num & 0xff)) * factor));
  return `rgb(${r}, ${g}, ${b})`;
}
const YARD_POSITIONS = [
  [
    { x: 6, y: 94 },
    { x: 14, y: 94 },
    { x: 6, y: 86 },
    { x: 14, y: 86 },
  ],
  [
    { x: 86, y: 6 },
    { x: 94, y: 6 },
    { x: 86, y: 14 },
    { x: 94, y: 14 },
  ],
  [
    { x: 6, y: 6 },
    { x: 14, y: 6 },
    { x: 6, y: 14 },
    { x: 14, y: 14 },
  ],
  [
    { x: 86, y: 86 },
    { x: 94, y: 86 },
    { x: 86, y: 94 },
    { x: 94, y: 94 },
  ],
];

function projectGlobalTrackCell(globalIndex) {
  const safeIdx = ((globalIndex % LUDO_TRACK_LEN) + LUDO_TRACK_LEN) % LUDO_TRACK_LEN;
  const angle = (safeIdx / LUDO_TRACK_LEN) * 2 * Math.PI;
  const x = 50 + TRACK_RADIUS * Math.cos(angle);
  const y = 50 + TRACK_RADIUS * Math.sin(angle);
  return { x, y };
}

function describePieceProgress(seat, pos) {
  const totalPath = LUDO_TRACK_LEN + LUDO_HOME_LEN;
  if (pos < 0) {
    return {
      label: "Yard",
      detail: "Roll 6 to launch",
      progress: 0,
      state: "yard",
    };
  }
  if (pos >= totalPath) {
    return {
      label: "Finished",
      detail: "Safe at home",
      progress: 1,
      state: "finished",
    };
  }
  const normalizedProgress = Math.min(1, Math.max(0, pos / totalPath));
  if (pos >= LUDO_TRACK_LEN) {
    const homeIndex = pos - LUDO_TRACK_LEN;
    return {
      label: `Home ${homeIndex + 1}/${LUDO_HOME_LEN}`,
      detail: `${Math.max(0, LUDO_HOME_LEN - homeIndex - 1)} left`,
      progress: normalizedProgress,
      state: "home",
    };
  }
  const globalIndex = toGlobalIndex(seat, pos);
  return {
    label: `Track ${globalIndex != null ? globalIndex + 1 : pos + 1}`,
    detail: `${totalPath - pos} steps to finish`,
    progress: normalizedProgress,
    globalIndex,
    state: "track",
  };
}

function formatSeatLabel(seat) {
  if (seat == null || Number.isNaN(seat)) return "Seat ?";
  const idx = Math.max(0, Number(seat));
  const seatNumber = idx + 1;
  const color = SEAT_COLOR_LABELS[idx];
  return color ? `Seat ${seatNumber} — ${color}` : `Seat ${seatNumber}`;
}

function useDiceRollAnimation(value) {
  const [displayValue, setDisplayValue] = useState(value ?? null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (value == null) return;

    setRolling(true);
    setDisplayValue(value);

    const interval = setInterval(() => {
      setDisplayValue(1 + Math.floor(Math.random() * 6));
    }, 120);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayValue(value);
      setRolling(false);
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [value]);

  return { displayValue, rolling };
}

function useFinishFlash(activeSeats, pieces) {
  const prevPositionsRef = useRef(new Map());
  const finishFlashRef = useRef(new Map());
  const finishTimeoutsRef = useRef(new Map());
  const [, forceFlashTick] = useState(0);

  const positionsSignature = useMemo(() => {
    return activeSeats
      .map((seat) => {
        const arr = pieces[String(seat)] || [];
        return `${seat}:${arr.join(",")}`;
      })
      .join("|");
  }, [activeSeats, pieces]);

  useEffect(() => {
    const totalPath = LUDO_TRACK_LEN + LUDO_HOME_LEN;
    const prev = prevPositionsRef.current;
    const next = new Map();
    const newFinishes = [];

    activeSeats.forEach((seat) => {
      const seatPieces = pieces[String(seat)] || [];
      seatPieces.forEach((pos, idx) => {
        const key = `${seat}-${idx}`;
        next.set(key, pos);
        const prevPos = prev.get(key);
        if ((prevPos == null || prevPos < totalPath) && pos >= totalPath) {
          newFinishes.push(key);
        }
      });
    });

    prevPositionsRef.current = next;

    newFinishes.forEach((key) => {
      if (finishFlashRef.current.has(key)) return;
      finishFlashRef.current.set(key, true);
      forceFlashTick((n) => n + 1);
      const timeoutId = setTimeout(() => {
        finishFlashRef.current.delete(key);
        finishTimeoutsRef.current.delete(key);
        forceFlashTick((n) => n + 1);
      }, FINISH_FLASH_MS);
      finishTimeoutsRef.current.set(key, timeoutId);
    });

    Array.from(finishFlashRef.current.keys()).forEach((key) => {
      const pos = next.get(key);
      if (pos == null || pos < totalPath) {
        finishFlashRef.current.delete(key);
        const timeoutId = finishTimeoutsRef.current.get(key);
        if (timeoutId) {
          clearTimeout(timeoutId);
          finishTimeoutsRef.current.delete(key);
        }
      }
    });
  }, [positionsSignature, activeSeats, pieces]);

  useEffect(() => {
    return () => {
      finishTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      finishTimeoutsRef.current.clear();
    };
  }, []);

  return useCallback(
    (seat, idx, isFinished) => {
      if (!isFinished) return true;
      return finishFlashRef.current.has(`${seat}-${idx}`);
    },
    []
  );
}

function DiceDisplay({ displayValue, rolling, seat }) {
  const dots = displayValue ?? 1;
  const color = SEAT_HEX_COLORS[seat] || "#f8fafc";
  const highlight = lightenColor(color, 0.45);

  return (
    <div className="flex items-center gap-1 sm:gap-2 text-white">
      <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
        <div
          className={`absolute inset-0 rounded-2xl border-2 shadow-lg shadow-black/40 transition ${
            rolling ? "animate-pulse" : ""
          }`}
          style={{
            borderColor: color,
            background: `linear-gradient(145deg, ${highlight}, ${color})`,
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-lg sm:text-xl font-black text-black drop-shadow">
          {dots}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-white/80">
        {rolling ? "Rolling..." : "Dice"}
      </span>
    </div>
  );
}

function projectPieceOnBoard(seat, pos, pieceIndex = 0) {
  if (pos < 0) {
    const yardOptions = YARD_POSITIONS[seat];
    if (yardOptions && yardOptions.length) {
      const yardPoint = yardOptions[pieceIndex % yardOptions.length];
      if (yardPoint) {
        return { kind: "yard", x: yardPoint.x, y: yardPoint.y };
      }
    }
    return { kind: "yard", x: 50, y: 50 };
  }

  if (pos >= LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    return { kind: "home", x: 50, y: 50 };
  }

  if (pos >= LUDO_TRACK_LEN) {
    const entryIdx = START_OFFSETS[seat] ?? 0;
    const entryPoint = projectGlobalTrackCell(entryIdx);
    const homeIndex = pos - LUDO_TRACK_LEN; // 0..5
    const t = (homeIndex + 1) / (LUDO_HOME_LEN + 1);
    const x = entryPoint.x + (50 - entryPoint.x) * t;
    const y = entryPoint.y + (50 - entryPoint.y) * t;
    return { kind: "home-stretch", x, y };
  }

  const offset = START_OFFSETS[seat] ?? 0;
  const globalIndex = (offset + pos) % LUDO_TRACK_LEN;
  const point = projectGlobalTrackCell(globalIndex);

  return { kind: "track", ...point, globalIndex };
}

function LudoBoard({ board, onPieceClick, mySeat, showSidebar = true, disableHighlights = false }) {
  const active = board.activeSeats || [];
  const pieces = board.pieces || {};
  const colorClasses = ["bg-red-500", "bg-sky-500", "bg-emerald-500", "bg-amber-400"];
  const shouldRenderFinishedPiece = useFinishFlash(active, pieces);
  const trackLayout = useMemo(
    () =>
      Array.from({ length: LUDO_TRACK_LEN }, (_, idx) => ({
        idx,
        ...projectGlobalTrackCell(idx),
      })),
    []
  );
  const homeSegments = useMemo(() => {
    const segments = [];
    START_OFFSETS.forEach((startIdx, seat) => {
      const entry = projectGlobalTrackCell(startIdx);
      for (let i = 0; i < LUDO_HOME_LEN; i += 1) {
        const t = (i + 1) / (LUDO_HOME_LEN + 1);
        segments.push({
          seat,
          idx: i,
          x: entry.x + (50 - entry.x) * t,
          y: entry.y + (50 - entry.y) * t,
        });
      }
    });
    return segments;
  }, []);
  const trackOccupancy = useMemo(() => {
    const map = new Map();
    active.forEach((seat) => {
      const seatPieces = pieces[String(seat)] || [];
      seatPieces.forEach((pos, pieceIdx) => {
        if (pos >= 0 && pos < LUDO_TRACK_LEN) {
          const globalIndex = toGlobalIndex(seat, pos);
          if (globalIndex != null) {
            if (!map.has(globalIndex)) map.set(globalIndex, []);
            map.get(globalIndex).push({ seat, piece: pieceIdx });
          }
        }
      });
    });
    return map;
  }, [active, pieces]);
  const highlightTargets = useMemo(() => {
    if (board.turnSeat == null || board.dice == null) return new Set();
    const result = new Set();
    const seatPieces = pieces[String(board.turnSeat)] || [];
    const movable = listMovablePieces(board, board.turnSeat, board.dice);
    movable.forEach((pieceIdx) => {
      const pos = seatPieces[pieceIdx];
      if (pos == null) return;
      if (pos < 0) {
        const entryIdx = toGlobalIndex(board.turnSeat, 0);
        if (entryIdx != null) result.add(entryIdx);
        return;
      }
      const targetPos = pos + board.dice;
      if (targetPos < LUDO_TRACK_LEN) {
        const gi = toGlobalIndex(board.turnSeat, targetPos);
        if (gi != null) result.add(gi);
      }
    });
    return result;
  }, [board, pieces]);
  const effectiveHighlights = disableHighlights ? new Set() : highlightTargets;
  return (
    <div className="w-full h-full flex flex-col sm:flex-row gap-3" style={{ minHeight: "420px" }}>
      {/* לוח מרכזי */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className="relative rounded-2xl border-2 border-white/30 overflow-hidden bg-black shadow-2xl aspect-square"
          style={{
            width: BOARD_SIZE_EXPR,
            height: BOARD_SIZE_EXPR,
          }}
        >
          {/* שכבות רקע חדשות שמתאימות למסלול המעגלי */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#020617] to-black z-0" />
          <div className="absolute inset-4 sm:inset-6 rounded-[32px] border border-white/5 bg-white/5 blur-[1px]" />
          <div className="absolute inset-[9%] rounded-full border border-white/10 bg-black/50 shadow-inner shadow-black/70" />
          <img
            src="/images/ludo/board.png"
            alt="Ludo board"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[64%] sm:w-[70%] h-[64%] sm:h-[70%] rounded-[28px] object-contain pointer-events-none opacity-95"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />

          {/* מסלול מעגלי עם אינדיקציות */}
          <TrackOverlay
            layout={trackLayout}
            occupancy={trackOccupancy}
            highlights={effectiveHighlights}
            homeSegments={homeSegments}
          />

          {/* החיילים מעל הכל */}
          {active.map((seat) => {
          const cls = colorClasses[seat] || "bg-white";
          const seatPieces = pieces[String(seat)] || [];
          const isMe = seat === mySeat;
          const imgSrc = `/images/ludo/dog_${seat}.png`;

          return seatPieces.map((pos, idx) => {
            const proj = projectPieceOnBoard(seat, pos, idx);
            const progressInfo = describePieceProgress(seat, pos);
            if (!proj) return null;
            const isFinished = progressInfo.state === "finished";
            if (isFinished) {
              return null;
            }
            if (!shouldRenderFinishedPiece(seat, idx, isFinished)) {
              return null;
            }

            const movable =
              !disableHighlights &&
              isMe &&
              board.dice != null &&
              listMovablePieces(board, seat, board.dice).includes(idx);
            let stageText = "";
            if (progressInfo.state === "track" && progressInfo.globalIndex != null) {
              stageText = String(progressInfo.globalIndex + 1);
            } else if (progressInfo.state === "home") {
              stageText = `H${Math.max(1, pos - LUDO_TRACK_LEN + 1)}`;
            } else if (progressInfo.state === "yard") {
              stageText = "Y";
            }

            return (
              <button
                key={`${seat}-${idx}`}
                type="button"
                onClick={() => movable && onPieceClick && onPieceClick(idx)}
                className={`absolute rounded-full border-2 shadow-lg flex items-center justify-center transition-transform z-20 ${
                  movable ? "ring-2 ring-amber-300 scale-105" : ""
                }`}
                title={`Piece ${idx + 1} • ${progressInfo.label}${
                  progressInfo.detail ? ` • ${progressInfo.detail}` : ""
                }`}
                style={{
                  left: `${proj.x}%`,
                  top: `${proj.y}%`,
                  width: "9%",
                  height: "9%",
                  minWidth: '32px',
                  minHeight: '32px',
                  transform: "translate(-50%, -50%)",
                  zIndex: 20,
                  position: 'absolute'
                }}
              >
                <div className={`w-full h-full rounded-full overflow-hidden ${cls}`} style={{ position: 'relative', zIndex: 21 }}>
                  <img
                    src={imgSrc}
                    alt="piece"
                    className="w-full h-full object-cover"
                    style={{ 
                      opacity: 1,
                      visibility: 'visible',
                      display: 'block',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 21
                    }}
                    onError={(e) => {
                      console.error(`Failed to load piece image for seat ${seat}:`, imgSrc, e);
                      // אם אין תמונה – תשאר עיגול צבעוני
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  {stageText && (
                    <span
                      className="absolute left-1/2 bottom-0 translate-y-1/2 -translate-x-1/2 text-[11px] font-black text-white pointer-events-none select-none"
                      style={{ zIndex: 24, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                    >
                      {stageText}
                    </span>
                  )}
                </div>
              </button>
            );
          });
          })}
        </div>
      </div>

      {/* פאנל מצב עבור כל Seat */}
      {showSidebar && (
      <div className="w-full sm:w-56 flex flex-col gap-2 text-xs">
        {active.map((seat) => {
          const seatPieces = pieces[String(seat)] || [];
          const cls = colorClasses[seat] || "bg-white";
          const isMine = mySeat === seat;
          const isTurnSeat = board?.turnSeat === seat;

          return (
            <div
              key={seat}
              className={`border border-white/15 rounded-lg p-2 bg-black/40 flex flex-col gap-1 ${
                isTurnSeat ? "ring-2 ring-amber-300 animate-pulse" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${cls}`} />
                  <span className="font-semibold">{`Seat ${seat + 1}`}</span>
                </div>
                <span className="text-white/60 text-[11px]">
                  {board.turnSeat === seat ? "Turn" : ""}
                  {board.winner === seat && " (Winner)"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {seatPieces.map((pos, idx) => {
                  const progressInfo = describePieceProgress(seat, pos);
                  const movableIndices =
                    board.dice != null ? listMovablePieces(board, seat, board.dice) : [];
                  const pieceCanClick = isMine && movableIndices.includes(idx);
                  const progressPercent = Math.round((progressInfo.progress || 0) * 100);

                  return (
                    <button
                      key={idx}
                      onClick={() => pieceCanClick && onPieceClick && onPieceClick(idx)}
                      className={`px-2 py-1 rounded border text-[10px] flex flex-col gap-0.5 text-left transition ${
                        pieceCanClick
                          ? "border-white/60 bg-white/10 hover:bg-white/20"
                          : "border-white/20 bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Piece {idx + 1}</span>
                        <span className="text-white/60 text-[9px]">{progressInfo.label}</span>
                      </div>
                      <span className="text-white/50 text-[9px]">{progressInfo.detail}</span>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white/70"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function TrackOverlay({ layout, occupancy, highlights, homeSegments }) {
  if (!layout?.length) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div className="absolute inset-[12%] rounded-full border border-white/10" />
      {homeSegments?.map((segment) => (
        <div
          key={`home-${segment.seat}-${segment.idx}`}
          className="absolute rounded-full border border-white/20 shadow-sm"
          style={{
            left: `${segment.x}%`,
            top: `${segment.y}%`,
            width: "2.8%",
            height: "2.8%",
            minWidth: "12px",
            minHeight: "12px",
            transform: "translate(-50%, -50%)",
            backgroundColor: `${SEAT_HEX_COLORS[segment.seat]}55`,
            borderColor: `${SEAT_HEX_COLORS[segment.seat]}99`,
            boxShadow: `0 0 6px ${SEAT_HEX_COLORS[segment.seat]}55`,
          }}
        />
      ))}
      {layout.map(({ idx, x, y }) => {
        const occupants = occupancy?.get(idx) || [];
        const seatColor =
          occupants.length > 0 ? SEAT_HEX_COLORS[occupants[0].seat] || "white" : "rgba(255,255,255,0.4)";
        const size = occupants.length >= 2 ? 12 : occupants.length === 1 ? 9 : 6;
        const isHighlighted = highlights?.has(idx);
        const labelColor =
          occupants.length > 0 ? SEAT_HEX_COLORS[occupants[0].seat] || "#ffffff" : "rgba(255,255,255,0.75)";
        const dx = x - 50;
        const dy = y - 50;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const labelDist = dist + 7;
        const labelX = 50 + (dx / dist) * labelDist;
        const labelY = 50 + (dy / dist) * labelDist;
        return (
          <Fragment key={idx}>
            <div
              className="absolute flex flex-col items-center gap-0.5 transition-all duration-200"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className={`rounded-full shadow ${isHighlighted ? "ring-2 ring-amber-300" : ""}`}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: seatColor,
                  opacity: isHighlighted ? 1 : occupants.length ? 0.85 : 0.35,
                }}
              />
            </div>
            <span
              className="absolute text-[8px] sm:text-[14px] font-bold drop-shadow pointer-events-none select-none"
              style={{
                left: `${labelX}%`,
                top: `${labelY}%`,
                transform: "translate(-50%, -50%)",
                color: labelColor,
              }}
            >
              {idx + 1}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function LudoBoardLocal({ board, mySeat, onPieceClick }) {
  const pieces = board.pieces || {};
  const colorClasses = ["bg-red-500", "bg-sky-500"];

  const seats = [0, 1]; // אתה + בוט
  const shouldRenderFinishedPiece = useFinishFlash(seats, pieces);

  return (
    <div className="w-full h-full flex flex-col sm:flex-row gap-3">
      {/* לוח מרכזי */}
      <div className="flex-1 relative bg-gradient-to-br from-purple-900 via-slate-900 to-black rounded-2xl border border-white/10 overflow-hidden min-h-[260px]">
        <div className="absolute inset-[8%] bg-slate-900/80 rounded-2xl border border-white/10" />

        {/* בסיס תחתון (אתה) + עליון (בוט) */}
        <div className="absolute left-[6%] bottom-[6%] w-[22%] h-[22%] rounded-xl bg-red-600/35 border border-red-400/60" />
        <div className="absolute right-[6%] top-[6%] w-[22%] h-[22%] rounded-xl bg-sky-500/35 border border-sky-300/60" />

        {/* מרכז */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[26%] h-[26%] rounded-2xl bg-black/80 border border-white/30 flex items-center justify-center">
          <span className="text-[11px] sm:text-xs text-white/80 font-semibold">
            Ludo vs Bot
          </span>
        </div>

        {/* כלים */}
        {seats.map((seat) => {
          const seatPieces = pieces[String(seat)] || [];
          const cls = colorClasses[seat] || "bg-white";
          const imgSrc = `/images/ludo/dog_${seat}.png`;
          const isPlayer = seat === mySeat;

          return seatPieces.map((pos, idx) => {
            const proj = projectPieceOnBoard(seat, pos, idx);
            const progressInfo = describePieceProgress(seat, pos);
            const isFinished = progressInfo.state === "finished";
            if (isFinished) {
              return null;
            }
            if (!shouldRenderFinishedPiece(seat, idx, isFinished)) {
              return null;
            }

            // חישוב אם החייל הזה חוקי להזזה עם הקובייה הנוכחית
            const movableIndices =
              board.dice != null ? listMovablePieces(board, seat, board.dice) : [];
            const pieceCanClick = isPlayer && movableIndices.includes(idx);
            let stageText = "";
            if (progressInfo.state === "track" && progressInfo.globalIndex != null) {
              stageText = String(progressInfo.globalIndex + 1);
            } else if (progressInfo.state === "home") {
              stageText = `H${Math.max(1, pos - LUDO_TRACK_LEN + 1)}`;
            } else if (progressInfo.state === "yard") {
              stageText = "Y";
            }

            return (
              <button
                key={`${seat}-${idx}`}
                type="button"
                onClick={() => pieceCanClick && onPieceClick && onPieceClick(idx)}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${proj.x}%`, top: `${proj.y}%` }}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 shadow-lg flex items-center justify-center ${
                    pieceCanClick
                      ? "border-yellow-400 ring-2 ring-yellow-400/50"
                      : isPlayer
                      ? "border-white"
                      : "border-black/60"
                  }`}
                >
                  <div
                    className={`w-full h-full rounded-full overflow-hidden ${cls} flex items-center justify-center`}
                  >
                    <img
                      src={imgSrc}
                      alt="dog"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    {stageText && (
                      <span
                        className="absolute left-1/2 bottom-0 translate-y-1/2 -translate-x-1/2 text-[11px] font-black text-white pointer-events-none select-none"
                        style={{ zIndex: 24, textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                      >
                        {stageText}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          });
        })}
      </div>

      {/* טקסט צדדי – מצב שלך ושל הבוט */}
      <div className="w-full sm:w-56 flex flex-col gap-2 text-xs">
        {seats.map((seat) => {
          const seatPieces = pieces[String(seat)] || [];
          const cls = colorClasses[seat] || "bg-white";
          const isPlayer = seat === mySeat;

          return (
            <div
              key={seat}
              className="border border-white/15 rounded-lg p-2 bg-black/40 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${cls}`} />
                  <span className="font-semibold">
                    {isPlayer ? "You" : "Bot"}
                  </span>
                </div>
                <span className="text-white/60 text-[11px]">
                  {board.turnSeat === seat ? "Turn" : ""}
                  {board.winner === seat && " (Winner)"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {seatPieces.map((pos, idx) => {
                  const inYard = pos < 0;
                  const finished =
                    pos >= LUDO_TRACK_LEN + LUDO_PIECES_PER_PLAYER ||
                    board.finished?.[String(seat)] >= LUDO_PIECES_PER_PLAYER;
                  const label = inYard
                    ? "Yard"
                    : finished
                    ? "Home"
                    : `Pos ${pos}`;

                  // חישוב אם החייל הזה חוקי להזזה עם הקובייה הנוכחית
                  const movableIndices =
                    board.dice != null ? listMovablePieces(board, seat, board.dice) : [];
                  const pieceCanClick = seat === mySeat && movableIndices.includes(idx);

                  return (
                    <button
                      key={idx}
                      onClick={() => pieceCanClick && onPieceClick && onPieceClick(idx)}
                      className={`px-2 py-[2px] rounded border text-[10px] flex flex-col text-left ${
                        pieceCanClick
                          ? "border-white/60 bg-white/10 hover:bg-white/20"
                          : "border-white/20 bg-white/5"
                      }`}
                    >
                      Piece {idx + 1}: {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

