-- Harden season lifecycle operations against duplicate year/mode rows.

do $$
begin
  if exists (
    select 1
    from wags.seasons s
    group by s.season_mode, s.start_year
    having count(*) > 1
  ) then
    raise exception 'Cannot add unique season guard: duplicate (season_mode, start_year) rows exist';
  end if;
end
$$;

create unique index if not exists seasons_mode_year_uniq_idx
  on wags.seasons (season_mode, start_year);

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
  v_start_year integer;
  v_existing_id uuid;
begin
  if p_start_date is null then
    raise exception 'p_start_date is required';
  end if;

  v_start_year := extract(year from p_start_date)::integer;
  v_season_mode := case
    when lower(coalesce(p_label, '')) like '%winter%' then 'winter'::wags.season_mode
    else 'main'::wags.season_mode
  end;

  select s.id
    into v_existing_id
  from wags.seasons s
  where s.season_mode = v_season_mode
    and s.start_year = v_start_year
  limit 1;

  if p_id is null then
    p_id := coalesce(v_existing_id, gen_random_uuid());
  elsif v_existing_id is not null and v_existing_id <> p_id then
    raise exception 'Season already exists for mode % and year %', v_season_mode, v_start_year;
  end if;

  if p_is_active then
    update wags.seasons
      set is_active = false,
          updated_at = now()
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
    season_mode = excluded.season_mode,
    is_active = excluded.is_active,
    updated_at = now();

  return p_id;
end;
$$;

revoke execute on function public.admin_upsert_season(uuid, text, integer, date, date, boolean) from public;
grant execute on function public.admin_upsert_season(uuid, text, integer, date, date, boolean) to service_role;