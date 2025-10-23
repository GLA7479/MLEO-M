import { createClient } from '@supabase/supabase-js'

// ---- Supabase client (V1 - Legacy) ----
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_V1
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_V1
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL_V1 or NEXT_PUBLIC_SUPABASE_ANON_KEY_V1')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 20 } },
})

// ---- Schema constants (match SQL) ----
export const TABLES = {
  TABLES: 'casino_tables',
  PLAYERS: 'casino_players',
  GAMES: 'casino_games',
}

export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished',
}

export const PLAYER_STATUS = {
  ACTIVE: 'active',
  FOLDED: 'folded',
  ALL_IN: 'all_in',
}

// Optional: simple helpers for realtime
export function watchTable(tableId, cb) {
  return supabase
    .channel(`t_${tableId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.PLAYERS, filter: `table_id=eq.${tableId}` }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.TABLES, filter: `id=eq.${tableId}` }, cb)
    .subscribe()
}

export function watchGame(gameId, cb) {
  return supabase
    .channel(`g_${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.GAMES, filter: `id=eq.${gameId}` }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.PLAYERS, filter: `game_id=eq.${gameId}` }, cb)
    .subscribe()
}