-- Rule update migration
-- 1) Handicap logic uses banded buffer/cut factors from pre-round handicap.
-- 2) Handicap changes apply only to main weekly competitions.
-- 3) Main season league standings are based on each player's best 10 scores.

create or replace function wags.fn_apply_handicap_adjustments(
  p_round_id uuid,
  p_actor uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_season_id uuid;
  v_comp_type wags.competition_type;
  v_hcap_min numeric(6,2);
  v_hcap_max numeric(6,2);
  r record;
  v_before numeric(6,2);
  v_after numeric(6,2);
  v_delta numeric(6,2);
  v_count integer := 0;
  v_buffer_zone integer;
  v_cut_factor numeric(6,3);
begin
  select
    rd.season_id,
    c.competition_type,
    rs.handicap_min,
    rs.handicap_max
    into v_season_id, v_comp_type, v_hcap_min, v_hcap_max
  from wags.rounds rd
  join wags.competitions c on c.id = rd.competition_id
  join wags.rule_sets rs on rs.id = c.rule_set_id
  where rd.id = p_round_id;

  if v_season_id is null then
    raise exception 'Round % not found', p_round_id;
  end if;

  -- Handicap updates are only for the main weekly competition.
  if v_comp_type <> 'main_weekly' then
    return 0;
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

    -- Rule band selection by handicap before the competition.
    if v_before <= 3.0 then
      v_buffer_zone := 19;
      v_cut_factor := 0.1;
    elsif v_before <= 7.0 then
      v_buffer_zone := 18;
      v_cut_factor := 0.2;
    elsif v_before <= 10.0 then
      v_buffer_zone := 17;
      v_cut_factor := 0.3;
    else
      v_buffer_zone := 16;
      v_cut_factor := 0.4;
    end if;

    if r.stableford_points > 20 then
      v_delta := -1 * ((r.stableford_points - 20) * v_cut_factor);
    elsif r.stableford_points < v_buffer_zone then
      v_delta := 0.1;
    else
      v_delta := 0;
    end if;

    v_after := greatest(v_hcap_min, least(v_hcap_max, round((v_before + v_delta)::numeric, 2)));
    v_delta := round((v_after - v_before)::numeric, 2);

    if v_delta <> 0 then
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
        'Auto adjustment from finalized round (banded rule)',
        p_actor
      );

      perform wags.fn_rebuild_player_handicap_state(v_season_id, r.player_id);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function wags.fn_get_league_standings(
  p_season_id uuid
)
returns table (
  league_tier smallint,
  league_name text,
  player_id uuid,
  full_name text,
  total_points integer,
  rank_no integer
)
language sql
stable
as $$
  with player_rounds as (
    select
      sm.league_tier,
      coalesce(sm.league_name, 'League ' || sm.league_tier::text) as league_name,
      sm.player_id,
      p.full_name,
      rs.stableford_points,
      rd.round_date,
      row_number() over (
        partition by sm.player_id
        order by rs.stableford_points desc nulls last, rd.round_date asc, rd.id asc
      ) as rn
    from wags.season_memberships sm
    join wags.players p on p.id = sm.player_id
    left join wags.round_entries re
      on re.player_id = sm.player_id
    left join wags.rounds rd
      on rd.id = re.round_id
      and rd.season_id = sm.season_id
      and rd.status = 'finalized'
    left join wags.competitions c
      on c.id = rd.competition_id
      and c.competition_type = 'main_weekly'
    left join wags.round_scores rs
      on rs.round_entry_id = re.id
    where sm.season_id = p_season_id
      and sm.is_eligible = true
      and sm.league_tier is not null
      and c.id is not null
      and rs.stableford_points is not null
  ), scored as (
    select
      league_tier,
      league_name,
      player_id,
      full_name,
      coalesce(sum(stableford_points) filter (where rn <= 10), 0)::int as total_points
    from player_rounds
    group by league_tier, league_name, player_id, full_name
  )
  select
    s.league_tier,
    s.league_name,
    s.player_id,
    s.full_name,
    s.total_points,
    dense_rank() over (partition by s.league_tier order by s.total_points desc) as rank_no
  from scored s
  order by s.league_tier asc, rank_no asc, s.full_name asc;
$$;
