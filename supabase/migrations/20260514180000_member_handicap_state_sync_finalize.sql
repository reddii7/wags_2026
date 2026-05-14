-- Proper contract: member_handicap_state is the per-campaign index the app reads.
-- finalize_round and reopen_round update it in the same transaction as snapshots
-- and members.handicap_index — no mass reopen/refinalize required after this ships.
-- One-time backfill below repairs historical drift.

begin;

-- ── Backfill: roster rows + current member index (covers empty or stale MHS) ─
do $$
begin
  if to_regclass('public.players') is not null then
    insert into public.member_handicap_state (campaign_id, member_id, handicap, updated_at)
    select
      p.campaign_id,
      p.member_id,
      m.handicap_index,
      timezone('utc'::text, now())
    from public.players p
    join public.members m on m.id = p.member_id
    on conflict (campaign_id, member_id) do update
    set
      handicap   = excluded.handicap,
      updated_at = excluded.updated_at;
  end if;
end $$;

-- ── finalize_round: upsert MHS after each entrant handicap update ─────────────
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
     rollover_carried_in, rollover_carried_out, bank_wallet)
  values
    (p_round_id, v_winner_id, v_paid_out, v_bank_pence,
     v_rollover_in, v_rollover_out, v_money.bank_wallet);

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
    'bank_wallet',    v_money.bank_wallet,
    'rollover_in',    v_rollover_in,
    'rollover_out',   v_rollover_out,
    'paid_out',       v_paid_out,
    'winner_id',      v_winner_id,
    'tie',            v_tie
  );
end;
$$;

-- ── reopen_round: sync MHS from restored members before snapshots are deleted ─
create or replace function public.reopen_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round rounds%rowtype;
  v_restored integer := 0;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then
    raise exception 'Round % not found', p_round_id;
  end if;
  if not v_round.finalized then
    raise exception 'Round % is not finalized', p_round_id;
  end if;

  update members m
  set    handicap_index = hs.handicap_before
  from   handicap_snapshots hs
  where  hs.round_id  = p_round_id
    and  hs.member_id = m.id;

  get diagnostics v_restored = row_count;

  insert into public.member_handicap_state (campaign_id, member_id, handicap, updated_at)
  select
    v_round.campaign_id,
    m.id,
    m.handicap_index,
    timezone('utc'::text, now())
  from public.members m
  inner join public.handicap_snapshots hs
    on hs.member_id = m.id and hs.round_id = p_round_id
  on conflict (campaign_id, member_id) do update
  set
    handicap   = excluded.handicap,
    updated_at = excluded.updated_at;

  delete from handicap_snapshots  where round_id = p_round_id;
  delete from weekly_prize_state  where round_id = p_round_id;

  update rounds
  set finalized    = false,
      finalized_at = null
  where id = p_round_id;

  return jsonb_build_object(
    'ok',                  true,
    'round_id',            p_round_id,
    'handicaps_restored', v_restored
  );
end;
$$;

grant execute on function public.finalize_round(uuid) to authenticated;
grant execute on function public.reopen_round(uuid) to authenticated;
grant execute on function public.finalize_round(uuid) to service_role;
grant execute on function public.reopen_round(uuid) to service_role;

comment on table public.member_handicap_state is
  'Canonical handicap index per (campaign, member) for apps (e.g. fetch-all-data '
  '→ profiles.current_handicap). Writers: (1) tr_players_seed_handicap on players '
  'insert — initial row from starting_handicap; (2) finalize_round — upsert after '
  'each entrant handicap change in the same transaction as handicap_snapshots and '
  'members.handicap_index; (3) reopen_round — upsert from restored members before '
  'snapshots are deleted. Do not patch one table without the others.';

comment on column public.members.handicap_index is
  'Working index read by finalize_round for the next adjustment. Updated together '
  'with handicap_snapshots and member_handicap_state for that round inside '
  'finalize_round / reopen_round.';

comment on function public.finalize_round(uuid) is
  'Atomically: weekly_prize_state, handicap_snapshots, members.handicap_index per '
  'entrant, member_handicap_state upsert per entrant, round finalized.';

comment on function public.reopen_round(uuid) is
  'Restores members.handicap_index from snapshots, syncs member_handicap_state for '
  'affected members, deletes snapshot and prize rows, clears finalized.';

commit;
