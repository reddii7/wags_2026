-- Fix admin season upsert to provide required season_mode.

create or replace function public.admin_upsert_season(
  p_id uuid,
  p_label text,
  p_start_year integer,
  p_start_date date,
  p_end_date date,
  p_is_active boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  v_season_mode wags.season_mode;
begin
  if p_id is null then
    p_id := gen_random_uuid();
  end if;

  v_season_mode := case
    when lower(coalesce(p_label, '')) like '%winter%' then 'winter'::wags.season_mode
    else 'main'::wags.season_mode
  end;

  if p_is_active then
    update wags.seasons
      set is_active = false
      where id <> p_id;
  end if;

  -- p_start_year is intentionally ignored because start_year is generated from start_date.
  insert into wags.seasons (id, label, start_date, end_date, season_mode, is_active)
  values (p_id, p_label, p_start_date, p_end_date, v_season_mode, p_is_active)
  on conflict (id)
  do update set
    label = excluded.label,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_active = excluded.is_active,
    updated_at = now();

  return p_id;
end;
$$;

revoke execute on function public.admin_upsert_season(uuid, text, integer, date, date, boolean) from public;
grant execute on function public.admin_upsert_season(uuid, text, integer, date, date, boolean) to service_role;
