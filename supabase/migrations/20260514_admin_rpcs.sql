-- ============================================================
-- Admin Dashboard RPCs
-- All SECURITY DEFINER — callable only by service_role.
-- These expose write access to wags.* tables for the admin UI.
-- ============================================================

-- ── READ FUNCTIONS ──────────────────────────────────────────

create or replace function public.admin_list_players(p_season_id uuid default null)
returns table (
  id uuid,
  full_name text,
  status text,
  starting_handicap numeric,
  current_handicap numeric,
  league_name text
)
language sql stable security definer set search_path = wags, public as $$
  select
    p.id,
    p.full_name,
    p.status,
    p.starting_handicap,
    coalesce(phs.handicap, p.starting_handicap) as current_handicap,
    coalesce(sm.league_name, 'UNASSIGNED') as league_name
  from wags.players p
  left join wags.player_handicap_state phs on phs.player_id = p.id
  left join wags.season_memberships sm
    on sm.player_id = p.id and sm.season_id = p_season_id
  order by p.full_name;
$$;

create or replace function public.admin_list_seasons()
returns table (
  id uuid, label text, start_year integer,
  start_date date, end_date date, is_active boolean
)
language sql stable security definer set search_path = wags, public as $$
  select id, label, start_year, start_date, end_date, is_active
  from wags.seasons order by start_year desc;
$$;

create or replace function public.admin_list_rule_sets()
returns table (
  id uuid, code text, name text,
  entry_fee numeric, bank_share numeric,
  weekly_winner_share numeric, snake_camel_fine numeric,
  stableford_par integer, best_scores_take integer, active boolean
)
language sql stable security definer set search_path = wags, public as $$
  select id, code, name, entry_fee, bank_share, weekly_winner_share,
         snake_camel_fine, stableford_par, best_scores_take, active
  from wags.rule_sets order by active desc, name;
$$;

create or replace function public.admin_list_competitions(p_season_id uuid)
returns table (
  id uuid, season_id uuid, rule_set_id uuid,
  competition_type text, name text, starts_on date, round_count bigint
)
language sql stable security definer set search_path = wags, public as $$
  select c.id, c.season_id, c.rule_set_id,
         c.competition_type::text, c.name, c.starts_on,
         count(r.id) as round_count
  from wags.competitions c
  left join wags.rounds r on r.competition_id = c.id
  where c.season_id = p_season_id
  group by c.id, c.season_id, c.rule_set_id, c.competition_type, c.name, c.starts_on
  order by c.starts_on desc;
$$;

create or replace function public.admin_list_rounds(p_competition_id uuid)
returns table (
  id uuid, round_no integer, round_date date,
  status text, entry_count bigint
)
language sql stable security definer set search_path = wags, public as $$
  select r.id, r.round_no, r.round_date, r.status::text,
         count(re.id) as entry_count
  from wags.rounds r
  left join wags.round_entries re on re.round_id = r.id
  where r.competition_id = p_competition_id
  group by r.id, r.round_no, r.round_date, r.status
  order by r.round_no;
$$;

create or replace function public.admin_get_round_detail(p_round_id uuid)
returns table (
  player_id uuid, full_name text, current_handicap numeric,
  entry_fee_paid numeric, is_eligible boolean,
  stableford_points integer, gross_score integer,
  has_snake boolean, has_camel boolean, score_entered boolean
)
language sql stable security definer set search_path = wags, public as $$
  select
    p.id as player_id,
    p.full_name,
    coalesce(phs.handicap, p.starting_handicap) as current_handicap,
    re.entry_fee_paid,
    re.is_eligible,
    rs.stableford_points,
    rs.gross_score,
    coalesce(rs.has_snake, false) as has_snake,
    coalesce(rs.has_camel, false) as has_camel,
    (rs.id is not null) as score_entered
  from wags.round_entries re
  join wags.players p on p.id = re.player_id
  left join wags.player_handicap_state phs on phs.player_id = p.id
  left join wags.round_scores rs on rs.round_entry_id = re.id
  where re.round_id = p_round_id
  order by p.full_name;
$$;

create or replace function public.admin_get_round_outcome(p_round_id uuid)
returns table (
  winner_type text, winner_names text[],
  winning_score integer, entry_count integer,
  snakes_count integer, camels_count integer,
  payout_amount numeric, bank_allocation numeric
)
language sql stable security definer set search_path = wags, public as $$
  select
    ro.winner_type::text,
    (select array_agg(p.full_name order by p.full_name)
     from wags.players p where p.id = any(ro.winner_player_ids)) as winner_names,
    ro.winning_score,
    ro.entry_count,
    ro.snakes_count,
    ro.camels_count,
    ro.payout_amount,
    ro.bank_allocation
  from wags.round_outcomes ro
  where ro.round_id = p_round_id and ro.is_current = true
  limit 1;
$$;

-- ── WRITE FUNCTIONS ─────────────────────────────────────────

create or replace function public.admin_upsert_player(
  p_id uuid,
  p_full_name text,
  p_starting_handicap numeric
)
returns uuid language plpgsql security definer set search_path = wags, public as $$
begin
  if p_id is null then p_id := gen_random_uuid(); end if;
  insert into wags.players (id, full_name, starting_handicap)
  values (p_id, p_full_name, p_starting_handicap)
  on conflict (id) do update set
    full_name = excluded.full_name,
    starting_handicap = excluded.starting_handicap,
    updated_at = now();
  return p_id;
end;
$$;

create or replace function public.admin_set_membership(
  p_season_id uuid, p_player_id uuid, p_league_name text
)
returns void language plpgsql security definer set search_path = wags, public as $$
begin
  insert into wags.season_memberships (season_id, player_id, league_name)
  values (p_season_id, p_player_id, p_league_name)
  on conflict (season_id, player_id) do update set league_name = excluded.league_name;
end;
$$;

create or replace function public.admin_upsert_season(
  p_id uuid, p_label text, p_start_year integer,
  p_start_date date, p_end_date date, p_is_active boolean default false
)
returns uuid language plpgsql security definer set search_path = wags, public as $$
begin
  if p_id is null then p_id := gen_random_uuid(); end if;
  if p_is_active then
    update wags.seasons set is_active = false where id <> p_id;
  end if;
  insert into wags.seasons (id, label, start_year, start_date, end_date, is_active)
  values (p_id, p_label, p_start_year, p_start_date, p_end_date, p_is_active)
  on conflict (id) do update set
    label = excluded.label, start_year = excluded.start_year,
    start_date = excluded.start_date, end_date = excluded.end_date,
    is_active = excluded.is_active, updated_at = now();
  return p_id;
end;
$$;

create or replace function public.admin_upsert_rule_set(
  p_id uuid, p_code text, p_name text,
  p_entry_fee numeric, p_bank_share numeric,
  p_weekly_winner_share numeric, p_snake_camel_fine numeric,
  p_stableford_par integer default 20, p_best_scores_take integer default 14
)
returns uuid language plpgsql security definer set search_path = wags, public as $$
begin
  if p_id is null then p_id := gen_random_uuid(); end if;
  insert into wags.rule_sets (id, code, name, entry_fee, bank_share,
    weekly_winner_share, snake_camel_fine, stableford_par, best_scores_take)
  values (p_id, p_code, p_name, p_entry_fee, p_bank_share,
    p_weekly_winner_share, p_snake_camel_fine, p_stableford_par, p_best_scores_take)
  on conflict (id) do update set
    code = excluded.code, name = excluded.name,
    entry_fee = excluded.entry_fee, bank_share = excluded.bank_share,
    weekly_winner_share = excluded.weekly_winner_share,
    snake_camel_fine = excluded.snake_camel_fine,
    stableford_par = excluded.stableford_par,
    best_scores_take = excluded.best_scores_take, updated_at = now();
  return p_id;
end;
$$;

create or replace function public.admin_upsert_competition(
  p_id uuid, p_season_id uuid, p_rule_set_id uuid,
  p_competition_type text, p_name text, p_starts_on date
)
returns uuid language plpgsql security definer set search_path = wags, public as $$
begin
  if p_id is null then p_id := gen_random_uuid(); end if;
  insert into wags.competitions (id, season_id, rule_set_id, competition_type, name, starts_on)
  values (p_id, p_season_id, p_rule_set_id, p_competition_type::wags.competition_type, p_name, p_starts_on)
  on conflict (id) do update set
    season_id = excluded.season_id, rule_set_id = excluded.rule_set_id,
    competition_type = excluded.competition_type, name = excluded.name,
    starts_on = excluded.starts_on, updated_at = now();
  return p_id;
end;
$$;

create or replace function public.admin_create_round(
  p_competition_id uuid, p_season_id uuid,
  p_round_no integer, p_round_date date
)
returns uuid language plpgsql security definer set search_path = wags, public as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into wags.rounds (id, competition_id, season_id, round_no, round_date)
  values (v_id, p_competition_id, p_season_id, p_round_no, p_round_date);
  return v_id;
end;
$$;

-- Add or update a player's entry in a round
create or replace function public.admin_set_round_entry(
  p_round_id uuid, p_player_id uuid, p_entry_fee_paid numeric default 0
)
returns uuid language plpgsql security definer set search_path = wags, public as $$
declare v_id uuid;
begin
  insert into wags.round_entries (round_id, player_id, entry_fee_paid)
  values (p_round_id, p_player_id, p_entry_fee_paid)
  on conflict (round_id, player_id) do update set entry_fee_paid = excluded.entry_fee_paid
  returning id into v_id;
  return v_id;
end;
$$;

-- Remove a player from a round (deletes score too)
create or replace function public.admin_remove_round_entry(
  p_round_id uuid, p_player_id uuid
)
returns void language plpgsql security definer set search_path = wags, public as $$
declare v_entry_id uuid;
begin
  select id into v_entry_id from wags.round_entries
  where round_id = p_round_id and player_id = p_player_id;
  if v_entry_id is not null then
    delete from wags.round_scores where round_entry_id = v_entry_id;
    delete from wags.round_entries where id = v_entry_id;
  end if;
end;
$$;

-- Upsert a score for a player in a round
create or replace function public.admin_upsert_score(
  p_round_id uuid, p_player_id uuid,
  p_stableford integer, p_gross integer default null,
  p_snake boolean default false, p_camel boolean default false
)
returns void language plpgsql security definer set search_path = wags, public as $$
declare
  v_entry_id uuid;
begin
  -- Ensure entry exists
  insert into wags.round_entries (round_id, player_id)
  values (p_round_id, p_player_id)
  on conflict (round_id, player_id) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select id into v_entry_id from wags.round_entries
    where round_id = p_round_id and player_id = p_player_id;
  end if;

  -- Upsert score
  insert into wags.round_scores (round_entry_id, stableford_points, gross_score, has_snake, has_camel)
  values (v_entry_id, p_stableford, p_gross, p_snake, p_camel)
  on conflict (round_entry_id) do update set
    stableford_points = excluded.stableford_points,
    gross_score = excluded.gross_score,
    has_snake = excluded.has_snake,
    has_camel = excluded.has_camel,
    updated_at = now();
end;
$$;

-- Finalize a round — calls the core business logic function
create or replace function public.admin_finalize_round(p_round_id uuid)
returns jsonb language plpgsql security definer set search_path = wags, public as $$
declare v_result wags.round_outcomes%rowtype;
begin
  v_result := wags.fn_finalize_round(p_round_id);
  return to_jsonb(v_result);
end;
$$;

-- Reopen a finalized round
create or replace function public.admin_reopen_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = wags, public as $$
begin
  perform wags.fn_reopen_round(p_round_id);
end;
$$;

-- ── GRANTS: restrict all admin functions to service_role only ──
do $grants$
declare f text;
begin
  foreach f in array array[
    'public.admin_list_players(uuid)',
    'public.admin_list_seasons()',
    'public.admin_list_rule_sets()',
    'public.admin_list_competitions(uuid)',
    'public.admin_list_rounds(uuid)',
    'public.admin_get_round_detail(uuid)',
    'public.admin_get_round_outcome(uuid)',
    'public.admin_upsert_player(uuid, text, numeric)',
    'public.admin_set_membership(uuid, uuid, text)',
    'public.admin_upsert_season(uuid, text, integer, date, date, boolean)',
    'public.admin_upsert_rule_set(uuid, text, text, numeric, numeric, numeric, numeric, integer, integer)',
    'public.admin_upsert_competition(uuid, uuid, uuid, text, text, date)',
    'public.admin_create_round(uuid, uuid, integer, date)',
    'public.admin_set_round_entry(uuid, uuid, numeric)',
    'public.admin_remove_round_entry(uuid, uuid)',
    'public.admin_upsert_score(uuid, uuid, integer, integer, boolean, boolean)',
    'public.admin_finalize_round(uuid)',
    'public.admin_reopen_round(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$grants$;
