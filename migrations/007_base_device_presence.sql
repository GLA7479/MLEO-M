-- BASE presence tracking (online/idle/offline) via heartbeat + interaction
create table if not exists public.base_device_presence (
  device_id text primary key,
  last_presence_at timestamptz not null default now(),
  last_interaction_at timestamptz,
  visibility_state text not null default 'hidden',
  page_name text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_base_device_presence_last_presence
  on public.base_device_presence (last_presence_at desc);

create index if not exists idx_base_device_presence_last_interaction
  on public.base_device_presence (last_interaction_at desc);

create or replace function public.base_touch_presence(
  p_device_id text,
  p_visibility_state text default 'hidden',
  p_page_name text default 'base',
  p_interacted boolean default false
)
returns public.base_device_presence
language plpgsql
security definer
as $$
declare
  v_row public.base_device_presence;
begin
  insert into public.base_device_presence (
    device_id,
    last_presence_at,
    last_interaction_at,
    visibility_state,
    page_name,
    updated_at
  )
  values (
    p_device_id,
    now(),
    case when p_interacted then now() else null end,
    coalesce(p_visibility_state, 'hidden'),
    coalesce(p_page_name, 'base'),
    now()
  )
  on conflict (device_id) do update
  set
    last_presence_at = now(),
    last_interaction_at = case
      when p_interacted then now()
      else public.base_device_presence.last_interaction_at
    end,
    visibility_state = coalesce(excluded.visibility_state, public.base_device_presence.visibility_state),
    page_name = coalesce(excluded.page_name, public.base_device_presence.page_name),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

