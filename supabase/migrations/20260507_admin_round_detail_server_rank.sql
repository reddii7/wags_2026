-- Move admin results ranking to server-side output.
drop function if exists public.admin_get_round_detail(uuid);

create function public.admin_get_round_detail(p_round_id uuid)
returns table (
  rank_no integer,
  player_id uuid,
  full_name text,
  current_handicap numeric,
  entry_fee_paid numeric,
  is_eligible boolean,
  stableford_points integer,
  gross_score integer,
  has_snake boolean,
  has_camel boolean,
  score_entered boolean
)
language sql
stable
security definer
set search_path = wags, public
as $$
  with detail as (
    select
      p.id as player_id,
      p.full_name,
      coalesce(phs.handicap, p.starting_handicap) as current_handicap,
      re.entry_fee_paid,
      re.is_eligible,
      rs.stableford_points,
      rs.gross_score,
      coalesce(rs.has_snake, false) as has_snake,
      coalesce(rs.has_camel, false) as has_camel,
      (rs.id is not null) as score_entered
    from wags.round_entries re
    join wags.players p on p.id = re.player_id
    left join wags.player_handicap_state phs on phs.player_id = p.id
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
