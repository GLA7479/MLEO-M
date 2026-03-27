-- Solo V2 generic session functions (Deliverable 2)
-- These functions define lifecycle plumbing only.
-- Game-specific outcome logic is intentionally deferred.

create or replace function public.solo_v2_create_session(
  p_player_ref text,
  p_game_key text,
  p_session_mode text default 'standard',
  p_entry_amount bigint default 0,
  p_client_nonce text default null,
  p_integrity_token text default null,
  p_idempotency_key text default null,
  p_expires_in_seconds integer default 900
)
returns table (
  session_id uuid,
  session_status text,
  expires_at timestamptz
)
language plpgsql
as $$
declare
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  if p_player_ref is null or btrim(p_player_ref) = '' then
    raise exception 'player_ref is required';
  end if;

  if p_entry_amount < 0 then
    raise exception 'entry_amount must be >= 0';
  end if;

  if p_session_mode not in ('standard', 'freeplay') then
    raise exception 'invalid session_mode';
  end if;

  if not exists (
    select 1
    from public.solo_v2_games g
    where g.game_key = p_game_key
      and g.is_enabled = true
  ) then
    raise exception 'game is not enabled';
  end if;

  if p_idempotency_key is not null then
    select s.id, s.session_status, s.expires_at
      into v_session_id, session_status, v_expires_at
    from public.solo_v2_sessions s
    where s.idempotency_key = p_idempotency_key
    limit 1;

    if v_session_id is not null then
      session_id := v_session_id;
      expires_at := v_expires_at;
      return next;
      return;
    end if;
  end if;

  v_expires_at := now() + make_interval(secs => greatest(p_expires_in_seconds, 30));

  insert into public.solo_v2_sessions (
    game_key,
    player_ref,
    session_status,
    session_mode,
    entry_amount,
    reward_amount,
    net_amount,
    client_nonce,
    integrity_token,
    idempotency_key,
    expires_at,
    server_outcome_summary
  )
  values (
    p_game_key,
    p_player_ref,
    'created',
    p_session_mode,
    p_entry_amount,
    0,
    -p_entry_amount,
    p_client_nonce,
    p_integrity_token,
    p_idempotency_key,
    v_expires_at,
    jsonb_build_object('phase', 'foundation')
  )
  returning id into v_session_id;

  insert into public.solo_v2_session_events (session_id, event_type, event_payload)
  values (
    v_session_id,
    'session_created',
    jsonb_build_object(
      'session_mode', p_session_mode,
      'entry_amount', p_entry_amount
    )
  );

  session_id := v_session_id;
  session_status := 'created';
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.solo_v2_get_session(
  p_session_id uuid,
  p_player_ref text default null
)
returns table (
  id uuid,
  game_key text,
  player_ref text,
  session_status text,
  session_mode text,
  entry_amount bigint,
  reward_amount bigint,
  net_amount bigint,
  server_outcome_summary jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  resolved_at timestamptz
)
language sql
as $$
  select
    s.id,
    s.game_key,
    s.player_ref,
    s.session_status,
    s.session_mode,
    s.entry_amount,
    s.reward_amount,
    s.net_amount,
    s.server_outcome_summary,
    s.created_at,
    s.updated_at,
    s.expires_at,
    s.resolved_at
  from public.solo_v2_sessions s
  where s.id = p_session_id
    and (p_player_ref is null or s.player_ref = p_player_ref)
  limit 1;
$$;

create or replace function public.solo_v2_append_session_event(
  p_session_id uuid,
  p_player_ref text,
  p_event_type text,
  p_event_payload jsonb default '{}'::jsonb
)
returns table (
  event_id bigint,
  session_status text
)
language plpgsql
as $$
declare
  v_status text;
  v_expires_at timestamptz;
  v_owner text;
begin
  if p_event_type is null or btrim(p_event_type) = '' then
    raise exception 'event_type is required';
  end if;

  if p_player_ref is null or btrim(p_player_ref) = '' then
    raise exception 'player_ref is required';
  end if;

  select s.session_status, s.expires_at, s.player_ref
    into v_status, v_expires_at, v_owner
  from public.solo_v2_sessions s
  where s.id = p_session_id
  for update;

  if v_status is null then
    raise exception 'session not found';
  end if;

  if v_status in ('resolved', 'cancelled', 'expired') then
    raise exception 'session is not writable';
  end if;

  if v_owner <> p_player_ref then
    raise exception 'session ownership mismatch';
  end if;

  if v_expires_at is not null and now() > v_expires_at then
    update public.solo_v2_sessions
    set session_status = 'expired'
    where id = p_session_id;
    raise exception 'session expired';
  end if;

  if v_status = 'created' then
    update public.solo_v2_sessions
    set session_status = 'in_progress'
    where id = p_session_id;
    v_status := 'in_progress';
  end if;

  insert into public.solo_v2_session_events (session_id, event_type, event_payload)
  values (p_session_id, p_event_type, coalesce(p_event_payload, '{}'::jsonb))
  returning id into event_id;

  session_status := v_status;
  return next;
end;
$$;
