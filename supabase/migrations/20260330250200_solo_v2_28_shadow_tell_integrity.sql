-- Solo V2 Shadow Tell (shadow_tell): catalog + one active unresolved session per player

insert into public.solo_v2_games (game_key, route_path, title, is_enabled, sort_order)
values ('shadow_tell', '/v2-shadow-tell', 'Shadow Tell', true, 128)
on conflict (game_key) do update set
  route_path = excluded.route_path,
  title = excluded.title,
  is_enabled = true;

do $$
declare
  v_dup_count integer;
begin
  select count(*) into v_dup_count
  from (
    select player_ref
    from public.solo_v2_sessions
    where game_key = 'shadow_tell'
      and session_status in ('created', 'in_progress')
      and player_ref is not null
    group by player_ref
    having count(*) > 1
  ) d;

  if v_dup_count > 0 then
    raise exception 'shadow_tell integrity precheck failed: duplicate active unresolved sessions detected (% groups)', v_dup_count;
  end if;
end $$;

create unique index if not exists uq_solo_v2_shadow_tell_one_active_per_player
  on public.solo_v2_sessions (player_ref)
  where game_key = 'shadow_tell'
    and session_status in ('created', 'in_progress')
    and player_ref is not null;
