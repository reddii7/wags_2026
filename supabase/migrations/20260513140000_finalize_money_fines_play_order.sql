-- §6 money: bank slice + £1 (100p) per snake AND per camel when collect_fines is true.
-- Rollover chain: if rounds.play_order is set, use strict play_order sequence; else round_date + id.

alter table public.rounds add column if not exists play_order integer;

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
  v_fines_pence     integer := 0;
  v_rollover_in     integer := 0;
  v_rollover_out    integer := 0;
  v_paid_out        integer;
  v_hcp_before      numeric;
  v_hcp_after       numeric;
  v_delta           numeric;
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

  -- Winner
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

  -- Rollover from previous round (same campaign + round_type)
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
  else
    select wps.rollover_carried_out into v_rollover_in
    from weekly_prize_state wps
    join rounds r on r.id = wps.round_id
    where r.campaign_id = v_round.campaign_id
      and r.round_type   = v_round.round_type
      and r.finalized    = true
      and r.id           <> p_round_id
      and (r.round_date < v_round.round_date
           or (r.round_date = v_round.round_date and r.id < v_round.id))
    order by r.round_date desc, r.id desc
    limit 1;
  end if;

  v_rollover_in := coalesce(v_rollover_in, 0);

  if v_tie then
    v_paid_out     := 0;
    v_rollover_out := v_pot_pence + v_rollover_in;
  else
    v_paid_out     := v_pot_pence + v_rollover_in;
    v_rollover_out := 0;
  end if;

  insert into weekly_prize_state
    (round_id, winner_member_id, paid_out_pence, to_bank_pence,
     rollover_carried_in, rollover_carried_out)
  values
    (p_round_id, v_winner_id, v_paid_out, v_bank_pence,
     v_rollover_in, v_rollover_out);

  for v_player in
    select rp.member_id, rp.stableford_points, m.handicap_index
    from   round_players rp
    join   members m on m.id = rp.member_id
    where  rp.round_id    = p_round_id
      and  rp.entered     = true
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
      v_delta := 0.1;
    end if;

    v_hcp_after := round(v_hcp_before + v_delta, 1);

    insert into handicap_snapshots (member_id, round_id, handicap_before, handicap_after)
    values (v_player.member_id, p_round_id, v_hcp_before, v_hcp_after);

    update members set handicap_index = v_hcp_after where id = v_player.member_id;
  end loop;

  update rounds
  set finalized    = true,
      finalized_at = now()
  where id = p_round_id;

  return jsonb_build_object(
    'ok',             true,
    'round_id',       p_round_id,
    'entrants',       v_entrant_count,
    'pot_pence',      v_pot_pence,
    'fines_pence',    v_fines_pence,
    'bank_pence',     v_bank_pence,
    'rollover_in',    v_rollover_in,
    'rollover_out',   v_rollover_out,
    'paid_out',       v_paid_out,
    'winner_id',      v_winner_id,
    'tie',            v_tie
  );
end;
$$;

grant execute on function public.finalize_round(uuid) to authenticated;
