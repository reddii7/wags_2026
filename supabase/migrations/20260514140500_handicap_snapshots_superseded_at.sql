-- RPCs + Edge filter handicap_snapshots.superseded_at; column missing on some DBs.

begin;

alter table public.handicap_snapshots
  add column if not exists superseded_at timestamptz;

alter table public.handicap_snapshots
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists idx_handicap_snapshots_active_member_round
  on public.handicap_snapshots (member_id, round_id)
  where superseded_at is null;

commit;
