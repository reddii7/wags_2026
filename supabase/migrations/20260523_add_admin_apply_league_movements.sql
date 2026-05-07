-- Apply end-of-season league movement using final standings:
-- top 3 promoted and bottom 3 relegated between adjacent leagues.
create or replace function public.admin_apply_league_movements(
  p_from_season_id uuid,
  p_to_season_id uuid
)
returns integer
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  v_updated integer := 0;
begin
  with standings as (
    select
      s.player_id,
      s.league_tier,
      s.rank_no,
      count(*) over (partition by s.league_tier) as tier_size
    from wags.fn_get_league_standings(p_from_season_id) s
    where s.league_tier between 1 and 4
  ), movement as (
    select
      player_id,
      case
        when league_tier = 1 and tier_size > 6 and rank_no > tier_size - 3 then 2
        when league_tier = 2 and tier_size > 6 and rank_no <= 3 then 1
        when league_tier = 2 and tier_size > 6 and rank_no > tier_size - 3 then 3
        when league_tier = 3 and tier_size > 6 and rank_no <= 3 then 2
        when league_tier = 3 and tier_size > 6 and rank_no > tier_size - 3 then 4
        when league_tier = 4 and tier_size > 6 and rank_no <= 3 then 3
        else league_tier
      end as new_tier
    from standings
  ), upserted as (
    insert into wags.season_memberships (season_id, player_id, league_tier, league_name, is_eligible)
    select
      p_to_season_id,
      m.player_id,
      m.new_tier,
      case m.new_tier
        when 1 then 'PREMIERSHIP'
        when 2 then 'CHAMPIONSHIP'
        when 3 then 'LEAGUE ONE'
        when 4 then 'LEAGUE TWO'
        else null
      end,
      true
    from movement m
    on conflict (season_id, player_id) do update set
      league_tier = excluded.league_tier,
      league_name = excluded.league_name,
      is_eligible = true
    returning 1
  )
  select count(*) into v_updated from upserted;

  return v_updated;
end;
$$;

grant execute on function public.admin_apply_league_movements(uuid, uuid) to service_role;
