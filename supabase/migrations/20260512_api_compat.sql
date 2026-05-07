-- API compatibility layer for current app contract.
-- This keeps the existing frontend/edge function payload shape while data lives in wags schema.

-- Seasons
create or replace view public.seasons as
select
  s.id,
  s.start_year,
  s.label as name,
  s.start_date,
  s.end_date,
  s.season_mode,
  s.is_active,
  s.created_at,
  s.updated_at
from wags.seasons s;

-- Profiles expected by app
create or replace view public.profiles as
with active_season as (
  select id
  from wags.seasons
  where is_active = true
  order by start_date desc
  limit 1
), hcap as (
  select
    phs.player_id,
    phs.handicap,
    row_number() over (partition by phs.player_id order by phs.updated_at desc) as rn
  from wags.player_handicap_state phs
)
select
  p.id,
  p.full_name,
  'member'::text as role,
  coalesce(sm.league_name, 'UNASSIGNED') as league_name,
  coalesce(h.handicap, p.starting_handicap, 20.0) as current_handicap
from wags.players p
left join active_season a on true
left join wags.season_memberships sm
  on sm.player_id = p.id and sm.season_id = a.id
left join hcap h
  on h.player_id = p.id and h.rn = 1;

-- Competitions-as-rounds projection for current app
create or replace view public.competitions as
with outcome as (
  select ro.*
  from wags.round_outcomes ro
  where ro.is_current = true
)
select
  r.id,
  c.name || ' - Week ' || r.round_no::text as name,
  r.round_date::text as competition_date,
  case when r.status = 'finalized' then 'closed' else 'open' end as status,
  case when o.winner_type = 'outright' then o.winner_player_ids[1] else null end as winner_id,
  coalesce(o.payout_amount, 0)::numeric(10,2) as prize_pot,
  (
    select coalesce(sum(fe.amount), 0)::numeric(10,2)
    from wags.finance_events fe
    where fe.season_id = r.season_id
      and fe.wallet = 'rollover_pool'
  ) as rollover_amount,
  r.season_id as season
from wags.rounds r
join wags.competitions c on c.id = r.competition_id
left join outcome o on o.round_id = r.id;

-- Results rows used across app screens
create or replace view public.public_results_view as
with ranked as (
  select
    re.round_id,
    re.player_id,
    rs.stableford_points,
    rs.has_snake,
    rs.has_camel,
    dense_rank() over (
      partition by re.round_id
      order by rs.stableford_points desc nulls last
    ) as rank_no
  from wags.round_entries re
  join wags.round_scores rs on rs.round_entry_id = re.id
  where re.is_eligible = true
)
select
  gen_random_uuid() as id,
  r.round_id as competition_id,
  r.player_id as user_id,
  p.full_name as player,
  r.stableford_points as score,
  r.has_snake as snake,
  r.has_camel as camel,
  r.has_snake,
  r.has_camel,
  r.rank_no as position
from ranked r
join wags.players p on p.id = r.player_id;

-- Summary rows used by home/results views
create or replace view public.results_summary as
with top_scores as (
  select
    prv.competition_id,
    max(prv.score) as winning_score
  from public.public_results_view prv
  group by prv.competition_id
), winners as (
  select
    prv.competition_id,
    array_agg(prv.player order by prv.player) as winner_names,
    array_agg(prv.user_id order by prv.player) as winner_ids,
    count(*)::int as winner_count
  from public.public_results_view prv
  join top_scores ts
    on ts.competition_id = prv.competition_id
   and ts.winning_score = prv.score
  group by prv.competition_id
)
select
  c.id as competition_id,
  case when w.winner_count is null then 'none'
       when w.winner_count = 1 then 'winner'
       else 'tie' end as winner_type,
  coalesce(w.winner_names, '{}'::text[]) as winner_names,
  coalesce(w.winner_ids, '{}'::uuid[]) as winner_ids,
  coalesce(c.prize_pot, 0)::numeric(10,2) as amount,
  coalesce((select count(*) from public.public_results_view prv where prv.competition_id = c.id), 0)::int as num_players,
  coalesce((select count(*) from public.public_results_view prv where prv.competition_id = c.id and prv.has_snake), 0)::int as snakes,
  coalesce((select count(*) from public.public_results_view prv where prv.competition_id = c.id and prv.has_camel), 0)::int as camels,
  row_number() over (partition by c.season order by c.competition_date)::int as week_number,
  c.competition_date as week_date,
  '{}'::text[] as second_names
from public.competitions c
left join winners w on w.competition_id = c.id;

-- Round-level rows for detail popups
create or replace view public.rounds as
select
  gen_random_uuid() as id,
  re.round_id as competition_id,
  re.player_id as user_id,
  rs.stableford_points as stableford_score
from wags.round_entries re
join wags.round_scores rs on rs.round_entry_id = re.id;

-- Handicap history feed
create or replace view public.handicap_history as
select
  he.id,
  he.player_id as user_id,
  he.source_round_id as competition_id,
  he.handicap_before as old_handicap,
  he.handicap_after as new_handicap,
  he.delta,
  he.created_at,
  r.round_date::text as competition_date
from wags.handicap_events he
left join wags.rounds r on r.id = he.source_round_id;

-- Matchplay passthrough
create or replace view public.matchplay_tournaments as
select * from wags.matchplay_tournaments;

create or replace view public.matchplay_matches as
select * from wags.matchplay_matches;

-- RPC compatibility: best 14 by season (main weekly)
create or replace function public.get_best_14_scores_by_season(p_season text)
returns table (
  user_id uuid,
  full_name text,
  best_total integer,
  rank_no integer
)
language sql
stable
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

-- RPC compatibility: league standings best 10
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
as $$
  select
    s.player_id as user_id,
    s.full_name,
    s.league_name,
    s.total_points as total_score,
    s.rank_no
  from wags.fn_get_league_standings(p_season_id) s;
$$;

-- RPC compatibility: dashboard overview payload
create or replace function public.get_dashboard_overview(
  p_season_id uuid,
  p_competition_id uuid
)
returns jsonb
language sql
stable
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
    ),
    'handicaps', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'full_name', p.full_name,
          'current_handicap', p.current_handicap
        )
      )
      from public.profiles p
    ), '[]'::jsonb)
  );
$$;
