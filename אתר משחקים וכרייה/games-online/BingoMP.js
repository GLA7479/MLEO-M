// games-online/BingoMP.js

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import {
  applyMark,
  buildDeck,
  generateCard,
  isFullComplete,
  isRowComplete,
  makeEmptyMarks,
} from "../lib/bingoEngine";

const BINGO_BUYIN_OPTIONS = {
  "1K": 1_000,
  "10K": 10_000,
  "100K": 100_000,
  "1M": 1_000_000,
  "10M": 10_000_000,
  "100M": 100_000_000,
};

const ROW_BPS = 1200; // 12% per row
const FULL_BPS = 3000; // 30%
const PAYOUT_CAP_BPS = 9000; // 90%
const HOUSE_BPS = 1000; // 10%

// ---------- Vault helpers (same style as Ludo) ----------
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
  } catch {}
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

function keyPaid(sessionId, roundId) {
  return `mleo_bingo_paid:${sessionId}:${roundId}`;
}
function keyCred(sessionId, roundId, prizeKey) {
  return `mleo_bingo_credit:${sessionId}:${roundId}:${prizeKey}`;
}

// ---------- UUID helper ----------
function uuidv4() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // v4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ===========================================================
// PUBLIC ENTRY (Mode selector like Ludo)
// ===========================================================
export default function BingoMP({ roomId, playerName, vault, setVaultBoth, tierCode = "10K" }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.updateVaultCallback = setVaultBoth;
    return () => {
      delete window.updateVaultCallback;
    };
  }, [setVaultBoth]);

  const [mode, setMode] = useState(null); // null | "online" | "local"

  if (!mode) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white">
        <div className="bg-black/70 border border-white/20 rounded-2xl p-4 sm:p-6 max-w-sm w-full flex flex-col gap-4">
          <div className="text-center">
            <div className="text-lg font-semibold mb-1">Bingo</div>
            <div className="text-xs text-white/70">Choose how you want to play</div>
          </div>

          <button
            onClick={() => setMode("online")}
            className="w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold"
          >
            Online • 2–8 Players
          </button>

          <button
            onClick={() => setMode("local")}
            className="w-full px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold"
          >
            Local • same device
          </button>

          <div className="text-[11px] text-white/60 text-center">Vault: {fmt(vault)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col text-white" style={{ overflow: "hidden" }}>
      <div className="flex-1 min-h-0" style={{ overflow: "hidden" }}>
        {mode === "online" && (
          <BingoOnline
            roomId={roomId}
            playerName={playerName}
            vault={vault}
            tierCode={tierCode}
            onBackToMode={() => setMode(null)}
          />
        )}
        {mode === "local" && <BingoLocal vault={vault} onBackToMode={() => setMode(null)} />}
      </div>
    </div>
  );
}

// ===========================================================
// ONLINE MULTIPLAYER (Supabase) - 8 seats
// ===========================================================
function BingoOnline({ roomId, playerName, vault, tierCode, onBackToMode }) {
  const name = playerName || "Guest";

  const baseClientIdRef = useRef(getClientId());
  const clientId = useMemo(() => {
    if (typeof window === "undefined") return baseClientIdRef.current;
    try {
      const SESSION_KEY = "mleo_bingo_tab_id";
      let tabId = sessionStorage.getItem(SESSION_KEY);
      if (!tabId) {
        const suffix =
          window.name && window.name.startsWith("mleo-bingo-tab-")
            ? window.name
            : `mleo-bingo-tab-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
        tabId = suffix;
        sessionStorage.setItem(SESSION_KEY, tabId);
        window.name = suffix;
      }
      return `${baseClientIdRef.current}::${tabId}`;
    } catch {
      return baseClientIdRef.current;
    }
  }, []);

  const entryFee = BINGO_BUYIN_OPTIONS[tierCode] ?? 0;

  const [ses, setSes] = useState(null);
  const [players, setPlayers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [msg, setMsg] = useState("");
  const [timer, setTimer] = useState(10);
  const [announcement, setAnnouncement] = useState("");
  const [announcementColor, setAnnouncementColor] = useState({ bg: "bg-emerald-500/20", border: "border-emerald-400/30", text: "text-emerald-300" }); // default color
  const [lastCalledNumber, setLastCalledNumber] = useState(null); // המספר האחרון שיצא להצגה בולטת

  const autoClaimRef = useRef(new Set());
  const seenClaimIdsRef = useRef(new Set());

  const seatMap = useMemo(() => new Map(players.map((p) => [p.seat_index, p])), [players]);
  const myRow = useMemo(() => players.find((p) => p.client_id === clientId) || null, [players, clientId]);
  const mySeat = myRow?.seat_index ?? null;

  // Caller is the player in the lowest seat index (Seat 1 if taken)
  const callerClientId = useMemo(() => {
    const seated = (players || [])
      .filter((p) => p.seat_index != null)
      .sort((a, b) => a.seat_index - b.seat_index);
    return seated[0]?.client_id || null;
  }, [players]);

  const isCaller = callerClientId === clientId;

  const stage = ses?.stage || "lobby";
  const roundId = ses?.round_id || null;
  const potTotal = Number(ses?.pot_total || 0);
  const platformCut = Math.floor((potTotal * HOUSE_BPS) / 10000);
  const payoutCap = Math.floor((potTotal * PAYOUT_CAP_BPS) / 10000);

  const called = Array.isArray(ses?.called) ? ses.called : [];
  const calledSet = useMemo(() => new Set(called), [called]);

  // my card (deterministic per round + client)
  const cardSeed = useMemo(() => {
    if (!ses?.seed || !roundId) return "";
    return `${ses.seed}::${roundId}::${clientId}`;
  }, [ses?.seed, roundId, clientId]);

  const myCard = useMemo(() => {
    if (!cardSeed) return null;
    return generateCard(cardSeed);
  }, [cardSeed]);

  const [myMarks, setMyMarks] = useState(() => makeEmptyMarks());

  useEffect(() => {
    setMyMarks(makeEmptyMarks());
  }, [cardSeed]);

  const claimedMap = useMemo(() => {
    const m = new Map();
    for (const c of claims) m.set(c.prize_key, c);
    return m;
  }, [claims]);

  // ---------------- win detection by Called (not just Marks) ----------------
  function isCellSatisfied(n, calledSet) {
    // FREE תמיד נחשב "מסומן"
    if (n === 0) return true;
    return calledSet.has(n);
  }

  function isRowWonByCalls(card, calledSet, rowIndex) {
    if (!card) return false;
    for (let c = 0; c < 5; c++) {
      const n = card[rowIndex][c];
      if (!isCellSatisfied(n, calledSet)) return false;
    }
    return true;
  }

  function isFullWonByCalls(card, calledSet) {
    if (!card) return false;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const n = card[r][c];
        if (!isCellSatisfied(n, calledSet)) return false;
      }
    }
    return true;
  }

  // ---------------- ensure session (like Ludo: keep only 1 per room) ----------------
  const ensureSession = useCallback(
    async (room) => {
      const { data: rows } = await supabase
        .from("bingo_sessions")
        .select("*")
        .eq("room_id", room)
        .order("id", { ascending: true });

      if (rows && rows.length > 0) {
        const primary = rows[0];
        const extraIds = rows.slice(1).map((r) => r.id);

        if (extraIds.length > 0) {
          try {
            await supabase.from("bingo_players").update({ session_id: primary.id }).in("session_id", extraIds);
            await supabase.from("bingo_claims").update({ session_id: primary.id }).in("session_id", extraIds);
            await supabase.from("bingo_sessions").delete().in("id", extraIds);
          } catch (e) {
            console.error("ensureSession merge error", e);
          }
        }

        // keep entry_fee synced to tier, but don't override mid-game
        if (primary.stage === "lobby" && Number(primary.entry_fee || 0) !== entryFee) {
          const { data: updated } = await supabase
            .from("bingo_sessions")
            .update({ entry_fee: entryFee })
            .eq("id", primary.id)
            .select()
            .single();
          return updated || primary;
        }

        return primary;
      }

      const baseSession = {
        room_id: room,
        stage: "lobby",
        seat_count: 8,
        entry_fee: entryFee,
        house_bps: HOUSE_BPS,
        active_seats: [],
        pot_total: 0,
        deck: [],
        deck_pos: 0,
        called: [],
        last_number: null,
        seed: `bingo:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      };

      const { data: inserted, error } = await supabase
        .from("bingo_sessions")
        .insert(baseSession)
        .select()
        .single();

      if (error && !inserted) {
        const { data: rows2 } = await supabase
          .from("bingo_sessions")
          .select("*")
          .eq("room_id", room)
          .order("id", { ascending: true });
        return rows2?.[0] ?? null;
      }
      return inserted;
    },
    [entryFee]
  );

  const refreshPlayers = useCallback(
    async (sessionId) => {
      const { data } = await supabase
        .from("bingo_players")
        .select("*")
        .eq("session_id", sessionId)
        .order("seat_index");
      setPlayers(data || []);
    },
    []
  );

  const refreshClaims = useCallback(
    async (sessionId, rId) => {
      if (!sessionId) {
        setClaims([]);
        return;
      }
      // אם יש round_id - רענון רק של הסיבוב הנוכחי, אחרת כל ה-claims
      let query = supabase
        .from("bingo_claims")
        .select("*")
        .eq("session_id", sessionId);
      
      if (rId) {
        query = query.eq("round_id", rId);
      }
      
      const { data } = await query.order("id", { ascending: true });
      if (data) {
        setClaims(data);
      }
    },
    []
  );

  // ---------------- seating ----------------
  const takeSeat = useCallback(
    async (seatIndex) => {
      if (!clientId) return;

      const vaultNow = currentVaultBalance(vault);
      if (vaultNow < entryFee) {
        setMsg(`Need at least ${fmt(entryFee)} in vault`);
        return;
      }

      let session = ses;
      if (!session || !session.id) {
        session = await ensureSession(roomId);
        setSes(session);
      }
      if (!session || !session.id) {
        setMsg("Failed to load room");
        return;
      }

      // update old client ids (base -> tabbed)
      await supabase
        .from("bingo_players")
        .update({ client_id: clientId })
        .eq("session_id", session.id)
        .eq("client_id", baseClientIdRef.current);

      const { data: occupied } = await supabase
        .from("bingo_players")
        .select("id,client_id")
        .eq("session_id", session.id)
        .eq("seat_index", seatIndex)
        .maybeSingle();

      if (occupied && occupied.client_id && occupied.client_id !== clientId) {
        setMsg("Seat taken");
        return;
      }

      const { data: mine } = await supabase
        .from("bingo_players")
        .select("id,seat_index")
        .eq("session_id", session.id)
        .eq("client_id", clientId)
        .maybeSingle();

      if (mine && mine.seat_index !== seatIndex) {
        await supabase.from("bingo_players").update({ seat_index: seatIndex, player_name: name }).eq("id", mine.id);
      } else if (!mine) {
        await supabase.from("bingo_players").insert({
          session_id: session.id,
          seat_index: seatIndex,
          player_name: name,
          client_id: clientId,
        });
      }

      await refreshPlayers(session.id);
      setMsg("");
    },
    [clientId, vault, entryFee, ensureSession, roomId, ses, name, refreshPlayers]
  );

  const leaveSeat = useCallback(async () => {
    if (!ses?.id || !clientId) return;
    // money is NOT refunded (burned) if you don't return.
    await supabase.from("bingo_players").delete().eq("session_id", ses.id).eq("client_id", clientId);
    await refreshPlayers(ses.id);
  }, [ses?.id, clientId, refreshPlayers]);

  // ---------------- start game ----------------
  const startGame = useCallback(async () => {
    if (!ses?.id) return;

    // רק lobby או finished יכולים להתחיל משחק חדש
    if (ses.stage !== "lobby" && ses.stage !== "finished") {
      setMsg("Game already in progress");
      return;
    }

    const { data: freshPlayers } = await supabase
      .from("bingo_players")
      .select("*")
      .eq("session_id", ses.id)
      .order("seat_index");
    const seated = (freshPlayers || []).filter((p) => p.seat_index != null);

    if (seated.length < 2) {
      setMsg("Need at least 2 players seated");
      return;
    }

    const activeSeats = [...new Set(seated.map((p) => p.seat_index))].sort((a, b) => a - b);

    // new round
    const newRoundId = uuidv4();
    const newSeed = `bingo:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    const deck = buildDeck(`${newSeed}::${newRoundId}`);
    const prizePool = entryFee * activeSeats.length;

    const { data, error } = await supabase
      .from("bingo_sessions")
      .update({
        stage: "playing",
        round_id: newRoundId,
        seed: newSeed,
        active_seats: activeSeats,
        pot_total: prizePool,
        deck,
        deck_pos: 0,
        called: [],
        last_number: null,
        winner_client_id: null,
        winner_name: null,
        started_at: new Date().toISOString(),
        finished_at: null,
      })
      .eq("id", ses.id)
      .in("stage", ["lobby", "finished"]) // מאפשר גם lobby וגם finished
      .select();

    if (error) {
      console.error(error);
      setMsg(error.message || "Failed to start");
      return;
    }

    if (!data || data.length === 0) {
      // מישהו כבר התחיל / כבר playing -> תטען את הסשן הקיים במקום לזרוק שגיאה
      const { data: fresh } = await supabase
        .from("bingo_sessions")
        .select("*")
        .eq("id", ses.id)
        .single();
      if (fresh) setSes(fresh);
      setMsg("Game already started");
      return;
    }

    // נקה את claims הישנים (למשחק החדש) - מחק את כל ה-claims של הסשן
    await supabase
      .from("bingo_claims")
      .delete()
      .eq("session_id", ses.id);

    // נקה את ה-refs עבור המשחק החדש
    autoClaimRef.current.clear();
    seenClaimIdsRef.current.clear();

    setSes(data[0]);
    setPlayers(freshPlayers || []);
    setMsg("");
    setAnnouncement(""); // נקה הכרזות ישנות
  }, [ses?.id, ses?.stage, entryFee]);


  // ---------------- local payment when round starts (burn if you leave) ----------------
  useEffect(() => {
    if (!ses?.id || ses.stage !== "playing" || !ses.round_id) return;
    if (mySeat == null) return;

    const active = Array.isArray(ses.active_seats) ? ses.active_seats : [];
    if (!active.includes(mySeat)) return;

    const k = keyPaid(ses.id, ses.round_id);
    const alreadyPaid = typeof window !== "undefined" ? window.localStorage.getItem(k) === "1" : false;
    if (alreadyPaid) return;

    const vaultNow = currentVaultBalance(vault);
    if (vaultNow < entryFee) {
      setMsg(`Not enough vault for entry (${fmt(entryFee)})`);
      return;
    }

    // charge once per round
    writeVault(vaultNow - entryFee);
    if (typeof window !== "undefined") window.localStorage.setItem(k, "1");
  }, [ses?.id, ses?.stage, ses?.round_id, ses?.active_seats, mySeat, vault, entryFee]);

  // ---------------- mark number (only called numbers can be marked) ----------------
  const onCellClick = useCallback(
    (n) => {
      if (!myCard) return;
      if (ses?.stage !== "playing") return;
      // Only allow marking numbers that were called
      if (!calledSet.has(n)) return;
      const { marks, changed } = applyMark(myCard, myMarks, n);
      if (changed) setMyMarks(marks);
    },
    [myCard, myMarks, calledSet, ses?.stage]
  );

  // ---------------- claim prize (row/full) ----------------
  const claimPrize = useCallback(
    async (prizeKey) => {
      if (!ses?.id || ses.stage !== "playing" || !ses.round_id) return;
      if (mySeat == null) return;
      if (!myCard) return;

      // client-side validation: רק לפי סימון ידני (Marks) - בדיקה מדויקת תא אחר תא
      if (prizeKey.startsWith("row")) {
        const r = Number(prizeKey.replace("row", "")) - 1;
        if (r < 0 || r > 4) return;

        // בדיקה תא אחר תא - כל התאים בשורה חייבים להיות מסומנים
        if (!myMarks || myMarks.length !== 25) {
          setMsg("Row not complete yet - mark all numbers in the row");
          return;
        }
        for (let c = 0; c < 5; c++) {
          const idx = r * 5 + c;
          if (!myMarks[idx]) {
            setMsg("Row not complete yet - mark all numbers in the row");
            return;
          }
        }
      } else if (prizeKey === "full") {
        // בדיקה תא אחר תא - כל 25 התאים חייבים להיות מסומנים
        if (!myMarks || myMarks.length !== 25) {
          setMsg("Full board not complete yet - mark all numbers");
          return;
        }
        for (let i = 0; i < 25; i++) {
          if (!myMarks[i]) {
            setMsg("Full board not complete yet - mark all numbers");
            return;
          }
        }
      }

      setMsg("");

      const { data, error } = await supabase.rpc("bingo_claim_prize", {
        p_session_id: ses.id,
        p_round_id: ses.round_id,
        p_prize_key: prizeKey,
        p_client_id: clientId,
        p_player_name: name,
      });

      if (error) {
        setMsg(error.message || "Claim failed");
        return;
      }

      // credit vault ONCE
      const amount = Number(data || 0);
      const credKey = keyCred(ses.id, ses.round_id, prizeKey);
      const alreadyCred = typeof window !== "undefined" ? window.localStorage.getItem(credKey) === "1" : false;
      if (!alreadyCred && amount > 0) {
        const cur = readVault();
        writeVault(cur + amount);
        if (typeof window !== "undefined") window.localStorage.setItem(credKey, "1");
      }

      // אם זה FULL BOARD - המשחק הסתיים, עדכן את ה-session state
      if (prizeKey === "full") {
        const { data: freshSes } = await supabase
          .from("bingo_sessions")
          .select("*")
          .eq("id", ses.id)
          .single();
        if (freshSes) {
          setSes(freshSes);
        }
      }

      await refreshClaims(ses.id, ses.round_id);
    },
    [ses?.id, ses?.stage, ses?.round_id, mySeat, myMarks, myCard, calledSet, clientId, name, refreshClaims]
  );

  // ---------------- auto-claim (rows + full) based on manual marks only ----------------
  useEffect(() => {
    if (!ses?.id || !ses?.round_id) return;
    if (ses.stage !== "playing") return;
    if (!myCard) return;
    if (!myMarks || myMarks.length !== 25) return; // ודא ש-myMarks תקין

    // השתמש ב-setTimeout כדי לוודא שה-state התעדכן לגמרי לפני בדיקה
    // זמן ארוך יותר כדי לוודא שהסימון האחרון כבר נוסף ל-state
    const timeoutId = setTimeout(() => {
      if (!myMarks || myMarks.length !== 25) return;

      const tryAuto = (key) => {
        // אם כבר נטען ב-DB שמישהו לקח — לא לנסות
        if (claimedMap.has(key)) return;

        // מנגנון נעילה מקומי כדי לא לשלוח שוב ושוב
        const lock = `${ses.id}:${ses.round_id}:${key}`;
        if (autoClaimRef.current.has(lock)) return;

        // בדיקה מדויקת - כל התאים חייבים להיות מסומנים
        // קריאה נוספת ל-myMarks מהקונטקסט העדכני
        const currentMarks = myMarks;
        if (!currentMarks || currentMarks.length !== 25) return;

        if (key.startsWith("row")) {
          const r = Number(key.replace("row", "")) - 1;
          if (r < 0 || r > 4) return;
          // בדיקה תא אחר תא - חייבים כל 5 התאים בשורה להיות מסומנים
          for (let c = 0; c < 5; c++) {
            const idx = r * 5 + c;
            if (!currentMarks[idx]) {
              return; // אם תא אחד לא מסומן - לא לנסות
            }
          }
        } else if (key === "full") {
          // בדיקה מדויקת - כל 25 התאים חייבים להיות מסומנים (כולל FREE ב-12)
          for (let i = 0; i < 25; i++) {
            if (!currentMarks[i]) {
              return; // אם תא אחד לא מסומן - לא לנסות
            }
          }
        } else {
          return;
        }

        // רק אם כל התאים מסומנים - תביעה
        autoClaimRef.current.add(lock);
        claimPrize(key);
      };

      // תבע שורות
      tryAuto("row1");
      tryAuto("row2");
      tryAuto("row3");
      tryAuto("row4");
      tryAuto("row5");

      // תבע FULL (זה יסיים את המשחק ב-DB)
      tryAuto("full");
    }, 200); // המתן 200ms כדי לוודא שה-state התעדכן לגמרי

    return () => clearTimeout(timeoutId);
  }, [
    ses?.id,
    ses?.round_id,
    ses?.stage,
    myMarks, // חשוב: האפקט ירוץ כשהסימונים משתנים (שחקן מסמן)
    myCard,
    claimedMap,
    claimPrize,
  ]);

  // ---------------- announcement when someone wins ----------------
  useEffect(() => {
    if (!claims || claims.length === 0) return;

    // מצא claims חדשים שעוד לא הוצגו
    const fresh = claims
      .filter((c) => c?.id != null && !seenClaimIdsRef.current.has(c.id))
      .sort((a, b) => a.id - b.id);

    if (fresh.length === 0) return;

    // סמן כ"נראו"
    for (const c of fresh) seenClaimIdsRef.current.add(c.id);

    // הכרז על האחרון (או תעשה תור אם אתה רוצה)
    const last = fresh[fresh.length - 1];

    // מצא את הכסא של המנצח לפי client_id
    const winnerPlayer = last?.claimed_by_client_id 
      ? players.find(p => p.client_id === last.claimed_by_client_id)
      : null;
    const winnerSeatIndex = winnerPlayer?.seat_index ?? null;
    
    // צבעים לפי כסא
    const seatColorMap = {
      0: { bg: "bg-red-500/20", border: "border-red-400/30", text: "text-red-300" }, // Seat 1 - אדום
      1: { bg: "bg-blue-500/20", border: "border-blue-400/30", text: "text-blue-300" }, // Seat 2 - כחול
      2: { bg: "bg-green-500/20", border: "border-green-400/30", text: "text-green-300" }, // Seat 3 - ירוק
      3: { bg: "bg-yellow-500/20", border: "border-yellow-400/30", text: "text-yellow-300" }, // Seat 4 - צהוב
      4: { bg: "bg-purple-500/20", border: "border-purple-400/30", text: "text-purple-300" }, // Seat 5 - סגול
      5: { bg: "bg-cyan-500/20", border: "border-cyan-400/30", text: "text-cyan-300" }, // Seat 6 - ציאן
      6: { bg: "bg-orange-500/20", border: "border-orange-400/30", text: "text-orange-300" }, // Seat 7 - כתום
      7: { bg: "bg-fuchsia-500/20", border: "border-fuchsia-400/30", text: "text-fuchsia-300" }, // Seat 8 - פוקסיה
    };
    
    const color = winnerSeatIndex != null && seatColorMap[winnerSeatIndex]
      ? seatColorMap[winnerSeatIndex]
      : { bg: "bg-emerald-500/20", border: "border-emerald-400/30", text: "text-emerald-300" }; // default

    const label =
      last.prize_key === "full"
        ? "🏆 FULL BOARD"
        : `🎉 ROW ${Number(last.prize_key.replace("row", ""))}`;

    setAnnouncement(`${label} — ${last.claimed_by_name} won +${fmt(last.amount)} MLEO`);
    setAnnouncementColor(color);
    setTimeout(() => {
      setAnnouncement("");
      setAnnouncementColor({ bg: "bg-emerald-500/20", border: "border-emerald-400/30", text: "text-emerald-300" });
    }, 3500);
  }, [claims, players]);

  // ---------------- realtime subscriptions ----------------
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const ch = supabase
      .channel("bingo_sessions:" + roomId)
      .on("postgres_changes", { event: "*", schema: "public", table: "bingo_sessions", filter: `room_id=eq.${roomId}` }, async () => {
        const primary = await ensureSession(roomId);
        if (!cancelled) setSes(primary || null);
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const primary = await ensureSession(roomId);
          if (!cancelled) setSes(primary || null);
          await ch.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });

    return () => {
      cancelled = true;
      ch.unsubscribe();
    };
  }, [roomId, name, ensureSession]);

  useEffect(() => {
    if (!ses?.id) return;

    const ch = supabase
      .channel("bingo_players:" + ses.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "bingo_players", filter: `session_id=eq.${ses.id}` }, async () => {
        await refreshPlayers(ses.id);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await refreshPlayers(ses.id);
      });

    return () => ch.unsubscribe();
  }, [ses?.id, refreshPlayers]);

  useEffect(() => {
    if (!ses?.id) return;
    if (!ses?.round_id) {
      setClaims([]);
      return;
    }

    const ch = supabase
      .channel("bingo_claims:" + ses.id + ":" + ses.round_id)
      .on("postgres_changes", { 
        event: "*", 
        schema: "public", 
        table: "bingo_claims", 
        filter: `session_id=eq.${ses.id}` 
      }, async (payload) => {
        // רענון מיידי כשמתעדכן claim
        if (payload.new?.round_id === ses.round_id || payload.old?.round_id === ses.round_id) {
          await refreshClaims(ses.id, ses.round_id);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await refreshClaims(ses.id, ses.round_id);
        }
      });

    // פולינג נוסף ל-claims כדי לוודא שהעדכונים מגיעים מיד (גם בלי Realtime)
    const pollInterval = setInterval(async () => {
      if (ses?.id && ses?.round_id) {
        await refreshClaims(ses.id, ses.round_id);
      }
    }, 1000); // כל שנייה - תדירות גבוהה יותר

    return () => {
      ch.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [ses?.id, ses?.round_id, refreshClaims]);

  // ---------------- auto call next number every 10 seconds (only caller) ----------------
  useEffect(() => {
    if (!ses?.id) return;

    // only the caller activates the timer
    if (!isCaller) return;

    // only during gameplay
    if (ses.stage !== "playing") return;

    const interval = setInterval(async () => {
      // קרא מצב טרי
      const { data: fresh } = await supabase
        .from("bingo_sessions")
        .select("id, stage, deck, deck_pos, called")
        .eq("id", ses.id)
        .single();

      if (!fresh || fresh.stage !== "playing") return;

      const pos = Number(fresh.deck_pos || 0);
      const deck = Array.isArray(fresh.deck) ? fresh.deck : [];
      if (pos >= deck.length) return;

      const next = deck[pos];
      const nextCalled = [...(Array.isArray(fresh.called) ? fresh.called : []), next];

      // עדכן DB
      const { error: updErr } = await supabase
        .from("bingo_sessions")
        .update({
          deck_pos: pos + 1,
          last_number: next,
          called: nextCalled,
        })
        .eq("id", fresh.id);

      if (!updErr) {
        // ⭐ הכי חשוב: עדכן גם לוקאלית כדי שתראה שינוי גם בלי Realtime
        setSes((prev) => ({
          ...(prev || {}),
          deck_pos: pos + 1,
          last_number: next,
          called: nextCalled,
        }));
      }
    }, 10000); // ⭐ 10 שניות

    return () => clearInterval(interval);
  }, [ses?.id, ses?.stage, isCaller]);

  // ---------------- display last called number prominently for 5 seconds ----------------
  useEffect(() => {
    if (ses?.last_number && ses.stage === "playing") {
      setLastCalledNumber(ses.last_number);
      // התחל את הטיימר מ-10 מיד כשהמספר מוצג
      setTimer(10);
      const timeout = setTimeout(() => {
        setLastCalledNumber(null);
      }, 5000); // 5 שניות
      return () => clearTimeout(timeout);
    } else {
      setLastCalledNumber(null);
    }
  }, [ses?.last_number, ses?.stage]);

  // ---------------- timer countdown (10 seconds) ----------------
  useEffect(() => {
    if (!ses?.id || ses.stage !== "playing") {
      setTimer(10);
      return;
    }

    // התחל את הטיימר - הוא ממשיך לספור גם כשהמספר מוצג
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          // כשהטיימר מגיע ל-0, המספר יקרא אוטומטית (על ידי ה-interval של הקריאה)
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [ses?.id, ses?.stage]);

  // ---------------- polling for all players (to see numbers and claims without Realtime) ----------------
  useEffect(() => {
    if (!ses?.id) return;

    const t = setInterval(async () => {
      // רענון session
      const { data } = await supabase
        .from("bingo_sessions")
        .select("*")
        .eq("id", ses.id)
        .single();
      if (data) {
        setSes(data);
        // reset timer when new number appears
        if (data.last_number !== ses?.last_number) {
          setTimer(5);
        }
      }
      
      // רענון players (חשוב לצבעים)
      if (ses?.id) {
        await refreshPlayers(ses.id);
      }
      
      // רענון claims (חשוב להצגת זכיות)
      if (ses?.round_id) {
        await refreshClaims(ses.id, ses.round_id);
      }
    }, 1000); // כל שנייה - תדירות גבוהה יותר לעדכונים מיידיים

    return () => clearInterval(t);
  }, [ses?.id, ses?.last_number, ses?.round_id, refreshClaims, refreshPlayers]);

  // initial load
  useEffect(() => {
    (async () => {
      if (!roomId) return;
      const primary = await ensureSession(roomId);
      setSes(primary || null);
      if (primary?.id) {
        await refreshPlayers(primary.id);
        await refreshClaims(primary.id, primary.round_id || null);
      }
    })();
  }, [roomId, ensureSession, refreshPlayers, refreshClaims]);

  if (!roomId) {
    return (
      <div className="w-full h-full grid place-items-center text-white/70 text-sm">
        Select or create a room.
      </div>
    );
  }

  const seats = 8;
  const rowPrize = Math.floor((potTotal * ROW_BPS) / 10000);
  const fullPrize = Math.floor((potTotal * FULL_BPS) / 10000);

  return (
    <div className="w-full h-full flex flex-col gap-2 p-3 relative" style={{ height: "100%", overflow: "hidden" }}>
      {/* Seats */}
      <div className="w-full overflow-x-auto flex-shrink-0">
        <div className="flex gap-1 text-[9px] min-w-[420px]">
          {Array.from({ length: seats }).map((_, idx) => {
            const row = seatMap.get(idx) || null;
            const isMe = row?.client_id === clientId;
            // 8 צבעים שונים לכל כסא - רקע מלא ובולט
            const seatColors = [
              "bg-red-600 border-red-400 text-white",      // Seat 1 - אדום
              "bg-blue-600 border-blue-400 text-white",    // Seat 2 - כחול
              "bg-green-600 border-green-400 text-white",  // Seat 3 - ירוק
              "bg-yellow-500 border-yellow-300 text-white", // Seat 4 - צהוב
              "bg-purple-600 border-purple-400 text-white", // Seat 5 - סגול
              "bg-cyan-600 border-cyan-400 text-white",    // Seat 6 - ציאן
              "bg-orange-600 border-orange-400 text-white", // Seat 7 - כתום
              "bg-fuchsia-500 border-fuchsia-400 text-white",    // Seat 8 - פוקסיה
            ];
            const seatColorClass = seatColors[idx] || "bg-gray-600 border-gray-400 text-white";
            
            return (
              <button
                key={idx}
                onClick={() => (!row ? takeSeat(idx) : null)}
                className={`${seatColorClass} border-2 rounded-md px-2 py-1 flex flex-col items-center justify-center text-[10px] font-semibold transition flex-1 ${
                  isMe ? "shadow-lg ring-2 ring-white ring-offset-1 ring-offset-black" : ""
                } ${!row ? "opacity-75" : "hover:brightness-110"}`}
              >
                <span className="font-bold text-white drop-shadow">{`Seat ${idx + 1}`}</span>
                <span className="text-white drop-shadow">{row?.player_name || "Empty"}{isMe ? " (You)" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Header / Controls */}
      <div className="bg-black/40 rounded-xl p-3 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex flex-col">
          <div className="text-sm font-semibold">Bingo Online</div>
          <div className="text-xs text-white/60">Last: {ses?.last_number ?? "-"}</div>
          {stage === "playing" && (
            <div className="text-xs font-bold text-amber-400 mt-1">
              Next number in: {timer}s
            </div>
          )}
        </div>

        {/* Center: Last called number display */}
        <div className="flex-1 flex items-center justify-center min-h-[60px] relative">
          {lastCalledNumber ? (
            <div className="absolute bg-emerald-500/95 border-2 border-emerald-400 text-white text-center font-bold rounded-lg px-4 py-2 shadow-lg shadow-emerald-500/50 animate-pulse">
              <div className="text-2xl mb-0.5">{lastCalledNumber}</div>
              <div className="text-[10px]">Number Called!</div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {mySeat != null && (
            <button onClick={leaveSeat} className="px-3 py-1 rounded bg-red-600/80 hover:bg-red-500 text-xs">
              Leave
            </button>
          )}

          {(stage === "lobby" || stage === "finished") && (
            <button 
              onClick={startGame} 
              className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-xs"
              title={stage === "finished" ? "Start new game (requires 2+ players)" : "Start game (requires 2+ players)"}
            >
              {stage === "finished" ? "New Game" : "Start Game"}
            </button>
          )}

          <button onClick={onBackToMode} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">
            Mode
          </button>
        </div>
      </div>

      {announcement ? (
        <div className={`${announcementColor.bg} ${announcementColor.border} ${announcementColor.text} text-xs text-center font-semibold border rounded-lg p-2`}>
          {announcement}
        </div>
      ) : null}

      {msg ? <div className="text-amber-300 text-xs text-center">{msg}</div> : null}

      {/* Main area */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2 overflow-hidden relative">
        {/* Card */}
        <div className="bg-black/40 rounded-xl p-1 overflow-auto">
          {!myRow ? (
            <div className="w-full h-full grid place-items-center text-white/60 text-xs">Take a seat to get your card.</div>
          ) : !myCard ? (
            <div className="w-full h-full grid place-items-center text-white/60 text-xs">Waiting for game…</div>
          ) : (
            <BingoCard
              title="Your card"
              card={myCard}
              marks={myMarks}
              calledSet={calledSet}
              onCellClick={onCellClick}
              lastNumber={ses?.last_number}
            />
          )}
        </div>

        {/* Called list */}
        <div className="bg-black/40 rounded-xl p-2 overflow-auto">
          <div className="text-xs font-semibold mb-1">Called</div>
          <div className="flex flex-wrap gap-1">
            {called.length ? called.slice().reverse().map((n, idx) => {
              const isLast = idx === 0; // First in reversed array is the last called
              return (
                <span
                  key={`${n}-${idx}`}
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                    isLast
                      ? "bg-emerald-500/80 border-emerald-400 text-white shadow-lg shadow-emerald-500/50"
                      : "bg-white/10 border-white/10"
                  }`}
                >
                  {n}
                </span>
              );
            }) : <div className="text-white/60 text-xs">No numbers yet</div>}
          </div>
        </div>
      </div>

    {/* Claims at bottom */}
    <div className="bg-black/30 rounded-xl p-3 flex flex-col gap-2 flex-shrink-0">
      <div className="text-xs text-white/70 flex items-center justify-between">
        <span>Prizes</span>
      </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {["row1","row2","row3","row4","row5"].map((k, i) => {
            const claim = claimedMap.get(k);
            const claimed = !!claim; // צובע רק אם יש זכייה אמיתית
            // מצא את הכסא של המנצח לפי client_id
            const winnerPlayer = claim?.claimed_by_client_id 
              ? players.find(p => p.client_id === claim.claimed_by_client_id)
              : null;
            const winnerSeatIndex = winnerPlayer?.seat_index ?? null;
            
            // צבעים לפי כסא (אותם צבעים כמו הכסאות)
            const seatColors = [
              "bg-red-600 border-red-400 text-white",      // Seat 1 - אדום
              "bg-blue-600 border-blue-400 text-white",    // Seat 2 - כחול
              "bg-green-600 border-green-400 text-white",  // Seat 3 - ירוק
              "bg-yellow-500 border-yellow-300 text-white", // Seat 4 - צהוב
              "bg-purple-600 border-purple-400 text-white", // Seat 5 - סגול
              "bg-cyan-600 border-cyan-400 text-white",    // Seat 6 - ציאן
              "bg-orange-600 border-orange-400 text-white", // Seat 7 - כתום
              "bg-fuchsia-500 border-fuchsia-400 text-white",    // Seat 8 - פוקסיה
            ];
            const winnerColorClass = winnerSeatIndex != null && winnerSeatIndex < seatColors.length
              ? seatColors[winnerSeatIndex]
              : "bg-sky-600/70 border-sky-400 text-white";
            
            return (
              <button
                key={k}
                onClick={() => claimPrize(k)}
                disabled={stage !== "playing" || claimed}
                className={`px-2 py-1 rounded border-2 hover:brightness-110 disabled:opacity-50 text-[11px] font-semibold ${
                  claimed ? winnerColorClass : "bg-slate-800/60 border-white/20 text-white/70"
                }`}
                title={claimed ? `Claimed by ${claim?.claimed_by_name}` : "Claim this row"}
              >
                Row {i + 1}
              </button>
            );
          })}
          {(() => {
            const fullClaim = claimedMap.get("full");
            const fullWinnerPlayer = fullClaim?.claimed_by_client_id 
              ? players.find(p => p.client_id === fullClaim.claimed_by_client_id)
              : null;
            const fullWinnerSeatIndex = fullWinnerPlayer?.seat_index ?? null;
            
            const seatColors = [
              "bg-red-600 border-red-400 text-white",
              "bg-blue-600 border-blue-400 text-white",
              "bg-green-600 border-green-400 text-white",
              "bg-yellow-500 border-yellow-300 text-white",
              "bg-purple-600 border-purple-400 text-white",
              "bg-cyan-600 border-cyan-400 text-white",
              "bg-orange-600 border-orange-400 text-white",
              "bg-fuchsia-500 border-fuchsia-400 text-white",
            ];
            const fullWinnerColorClass = fullWinnerSeatIndex != null && fullWinnerSeatIndex < seatColors.length
              ? seatColors[fullWinnerSeatIndex]
              : "bg-purple-600/70 border-purple-400 text-white";
            
            const fullClaimed = claimedMap.has("full"); // צובע רק אם יש זכייה אמיתית

            return (
              <button
                onClick={() => claimPrize("full")}
                disabled={stage !== "playing" || fullClaimed}
                className={`px-2 py-1 rounded border-2 hover:brightness-110 disabled:opacity-50 text-[11px] font-semibold ${
                  fullClaimed ? fullWinnerColorClass : "bg-slate-800/60 border-white/20 text-white/70"
                }`}
                title={fullClaimed ? `Claimed by ${fullClaim?.claimed_by_name}` : "Claim FULL board"}
              >
                FULL
              </button>
            );
          })()}
        </div>

        {stage === "finished" && (
          <div className="text-xs text-emerald-300 text-center">
            Winner: {ses?.winner_name || "Unknown"}
          </div>
        )}
      </div>

      {/* Details footer */}
      <div className="bg-black/20 rounded-xl p-3 flex flex-col gap-1 flex-shrink-0 text-xs text-white/70">
        <div className="text-sm font-semibold text-white">Details</div>
        <div>Stage: {stage} • Last: {ses?.last_number ?? "-"}</div>
        <div>Entry: {fmt(entryFee)} • Prize Pool: {fmt(potTotal)} • Platform: {fmt(platformCut)}</div>
        <div>Row: {fmt(rowPrize)} • Full: {fmt(fullPrize)} • Cap: {fmt(payoutCap)}</div>
        <div>Room: {roomId}</div>
      </div>
    </div>
  );
}

// ===========================================================
// LOCAL (same device) - prizes row1..row5 + full, total ≤90%
// ===========================================================
function BingoLocal({ vault, onBackToMode }) {
  const [playerCount, setPlayerCount] = useState(2);
  const [stage, setStage] = useState("setup"); // setup | playing | finished
  const [seed, setSeed] = useState("");
  const [deck, setDeck] = useState([]);
  const [deckPos, setDeckPos] = useState(0);
  const [called, setCalled] = useState([]);
  const calledSet = useMemo(() => new Set(called), [called]);
  const [last, setLast] = useState(null);

  const [activePlayer, setActivePlayer] = useState(0);
  const [winner, setWinner] = useState(null);

  // local entry fee: use tier-like fixed values (you can change to match your UI)
  const entryFee = 10_000;

  const potTotal = entryFee * playerCount;
  const platformCut = Math.floor((potTotal * HOUSE_BPS) / 10000);
  const rowPrize = Math.floor((potTotal * ROW_BPS) / 10000);
  const fullPrize = Math.floor((potTotal * FULL_BPS) / 10000);

  const cards = useMemo(() => {
    if (!seed) return [];
    return Array.from({ length: playerCount }, (_, i) => generateCard(`${seed}::local::p${i}`));
  }, [seed, playerCount]);

  const [marks, setMarks] = useState([]);
  const [claimed, setClaimed] = useState({
    row1: null, row2: null, row3: null, row4: null, row5: null, full: null
  });

  useEffect(() => {
    if (!seed) return;
    setMarks(Array.from({ length: playerCount }, () => makeEmptyMarks()));
  }, [seed, playerCount]);

  function start() {
    // charge local vault once for THIS device if you want single-player vault:
    const vaultNow = currentVaultBalance(vault);
    const totalCost = entryFee * playerCount; // single device pays for all (local mode)
    if (vaultNow < totalCost) return;

    writeVault(vaultNow - totalCost);

    const s = `bingo-local:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    setSeed(s);
    const d = buildDeck(s);
    setDeck(d);
    setDeckPos(0);
    setCalled([]);
    setLast(null);
    setWinner(null);
    setClaimed({ row1: null, row2: null, row3: null, row4: null, row5: null, full: null });
    setStage("playing");
  }

  function reset() {
    setStage("setup");
    setSeed("");
    setDeck([]);
    setDeckPos(0);
    setCalled([]);
    setLast(null);
    setWinner(null);
    setClaimed({ row1: null, row2: null, row3: null, row4: null, row5: null, full: null });
    setMarks([]);
    setActivePlayer(0);
  }

  function callNext() {
    if (stage !== "playing") return;
    if (deckPos >= deck.length) return;
    const n = deck[deckPos];
    setDeckPos((p) => p + 1);
    setCalled((prev) => [...prev, n]);
    setLast(n);
  }

  function onMark(playerIndex, n) {
    if (stage !== "playing") return;
    // Only allow marking numbers that were called
    if (!calledSet.has(n)) return;

    setMarks((prev) => {
      const next = [...prev];
      const { marks: nextMarks } = applyMark(cards[playerIndex], next[playerIndex], n);
      next[playerIndex] = nextMarks;
      return next;
    });
  }

  function claimLocal(prizeKey) {
    if (stage !== "playing") return;
    if (claimed[prizeKey] != null) return;

    const m = marks[activePlayer] || makeEmptyMarks();

    if (prizeKey.startsWith("row")) {
      const r = Number(prizeKey.replace("row", "")) - 1;
      if (!isRowComplete(m, r)) return;
      setClaimed((c) => ({ ...c, [prizeKey]: activePlayer }));
      writeVault(readVault() + rowPrize);
      return;
    }

    if (prizeKey === "full") {
      if (!isFullComplete(m)) return;
      setClaimed((c) => ({ ...c, full: activePlayer }));
      writeVault(readVault() + fullPrize);
      setWinner(activePlayer);
      setStage("finished");
    }
  }

  return (
    <div className="w-full h-full flex flex-col gap-2 p-3" style={{ height: "100%", overflow: "hidden" }}>
      <div className="bg-black/40 rounded-xl p-3 flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex flex-col">
          <div className="text-sm font-semibold">Bingo Local</div>
          <div className="text-xs text-white/60">Stage: {stage}</div>
          <div className="text-xs text-white/60">
            Entry: {fmt(entryFee)} • Prize Pool: {fmt(potTotal)} • Platform: {fmt(platformCut)} • Last: {last ?? "-"}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {stage === "setup" ? (
            <>
              <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-white/20 bg-white/5">
                <span className="text-white/60 text-[10px] uppercase tracking-wide">Players</span>
                {[2,3,4,5,6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPlayerCount(n)}
                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                      playerCount === n ? "bg-emerald-500/50 text-white border border-emerald-300/70" : "bg-white/10 border border-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button onClick={start} className="px-3 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-xs">
                Start
              </button>
            </>
          ) : (
            <>
              <button onClick={callNext} disabled={stage !== "playing"} className="px-3 py-1 rounded bg-amber-500/80 hover:bg-amber-400 disabled:opacity-50 text-xs">
                Call next
              </button>
              <button onClick={reset} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">
                Reset
              </button>
            </>
          )}

          <button onClick={onBackToMode} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs">
            Mode
          </button>
        </div>
      </div>

      {winner != null && (
        <div className="bg-emerald-500/20 border border-emerald-300/30 rounded-xl p-3 text-center flex-shrink-0">
          <div className="text-sm font-semibold">Winner: Player {winner + 1} 🎉</div>
        </div>
      )}

      {stage !== "setup" && (
        <div className="flex gap-2 flex-wrap justify-center flex-shrink-0">
          {Array.from({ length: playerCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => setActivePlayer(i)}
              className={`px-3 py-1 rounded-full text-xs border ${
                activePlayer === i ? "bg-sky-600/70 border-sky-300/60" : "bg-white/10 border-white/20"
              }`}
            >
              Player {i + 1}
            </button>
          ))}
        </div>
      )}

      {stage !== "setup" && (
        <div className="bg-black/30 rounded-xl p-3 flex flex-col gap-2 flex-shrink-0">
          <div className="text-xs text-white/70">
            Row prize: {fmt(rowPrize)} • Full prize: {fmt(fullPrize)} • Prize cap (90%): {fmt(Math.floor((potTotal * PAYOUT_CAP_BPS) / 10000))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {["row1","row2","row3","row4","row5"].map((k, i) => {
              const winnerIndex = claimed[k];
              // צבעים לפי שחקן (מתאים לכסאות)
              const playerColors = [
                "bg-red-600 border-red-400 text-white",      // Player 1 - אדום
                "bg-blue-600 border-blue-400 text-white",    // Player 2 - כחול
                "bg-green-600 border-green-400 text-white",  // Player 3 - ירוק
                "bg-yellow-500 border-yellow-300 text-white", // Player 4 - צהוב
                "bg-purple-600 border-purple-400 text-white", // Player 5 - סגול
                "bg-cyan-600 border-cyan-400 text-white",    // Player 6 - ציאן
              ];
              const winnerColorClass = winnerIndex != null && winnerIndex < playerColors.length
                ? playerColors[winnerIndex]
                : "bg-sky-600/70 border-sky-400 text-white";
              
              return (
                <button
                  key={k}
                  onClick={() => claimLocal(k)}
                  disabled={stage !== "playing" || winnerIndex != null}
                  className={`px-2 py-1 rounded border-2 hover:brightness-110 disabled:opacity-50 text-[11px] font-semibold ${
                    winnerIndex != null ? winnerColorClass : "bg-sky-600/70 border-sky-400 text-white"
                  }`}
                  title={winnerIndex != null ? `Won by Player ${winnerIndex + 1}` : "Claim this row"}
                >
                  Row {i + 1}
                </button>
              );
            })}
            {(() => {
              const fullWinnerIndex = claimed.full;
              const playerColors = [
                "bg-red-600 border-red-400 text-white",
                "bg-blue-600 border-blue-400 text-white",
                "bg-green-600 border-green-400 text-white",
                "bg-yellow-500 border-yellow-300 text-white",
                "bg-purple-600 border-purple-400 text-white",
                "bg-cyan-600 border-cyan-400 text-white",
              ];
              const fullWinnerColorClass = fullWinnerIndex != null && fullWinnerIndex < playerColors.length
                ? playerColors[fullWinnerIndex]
                : "bg-purple-600/70 border-purple-400 text-white";
              
              return (
                <button
                  onClick={() => claimLocal("full")}
                  disabled={stage !== "playing" || claimed.full != null}
                  className={`px-2 py-1 rounded border-2 hover:brightness-110 disabled:opacity-50 text-[11px] font-semibold ${
                    claimed.full != null ? fullWinnerColorClass : "bg-purple-600/70 border-purple-400 text-white"
                  }`}
                  title={claimed.full != null ? `Won by Player ${claimed.full + 1}` : "Claim FULL board"}
                >
                  FULL
                </button>
              );
            })()}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-black/40 rounded-xl p-3 overflow-auto">
        {stage === "setup" ? (
          <div className="w-full h-full grid place-items-center text-white/60 text-sm">
            Choose players and press Start
          </div>
        ) : (
          <BingoCard
            title={`Player ${activePlayer + 1}`}
            card={cards[activePlayer]}
            marks={marks[activePlayer] || makeEmptyMarks()}
            calledSet={calledSet}
            onCellClick={(n) => onMark(activePlayer, n)}
            lastNumber={last}
          />
        )}
      </div>
    </div>
  );
}

// ===========================================================
// UI: Bingo Card
// ===========================================================
function BingoCard({ title, card, marks, calledSet, onCellClick, lastNumber }) {
  const headers = ["B", "I", "N", "G", "O"];

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center text-xs font-semibold mb-0.5">{title}</div>

      <div className="grid grid-cols-5 gap-0.5 mb-0.5">
        {headers.map((h) => (
          <div key={h} className="text-center text-[10px] font-bold bg-white/10 rounded py-0.5 h-5">
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-0.5">
        {card.flat().map((n, idx) => {
          const isFree = n === 0 && idx === 12;
          const isMarked = marks[idx];
          const isCalled = isFree || calledSet.has(n); // המספר נקרא
          // צהוב רק אם השחקן סימן את המספר שיצא
          const shouldShowYellow = isMarked && isCalled && !isFree;

          return (
            <button
              key={idx}
              onClick={() => (isFree ? null : onCellClick(n))}
              disabled={!isCalled && !isFree}
              className={`h-8 rounded-lg border font-semibold grid place-items-center transition
                ${shouldShowYellow ? "bg-yellow-500 border-yellow-400 shadow-lg shadow-yellow-500/60" : ""}
                ${isMarked && !shouldShowYellow ? "bg-emerald-500/60 border-emerald-400 shadow-lg shadow-emerald-500/50" : ""}
                ${!isMarked ? "bg-white/5 border-white/15" : ""}
              `}
            >
              <span className={`text-sm ${shouldShowYellow ? "text-white font-bold" : isMarked ? "text-white font-bold" : ""}`}>
                {isFree ? "FREE" : n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="text-center text-[10px] text-white/60 mt-1">
        Only called numbers can be marked. Yellow = marked called number.
      </div>
    </div>
  );
}

