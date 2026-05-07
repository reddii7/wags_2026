-- League standings should include all eligible members, even if they have 0 played rounds.
-- Best-10 scoring still applies via rn <= 10.
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
        order by rs.stableford_points desc nulls last, rd.round_date asc nulls last, rd.id asc nulls last
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
  ), scored as (
    select
      league_tier,
      league_name,
      player_id,
      full_name,
      coalesce(sum(stableford_points) filter (where rn <= 10 and stableford_points is not null), 0)::int as total_points
    from player_rounds
    group by league_tier, league_name, player_id, full_name
  )
  select
    s.league_tier,
    s.league_name,
    s.player_id,
    s.full_name,
    s.total_points,
    dense_rank() over (partition by s.league_tier order by s.total_points desc, s.full_name asc) as rank_no
  from scored s
  order by s.league_tier asc, rank_no asc, s.full_name asc;
$$;
