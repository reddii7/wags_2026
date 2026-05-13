-- finalize_round(p_round_id)
-- Atomically:
--   1. Computes prize money using money_rules for the round's type
--   2. Picks up any rollover carried from the previous same-type round
--   3. Inserts a weekly_prize_state row
--   4. Computes new handicap for each entered, non-DQ player using handicap_rules bands
--   5. Inserts handicap_snapshots rows
--   6. Updates members.handicap_index
--   7. Marks round finalized
--
-- Handicap formula:
--   Par = 20 (stableford par, fixed)
--   S > 20                    →  delta = -(S - 20) * cut_factor   (cut: points-over-par × band rate)
--   buffer_zone <= S <= 20    →  delta = 0                         (safe zone, no change)
--   S < buffer_zone           →  delta = +0.1                      (below buffer: flat increase)
--   new_hcp = max(0, round(old_hcp + delta, 1))

create or replace function public.finalize_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round           rounds%rowtype;
  v_money           money_rules%rowtype;
  v_player          record;
  v_rule            handicap_rules%rowtype;
  v_winner_id       uuid;
  v_max_pts         integer := -1;
  v_tie             boolean := false;
  v_entrant_count   integer := 0;
  v_pot_pence       integer;
  v_bank_pence      integer;
  v_rollover_in     integer := 0;
  v_rollover_out    integer := 0;
  v_paid_out        integer;
  v_hcp_before      numeric;
  v_hcp_after       numeric;
  v_delta           numeric;
begin
  -- ── Guard ──────────────────────────────────────────────────────────────────
  select * into v_round from rounds where id = p_round_id;
  if not found then
    raise exception 'Round % not found', p_round_id;
  end if;
  if v_round.finalized then
    raise exception 'Round % is already finalized', p_round_id;
  end if;

  -- ── Money rules ────────────────────────────────────────────────────────────
  select * into v_money from money_rules where round_type = v_round.round_type;
  if not found then
    raise exception 'No money_rules row found for round_type %', v_round.round_type;
  end if;

  select count(*) into v_entrant_count
  from round_players
  where round_id = p_round_id and entered = true;

  v_pot_pence  := v_entrant_count * v_money.pot_slice_pence;
  v_bank_pence := v_entrant_count * v_money.bank_slice_pence;

  -- ── Winner ─────────────────────────────────────────────────────────────────
  select max(stableford_points) into v_max_pts
  from round_players
  where round_id = p_round_id and entered = true and disqualified = false;

  select count(*) > 1 into v_tie
  from round_players
  where round_id = p_round_id and entered = true and disqualified = false
    and stableford_points = v_max_pts;

  if not v_tie and v_max_pts is not null then
    select member_id into v_winner_id
    from round_players
    where round_id = p_round_id and entered = true and disqualified = false
      and stableford_points = v_max_pts
    limit 1;
  end if;

  -- ── Rollover from previous round of the same type in the same campaign ─────
  select coalesce(wps.rollover_carried_out, 0) into v_rollover_in
  from weekly_prize_state wps
  join rounds r on r.id = wps.round_id
  where r.campaign_id = v_round.campaign_id
    and r.round_type   = v_round.round_type
    and r.round_date   < v_round.round_date
  order by r.round_date desc
  limit 1;
  -- SELECT INTO sets variable to NULL when no row is found; guard against that
  v_rollover_in := coalesce(v_rollover_in, 0);

  -- ── Compute prize disposition ───────────────────────────────────────────────
  if v_tie then
    -- Tie: nobody wins this week; full pot rolls over to next round
    v_paid_out     := 0;
    v_rollover_out := v_pot_pence + v_rollover_in;
  else
    v_paid_out     := v_pot_pence + v_rollover_in;
    v_rollover_out := 0;
  end if;

  -- ── Insert weekly_prize_state ───────────────────────────────────────────────
  insert into weekly_prize_state
    (round_id, winner_member_id, paid_out_pence, to_bank_pence,
     rollover_carried_in, rollover_carried_out)
  values
    (p_round_id, v_winner_id, v_paid_out, v_bank_pence,
     v_rollover_in, v_rollover_out);

  -- ── Handicap snapshots ──────────────────────────────────────────────────────
  for v_player in
    select rp.member_id, rp.stableford_points, m.handicap_index
    from   round_players rp
    join   members m on m.id = rp.member_id
    where  rp.round_id    = p_round_id
      and  rp.entered     = true
      and  rp.disqualified = false
      and  rp.stableford_points is not null
  loop
    -- Find the band whose max_hcap is the lowest value >= player's handicap
    select * into v_rule
    from   handicap_rules
    where  v_player.handicap_index <= max_hcap
    order  by max_hcap asc
    limit  1;

    if not found then
      -- Handicap is above all bands — use highest band
      select * into v_rule from handicap_rules order by max_hcap desc limit 1;
    end if;

    v_hcp_before := v_player.handicap_index;

    if v_player.stableford_points > 20 then
      -- Above par: cut = (score - 20) × band cut_factor
      v_delta := -( (v_player.stableford_points - 20)::numeric * v_rule.cut_factor );
    elsif v_player.stableford_points >= v_rule.buffer_zone then
      -- Between buffer zone and par (inclusive): safe zone, no change
      v_delta := 0;
    else
      -- Below buffer zone: flat +0.1
      v_delta := 0.1;
    end if;

    -- No hard floor — plus handicap players can go further plus (negative values are valid)
    v_hcp_after := round(v_hcp_before + v_delta, 1);

    insert into handicap_snapshots (member_id, round_id, handicap_before, handicap_after)
    values (v_player.member_id, p_round_id, v_hcp_before, v_hcp_after);

    update members set handicap_index = v_hcp_after where id = v_player.member_id;
  end loop;

  -- ── Mark round finalized ────────────────────────────────────────────────────
  update rounds
  set finalized    = true,
      finalized_at = now()
  where id = p_round_id;

  return jsonb_build_object(
    'ok',            true,
    'round_id',      p_round_id,
    'entrants',      v_entrant_count,
    'pot_pence',     v_pot_pence,
    'bank_pence',    v_bank_pence,
    'rollover_in',   v_rollover_in,
    'rollover_out',  v_rollover_out,
    'paid_out',      v_paid_out,
    'winner_id',     v_winner_id,
    'tie',           v_tie
  );
end;
$$;

-- Allow any authenticated user (service role bypasses RLS anyway)
grant execute on function public.finalize_round(uuid) to authenticated;
