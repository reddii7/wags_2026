create or replace function public.admin_list_players(p_season_id uuid default null)
returns table(
  id uuid,
  full_name text,
  status text,
  starting_handicap numeric,
  current_handicap numeric,
  league_name text
)
language sql
stable
security definer
set search_path = wags, public
as $$
  with target as (
    select coalesce(
      p_season_id,
      (select s.id from wags.seasons s where s.is_active order by s.start_year desc limit 1),
      (select s.id from wags.seasons s order by s.start_year desc limit 1)
    ) as season_id
  )
  select
    p.id,
    p.full_name,
    p.status,
    p.starting_handicap,
    coalesce(phs.handicap, p.starting_handicap) as current_handicap,
    coalesce(sm.league_name, 'UNASSIGNED') as league_name
  from wags.players p
  cross join target t
  left join wags.player_handicap_state phs
    on phs.player_id = p.id
   and phs.season_id = t.season_id
  left join wags.season_memberships sm
    on sm.player_id = p.id
   and sm.season_id = t.season_id
  order by p.full_name;
$$;
