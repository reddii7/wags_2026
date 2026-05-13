-- =============================================================================
-- WAGS greenfield core schema (BUILD_GUIDE §2–§3.1, §6.2, §11)
-- Target: NEW blank Supabase project — public schema, no legacy `wags` layer.
-- When you adopt this: remove older migrations from this repo so only greenfield
-- (or squash) applies to the new project.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (single migration = easy to recreate on empty DB)
-- ---------------------------------------------------------------------------
create type public.campaign_track as enum ('main_summer', 'winter');

create type public.campaign_status as enum ('draft', 'open', 'closed');

create type public.competition_type as enum (
  'summer_series',
  'rs_cup',
  'winter_series',
  'finals_medal',
  'away_day'
);

create type public.round_status as enum (
  'scheduled',
  'open',
  'finalized',
  'reopened'
);

-- ---------------------------------------------------------------------------
-- Updated-at helper
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rule sets (money splits, handicap band version, etc. — versioned config)
-- config: summer £5 split, winter model, handicap band version JSON, etc.
-- ---------------------------------------------------------------------------
create table public.rule_sets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger tr_rule_sets_updated_at
before update on public.rule_sets
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Campaigns (= “Main summer 2026”, “Winter 2026” — BUILD_GUIDE §1B / §2.1)
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  track public.campaign_track not null,
  start_date date not null,
  end_date date,
  ruleset_id uuid not null references public.rule_sets (id),
  status public.campaign_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_campaigns_track on public.campaigns (track);
create index idx_campaigns_status on public.campaigns (status);

create trigger tr_campaigns_updated_at
before update on public.campaigns
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Competitions (programs under a campaign — §2.2 / §2A)
-- ---------------------------------------------------------------------------
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  type public.competition_type not null,
  name text not null,
  affects_handicap boolean not null default false,
  affects_bank boolean not null default false,
  affects_leagues boolean not null default false,
  starts_on date,
  ends_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_competitions_campaign on public.competitions (campaign_id);
create index idx_competitions_type on public.competitions (type);

create trigger tr_competitions_updated_at
before update on public.competitions
for each row execute function public.tg_set_updated_at();

comment on table public.competitions is
  'Program track: set flags per BUILD_GUIDE §2A matrix (summer_series, rs_cup, winter_series, finals_medal, away_day).';

-- ---------------------------------------------------------------------------
-- Members (~66 — §0)
-- ---------------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  external_ref text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_members_full_name unique (full_name)
);

create trigger tr_members_updated_at
before update on public.members
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Current handicap index per member, scoped to campaign (summer driving §3)
-- (Defined before players so the seed trigger can insert here.)
-- ---------------------------------------------------------------------------
create table public.member_handicap_state (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  handicap numeric(5, 1) not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Players — campaign roster: starting handicap + starting league (§4 / §3)
-- Seeds member_handicap_state on insert when no row exists yet.
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  starting_handicap numeric(5, 1) not null,
  starting_league_tier smallint
    check (starting_league_tier is null or starting_league_tier between 1 and 4),
  starting_league_name text,
  is_eligible boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_players_campaign_member unique (campaign_id, member_id)
);

create index idx_players_campaign on public.players (campaign_id);
create index idx_players_member on public.players (member_id);

create trigger tr_players_updated_at
before update on public.players
for each row execute function public.tg_set_updated_at();

comment on table public.players is
  'Campaign roster: starting handicap (audit) + starting league; current index in member_handicap_state.';

create or replace function public.tg_players_seed_member_handicap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.member_handicap_state (campaign_id, member_id, handicap)
  values (new.campaign_id, new.member_id, new.starting_handicap)
  on conflict (campaign_id, member_id) do nothing;
  return new;
end;
$$;

create trigger tr_players_seed_handicap
after insert on public.players
for each row execute function public.tg_players_seed_member_handicap();

-- ---------------------------------------------------------------------------
-- Rounds (§2.3)
-- ---------------------------------------------------------------------------
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  round_no integer,
  round_date date not null,
  status public.round_status not null default 'scheduled',
  par_holes smallint,
  course_par smallint,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index idx_rounds_competition on public.rounds (competition_id);
create index idx_rounds_date on public.rounds (round_date);

create trigger tr_rounds_updated_at
before update on public.rounds
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- Round facts — §2.4 (net stableford, optional gross, fees, snakes/camels)
-- ---------------------------------------------------------------------------
create table public.round_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  entered boolean not null default true,
  entry_fee_pence integer not null default 500,
  gross_score integer,
  stableford_points integer,
  snake_count smallint not null default 0 check (snake_count >= 0),
  camel_count smallint not null default 0 check (camel_count >= 0),
  disqualified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_round_player unique (round_id, member_id)
);

create index idx_round_players_round on public.round_players (round_id);
create index idx_round_players_member on public.round_players (member_id);

create trigger tr_round_players_updated_at
before update on public.round_players
for each row execute function public.tg_set_updated_at();

comment on column public.round_players.stableford_points is
  'Net stableford points as entered (BUILD_GUIDE §2.4).';

comment on column public.round_players.gross_score is
  'Optional gross strokes; nullable when only stableford is recorded.';

-- ---------------------------------------------------------------------------
-- Handicap adjustment audit (§3.1) — supersede on reopen / §1A.D.1
-- ---------------------------------------------------------------------------
create table public.handicap_snapshots (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete restrict,
  handicap_before numeric(5, 1) not null,
  handicap_after numeric(5, 1) not null,
  delta numeric(6, 2),
  ruleset_id uuid references public.rule_sets (id),
  superseded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_handicap_snapshots_round on public.handicap_snapshots (round_id);
create index idx_handicap_snapshots_member on public.handicap_snapshots (member_id);

create unique index uq_handicap_snapshots_active_member_round
  on public.handicap_snapshots (member_id, round_id)
  where superseded_at is null;

-- ---------------------------------------------------------------------------
-- Weekly / round settlement (§6.2 shape — summer winner pool + rollover)
-- ---------------------------------------------------------------------------
create table public.round_settlements (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete restrict,
  rollover_carried_in_pence bigint not null default 0,
  rollover_carried_out_pence bigint not null default 0,
  winner_member_id uuid references public.members (id),
  paid_out_pence bigint not null default 0,
  to_bank_pence bigint not null default 0,
  meta jsonb not null default '{}'::jsonb,
  superseded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index uq_round_settlements_active_round
  on public.round_settlements (round_id)
  where superseded_at is null;

-- ---------------------------------------------------------------------------
-- Append-only finance ledger (treasurer / §11.2 — extend wallets as needed)
-- ---------------------------------------------------------------------------
create table public.finance_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  round_id uuid references public.rounds (id) on delete restrict,
  wallet text not null,
  reason text not null,
  amount_pence bigint not null,
  meta jsonb not null default '{}'::jsonb,
  superseded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index idx_finance_events_campaign on public.finance_events (campaign_id);
create index idx_finance_events_round on public.finance_events (round_id);
create index idx_finance_events_wallet on public.finance_events (wallet);

-- ---------------------------------------------------------------------------
-- RS Cup bracket (minimal stub — §7; extend with stages/slots later)
-- ---------------------------------------------------------------------------
create table public.cup_matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  stage_code text not null,
  slot_index integer not null,
  home_member_id uuid references public.members (id),
  away_member_id uuid references public.members (id),
  winner_member_id uuid references public.members (id),
  next_match_id uuid references public.cup_matches (id),
  result jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_cup_match_slot unique (competition_id, stage_code, slot_index)
);

create index idx_cup_matches_competition on public.cup_matches (competition_id);

create trigger tr_cup_matches_updated_at
before update on public.cup_matches
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS off by default; enable + policies when member auth is wired.
-- Service role bypasses RLS for admin tooling.
-- ---------------------------------------------------------------------------
alter table public.rule_sets enable row level security;
alter table public.campaigns enable row level security;
alter table public.competitions enable row level security;
alter table public.members enable row level security;
alter table public.member_handicap_state enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_players enable row level security;
alter table public.handicap_snapshots enable row level security;
alter table public.round_settlements enable row level security;
alter table public.finance_events enable row level security;
alter table public.cup_matches enable row level security;

-- No policies: anon/authenticated blocked until you add read policies for PWA.

commit;
