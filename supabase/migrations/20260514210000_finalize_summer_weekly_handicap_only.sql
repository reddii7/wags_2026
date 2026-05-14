-- Correction: only summer_weekly rounds affect handicaps (§3.0 / §3.4 / §7).
-- Previous migration incorrectly included winter_weekly in the v_affects_handicap guard.
-- Winter, RS Cup, finals, and away days finalize without touching handicap_snapshots
-- or members.handicap_index.

create or replace function public.finalize_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round            rounds%rowtype;
  v_money            money_rules%rowtype;
  v_player           record;
  v_rule             handicap_rules%rowtype;
  v_winner_id        uuid;
  v_max_pts          integer := -1;
  v_tie              boolean := false;
  v_entrant_count    integer := 0;
  v_pot_pence        integer;
  v_bank_pence       integer;
  v_fines_pence      integer := 0;
  v_rollover_in      integer := 0;
  v_rollover_out     integer := 0;
  v_paid_out         integer;
  v_hcp_before       numeric;
  v_hcp_after        numeric;
  v_delta            numeric;
  v_affects_handicap boolean;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then
    raise exception 'Round % not found', p_round_id;
  end if;
  if v_round.finalized then
    raise exception 'Round % is already finalized', p_round_id;
  end if;

  select * into v_money from money_rules where round_type = v_round.round_type;
  if not found then
    raise exception 'No money_rules row found for round_type %', v_round.round_type;
  end if;

  -- Only summer_weekly rounds adjust handicaps (§3.0 / §3.4).
  -- winter_weekly, rs_cup, finals_champs, finals_chumps, away_day: no handicap movement.
  v_affects_handicap := v_round.round_type = 'summer_weekly';

  select count(*) into v_entrant_count
  from round_players
  where round_id = p_round_id and entered = true;

  v_pot_pence := v_entrant_count * v_money.pot_slice_pence;

  if v_money.collect_fines then
    select coalesce(sum(snake_count + camel_count), 0) * 100
    into v_fines_pence
    from round_players
    where round_id = p_round_id and entered = true;
  else
    v_fines_pence := 0;
  end if;

  v_bank_pence := v_entrant_count * v_money.bank_slice_pence + v_fines_pence;

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

  if v_round.play_order is not null then
    select wps.rollover_carried_out into v_rollover_in
    from weekly_prize_state wps
    join rounds r on r.id = wps.round_id
    where r.campaign_id = v_round.campaign_id
      and r.round_type   = v_round.round_type
      and r.finalized    = true
      and r.play_order   is not null
      and r.play_order   < v_round.play_order
    order by r.play_order desc
    limit 1;
    if not found then v_rollover_in := 0; end if;
  end if;

  if not v_tie and v_winner_id is not null then
    v_paid_out     := v_pot_pence + v_rollover_in;
    v_rollover_out := 0;
  else
    v_paid_out     := 0;
    v_rollover_out := v_pot_pence + v_rollover_in;
  end if;

  insert into weekly_prize_state
    (round_id, winner_member_id, paid_out_pence, to_bank_pence,
     rollover_carried_in, rollover_carried_out, bank_wallet)
  values
    (p_round_id, v_winner_id, v_paid_out, v_bank_pence,
     v_rollover_in, v_rollover_out, v_money.bank_wallet);

  -- Handicap engine: summer_weekly only (§3.0).
  if v_affects_handicap then
    for v_player in
      select rp.member_id, rp.stableford_points, m.handicap_index
      from   round_players rp
      join   members m on m.id = rp.member_id
      where  rp.round_id     = p_round_id
        and  rp.entered      = true
        and  rp.disqualified = false
        and  rp.stableford_points is not null
    loop
      select * into v_rule
      from   handicap_rules
      where  v_player.handicap_index <= max_hcap
      order  by max_hcap asc
      limit  1;

      if not found then
        select * into v_rule from handicap_rules order by max_hcap desc limit 1;
      end if;

      v_hcp_before := v_player.handicap_index;

      if v_player.stableford_points > 20 then
        v_delta := -( (v_player.stableford_points - 20)::numeric * v_rule.cut_factor );
      elsif v_player.stableford_points >= v_rule.buffer_zone then
        v_delta := 0;
      else
        v_delta := v_rule.below_buffer_delta;
      end if;

      v_hcp_after := round(v_hcp_before + v_delta, 1);

      insert into handicap_snapshots (member_id, round_id, handicap_before, handicap_after)
      values (v_player.member_id, p_round_id, v_hcp_before, v_hcp_after);

      update members set handicap_index = v_hcp_after where id = v_player.member_id;

      insert into public.member_handicap_state (campaign_id, member_id, handicap, updated_at)
      values (v_round.campaign_id, v_player.member_id, v_hcp_after, timezone('utc'::text, now()))
      on conflict (campaign_id, member_id) do update
      set
        handicap   = excluded.handicap,
        updated_at = excluded.updated_at;
    end loop;
  end if;

  update rounds
  set finalized    = true,
      finalized_at = now()
  where id = p_round_id;

  return jsonb_build_object(
    'round_id',          p_round_id,
    'entrants',          v_entrant_count,
    'pot_pence',         v_pot_pence,
    'bank_pence',        v_bank_pence,
    'paid_out_pence',    v_paid_out,
    'rollover_in',       v_rollover_in,
    'rollover_out',      v_rollover_out,
    'winner_id',         v_winner_id,
    'affects_handicap',  v_affects_handicap
  );
end;
$$;

comment on function public.finalize_round(uuid) is
  'Settle a round: prize money → weekly_prize_state; handicap adjustment → handicap_snapshots + '
  'members.handicap_index + member_handicap_state. Handicap engine runs for summer_weekly ONLY '
  '(§3.0). Winter, RS Cup, finals, away_day rounds: money settled, no handicap change.';

grant execute on function public.finalize_round(uuid) to authenticated;
grant execute on function public.finalize_round(uuid) to service_role;
