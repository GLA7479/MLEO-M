-- BASE server activity smoke helpers (last 20 minutes)
-- Tables:
--   public.base_action_audit
--   public.base_device_state
--   public.vault_balances
--   public.miners_device_state
--   public.arcade_device_sessions

-- 1) Quick system summary (last 20 minutes)
with recent as (
  select
    'base_action_audit' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(created_at) as first_at,
    max(created_at) as last_at
  from public.base_action_audit
  where created_at >= now() - interval '20 minutes'

  union all

  select
    'base_device_state' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(updated_at) as first_at,
    max(updated_at) as last_at
  from public.base_device_state
  where updated_at >= now() - interval '20 minutes'

  union all

  select
    'vault_balances' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(coalesce(updated_at, last_sync_at, created_at)) as first_at,
    max(coalesce(updated_at, last_sync_at, created_at)) as last_at
  from public.vault_balances
  where coalesce(updated_at, last_sync_at, created_at) >= now() - interval '20 minutes'

  union all

  select
    'miners_device_state' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(updated_at) as first_at,
    max(updated_at) as last_at
  from public.miners_device_state
  where updated_at >= now() - interval '20 minutes'

  union all

  select
    'arcade_device_sessions' as source,
    count(*) as events,
    count(distinct device_id) as devices,
    min(coalesce(updated_at, finished_at, started_at, created_at)) as first_at,
    max(coalesce(updated_at, finished_at, started_at, created_at)) as last_at
  from public.arcade_device_sessions
  where coalesce(updated_at, finished_at, started_at, created_at) >= now() - interval '20 minutes'
)
select *
from recent
order by last_at desc nulls last;

-- 2) Unified feed of what happened now (last 20 minutes)
select *
from (
  select
    created_at as event_time,
    device_id,
    'BASE_ACTION' as source,
    action_type as action,
    action_detail::text as details
  from public.base_action_audit
  where created_at >= now() - interval '20 minutes'

  union all

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
    )::text as details
  from public.base_device_state
  where updated_at >= now() - interval '20 minutes'

  union all

  select
    coalesce(updated_at, last_sync_at, created_at) as event_time,
    device_id,
    'VAULT' as source,
    'vault_update' as action,
    jsonb_build_object(
      'balance', balance,
      'last_nonce', last_nonce
    )::text as details
  from public.vault_balances
  where coalesce(updated_at, last_sync_at, created_at) >= now() - interval '20 minutes'

  union all

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
    )::text as details
  from public.miners_device_state
  where updated_at >= now() - interval '20 minutes'

  union all

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
    )::text as details
  from public.arcade_device_sessions
  where coalesce(updated_at, finished_at, started_at, created_at) >= now() - interval '20 minutes'
) t
order by event_time desc
limit 300;

-- 3) Per-user (device) BASE activity
select
  created_at,
  device_id,
  action_type,
  action_detail,
  suspicion_score,
  suspicion_flags
from public.base_action_audit
where created_at >= now() - interval '20 minutes'
order by created_at desc, device_id;

-- 4) Summary per device for BASE
select
  device_id,
  count(*) as total_actions,
  min(created_at) as first_action,
  max(created_at) as last_action,
  count(*) filter (where action_type = 'build') as builds,
  count(*) filter (where action_type = 'maintenance') as maintenance_count,
  count(*) filter (where action_type = 'ship') as ships,
  count(*) filter (where action_type = 'expedition') as expeditions,
  max(suspicion_score) as max_suspicion_score
from public.base_action_audit
where created_at >= now() - interval '20 minutes'
group by device_id
order by last_action desc;

-- 5) BASE gameplay online now (real)
with presence_now as (
  select
    device_id,
    last_presence_at,
    last_interaction_at,
    last_game_action_at,
    visibility_state,
    case
      when last_presence_at < now() - interval '75 seconds' then 'offline'
      when visibility_state <> 'visible' then 'idle'
      when last_game_action_at is not null and last_game_action_at >= now() - interval '5 minutes' then 'online_real'
      else 'not_online'
    end as gameplay_online_status
  from public.base_device_presence
)
select *
from presence_now
where gameplay_online_status = 'online_real'
order by last_presence_at desc, device_id;

-- 6) Suspicious/abnormal BASE actions (if supported by your schema)
select
  created_at,
  device_id,
  action_type,
  suspicion_score,
  suspicion_flags,
  action_detail
from public.base_action_audit
where created_at >= now() - interval '20 minutes'
  and (
    suspicion_score > 0
    or coalesce(jsonb_array_length(suspicion_flags), 0) > 0
  )
order by suspicion_score desc, created_at desc;

-- 7) Quick heartbeat (super fast pulse check)
select
  now() as checked_at,
  (select count(*) from public.base_action_audit where created_at >= now() - interval '20 minutes') as base_actions_20m,
  (select count(*) from public.base_device_state where updated_at >= now() - interval '20 minutes') as base_active_devices_20m,
  (select count(*) from public.vault_balances where coalesce(updated_at, last_sync_at, created_at) >= now() - interval '20 minutes') as vault_updates_20m,
  (select count(*) from public.miners_device_state where updated_at >= now() - interval '20 minutes') as miners_active_devices_20m,
  (select count(*) from public.arcade_device_sessions where coalesce(updated_at, finished_at, started_at, created_at) >= now() - interval '20 minutes') as arcade_events_20m;

