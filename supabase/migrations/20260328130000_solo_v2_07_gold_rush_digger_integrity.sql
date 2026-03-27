-- Solo V2 Gold Rush Digger: one active unresolved session per player

do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select player_ref
    from public.solo_v2_sessions
    where game_key = 'gold_rush_digger'
      and session_status in ('created', 'in_progress')
    group by player_ref
    having count(*) > 1
  ) d;

  if v_dup_count > 0 then
    raise exception 'gold_rush_digger integrity precheck failed: duplicate active unresolved sessions detected (% groups)', v_dup_count;
  end if;
end $$;

create unique index if not exists uq_solo_v2_gold_rush_digger_one_active_per_player
  on public.solo_v2_sessions (player_ref)
  where game_key = 'gold_rush_digger'
    and session_status in ('created', 'in_progress');
