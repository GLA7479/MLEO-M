-- Solo V2 Mystery Box: one active unresolved session per player (mirrors Quick Flip)

do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select player_ref
    from public.solo_v2_sessions
    where game_key = 'mystery_box'
      and session_status in ('created', 'in_progress')
    group by player_ref
    having count(*) > 1
  ) d;

  if v_dup_count > 0 then
    raise exception 'mystery_box integrity precheck failed: duplicate active unresolved sessions detected (% groups)', v_dup_count;
  end if;
end $$;

create unique index if not exists uq_solo_v2_mystery_box_one_active_per_player
  on public.solo_v2_sessions (player_ref)
  where game_key = 'mystery_box'
    and session_status in ('created', 'in_progress');
