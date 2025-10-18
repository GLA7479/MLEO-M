-- Add hand_invested column to casino_players table
-- This tracks how much each player has invested in the current hand (across all streets)

alter table public.casino_players
  add column if not exists hand_invested bigint not null default 0;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_casino_players_hand_invested
ON public.casino_players(hand_invested);

