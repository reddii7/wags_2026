-- Standings logic lives only in v_summer_standings / v_winter_standings / v_bank_dashboard.
-- Remove duplicate admin_* RPCs (same aggregates inlined twice).
-- Indexes to keep campaign + round_type filters cheap for the lateral subqueries.

drop function if exists public.admin_summer_standings(uuid);
drop function if exists public.admin_winter_standings(uuid);

create index if not exists idx_league_assignments_campaign_id
  on public.league_assignments (campaign_id);

create index if not exists idx_rounds_campaign_round_type_finalized
  on public.rounds (campaign_id, round_type, finalized);

create index if not exists idx_round_players_round_id_entered
  on public.round_players (round_id)
  where entered = true;
