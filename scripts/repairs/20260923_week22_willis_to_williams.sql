-- Repair: Week 22 (2026-09-02) score attributed to James Willis (23 pts)
-- should have been Jez Williams (23 pts).
--
-- Integrity: reopen Weeks 24 → 23 → 22 (restore handicaps / void prizes),
-- reassign the round_players row, then re-finalize 22 → 23 → 24 so
-- handicap_snapshots, member_handicap_state, members.handicap_index, and
-- weekly_prize_state stay consistent with subsequent weeks.
--
-- Campaign: Main summer 2026 (f566e807-9e6e-4a20-bd3a-69378d04131e)
-- Round Week 22: 03d4a3a1-def2-410b-b99f-3565afc7235d
-- Round Week 23: 06d52a01-c5dd-4aff-9f6a-4a1d5a0d9663
-- Round Week 24: e3c5ecbd-fa82-41a6-85b7-d27f4589c4e2
-- James Willis:  c861a32e-eb32-42b1-8de8-27b946458baa
-- Jez Williams:  14f51696-e88d-43df-b4d8-48f5a4618347
-- round_players: 036ad1eb-de89-4744-9fb1-a94006307d85 (23 pts)

do $repair$
declare
  v_member uuid;
  v_pts    integer;
  v_jez    integer;
  v_re22   jsonb;
  v_re23   jsonb;
  v_re24   jsonb;
  v_fi22   jsonb;
  v_fi23   jsonb;
  v_fi24   jsonb;
begin
  select member_id, stableford_points
  into v_member, v_pts
  from public.round_players
  where id = '036ad1eb-de89-4744-9fb1-a94006307d85';

  if v_member is distinct from 'c861a32e-eb32-42b1-8de8-27b946458baa'::uuid
     or v_pts is distinct from 23 then
    raise exception 'Unexpected Week 22 row state: member=% pts=%', v_member, v_pts;
  end if;

  select count(*) into v_jez
  from public.round_players
  where round_id = '03d4a3a1-def2-410b-b99f-3565afc7235d'
    and member_id = '14f51696-e88d-43df-b4d8-48f5a4618347';

  if v_jez <> 0 then
    raise exception 'Jez Williams already has a Week 22 round_players row';
  end if;

  -- Unroll finalized chain (latest first)
  v_re24 := public.reopen_round('e3c5ecbd-fa82-41a6-85b7-d27f4589c4e2'::uuid);
  v_re23 := public.reopen_round('06d52a01-c5dd-4aff-9f6a-4a1d5a0d9663'::uuid);
  v_re22 := public.reopen_round('03d4a3a1-def2-410b-b99f-3565afc7235d'::uuid);

  -- Reassign incorrect entry Willis → Williams (same 23 pts / fees / fines)
  update public.round_players
  set member_id = '14f51696-e88d-43df-b4d8-48f5a4618347'
  where id = '036ad1eb-de89-4744-9fb1-a94006307d85'
    and member_id = 'c861a32e-eb32-42b1-8de8-27b946458baa';

  if not found then
    raise exception 'Failed to reassign Week 22 round_players row';
  end if;

  -- Replay finalize in play order
  v_fi22 := public.finalize_round('03d4a3a1-def2-410b-b99f-3565afc7235d'::uuid);
  v_fi23 := public.finalize_round('06d52a01-c5dd-4aff-9f6a-4a1d5a0d9663'::uuid);
  v_fi24 := public.finalize_round('e3c5ecbd-fa82-41a6-85b7-d27f4589c4e2'::uuid);

  raise notice 'reopen_24=% reopen_23=% reopen_22=%', v_re24, v_re23, v_re22;
  raise notice 'finalize_22=% finalize_23=% finalize_24=%', v_fi22, v_fi23, v_fi24;
end;
$repair$;
