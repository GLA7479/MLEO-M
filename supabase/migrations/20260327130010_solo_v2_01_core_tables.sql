-- Solo V2 core data model (Deliverable 2)
-- Source: styles/sql/solo_v2/01_solo_v2_core_tables.sql

create extension if not exists pgcrypto;

create table if not exists public.solo_v2_games (
  game_key text primary key,
  route_path text not null unique,
  title text not null,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solo_v2_sessions (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.solo_v2_games(game_key),
  player_ref text not null,
  session_status text not null default 'created',
  session_mode text not null default 'standard',
  entry_amount bigint not null default 0 check (entry_amount >= 0),
  reward_amount bigint not null default 0 check (reward_amount >= 0),
  net_amount bigint not null default 0,
  server_outcome_summary jsonb not null default '{}'::jsonb,
  client_nonce text null,
  integrity_token text null,
  idempotency_key text null,
  expires_at timestamptz null,
  resolved_at timestamptz null,
  cancelled_at timestamptz null,
  cancel_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solo_v2_sessions_status_check check (
    session_status in ('created', 'in_progress', 'resolved', 'cancelled', 'expired')
  ),
  constraint solo_v2_sessions_mode_check check (
    session_mode in ('standard', 'freeplay')
  )
);

create table if not exists public.solo_v2_session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.solo_v2_sessions(id) on delete cascade,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.solo_v2_games
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.solo_v2_sessions
  add column if not exists player_ref text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists session_mode text not null default 'standard',
  add column if not exists entry_amount bigint not null default 0,
  add column if not exists net_amount bigint not null default 0,
  add column if not exists server_outcome_summary jsonb not null default '{}'::jsonb,
  add column if not exists client_nonce text,
  add column if not exists integrity_token text,
  add column if not exists idempotency_key text,
  add column if not exists expires_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'solo_v2_sessions'
      and column_name = 'started_at'
  ) then
    execute $sql$
      update public.solo_v2_sessions
      set created_at = coalesce(created_at, started_at, now())
      where created_at is null
    $sql$;
  else
    update public.solo_v2_sessions
    set created_at = coalesce(created_at, now())
    where created_at is null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'solo_v2_sessions'
      and column_name = 'device_id'
  ) then
    execute $sql$
      update public.solo_v2_sessions
      set player_ref = coalesce(player_ref, device_id, 'unknown')
      where player_ref is null
    $sql$;
  else
    update public.solo_v2_sessions
    set player_ref = coalesce(player_ref, 'unknown')
    where player_ref is null;
  end if;
end $$;

alter table public.solo_v2_sessions
  alter column player_ref set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'solo_v2_sessions_status_check'
  ) then
    alter table public.solo_v2_sessions
      add constraint solo_v2_sessions_status_check
      check (session_status in ('created', 'in_progress', 'resolved', 'cancelled', 'expired'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'solo_v2_sessions_mode_check'
  ) then
    alter table public.solo_v2_sessions
      add constraint solo_v2_sessions_mode_check
      check (session_mode in ('standard', 'freeplay'));
  end if;
end $$;

create unique index if not exists idx_solo_v2_sessions_idempotency_key
  on public.solo_v2_sessions (idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_solo_v2_games_enabled_sort
  on public.solo_v2_games (is_enabled, sort_order, game_key);

create index if not exists idx_solo_v2_sessions_player_game_created
  on public.solo_v2_sessions (player_ref, game_key, created_at desc);

create index if not exists idx_solo_v2_sessions_status_expires
  on public.solo_v2_sessions (session_status, expires_at);

create index if not exists idx_solo_v2_events_session_created
  on public.solo_v2_session_events (session_id, created_at desc);

create table if not exists public.solo_v2_player_stats (
  player_ref text not null,
  game_key text not null references public.solo_v2_games(game_key),
  plays_count bigint not null default 0 check (plays_count >= 0),
  wins_count bigint not null default 0 check (wins_count >= 0),
  losses_count bigint not null default 0 check (losses_count >= 0),
  total_entry_amount bigint not null default 0 check (total_entry_amount >= 0),
  total_reward_amount bigint not null default 0 check (total_reward_amount >= 0),
  net_amount bigint not null default 0,
  last_played_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_ref, game_key)
);

create index if not exists idx_solo_v2_player_stats_game
  on public.solo_v2_player_stats (game_key, updated_at desc);

create table if not exists public.solo_v2_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  session_id uuid null references public.solo_v2_sessions(id) on delete set null,
  player_ref text not null,
  game_key text not null references public.solo_v2_games(game_key),
  entry_delta bigint not null default 0,
  reward_delta bigint not null default 0,
  net_delta bigint not null default 0,
  ledger_status text not null default 'pending',
  ledger_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint solo_v2_reward_ledger_status_check check (
    ledger_status in ('pending', 'applied', 'reversed', 'failed')
  )
);

create index if not exists idx_solo_v2_reward_ledger_player_created
  on public.solo_v2_reward_ledger (player_ref, created_at desc);

create index if not exists idx_solo_v2_reward_ledger_session
  on public.solo_v2_reward_ledger (session_id);

create table if not exists public.solo_v2_freeplay_state (
  player_ref text primary key,
  allowance_per_day integer not null default 5 check (allowance_per_day >= 0),
  used_today integer not null default 0 check (used_today >= 0),
  remaining_today integer not null default 5 check (remaining_today >= 0),
  next_reset_at timestamptz null,
  last_claimed_at timestamptz null,
  state_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_solo_v2_freeplay_next_reset
  on public.solo_v2_freeplay_state (next_reset_at);

create or replace function public.solo_v2_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_solo_v2_games_touch_updated_at on public.solo_v2_games;
create trigger tr_solo_v2_games_touch_updated_at
before update on public.solo_v2_games
for each row execute function public.solo_v2_touch_updated_at();

drop trigger if exists tr_solo_v2_sessions_touch_updated_at on public.solo_v2_sessions;
create trigger tr_solo_v2_sessions_touch_updated_at
before update on public.solo_v2_sessions
for each row execute function public.solo_v2_touch_updated_at();

drop trigger if exists tr_solo_v2_player_stats_touch_updated_at on public.solo_v2_player_stats;
create trigger tr_solo_v2_player_stats_touch_updated_at
before update on public.solo_v2_player_stats
for each row execute function public.solo_v2_touch_updated_at();

drop trigger if exists tr_solo_v2_freeplay_state_touch_updated_at on public.solo_v2_freeplay_state;
create trigger tr_solo_v2_freeplay_state_touch_updated_at
before update on public.solo_v2_freeplay_state
for each row execute function public.solo_v2_touch_updated_at();
