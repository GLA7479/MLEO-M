-- ============================================================================
-- War Multiplayer schema (rooms + sessions)
-- ============================================================================

create table if not exists war_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references arcade_rooms(id) on delete cascade,
  stage text not null default 'lobby', -- lobby | dealing | flip | compare | war | ended
  seat_count int not null default 2,
  deck text[] not null default '{}',
  piles jsonb not null default '{"0":[],"1":[]}',
  current jsonb not null default '{"0":null,"1":null}',
  stash text[] not null default '{}',
  war_face_down int not null default 1,
  next_round_at timestamptz,
  round_no int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists war_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references war_sessions(id) on delete cascade,
  seat_index int,
  player_name text,
  client_id uuid,
  wins int not null default 0,
  joined_at timestamptz not null default now()
);

create index if not exists war_sessions_room_idx on war_sessions(room_id);
create index if not exists war_players_session_idx on war_players(session_id);

alter table war_sessions enable row level security;
alter table war_players enable row level security;

do $$ begin
  drop policy if exists war_sessions_select on war_sessions;
  drop policy if exists war_sessions_modify on war_sessions;
  drop policy if exists war_players_select on war_players;
  drop policy if exists war_players_modify on war_players;
end $$;

create policy war_sessions_select on war_sessions for select using (true);
create policy war_sessions_modify on war_sessions for all using (true) with check (true);
create policy war_players_select on war_players for select using (true);
create policy war_players_modify on war_players for all using (true) with check (true);

do $$ begin
  begin
    alter publication supabase_realtime add table war_sessions;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table war_players;
  exception
    when duplicate_object then null;
  end;
end $$;


