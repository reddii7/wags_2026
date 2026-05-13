-- =============================================================================
-- Flatten TEST / scratch operational data (clean slate before _seed_test_season).
-- =============================================================================
--
-- NEVER truncate or delete rows from these (wiping them breaks finalize_round
-- and all money/handicap logic — this was a past mistake):
--   • public.handicap_rules
--   • public.money_rules
--   • public.rule_sets
--
-- One TRUNCATE lists every present table so Postgres resolves FK order together.
-- Tables your DB lacks are skipped (not listed).
-- =============================================================================

do $truncate_wags_test_data$
declare
  tbls text[] := array[
    'finance_events',
    'handicap_snapshots',
    'weekly_prize_state',
    'round_settlements',
    'round_players',
    'cup_matches',
    'rounds',
    'competitions',
    'league_assignments',
    'players',
    'member_handicap_state',
    'campaigns',
    'members'
  ];
  t text;
  parts text[] := array[]::text[];
  sql text;
begin
  foreach t in array tbls
  loop
    if to_regclass('public.' || t) is not null then
      parts := array_append(parts, 'public.' || quote_ident(t));
    end if;
  end loop;

  if coalesce(array_length(parts, 1), 0) = 0 then
    raise notice 'truncate_wags_test_data: no matching tables found';
    return;
  end if;

  sql := 'truncate table ' || array_to_string(parts, ', ') || ' restart identity';

  execute sql;
end;
$truncate_wags_test_data$;
