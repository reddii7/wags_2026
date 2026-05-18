begin;

create table if not exists public.scorecard_player_cards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.campaigns (id) on delete set null,
  played_date date not null,
  member_id uuid references public.members (id) on delete set null,
  full_name text not null,
  handicap numeric(5, 1) not null default 0,
  gross_scores jsonb not null default '{}'::jsonb,
  stableford_points integer not null default 0,
  gross_total integer,
  snake_count smallint not null default 0 check (snake_count >= 0),
  camel_count smallint not null default 0 check (camel_count >= 0),
  paid boolean not null default false,
  entry_fee_pence integer not null default 0 check (entry_fee_pence >= 0),
  submitted_by text not null default '',
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_scorecard_player_cards_current
  on public.scorecard_player_cards (season_id, played_date, member_id);

create index if not exists idx_scorecard_player_cards_date
  on public.scorecard_player_cards (played_date desc);

create index if not exists idx_scorecard_player_cards_season
  on public.scorecard_player_cards (season_id);

drop trigger if exists tr_scorecard_player_cards_updated_at
  on public.scorecard_player_cards;

create trigger tr_scorecard_player_cards_updated_at
before update on public.scorecard_player_cards
for each row execute function public.tg_set_updated_at();

alter table public.scorecard_player_cards enable row level security;

drop policy if exists "public can upsert staging scorecards"
  on public.scorecard_player_cards;
drop policy if exists "public can delete staging scorecards"
  on public.scorecard_player_cards;

create policy "public can upsert staging scorecards"
  on public.scorecard_player_cards
  for all
  to anon, authenticated
  using (true)
  with check (
    played_date is not null
    and full_name <> ''
    and jsonb_typeof(gross_scores) = 'object'
    and jsonb_typeof(payload_json) = 'object'
  );

grant select, insert, update, delete on public.scorecard_player_cards to anon, authenticated;
grant select, insert, update, delete on public.scorecard_player_cards to service_role;

comment on table public.scorecard_player_cards is
  'Live staging mirror for committee score-entry cards. Safe inbox only; does not affect live round scores.';

commit;
