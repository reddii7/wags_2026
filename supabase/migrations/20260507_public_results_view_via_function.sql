-- Build public results through a SECURITY DEFINER function to guarantee stable
-- row visibility for edge/API consumers.

create or replace function public.fn_public_results_rows()
returns table (
  id uuid,
  competition_id uuid,
  user_id uuid,
  player text,
  score integer,
  snake boolean,
  camel boolean,
  has_snake boolean,
  has_camel boolean,
  rank_no integer
)
language sql
stable
security definer
set search_path = public, wags
as $$
  with public_comp_map as (
    select
      regexp_replace(c.name, '\s*-\s*week\s*1\s*$', '', 'i') as normalized_name,
      c.competition_date,
      c.season,
      min(c.id::text)::uuid as public_competition_id
    from public.competitions c
    group by regexp_replace(c.name, '\s*-\s*week\s*1\s*$', '', 'i'), c.competition_date, c.season
  ), ranked as (
    select
      re.round_id,
      pcm.public_competition_id as competition_id,
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
    join wags.competitions wc on wc.id = rd.competition_id
    join wags.seasons ws on ws.id = wc.season_id
    join public_comp_map pcm
      on pcm.normalized_name = regexp_replace(wc.name, '\s*-\s*week\s*1\s*$', '', 'i')
     and pcm.competition_date::date = wc.starts_on
     and pcm.season::text = ws.id::text
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
    r.rank_no
  from ranked r
  join wags.players p on p.id = r.player_id
  where r.competition_id is not null;
$$;

grant execute on function public.fn_public_results_rows() to anon, authenticated, service_role;

create or replace view public.public_results_view as
select
  id,
  competition_id,
  user_id,
  player,
  score,
  snake,
  camel,
  has_snake,
  has_camel,
  rank_no::bigint as position
from public.fn_public_results_rows();

grant select on public.public_results_view to anon, authenticated, service_role;
