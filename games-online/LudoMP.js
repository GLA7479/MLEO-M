// games-online/LudoMP.js
// Single entry: Ludo game with mode selector:
//  - Online MP (Supabase, 2-4 players)
//  - Vs Bot (local, 1v1)
// Uses lib/ludoEngine.js

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
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
const HISTORY_STORAGE_KEY = "ludo_history_v1";
function readHistoryMap() {
  return safeRead(HISTORY_STORAGE_KEY, {});
}
function writeHistoryMap(map) {
  safeWrite(HISTORY_STORAGE_KEY, map);
}
function appendHistoryRecord(playerName, entry) {
  if (!playerName) return;
  const map = readHistoryMap();
  const list = Array.isArray(map[playerName]) ? map[playerName] : [];
  list.unshift({ ...entry, timestamp: entry.timestamp ?? Date.now() });
  map[playerName] = list.slice(0, 20);
  writeHistoryMap(map);
}
function getPlayerHistory(playerName) {
  if (!playerName) return [];
  const map = readHistoryMap();
  return Array.isArray(map[playerName]) ? map[playerName] : [];
}
function fmt(n) {
  n = Math.floor(Number(n || 0));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
}

// ===== viewport fix for iOS =====
function useIOSViewportFix() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const setVH = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
      root.style.setProperty(
        "--satb",
        getComputedStyle(root).getPropertyValue("env(safe-area-inset-bottom,0px)")
      );
    };
    const onOrient = () =>
      requestAnimationFrame(() => setTimeout(setVH, 250));
    setVH();
    if (vv) {
      vv.addEventListener("resize", setVH);
      vv.addEventListener("scroll", setVH);
    }
    window.addEventListener("orientationchange", onOrient);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", setVH);
        vv.removeEventListener("scroll", setVH);
      }
      window.removeEventListener("orientationchange", onOrient);
    };
  }, []);
}

// =================== PUBLIC ENTRY ===================

export default function LudoMP({ roomId, playerName, vault, setVaultBoth, tierCode = "10K" }) {
  useIOSViewportFix();
  // Single vault bridge, used both by MP and Bot
  const router = useRouter();
  useEffect(() => {
    window.updateVaultCallback = setVaultBoth;
    return () => {
      delete window.updateVaultCallback;
    };
  }, [setVaultBoth]);

  const [mode, setMode] = useState(null); // null | "online" | "bot" | "local"

  useEffect(() => {
    const qMode =
      typeof router?.query?.mode === "string" ? router.query.mode : null;
    if (!mode && qMode && (qMode === "online" || qMode === "bot" || qMode === "local")) {
      setMode(qMode);
    }
  }, [router?.query?.mode, mode, router]);

  // Simple overlay menu for mode selection
  if (!mode) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">
        <div className="bg-black/70 border border-white/20 rounded-2xl p-4 sm:p-6 max-w-sm w-full flex flex-col gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold mb-1">Ludo</div>
            <div className="text-xs text-white/70">Choose how you want to play</div>
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

          <button
            onClick={() => setMode("local")}
            className="w-full px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold"
          >
            Local • 2–4 players (offline, same device)
          </button>

          <div className="text-[11px] text-white/60 text-center">Vault: {fmt(vault)}</div>
        </div>
      </div>
    );
  }

  // Top-level wrapper with "Back to mode menu" button
  return (
    <div className="w-full h-full flex flex-col text-white" style={{ overflow: 'hidden' }}>
      <div className="flex-1 min-h-0" style={{ overflow: 'hidden' }}>
        {mode === "online" && (
          <LudoOnline
            roomId={roomId}
            playerName={playerName}
            vault={vault}
            tierCode={tierCode}
            onBackToMode={() => setMode(null)}
          />
        )}

        {mode === "bot" && <LudoVsBot vault={vault} onBackToMode={() => setMode(null)} />}

        {mode === "local" && <LudoLocal onBackToMode={() => setMode(null)} />}
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
  const liveTurnSeat = board?.turnSeat ?? ses?.current_turn ?? null;
  const currentPot = useMemo(() => {
    if (!current) return minRequired;
    const dblValue = current.__double__?.value || 1;
    const entry = current.__entry__ ?? minRequired;
    const playerCount = board?.activeSeats?.length || 0;
    return entry * playerCount * dblValue;
  }, [current, board, minRequired]);
  const myRow = players.find((p) => p.client_id === clientId) || null;
  const mySeat = myRow?.seat_index ?? null;
  const [diceSeatOwner, setDiceSeatOwner] = useState(null);
  const dicePresenceRef = useRef(false);
  const [seatModal, setSeatModal] = useState(null);
  const [autoRoll, setAutoRoll] = useState(false);
  const historyStampRef = useRef(null);

  useEffect(() => {
    if (!board) {
      dicePresenceRef.current = false;
      setDiceSeatOwner(null);
      return;
    }
    const hasDice = board.dice != null;
    if (hasDice && !dicePresenceRef.current) {
      setDiceSeatOwner(board.turnSeat ?? liveTurnSeat ?? null);
    }
    if (!hasDice && !board.lastDice) {
      setDiceSeatOwner(null);
    }
    dicePresenceRef.current = hasDice;
  }, [board, liveTurnSeat]);

  useEffect(() => {
    if (!roomId) return;
    if (mySeat != null) {
      safeWrite("ludo_last_online_seat", { roomId, seat: mySeat });
    } else {
      const stored = safeRead("ludo_last_online_seat", null);
      if (stored?.roomId === roomId) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("ludo_last_online_seat");
        }
      }
    }
  }, [mySeat, roomId]);

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
    [clientId, ensureSession, minRequired, name, roomId, ses, vault]
  );

  useEffect(() => {
    if (!roomId || mySeat != null) return;
    const stored = safeRead("ludo_last_online_seat", null);
    if (!stored || stored.roomId !== roomId) return;
    const row = seatMap.get(stored.seat);
    if (!row) {
      takeSeat(stored.seat);
    } else if (row.client_id !== clientId) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("ludo_last_online_seat");
      }
    }
  }, [seatMap, roomId, mySeat, clientId, takeSeat]);

  useEffect(() => {
    if (!board?.winner || ses?.stage !== "finished") return;
    const stamp = `${ses.id || "session"}:${board.winner}:${JSON.stringify(board.finished)}`;
    if (historyStampRef.current === stamp) return;
    historyStampRef.current = stamp;
    seatMap.forEach((row, idx) => {
      if (!row?.player_name) return;
      appendHistoryRecord(row.player_name, {
        timestamp: Date.now(),
        mode: "online",
        room: roomId || null,
        result: board.winner === idx ? "win" : "loss",
      });
    });
  }, [board?.winner, board?.finished, ses?.stage, ses?.id, seatMap, roomId]);

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
    }, 150);
    return () => clearInterval(tickRef.current);
  }, [ses?.turn_deadline, ses?.stage, ses?.current_turn, mySeat]);

  // 🔵 סנכרון session מהשרת בקצב מהיר יותר (כ-0.4 שנ')
  useEffect(() => {
    if (!ses?.id) return;

    let cancelled = false;

    const interval = setInterval(async () => {
      if (cancelled) return;
      await fetchSession(); // מביא את מצב המשחק המעודכן (stage, board_state וכו')
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ses?.id]);

  // 🔵 realtime session updates (Supabase channel)
  useEffect(() => {
    if (!ses?.id) return;

    const sessionChannel = supabase
      .channel(`ludo_sessions:${ses.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ludo_sessions",
          filter: `id=eq.${ses.id}`,
        },
        (payload) => {
          if (payload.new) {
            setSes((prev) => {
              if (!prev) return payload.new;
              if (prev.updated_at === payload.new.updated_at) return prev;
              return payload.new;
            });
          }
        }
      )
      .subscribe();

    return () => {
      sessionChannel.unsubscribe();
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
    }, 500);

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

    // אין אף מהלך → מחכים רגע ואז מדלגים תור
    if (!moves.length) {
      setTimeout(() => {
        endTurn(b);
      }, 700); // השהייה קצרה יותר
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
  const { displayValue: diceDisplayValue, rolling: diceRolling } = useDiceRollAnimation(
    board?.dice ?? null,
    board?.lastDice ?? null
  );
  const [doubleCountdown, setDoubleCountdown] = useState(null);

  return (
    <>
      <div className="w-full h-full flex flex-col gap-2 text-white" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Seats */}
      <div className="w-full overflow-x-auto flex-shrink-0">
        <div className="flex gap-1 text-[9px] min-w-[320px]">
        {Array.from({ length: seats }).map((_, idx) => {
          const row = seatMap.get(idx) || null;
          const isMe = row?.client_id === clientId;
          const seatColor = SEAT_HEX_COLORS[idx] || "rgba(255,255,255,0.1)";
          const isTurnSeat = liveTurnSeat === idx;
          const handleSeatClick = () => {
            if (!row) {
              takeSeat(idx);
            } else {
              setSeatModal(idx);
            }
          };
          return (
            <button
              key={idx}
              onClick={handleSeatClick}
              className={`border rounded-md px-1.5 py-0.5 flex flex-col items-center justify-center text-[10px] font-semibold transition flex-1 ${
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
              <span className="font-semibold text-[10px]">{`Seat ${idx + 1}`}</span>
              <span className="text-white/70 text-[9px]">
                {row?.player_name || "Empty"}
                {isMe ? " (You)" : ""}
              </span>
            </button>
          );
        })}
        </div>
      </div>
      {/* Board + Controls */}
      <div className="flex-1 min-h-0 bg-black/40 rounded-lg p-3 flex flex-col gap-3 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden">
          {board ? (
            <LudoBoard
              board={board}
              onPieceClick={onPieceClick}
              mySeat={mySeat}
              showSidebar={false}
              disableHighlights={diceRolling || board?.dice == null}
              diceValue={diceDisplayValue}
              diceRolling={diceRolling}
              diceSeat={diceSeatOwner ?? board?.turnSeat ?? liveTurnSeat}
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
                className={`${CONTROL_BTN_BASE} border-red-300/70 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 whitespace-nowrap flex-shrink-0`}
              >
                Leave seat
              </button>
            )}
            <button
              onClick={startGame}
            className={`${CONTROL_BTN_BASE} border-emerald-300/70 bg-gradient-to-r from-emerald-600 to-lime-500 hover:from-emerald-500 hover:to-lime-400 whitespace-nowrap flex-shrink-0`}
            >
              Start game
            </button>
            <button
              onClick={offerDouble}
              disabled={!canOfferDouble}
            className={`${CONTROL_BTN_BASE} border-amber-300/70 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0`}
            >
              Double x{doubleState.value ?? 1}
            </button>
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
      {seatModal != null && (
        <PlayerInfoModal
          seatIndex={seatModal}
          playerName={seatMap.get(seatModal)?.player_name || `Seat ${seatModal + 1}`}
          color={SEAT_HEX_COLORS[seatModal] || "#ffffff"}
          board={board}
          mode="online"
          history={getPlayerHistory(seatMap.get(seatModal)?.player_name)}
          onClose={() => setSeatModal(null)}
        />
      )}
    </>
  );
}

// =================== VS BOT (LOCAL) ===================

function LudoVsBot({ vault, onBackToMode }) {
  const [board, setBoard] = useState(() => createInitialBoard([0, 1]));
  const [stage, setStage] = useState("lobby"); // 'lobby' | 'playing' | 'finished'
  const [msg, setMsg] = useState("");
  const [deadline, setDeadline] = useState(null);
  const [seatModal, setSeatModal] = useState(null);
  const [diceSeatOwner, setDiceSeatOwner] = useState(null);
  const [autoRoll, setAutoRoll] = useState(false);
  const dicePresenceRef = useRef(false);
  const diceSeatDelayRef = useRef(null);

  const buyIn = 1000;
  const vaultBalance = vault;
  const mySeat = 0;
  const botSeat = 1;
  const playingNow = stage === "playing";
  const { displayValue: diceDisplayValue, rolling: diceRolling } = useDiceRollAnimation(
    board.dice ?? null,
    board.lastDice ?? null
  );
  const canPlayerRoll =
    stage === "playing" &&
    board.turnSeat === mySeat &&
    board.dice == null &&
    !diceRolling &&
    board.winner == null;

  const canStart = useMemo(() => {
    return stage === "lobby" && vaultBalance >= buyIn;
  }, [stage, vaultBalance, buyIn]);

  const setDiceSeatOwnerInstant = useCallback((seat) => {
    if (diceSeatDelayRef.current) {
      clearTimeout(diceSeatDelayRef.current);
      diceSeatDelayRef.current = null;
    }
    setDiceSeatOwner(seat);
  }, []);

  const scheduleDiceSeatOwner = useCallback(
    (seat) => {
      if (diceSeatDelayRef.current) clearTimeout(diceSeatDelayRef.current);
      diceSeatDelayRef.current = setTimeout(() => {
        setDiceSeatOwnerInstant(seat);
      }, 2000);
    },
    [setDiceSeatOwnerInstant]
  );

  useEffect(() => {
    return () => {
      if (diceSeatDelayRef.current) {
        clearTimeout(diceSeatDelayRef.current);
        diceSeatDelayRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const hasDice = board.dice != null;
    if (hasDice && !dicePresenceRef.current) {
      setDiceSeatOwnerInstant(board.turnSeat ?? mySeat);
    }
    dicePresenceRef.current = hasDice;
  }, [board.dice, board.turnSeat, mySeat, setDiceSeatOwnerInstant]);

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
      setTimeout(() => {
        setBoard((prev) => {
          if (
            prev !== nextBoard ||
            prev.turnSeat !== mySeat ||
            prev.dice !== dice ||
            stage !== "playing"
          ) {
            return prev;
          }

          const b2 = { ...prev, dice: null, lastDice: dice };
          b2.turnSeat = nextTurnSeat(b2);
          scheduleDiceSeatOwner(b2.turnSeat ?? null);
          return b2;
        });
        setDeadline(Date.now() + TURN_SECONDS * 1000);
      }, 1800);
    }
  }

  function handlePlayerDiceClick() {
    if (!canPlayerRoll) return;
    doRoll();
  }

  useEffect(() => {
    if (!autoRoll) return;
    if (!canPlayerRoll) return;
    const timer = setTimeout(() => {
      doRoll();
    }, 1500);
    return () => clearTimeout(timer);
  }, [autoRoll, canPlayerRoll, doRoll]);

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
    next.dice = null;
    setBoard(next);
    setDiceSeatOwnerInstant(next.turnSeat ?? null);
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
    appendHistoryRecord("You", {
      timestamp: Date.now(),
      mode: "bot",
      result: winnerSeat === mySeat ? "win" : "loss",
    });
    appendHistoryRecord("Bot", {
      timestamp: Date.now(),
      mode: "bot",
      result: winnerSeat === botSeat ? "win" : "loss",
    });
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
      }, 1500);
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
        scheduleDiceSeatOwner(next.turnSeat ?? null);
      }, 1500);
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
        scheduleDiceSeatOwner(next2.turnSeat ?? null);
        return;
      }
      if (next.winner != null) {
        finishLocalGame(next);
        return;
      }
      next.turnSeat = nextTurnSeat(next);
      setBoard(next);
      setDeadline(Date.now() + TURN_SECONDS * 1000);
      scheduleDiceSeatOwner(next.turnSeat ?? null);
    }, 1500);
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
          setDeadline(Date.now() + TURN_SECONDS * 1000);
          return;
        } else {
          const dice = board.dice;
          const moves = listMovablePieces(board, turnSeat, dice);
          if (!moves.length) {
            const next = { ...board, dice: null, lastDice: dice };
            next.turnSeat = nextTurnSeat(next);
            setBoard(next);
            scheduleDiceSeatOwner(next.turnSeat ?? null);
          }
        }
        setDeadline(Date.now() + TURN_SECONDS * 1000);
      }
    }, 500);
    return () => clearInterval(t);
  }, [deadline, board, stage]);

  const seatCards = [
    {
      seat: 0,
      label: "Seat 1",
      name: "You",
      color: SEAT_HEX_COLORS[0],
      isTurn: stage === "playing" && board.turnSeat === 0,
    },
    {
      seat: 1,
      label: "Seat 2",
      name: "Bot",
      color: SEAT_HEX_COLORS[1],
      isTurn: stage === "playing" && board.turnSeat === 1,
    },
    {
      seat: 2,
      label: "Seat 3",
      name: "Unused",
      color: SEAT_HEX_COLORS[2],
      isTurn: false,
      inactive: true,
    },
    {
      seat: 3,
      label: "Seat 4",
      name: "Unused",
      color: SEAT_HEX_COLORS[3],
      isTurn: false,
      inactive: true,
    },
  ];

  return (
    <>
      <div className="w-full h-full flex flex-col gap-2 text-white" style={{ height: "100%", overflow: 'hidden' }}>
        <div className="w-full overflow-x-auto flex-shrink-0">
          <div className="flex gap-1 text-[9px] min-w-[320px]">
          {seatCards.map((card, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => !card.inactive && setSeatModal(card.seat)}
              className={`border rounded-md px-1.5 py-0.5 flex flex-col items-center justify-center text-[10px] font-semibold transition flex-1 ${
                card.inactive ? "border-white/20 opacity-50 cursor-default" : "border-white/30 shadow hover:border-white/60"
              } ${card.isTurn ? "ring-2 ring-amber-300 animate-pulse" : ""}`}
              style={{
                background: `linear-gradient(135deg, ${card.color}dd, ${card.color}aa)`,
                color: "white",
                textShadow: "0 1px 2px rgba(0,0,0,0.7)",
              }}
            >
              <span className="font-semibold text-[10px]">{card.label}</span>
              <span className="text-white/70 text-[9px]">{card.name}</span>
            </button>
          ))}
          </div>
        </div>

        <div
          className="flex-1 min-h-0 bg-black/40 rounded-lg p-3 flex flex-col gap-3 overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-hidden">
          <LudoBoard
            board={board}
            mySeat={mySeat}
            onPieceClick={onPieceClick}
            showSidebar={false}
            disableHighlights={diceRolling}
            diceValue={diceDisplayValue}
            diceRolling={diceRolling}
            diceSeat={diceSeatOwner ?? board.turnSeat ?? mySeat}
            diceClickable={canPlayerRoll}
            onDiceClick={handlePlayerDiceClick}
          />
          </div>

          <div className="w-full text-xs flex flex-col gap-2 items-center">
          <div className="flex justify-center items-center flex-wrap gap-2">
            <span className="text-white/70">
              {stage === "lobby"
                ? `Buy-in: ${fmt(buyIn)} required to start`
                : stage === "playing"
                ? "Tap the die on the board to roll, then tap your piece"
                : "Game finished - reset to play again"}
            </span>
            {msg && <span className="text-amber-300 text-center">{msg}</span>}
          </div>
          <div className="flex gap-2 items-center justify-center w-full flex-wrap">
            <button
              onClick={startGame}
              disabled={stage === "playing"}
              className={`${CONTROL_BTN_BASE} border-emerald-300/70 bg-gradient-to-r from-emerald-600 to-lime-500 hover:from-emerald-500 hover:to-lime-400 disabled:bg-gray-600/60 disabled:cursor-not-allowed`}
            >
              Start vs Bot
            </button>
            <button
              onClick={resetGame}
              className={`${CONTROL_BTN_BASE} border-white/30 bg-slate-600/80 hover:bg-slate-500`}
            >
              Reset
            </button>
            <button
              onClick={() => setAutoRoll((v) => !v)}
              className={`${CONTROL_BTN_BASE} border-sky-300/70 ${
                autoRoll
                  ? "bg-sky-600/80 hover:bg-sky-500"
                  : "bg-white/10 hover:bg-white/20"
              }`}
            >
              Auto dice: {autoRoll ? "ON" : "OFF"}
            </button>
          </div>
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
      {seatModal != null && (
        <PlayerInfoModal
          seatIndex={seatModal}
          playerName={seatCards.find((c) => c.seat === seatModal)?.name || `Seat ${seatModal + 1}`}
          color={SEAT_HEX_COLORS[seatModal] || "#ffffff"}
          board={board}
          mode="bot"
          history={getPlayerHistory(seatCards.find((c) => c.seat === seatModal)?.name)}
          onClose={() => setSeatModal(null)}
        />
      )}
    </>
  );
}

// =================== LOCAL MULTIPLAYER (OFFLINE, SAME DEVICE) ===================

function LudoLocal({ onBackToMode }) {
  const [playerCount, setPlayerCount] = useState(2); // 2–4 players on this device
  const [stage, setStage] = useState("setup"); // 'setup' | 'playing' | 'finished'
  const [board, setBoard] = useState(() => createInitialBoard([0, 1]));
  const [msg, setMsg] = useState("");
  const [diceSeatOwner, setDiceSeatOwner] = useState(null);
  const dicePresenceRef = useRef(false);
  const [seatModal, setSeatModal] = useState(null);
  const diceSeatDelayRef = useRef(null);
  const [autoRoll, setAutoRoll] = useState(false);

  useEffect(() => {
    if (stage !== "setup") return;
    const seats = Array.from({ length: playerCount }, (_, i) => i);
    setBoard(createInitialBoard(seats));
    setMsg("");
  }, [playerCount, stage]);

  const { displayValue: diceDisplayValue, rolling: diceRolling } = useDiceRollAnimation(
    board.dice ?? null,
    board.lastDice ?? null
  );

  const setDiceSeatOwnerInstant = useCallback((seat) => {
    if (diceSeatDelayRef.current) {
      clearTimeout(diceSeatDelayRef.current);
      diceSeatDelayRef.current = null;
    }
    setDiceSeatOwner(seat);
  }, []);

  const scheduleDiceSeatOwner = useCallback(
    (seat) => {
      if (diceSeatDelayRef.current) clearTimeout(diceSeatDelayRef.current);
      diceSeatDelayRef.current = setTimeout(() => {
        setDiceSeatOwnerInstant(seat);
        diceSeatDelayRef.current = null;
      }, 2000);
    },
    [setDiceSeatOwnerInstant]
  );

  useEffect(() => {
    return () => {
      if (diceSeatDelayRef.current) {
        clearTimeout(diceSeatDelayRef.current);
        diceSeatDelayRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const hasDice = board.dice != null;
    if (hasDice && !dicePresenceRef.current) {
      setDiceSeatOwnerInstant(board.turnSeat ?? 0);
    }
    dicePresenceRef.current = hasDice;
  }, [board.dice, board.turnSeat, setDiceSeatOwnerInstant]);

  function startGame() {
    const seats = Array.from({ length: playerCount }, (_, i) => i);
    const initial = createInitialBoard(seats);
    setBoard(initial);
    setStage("playing");
    setMsg("");
  }

  function resetGame() {
    setStage("setup");
  }

  function doRollLocal() {
    if (stage !== "playing") return;
    if (board.winner != null) return;
    if (board.dice != null) return;

    const turnSeat = board.turnSeat;
    if (turnSeat == null) return;

    const dice = 1 + Math.floor(Math.random() * 6);
    const next = { ...board, dice, lastDice: dice };
    setBoard(next);
    setMsg("");

    const moves = listMovablePieces(next, turnSeat, dice);

    if (!moves.length) {
      setTimeout(() => {
        setBoard((prev) => {
          if (prev.dice == null || prev.turnSeat !== turnSeat) return prev;

          const after = { ...prev, dice: null, lastDice: dice };
          after.turnSeat = nextTurnSeat(after);
          scheduleDiceSeatOwner(after.turnSeat ?? null);
          return after;
        });
      }, 1800);
    }
  }

  function onPieceClick(pieceIndex) {
    if (stage !== "playing") return;
    if (board.winner != null) return;
    if (board.dice == null) return;

    const seat = board.turnSeat;
    if (seat == null) return;

    const moves = listMovablePieces(board, seat, board.dice);
    if (!moves.includes(pieceIndex)) {
      setMsg("No legal move for that piece");
      return;
    }

    const { ok, board: next } = applyMove(board, seat, pieceIndex, board.dice);
    if (!ok) {
      setMsg("Move not allowed");
      return;
    }

    if (next.winner != null) {
      finishGame(next);
      return;
    }

    next.turnSeat = nextTurnSeat(next);
    next.dice = null;
    setBoard(next);
    setDiceSeatOwnerInstant(next.turnSeat ?? null);
    setMsg("");
  }

  function finishGame(nextBoard) {
    setBoard(nextBoard);
    setStage("finished");
    const winnerSeat = nextBoard.winner;
    if (winnerSeat != null) {
      setMsg(`Seat ${winnerSeat + 1} won!`);
    } else {
      setMsg("Game finished");
    }
    const now = Date.now();
    Array.from({ length: playerCount }, (_, seat) => {
      const name = `Player ${seat + 1}`;
      appendHistoryRecord(name, {
        timestamp: now,
        mode: "local",
        result: winnerSeat === seat ? "win" : "loss",
      });
    });
  }

  const canStart = stage === "setup";
  function handleLocalDiceClick() {
    const canRoll =
      stage === "playing" && board.dice == null && board.winner == null && !diceRolling;
    if (!canRoll) return;
    doRollLocal();
  }

  useEffect(() => {
    const canRoll =
      stage === "playing" && board.dice == null && board.winner == null && !diceRolling;
    if (!autoRoll || !canRoll) return;
    const timer = setTimeout(() => {
      doRollLocal();
    }, 1500);
    return () => clearTimeout(timer);
  }, [autoRoll, stage, board.dice, board.winner, diceRolling]);

  const seatCards = Array.from({ length: 4 }, (_, idx) => {
    const active = idx < playerCount;
    return {
      seat: idx,
      label: `Seat ${idx + 1}`,
      name: active ? `Player ${idx + 1}` : "Unused",
      color: SEAT_HEX_COLORS[idx],
      isTurn: active && stage === "playing" && board.turnSeat === idx,
      inactive: !active,
    };
  });

  return (
    <>
      <div className="w-full h-full flex flex-col gap-2 text-white" style={{ height: "100%", overflow: 'hidden' }}>
      <div className="w-full overflow-x-auto flex-shrink-0">
        <div className="flex gap-1 text-[9px] min-w-[320px]">
          {seatCards.map((card, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => !card.inactive && setSeatModal(card.seat)}
              className={`border rounded-md px-1.5 py-0.5 flex flex-col items-center justify-center text-[10px] font-semibold transition flex-1 ${
                card.inactive ? "border-white/20 opacity-50 cursor-default" : "border-white/30 shadow hover:border-white/60"
              } ${card.isTurn ? "ring-2 ring-amber-300 animate-pulse" : ""}`}
              style={{
                background: `linear-gradient(135deg, ${card.color}dd, ${card.color}aa)`,
                color: "white",
                textShadow: "0 1px 2px rgba(0,0,0,0.7)",
              }}
            >
              <span className="font-semibold text-[10px]">{card.label}</span>
              <span className="text-white/70 text-[9px]">{card.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 min-h-0 bg-black/40 rounded-lg p-3 flex flex-col gap-3 overflow-hidden"
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          <LudoBoard
            board={board}
            mySeat={board.turnSeat}
            onPieceClick={onPieceClick}
            showSidebar={false}
            disableHighlights
            diceValue={diceDisplayValue}
            diceRolling={diceRolling}
            diceSeat={diceSeatOwner ?? board.turnSeat ?? 0}
            diceClickable={stage === "playing" && board.dice == null && board.winner == null && !diceRolling}
            onDiceClick={handleLocalDiceClick}
          />
        </div>

        <div className="w-full text-xs flex flex-col gap-2 items-center">
          <div className="flex justify-center items-center flex-wrap gap-2">
            <span className="text-white/70">
              {stage === "setup"
                ? "Choose number of players and press Start"
                : stage === "playing"
                ? "Pass the device to the active player • Tap the die to roll"
                : "Game finished – Reset or Start again"}
            </span>
            {msg && <span className="text-amber-300 text-center">{msg}</span>}
          </div>
          <div className="flex gap-2 items-center justify-center w-full flex-wrap">
            {stage === "setup" ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-white/20 bg-white/5">
                <span className="text-white/60 text-[10px] uppercase tracking-wide">Players</span>
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPlayerCount(n)}
                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                      playerCount === n
                        ? "bg-emerald-500/50 text-white border border-emerald-300/70"
                        : "bg-white/10 border border-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => setAutoRoll((v) => !v)}
                className={`${CONTROL_BTN_BASE} border-sky-300/70 ${
                  autoRoll ? "bg-sky-600/80 hover:bg-sky-500" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                Auto dice: {autoRoll ? "ON" : "OFF"}
              </button>
            )}
            <button
              onClick={startGame}
              disabled={!canStart}
              className={`${CONTROL_BTN_BASE} border-emerald-300/70 bg-gradient-to-r from-emerald-600 to-lime-500 hover:from-emerald-500 hover:to-lime-400 disabled:bg-gray-600/60 disabled:cursor-not-allowed`}
            >
              Start local game
            </button>
            <button
              onClick={resetGame}
              className={`${CONTROL_BTN_BASE} border-white/30 bg-slate-600/80 hover:bg-slate-500`}
            >
              Reset
            </button>
          </div>
          </div>
        </div>

        <div className="w-full bg-black/40 rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="font-semibold">Ludo Local</span>
            <span className="text-white/60">Players: {playerCount}</span>
          </div>
          <div className="flex items-center gap-3">
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
      {seatModal != null && (
        <PlayerInfoModal
          seatIndex={seatModal}
          playerName={seatCards.find((c) => c.seat === seatModal)?.name || `Player ${seatModal + 1}`}
          color={SEAT_HEX_COLORS[seatModal] || "#ffffff"}
          board={board}
          mode="local"
          history={getPlayerHistory(seatCards.find((c) => c.seat === seatModal)?.name)}
          onClose={() => setSeatModal(null)}
        />
      )}
    </>
  );
}

// =================== BOARD COMPONENTS ===================

// ===== Helpers for board projection =====
const START_OFFSETS = [0, 13, 26, 39]; // נקודת התחלה לכל צבע על המסלול
// Board size will be calculated dynamically for mobile
const TRACK_RADIUS = 36;
const TRACK_ANGLE_OFFSET = (5 * Math.PI) / 4; // 225° מבטיח שהכניסה קרובה לשחקן
const SEAT_HEX_COLORS = ["#ef4444", "#38bdf8", "#22c55e", "#fbbf24"];
const SEAT_COLOR_LABELS = ["RED", "BLUE", "GREEN", "YELLOW"];
const FINISH_FLASH_MS = 2200;
const CONTROL_BTN_BASE =
  "inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full border font-semibold text-[11px] uppercase tracking-wide shadow-md shadow-black/40 transition focus:outline-none focus:ring-2 focus:ring-white/30";
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
    { x: 6, y: 6 },
    { x: 14, y: 6 },
    { x: 6, y: 14 },
    { x: 14, y: 14 },
  ],
  [
    { x: 86, y: 6 },
    { x: 94, y: 6 },
    { x: 86, y: 14 },
    { x: 94, y: 14 },
  ],
  [
    { x: 86, y: 86 },
    { x: 94, y: 86 },
    { x: 86, y: 94 },
    { x: 94, y: 94 },
  ],
  [
    { x: 6, y: 94 },
    { x: 14, y: 94 },
    { x: 6, y: 86 },
    { x: 14, y: 86 },
  ],
];

function projectGlobalTrackCell(globalIndex) {
  const safeIdx = ((globalIndex % LUDO_TRACK_LEN) + LUDO_TRACK_LEN) % LUDO_TRACK_LEN;
  const angle = (safeIdx / LUDO_TRACK_LEN) * 2 * Math.PI + TRACK_ANGLE_OFFSET;
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

function summarizeSeat(board, seat) {
  const totalPath = LUDO_TRACK_LEN + LUDO_HOME_LEN;
  const arr = board?.pieces?.[String(seat)] || [];
  const yard = arr.filter((pos) => pos < 0).length;
  const home = arr.filter((pos) => pos >= totalPath).length;
  const track = arr.length - yard - home;
  const finishedCount = (board?.finished?.[String(seat)] ?? 0) + home;
  const stepsRemaining = arr.reduce((sum, pos) => {
    if (pos < 0) return sum + totalPath;
    if (pos >= totalPath) return sum;
    return sum + Math.max(0, totalPath - pos);
  }, 0);
  return { yard, track, home, finished: finishedCount, stepsRemaining };
}

function formatSeatLabel(seat) {
  if (seat == null || Number.isNaN(seat)) return "Seat ?";
  const idx = Math.max(0, Number(seat));
  const seatNumber = idx + 1;
  const color = SEAT_COLOR_LABELS[idx];
  return color ? `Seat ${seatNumber} — ${color}` : `Seat ${seatNumber}`;
}

function useDiceRollAnimation(currentDice, fallbackValue = null) {
  const [displayValue, setDisplayValue] = useState(fallbackValue ?? null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (currentDice == null) {
      if (fallbackValue != null) {
        setDisplayValue(fallbackValue);
      }
      setRolling(false);
      return;
    }

    setRolling(true);

    const interval = setInterval(() => {
      setDisplayValue(1 + Math.floor(Math.random() * 6));
    }, 120);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayValue(currentDice);
      setRolling(false);
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [currentDice, fallbackValue]);

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

function DiceDisplay({ displayValue, rolling, seat, clickable = false }) {
  const dots = displayValue ?? 1;
  const color = SEAT_HEX_COLORS[seat] || "#f8fafc";
  const highlight = lightenColor(color, 0.45);

  return (
    <div
      className={`relative w-12 h-12 sm:w-14 sm:h-14 text-white transition-transform duration-150 ${
        clickable ? "hover:scale-105" : ""
      }`}
    >
      <div
        className={`absolute inset-0 rounded-2xl border-2 shadow-lg shadow-black/40 transition ${
          rolling ? "animate-pulse" : ""
        }`}
        style={{
          borderColor: color,
          background: `linear-gradient(145deg, ${highlight}, ${color})`,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[28px] sm:text-[36px] font-black text-black drop-shadow">
        {dots}
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

function LudoBoard({
  board,
  onPieceClick,
  mySeat,
  showSidebar = true,
  disableHighlights = false,
  diceValue = null,
  diceRolling = false,
  diceSeat = null,
  diceClickable = false,
  onDiceClick = null,
}) {
  const boardRef = useRef(null);
  const containerRef = useRef(null);
  const [boardSize, setBoardSize] = useState(null);
  
  // Calculate board size dynamically - maximize to fit screen without scrolling
  useEffect(() => {
    if (!containerRef.current) return;
    
    const calc = () => {
      // Get the container that holds the board
      const container = containerRef.current;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      
      // If container has no size yet, use viewport
      if (containerRect.height === 0 || containerRect.width === 0) {
        const rootH = window.visualViewport?.height ?? window.innerHeight;
        const rootW = window.innerWidth;
        const availableH = rootH * 0.85; // Use 85% of viewport height
        const availableW = rootW * 0.96; // Use 96% of viewport width
        const maxSize = Math.min(availableH, availableW);
        const calculatedSize = Math.min(maxSize, 820);
        setBoardSize(Math.max(520, calculatedSize));
        return;
      }
      
      // Account for minimal padding/gaps - maximize board size
      // Only reduce by minimal amount to prevent scrolling
      const availableH = containerRect.height - 24; // Account for padding (p-3 = 12px * 2)
      const availableW = containerRect.width - 24;
      
      // Use the smaller dimension to ensure square board fits, maximize it
      // Try to keep original size (820px) but reduce only if needed to prevent scrolling
      const maxSize = Math.min(availableH, availableW);
      // Prefer original size, only reduce if absolutely necessary
      const calculatedSize = Math.min(maxSize, 820);
      
      // Always set the calculated size - it will be as large as possible
      // Try to keep original size (520px) but reduce only if needed to prevent scrolling
      setBoardSize(Math.max(520, calculatedSize));
    };
    
    // Delay initial calc to ensure container is rendered
    const timer = setTimeout(calc, 100);
    calc();
    
    const ro = new ResizeObserver(calc);
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", calc);
    }
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
      if (vv) {
        vv.removeEventListener("resize", calc);
      }
    };
  }, []);
  
  const pieces = board.pieces || {};

  // fallback: אם activeSeats ריק (במיוחד באופליין) – נגזור אותו מה־pieces
  let active = Array.isArray(board.activeSeats) ? board.activeSeats : [];
  if (!active.length) {
    active = [0, 1, 2, 3].filter((seat) => {
      const arr = pieces[String(seat)];
      return Array.isArray(arr) && arr.length > 0;
    });
  }
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
  const highlightNumbers = useMemo(() => {
    const numbers = new Set();
    if (!disableHighlights && effectiveHighlights.size > 0) {
      effectiveHighlights.forEach((idx) => numbers.add(idx));
    }
    if (!disableHighlights && board.turnSeat != null && board.dice != null) {
      const seatPieces = pieces[String(board.turnSeat)] || [];
      const movable = listMovablePieces(board, board.turnSeat, board.dice);
      movable.forEach((pieceIdx) => {
        const pos = seatPieces[pieceIdx];
        if (pos == null) return;
        const targetPos = pos + board.dice;
        if (targetPos >= LUDO_TRACK_LEN && targetPos < LUDO_TRACK_LEN + LUDO_HOME_LEN) {
          numbers.add(`home-${board.turnSeat}-${targetPos - LUDO_TRACK_LEN}`);
        }
      });
    }
    return numbers;
  }, [disableHighlights, effectiveHighlights, board, pieces]);
  return (
    <div className="w-full h-full flex flex-col sm:flex-row gap-3" ref={containerRef}>
      {/* לוח מרכזי */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <div
          className="relative rounded-2xl border-2 border-white/30 overflow-hidden bg-black shadow-2xl aspect-square"
          ref={boardRef}
          style={{
            width: boardSize ? `${boardSize}px` : "clamp(520px, min(96vw, 96vh), 820px)",
            height: boardSize ? `${boardSize}px` : "clamp(520px, min(96vw, 96vh), 820px)",
            maxWidth: "100%",
            maxHeight: "100%",
            flexShrink: 0,
          }}
        >
          {/* שכבות רקע חדשות שמתאימות למסלול המעגלי */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#020617] to-black z-0" />
          <div className="absolute inset-4 sm:inset-6 rounded-[32px] border border-white/5 bg-white/5 blur-[1px]" />
          <div className="absolute inset-[9%] rounded-full border border-white/10 bg-black/50 shadow-inner shadow-black/70" />
          <img
            src="/images/ludo/board.png"
            alt="Ludo board"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[28px] object-contain pointer-events-none opacity-95"
            style={{
              width: "85%",
              height: "85%",
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />

          {(diceValue != null || diceClickable) && (
            <div
              className={`absolute z-30 ${diceClickable ? "cursor-pointer" : "pointer-events-none"}`}
              role={diceClickable ? "button" : undefined}
              tabIndex={diceClickable ? 0 : undefined}
              aria-label={diceClickable ? "Roll dice" : "Dice"}
              onClick={() => {
                if (diceClickable && !diceRolling && typeof onDiceClick === "function") {
                  onDiceClick();
                }
              }}
              onKeyDown={(evt) => {
                if (!diceClickable || diceRolling || typeof onDiceClick !== "function") return;
                if (evt.key === "Enter" || evt.key === " ") {
                  evt.preventDefault();
                  onDiceClick();
                }
              }}
              style={{
                left: "50%",
                top: "78%",
                transform: "translate(-50%, -50%)",
                pointerEvents: diceClickable ? "auto" : "none",
              }}
            >
              <DiceDisplay
                displayValue={diceValue}
                rolling={diceRolling}
                seat={diceSeat}
                clickable={diceClickable && !diceRolling}
              />
            </div>
          )}


          {/* מסלול מעגלי עם אינדיקציות */}
          <TrackOverlay
            layout={trackLayout}
            occupancy={trackOccupancy}
            highlights={effectiveHighlights}
            homeSegments={homeSegments}
            highlightNumbers={highlightNumbers}
          />

          {/* החיילים מעל הכל */}
          {active.map((seat) => {
          const cls = colorClasses[seat] || "bg-white";
        const seatPieces = pieces[String(seat)] || [];
        const isMe = seat === mySeat;
        const imgSrc = `/images/ludo/dog_${seat}.png`;
        const seatColorHex = SEAT_HEX_COLORS[seat] || "#ffffff";

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

            const totalPath = LUDO_TRACK_LEN + LUDO_HOME_LEN;
            const stepsLeft =
              progressInfo.state === "track"
                ? Math.max(0, totalPath - pos)
                : progressInfo.state === "home"
                ? Math.max(0, totalPath - pos)
                : progressInfo.state === "yard"
                ? totalPath
                : null;

            return (
              <button
                key={`${seat}-${idx}`}
                type="button"
                onClick={() => movable && onPieceClick && onPieceClick(idx)}
                className={`absolute flex items-center justify-center transition-transform z-20 ${
                  movable ? "animate-pulse scale-105" : ""
                }`}
                title={`Piece ${idx + 1} • ${progressInfo.label}${
                  progressInfo.detail ? ` • ${progressInfo.detail}` : ""
                }`}
                style={{
                  left: `${proj.x}%`,
                  top: `${proj.y}%`,
                  width: "13%",
                  height: "13%",
                  minWidth: '32px',
                  minHeight: '32px',
                  transform: "translate(-50%, -50%)",
                  zIndex: 20,
                  position: 'absolute',
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  transition: "left 0.35s ease, top 0.35s ease",
                  willChange: "left, top"
                }}
              >
                <div className="w-full h-full relative pointer-events-none" style={{ zIndex: 21 }}>
                  <img
                    src={imgSrc}
                    alt="piece"
                    className="w-full h-full object-contain pointer-events-none"
                    style={{ 
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 21,
                      background: 'transparent'
                    }}
                    onError={(e) => {
                      console.error(`Failed to load piece image for seat ${seat}:`, imgSrc, e);
                      e.currentTarget.style.display = "none";
                      const fallback = e.currentTarget.nextElementSibling;
                      if (fallback) {
                        fallback.classList.remove("hidden");
                      }
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.display = "block";
                      const fallback = e.currentTarget.nextElementSibling;
                      if (fallback) {
                        fallback.classList.add("hidden");
                      }
                    }}
                  />
                  <div
                    className="fallback-piece absolute hidden"
                    style={{
                      zIndex: 20,
                      width: "27%",
                      height: "27%",
                      borderRadius: "999px",
                      border: "2px solid rgba(255,255,255,0.4)",
                      background: seatColorHex,
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                  {stepsLeft != null && (
                    <span
                      className="absolute text-[11px] font-extrabold text-white pointer-events-none select-none"
                      style={{
                        zIndex: 24,
                        textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                        left: "50%",
                        bottom: "-15%",
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      {stepsLeft}
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

function TrackOverlay({ layout, occupancy, highlights, homeSegments, highlightNumbers = new Set() }) {
  if (!layout?.length) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div className="absolute inset-[12%] rounded-full border border-white/10" />
      {homeSegments?.map((segment) => {
        const key = `home-${segment.seat}-${segment.idx}`;
        const isHighlight = highlightNumbers.has(key);
        return (
          <div
            key={key}
            className={`absolute rounded-full border border-white/20 shadow-sm ${
              isHighlight ? "ring-2 ring-amber-300 animate-pulse" : ""
            }`}
            style={{
              left: `${segment.x}%`,
              top: `${segment.y}%`,
              width: "2.8%",
              height: "2.8%",
              minWidth: "12px",
              minHeight: "12px",
              transform: "translate(-50%, -50%)",
              backgroundColor: `${SEAT_HEX_COLORS[segment.seat]}${isHighlight ? "aa" : "55"}`,
              borderColor: `${SEAT_HEX_COLORS[segment.seat]}99`,
              boxShadow: isHighlight
                ? `0 0 12px ${SEAT_HEX_COLORS[segment.seat]}aa`
                : `0 0 6px ${SEAT_HEX_COLORS[segment.seat]}55`,
            }}
          />
        );
      })}
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
              className={`absolute text-[10px] sm:text-[16px] font-bold drop-shadow pointer-events-none select-none ${
                highlightNumbers.has(idx) ? "text-amber-300 animate-pulse" : ""
              }`}
              style={{
                left: `${labelX}%`,
                top: `${labelY}%`,
                transform: "translate(-50%, -50%)",
                color: highlightNumbers.has(idx) ? "#fbbf24" : labelColor,
                textShadow: highlightNumbers.has(idx)
                  ? "0 0 6px rgba(251,191,36,0.8)"
                  : "0 1px 2px rgba(0,0,0,0.4)",
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

function PlayerInfoModal({ seatIndex, playerName, color, board, history = [], mode, onClose }) {
  const stats = summarizeSeat(board, seatIndex);
  const readableName = playerName || `Seat ${seatIndex + 1}`;
  const recentHistory = Array.isArray(history) ? history.slice(0, 5) : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-2xl p-4 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60">Seat {seatIndex + 1}</p>
            <h2 className="text-xl font-bold">{readableName}</h2>
          </div>
          <div
            className="w-10 h-10 rounded-full border-2 border-white/40"
            style={{ background: color }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-white/60 text-xs uppercase">Yard</p>
            <p className="text-lg font-bold">{stats.yard}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-white/60 text-xs uppercase">On Track</p>
            <p className="text-lg font-bold">{stats.track}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-white/60 text-xs uppercase">Finished</p>
            <p className="text-lg font-bold">{stats.finished}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-white/60 text-xs uppercase">Steps Remaining</p>
            <p className="text-lg font-bold">{stats.stepsRemaining}</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-widest text-white/60">Recent games</p>
            <span className="text-[10px] text-white/40">{mode || "game"}</span>
          </div>
          {recentHistory.length === 0 ? (
            <p className="text-white/60 text-sm">No history recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
              {recentHistory.map((item, idx) => (
                <li
                  key={idx}
                  className="bg-white/5 rounded-lg px-3 py-2 text-sm flex items-center justify-between"
                >
                  <span className={`font-semibold ${item.result === "win" ? "text-emerald-300" : "text-red-300"}`}>
                    {item.result === "win" ? "Win" : "Loss"}
                  </span>
                  <span className="text-white/60 text-xs">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-full border border-white/30 text-sm hover:bg-white/10 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function LudoBoardLocal({ board, mySeat, onPieceClick }) {
  const boardRef = useRef(null);
  const containerRef = useRef(null);
  const [boardSize, setBoardSize] = useState(null);
  
  // Calculate board size dynamically - maximize to fit screen without scrolling
  useEffect(() => {
    if (!containerRef.current) return;
    
    const calc = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      
      // If container has no size yet, use viewport
      if (containerRect.height === 0 || containerRect.width === 0) {
        const rootH = window.visualViewport?.height ?? window.innerHeight;
        const rootW = window.innerWidth;
        const availableH = rootH * 0.85;
        const availableW = rootW * 0.96;
        const maxSize = Math.min(availableH, availableW);
        const calculatedSize = Math.min(maxSize, 820);
        setBoardSize(Math.max(520, calculatedSize));
        return;
      }
      
      // Account for minimal padding/gaps - maximize board size
      // Only reduce by minimal amount to prevent scrolling
      const availableH = containerRect.height - 24;
      const availableW = containerRect.width - 24;
      
      // Maximize to fit available space, keep original max (820px)
      const maxSize = Math.min(availableH, availableW);
      const calculatedSize = Math.min(maxSize, 820);
      
      // Always set - maximize the size, try to keep original (520px) but reduce if needed
      setBoardSize(Math.max(520, calculatedSize));
    };
    
    calc();
    const ro = new ResizeObserver(calc);
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", calc);
    }
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
      if (vv) {
        vv.removeEventListener("resize", calc);
      }
    };
  }, []);
  
  const pieces = board.pieces || {};
  const colorClasses = ["bg-red-500", "bg-sky-500"];

  const seats = [0, 1]; // אתה + בוט
  const shouldRenderFinishedPiece = useFinishFlash(seats, pieces);

  return (
    <div className="w-full h-full flex flex-col sm:flex-row gap-3" ref={containerRef}>
      {/* לוח מרכזי */}
      <div className="flex-1 relative bg-gradient-to-br from-purple-900 via-slate-900 to-black rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center" style={{ aspectRatio: '1/1', width: boardSize ? `${boardSize}px` : 'clamp(520px, min(96vw, 96vh), 820px)', maxWidth: '100%', maxHeight: '100%', flexShrink: 0 }}>
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

