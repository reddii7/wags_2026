-- Initialize 2026 season handicaps from 2025 final state
-- This ensures handicaps roll forward correctly at the season boundary

create or replace function public.admin_init_season_handicaps_from_prior(
  p_new_season_id uuid,
  p_prior_season_id uuid
)
returns table(player_id uuid, full_name text, prior_final_hcp numeric, new_initial_hcp numeric)
language plpgsql security definer set search_path = wags, public as $$
begin
  -- Copy handicap state from prior season to new season for all matching players
  return query
  with copied as (
    insert into wags.player_handicap_state (player_id, season_id, handicap, last_event_id, updated_at)
    select
      p.id,
      p_new_season_id,
      phs_prior.handicap,
      null,
      now()
    from wags.players p
    join wags.player_handicap_state phs_prior
      on phs_prior.player_id = p.id
      and phs_prior.season_id = p_prior_season_id
    on conflict on constraint player_handicap_state_pkey do update
    set handicap = excluded.handicap,
        last_event_id = null,
        updated_at = now()
    returning
      wags.player_handicap_state.player_id as copied_player_id,
      wags.player_handicap_state.handicap as copied_handicap
  )
  select
    p.id as player_id,
    p.full_name,
    phs_prior.handicap as prior_final_hcp,
    copied.copied_handicap as new_initial_hcp
  from copied
  join wags.players p on p.id = copied.copied_player_id
  join wags.player_handicap_state phs_prior
    on phs_prior.player_id = copied.copied_player_id
   and phs_prior.season_id = p_prior_season_id
  order by p.full_name;
end;
$$;

grant execute on function public.admin_init_season_handicaps_from_prior(uuid, uuid)
  to service_role, authenticated;
