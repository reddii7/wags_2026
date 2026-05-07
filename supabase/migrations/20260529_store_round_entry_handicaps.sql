-- Add handicap_at_entry to round_entries to track the handicap used at that round
-- This fixes the issue where viewing historic round leaderboards was showing current handicaps

alter table wags.round_entries add column if not exists handicap_at_entry numeric;

-- Add comment for clarity
comment on column wags.round_entries.handicap_at_entry is
  'Handicap value in effect when this player entered the round. Populated at entry time and preserved for history.';

-- Create index for efficient lookups
create index if not exists idx_round_entries_handicap on wags.round_entries(handicap_at_entry);

-- Backfill existing round entries with their player_handicap_state at time of entry
-- We'll use the current handicap as fallback (best we can do without historical tracking)
update wags.round_entries re
set handicap_at_entry = coalesce(
  (select phs.handicap
   from wags.rounds r
   join wags.player_handicap_state phs
     on phs.player_id = re.player_id
    and phs.season_id = r.season_id
   where r.id = re.round_id
   limit 1),
  (select p.starting_handicap
   from wags.players p
   where p.id = re.player_id
   limit 1),
  0
)
where handicap_at_entry is null;

-- Drop and recreate admin_get_round_detail to use stored handicap
drop function if exists public.admin_get_round_detail(uuid);

create function public.admin_get_round_detail(p_round_id uuid)
returns table (
  rank_no integer,
  player_id uuid, full_name text, current_handicap numeric,
  entry_fee_paid numeric, is_eligible boolean,
  stableford_points integer, gross_score integer,
  has_snake boolean, has_camel boolean, score_entered boolean
)
language sql stable security definer set search_path = wags, public as $$
  with detail as (
    select
      p.id as player_id,
      p.full_name,
      coalesce(re.handicap_at_entry, phs.handicap, p.starting_handicap) as current_handicap,
      re.entry_fee_paid,
      re.is_eligible,
      rs.stableford_points,
      rs.gross_score,
      coalesce(rs.has_snake, false) as has_snake,
      coalesce(rs.has_camel, false) as has_camel,
      (rs.id is not null) as score_entered
    from wags.round_entries re
    join wags.rounds r on r.id = re.round_id
    join wags.players p on p.id = re.player_id
    left join wags.player_handicap_state phs
      on phs.player_id = p.id
     and phs.season_id = r.season_id
    left join wags.round_scores rs on rs.round_entry_id = re.id
    where re.round_id = p_round_id
  )
  select
    case
      when d.stableford_points is null then null
      else rank() over (order by d.stableford_points desc nulls last)
    end as rank_no,
    d.player_id,
    d.full_name,
    d.current_handicap,
    d.entry_fee_paid,
    d.is_eligible,
    d.stableford_points,
    d.gross_score,
    d.has_snake,
    d.has_camel,
    d.score_entered
  from detail d
  order by rank_no nulls last, d.full_name asc;
$$;

grant execute on function public.admin_get_round_detail(uuid) to service_role, authenticated;

-- Update admin_set_round_entry to capture handicap at entry time
drop function if exists public.admin_set_round_entry(uuid, uuid, numeric);

create function public.admin_set_round_entry(
  p_round_id uuid,
  p_player_id uuid,
  p_entry_fee_paid numeric default 0
)
returns void language plpgsql security definer set search_path = wags, public as $$
declare
  v_entry_id uuid;
  v_current_handicap numeric;
  v_round_season_id uuid;
begin
  select r.season_id
  into v_round_season_id
  from wags.rounds r
  where r.id = p_round_id;

  -- Get player's current handicap for this entry
  select coalesce(phs.handicap, p.starting_handicap)
  into v_current_handicap
  from wags.players p
  left join wags.player_handicap_state phs
    on phs.player_id = p.id
   and phs.season_id = v_round_season_id
  where p.id = p_player_id
  limit 1;

  -- Insert or update the round entry
  insert into wags.round_entries (round_id, player_id, entry_fee_paid, handicap_at_entry)
  values (p_round_id, p_player_id, p_entry_fee_paid, v_current_handicap)
  on conflict (round_id, player_id) do update
  set
    entry_fee_paid = excluded.entry_fee_paid,
    handicap_at_entry = excluded.handicap_at_entry
  returning id into v_entry_id;

  -- Ensure entry is marked eligible
  update wags.round_entries
  set is_eligible = true
  where id = v_entry_id;
end;
$$;

grant execute on function public.admin_set_round_entry(uuid, uuid, numeric) to service_role, authenticated;
