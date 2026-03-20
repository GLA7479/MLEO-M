with params as (
  select
    now() as checked_at,
    now() - interval '30 minutes' as since_at
),

source_activity as (
  select
    'base_action_audit' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(created_at) as first_at,
    max(created_at) as last_at
  from public.base_action_audit, params
  where created_at >= params.since_at

  union all

  select
    'base_device_state' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(updated_at) as first_at,
    max(updated_at) as last_at
  from public.base_device_state, params
  where updated_at >= params.since_at

  union all

  select
    'vault_balances' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(coalesce(updated_at, last_sync_at, created_at)) as first_at,
    max(coalesce(updated_at, last_sync_at, created_at)) as last_at
  from public.vault_balances, params
  where coalesce(updated_at, last_sync_at, created_at) >= params.since_at

  union all

  select
    'miners_device_state' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(updated_at) as first_at,
    max(updated_at) as last_at
  from public.miners_device_state, params
  where updated_at >= params.since_at

  union all

  select
    'arcade_device_sessions' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(coalesce(updated_at, finished_at, started_at, created_at)) as first_at,
    max(coalesce(updated_at, finished_at, started_at, created_at)) as last_at
  from public.arcade_device_sessions, params
  where coalesce(updated_at, finished_at, started_at, created_at) >= params.since_at
),

base_action_breakdown as (
  select
    action_type,
    count(*) as events,
    count(distinct device_id) as devices,
    min(created_at) as first_at,
    max(created_at) as last_at
  from public.base_action_audit, params
  where created_at >= params.since_at
  group by action_type
),

active_devices as (
  select
    device_id,
    max(last_seen) as last_seen,
    string_agg(source, ', ' order by source) as active_in
  from (
    select device_id, updated_at as last_seen, 'BASE' as source
    from public.base_device_state, params
    where updated_at >= params.since_at

    union all

    select device_id, coalesce(updated_at, last_sync_at, created_at) as last_seen, 'VAULT' as source
    from public.vault_balances, params
    where coalesce(updated_at, last_sync_at, created_at) >= params.since_at

    union all

    select device_id, updated_at as last_seen, 'MINERS' as source
    from public.miners_device_state, params
    where updated_at >= params.since_at

    union all

    select device_id, coalesce(updated_at, finished_at, started_at, created_at) as last_seen, 'ARCADE' as source
    from public.arcade_device_sessions, params
    where coalesce(updated_at, finished_at, started_at, created_at) >= params.since_at
  ) t
  group by device_id
),

latest_base_state as (
  select distinct on (device_id)
    device_id,
    updated_at,
    stability,
    banked_mleo,
    resources,
    stats
  from public.base_device_state, params
  where updated_at >= params.since_at
  order by device_id, updated_at desc
),

presence_now as (
  select
    device_id,
    last_presence_at,
    last_interaction_at,
    last_game_action_at,
    visibility_state,
    case
      when last_presence_at < now() - interval '75 seconds' then 'offline'
      when visibility_state <> 'visible' then 'idle'
      when coalesce(last_interaction_at, to_timestamp(0)) < now() - interval '5 minutes' then 'idle'
      else 'active'
    end as presence_status,
    case
      when last_presence_at < now() - interval '75 seconds' then 'not_online'
      when visibility_state <> 'visible' then 'not_online'
      when last_game_action_at >= now() - interval '5 minutes' then 'online_real'
      else 'not_online'
    end as gameplay_online_status
  from public.base_device_presence
),

online_real_now as (
  select *
  from presence_now
  where gameplay_online_status = 'online_real'
),

not_online_now as (
  select *
  from presence_now
  where gameplay_online_status <> 'online_real'
),

suspicious_events as (
  select
    created_at,
    device_id,
    action_type,
    suspicion_score,
    suspicion_flags,
    action_detail
  from public.base_action_audit, params
  where created_at >= params.since_at
    and (
      suspicion_score > 0
      or coalesce(jsonb_array_length(suspicion_flags), 0) > 0
    )
  order by created_at desc
  limit 50
)

select
  p.checked_at,
  p.since_at,
  30 as window_minutes,

  (
    select jsonb_agg(
      jsonb_build_object(
        'source', s.source,
        'events', s.events,
        'devices', s.devices,
        'first_at', s.first_at,
        'last_at', s.last_at
      )
      order by s.last_at desc nulls last, s.source
    )
    from source_activity s
  ) as source_activity,

  (
    select jsonb_agg(
      jsonb_build_object(
        'action_type', b.action_type,
        'events', b.events,
        'devices', b.devices,
        'first_at', b.first_at,
        'last_at', b.last_at
      )
      order by b.events desc, b.action_type
    )
    from base_action_breakdown b
  ) as base_action_breakdown,

  (
    select jsonb_agg(
      jsonb_build_object(
        'device_id', a.device_id,
        'last_seen', a.last_seen,
        'active_in', a.active_in
      )
      order by a.last_seen desc, a.device_id
    )
    from active_devices a
  ) as active_devices,

  (
    select jsonb_agg(
      jsonb_build_object(
        'device_id', l.device_id,
        'updated_at', l.updated_at,
        'stability', l.stability,
        'banked_mleo', l.banked_mleo,
        'resources', l.resources,
        'stats', l.stats
      )
      order by l.updated_at desc, l.device_id
    )
    from latest_base_state l
  ) as latest_base_state,

  (
    select jsonb_agg(
      jsonb_build_object(
        'device_id', pn.device_id,
        'last_presence_at', pn.last_presence_at,
        'last_interaction_at', pn.last_interaction_at,
        'last_game_action_at', pn.last_game_action_at,
        'visibility_state', pn.visibility_state,
        'presence_status', pn.presence_status,
        'gameplay_online_status', pn.gameplay_online_status
      )
      order by pn.last_presence_at desc, pn.device_id
    )
    from presence_now pn
  ) as presence_now,

  (
    select jsonb_agg(
      jsonb_build_object(
        'device_id', onr.device_id,
        'last_presence_at', onr.last_presence_at,
        'last_interaction_at', onr.last_interaction_at,
        'last_game_action_at', onr.last_game_action_at,
        'visibility_state', onr.visibility_state,
        'presence_status', onr.presence_status,
        'gameplay_online_status', onr.gameplay_online_status
      )
      order by onr.last_presence_at desc, onr.device_id
    )
    from online_real_now onr
  ) as online_real_now,

  (
    select jsonb_agg(
      jsonb_build_object(
        'device_id', non.device_id,
        'last_presence_at', non.last_presence_at,
        'last_interaction_at', non.last_interaction_at,
        'last_game_action_at', non.last_game_action_at,
        'visibility_state', non.visibility_state,
        'presence_status', non.presence_status,
        'gameplay_online_status', non.gameplay_online_status
      )
      order by non.last_presence_at desc, non.device_id
    )
    from not_online_now non
  ) as not_online_now,

  (
    select jsonb_agg(
      jsonb_build_object(
        'created_at', se.created_at,
        'device_id', se.device_id,
        'action_type', se.action_type,
        'suspicion_score', se.suspicion_score,
        'suspicion_flags', se.suspicion_flags,
        'action_detail', se.action_detail
      )
      order by se.created_at desc
    )
    from suspicious_events se
  ) as suspicious_events

from params p;

