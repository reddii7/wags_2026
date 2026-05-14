-- competitions and cup_matches were defined in the greenfield schema but are
-- absent from the live DB (schema was seeded before those sections landed).
-- This migration adds them safely with IF NOT EXISTS guards.

-- competition_type enum (may already exist on DBs that ran the full greenfield schema)
do $$ begin
  create type public.competition_type as enum (
    'summer_series',
    'rs_cup',
    'winter_series',
    'finals_medal',
    'away_day'
  );
exception when duplicate_object then null;
end $$;

-- updated_at trigger function (may already exist)
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Competitions: one row per program track within a campaign
-- (summer_series, rs_cup, winter_series, finals_medal, away_day)
create table if not exists public.competitions (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  type          public.competition_type not null,
  name          text not null,
  affects_handicap  boolean not null default false,
  affects_bank      boolean not null default false,
  affects_leagues   boolean not null default false,
  starts_on     date,
  ends_on       date,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default timezone('utc', now()),
  updated_at    timestamptz not null default timezone('utc', now())
);

create index if not exists idx_competitions_campaign on public.competitions (campaign_id);
create index if not exists idx_competitions_type    on public.competitions (type);

drop trigger if exists tr_competitions_updated_at on public.competitions;
create trigger tr_competitions_updated_at
before update on public.competitions
for each row execute function public.tg_set_updated_at();

comment on table public.competitions is
  'Program track: set flags per BUILD_GUIDE §2A matrix '
  '(summer_series, rs_cup, winter_series, finals_medal, away_day).';

-- RS Cup bracket: one row per match in the knockout draw
create table if not exists public.cup_matches (
  id               uuid primary key default gen_random_uuid(),
  competition_id   uuid not null references public.competitions (id) on delete cascade,
  stage_code       text not null,           -- e.g. 'prelim','r1','r2','qf','sf','final'
  slot_index       integer not null,        -- 1-based position in the stage
  home_member_id   uuid references public.members (id),
  away_member_id   uuid references public.members (id),
  winner_member_id uuid references public.members (id),
  next_match_id    uuid references public.cup_matches (id),
  result           jsonb,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  constraint uq_cup_match_slot unique (competition_id, stage_code, slot_index)
);

create index if not exists idx_cup_matches_competition on public.cup_matches (competition_id);

drop trigger if exists tr_cup_matches_updated_at on public.cup_matches;
create trigger tr_cup_matches_updated_at
before update on public.cup_matches
for each row execute function public.tg_set_updated_at();

comment on table public.cup_matches is
  'RS Cup knockout bracket: each row is one match. '
  'Set winner_member_id after the match is played; '
  'next_match_id points to the downstream slot the winner advances into.';

-- RLS: service role (admin) bypasses RLS; add read policies when member auth is wired.
alter table public.competitions enable row level security;
alter table public.cup_matches  enable row level security;
