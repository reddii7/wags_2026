create or replace function public.get_player_top_rounds(
  p_season_id uuid,
  p_player_id uuid,
  p_take integer default 10
)
returns table(
  competition_id uuid,
  competition_name text,
  competition_date date,
  stableford_score integer
)
language sql
stable
security definer
set search_path = wags, public
as $$
  select
    c.id as competition_id,
    regexp_replace(c.name, '\s*-\s*week\s*1\s*$', '', 'i') as competition_name,
    c.starts_on as competition_date,
    rs.stableford_points as stableford_score
  from wags.round_entries re
  join wags.round_scores rs on rs.round_entry_id = re.id
  join wags.rounds r on r.id = re.round_id
  join wags.competitions c on c.id = r.competition_id
  where r.season_id = p_season_id
    and re.player_id = p_player_id
    and re.is_eligible = true
    and r.status = 'finalized'
    and rs.stableford_points is not null
  order by rs.stableford_points desc, c.starts_on desc, c.id
  limit greatest(coalesce(p_take, 10), 0);
$$;

grant execute on function public.get_player_top_rounds(uuid, uuid, integer)
  to anon, authenticated, service_role;
