with params as (
  select
    now() as checked_at_utc,
    now() at time zone 'Asia/Jerusalem' as checked_at_israel,
    now() - interval '30 minutes' as since_at_utc
),

source_activity as (
  select
    'base_action_audit' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(created_at) as first_at,
    max(created_at) as last_at
  from public.base_action_audit, params
  where created_at >= params.since_at_utc

  union all

  select
    'base_device_state' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(updated_at) as first_at,
    max(updated_at) as last_at
  from public.base_device_state, params
  where updated_at >= params.since_at_utc

  union all

  select
    'vault_balances' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(coalesce(updated_at, last_sync_at, created_at)) as first_at,
    max(coalesce(updated_at, last_sync_at, created_at)) as last_at
  from public.vault_balances, params
  where coalesce(updated_at, last_sync_at, created_at) >= params.since_at_utc

  union all

  select
    'miners_device_state' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(updated_at) as first_at,
    max(updated_at) as last_at
  from public.miners_device_state, params
  where updated_at >= params.since_at_utc

  union all

  select
    'arcade_device_sessions' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(coalesce(updated_at, finished_at, started_at, created_at)) as first_at,
    max(coalesce(updated_at, finished_at, started_at, created_at)) as last_at
  from public.arcade_device_sessions, params
  where coalesce(updated_at, finished_at, started_at, created_at) >= params.since_at_utc
),

base_action_breakdown as (
  select
    action_type,
    count(*) as events,
    count(distinct device_id) as devices,
    min(created_at) as first_at,
    max(created_at) as last_at
  from public.base_action_audit, params
  where created_at >= params.since_at_utc
  group by action_type
),

base_by_device as (
  select
    device_id,
    count(*) as total_actions,
    count(*) filter (where action_type = 'build') as builds,
    count(*) filter (where action_type = 'expedition') as expeditions,
    count(*) filter (where action_type = 'ship') as ships,
    count(*) filter (where action_type = 'maintenance') as maintenance_count,
    count(*) filter (where action_type = 'contract_claim') as contract_claims,
    count(*) filter (where action_type = 'mission_claim') as mission_claims,
    max(suspicion_score) as max_suspicion_score,
    min(created_at) as first_action,
    max(created_at) as last_action
  from public.base_action_audit, params
  where created_at >= params.since_at_utc
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
  where updated_at >= params.since_at_utc
  order by device_id, updated_at desc
),

active_devices as (
  select
    device_id,
    max(last_seen) as last_seen,
    string_agg(source, ', ' order by source) as active_in
  from (
    select device_id, updated_at as last_seen, 'BASE' as source
    from public.base_device_state, params
    where updated_at >= params.since_at_utc

    union all

    select device_id, coalesce(updated_at, last_sync_at, created_at) as last_seen, 'VAULT' as source
    from public.vault_balances, params
    where coalesce(updated_at, last_sync_at, created_at) >= params.since_at_utc

    union all

    select device_id, updated_at as last_seen, 'MINERS' as source
    from public.miners_device_state, params
    where updated_at >= params.since_at_utc

    union all

    select device_id, coalesce(updated_at, finished_at, started_at, created_at) as last_seen, 'ARCADE' as source
    from public.arcade_device_sessions, params
    where coalesce(updated_at, finished_at, started_at, created_at) >= params.since_at_utc
  ) t
  group by device_id
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
  where created_at >= params.since_at_utc
    and (
      suspicion_score > 0
      or coalesce(jsonb_array_length(suspicion_flags), 0) > 0
    )
  order by created_at desc
  limit 100
),

base_action_timeline as (
  select
    created_at as event_time,
    device_id,
    'BASE_ACTION' as source,
    action_type as action,
    action_detail
  from public.base_action_audit, params
  where created_at >= params.since_at_utc
),

base_state_timeline as (
  select
    updated_at as event_time,
    device_id,
    'BASE_STATE' as source,
    'state_update' as action,
    jsonb_build_object(
      'stability', stability,
      'banked_mleo', banked_mleo,
      'resources', resources,
      'stats', stats
    ) as action_detail
  from public.base_device_state, params
  where updated_at >= params.since_at_utc
),

vault_timeline as (
  select
    coalesce(updated_at, last_sync_at, created_at) as event_time,
    device_id,
    'VAULT' as source,
    'vault_update' as action,
    jsonb_build_object(
      'balance', balance,
      'last_nonce', last_nonce
    ) as action_detail
  from public.vault_balances, params
  where coalesce(updated_at, last_sync_at, created_at) >= params.since_at_utc
),

miners_timeline as (
  select
    updated_at as event_time,
    device_id,
    'MINERS' as source,
    'miners_state_update' as action,
    jsonb_build_object(
      'balance', balance,
      'vault', vault,
      'mined_today', mined_today,
      'score_today', score_today
    ) as action_detail
  from public.miners_device_state, params
  where updated_at >= params.since_at_utc
),

arcade_timeline as (
  select
    coalesce(updated_at, finished_at, started_at, created_at) as event_time,
    device_id,
    'ARCADE' as source,
    coalesce(game_id, 'unknown_game') as action,
    jsonb_build_object(
      'mode', mode,
      'status', status,
      'stake', stake,
      'approved_reward', approved_reward
    ) as action_detail
  from public.arcade_device_sessions, params
  where coalesce(updated_at, finished_at, started_at, created_at) >= params.since_at_utc
),

full_timeline as (
  select * from base_action_timeline
  union all
  select * from base_state_timeline
  union all
  select * from vault_timeline
  union all
  select * from miners_timeline
  union all
  select * from arcade_timeline
),

health_summary as (
  select
    (select count(*) from public.base_action_audit, params where created_at >= params.since_at_utc) as base_actions_30m,
    (select count(distinct device_id) from public.base_action_audit, params where created_at >= params.since_at_utc) as base_action_devices_30m,
    (select count(*) from public.base_device_state, params where updated_at >= params.since_at_utc) as base_state_updates_30m,
    (select count(distinct device_id) from public.base_device_state, params where updated_at >= params.since_at_utc) as base_state_devices_30m,
    (select count(*) from public.vault_balances, params where coalesce(updated_at, last_sync_at, created_at) >= params.since_at_utc) as vault_updates_30m,
    (select count(*) from public.miners_device_state, params where updated_at >= params.since_at_utc) as miners_updates_30m,
    (select count(*) from public.arcade_device_sessions, params where coalesce(updated_at, finished_at, started_at, created_at) >= params.since_at_utc) as arcade_updates_30m,
    (select count(*) from suspicious_events) as suspicious_events_30m
),

health_flags as (
  select jsonb_build_array(
    case when (select base_actions_30m from health_summary) = 0 then 'NO_BASE_ACTIONS_30M' else null end,
    case when (select base_state_updates_30m from health_summary) = 0 then 'NO_BASE_STATE_UPDATES_30M' else null end,
    case when (select suspicious_events_30m from health_summary) > 0 then 'SUSPICIOUS_EVENTS_PRESENT' else null end,
    case when (select vault_updates_30m from health_summary) = 0 then 'NO_VAULT_ACTIVITY_30M' else null end,
    case when (select miners_updates_30m from health_summary) = 0 then 'NO_MINERS_ACTIVITY_30M' else null end,
    case when (select arcade_updates_30m from health_summary) = 0 then 'NO_ARCADE_ACTIVITY_30M' else null end
  ) as raw_flags
)

select jsonb_pretty(
  jsonb_build_object(
    'window', jsonb_build_object(
      'checked_at_utc', p.checked_at_utc,
      'checked_at_israel', p.checked_at_israel,
      'since_at_utc', p.since_at_utc,
      'window_minutes', 30
    ),

    'health_summary', (
      select to_jsonb(hs) from health_summary hs
    ),

    'health_flags', (
      select coalesce(
        jsonb_agg(flag) filter (where flag is not null),
        '[]'::jsonb
      )
      from health_flags hf,
      lateral jsonb_array_elements_text(hf.raw_flags) as flag
    ),

    'source_activity', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'source', s.source,
            'events', s.events,
            'devices', s.devices,
            'first_at', s.first_at,
            'last_at', s.last_at
          )
          order by s.last_at desc nulls last, s.source
        ),
        '[]'::jsonb
      )
      from source_activity s
    ),

    'base_action_breakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'action_type', b.action_type,
            'events', b.events,
            'devices', b.devices,
            'first_at', b.first_at,
            'last_at', b.last_at
          )
          order by b.events desc, b.action_type
        ),
        '[]'::jsonb
      )
      from base_action_breakdown b
    ),

    'base_by_device', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', d.device_id,
            'total_actions', d.total_actions,
            'builds', d.builds,
            'expeditions', d.expeditions,
            'ships', d.ships,
            'maintenance_count', d.maintenance_count,
            'contract_claims', d.contract_claims,
            'mission_claims', d.mission_claims,
            'max_suspicion_score', d.max_suspicion_score,
            'first_action', d.first_action,
            'last_action', d.last_action
          )
          order by d.last_action desc, d.device_id
        ),
        '[]'::jsonb
      )
      from base_by_device d
    ),

    'active_devices', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', a.device_id,
            'last_seen', a.last_seen,
            'active_in', a.active_in
          )
          order by a.last_seen desc, a.device_id
        ),
        '[]'::jsonb
      )
      from active_devices a
    ),

    'latest_base_state', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', l.device_id,
            'updated_at', l.updated_at,
            'stability', l.stability,
            'banked_mleo', l.banked_mleo,
            'resources', l.resources,
            'stats', l.stats
          )
          order by l.updated_at desc, l.device_id
        ),
        '[]'::jsonb
      )
      from latest_base_state l
    ),

    'suspicious_events', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'created_at', se.created_at,
            'device_id', se.device_id,
            'action_type', se.action_type,
            'suspicion_score', se.suspicion_score,
            'suspicion_flags', se.suspicion_flags,
            'action_detail', se.action_detail
          )
          order by se.created_at desc
        ),
        '[]'::jsonb
      )
      from suspicious_events se
    ),

    'timeline', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'event_time', t.event_time,
            'device_id', t.device_id,
            'source', t.source,
            'action', t.action,
            'details', t.action_detail
          )
          order by t.event_time desc, t.device_id
        ),
        '[]'::jsonb
      )
      from (
        select *
        from full_timeline
        order by event_time desc
        limit 500
      ) t
    )
  )
) as server_30m_full_report
from params p;

