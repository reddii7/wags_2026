-- Ensure API results rows are keyed by competition_id (not round_id)
-- so app competition filters return the expected records.

create or replace view public.public_results_view as
with ranked as (
  select
    re.round_id,
    rd.competition_id,
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
  join wags.rounds rd on rd.id = re.round_id
  where re.is_eligible = true
    and rd.status = 'finalized'
)
select
  gen_random_uuid() as id,
  r.competition_id,
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
