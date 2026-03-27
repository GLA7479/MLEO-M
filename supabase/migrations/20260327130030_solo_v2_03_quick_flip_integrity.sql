-- Solo V2 Quick Flip integrity hardening
-- Source: styles/sql/solo_v2/03_solo_v2_quick_flip_integrity.sql

do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select player_ref
    from public.solo_v2_sessions
    where game_key = 'quick_flip'
      and session_status in ('created', 'in_progress')
    group by player_ref
    having count(*) > 1
  ) d;

  if v_dup_count > 0 then
    raise exception 'quick_flip integrity precheck failed: duplicate active unresolved sessions detected (% groups)', v_dup_count;
  end if;
end $$;

-- REQUIRED
create unique index if not exists uq_solo_v2_quick_flip_one_active_per_player
  on public.solo_v2_sessions (player_ref)
  where game_key = 'quick_flip'
    and session_status in ('created', 'in_progress');

-- OPTIONAL (recommended)
create index if not exists idx_solo_v2_events_quick_flip_choice_submit_latest
  on public.solo_v2_session_events (session_id, id desc)
  where event_type = 'client_action'
    and event_payload @> '{"action":"choice_submit"}'::jsonb;
