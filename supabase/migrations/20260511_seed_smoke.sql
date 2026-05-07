-- Seed + smoke data for WAGS rebuild testing
-- Covers:
-- 1) handicap band thresholds (3.0, 7.0, 10.0, >10.0)
-- 2) outright winner payout
-- 3) tie rollover carry
-- 4) league scoring source rows

-- Hotfix for environments where max(uuid) is not supported.
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

  select coalesce(sum(he.delta), 0)
    into v_delta_sum
  from wags.handicap_events he
  where he.season_id = p_season_id
    and he.player_id = p_player_id;

  select he.id
    into v_last_event
  from wags.handicap_events he
  where he.season_id = p_season_id
    and he.player_id = p_player_id
  order by he.created_at desc, he.id desc
  limit 1;

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

-- Fixed IDs keep this deterministic for test walkthroughs.
-- This migration is intended for the separate test project only.

-- Season and competition
insert into wags.seasons (id, label, start_date, end_date, season_mode, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'Main Season 2026 (Test)',
  '2026-01-01',
  '2026-12-31',
  'main',
  true
)
on conflict (id) do nothing;

insert into wags.competitions (
  id,
  season_id,
  rule_set_id,
  competition_type,
  name,
  starts_on,
  ends_on
)
select
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  rs.id,
  'main_weekly',
  'Main Weekly Test Competition',
  '2026-05-01',
  '2026-05-31'
from wags.rule_sets rs
where rs.code = 'MAIN_DEFAULT'
on conflict (id) do nothing;

-- Players at handicap band boundaries
insert into wags.players (id, full_name, starting_handicap)
values
  ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Band 3.0 Player', 3.0),
  ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Band 7.0 Player', 7.0),
  ('aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Band 10.0 Player', 10.0),
  ('aaaaaaa4-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Band 10.1 Player', 10.1)
on conflict (id) do nothing;

insert into wags.season_memberships (season_id, player_id, league_tier, league_name, is_eligible)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1, 'PREMIERSHIP', true),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 1, 'PREMIERSHIP', true),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 1, 'PREMIERSHIP', true),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaa4-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 1, 'PREMIERSHIP', true)
on conflict (season_id, player_id) do nothing;

-- Two rounds: one outright winner, one tie
insert into wags.rounds (id, competition_id, season_id, round_no, round_date, status, notes)
values
  ('33333333-3333-3333-3333-333333333331', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 1, '2026-05-07', 'open', 'Smoke round 1'),
  ('33333333-3333-3333-3333-333333333332', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 2, '2026-05-14', 'open', 'Smoke round 2')
on conflict (id) do nothing;

-- Round entries and scores
insert into wags.round_entries (id, round_id, player_id, entry_fee_paid, is_eligible)
values
  ('44444444-4444-4444-4444-444444444411', '33333333-3333-3333-3333-333333333331', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 5.00, true),
  ('44444444-4444-4444-4444-444444444412', '33333333-3333-3333-3333-333333333331', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 5.00, true),
  ('44444444-4444-4444-4444-444444444413', '33333333-3333-3333-3333-333333333331', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 5.00, true),
  ('44444444-4444-4444-4444-444444444414', '33333333-3333-3333-3333-333333333331', 'aaaaaaa4-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 5.00, true),
  ('44444444-4444-4444-4444-444444444421', '33333333-3333-3333-3333-333333333332', 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 5.00, true),
  ('44444444-4444-4444-4444-444444444422', '33333333-3333-3333-3333-333333333332', 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 5.00, true),
  ('44444444-4444-4444-4444-444444444423', '33333333-3333-3333-3333-333333333332', 'aaaaaaa3-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 5.00, true),
  ('44444444-4444-4444-4444-444444444424', '33333333-3333-3333-3333-333333333332', 'aaaaaaa4-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 5.00, true)
on conflict (id) do nothing;

insert into wags.round_scores (round_entry_id, stableford_points, has_snake, has_camel)
values
  ('44444444-4444-4444-4444-444444444411', 23, false, false),
  ('44444444-4444-4444-4444-444444444412', 22, false, false),
  ('44444444-4444-4444-4444-444444444413', 15, false, false),
  ('44444444-4444-4444-4444-444444444414', 15, true,  false),
  ('44444444-4444-4444-4444-444444444421', 19, false, false),
  ('44444444-4444-4444-4444-444444444422', 21, false, false),
  ('44444444-4444-4444-4444-444444444423', 21, false, true ),
  ('44444444-4444-4444-4444-444444444424', 14, false, false)
on conflict (round_entry_id) do nothing;

-- Finalize both rounds if not already finalized.
do $$
begin
  if exists (
    select 1 from wags.rounds
    where id = '33333333-3333-3333-3333-333333333331'
      and status <> 'finalized'
  ) then
    perform wags.fn_finalize_round('33333333-3333-3333-3333-333333333331', null, 'Smoke finalize round 1');
  end if;

  if exists (
    select 1 from wags.rounds
    where id = '33333333-3333-3333-3333-333333333332'
      and status <> 'finalized'
  ) then
    perform wags.fn_finalize_round('33333333-3333-3333-3333-333333333332', null, 'Smoke finalize round 2');
  end if;
end $$;
