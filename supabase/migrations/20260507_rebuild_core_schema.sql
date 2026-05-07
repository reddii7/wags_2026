-- WAGS rebuild core schema
-- Purpose: deterministic calculations, auditable finance + handicap events,
-- and explicit round lifecycle (open/finalized/reopened) for safe recalculation.

create extension if not exists pgcrypto;

create schema if not exists wags;

-- Enums
DO $$ BEGIN
  CREATE TYPE wags.season_mode AS ENUM ('main', 'winter');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wags.competition_type AS ENUM (
    'main_weekly',
    'winter_weekly',
    'away_day',
    'matchplay',
    'season_final_champs',
    'season_final_chumps'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wags.round_status AS ENUM ('open', 'finalized', 'reopened');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wags.winner_type AS ENUM ('none', 'outright', 'tie');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wags.finance_wallet AS ENUM (
    'main_bank',
    'winter_bank',
    'weekly_pool',
    'rollover_pool',
    'chumps_pot',
    'winnings_paid'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wags.finance_reason AS ENUM (
    'entry_fee_bank_allocation',
    'entry_fee_weekly_allocation',
    'fine_allocation',
    'rollover_carry',
    'winner_payout',
    'manual_adjustment',
    'reversal'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wags.handicap_source AS ENUM (
    'round_auto',
    'manual_adjustment',
    'reversal'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Utility trigger for updated_at
create or replace function wags.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Master data
create table if not exists wags.rule_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  season_mode wags.season_mode not null,
  stableford_par integer not null default 20,
  entry_fee numeric(10,2) not null default 5.00,
  bank_share numeric(10,2) not null default 3.50,
  weekly_winner_share numeric(10,2) not null default 1.50,
  snake_camel_fine numeric(10,2) not null default 1.00,
  best_scores_take integer not null default 14,
  handicap_step_up numeric(6,2) not null default 0.50,
  handicap_step_down numeric(6,2) not null default 0.50,
  handicap_min numeric(6,2) not null default 0.00,
  handicap_max numeric(6,2) not null default 54.00,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (entry_fee >= 0),
  check (bank_share >= 0),
  check (weekly_winner_share >= 0),
  check (snake_camel_fine >= 0),
  check (best_scores_take > 0),
  check (handicap_min <= handicap_max)
);

drop trigger if exists tr_rule_sets_updated_at on wags.rule_sets;
create trigger tr_rule_sets_updated_at
before update on wags.rule_sets
for each row execute function wags.tg_set_updated_at();

create table if not exists wags.seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_date date not null,
  end_date date,
  start_year integer generated always as (extract(year from start_date)::int) stored,
  season_mode wags.season_mode not null,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists tr_seasons_updated_at on wags.seasons;
create trigger tr_seasons_updated_at
before update on wags.seasons
for each row execute function wags.tg_set_updated_at();

create table if not exists wags.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  status text not null default 'active',
  external_profile_id uuid,
  starting_handicap numeric(6,2) not null default 20.00,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (full_name)
);

drop trigger if exists tr_players_updated_at on wags.players;
create trigger tr_players_updated_at
before update on wags.players
for each row execute function wags.tg_set_updated_at();

create table if not exists wags.season_memberships (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references wags.seasons(id) on delete cascade,
  player_id uuid not null references wags.players(id) on delete cascade,
  league_tier smallint,
  league_name text,
  is_eligible boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (season_id, player_id),
  check (league_tier is null or league_tier between 1 and 10)
);

create index if not exists idx_season_memberships_season on wags.season_memberships(season_id);
create index if not exists idx_season_memberships_player on wags.season_memberships(player_id);

-- Competition structure
create table if not exists wags.competitions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references wags.seasons(id) on delete cascade,
  rule_set_id uuid not null references wags.rule_sets(id),
  competition_type wags.competition_type not null,
  name text not null,
  starts_on date,
  ends_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists tr_competitions_updated_at on wags.competitions;
create trigger tr_competitions_updated_at
before update on wags.competitions
for each row execute function wags.tg_set_updated_at();

create index if not exists idx_competitions_season on wags.competitions(season_id);
create index if not exists idx_competitions_type on wags.competitions(competition_type);

create table if not exists wags.rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references wags.competitions(id) on delete cascade,
  season_id uuid not null references wags.seasons(id) on delete cascade,
  round_no integer not null,
  round_date date not null,
  status wags.round_status not null default 'open',
  deadline_at timestamptz,
  finalized_at timestamptz,
  reopened_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (competition_id, round_no)
);

drop trigger if exists tr_rounds_updated_at on wags.rounds;
create trigger tr_rounds_updated_at
before update on wags.rounds
for each row execute function wags.tg_set_updated_at();

create index if not exists idx_rounds_season on wags.rounds(season_id, round_no);
create index if not exists idx_rounds_status on wags.rounds(status);

create table if not exists wags.round_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references wags.rounds(id) on delete cascade,
  player_id uuid not null references wags.players(id),
  entry_fee_paid numeric(10,2) not null default 0,
  is_eligible boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (round_id, player_id),
  check (entry_fee_paid >= 0)
);

drop trigger if exists tr_round_entries_updated_at on wags.round_entries;
create trigger tr_round_entries_updated_at
before update on wags.round_entries
for each row execute function wags.tg_set_updated_at();

create index if not exists idx_round_entries_round on wags.round_entries(round_id);
create index if not exists idx_round_entries_player on wags.round_entries(player_id);

create table if not exists wags.round_scores (
  id uuid primary key default gen_random_uuid(),
  round_entry_id uuid not null references wags.round_entries(id) on delete cascade,
  stableford_points integer,
  gross_score integer,
  holes_played smallint,
  has_snake boolean not null default false,
  has_camel boolean not null default false,
  submitted_by uuid,
  submitted_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (round_entry_id)
);

drop trigger if exists tr_round_scores_updated_at on wags.round_scores;
create trigger tr_round_scores_updated_at
before update on wags.round_scores
for each row execute function wags.tg_set_updated_at();

create index if not exists idx_round_scores_points on wags.round_scores(stableford_points desc);

create table if not exists wags.round_outcomes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references wags.rounds(id) on delete cascade,
  winner_type wags.winner_type not null,
  winner_player_ids uuid[] not null default '{}',
  winning_score integer,
  entry_count integer not null default 0,
  snakes_count integer not null default 0,
  camels_count integer not null default 0,
  bank_allocation numeric(10,2) not null default 0,
  weekly_allocation numeric(10,2) not null default 0,
  payout_amount numeric(10,2) not null default 0,
  calculated_at timestamptz not null default timezone('utc', now()),
  calculated_by uuid,
  is_current boolean not null default true
);

create index if not exists idx_round_outcomes_round_current on wags.round_outcomes(round_id, is_current);

-- Finance event ledger (immutable rows)
create table if not exists wags.finance_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references wags.seasons(id) on delete cascade,
  round_id uuid references wags.rounds(id) on delete set null,
  player_id uuid references wags.players(id) on delete set null,
  wallet wags.finance_wallet not null,
  reason wags.finance_reason not null,
  amount numeric(12,2) not null,
  metadata jsonb not null default '{}'::jsonb,
  reversal_of uuid references wags.finance_events(id),
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  check (amount <> 0)
);

create index if not exists idx_finance_events_season_wallet on wags.finance_events(season_id, wallet);
create index if not exists idx_finance_events_round on wags.finance_events(round_id);
create index if not exists idx_finance_events_reversal_of on wags.finance_events(reversal_of);

create or replace view wags.v_wallet_balances as
select
  season_id,
  wallet,
  round(sum(amount)::numeric, 2) as balance
from wags.finance_events
group by season_id, wallet;

-- Handicap event ledger + current state
create table if not exists wags.handicap_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references wags.seasons(id) on delete cascade,
  player_id uuid not null references wags.players(id) on delete cascade,
  source_round_id uuid references wags.rounds(id) on delete set null,
  source_type wags.handicap_source not null,
  handicap_before numeric(6,2) not null,
  delta numeric(6,2) not null,
  handicap_after numeric(6,2) not null,
  note text,
  reversal_of uuid references wags.handicap_events(id),
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_handicap_events_player on wags.handicap_events(player_id, created_at desc);
create index if not exists idx_handicap_events_round on wags.handicap_events(source_round_id);

create table if not exists wags.player_handicap_state (
  season_id uuid not null references wags.seasons(id) on delete cascade,
  player_id uuid not null references wags.players(id) on delete cascade,
  handicap numeric(6,2) not null,
  last_event_id uuid references wags.handicap_events(id),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (season_id, player_id)
);

-- Recalculation job tracking
create table if not exists wags.recalculation_jobs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references wags.seasons(id) on delete cascade,
  from_round_no integer not null,
  requested_by uuid,
  status text not null default 'running',
  notes text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

-- Matchplay basics
create table if not exists wags.matchplay_tournaments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references wags.seasons(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists wags.matchplay_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references wags.matchplay_tournaments(id) on delete cascade,
  round_number integer not null,
  player1_id uuid references wags.players(id),
  player2_id uuid references wags.players(id),
  winner_id uuid references wags.players(id),
  played_on date,
  scoreline text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_matchplay_matches_tournament_round
  on wags.matchplay_matches(tournament_id, round_number, id);

-- Immutable protection: events cannot be updated/deleted, only reversed by new rows.
create or replace function wags.tg_immutable_rows()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Rows in %.% are immutable; insert reversal rows instead', tg_table_schema, tg_table_name;
end;
$$;

drop trigger if exists tr_finance_events_immutable_upd on wags.finance_events;
create trigger tr_finance_events_immutable_upd
before update on wags.finance_events
for each row execute function wags.tg_immutable_rows();

drop trigger if exists tr_finance_events_immutable_del on wags.finance_events;
create trigger tr_finance_events_immutable_del
before delete on wags.finance_events
for each row execute function wags.tg_immutable_rows();

drop trigger if exists tr_handicap_events_immutable_upd on wags.handicap_events;
create trigger tr_handicap_events_immutable_upd
before update on wags.handicap_events
for each row execute function wags.tg_immutable_rows();

drop trigger if exists tr_handicap_events_immutable_del on wags.handicap_events;
create trigger tr_handicap_events_immutable_del
before delete on wags.handicap_events
for each row execute function wags.tg_immutable_rows();

-- Returns scored rows and dense rank for a round.
create or replace function wags.fn_round_leaderboard(p_round_id uuid)
returns table (
  player_id uuid,
  stableford_points integer,
  rank_no integer,
  has_snake boolean,
  has_camel boolean
)
language sql
stable
as $$
  select
    re.player_id,
    rs.stableford_points,
    dense_rank() over (order by rs.stableford_points desc nulls last) as rank_no,
    rs.has_snake,
    rs.has_camel
  from wags.round_entries re
  join wags.round_scores rs on rs.round_entry_id = re.id
  where re.round_id = p_round_id
    and re.is_eligible = true
    and rs.stableford_points is not null;
$$;

-- Rebuild one player's handicap state from immutable event stream.
create or replace function wags.fn_rebuild_player_handicap_state(
  p_season_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
as $$
declare
  v_start numeric(6,2);
  v_delta_sum numeric(10,2);
  v_new numeric(6,2);
  v_last_event uuid;
begin
  select coalesce(p.starting_handicap, 20.00) into v_start
  from wags.players p
  where p.id = p_player_id;

  select coalesce(sum(he.delta), 0), max(he.id)
    into v_delta_sum, v_last_event
  from wags.handicap_events he
  where he.season_id = p_season_id
    and he.player_id = p_player_id;

  v_new := round((v_start + v_delta_sum)::numeric, 2);

  insert into wags.player_handicap_state (season_id, player_id, handicap, last_event_id)
  values (p_season_id, p_player_id, v_new, v_last_event)
  on conflict (season_id, player_id)
  do update set
    handicap = excluded.handicap,
    last_event_id = excluded.last_event_id,
    updated_at = timezone('utc', now());
end;
$$;

-- Apply default handicap rule to a finalized round.
create or replace function wags.fn_apply_handicap_adjustments(
  p_round_id uuid,
  p_actor uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_season_id uuid;
  v_par integer;
  v_step_up numeric(6,2);
  v_step_down numeric(6,2);
  v_hcap_min numeric(6,2);
  v_hcap_max numeric(6,2);
  r record;
  v_before numeric(6,2);
  v_after numeric(6,2);
  v_delta numeric(6,2);
  v_count integer := 0;
begin
  select rd.season_id,
         rs.stableford_par,
         rs.handicap_step_up,
         rs.handicap_step_down,
         rs.handicap_min,
         rs.handicap_max
    into v_season_id, v_par, v_step_up, v_step_down, v_hcap_min, v_hcap_max
  from wags.rounds rd
  join wags.competitions c on c.id = rd.competition_id
  join wags.rule_sets rs on rs.id = c.rule_set_id
  where rd.id = p_round_id;

  if v_season_id is null then
    raise exception 'Round % not found', p_round_id;
  end if;

  for r in
    select * from wags.fn_round_leaderboard(p_round_id)
  loop
    select coalesce(phs.handicap, p.starting_handicap, 20.00)
      into v_before
    from wags.players p
    left join wags.player_handicap_state phs
      on phs.player_id = p.id and phs.season_id = v_season_id
    where p.id = r.player_id;

    if r.stableford_points >= (v_par + 2) then
      v_delta := -v_step_down;
    elsif r.stableford_points <= (v_par - 2) then
      v_delta := v_step_up;
    else
      v_delta := 0;
    end if;

    v_after := greatest(v_hcap_min, least(v_hcap_max, round((v_before + v_delta)::numeric, 2)));
    v_delta := round((v_after - v_before)::numeric, 2);

    if v_delta <> 0 then
      insert into wags.handicap_events (
        season_id,
        player_id,
        source_round_id,
        source_type,
        handicap_before,
        delta,
        handicap_after,
        note,
        created_by
      )
      values (
        v_season_id,
        r.player_id,
        p_round_id,
        'round_auto',
        v_before,
        v_delta,
        v_after,
        'Auto adjustment from finalized round',
        p_actor
      );

      perform wags.fn_rebuild_player_handicap_state(v_season_id, r.player_id);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Finalize round: computes winner/tie + finance events + handicap events.
create or replace function wags.fn_finalize_round(
  p_round_id uuid,
  p_actor uuid default null,
  p_note text default null
)
returns wags.round_outcomes
language plpgsql
as $$
declare
  v_round wags.rounds%rowtype;
  v_comp_type wags.competition_type;
  v_rule_bank_share numeric(10,2);
  v_rule_weekly_share numeric(10,2);
  v_rule_fine numeric(10,2);
  v_entry_count integer := 0;
  v_snakes integer := 0;
  v_camels integer := 0;
  v_winning_score integer;
  v_winner_count integer := 0;
  v_winner_ids uuid[] := '{}';
  v_winner_type wags.winner_type := 'none';
  v_bank_alloc numeric(10,2) := 0;
  v_weekly_alloc numeric(10,2) := 0;
  v_fine_alloc numeric(10,2) := 0;
  v_rollover_balance numeric(12,2) := 0;
  v_payout_total numeric(12,2) := 0;
  v_main_wallet wags.finance_wallet;
  v_outcome wags.round_outcomes%rowtype;
  v_applied_hcaps integer;
begin
  select * into v_round
  from wags.rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Round % not found', p_round_id;
  end if;

  if v_round.status = 'finalized' then
    raise exception 'Round % is already finalized', p_round_id;
  end if;

  select
    c.competition_type,
    rs.bank_share,
    rs.weekly_winner_share,
    rs.snake_camel_fine
    into v_comp_type, v_rule_bank_share, v_rule_weekly_share, v_rule_fine
  from wags.competitions c
  join wags.rule_sets rs on rs.id = c.rule_set_id
  where c.id = v_round.competition_id;

  if v_comp_type is null then
    raise exception 'Competition for round % not found', p_round_id;
  end if;

  select count(*)::int
    into v_entry_count
  from wags.round_entries re
  where re.round_id = p_round_id
    and re.is_eligible = true
    and re.entry_fee_paid > 0;

  select coalesce(sum((rs.has_snake)::int), 0),
         coalesce(sum((rs.has_camel)::int), 0)
    into v_snakes, v_camels
  from wags.round_entries re
  join wags.round_scores rs on rs.round_entry_id = re.id
  where re.round_id = p_round_id
    and re.is_eligible = true;

  select max(lb.stableford_points)
    into v_winning_score
  from wags.fn_round_leaderboard(p_round_id) lb;

  if v_winning_score is not null then
    select count(*)::int, coalesce(array_agg(lb.player_id), '{}')
      into v_winner_count, v_winner_ids
    from wags.fn_round_leaderboard(p_round_id) lb
    where lb.stableford_points = v_winning_score;
  end if;

  v_bank_alloc := round((v_entry_count * v_rule_bank_share)::numeric, 2);
  v_weekly_alloc := round((v_entry_count * v_rule_weekly_share)::numeric, 2);
  v_fine_alloc := round(((v_snakes + v_camels) * v_rule_fine)::numeric, 2);

  v_main_wallet := case
    when v_comp_type = 'winter_weekly' then 'winter_bank'::wags.finance_wallet
    else 'main_bank'::wags.finance_wallet
  end;

  if v_bank_alloc > 0 then
    insert into wags.finance_events (season_id, round_id, wallet, reason, amount, created_by)
    values (v_round.season_id, p_round_id, v_main_wallet, 'entry_fee_bank_allocation', v_bank_alloc, p_actor);
  end if;

  if v_weekly_alloc > 0 then
    insert into wags.finance_events (season_id, round_id, wallet, reason, amount, created_by)
    values (v_round.season_id, p_round_id, 'weekly_pool', 'entry_fee_weekly_allocation', v_weekly_alloc, p_actor);
  end if;

  if v_fine_alloc > 0 then
    insert into wags.finance_events (season_id, round_id, wallet, reason, amount, created_by)
    values (v_round.season_id, p_round_id, v_main_wallet, 'fine_allocation', v_fine_alloc, p_actor);
  end if;

  select coalesce(sum(fe.amount), 0)
    into v_rollover_balance
  from wags.finance_events fe
  where fe.season_id = v_round.season_id
    and fe.wallet = 'rollover_pool';

  if v_winner_count = 1 then
    v_winner_type := 'outright';
    v_payout_total := round((v_weekly_alloc + greatest(v_rollover_balance, 0))::numeric, 2);

    if v_weekly_alloc > 0 then
      insert into wags.finance_events (season_id, round_id, wallet, reason, amount, created_by)
      values (v_round.season_id, p_round_id, 'weekly_pool', 'winner_payout', -v_weekly_alloc, p_actor);
    end if;

    if v_rollover_balance > 0 then
      insert into wags.finance_events (season_id, round_id, wallet, reason, amount, created_by)
      values (v_round.season_id, p_round_id, 'rollover_pool', 'winner_payout', -v_rollover_balance, p_actor);
    end if;

    if v_payout_total > 0 then
      insert into wags.finance_events (season_id, round_id, player_id, wallet, reason, amount, created_by)
      values (v_round.season_id, p_round_id, v_winner_ids[1], 'winnings_paid', 'winner_payout', v_payout_total, p_actor);
    end if;
  elsif v_winner_count > 1 then
    v_winner_type := 'tie';

    if v_weekly_alloc > 0 then
      insert into wags.finance_events (season_id, round_id, wallet, reason, amount, created_by)
      values (v_round.season_id, p_round_id, 'weekly_pool', 'rollover_carry', -v_weekly_alloc, p_actor);

      insert into wags.finance_events (season_id, round_id, wallet, reason, amount, created_by)
      values (v_round.season_id, p_round_id, 'rollover_pool', 'rollover_carry', v_weekly_alloc, p_actor);
    end if;
  end if;

  update wags.round_outcomes
  set is_current = false
  where round_id = p_round_id
    and is_current = true;

  insert into wags.round_outcomes (
    round_id,
    winner_type,
    winner_player_ids,
    winning_score,
    entry_count,
    snakes_count,
    camels_count,
    bank_allocation,
    weekly_allocation,
    payout_amount,
    calculated_by,
    is_current
  )
  values (
    p_round_id,
    v_winner_type,
    coalesce(v_winner_ids, '{}'),
    v_winning_score,
    v_entry_count,
    v_snakes,
    v_camels,
    v_bank_alloc + v_fine_alloc,
    v_weekly_alloc,
    v_payout_total,
    p_actor,
    true
  )
  returning * into v_outcome;

  update wags.rounds
  set
    status = 'finalized',
    finalized_at = timezone('utc', now()),
    notes = coalesce(p_note, notes)
  where id = p_round_id;

  v_applied_hcaps := wags.fn_apply_handicap_adjustments(p_round_id, p_actor);

  return v_outcome;
end;
$$;

-- Reopen a finalized round by writing reversal events and marking round reopened.
create or replace function wags.fn_reopen_round(
  p_round_id uuid,
  p_actor uuid default null,
  p_reason text default null
)
returns void
language plpgsql
as $$
declare
  v_round wags.rounds%rowtype;
  r_fin record;
  r_hcp record;
  r_player record;
begin
  select * into v_round
  from wags.rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Round % not found', p_round_id;
  end if;

  if v_round.status <> 'finalized' then
    raise exception 'Round % must be finalized before reopen (current: %)', p_round_id, v_round.status;
  end if;

  update wags.round_outcomes
  set is_current = false
  where round_id = p_round_id
    and is_current = true;

  for r_fin in
    select fe.*
    from wags.finance_events fe
    where fe.round_id = p_round_id
      and fe.reversal_of is null
  loop
    insert into wags.finance_events (
      season_id,
      round_id,
      player_id,
      wallet,
      reason,
      amount,
      metadata,
      reversal_of,
      created_by
    )
    values (
      r_fin.season_id,
      r_fin.round_id,
      r_fin.player_id,
      r_fin.wallet,
      'reversal',
      -r_fin.amount,
      jsonb_build_object('reason', coalesce(p_reason, 'Round reopened')),
      r_fin.id,
      p_actor
    );
  end loop;

  for r_hcp in
    select he.*
    from wags.handicap_events he
    where he.source_round_id = p_round_id
      and he.reversal_of is null
  loop
    insert into wags.handicap_events (
      season_id,
      player_id,
      source_round_id,
      source_type,
      handicap_before,
      delta,
      handicap_after,
      note,
      reversal_of,
      created_by
    )
    values (
      r_hcp.season_id,
      r_hcp.player_id,
      r_hcp.source_round_id,
      'reversal',
      r_hcp.handicap_after,
      -r_hcp.delta,
      r_hcp.handicap_before,
      coalesce(p_reason, 'Round reopened'),
      r_hcp.id,
      p_actor
    );
  end loop;

  for r_player in
    select distinct he.player_id, he.season_id
    from wags.handicap_events he
    where he.source_round_id = p_round_id
  loop
    perform wags.fn_rebuild_player_handicap_state(r_player.season_id, r_player.player_id);
  end loop;

  update wags.rounds
  set
    status = 'reopened',
    reopened_at = timezone('utc', now()),
    notes = coalesce(p_reason, notes)
  where id = p_round_id;
end;
$$;

-- Recalculate season from round N by reopen -> finalize each affected round.
create or replace function wags.fn_recalculate_season(
  p_season_id uuid,
  p_from_round_no integer default 1,
  p_actor uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
as $$
declare
  v_job_id uuid := gen_random_uuid();
  r record;
begin
  insert into wags.recalculation_jobs (id, season_id, from_round_no, requested_by, status, notes)
  values (v_job_id, p_season_id, p_from_round_no, p_actor, 'running', p_note);

  for r in
    select id, status
    from wags.rounds
    where season_id = p_season_id
      and round_no >= p_from_round_no
    order by round_no asc, round_date asc, id asc
  loop
    if r.status = 'finalized' then
      perform wags.fn_reopen_round(r.id, p_actor, coalesce(p_note, 'Season recalculation reopen'));
    end if;

    perform wags.fn_finalize_round(r.id, p_actor, coalesce(p_note, 'Season recalculation finalize'));
  end loop;

  update wags.recalculation_jobs
  set status = 'completed', finished_at = timezone('utc', now())
  where id = v_job_id;

  return v_job_id;
exception
  when others then
    update wags.recalculation_jobs
    set status = 'failed', finished_at = timezone('utc', now()), notes = coalesce(notes, '') || ' | ' || sqlerrm
    where id = v_job_id;
    raise;
end;
$$;

-- Best-N helper for main/winter standings.
create or replace function wags.fn_get_best_scores(
  p_season_id uuid,
  p_competition_type wags.competition_type,
  p_take integer
)
returns table (
  player_id uuid,
  full_name text,
  rounds_count integer,
  total_best_points integer,
  rank_no integer
)
language sql
stable
as $$
  with scored as (
    select
      re.player_id,
      p.full_name,
      rs.stableford_points,
      row_number() over (
        partition by re.player_id
        order by rs.stableford_points desc, rd.round_date asc
      ) as rn
    from wags.rounds rd
    join wags.competitions c on c.id = rd.competition_id
    join wags.round_entries re on re.round_id = rd.id
    join wags.round_scores rs on rs.round_entry_id = re.id
    join wags.players p on p.id = re.player_id
    where rd.season_id = p_season_id
      and rd.status = 'finalized'
      and c.competition_type = p_competition_type
      and re.is_eligible = true
      and rs.stableford_points is not null
  ), agg as (
    select
      player_id,
      max(full_name) as full_name,
      count(*) filter (where rn <= p_take) as rounds_count,
      coalesce(sum(stableford_points) filter (where rn <= p_take), 0) as total_best_points
    from scored
    group by player_id
  )
  select
    a.player_id,
    a.full_name,
    a.rounds_count,
    a.total_best_points,
    dense_rank() over (order by a.total_best_points desc) as rank_no
  from agg a
  order by rank_no, a.full_name;
$$;

-- League standings by season memberships + finalized main weekly rounds.
create or replace function wags.fn_get_league_standings(
  p_season_id uuid
)
returns table (
  league_tier smallint,
  league_name text,
  player_id uuid,
  full_name text,
  total_points integer,
  rank_no integer
)
language sql
stable
as $$
  with scored as (
    select
      sm.league_tier,
      coalesce(sm.league_name, 'League ' || sm.league_tier::text) as league_name,
      sm.player_id,
      p.full_name,
      sum(coalesce(rs.stableford_points, 0))::int as total_points
    from wags.season_memberships sm
    join wags.players p on p.id = sm.player_id
    left join wags.round_entries re
      on re.player_id = sm.player_id
    left join wags.rounds rd
      on rd.id = re.round_id
      and rd.season_id = sm.season_id
      and rd.status = 'finalized'
    left join wags.competitions c
      on c.id = rd.competition_id
      and c.competition_type = 'main_weekly'
    left join wags.round_scores rs
      on rs.round_entry_id = re.id
    where sm.season_id = p_season_id
      and sm.is_eligible = true
      and sm.league_tier is not null
    group by sm.league_tier, sm.league_name, sm.player_id, p.full_name
  )
  select
    s.league_tier,
    s.league_name,
    s.player_id,
    s.full_name,
    s.total_points,
    dense_rank() over (partition by s.league_tier order by s.total_points desc) as rank_no
  from scored s
  order by s.league_tier asc, rank_no asc, s.full_name asc;
$$;

-- Seed baseline rulesets
insert into wags.rule_sets (
  code,
  name,
  season_mode,
  stableford_par,
  entry_fee,
  bank_share,
  weekly_winner_share,
  snake_camel_fine,
  best_scores_take,
  handicap_step_up,
  handicap_step_down
)
values
  ('MAIN_DEFAULT', 'Main Season Rules', 'main', 20, 5.00, 3.50, 1.50, 1.00, 14, 0.50, 0.50),
  ('WINTER_DEFAULT', 'Winter Season Rules', 'winter', 20, 5.00, 2.50, 2.50, 0.00, 10, 0.00, 0.00)
on conflict (code) do nothing;
