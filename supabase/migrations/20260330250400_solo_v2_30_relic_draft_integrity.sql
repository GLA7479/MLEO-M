-- Solo V2 Relic Draft Run (relic_draft): catalog + one active unresolved session per player

insert into public.solo_v2_games (game_key, route_path, title, is_enabled, sort_order)
values ('relic_draft', '/v2-relic-draft', 'Relic Draft Run', true, 130)
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
    where game_key = 'relic_draft'
      and session_status in ('created', 'in_progress')
      and player_ref is not null
    group by player_ref
    having count(*) > 1
  ) d;

  if v_dup_count > 0 then
    raise exception 'relic_draft integrity precheck failed: duplicate active unresolved sessions detected (% groups)', v_dup_count;
  end if;
end $$;

create unique index if not exists uq_solo_v2_relic_draft_one_active_per_player
  on public.solo_v2_sessions (player_ref)
  where game_key = 'relic_draft'
    and session_status in ('created', 'in_progress')
    and player_ref is not null;
