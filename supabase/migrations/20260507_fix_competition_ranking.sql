-- Use competition ranking semantics (1,2,3,3,5) across results and leaderboard functions.

create or replace view public.public_results_view as
with ranked as (
  select
    re.round_id,
    re.player_id,
    rs.stableford_points,
    rs.has_snake,
    rs.has_camel,
    rank() over (
      partition by re.round_id
      order by rs.stableford_points desc nulls last
    ) as rank_no
  from wags.round_entries re
  join wags.round_scores rs on rs.round_entry_id = re.id
  where re.is_eligible = true
)
select
  gen_random_uuid() as id,
  r.round_id as competition_id,
  r.player_id as user_id,
  p.full_name as player,
  r.stableford_points as score,
  r.has_snake as snake,
  r.has_camel as camel,
  r.has_snake,
  r.has_camel,
  r.rank_no as position
from ranked r
join wags.players p on p.id = r.player_id;

create or replace function wags.fn_get_best_scores(
  p_season_id uuid,
  p_competition_type wags.competition_type,
  p_take integer
)
returns table (
  player_id uuid,
  full_name text,
  rounds_count integer,
  total_best_points integer,
  rank_no integer
)
language sql
stable
as $$
  with scored as (
    select
      re.player_id,
      p.full_name,
      rs.stableford_points,
      row_number() over (
        partition by re.player_id
        order by rs.stableford_points desc, rd.round_date asc
      ) as rn
    from wags.rounds rd
    join wags.competitions c on c.id = rd.competition_id
    join wags.round_entries re on re.round_id = rd.id
    join wags.round_scores rs on rs.round_entry_id = re.id
    join wags.players p on p.id = re.player_id
    where rd.season_id = p_season_id
      and rd.status = 'finalized'
      and c.competition_type = p_competition_type
      and re.is_eligible = true
      and rs.stableford_points is not null
  ), agg as (
    select
      player_id,
      max(full_name) as full_name,
      count(*) filter (where rn <= p_take) as rounds_count,
      coalesce(sum(stableford_points) filter (where rn <= p_take), 0) as total_best_points
    from scored
    group by player_id
  )
  select
    a.player_id,
    a.full_name,
    a.rounds_count,
    a.total_best_points,
    rank() over (order by a.total_best_points desc) as rank_no
  from agg a
  order by rank_no, a.full_name;
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
    rank() over (partition by s.league_tier order by s.total_points desc) as rank_no
  from scored s
  order by s.league_tier asc, rank_no asc, s.full_name asc;
$$;
