-- QA Monthly Simulator reporting tables (current Supabase MP project)
-- Product gameplay data remains in normal tables; these tables index QA runs only.

create table if not exists public.qa_sim_run (
  id uuid primary key default gen_random_uuid(),
  run_label text not null default 'monthly-qa',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  mode text not null default 'live',
  seed int not null default 0,
  month_number int not null default 1,
  status text not null default 'running',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.qa_sim_event (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_sim_run(id) on delete cascade,
  user_id text not null,
  simulated_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  module text not null,
  action text not null,
  game_key text,
  session_id text,
  vault_before bigint,
  vault_after bigint,
  delta bigint,
  outcome text,
  error_message text,
  response_ms int,
  raw_response jsonb
);

create index if not exists qa_sim_event_run_user_idx on public.qa_sim_event (run_id, user_id);
create index if not exists qa_sim_event_run_day_idx on public.qa_sim_event (run_id, simulated_at);
create index if not exists qa_sim_event_session_idx on public.qa_sim_event (session_id) where session_id is not null;

create table if not exists public.qa_sim_session (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_sim_run(id) on delete cascade,
  user_id text not null,
  module text not null,
  game_key text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms int,
  actions_count int not null default 0,
  vault_start bigint,
  vault_end bigint,
  net_delta bigint,
  outcome text,
  error_count int not null default 0,
  stuck boolean not null default false
);

create index if not exists qa_sim_session_run_user_idx on public.qa_sim_session (run_id, user_id);

create table if not exists public.qa_sim_daily_summary (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_sim_run(id) on delete cascade,
  user_id text not null,
  sim_day int not null,
  date date not null,
  total_active_ms int not null default 0,
  session_count int not null default 0,
  miners_sessions int not null default 0,
  base_sessions int not null default 0,
  solo_v2_sessions int not null default 0,
  ov2_sessions int not null default 0,
  total_earned bigint not null default 0,
  total_spent bigint not null default 0,
  net_delta bigint not null default 0,
  vault_end bigint,
  error_count int not null default 0,
  stuck_count int not null default 0,
  top_game_key text,
  unique (run_id, user_id, sim_day)
);

create table if not exists public.qa_sim_economy_snapshot (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_sim_run(id) on delete cascade,
  user_id text not null,
  sim_day int not null,
  snapshot_time timestamptz not null default now(),
  vault_balance bigint not null default 0,
  total_earned_cumulative bigint not null default 0,
  total_spent_cumulative bigint not null default 0
);

create index if not exists qa_sim_economy_snapshot_run_user_day_idx
  on public.qa_sim_economy_snapshot (run_id, user_id, sim_day);

create table if not exists public.qa_sim_alert (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.qa_sim_run(id) on delete cascade,
  user_id text,
  sim_day int,
  alert_type text not null,
  severity text not null default 'warning',
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qa_sim_alert_run_severity_idx on public.qa_sim_alert (run_id, severity);

comment on table public.qa_sim_run is 'QA monthly simulator run metadata';
comment on table public.qa_sim_event is 'Per-action QA simulator event log';
comment on table public.qa_sim_session is 'Per-game-session QA simulator rollup';
comment on table public.qa_sim_daily_summary is 'Per-user per-day QA simulator summary';
comment on table public.qa_sim_economy_snapshot is 'Vault balance checkpoints for QA users';
comment on table public.qa_sim_alert is 'Economy/stability alerts from QA simulator';
