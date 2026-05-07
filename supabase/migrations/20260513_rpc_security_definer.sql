-- Fix: public RPCs access wags schema internally.
-- anon role has no USAGE on wags, so PostgREST calls fail with
-- "permission denied for schema wags".
-- SECURITY DEFINER makes them run as the function owner (postgres)
-- who has full access. search_path is pinned for safety.

create or replace function public.get_best_14_scores_by_season(p_season text)
returns table (
  user_id uuid,
  full_name text,
  best_total integer,
  rank_no integer
)
language sql
stable
security definer
set search_path = public, wags
as $$
  with resolved as (
    select s.id
    from wags.seasons s
    where s.id::text = p_season
       or s.start_year::text = p_season
    order by s.start_date desc
    limit 1
  )
  select
    b.player_id as user_id,
    b.full_name,
    b.total_best_points as best_total,
    b.rank_no
  from resolved r
  join wags.fn_get_best_scores(r.id, 'main_weekly', 14) b on true;
$$;

create or replace function public.get_league_standings_best10(p_season_id uuid)
returns table (
  user_id uuid,
  full_name text,
  league_name text,
  total_score integer,
  rank_no integer
)
language sql
stable
security definer
set search_path = public, wags
as $$
  select
    s.player_id as user_id,
    s.full_name,
    s.league_name,
    s.total_points as total_score,
    s.rank_no
  from wags.fn_get_league_standings(p_season_id) s;
$$;

create or replace function public.get_dashboard_overview(
  p_season_id uuid,
  p_competition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, wags
as $$
  select jsonb_build_object(
    'results', coalesce((
      select jsonb_agg(to_jsonb(prv) order by prv.position, prv.player)
      from public.public_results_view prv
      where prv.competition_id = p_competition_id
    ), '[]'::jsonb),
    'summary', (
      select to_jsonb(rs)
      from public.results_summary rs
      where rs.competition_id = p_competition_id
      limit 1
    )
  );
$$;

-- Grant execute to anon and authenticated roles
grant execute on function public.get_best_14_scores_by_season(text)      to anon, authenticated;
grant execute on function public.get_league_standings_best10(uuid)        to anon, authenticated;
grant execute on function public.get_dashboard_overview(uuid, uuid)       to anon, authenticated;

-- Also grant select on the public views to anon/authenticated
grant select on public.seasons                to anon, authenticated;
grant select on public.competitions           to anon, authenticated;
grant select on public.profiles               to anon, authenticated;
grant select on public.handicap_history       to anon, authenticated;
grant select on public.public_results_view    to anon, authenticated;
grant select on public.results_summary        to anon, authenticated;
grant select on public.rounds                 to anon, authenticated;
grant select on public.matchplay_tournaments  to anon, authenticated;
grant select on public.matchplay_matches      to anon, authenticated;
