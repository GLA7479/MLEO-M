// Blackjack (MP) — Updated for new schema
// Uses supabaseMP (new project) + local Vault

import { useEffect, useMemo, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";

const MIN_BET = 1000;
const SEATS = 6;

// ---------- Utils ----------
function safeRead(key, fallback){ try { const raw = localStorage.getItem(key); return raw? JSON.parse(raw) : fallback; } catch { return fallback; } }
function safeWrite(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function fmt(n){ n=Math.floor(Number(n||0)); if(n>=1e9)return(n/1e9).toFixed(2)+"B"; if(n>=1e6)return(n/1e6).toFixed(2)+"M"; if(n>=1e3)return(n/1e3).toFixed(2)+"K"; return String(n); }

// ---------- Blackjack Logic ----------
function freshShoe(decks = 4) {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const suits = ['♠','♥','♦','♣'];
  const shoe = [];
  for (let d=0; d<decks; d++) for (const r of ranks) for (const s of suits) shoe.push(r + s);
  for (let i=shoe.length-1; i>0; i--) { const j = Math.floor(Math.random() * (i+1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  return shoe;
}

function baseCardValue(r) {
  if (r === 'A') return 11;
  if (['K','Q','J','10'].includes(r)) return 10;
  return parseInt(r, 10);
}

function handScore(cards) {
  let total = 0; let aces = 0;
  for (const c of cards) {
    const r = c.replace('♠','').replace('♥','').replace('♦','').replace('♣','');
    if (r === 'A') { aces++; total += 11; } else total += baseCardValue(r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const soft = cards.some(c => c.startsWith('A')) && total <= 21;
  return { total, soft };
}

function cardValue(r){ if(r==="A") return 11; if(["K","Q","J"].includes(r)) return 10; return parseInt(r,10); }
function handValue(hand){ 
  if (!hand || !Array.isArray(hand)) return 0;
  let t=0,a=0; 
  for(const c of hand){ 
    const r=c.slice(0,-1); 
    t+=cardValue(r); 
    if(r==="A")a++; 
  } 
  while(t>21&&a>0){ t-=10;a--; } 
  return t; 
}
const suitIcon = (s)=> s==="h"?"♥":s==="d"?"♦":s==="c"?"♣":"♠";
const suitClass = (s)=> (s==="h"||s==="d") ? "text-red-400" : "text-blue-300";

function Card({ code, size = "normal", hidden = false, isDealing = false }) {
  if (!code && !hidden) return null;
  
  // Dynamic sizing based on game state
  const sizeClasses = size === "small" ? 
    (isDealing ? "w-10 h-14 text-sm" : "w-6 h-8 text-xs") : 
    (isDealing ? "w-12 h-16 text-base" : "w-8 h-10 text-sm");

  if (hidden) {
    return (
      <div className={`inline-flex items-center justify-center border border-white/30 rounded ${sizeClasses} font-bold bg-white/10`}>
        <span className="leading-none">🂠</span>
      </div>
    );
  }

  const r = code.slice(0,-1), s = code.slice(-1);
  
  return (
    <div className={`inline-flex items-center justify-center border border-white/30 rounded ${sizeClasses} font-bold bg-gradient-to-b from-white/10 to-white/5 shadow ${suitClass(s)}`}>
      <span className="leading-none">{r}{suitIcon(s)}</span>
    </div>
  );
}
function HandView({ hand, size = "normal", isDealing = false }) {
  const h = hand || [];
  return (
    <div className="flex items-center justify-center overflow-x-auto whitespace-nowrap py-0.5 gap-0.5">
      {h.length===0 ? <span className="text-white/60 text-xs">—</span> : h.map((c,i)=><Card key={i} code={c} size={size} isDealing={isDealing}/>)}
    </div>
  );
}

// ---------- Component ----------
export default function BlackjackMP({ roomId, playerName, vault, setVaultBoth }) {
  // Use same vault functions as existing games
  function getVault() {
    const rushData = JSON.parse(localStorage.getItem("mleo_rush_core_v4") || "{}");
    return rushData.vault || 0;
  }

  function setVault(amount) {
    const rushData = JSON.parse(localStorage.getItem("mleo_rush_core_v4") || "{}");
    rushData.vault = amount;
    localStorage.setItem("mleo_rush_core_v4", JSON.stringify(rushData));
  }
  const name = playerName || "Guest";

  // בדיקת חיבור מיידית
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('bj_sessions').select('id').limit(1);
        if (error) console.error('[MP ping] ERROR:', error);
        else console.log('[MP ping] OK – rows:', data?.length ?? 0);
      } catch (e) {
        console.error('[MP ping] FAILED:', e);
      }
    })();
  }, []);

  const [session, setSession] = useState(null);
  const [players, setPlayers] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [bet, setBet] = useState(MIN_BET);
  const [msg, setMsg] = useState("");
  const [banner, setBanner] = useState(null); // {title, lines: []}
  const [timerTick, setTimerTick] = useState(0);

  const myRow = useMemo(
    () => players.find(p => p.player_name === name) || null,
    [players, name]
  );

  // Leader detection
  const isLeader = useMemo(() => {
    if (!roomMembers?.length) return true;

    const names = roomMembers
      .map(m => (m.player_name || '').toString())
      .filter(Boolean)
      .sort((a,b)=>a.localeCompare(b));
    if ((names[0] || '') === (playerName || name || '')) return true;

    const ids   = players.map(p=>p.id).filter(Boolean).sort();
    const mine  = players.find(p => p.player_name === name)?.id; // חישוב מקומי
    return ids.length && mine && ids[0] === mine;
  }, [roomMembers, playerName, name, players]); // בלי myRow בתלויות

  const clampBet = (n) => {
    const v = Math.floor(Number(n || 0));
    if (!Number.isFinite(v) || v < MIN_BET) return MIN_BET;
    return Math.min(v, getVault());
  };
  // Button availability helpers
  const canPlaceBet = !!myRow && ['lobby','betting'].includes(session?.state);
  const canDeal = session?.state === 'betting';
  const myTurn = !!myRow && session?.current_player_id === myRow.id && session?.state === 'acting' && myRow.status === 'acting';
  const canSettle = session?.state === 'acting'; // האוטופיילוט יעשה לבד, זה רק fallback ידני
  const turnGlow = myTurn ? 'ring-2 ring-emerald-400 animate-pulse' : '';

  // bootstrap session with new schema
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      const { data: selected, error: selErr } = await supabase.from("bj_sessions").select("*").eq("room_code", roomId).maybeSingle();
      if (selErr) { console.error('[bj_sessions.select] error:', selErr); return; }
      
      if (selected) {
        setSession(selected);
      } else {
        const payload = {
          room_code: roomId,
          state: 'lobby',
          shoe: freshShoe(4),
          dealer_hand: [],
          seat_count: SEATS,
          min_bet: MIN_BET
        };

        const { data: upserted, error: upErr } = await supabase
          .from("bj_sessions")
          .upsert(payload, { onConflict: "room_code" })
          .select()
          .single();

        if (upErr) {
          console.error("[bj_sessions.upsert] error:", upErr);
          return;
        }
        setSession(upserted);
      }
    })();
  }, [roomId]);


  // presence
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room_${roomId}`, {
      config: { presence: { key: name || "Guest" } }   // חשוב: מפתח לנוכחות
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const members = Object.values(state).flat();
        setRoomMembers(members);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ player_name: name, online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, name]);

  // realtime updates
  useEffect(() => {
    if (!session?.id) return;
    
    const channel = supabase.channel(`bj_session_${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_sessions', filter: `id=eq.${session.id}` }, (payload) => {
        setSession(payload.new || payload.old);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bj_players', filter: `session_id=eq.${session.id}` }, async () => {
        const { data } = await supabase.from("bj_players").select("*").eq("session_id", session.id).order("seat");
        setPlayers(data || []);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // Autopilot trigger
  useEffect(() => {
    if (!session?.id) return;
    // השהייה זעירה למנוע רצף פעולות כפול בזמן realtime
    const t = setTimeout(() => { autopilot(session); }, 150);
    return () => clearTimeout(t);
  }, [session?.id, session?.state, players.length, players.map?.(p=>p.status + ':' + p.bet).join('|'), isLeader]);

  // Timer tick for UI updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Heartbeat: מריץ autopilot כשיש דדליין פעיל (הימורים/תור/הפסקה בין סיבובים)
  useEffect(() => {
    if (!isLeader || !session?.id) return;

    const tick = setInterval(() => {
      // אם יש חלון הימורים, תור שחקן, או טיימר לסיבוב הבא — תריץ אוטומציה
      if (
        (session.state === 'betting' && session.bet_deadline) ||
        (session.state === 'acting'  && session.turn_deadline) ||
        (session.state === 'ended'   && session.next_round_at)
      ) {
        autopilot(session);
      }
    }, 500);

    return () => clearInterval(tick);
  }, [isLeader, session?.id, session?.state, session?.bet_deadline, session?.turn_deadline, session?.next_round_at]);

  // "דחיפה" לפתיחת BETTING אם נשארים ב-lobby יותר מכמה שניות
  useEffect(() => {
    if (!session?.id || !isLeader) return;
    if (session.state === 'lobby') {
      const deadline = new Date(Date.now() + 15000).toISOString();
      supabase.from('bj_sessions').update({ state:'betting', bet_deadline: deadline, dealer_hand:[], dealer_hidden:true }).eq('id', session.id);
    }
  }, [isLeader, session?.id, session?.state]);

  // Turn timeout is now handled by the Heartbeat timer above

  // mark 'left' on tab close (best-effort)
  useEffect(() => {
    if (!session?.id) return;
    const client_id = getClientId();
    const onLeave = async () => {
      try {
        await supabase.from("bj_players")
          .update({ status: "left" })
          .eq("session_id", session.id)
          .eq("client_id", client_id);
      } catch {}
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [session?.id]);

  // ---------- Actions ----------
  async function ensureSeated() {
    if (!session?.id || !name) return;

    const client_id = getClientId();

    // אם כבר יש לי שורה בסשן — לצאת
    const existing = players.find(p => p.client_id === client_id);
    if (existing) return;

    // קח תמונת מצב עדכנית מה-DB (לא מ-state) כדי להימנע מהתנגשויות
    const { data: rows, error: e1 } = await supabase
      .from("bj_players")
      .select("seat")
      .eq("session_id", session.id);
    if (e1) { console.error(e1); setMsg("Seat query failed"); return; }
    const used = new Set((rows || []).map(r => r.seat));

    let free = -1;
    for (let i = 0; i < (session.seat_count ?? 5); i++) {
      if (!used.has(i)) { free = i; break; }
    }
    if (free < 0) { setMsg("No free seats"); return; }

    // upsert לפי (session_id, client_id) – אם קיימת שורה שלי, תתעדכן; אחרת תיווצר
    const payload = {
      session_id: session.id,
      client_id,
      player_name: name,
      seat: free,
      stack: Math.min(getVault(), 10000),
      bet: 0,
      hand: [],
      status: "seated",
      acted: false,
      hand_idx: 0,
    };
    let { error } = await supabase
      .from("bj_players")
      .upsert(payload, { onConflict: "session_id,client_id" });

    // אם מישהו חטף את המושב בין הבדיקה להכנסה (409/23505) — ננסה פעם נוספת עם מושב אחר
    if (error && (error.code === "23505" || String(error.message||"").includes("uq_bj_players_session_seat"))) {
      const { data: rows2 } = await supabase
        .from("bj_players")
        .select("seat")
        .eq("session_id", session.id);
      const used2 = new Set((rows2 || []).map(r => r.seat));
      let free2 = -1;
      for (let i = 0; i < (session.seat_count ?? 5); i++) if (!used2.has(i)) { free2 = i; break; }
      if (free2 >= 0) {
        payload.seat = free2;
        const r = await supabase.from("bj_players").upsert(payload, { onConflict: "session_id,client_id" });
        error = r.error;
      }
    }
    if (error) {
      console.error("Failed to join seat:", error);
      setMsg("Failed to join seat");
    }
  }

  async function placeBet() {
    if (!myRow) await ensureSeated();          // ודא שיש שורה לשחקן
    const row = myRow || (await supabase.from("bj_players").select("*").eq("session_id", session.id).eq("player_name", name).maybeSingle()).data;
    if (!row || bet < MIN_BET) return;

    // בדוק שיש מספיק כסף ב-vault
    const currentVault = getVault();
    if (currentVault < bet) {
      setMsg("Insufficient vault balance");
      return;
    }

    // הוצא כסף מה-vault
    const newVault = currentVault - bet;
    setVault(newVault);
    // עדכן גם את ה-state בדף הראשי
    if (setVaultBoth) {
      setVaultBoth(newVault);
    }

    const { error } = await supabase.from("bj_players").update({
      bet: bet,
      status: 'betting'
      // acted: true  <-- removed, so player can act in 'acting' phase
    }).eq("id", row.id);

    if (error) {
      console.error('[bj_players.update] placeBet error:', error);
      setMsg("Failed to place bet");
      // החזר כסף ל-vault אם ההימור נכשל
      setVault(currentVault);
    }
  }

  async function openBetting() {
    if (!session?.id) return;
    const deadline = new Date(Date.now() + 15000).toISOString(); // 15 שניות הימור
    const { error } = await supabase
      .from('bj_sessions')
      .update({ state: 'betting', bet_deadline: deadline })
      .eq('id', session.id);
    if (error) console.error('[openBetting] error:', error);
  }

  // Helper: Build action queue (including split hands)
  function buildActionQueue(players = []) {
    // סדר: seat עולה, ואז hand_idx (0 לפני 1)
    const alive = players
      .filter(p => ['acting','betting','seated','blackjack','stood','busted','surrendered','settled'].includes(p.status))
      .sort((a,b) => (a.seat - b.seat) || (a.hand_idx - b.hand_idx));

    // מי בפועל צריך לפעול (acting בלבד)
    const needAct = alive.filter(p => p.status === 'acting');

    return { alive, needAct };
  }

  // Begin acting phase - set first player + deadline
  async function beginActingPhase(sessionId) {
    const { data: ps } = await supabase.from('bj_players')
      .select('*').eq('session_id', sessionId).order('seat,hand_idx');

    // רק משתתפים של הסיבוב (מי שהימרו)
    const actables = (ps || []).filter(p => (p.bet || 0) > 0 && p.status === 'acting');
    if (!actables.length) {
      // כולם BJ/סטוד/באסט ⇒ סגור יד
      await dealerAndSettle();
      return;
    }
    const first = actables[0];
    const deadline = new Date(Date.now() + (session?.turn_seconds || 20) * 1000).toISOString();

    await supabase.from('bj_sessions').update({
      state: 'acting',
      dealer_hidden: true,
      current_player_id: first.id,
      turn_deadline: deadline
    }).eq('id', sessionId);
  }

  // Advance turn (automatic)
  async function advanceTurn() {
    if (!isLeader || !session?.id) return;

    const { data: ps } = await supabase.from('bj_players').select('*').eq('session_id', session.id);
    const { needAct } = buildActionQueue(ps || []);
    if (needAct.length === 0) {
      // כולם סיימו ⇒ Dealer & Settle
      await dealerAndSettle();
      return;
    }

    // אם current_player כבר בסטטוס acting – השאר; אם לא, הבא הבא בתור
    const curId = session.current_player_id;
    const cur = (ps || []).find(p => p.id === curId);
    if (cur && cur.status === 'acting') {
      // רק עדכן דדליין אם חסר
      if (!session.turn_deadline) {
        const deadline = new Date(Date.now() + (session.turn_seconds || 20) * 1000).toISOString();
        await supabase.from('bj_sessions').update({ turn_deadline: deadline }).eq('id', session.id);
      }
      return;
    }

    const next = needAct[0];
    const deadline = new Date(Date.now() + (session.turn_seconds || 20) * 1000).toISOString();

    await supabase.from('bj_sessions').update({
      current_player_id: next.id,
      turn_deadline: deadline
    }).eq('id', session.id);
  }

  // After player move - clear turn and advance
  async function afterMyMove() {
    if (!isLeader || !session?.id) return;
    // שחרר את התור ואז מצא הבא בתור
    await supabase.from('bj_sessions')
      .update({ current_player_id: null, turn_deadline: null })
      .eq('id', session.id);
    await advanceTurn();
  }

  // Autopilot function - only leader runs automation
  async function autopilot(sessionSnap) {
    if (!isLeader) return;
    const s = sessionSnap || session;
    if (!s?.id) return;

    // 0) אם המצב לא חוקי (acting אבל אין current_player_id או אין ידיים) – חזור ל-BETTING
    if (s.state === 'acting') {
      const { data: ps } = await supabase.from('bj_players').select('id,hand,bet,status').eq('session_id', s.id);
      const anyHands = (ps || []).some(p => (p.hand?.length || 0) > 0);
      const someoneActing = (ps || []).some(p => p.status === 'acting');
      if (!anyHands || (!someoneActing && !s.current_player_id)) {
        const deadline = new Date(Date.now() + 15000).toISOString();
        await supabase.from('bj_players').update({ hand: [], status: 'seated', acted: false, bet: 0 }).eq('session_id', s.id);
        await supabase.from('bj_sessions').update({
          state: 'betting', dealer_hand: [], dealer_hidden: true,
          bet_deadline: deadline, current_player_id: null, turn_deadline: null, next_round_at: null
        }).eq('id', s.id);
        return;
      }
    }

    // טען מצב עדכני
    const { data: ps } = await supabase
      .from('bj_players').select('*')
      .eq('session_id', s.id).order('seat,hand_idx');

    const participants = (ps || []).filter(p => (p.bet || 0) > 0 && p.status !== 'left');
    const hasBets      = participants.length > 0;
    const everyoneDone = hasBets && participants.every(p => ['stood','busted','blackjack','settled'].includes(p.status));

    // 1) LOBBY / ENDED -> BETTING (אוטומטי)
    if (s.state === 'lobby' || (s.state === 'ended' && s.next_round_at && new Date() > new Date(s.next_round_at))) {
      // אפס לכולם את היד הקודמת אם צריך (ב-ENDED)
      if (s.state === 'ended') {
        await supabase.from('bj_players').update({
          hand: [], bet: 0, result: null, status: 'seated', acted: false
        }).eq('session_id', s.id);
      }

      // פתח חלון הימורים חדש ל־15 שניות
      const deadline = new Date(Date.now() + 15000).toISOString();
      await supabase.from('bj_sessions').update({
        state: 'betting',
        dealer_hand: [],
        dealer_hidden: true,
        current_player_id: null,
        turn_deadline: null,
        bet_deadline: deadline,
        next_round_at: null
      }).eq('id', s.id);
      return;
    }

    // 2) BETTING -> DEAL (כשעבר הדדליין ויש לפחות משתתף אחד)
    if (s.state === 'betting') {
      const dlPassed = s.bet_deadline && new Date() > new Date(s.bet_deadline);
      if (dlPassed && hasBets) {
        await deal();           // יתחיל ACTING וינעל את ה-Dealer hidden
        return;
      }
      // אם אף אחד לא הימר עד הדדליין — פתח חלון חדש (שקט) לעוד 15 שניות
      if (dlPassed && !hasBets) {
        const deadline = new Date(Date.now() + 15000).toISOString();
        await supabase.from('bj_sessions').update({ bet_deadline: deadline }).eq('id', s.id);
        return;
      }
    }

    // 3) ACTING -> Auto-stand for AFK players
    if (s.state === 'acting' && s.turn_deadline && s.current_player_id) {
      const now = Date.now();
      const dl = new Date(s.turn_deadline).getTime();
      if (now >= dl) {
        // Auto-stand על השחקן הנוכחי
        const { data: cur } = await supabase.from('bj_players').select('*').eq('id', s.current_player_id).maybeSingle();
        if (cur && cur.status === 'acting') {
          await supabase.from('bj_players').update({ status: 'stood', acted: true })
            .eq('id', cur.id);
        }
        // advance
        await supabase.from('bj_sessions').update({ current_player_id: null, turn_deadline: null })
          .eq('id', s.id);
        await advanceTurn();
        return;
      }
    }

    // 4) ACTING -> SETTLE (כשכולם סיימו)
    if (s.state === 'acting' && everyoneDone) {
      await dealerAndSettle();
      return;
    }

    // 4) SETTLING/ENDED — מנוהל בפונקציות עצמן
  }

  async function deal() {
    if (!session) return;

    setBanner(null); // אפס באנר בתחילת סיבוב

    // משוך שחקנים
    const { data: ps } = await supabase
      .from("bj_players")
      .select("*")
      .eq("session_id", session.id)
      .order("seat");

    // משתתפים אמיתיים בלבד
    const participants = (ps || []).filter(p => (p.bet || 0) >= (session.min_bet || MIN_BET) && p.status !== 'left');
    if (participants.length === 0) return; // סתם בטחון

    let shoe = session.shoe?.length ? [...session.shoe] : freshShoe(4);
    const draw = () => shoe.pop();

    // חלק לשחקנים שהמרו
    for (const p of participants) {
      const hand = [draw(), draw()];
      const bj = handValue(hand) === 21;
      await supabase.from("bj_players").update({
        hand, status: bj ? 'blackjack' : 'acting', acted: false
      }).eq("id", p.id);
    }

    // השאר (שלא הימרו) נשארים 'seated' עם יד ריקה

    // דילר
    const dealerHand = [draw(), draw()];
    await supabase.from("bj_sessions").update({
      dealer_hand: dealerHand,
      dealer_hidden: true,
      shoe: shoe,
      round_no: (session.round_no || 0) + 1,
      current_seat: 0,
      state: 'acting',
      bet_deadline: null
    }).eq("id", session.id);

    // הפעל תור ראשון
    await beginActingPhase(session.id);
  }

  async function hit() {
    if (!session || !myRow || myRow.status !== 'acting') return;
    
    let shoe = [...(session.shoe||[])];
    const card = shoe.pop();
    const hand = [...(myRow.hand||[]), card];
    const v = handValue(hand);
    const status = (v > 21) ? 'busted' : (v === 21 ? 'stood' : 'acting');

    await supabase.from("bj_players").update({ hand, status }).eq("id", myRow.id);
    await supabase.from("bj_sessions").update({ shoe }).eq("id", session.id);

    if (status === 'acting') {
      // נשאר אותו שחקן בתור – רק לרענן דדליין ולהבטיח שה-ID נשאר עליו
      if (isLeader) {
        const deadline = new Date(Date.now() + (session?.turn_seconds || 20) * 1000).toISOString();
        await supabase
          .from('bj_sessions')
          .update({ current_player_id: myRow.id, turn_deadline: deadline })
          .eq('id', session.id);
        // המתנה קצרה לרפליקה/Realtime ואז ודא שלא "נפל" התור
        setTimeout(() => advanceTurn(), 50);
      }
      return; // אל תעביר תור
    }

    // בסט/21 => התור הסתיים לשחקן הזה
    await afterMyMove();
  }

  async function stand() {
    if (!myRow || myRow.status !== 'acting') return;
    await supabase.from("bj_players").update({
      status: 'stood',
      acted: true
    }).eq("id", myRow.id);
    await afterMyMove();
  }

  async function double() {
    if (!session || !myRow || myRow.status !== 'acting') return;
    const newBet = myRow.bet * 2;
    if (myRow.stack < (newBet - myRow.bet)) {
      setMsg("Insufficient stack to double");
      return;
    }
    
    let shoe = [...session.shoe];
    const card = shoe.pop();
    const hand = [...myRow.hand, card];
    
    await supabase.from("bj_players").update({
      bet: newBet,
      hand: hand,
      status: 'stood',
      acted: true,
      stack: myRow.stack - (newBet - myRow.bet)
    }).eq("id", myRow.id);
    
    await supabase.from("bj_sessions").update({ shoe }).eq("id", session.id);
    await afterMyMove();
  }

  // Helper: Get card value for comparison
  function cardValue(card) {
    if (!card) return 0;
    const rank = card.slice(0, -1);
    if (rank === 'A') return 1;
    if (['J', 'Q', 'K'].includes(rank)) return 10;
    return parseInt(rank) || 0;
  }

  // Helper: Check if can split
  function canSplit(p) {
    const h = p?.hand || [];
    if (h.length !== 2) return false;
    const v = cardValue(h[0]) === cardValue(h[1]);
    return v;
  }

  // Split hand function
  async function splitHand() {
    if (!session || !myRow || myRow.status !== 'acting' || !canSplit(myRow)) return;
    
    const h = myRow.hand;
    if (h.length !== 2) return;
    
    const newBet = myRow.bet;
    if (myRow.stack < newBet) {
      setMsg("Insufficient chips for split");
      return;
    }
    
    try {
      let shoe = [...session.shoe];
      const newCard1 = shoe.pop();
      const newCard2 = shoe.pop();
      
      // Update original hand (first card + new card)
      const { error: updateErr } = await supabase.from("bj_players").update({
        hand: [h[0], newCard1],
        bet: newBet,
        stack: myRow.stack - newBet,
        hand_idx: 0
      }).eq("id", myRow.id);
      
      if (updateErr) {
        console.error('[splitHand] update error:', updateErr);
        setMsg("Split failed - please try again");
        return;
      }
      
      // Create split hand (second card + new card)
      const { error: upsertErr } = await supabase.from('bj_players').upsert({
        session_id: session.id,
        seat: myRow.seat,
        player_name: myRow.player_name,
        bet: newBet,
        hand: [h[1], newCard2],
        status: 'acting',
        split_from: myRow.id,
        hand_idx: 1,
        stack: 0 // Split hand doesn't get additional stack
      }, {
        onConflict: 'session_id,seat'
      });
      
      if (upsertErr) {
        console.error('[splitHand] upsert error:', upsertErr);
        setMsg("Split failed - please try again");
        return;
      }
      
      const { error: shoeErr } = await supabase.from("bj_sessions").update({ shoe }).eq("id", session.id);
      if (shoeErr) {
        console.error('[splitHand] shoe error:', shoeErr);
      }
      
      await afterMyMove();
    } catch (error) {
      console.error('[splitHand] unexpected error:', error);
      setMsg("Split failed - please try again");
    }
  }

  // Surrender function
  async function surrender() {
    if (!myRow || myRow.status !== 'acting' || myRow.hand?.length !== 2) return;
    
    await supabase.from("bj_players").update({
      status: 'surrendered',
      acted: true,
      stack: myRow.stack + Math.floor(myRow.bet / 2) // Get back half the bet
    }).eq("id", myRow.id);
    
    await afterMyMove();
  }

  async function dealerAndSettle() {
    if (!session) return;

    const { data: ps } = await supabase.from("bj_players")
      .select("*").eq("session_id", session.id).order('seat,hand_idx');

    const participants = (ps || []).filter(p => (p.bet || 0) > 0 && p.status !== 'left');
    const done = participants.every(p => ['stood','busted','blackjack','settled'].includes(p.status));
    if (!done) { setMsg("Players still acting"); return; }

    // דילר משחק
    let dealer = [...(session.dealer_hand||[])];
    let shoe   = [...(session.shoe||[])];
    while (handValue(dealer) < 17 && shoe.length) dealer.push(shoe.pop());

    await supabase.from('bj_sessions').update({
      dealer_hand: dealer, dealer_hidden: false, shoe, state: 'settling'
    }).eq('id', session.id);

    const dealerScore = handValue(dealer);
    const dealerBust  = dealerScore > 21;

    const lines = [];
    let myResult = null; // רק לשחקן המקומי
    for (const p of participants) {
      const s = handValue(Array.isArray(p.hand) ? p.hand : []);
      let result='lose', payout=0;

      if (p.status==='blackjack') { result='blackjack'; payout=Math.floor(p.bet*3/2); }
      else if (dealerBust && s<=21) { result='win'; payout=p.bet; }
      else if (s>21) { result='lose'; }
      else if (s>dealerScore) { result='win'; payout=p.bet; }
      else if (s===dealerScore) { result='push'; payout=p.bet; }
      else { result='lose'; }

      const delta = payout; // רק הזכייה - ההימור כבר ירד בהתחלה
      const newStack = (p.stack||0) + delta;

      // עדכן את ה-vault אם זה השחקן המקומי
      if (p.player_name === name) {
        const currentVault = getVault();
        const newVault = currentVault + delta;
        setVault(newVault);
        // עדכן גם את ה-state בדף הראשי
        if (setVaultBoth) {
          setVaultBoth(newVault);
        }
        // שמור את התוצאה שלי להודעה מקומית
        myResult = { result, delta, dealerBust, dealerScore, originalBet: p.bet };
      }

      await supabase.from('bj_players').update({
        result, stack:newStack, status:'settled', bet:0
      }).eq('id', p.id);

      const tag = result==='win' ? '+'
               : result==='blackjack' ? '+'
               : result==='push' ? '±'
               : '-';
      lines.push(`Seat ${p.seat+1} • ${p.player_name} — ${result.toUpperCase()} (${tag}${fmt(Math.abs(delta))})`);
    }

    // הצג את התוצאות למשך 3 שניות לפני סיום המשחק
    await new Promise(resolve => setTimeout(resolve, 3000));

    await supabase.from('bj_sessions').update({ 
      state:'ended',
      next_round_at: new Date(Date.now() + 15000).toISOString() // 15 שניות לסיבוב הבא
    }).eq('id', session.id);

    // הצג הודעות גלובליות לכל השחקנים
    const winCount = participants.filter(p => ['win', 'blackjack'].includes(p.result)).length;
    const pushCount = participants.filter(p => p.result === 'push').length;
    const loseCount = participants.filter(p => p.result === 'lose').length;
    
    let globalTitle = '';
    if (winCount > 0 && loseCount === 0) {
      globalTitle = '🎉 ALL WIN!';
    } else if (winCount > 0) {
      globalTitle = `🎉 ${winCount} WIN${winCount > 1 ? 'S' : ''}!`;
    } else if (pushCount > 0 && loseCount === 0) {
      globalTitle = '🤝 ALL PUSH!';
    } else {
      globalTitle = '💔 DEALER WINS!';
    }
    
    setBanner({
      title: globalTitle,
      lines: [
        `Dealer: ${dealerBust ? 'BUST' : dealerScore}`,
        `Results: ${winCount}W ${pushCount}P ${loseCount}L`
      ]
    });
  }

  async function resetRound() {
    if (!session) return;
    await supabase.from("bj_players").update({
      hand: [], bet: 0, result: null, status: 'seated', acted: false
    }).eq("session_id", session.id);
    await supabase.from("bj_sessions").update({
      state: 'lobby', dealer_hand: [], dealer_hidden: true
    }).eq("id", session.id);
    setBanner(null);
  }

  // ---------- UI ----------
  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">Select or create a room to start.</div>;
  const dealerV = handValue(session?.dealer_hand || []);

  return (
    <div className="w-full h-full flex flex-col p-1 md:p-2 gap-1 md:gap-2 -mt-1">

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col gap-1 md:gap-2">
        {/* Dealer Section - Fixed Height */}
        <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 rounded-lg p-2 md:p-3 border border-red-400/30 h-32 sm:h-40 relative">
          <div className="text-center h-full flex flex-col justify-center">
            {/* Hide text during dealing/acting for more card space */}
            {!(session?.state === 'dealing' || session?.state === 'acting') && (
              <div className="text-white font-bold text-xs mb-0.5">Dealer</div>
            )}
            <div className="flex items-center justify-center overflow-x-auto whitespace-nowrap py-0.5 gap-0.5">
              {(session?.dealer_hand||[]).map((c,i)=>(
                <Card key={i} code={c} hidden={session?.dealer_hidden && i===1} isDealing={session?.state === 'dealing' || session?.state === 'acting'} />
              ))}
            </div>
            {!(session?.state === 'dealing' || session?.state === 'acting') && (
              <div className="text-white/80 text-xs mt-0.5">
                Total: {session?.dealer_hidden ? "—" : (handValue(session?.dealer_hand||[]) || "—")}
              </div>
            )}
            
            {/* Timers in dealer window - bottom left */}
            <div className="absolute bottom-1 left-1 text-xs">
              {session?.state === 'betting' && session?.bet_deadline && (
                <div className="text-amber-400 font-semibold">
                  🕒 {timerTick >= 0 && Math.max(0, Math.ceil((new Date(session.bet_deadline).getTime() - Date.now()) / 1000))}s
                </div>
              )}
              {session?.turn_deadline && session?.current_player_id === myRow?.id && (
                <div className="text-amber-300 font-semibold">
                  ⏰ {timerTick >= 0 && Math.max(0, Math.ceil((new Date(session.turn_deadline).getTime() - Date.now())/1000))}s
                </div>
              )}
            </div>
            
            {/* SURRENDER button in top-right corner */}
            {myTurn && myRow?.status === 'acting' && myRow?.hand?.length === 2 && (
              <button 
                onClick={surrender}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded border border-red-400 transition-all"
              >
                SURRENDER
              </button>
            )}
          </div>
        </div>

        {/* Players Grid - Mobile Responsive */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1 md:gap-2">
          {Array.from({length: SEATS}).map((_,i)=>{
            const occupant = players.find(p=>p.seat===i);
            const isMe = occupant && occupant.player_name===name;
            const isActive = session?.current_player_id && occupant?.id === session.current_player_id;
            const hv = occupant?.hand && Array.isArray(occupant.hand) ? handValue(occupant.hand) : null;
            return (
              <div key={i} className={`rounded-lg border ${isMe?'border-emerald-400 bg-emerald-900/20':'border-white/20 bg-white/5'} p-1 md:p-2 min-h-[80px] md:min-h-[120px] transition-all hover:bg-white/10 ${isActive ? 'ring-2 ring-amber-400' : ''}`}>
                <div className="text-center">
                  {occupant ? (
                    <div className="space-y-0.5 md:space-y-1">
                      <div className="text-white font-bold text-xs md:text-sm truncate">{occupant.player_name}</div>
                      <div className="text-emerald-300 text-xs font-semibold">Bet: {fmt(occupant.bet||0)}</div>
                      <HandView hand={occupant.hand} size="small" isDealing={session?.state === 'dealing' || session?.state === 'acting'}/>
                      <div className="text-white/80 text-xs">
                        Total: {hv??"—"} 
                        <span className={
                          "ml-1 px-1 py-0.5 rounded text-xs " +
                          (occupant.status==='acting' ? 'bg-blue-600' :
                           occupant.status==='stood' ? 'bg-gray-600' :
                           occupant.status==='busted' ? 'bg-red-700' :
                           occupant.status==='blackjack' ? 'bg-emerald-700' :
                           occupant.status==='settled' ? 'bg-purple-700' : 'bg-slate-600')
                        }>
                          {occupant.status}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={ensureSeated} 
                      disabled={!session || !name}
                      className="mt-1 px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold text-xs transition-all"
                    >
                      TAKE SEAT
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Controls - Fixed Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-2 h-32 md:h-36">
        <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10 h-full">
          <div className="text-white/80 text-xs mb-1 font-semibold">Place Bet</div>
          <div className="flex gap-1 mb-1">
            <input type="number" value={bet} min={MIN_BET} step={MIN_BET}
              onChange={(e)=>setBet(Math.max(MIN_BET, Math.floor(e.target.value)))}
              className="flex-1 bg-black/40 text-white text-xs rounded px-1 py-0.5 md:px-2 md:py-1 border border-white/20 focus:border-emerald-400 focus:outline-none" />
            <button onClick={placeBet} disabled={!canPlaceBet} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              PLACE
            </button>
          </div>
          <div className="text-white/60 text-xs">Vault: {fmt(getVault())} MLEO</div>
        </div>

        <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10 h-full">
          <div className="text-white/80 text-xs mb-1 font-semibold">Game Actions</div>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={hit} disabled={!myTurn}
              className={`px-2 py-2 md:px-3 md:py-3 rounded bg-gradient-to-r from-emerald-600 to-emerald-700
                        hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed ${turnGlow}`}>
              HIT
            </button>
            <button onClick={stand} disabled={!myTurn}
              className={`px-2 py-2 md:px-3 md:py-3 rounded bg-gradient-to-r from-blue-600 to-blue-700
                        hover:from-blue-700 hover:to-blue-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed ${turnGlow}`}>
              STAND
            </button>
            <button onClick={double} disabled={!myTurn || (myRow?.hand?.length !== 2)}
              className={`px-2 py-2 md:px-3 md:py-3 rounded bg-gradient-to-r from-amber-600 to-amber-700
                        hover:from-amber-700 hover:to-amber-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed ${turnGlow}`}>
              DOUBLE
            </button>
            <button onClick={splitHand} disabled={!myTurn || !canSplit(myRow)}
              className={`px-2 py-2 md:px-3 md:py-3 rounded bg-gradient-to-r from-purple-600 to-purple-700
                        hover:from-purple-700 hover:to-purple-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed ${turnGlow}`}>
              SPLIT
            </button>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10 h-full">
          <div className="text-white/80 text-xs mb-1 font-semibold">Status</div>
          <div className="text-xs text-white/60 mb-1">
            Room: {roomId.slice(0,8)} • State: {session?.state||"…"} • Players: {roomMembers.length}
          </div>
          {isLeader && (
            <div className="text-xs text-emerald-400 font-semibold mb-1">
              🎮 Leader
            </div>
          )}
          {/* Waiting Players Info */}
          {roomMembers.length > players.length && (
            <div className="mt-2">
              <div className="text-xs text-blue-400 font-semibold mb-1">
                👥 Waiting ({roomMembers.length - players.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {roomMembers
                  .filter(member => !players.some(p => p.player_name === member.player_name))
                  .slice(0, 3)
                  .map((member, idx) => (
                    <div key={idx} className="px-1 py-0.5 bg-white/10 rounded text-xs text-white/80 border border-white/20">
                      {member.player_name}
                    </div>
                  ))
                }
                {roomMembers.filter(member => !players.some(p => p.player_name === member.player_name)).length > 3 && (
                  <div className="px-1 py-0.5 bg-white/10 rounded text-xs text-white/80 border border-white/20">
                    +{roomMembers.filter(member => !players.some(p => p.player_name === member.player_name)).length - 3}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div className="bg-red-900/20 border border-red-400/30 rounded-lg p-2 text-red-300 text-xs">
          {msg}
        </div>
      )}

      {/* Fixed Banner Position */}
      <div className="h-20 flex items-center justify-center">
        {banner && (
          <div className={`${banner.title.includes('LOSE') ? 'bg-red-900/25 border-red-500/40' : 'bg-emerald-900/25 border-emerald-500/40'} border rounded-lg p-2 max-w-md mx-auto`}>
            <div className={`${banner.title.includes('LOSE') ? 'text-red-300' : 'text-emerald-300'} font-bold text-sm text-center`}>{banner.title}</div>
            <ul className={`mt-1 ${banner.title.includes('LOSE') ? 'text-red-200' : 'text-emerald-200'} text-xs space-y-0.5 text-center`}>
              {banner.lines.map((t,i)=><li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>

      {session?.state === 'ended' && session?.next_round_at && (
        <div className="text-center text-emerald-400 text-xs font-semibold mt-2">
          🔄 Next round starts in {Math.max(0, Math.ceil((new Date(session.next_round_at).getTime() - Date.now()) / 1000))}s
        </div>
      )}
    </div>
  );
}