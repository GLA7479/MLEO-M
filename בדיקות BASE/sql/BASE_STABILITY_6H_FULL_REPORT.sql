with params as (
  select
    now() as checked_at,
    interval '6 hours' as lookback_window,
    interval '10 minutes' as online_window,
    60::numeric as low_stability_threshold
),

state_events as (
  select
    bds.device_id,
    bds.updated_at as event_time,
    bds.stability,
    bds.banked_mleo,
    bds.resources,
    bds.stats
  from public.base_device_state bds, params p
  where bds.updated_at >= p.checked_at - p.lookback_window
),

action_events as (
  select
    baa.device_id,
    baa.created_at as event_time,
    baa.action_type,
    baa.action_detail,
    baa.suspicion_score,
    baa.suspicion_flags
  from public.base_action_audit baa, params p
  where baa.created_at >= p.checked_at - p.lookback_window
),

seen_devices as (
  select device_id from state_events
  union
  select device_id from action_events
),

last_seen_per_device as (
  select
    x.device_id,
    max(x.event_time) as last_seen
  from (
    select device_id, event_time from state_events
    union all
    select device_id, event_time from action_events
  ) x
  group by x.device_id
),

latest_state_per_device as (
  select distinct on (se.device_id)
    se.device_id,
    se.event_time as updated_at,
    se.stability,
    se.banked_mleo,
    se.resources,
    se.stats
  from state_events se
  order by se.device_id, se.event_time desc
),

online_now as (
  select
    l.device_id,
    l.last_seen
  from last_seen_per_device l, params p
  where l.last_seen >= p.checked_at - p.online_window
),

offline_candidates as (
  select
    l.device_id,
    l.last_seen,
    round(extract(epoch from ((select checked_at from params) - l.last_seen)) / 60.0, 1) as minutes_since_seen
  from last_seen_per_device l, params p
  where l.last_seen < p.checked_at - p.online_window
),

low_stability_devices as (
  select
    ls.device_id,
    ls.updated_at,
    ls.stability,
    ls.banked_mleo,
    coalesce((ls.resources ->> 'ENERGY')::numeric, 0) as energy,
    coalesce((ls.stats ->> 'maintenanceToday')::numeric, 0) as maintenance_today,
    coalesce((ls.stats ->> 'expeditionsToday')::numeric, 0) as expeditions_today,
    coalesce((ls.stats ->> 'upgradesToday')::numeric, 0) as upgrades_today
  from latest_state_per_device ls, params p
  where ls.stability < p.low_stability_threshold
),

action_breakdown as (
  select
    ae.action_type,
    count(*) as events,
    count(distinct ae.device_id) as devices,
    min(ae.event_time) as first_at,
    max(ae.event_time) as last_at
  from action_events ae
  group by ae.action_type
),

per_device_actions as (
  select
    ae.device_id,
    count(*) as total_actions,
    count(*) filter (where ae.action_type = 'build') as builds,
    count(*) filter (where ae.action_type = 'maintenance') as maintenance_count,
    count(*) filter (where ae.action_type = 'expedition') as expeditions,
    count(*) filter (where ae.action_type = 'ship') as ships,
    count(*) filter (where ae.action_type = 'contract_claim') as contract_claims,
    count(*) filter (where ae.action_type = 'mission_claim') as mission_claims,
    max(ae.suspicion_score) as max_suspicion_score,
    min(ae.event_time) as first_action,
    max(ae.event_time) as last_action
  from action_events ae
  group by ae.device_id
),

stability_related_timeline as (
  select *
  from (
    select
      se.event_time,
      se.device_id,
      'BASE_STATE' as source,
      'state_update' as action,
      jsonb_build_object(
        'stability', se.stability,
        'banked_mleo', se.banked_mleo,
        'energy', se.resources ->> 'ENERGY',
        'maintenanceToday', se.stats ->> 'maintenanceToday',
        'expeditionsToday', se.stats ->> 'expeditionsToday',
        'upgradesToday', se.stats ->> 'upgradesToday'
      ) as details
    from state_events se

    union all

    select
      ae.event_time,
      ae.device_id,
      'BASE_ACTION' as source,
      ae.action_type as action,
      ae.action_detail as details
    from action_events ae
    where
      ae.action_type in ('maintenance', 'expedition', 'build', 'ship')
      or ae.action_detail::text ilike '%stability%'
      or ae.action_detail::text ilike '%safe%'
      or ae.action_detail::text ilike '%repair%'
      or ae.action_detail::text ilike '%maintain%'
  ) t
  order by t.event_time desc
  limit 200
),

summary as (
  select
    (select count(*) from seen_devices) as devices_seen_in_6h,
    (select count(*) from online_now) as devices_online_now_estimated,
    (select count(*) from offline_candidates) as devices_offline_now_estimated,
    (select count(*) from state_events) as base_state_updates_6h,
    (select count(*) from action_events) as base_actions_6h,
    (select count(*) from low_stability_devices) as devices_below_stability_threshold,
    (select min(stability) from latest_state_per_device) as min_current_stability,
    (select round(avg(stability)::numeric, 2) from latest_state_per_device) as avg_current_stability,
    (select count(*) from action_events where action_type = 'maintenance') as maintenance_actions_6h
)

select jsonb_pretty(
  jsonb_build_object(
    'window', jsonb_build_object(
      'checked_at', (select checked_at from params),
      'lookback_hours', 6,
      'online_window_minutes', 10,
      'low_stability_threshold', (select low_stability_threshold from params)
    ),

    'summary', (
      select to_jsonb(s) from summary s
    ),

    'devices_online_now_estimated', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', o.device_id,
            'last_seen', o.last_seen
          )
          order by o.last_seen desc
        ),
        '[]'::jsonb
      )
      from online_now o
    ),

    'devices_offline_now_estimated', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', oc.device_id,
            'last_seen', oc.last_seen,
            'minutes_since_seen', oc.minutes_since_seen
          )
          order by oc.last_seen asc
        ),
        '[]'::jsonb
      )
      from offline_candidates oc
    ),

    'low_stability_devices', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', lsd.device_id,
            'updated_at', lsd.updated_at,
            'stability', lsd.stability,
            'banked_mleo', lsd.banked_mleo,
            'energy', lsd.energy,
            'maintenance_today', lsd.maintenance_today,
            'expeditions_today', lsd.expeditions_today,
            'upgrades_today', lsd.upgrades_today
          )
          order by lsd.stability asc, lsd.updated_at desc
        ),
        '[]'::jsonb
      )
      from low_stability_devices lsd
    ),

    'latest_state_per_device', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', ls.device_id,
            'updated_at', ls.updated_at,
            'stability', ls.stability,
            'banked_mleo', ls.banked_mleo,
            'resources', ls.resources,
            'stats', ls.stats
          )
          order by ls.updated_at desc
        ),
        '[]'::jsonb
      )
      from latest_state_per_device ls
    ),

    'action_breakdown', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'action_type', ab.action_type,
            'events', ab.events,
            'devices', ab.devices,
            'first_at', ab.first_at,
            'last_at', ab.last_at
          )
          order by ab.events desc, ab.action_type
        ),
        '[]'::jsonb
      )
      from action_breakdown ab
    ),

    'per_device_actions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_id', pda.device_id,
            'total_actions', pda.total_actions,
            'builds', pda.builds,
            'maintenance_count', pda.maintenance_count,
            'expeditions', pda.expeditions,
            'ships', pda.ships,
            'contract_claims', pda.contract_claims,
            'mission_claims', pda.mission_claims,
            'max_suspicion_score', pda.max_suspicion_score,
            'first_action', pda.first_action,
            'last_action', pda.last_action
          )
          order by pda.last_action desc
        ),
        '[]'::jsonb
      )
      from per_device_actions pda
    ),

    'stability_related_timeline', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'event_time', srt.event_time,
            'device_id', srt.device_id,
            'source', srt.source,
            'action', srt.action,
            'details', srt.details
          )
          order by srt.event_time desc
        ),
        '[]'::jsonb
      )
      from stability_related_timeline srt
    )
  )
) as base_stability_6h_full_report;

