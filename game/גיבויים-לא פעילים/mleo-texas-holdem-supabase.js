// mleo-texas-holdem-supabase.js
// גרסת חדרים פרטיים יציבה ל-6 שחקנים, עם will_leave, טיימאאוט ו-RPCs תנ"ל.
// דרישות: הספרייה של Supabase טעונה באפליקציה שלך (supabase-js).

import { supabaseMP as supabase } from "../lib/supabaseClients";

// ===== קבועים =====
const BETTING_TIME_LIMIT_MS = 25_000; // 25 שניות לתור
const MAX_PLAYERS = 6;

// ===== עזר =====
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

// מחזיר true אם שחקן יכול לפעול
const canAct = (p) => p && p.status !== 'folded' && p.status !== 'all_in';

// ===== לוגיקת חדרים פרטיים =====

export async function createPrivateRoom({ name = 'Private Table', minBuyin = 10000, sb = 50, bb = 100, maxBuyin = null, maxPlayers = MAX_PLAYERS }) {
  const { data, error } = await supabase.rpc('create_private_table_priv', {
    p_name: name,
    p_min_buyin: minBuyin,
    p_small_blind: sb,
    p_big_blind: bb,
    p_max_buyin: maxBuyin,
    p_max_players: maxPlayers,
  });
  if (error) throw error;
  const tableId = data;

  // שליפת room_code להצגה למשתמש/העתקה
  const { data: tRow, error: tErr } = await supabase.from('casino_tables').select('id, room_code').eq('id', tableId).single();
  if (tErr) throw tErr;
  return tRow; // { id, room_code }
}

// הצטרפות לפי קוד חדר
export async function joinRoomByCode(roomCode) {
  const { data, error } = await supabase.rpc('join_private_table_by_code_priv', { p_room_code: roomCode });
  if (error) throw error;
  const tableId = data;
  return tableId;
}

// הושבה לשולחן (תופס כיסא פנוי 0..5)
export async function sitToTable(tableId, playerName, wallet = 'guest') {
  // מושיב על הכיסא הראשון הפנוי
  const { data: taken, error: e1 } = await supabase
    .from('casino_players')
    .select('seat_index')
    .eq('table_id', tableId)
    .order('seat_index');
  if (e1) throw e1;

  const occupied = new Set((taken || []).map((r) => r.seat_index));
  let seat = 0;
  while (seat < MAX_PLAYERS && occupied.has(seat)) seat++;
  if (seat >= MAX_PLAYERS) throw new Error('Table is full');

  const insert = {
    table_id: tableId,
    player_name: playerName,
    player_wallet: wallet,
    chips: 20_000, // תן ברירת מחדל; אצלך אפשר לעשות קנייה מה-Vault
    seat_index: seat,
    status: 'active',
  };
  const { data: p, error: e2 } = await supabase.from('casino_players').insert(insert).select('id').single();
  if (e2) throw e2;
  return { playerId: p.id, seatIndex: seat };
}

// עזיבה בטוחה: בזמן יד -> fold+will_leave, אחרת מוחק
export async function leaveTableSafe(playerId) {
  const { data, error } = await supabase.rpc('leave_table_safe_priv', { p_player_id: playerId });
  if (error) throw error;
  return true;
}

// ===== משחק: התחלה, טיימאאוט, אקשנים =====

// מתחיל יד אם יש 2+ שחקנים ובשולחן אין game פעיל
export async function startHandIfNeeded(tableId) {
  // לשרת יש לוגיקה: אם יש כבר משחק, יחזיר אותו
  const { data, error } = await supabase.rpc('start_new_hand_priv', { p_table_id: tableId });
  if (error) {
    if (String(error.message || '').includes('Need at least 2 players')) return null;
    throw error;
  }
  return data; // game_id
}

// "טיימאאוט פעם אחת": אם ה-deadline עבר – יקפל ויעביר תור
export async function forceTimeoutOnce(gameId) {
  const { data, error } = await supabase.rpc('force_timeout_fold_once_priv', { p_game_id: gameId });
  if (error) throw error;
  return data; // true/false
}

// לולאת טיימאאוט קלה בצד לקוח (רשות, אם אין לך Edge/Cron)
export function startClientTimeoutLoop(gameId) {
  let stop = false;
  const loop = async () => {
    while (!stop) {
      try {
        await forceTimeoutOnce(gameId);
      } catch (e) {
        console.warn('timeout loop error', e);
      }
      await sleep(2_000); // כל 2 שניות
    }
  };
  loop();
  return () => { stop = true; };
}

// ===== ריל-טיים (שידורים לפי table_id בלבד) =====

export function subscribeTable(tableId, { onPlayers, onGame, onError }) {
  const channel = supabase.channel(`table:${tableId}`, { config: { broadcast: { ack: true }, presence: { key: 'client' } } });

  // שינויים בשחקנים של השולחן
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'casino_players', filter: `table_id=eq.${tableId}` },
    (payload) => {
      if (onPlayers) onPlayers(payload);
    }
  );

  // שינויים במשחקים הקשורים לשולחן
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'casino_games', filter: `table_id=eq.${tableId}` },
    (payload) => {
      if (onGame) onGame(payload);
    }
  );

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR' && onError) onError(new Error('Realtime channel error'));
  });

  return () => supabase.removeChannel(channel);
}

// ===== UI helpers (דוגמאות לזרימה) =====

// חיבור כולל: הצטרפות לפי קוד → הושבה → התחלת יד אם צריך → ריל-טיים
export async function connectPrivateFlow({ roomCode, playerName }) {
  const tableId = await joinRoomByCode(roomCode);
  const { playerId, seatIndex } = await sitToTable(tableId, playerName);

  // נסה להתחיל יד אם אין עדיין
  await startHandIfNeeded(tableId);

  // משוך מצב ראשוני ל־UI
  const [{ data: tRow }, { data: players }, { data: gRow }] = await Promise.all([
    supabase.from('casino_tables').select('id, current_game_id').eq('id', tableId).single(),
    supabase.from('casino_players').select('*').eq('table_id', tableId).order('seat_index'),
    supabase.from('casino_games').select('*').eq('table_id', tableId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  // אם יש משחק פעיל – תתחיל לולאת טיימאאוט מקומית (רשות)
  let stopTimeout = null;
  if (tRow?.current_game_id) {
    stopTimeout = startClientTimeoutLoop(tRow.current_game_id);
  }

  return {
    tableId,
    playerId,
    seatIndex,
    currentGameId: tRow?.current_game_id || null,
    players: players || [],
    game: gRow || null,
    stopTimeoutLoop: stopTimeout,
  };
}

// דוגמת פעולה בסיסית: קיפול עצמי (בקליינט) + העברת תור בשרת דרך טיימאאוט
export async function actionFoldSelf(playerId, tableId) {
  // קיפול עצמי: סטטוס folded (RLS מאפשר ל-public/own לעדכן לפי המדיניות שלך)
  await supabase.from('casino_players').update({ status: 'folded' }).eq('id', playerId);

  // הבא: תן לשרת לעדכן turn במרווח הטיימאאוט או תזמן קריאת force_timeout אחת
  const { data: table } = await supabase.from('casino_tables').select('current_game_id').eq('id', tableId).single();
  if (table?.current_game_id) {
    await forceTimeoutOnce(table.current_game_id); // מבקש מהשרת "לפנות" אם נתקע
  }
}

// עזיבה נקייה (תוך כדי יד -> will_leave)
export async function leaveRoom(playerId) {
  await leaveTableSafe(playerId);
}
