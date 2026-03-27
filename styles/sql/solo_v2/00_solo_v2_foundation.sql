-- Arcade Solo V2 foundation bootstrap
-- Additive-only: creates isolated schema objects for Solo V2.

create table if not exists public.solo_v2_games (
  game_key text primary key,
  route_path text not null unique,
  title text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.solo_v2_sessions (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.solo_v2_games(game_key),
  device_id text not null,
  session_status text not null default 'started',
  play_mode text not null default 'paid',
  stake_amount bigint not null default 0 check (stake_amount >= 0),
  reward_amount bigint not null default 0 check (reward_amount >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);

create table if not exists public.solo_v2_session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.solo_v2_sessions(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_solo_v2_sessions_game_device
  on public.solo_v2_sessions (game_key, device_id, started_at desc);

create index if not exists idx_solo_v2_events_session
  on public.solo_v2_session_events (session_id, created_at desc);
