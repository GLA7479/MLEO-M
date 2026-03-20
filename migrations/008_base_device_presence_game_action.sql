-- Track real gameplay online via last_game_action_at

alter table public.base_device_presence
  add column if not exists last_game_action_at timestamptz;

create or replace function public.base_touch_presence(
  p_device_id text,
  p_visibility_state text default 'hidden',
  p_page_name text default 'base',
  p_interacted boolean default false,
  p_game_action boolean default false
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
    last_game_action_at,
    visibility_state,
    page_name,
    updated_at
  )
  values (
    p_device_id,
    now(),
    case when p_interacted then now() else null end,
    case when p_game_action then now() else null end,
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
    last_game_action_at = case
      when p_game_action then now()
      else public.base_device_presence.last_game_action_at
    end,
    visibility_state = coalesce(excluded.visibility_state, public.base_device_presence.visibility_state),
    page_name = coalesce(excluded.page_name, public.base_device_presence.page_name),
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

