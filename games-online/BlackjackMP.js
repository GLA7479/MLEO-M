// Blackjack (MP) — Updated for new schema
// Uses supabaseMP (new project) + local Vault

import { useEffect, useMemo, useState } from "react";
import { supabaseMP as supabase, getClientId } from "../lib/supabaseClients";
import { queueDelta, getBalance, flushDelta } from "../lib/vaultAdapter";

const MIN_PLAY = 1000;
const SEATS = 6;

const MIN_BUYIN_OPTIONS = {
  '1K': 1_000,
  '10K': 10_000,
  '100K': 100_000,
  '1M': 1_000_000,
  '10M': 10_000_000,
  '100M': 100_000_000,
};

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
export default function BlackjackMP({ roomId, playerName, vault, setVaultBoth, tierCode = '10K' }) {
  const [localVault, setLocalVault] = useState(0);
  useEffect(() => {
    getBalance().then((bal) => {
      setLocalVault(bal);
      if (setVaultBoth) setVaultBoth(bal);
    });
  }, []);

  const getVault = () => localVault;
  const setVault = (amount) => {
    const delta = amount - localVault;
    setLocalVault(amount);
    queueDelta(delta);
    if (setVaultBoth) setVaultBoth(amount);
  };

  const name = playerName || "Guest";
  const minRequired = MIN_BUYIN_OPTIONS[tierCode] ?? 0;

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
  const [play, setBet] = useState(MIN_PLAY);
  const [displayValue, setDisplayValue] = useState('');
  const [msg, setMsg] = useState("");
  
  // מזהה קבוע לקומפוננטה
  const clientId = useMemo(() => {
    try {
      if (typeof window === 'undefined') return '00000000-0000-0000-0000-000000000000';
      return getClientId();
    } catch {
      return '00000000-0000-0000-0000-000000000000';
    }
  }, []);
  
  // בדיקת client_id
  useEffect(() => {
    console.log('🔍 Client ID check:', { clientId });
  }, []);
  
  const [endedSnapshot, setEndedSnapshot] = useState(null); // MUST be before any useEffect using it
  // { dealer: [...], players: [{seat, player_name, hand, total}], takenAt: ISO }
  const [banner, setBanner] = useState(null); // {title, lines: []}
  const [timerTick, setTimerTick] = useState(0);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [turnSince, setTurnSince] = useState(0);

  // hook קטן למניעת לחיצה כפולה ולביטול mouse emulation
  function useTapAction(action) {
    const [busy, setBusy] = useState(false);
    return {
      busy,
      handler: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        try { await action(); } finally {
          // השהיה קצרה כדי למנוע שליחה כפולה מרילטיים
          setTimeout(()=>setBusy(false), 1500);
        }
      }
    };
  }

  // נקה snapshot רק כשנכנסים לסיבוב חדש (playing / lobby / dealing)
  useEffect(() => {
    if (session?.state === 'playing' || session?.state === 'lobby' || session?.state === 'dealing') {
      setEndedSnapshot(null);
    }
  }, [session?.state]);

  // לוגים לבדיקות
  useEffect(() => {
    if (endedSnapshot) console.log('[BJ] snapshot set at', endedSnapshot.takenAt);
  }, [endedSnapshot]);
  useEffect(() => {
    console.log('[BJ] state=', session?.state);
  }, [session?.state]);

  // 1) מחשבים קודם את myRow
  const myRow = useMemo(
    () => {
      // מצא את השורה הנוכחית של השחקן (עם hand_idx הנוכחי)
      const currentPlayerRow = players.find(p => p.id === session?.current_player_id);
      if (currentPlayerRow && currentPlayerRow.player_name === name) {
        return currentPlayerRow;
      }
      // אם אין תור נוכחי, חזור לשורה הראשונה של השחקן
      return players.find(p => p.player_name === name) || null;
    },
    [players, name, session?.current_player_id]
  );

  // 2) גוזרים את myTurn מ-myRow
  const myTurn = useMemo(() => (
    !!myRow &&
    session?.current_player_id === myRow.id &&
    session?.state === 'acting' &&
    myRow.status === 'acting'
  ), [session?.current_player_id, session?.state, myRow?.id, myRow?.status]);

  // 3) חלון חסד קצר לפלטר ג'יטר ברילטיים
  useEffect(() => {
    if (myTurn) setTurnSince(Date.now());
  }, [myTurn]);


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
    if (!Number.isFinite(v) || v < MIN_PLAY) return MIN_PLAY;
    return Math.min(v, getVault());
  };
  // 4) שאר הנגזרות משתמשות ב-canActNow / myTurn
  const canActNow = myTurn || (turnSince && Date.now() - turnSince < 200);
  const turnGlow = myTurn ? 'ring-2 ring-emerald-400' : '';
  const canDouble = myTurn && Array.isArray(myRow?.hand) && myRow.hand.length === 2;
  const canSurrender = canDouble;

  // Button availability helpers
  const canPlaceBet = !!myRow && ['lobby','playing'].includes(session?.state);
  const canDeal = session?.state === 'playing';
  const canSettle = session?.state === 'acting'; // האוטופיילוט יעשה לבד, זה רק fallback ידני

  // tap guard למניעת לחיצה כפולה
  const [lock, setLock] = useState(false);
  const guard = (fn) => async (...args) => {
    if (lock) return;
    try { setLock(true); await fn(...args); }
    finally { setTimeout(()=>setLock(false), 200); }
  };

  // tap actions למניעת לחיצה כפולה
  const hitTap = useTapAction(guard(hit));
  const standTap = useTapAction(guard(stand));
  const doubleTap = useTapAction(guard(double));
  const splitTap = useTapAction(guard(splitHand));

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
          min_bet: MIN_PLAY
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
        const { data } = await supabase.from("bj_players").select("*").eq("session_id", session.id).order("seat,hand_idx");
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
  }, [session?.id, session?.state, players.length, players.map?.(p=>p.status + ':' + p.play).join('|'), isLeader]);

  // Timer tick for UI updates
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // ביטוח מופיע רק פעם אחת בתחילת הסיבוב כשהדילר מראה אס
  useEffect(() => {
    if (
      session?.state === 'acting' &&
      session?.dealer_hand?.[0]?.startsWith('A') &&
      !myRow?.insurance_play &&
      !session?.insuranceOffered // דגל חדש שמונע כפילויות
    ) {
      setShowInsuranceModal(true);
      // סמן שהביטוח כבר הוצע
      supabase.from('bj_sessions').update({ insuranceOffered: true }).eq('id', session.id);
    }
  }, [session?.state]);

  // Heartbeat: מריץ autopilot כשיש דדליין פעיל (הימורים/תור/הפסקה בין סיבובים)
  useEffect(() => {
    if (!isLeader || !session?.id) return;

    const tick = setInterval(() => {
      // אם יש חלון הימורים, תור שחקן, או טיימר לסיבוב הבא — תריץ אוטומציה
      if (
        (session.state === 'playing' && session.bet_deadline) ||
        (session.state === 'acting'  && session.turn_deadline) ||
        (session.state === 'ended'   && session.next_round_at)
      ) {
        autopilot(session);
      }
    }, 500);

    return () => clearInterval(tick);
  }, [isLeader, session?.id, session?.state, session?.bet_deadline, session?.turn_deadline, session?.next_round_at]);

  // "דחיפה" לפתיחת PLAYING אם נשארים ב-lobby יותר מכמה שניות
  useEffect(() => {
    if (!session?.id || !isLeader) return;
    if (session.state === 'lobby') {
      const deadline = new Date(Date.now() + 15000).toISOString();
      supabase.from('bj_sessions').update({ state:'playing', bet_deadline: deadline, dealer_hand:[], dealer_hidden:true }).eq('id', session.id);
    }
  }, [isLeader, session?.id, session?.state]);

  // Turn timeout is now handled by the Heartbeat timer above

  // mark 'left' on tab close (best-effort)
  useEffect(() => {
    if (!session?.id) return;
    const client_id = clientId;
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
  async function withFreshMyRow() {
    if (!session?.id) return null;
    if (myRow?.id) {
      const { data } = await supabase.from("bj_players").select("*").eq("id", myRow.id).maybeSingle();
      return data || null;
    }
    const { data } = await supabase.from("bj_players")
      .select("*")
      .eq("session_id", session.id)
      .eq("client_id", clientId)
      .eq("hand_idx", 0)
      .maybeSingle();
    return data || null;
  }

  async function ensureSeated() {
    if (!session?.id || !name) return null;
    if (getVault() < minRequired) {
      setMsg(`Minimum entry fee is ${fmt(minRequired)}`);
      return null;
    }
    const client_id = clientId;

    // יש כבר שורה שלי?
    const { data: existing } = await supabase
      .from("bj_players")
      .select("*")
      .eq("session_id", session.id)
      .eq("client_id", client_id)
      .maybeSingle();
    if (existing) return existing;

    // כיסאות תפוסים – סופרים רק יד ראשית
    const { data: rows, error: e1 } = await supabase
      .from("bj_players")
      .select("seat, hand_idx")
      .eq("session_id", session.id);
    if (e1) { console.error(e1); setMsg("Seat query failed"); return null; }
    const used = new Set((rows || []).filter(r => (r.hand_idx ?? 0) === 0).map(r => r.seat));

    let free = -1;
    for (let i = 0; i < (session.seat_count ?? 6); i++) if (!used.has(i)) { free = i; break; }
    if (free < 0) { setMsg("No free seats"); return null; }

    const payload = {
      session_id: session.id,
      client_id,
      player_name: name,
      seat: free,
      stack: Math.min(getVault(), Math.max(10000, minRequired)),
      play: 0,
      hand: [],
      status: "seated",
      acted: false,
      hand_idx: 0,
    };

  const up = await supabase
    .from("bj_players")
    .upsert(payload, { onConflict: "session_id,client_id,hand_idx" })
    .select("*")
    .maybeSingle();

    if (up.error) {
      console.error("Failed to join seat:", up.error);
      setMsg("Failed to join seat");
      return null;
    }
    return up.data;   // עכשיו חוזר עם id
  }

  async function placeBet() {
    let row = myRow;
    if (!row) row = await ensureSeated();
    const effectiveMinBet = Math.max(MIN_PLAY, minRequired);
    if (!row || !row.id) return;
    if (play < effectiveMinBet) {
      setMsg(`Minimum play is ${fmt(effectiveMinBet)}`);
      return;
    }

    // בדוק שיש מספיק כסף ב-vault
    const currentVault = getVault();
    if (currentVault < play) {
      setMsg("Insufficient vault balance");
      return;
    }

    // הוצא כסף מה-vault
    const newVault = currentVault - play;
    setVault(newVault);
    // עדכן גם את ה-state בדף הראשי
    if (setVaultBoth) {
      setVaultBoth(newVault);
    }

    const { error } = await supabase.from("bj_players").update({
      play: play,
      status: 'playing'
      // acted: true  <-- removed, so player can act in 'acting' phase
    }).eq("id", row.id);

    if (error) {
      console.warn('PATCH bj_players error:', {
        code: error.code, message: error.message, details: error.details, hint: error.hint
      });
      setMsg("Failed to place play");
      // החזר כסף ל-vault אם ההימור נכשל
      setVault(currentVault);
    } else {
      setDisplayValue(''); // נקה את התצוגה אחרי הימור מוצלח
    }
  }

  async function openBetting() {
    if (!session?.id) return;
    const deadline = new Date(Date.now() + 15000).toISOString(); // 15 שניות הימור
    const { error } = await supabase
      .from('bj_sessions')
      .update({ state: 'playing', bet_deadline: deadline, insuranceOffered: false })
      .eq('id', session.id);
    if (error) console.error('[openBetting] error:', error);
  }

  // Helper: Build action queue (including split hands)
  function buildActionQueue(players = []) {
    // סדר: seat עולה, ואז hand_idx (0 לפני 1)
    const alive = players
      .filter(p => ['acting','playing','seated','blackjack','stood','busted','surrendered','settled'].includes(p.status))
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
    const actables = (ps || []).filter(p => (p.play || 0) > 0 && p.status === 'acting');
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

    // 0) אם המצב לא חוקי (acting אבל אין current_player_id או אין ידיים) – חזור ל-PLAYING
    if (s.state === 'acting') {
      const { data: ps } = await supabase.from('bj_players').select('id,hand,play,status').eq('session_id', s.id);
      const anyHands = (ps || []).some(p => (p.hand?.length || 0) > 0);
      const someoneActing = (ps || []).some(p => p.status === 'acting');
      if (!anyHands || (!someoneActing && !s.current_player_id)) {
        const deadline = new Date(Date.now() + 15000).toISOString();
        await supabase.from('bj_players').update({ hand: [], status: 'seated', acted: false, play: 0 }).eq('session_id', s.id);
        await supabase.from('bj_sessions').update({
          state: 'playing', dealer_hand: [], dealer_hidden: true,
          bet_deadline: deadline, current_player_id: null, turn_deadline: null, next_round_at: null
        }).eq('id', s.id);
        return;
      }
    }

    // טען מצב עדכני
    const { data: ps } = await supabase
      .from('bj_players').select('*')
      .eq('session_id', s.id).order('seat,hand_idx');

    const participants = (ps || []).filter(p => (p.play || 0) > 0 && p.status !== 'left');
    const hasBets      = participants.length > 0;
    const everyoneDone = hasBets && participants.every(p => ['stood','busted','blackjack','settled'].includes(p.status));

    // 1) LOBBY / ENDED -> PLAYING (אוטומטי)
    if (s.state === 'lobby' || (s.state === 'ended' && s.next_round_at && new Date() > new Date(s.next_round_at))) {
      // אפס לכולם את היד הקודמת אם צריך (ב-ENDED)
      if (s.state === 'ended') {
        await supabase.from('bj_players').update({
          hand: [], play: 0, result: null, acted: false
          // השאר את status ו-name כדי לא לאבד נראות
        }).eq('session_id', s.id);
      }

      // פתח חלון הימורים חדש ל־15 שניות
      const deadline = new Date(Date.now() + 15000).toISOString();
      await supabase.from('bj_sessions').update({
        state: 'playing',
        dealer_hand: [],
        dealer_hidden: true,
        current_player_id: null,
        turn_deadline: null,
        bet_deadline: deadline,
        next_round_at: null
      }).eq('id', s.id);
      return;
    }

    // 2) PLAYING -> DEAL (כשעבר הדדליין ויש לפחות משתתף אחד)
    if (s.state === 'playing') {
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
    const participants = (ps || []).filter(p => (p.play || 0) >= (session.min_bet || MIN_PLAY) && p.status !== 'left');
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
    if (!session || !myTurn) return;
    if (!Array.isArray(myRow?.hand) || myRow.hand.length !== 2) return;
    if (getVault() < (myRow?.play || 0)) { setMsg("Insufficient vault balance to double"); return; }

    // משוך שורה עדכנית מה-DB (ולא מ-state) כדי לא לטעות עם lag
    const row = await withFreshMyRow();
    if (!row || row.status !== 'acting') return;

    // חייבים בדיוק 2 קלפים כדי להכפיל
    if (!Array.isArray(row.hand) || row.hand.length !== 2) return;

    // כסף ב-vault
    const currentVault = getVault();
    const additionalBet = row.play;
    if (currentVault < additionalBet) {
      setMsg("Insufficient vault balance to double");
      return;
    }

    // הורדת הסכום הנוסף — לפני ה-PATCH
    const newVault = currentVault - additionalBet;
    setVault(newVault);
    if (setVaultBoth) setVaultBoth(newVault);

    // שליפת קלף ודחיפתו ליד
    let shoe = [...(session.shoe || [])];
    const card = shoe.pop();
    const hand = [...row.hand, card];
    const newBet = row.play * 2;

    // בדוק אם יש שינוי לפני PATCH
    const updates = { play: newBet, hand, status: 'stood', acted: true };
    const nothingChanged =
      newBet === row.play &&
      JSON.stringify(hand) === JSON.stringify(row.hand) &&
      row.status === 'stood' && row.acted === true;
    
    if (nothingChanged) {
      // החזר כסף כי לא היה שינוי
      setVault(currentVault);
      if (setVaultBoth) setVaultBoth(currentVault);
      return;
    }

    // עדכון שחקן
    const { error: updErr } = await supabase
      .from("bj_players")
      .update(updates)
      .eq("id", row.id);

    if (updErr) {
      // החזר כספים אם ה-PATCH נכשל
      setVault(currentVault);
      if (setVaultBoth) setVaultBoth(currentVault);

      console.warn('PATCH bj_players double error:', {
        code: updErr.code, message: updErr.message, details: updErr.details, hint: updErr.hint
      });
      setMsg(updErr.details || updErr.message || "Double failed");
      return;
    }

    // עדכון השישה
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
    if (!session) return;
    const row = await withFreshMyRow();
    if (!row || row.status !== 'acting' || !canSplit(row)) return;
    
    const h = row.hand;
    if (h.length !== 2) return;
    
    // בדוק שיש מספיק כסף ב-vault
    const currentVault = getVault();
    const newBet = row.play;
    if (currentVault < newBet) {
      setMsg("Insufficient vault balance for split");
      return;
    }
    
    // הוצא כסף מה-vault
    const newVault = currentVault - newBet;
    setVault(newVault);
    // עדכן גם את ה-state בדף הראשי
    if (setVaultBoth) {
      setVaultBoth(newVault);
    }
    
    try {
      let shoe = [...session.shoe];
      const newCard1 = shoe.pop();
      const newCard2 = shoe.pop();
      
      // עדכון היד הראשונה (נשארת בתור)
      const { error: updateErr } = await supabase.from("bj_players").update({
        hand: [h[0], newCard1],
        // לא משנים status כאן – נשאר 'acting'
      }).eq("id", row.id);
      
      if (updateErr) {
        console.warn('PATCH bj_players split update error:', {
          code: updateErr.code, message: updateErr.message, details: updateErr.details, hint: updateErr.hint
        });
        setMsg("Split failed - please try again");
        return;
      }
      
      // יצירת יד שניה
      const { error: insertErr } = await supabase.from('bj_players').insert({
        session_id: session.id,
        seat: row.seat,
        player_name: row.player_name,
        client_id: row.client_id,
        play: newBet,
        hand: [h[1], newCard2],
        status: 'acting',
        split_from: row.id,
        hand_idx: 1
      });
      
      if (insertErr) {
        console.warn('INSERT bj_players split error:', {
          code: insertErr.code, message: insertErr.message, details: insertErr.details, hint: insertErr.hint
        });
        setMsg("Split failed - please try again");
        return;
      }
      
      // עדכון הנעל
      const { error: shoeErr } = await supabase.from("bj_sessions").update({ shoe }).eq("id", session.id);
      if (shoeErr) {
        console.error('[splitHand] shoe error:', shoeErr);
      }
      
      // השאר את התור על היד הראשונה ורענן דדליין
      if (isLeader) {
        const deadline = new Date(Date.now() + (session?.turn_seconds || 20) * 1000).toISOString();
        await supabase.from('bj_sessions')
          .update({ current_player_id: row.id, turn_deadline: deadline })
          .eq('id', session.id);
      }
      // אל תקרא ל-afterMyMove כאן
    } catch (error) {
      console.error('[splitHand] unexpected error:', error);
      setMsg("Split failed - please try again");
    }
  }

  // Insurance function
  async function buyInsurance() {
    if (!session || !myRow || myRow.status !== 'acting') return;
    
    // בדוק שהדילר מראה Ace
    const dealerFirstCard = session.dealer_hand?.[0];
    if (!dealerFirstCard || !dealerFirstCard.startsWith('A')) {
      setMsg("Insurance only available when opponent shows Ace");
      return;
    }
    
    // בדוק שלא קנה כבר ביטוח
    if (myRow.insurance_play > 0) {
      setMsg("Insurance already purchased");
      return;
    }
    
    // בדוק שיש מספיק כסף
    const currentVault = getVault();
    const insuranceAmount = Math.floor(myRow.play / 2);
    if (currentVault < insuranceAmount) {
      setMsg("Insufficient vault balance for insurance");
      return;
    }
    
    // הוצא כסף מה-vault
    const newVault = currentVault - insuranceAmount;
    setVault(newVault);
    // עדכן גם את ה-state בדף הראשי
    if (setVaultBoth) {
      setVaultBoth(newVault);
    }
    
    // עדכן את הביטוח במסד הנתונים
    await supabase.from("bj_players").update({
      insurance_play: insuranceAmount
    }).eq("id", myRow.id);
    
    setMsg(`Insurance purchased: ${fmt(insuranceAmount)} MLEO`);
    setShowInsuranceModal(false);
  }

  // Surrender function
  async function surrender() {
    if (!myRow || myRow.status !== 'acting' || myRow.hand?.length !== 2) return;
    
    // החזר חצי מההימור ל-vault
    const currentVault = getVault();
    const refund = Math.floor(myRow.play / 2);
    const newVault = currentVault + refund;
    setVault(newVault);
    // עדכן גם את ה-state בדף הראשי
    if (setVaultBoth) {
      setVaultBoth(newVault);
    }
    
    await supabase.from("bj_players").update({
      status: 'surrendered',
      acted: true
    }).eq("id", myRow.id);
    
    await afterMyMove();
  }

  async function dealerAndSettle() {
    if (!session) return;

    const { data: ps } = await supabase.from("bj_players")
      .select("*").eq("session_id", session.id).order('seat,hand_idx');

    const participants = (ps || []).filter(p => (p.play || 0) > 0 && p.status !== 'left');
    const done = participants.every(p => ['stood','busted','blackjack','settled'].includes(p.status));
    if (!done) { setMsg("Players still acting"); return; }

    // תחילה חושף את הקלף הנסתר של הדילר
    let dealer = [...(session.dealer_hand||[])];
    let shoe   = [...(session.shoe||[])];
    
    // חישוף הקלף הנסתר
    await supabase.from('bj_sessions').update({
      dealer_hidden: false, 
      state: 'settling'
    }).eq('id', session.id);
    
    // המתנה קצרה לאחר חישוף הקלף הנסתר
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // הוספת קלפים לדילר אחד אחד עם השהיות
    while (handValue(dealer) < 17 && shoe.length) {
      const newCard = shoe.pop();
      dealer.push(newCard);
      
      // עדכון מיידי של היד במסד הנתונים
      await supabase.from('bj_sessions').update({
        dealer_hand: dealer,
        shoe: shoe
      }).eq('id', session.id);
      
      // השהיה של 1.5 שניות בין קלפים
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const dealerScore = handValue(dealer);
    const dealerBust  = dealerScore > 21;
    const dealerBlackjack = dealer.length === 2 && dealerScore === 21;

    // אם לדילר יש Blackjack - חושף מיד ומפסיק את היד
    if (session?.dealer_hidden && dealerBlackjack) {
      // חושף מיד אם יש 21
      await supabase.from('bj_sessions').update({
        dealer_hidden: false,
        state: 'settling'
      }).eq('id', session.id);

      // עדכן תוצאות מיידיות לשחקנים (לפני שלב acting)
      for (const p of participants) {
        const s = handValue(p.hand);
        const result = (p.status === 'blackjack')
          ? 'push' // גם הוא וגם הדילר ב-21
          : 'lose';
        await supabase.from('bj_players')
          .update({ result, status: 'settled', play: 0 })
          .eq('id', p.id);
      }

      // קבע סוף סיבוב מהיר
      await supabase.from('bj_sessions').update({
        state: 'ended',
        next_round_at: new Date(Date.now() + 10000).toISOString() // סיום תוך 10 שניות
      }).eq('id', session.id);

      return; // מסיים פה
    }

    const lines = [];
    let myResult = null; // רק לשחקן המקומי
    for (const p of participants) {
      const s = handValue(Array.isArray(p.hand) ? p.hand : []);
      let result='lose', prize=0;

      if (p.status==='blackjack') { result='blackjack'; prize=Math.floor(p.play*3/2); }
      else if (dealerBust && s<=21) { result='win'; prize=p.play; }
      else if (s>21) { result='lose'; }
      else if (s>dealerScore) { result='win'; prize=p.play; }
      else if (s===dealerScore) { result='push'; prize=p.play; }
      else { result='lose'; }

      let delta = prize; // רק הזכייה - ההימור כבר ירד בהתחלה

      // חישוב ביטוח
      if (p.insurance_play > 0) {
        if (dealerBlackjack) {
          // זכייה בביטוח - 2:1
          const insuranceWin = p.insurance_play * 2;
          delta += insuranceWin;
        }
        // אם הדילר לא עשה 21, הביטוח נפסד (כבר ירד מה-vault)
      }

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
        myResult = { result, delta, dealerBust, dealerScore, originalBet: p.play, insuranceWin: p.insurance_play > 0 && dealerBlackjack ? p.insurance_play * 2 : 0 };
      }

      await supabase.from('bj_players').update({
        result, status:'settled', play:0, insurance_play:0
      }).eq('id', p.id);

      const tag = result==='win' ? '+'
               : result==='blackjack' ? '+'
               : result==='push' ? '±'
               : '-';
      lines.push(`Seat ${p.seat+1} • ${p.player_name} — ${result.toUpperCase()} (${tag}${fmt(Math.abs(delta))})`);
    }

    // יצירת snapshot לפני המעבר ל-ENDED
    const snapshotPlayers = participants.map(p => ({
      seat: p.seat,
      player_name: p.player_name,
      hand: Array.isArray(p.hand) ? [...p.hand] : [],
      total: handValue(Array.isArray(p.hand) ? p.hand : []),
      play: p.play ?? 0,
      result: p.result ?? null
    }));
    setEndedSnapshot({
      dealer: [...dealer],
      players: snapshotPlayers,
      takenAt: new Date().toISOString()
    });

    // הצג את התוצאות למשך 3 שניות לפני סיום המשחק
    await new Promise(resolve => setTimeout(resolve, 3000));

    await supabase.from('bj_sessions').update({ 
      state:'ended',
      next_round_at: new Date(Date.now() + 5000).toISOString() // 5 שניות לסיבוב הבא
    }).eq('id', session.id);

    // הצג הודעות אישיות לכל שחקן
    if (myResult) {
      const { result, delta, dealerBust, dealerScore, originalBet, insuranceWin } = myResult;
      const lines = [
        `Opponent: ${dealerBust ? 'BUST' : dealerScore}`,
        result === 'win' || result === 'blackjack' ? `+${fmt(originalBet + delta)} MLEO` :
        result === 'push' ? 'No change' : `Lost ${fmt(originalBet)} MLEO`
      ];
      
      // הוסף הודעה על ביטוח אם רלוונטי
      if (insuranceWin > 0) {
        lines.push(`Insurance win: +${fmt(insuranceWin)} MLEO`);
      }
      
      setBanner({
        title: result === 'win' ? '🎉 YOU WIN!' : 
               result === 'blackjack' ? '🎉 BLACKJACK!' :
               result === 'push' ? '🤝 PUSH' : '💔 YOU LOSE',
        lines: lines
      });
    }
  }

  async function resetRound() {
    if (!session) return;
    await supabase.from("bj_players").update({
      hand: [], play: 0, result: null, status: 'seated', acted: false, insurance_play: 0
    }).eq("session_id", session.id);
    await supabase.from("bj_sessions").update({
      state: 'lobby', dealer_hand: [], dealer_hidden: true
    }).eq("id", session.id);
    setBanner(null);
  }

  // ---------- UI ----------
  if (!roomId) return <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">Select or create a room to start.</div>;
  const dealerV = handValue(session?.dealer_hand || []);

  const currentVault = getVault();

  return (
    <div className="w-full h-full flex flex-col p-1 md:p-2 gap-1 md:gap-2 -mt-1">

      <div className="flex items-center justify-between bg-white/5 rounded-lg p-2 border border-white/10">
        <div className="text-white font-bold text-base md:text-lg">Blackjack</div>
        <div className="flex items-center gap-2 text-white/70 text-xs md:text-sm">
          <span>Min: {fmt(minRequired)}</span>
          <span>💰 {fmt(currentVault)}</span>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col gap-1 md:gap-2">
        {/* Dealer Section - Fixed Height */}
        <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 rounded-lg p-2 md:p-3 border border-red-400/30 h-32 sm:h-40 relative">
          <div className="text-center h-full flex flex-col justify-center">
            {/* Hide text during dealing/acting for more card space */}
            {!(session?.state === 'dealing' || session?.state === 'acting') && (
              <div className="text-white font-bold text-xs mb-0.5">Opponent</div>
            )}
            <div className="flex items-center justify-center overflow-x-auto whitespace-nowrap py-0.5 gap-0.5">
              {(() => {
                const showDealerFromSnap = (session?.state === 'settling' || session?.state === 'ended') && endedSnapshot;
                const dealerCards = showDealerFromSnap ? (endedSnapshot?.dealer || []) : (session?.dealer_hand || []);
                return dealerCards.map((c,i)=>(
                  <Card key={i} code={c} hidden={session?.dealer_hidden && i===1 && !showDealerFromSnap} isDealing={session?.state === 'dealing' || session?.state === 'acting'} />
                ));
              })()}
            </div>
            {!(session?.state === 'dealing' || session?.state === 'acting') && (
              <div className="text-white/80 text-xs mt-0.5">
                {(() => {
                  const showDealerFromSnap = (session?.state === 'settling' || session?.state === 'ended') && endedSnapshot;
                  const dealerCards = showDealerFromSnap ? (endedSnapshot?.dealer || []) : (session?.dealer_hand || []);
                  return `Total: ${session?.dealer_hidden && !showDealerFromSnap ? "—" : (handValue(dealerCards) || "—")}`;
                })()}
              </div>
            )}
            
            {/* Timers in dealer window - bottom left */}
            <div className="absolute bottom-2 left-2 text-sm">
              {session?.state === 'playing' && session?.bet_deadline && (
                <div className="text-amber-400 font-bold text-lg">
                  🕒 {timerTick >= 0 && Math.max(0, Math.ceil((new Date(session.bet_deadline).getTime() - Date.now()) / 1000))}s
                </div>
              )}
              {session?.turn_deadline && session?.current_player_id === myRow?.id && (
                <div className="text-amber-300 font-bold text-lg">
                  ⏰ {timerTick >= 0 && Math.max(0, Math.ceil((new Date(session.turn_deadline).getTime() - Date.now())/1000))}s
                </div>
              )}
            </div>
            
            {/* SURRENDER button in top-right corner */}
            {canSurrender && (
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
            let occupant = players.find(p=>p.seat===i);
            let nameToShow = occupant?.player_name;
            let betToShow = occupant?.play || 0;
            let handToShow = occupant?.hand;

            const useSnap = (session?.state === 'settling' || session?.state === 'ended') && endedSnapshot;
            if (useSnap) {
              const snap = endedSnapshot?.players?.find(sp => sp.seat === i);
              if (snap) {
                // בזמן settling/ended – תמיד snapshot!
                nameToShow = snap.player_name;
                betToShow = snap.play || 0;
                handToShow = snap.hand;
              } else {
                // אין snapshot (למשל כיסא ריק) – הצג ריק
                nameToShow = null;
                handToShow = [];
                betToShow = 0;
              }
            }

            const hv = Array.isArray(handToShow) ? handValue(handToShow) : null;
            const isMe = nameToShow === name;
            const isActive = session?.current_player_id && occupant?.id === session.current_player_id;
            return (
              <div key={i} className={`rounded-lg border ${isMe?'border-emerald-400 bg-emerald-900/20':'border-white/20 bg-white/5'} p-1 md:p-2 min-h-[80px] md:min-h-[120px] transition-all hover:bg-white/10 ${isActive ? 'ring-2 ring-amber-400' : ''} relative`}>
                {/* Turn indicator button - top right corner */}
                {occupant && (
                  <div className={`absolute top-1 right-1 w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'} ${isActive ? 'animate-pulse' : ''}`}></div>
                )}
                <div className="text-center">
                  {nameToShow ? (
                    <div className="space-y-0.5 md:space-y-1">
                      <div className="text-white font-bold text-xs md:text-sm truncate">{nameToShow}</div>
                      <div className="text-emerald-300 text-xs font-semibold">Play: {fmt(betToShow)}</div>
                      <HandView hand={handToShow} size="small" isDealing={session?.state === 'dealing' || session?.state === 'acting'}/>
                      <div className="text-white/80 text-xs">
                        Total: {hv??"—"}
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
          <div className="text-white/80 text-xs mb-1 font-semibold">Place Play</div>
          <div className="flex gap-1 mb-1">
            <input 
              type="text" 
              value={displayValue || (play >= 1000 ? fmt(play) : play.toString())} 
              placeholder="Amount"
              onChange={(e) => {
                const input = e.target.value;
                setDisplayValue(input); // שמור את מה שהמשתמש הקליד
                
                // המר למספר
                let num = 0;
                if (input.endsWith('K')) {
                  num = parseFloat(input.slice(0, -1)) * 1000;
                } else if (input.endsWith('M')) {
                  num = parseFloat(input.slice(0, -1)) * 1000000;
                } else if (input.endsWith('B')) {
                  num = parseFloat(input.slice(0, -1)) * 1000000000;
                } else {
                  num = parseFloat(input) || 0;
                }
                setBet(Math.max(1, Math.floor(num)));
              }}
              className="w-20 bg-black/40 text-white text-xs rounded px-1 py-1 border border-white/20 focus:border-emerald-400 focus:outline-none placeholder-white/50" 
            />
            <button onClick={placeBet} disabled={!canPlaceBet} className="w-12 px-2 py-1 rounded bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              PLACE
            </button>
            <button onClick={()=>{setBet(1000); setDisplayValue('1K');}} className="w-12 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-all">
              1K
            </button>
            <button onClick={()=>{setBet(10000); setDisplayValue('10K');}} className="w-12 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-all">
              10K
            </button>
            <button onClick={()=>{setBet(100000); setDisplayValue('100K');}} className="w-12 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-all">
              100K
            </button>
            <button onClick={()=>{setBet(1000000); setDisplayValue('1M');}} className="w-12 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-all">
              1M
            </button>
          </div>
          <div className="text-white/60 text-xs">Vault: {fmt(getVault())} MLEO</div>
        </div>

        <div className="bg-white/5 rounded-lg p-1 md:p-2 border border-white/10 h-full relative z-20 pointer-events-auto select-none">
          <div className="text-white/80 text-xs mb-1 font-semibold">Game Actions</div>
          <div className="grid grid-cols-2 gap-1">
            <button 
              onPointerDown={hitTap.handler}
              disabled={!canActNow || hitTap.busy}
              aria-disabled={!canActNow || hitTap.busy}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 py-3 md:px-3 md:py-4 rounded bg-gradient-to-r from-emerald-600 to-emerald-700
                        hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation select-none active:scale-95 ${turnGlow}`}>
              HIT
            </button>
            <button 
              onPointerDown={standTap.handler}
              disabled={!canActNow || standTap.busy}
              aria-disabled={!canActNow || standTap.busy}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 py-3 md:px-3 md:py-4 rounded bg-gradient-to-r from-blue-600 to-blue-700
                        hover:from-blue-700 hover:to-blue-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation select-none active:scale-95 ${turnGlow}`}>
              STAND
            </button>
            <button 
              onPointerDown={doubleTap.handler}
              disabled={!canDouble || doubleTap.busy}
              aria-disabled={!canDouble || doubleTap.busy}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 py-3 md:px-3 md:py-4 rounded bg-gradient-to-r from-amber-600 to-amber-700
                        hover:from-amber-700 hover:to-amber-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation select-none active:scale-95 ${turnGlow}`}>
              DOUBLE
            </button>
            <button 
              onPointerDown={splitTap.handler}
              disabled={!myRow || !canSplit(myRow) || splitTap.busy}
              aria-disabled={!myRow || !canSplit(myRow) || splitTap.busy}
              style={{ touchAction: 'manipulation' }}
              className={`px-2 py-3 md:px-3 md:py-4 rounded bg-gradient-to-r from-purple-600 to-purple-700
                        hover:from-purple-700 hover:to-purple-800 text-white font-bold text-sm transition-all
                        disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation select-none active:scale-95 ${turnGlow}`}>
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

      {/* Insurance Modal */}
      {showInsuranceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-yellow-400/30 rounded-lg p-6 max-w-sm mx-4">
            <div className="text-center">
              <div className="text-yellow-400 font-bold text-lg mb-2">🛡️ Insurance Available</div>
              <div className="text-white/80 text-sm mb-4">
                Opponent shows Ace!<br/>
                Insurance: {fmt(Math.floor((myRow?.play || 0) / 2))} MLEO<br/>
                Prize: 2:1 if opponent has 21
              </div>
              <div className="flex gap-3 justify-center">
                <button 
                  onClick={buyInsurance}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded transition-all"
                >
                  BUY INSURANCE
                </button>
                <button 
                  onClick={() => setShowInsuranceModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded transition-all"
                >
                  DECLINE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}