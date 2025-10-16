import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gltguiacptjnldxpqbtb.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdGd1aWFjcHRqbmxkeHBxYnRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2MzM0NjIsImV4cCI6MjA3NjIwOTQ2Mn0.7hijLVciSIhfHyT2ZCdXPvoMzAp-TzUgtE_5joKu1jQ'

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database tables
export const TABLES = {
  GAMES: 'games',
  PLAYERS: 'players',
  GAME_ACTIONS: 'game_actions'
}

// Game statuses
export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  FINISHED: 'finished'
}

// Player statuses
export const PLAYER_STATUS = {
  WAITING: 'waiting',
  READY: 'ready',
  FOLDED: 'folded',
  ALL_IN: 'all_in'
}
