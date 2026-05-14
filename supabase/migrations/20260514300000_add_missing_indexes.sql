-- Add partial index for handicap_snapshots queried by round_id (not member_id).
-- get_member_home_snapshot filters by round_id WHERE superseded_at IS NULL;
-- the existing idx_handicap_snapshots_active_member_round leads with member_id
-- so won't be used for round-only lookups.

create index if not exists idx_handicap_snapshots_round_active
  on public.handicap_snapshots (round_id)
  where superseded_at is null;
