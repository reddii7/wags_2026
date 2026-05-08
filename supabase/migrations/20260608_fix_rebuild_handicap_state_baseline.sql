-- Fix handicap state rebuild baseline to respect season carry-over.
-- Previous logic always used players.starting_handicap, which ignores
-- season initialization from prior-year final handicaps.

create or replace function wags.fn_rebuild_player_handicap_state(
  p_season_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
as $$
declare
  v_base numeric(6,2);
  v_delta_sum numeric(10,2);
  v_new numeric(6,2);
  v_last_event uuid;
begin
  -- Prefer the first event's handicap_before as canonical season baseline.
  select he.handicap_before
    into v_base
  from wags.handicap_events he
  where he.season_id = p_season_id
    and he.player_id = p_player_id
  order by he.created_at asc, he.id asc
  limit 1;

  -- If no events yet, preserve any existing season state baseline.
  if v_base is null then
    select phs.handicap
      into v_base
    from wags.player_handicap_state phs
    where phs.season_id = p_season_id
      and phs.player_id = p_player_id;
  end if;

  -- Final fallback for brand-new players with no season state.
  if v_base is null then
    select coalesce(p.starting_handicap, 20.00)
      into v_base
    from wags.players p
    where p.id = p_player_id;
  end if;

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

  v_new := round((v_base + v_delta_sum)::numeric, 2);

  insert into wags.player_handicap_state (season_id, player_id, handicap, last_event_id)
  values (p_season_id, p_player_id, v_new, v_last_event)
  on conflict (season_id, player_id)
  do update set
    handicap = excluded.handicap,
    last_event_id = excluded.last_event_id,
    updated_at = timezone('utc', now());
end;
$$;
