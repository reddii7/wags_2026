-- Align handicap event generation with legacy behavior:
-- write one handicap event per scored eligible player (including zero delta).

create or replace function wags.fn_apply_handicap_adjustments(
  p_round_id uuid,
  p_actor uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_season_id uuid;
  v_par integer;
  v_step_up numeric(6,2);
  v_step_down numeric(6,2);
  v_hcap_min numeric(6,2);
  v_hcap_max numeric(6,2);
  r record;
  v_before numeric(6,2);
  v_after numeric(6,2);
  v_delta numeric(6,2);
  v_count integer := 0;
begin
  select rd.season_id,
         rs.stableford_par,
         rs.handicap_step_up,
         rs.handicap_step_down,
         rs.handicap_min,
         rs.handicap_max
    into v_season_id, v_par, v_step_up, v_step_down, v_hcap_min, v_hcap_max
  from wags.rounds rd
  join wags.competitions c on c.id = rd.competition_id
  join wags.rule_sets rs on rs.id = c.rule_set_id
  where rd.id = p_round_id;

  if v_season_id is null then
    raise exception 'Round % not found', p_round_id;
  end if;

  for r in
    select * from wags.fn_round_leaderboard(p_round_id)
  loop
    select coalesce(phs.handicap, p.starting_handicap, 20.00)
      into v_before
    from wags.players p
    left join wags.player_handicap_state phs
      on phs.player_id = p.id and phs.season_id = v_season_id
    where p.id = r.player_id;

    if r.stableford_points >= (v_par + 2) then
      v_delta := -v_step_down;
    elsif r.stableford_points <= (v_par - 2) then
      v_delta := v_step_up;
    else
      v_delta := 0;
    end if;

    v_after := greatest(v_hcap_min, least(v_hcap_max, round((v_before + v_delta)::numeric, 2)));
    v_delta := round((v_after - v_before)::numeric, 2);

    insert into wags.handicap_events (
      season_id,
      player_id,
      source_round_id,
      source_type,
      handicap_before,
      delta,
      handicap_after,
      note,
      created_by
    )
    values (
      v_season_id,
      r.player_id,
      p_round_id,
      'round_auto',
      v_before,
      v_delta,
      v_after,
      'Auto adjustment from finalized round',
      p_actor
    );

    perform wags.fn_rebuild_player_handicap_state(v_season_id, r.player_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
