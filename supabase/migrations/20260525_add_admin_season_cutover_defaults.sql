-- Persisted season cutover defaults for admin control plane.

create table if not exists wags.system_settings (
  setting_key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table wags.system_settings is
  'Small key/value settings store for admin runtime defaults.';

create or replace function public.admin_get_app_defaults()
returns table (
  default_results_season_id uuid
)
language sql
stable
security definer
set search_path = wags, public
as $$
  select
    nullif(ss.value_json ->> 'season_id', '')::uuid as default_results_season_id
  from wags.system_settings ss
  where ss.setting_key = 'default_results_season_id'
  union all
  select null::uuid
  where not exists (
    select 1 from wags.system_settings where setting_key = 'default_results_season_id'
  )
  limit 1;
$$;

create or replace function public.admin_set_default_results_season(
  p_season_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = wags, public
as $$
begin
  if p_season_id is null then
    raise exception 'p_season_id is required';
  end if;

  if not exists (select 1 from wags.seasons s where s.id = p_season_id) then
    raise exception 'Season % not found', p_season_id;
  end if;

  insert into wags.system_settings (setting_key, value_json, updated_at)
  values (
    'default_results_season_id',
    jsonb_build_object('season_id', p_season_id::text),
    now()
  )
  on conflict (setting_key)
  do update set
    value_json = excluded.value_json,
    updated_at = now();

  return p_season_id;
end;
$$;

create or replace function public.admin_apply_season_cutover(
  p_active_season_id uuid,
  p_default_results_season_id uuid
)
returns table (
  active_season_id uuid,
  default_results_season_id uuid
)
language plpgsql
security definer
set search_path = wags, public
as $$
begin
  if p_active_season_id is null then
    raise exception 'p_active_season_id is required';
  end if;
  if p_default_results_season_id is null then
    raise exception 'p_default_results_season_id is required';
  end if;

  if not exists (select 1 from wags.seasons s where s.id = p_active_season_id) then
    raise exception 'Active season % not found', p_active_season_id;
  end if;

  if not exists (select 1 from wags.seasons s where s.id = p_default_results_season_id) then
    raise exception 'Default results season % not found', p_default_results_season_id;
  end if;

  update wags.seasons
    set is_active = (id = p_active_season_id),
        updated_at = now();

  perform public.admin_set_default_results_season(p_default_results_season_id);

  return query
  select p_active_season_id, p_default_results_season_id;
end;
$$;

revoke execute on function public.admin_get_app_defaults() from public;
grant execute on function public.admin_get_app_defaults() to service_role;

revoke execute on function public.admin_set_default_results_season(uuid) from public;
grant execute on function public.admin_set_default_results_season(uuid) to service_role;

revoke execute on function public.admin_apply_season_cutover(uuid, uuid) from public;
grant execute on function public.admin_apply_season_cutover(uuid, uuid) to service_role;
