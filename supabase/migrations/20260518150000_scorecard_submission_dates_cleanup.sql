begin;

alter table public.scorecard_submissions
  add column if not exists season_id uuid references public.campaigns (id) on delete set null,
  add column if not exists round_date date;

create index if not exists idx_scorecard_submissions_season_id
  on public.scorecard_submissions (season_id);

create index if not exists idx_scorecard_submissions_round_date
  on public.scorecard_submissions (round_date desc);

grant delete on public.scorecard_submissions to service_role;

commit;
