-- Fix admin_set_membership for schema without season_memberships.updated_at.
create or replace function public.admin_set_membership(
  p_season_id uuid,
  p_player_id uuid,
  p_league_name text
)
returns void
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  v_league_name text := trim(coalesce(p_league_name, ''));
  v_league_tier smallint;
begin
  v_league_tier := case upper(v_league_name)
    when 'PREMIERSHIP' then 1
    when 'CHAMPIONSHIP' then 2
    when 'LEAGUE ONE' then 3
    when 'LEAGUE TWO' then 4
    when 'LEAGUE 1' then 1
    when 'LEAGUE 2' then 2
    when 'LEAGUE 3' then 3
    when 'LEAGUE 4' then 4
    else null
  end;

  insert into wags.season_memberships (season_id, player_id, league_name, league_tier)
  values (
    p_season_id,
    p_player_id,
    nullif(v_league_name, ''),
    v_league_tier
  )
  on conflict (season_id, player_id)
  do update set
    league_name = excluded.league_name,
    league_tier = excluded.league_tier,
    is_eligible = coalesce(wags.season_memberships.is_eligible, true);
end;
$$;
