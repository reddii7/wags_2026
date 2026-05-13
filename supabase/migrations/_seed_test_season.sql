-- Seed test season: 5 members, summer campaign, 2 league tiers, Week 01 scores ready to finalize.
-- Run AFTER tables are empty (use _truncate_test_data.sql first if needed).

do $$
declare
  v_camp uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid; v_m5 uuid;
  v_round uuid;
begin

  -- ── Campaign ──────────────────────────────────────────────────────────────
  insert into campaigns (kind, year, label, status, start_date)
  values ('summer_main', 2026, 'Summer 2026', 'open', '2026-05-01')
  returning id into v_camp;

  -- ── Members (handicaps -1 to 11) ──────────────────────────────────────────
  -- Band 1 (≤3.0,  buffer 19, cut ×0.1)
  insert into members (full_name, email, initial_handicap_index)
  values ('Tom Sharp', 'tom@wags.test', -1.0) returning id into v_m1;

  -- Band 2 (≤7.0,  buffer 18, cut ×0.2)
  insert into members (full_name, email, initial_handicap_index)
  values ('Ben Fox', 'ben@wags.test', 3.5) returning id into v_m2;

  -- Band 2 (≤7.0,  buffer 18, cut ×0.2)
  insert into members (full_name, email, initial_handicap_index)
  values ('Chris Lane', 'chris@wags.test', 6.0) returning id into v_m3;

  -- Band 3 (≤10.0, buffer 17, cut ×0.3)
  insert into members (full_name, email, initial_handicap_index)
  values ('Dave Marsh', 'dave@wags.test', 9.0) returning id into v_m4;

  -- Band 4 (≤99.0, buffer 16, cut ×0.4)
  insert into members (full_name, email, initial_handicap_index)
  values ('Ed Hill', 'ed@wags.test', 11.0) returning id into v_m5;

  -- ── League assignments (tier 1 = Premiership, tier 2 = Championship) ─────
  insert into league_assignments (campaign_id, member_id, tier, effective_from) values
    (v_camp, v_m1, 1, '2026-05-01'),
    (v_camp, v_m2, 1, '2026-05-01'),
    (v_camp, v_m3, 2, '2026-05-01'),
    (v_camp, v_m4, 2, '2026-05-01'),
    (v_camp, v_m5, 2, '2026-05-01');

  -- ── Round 1 — Week 01 (left open for you to finalize) ─────────────────────
  insert into rounds (campaign_id, round_type, name, play_order, round_date, course_par, finalized)
  values (v_camp, 'summer_weekly', 'Week 01', 1, '2026-05-07 09:00:00+00', 20, false)
  returning id into v_round;

  -- Scores — deliberate mix across all four handicap bands:
  --   Tom  Sharp  (-1.0, band 1, buf 19): 24 pts → above par → cut (24-20)×0.1 = 0.4 → -1.4
  --   Ben  Fox    ( 3.5, band 2, buf 18): 18 pts → 18 = buffer → safe zone → no change
  --   Chris Lane  ( 6.0, band 2, buf 18): 21 pts → above par → cut (21-20)×0.2 = 0.2 → 5.8
  --   Dave Marsh  ( 9.0, band 3, buf 17): 15 pts → below buffer → +0.1 → 9.1
  --   Ed  Hill    (11.0, band 4, buf 16): 22 pts → above par → cut (22-20)×0.4 = 0.8 → 10.2
  insert into round_players
    (round_id, member_id, entered, stableford_points, snake_count, camel_count, entry_fee_pence)
  values
    (v_round, v_m1, true, 24, 0, 1, 500),
    (v_round, v_m2, true, 18, 1, 0, 500),
    (v_round, v_m3, true, 21, 0, 0, 500),
    (v_round, v_m4, true, 15, 1, 0, 500),
    (v_round, v_m5, true, 22, 0, 1, 500);

end $$;
