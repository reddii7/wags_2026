-- For tie (rollover) weeks, expose the rolled weekly allocation in results_summary.amount
-- so hero text can display the rollover value instead of £0.00.

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
    count(*)::integer as winner_count
  from public.public_results_view prv
  join top_scores ts
    on ts.competition_id = prv.competition_id
   and ts.winning_score = prv.score
  group by prv.competition_id
), outcomes as (
  select
    ro.round_id,
    ro.weekly_allocation,
    ro.payout_amount
  from wags.round_outcomes ro
  where ro.is_current = true
)
select
  c.id as competition_id,
  case
    when w.winner_count is null then 'none'
    when w.winner_count = 1 then 'winner'
    else 'tie'
  end as winner_type,
  coalesce(w.winner_names, '{}'::text[]) as winner_names,
  coalesce(w.winner_ids, '{}'::uuid[]) as winner_ids,
  (
    case
      when w.winner_count > 1 then coalesce(o.weekly_allocation, 0)
      when w.winner_count = 1 then coalesce(o.payout_amount, c.prize_pot, 0)
      else 0
    end
  )::numeric(10,2) as amount,
  coalesce(
    (
      select count(*)
      from public.public_results_view prv
      where prv.competition_id = c.id
    ),
    0
  )::integer as num_players,
  coalesce(
    (
      select count(*)
      from public.public_results_view prv
      where prv.competition_id = c.id
        and prv.has_snake
    ),
    0
  )::integer as snakes,
  coalesce(
    (
      select count(*)
      from public.public_results_view prv
      where prv.competition_id = c.id
        and prv.has_camel
    ),
    0
  )::integer as camels,
  row_number() over (
    partition by c.season
    order by c.competition_date
  )::integer as week_number,
  c.competition_date as week_date,
  '{}'::text[] as second_names
from public.competitions c
left join winners w
  on w.competition_id = c.id
left join outcomes o
  on o.round_id = c.id;
