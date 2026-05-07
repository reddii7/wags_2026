-- Normalize weekly round numbers by season timeline and keep admin round creation deterministic.

create or replace function wags.fn_normalize_weekly_round_numbers(
  p_season_id uuid default null,
  p_competition_type wags.competition_type default null
)
returns integer
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  v_updated integer := 0;
begin
  with ranked as (
    select
      r.id,
      row_number() over (
        partition by r.season_id, c.competition_type
        order by
          coalesce(r.round_date, c.starts_on) asc,
          c.starts_on asc nulls last,
          c.created_at asc,
          r.created_at asc,
          r.id asc
      )::integer as normalized_round_no
    from wags.rounds r
    join wags.competitions c on c.id = r.competition_id
    where c.competition_type in ('main_weekly'::wags.competition_type, 'winter_weekly'::wags.competition_type)
      and (p_season_id is null or r.season_id = p_season_id)
      and (p_competition_type is null or c.competition_type = p_competition_type)
  )
  update wags.rounds r
  set round_no = ranked.normalized_round_no
  from ranked
  where ranked.id = r.id
    and r.round_no is distinct from ranked.normalized_round_no;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- Backfill existing weekly rounds immediately.
do $$
begin
  perform wags.fn_normalize_weekly_round_numbers(null, 'main_weekly'::wags.competition_type);
  perform wags.fn_normalize_weekly_round_numbers(null, 'winter_weekly'::wags.competition_type);
end;
$$;

-- Ensure future weekly rounds get canonical season round numbers.
create or replace function public.admin_create_round(
  p_competition_id uuid,
  p_season_id uuid,
  p_round_no integer,
  p_round_date date
)
returns uuid
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_round_no integer := coalesce(p_round_no, 1);
  v_comp_type wags.competition_type;
  v_existing_rounds integer := 0;
begin
  select c.competition_type
    into v_comp_type
  from wags.competitions c
  where c.id = p_competition_id
    and c.season_id = p_season_id;

  if v_comp_type is null then
    raise exception 'Competition % not found for season %', p_competition_id, p_season_id;
  end if;

  select count(*)::integer
    into v_existing_rounds
  from wags.rounds r
  where r.competition_id = p_competition_id;

  -- Weekly competitions are season-indexed. The first round in each competition
  -- gets a provisional next sequence number, then normalization guarantees correctness.
  if v_comp_type in ('main_weekly'::wags.competition_type, 'winter_weekly'::wags.competition_type)
     and v_existing_rounds = 0 then
    select coalesce(max(r.round_no), 0) + 1
      into v_round_no
    from wags.rounds r
    join wags.competitions c on c.id = r.competition_id
    where r.season_id = p_season_id
      and c.competition_type = v_comp_type;
  end if;

  insert into wags.rounds (id, competition_id, season_id, round_no, round_date)
  values (v_id, p_competition_id, p_season_id, v_round_no, p_round_date);

  if v_comp_type in ('main_weekly'::wags.competition_type, 'winter_weekly'::wags.competition_type) then
    perform wags.fn_normalize_weekly_round_numbers(p_season_id, v_comp_type);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_create_round(uuid, uuid, integer, date) from public;
grant execute on function public.admin_create_round(uuid, uuid, integer, date) to service_role;
