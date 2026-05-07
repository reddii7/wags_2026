-- Hotfix: replace uuid-unsafe aggregate in handicap state rebuild.
-- Required before running seed/finalize smoke migration on some Postgres builds.

create or replace function wags.fn_rebuild_player_handicap_state(
  p_season_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
as $$
declare
  v_start numeric(6,2);
  v_delta_sum numeric(10,2);
  v_new numeric(6,2);
  v_last_event uuid;
begin
  select coalesce(p.starting_handicap, 20.00) into v_start
  from wags.players p
  where p.id = p_player_id;

  select coalesce(sum(he.delta), 0)
    into v_delta_sum
  from wags.handicap_events he
  where he.season_id = p_season_id
    and he.player_id = p_player_id;

  select he.id
    into v_last_event
  from wags.handicap_events he
  where he.season_id = p_season_id
    and he.player_id = p_player_id
  order by he.created_at desc, he.id desc
  limit 1;

  v_new := round((v_start + v_delta_sum)::numeric, 2);

  insert into wags.player_handicap_state (season_id, player_id, handicap, last_event_id)
  values (p_season_id, p_player_id, v_new, v_last_event)
  on conflict (season_id, player_id)
  do update set
    handicap = excluded.handicap,
    last_event_id = excluded.last_event_id,
    updated_at = timezone('utc', now());
end;
$$;
