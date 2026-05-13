-- Fix: RETURNS TABLE + plpgsql made output param names (e.g. member_id) shadow SQL columns → ERROR 42702.

create or replace function public.summer_pr_outcome(p_old_campaign uuid)
returns table (
  member_id uuid,
  full_name text,
  old_tier integer,
  best10_total numeric,
  rank_in_tier bigint,
  n_in_tier bigint,
  new_tier integer,
  movement text
)
language sql
stable
as $fn$
  with
  rp_scores as (
    select rp.member_id, rp.stableford_points::numeric as stableford_points
    from public.round_players rp
    join public.rounds r on r.id = rp.round_id
    where r.campaign_id = p_old_campaign
      and r.round_type = 'summer_weekly'
      and r.finalized = true
      and rp.entered = true
  ),
  top10 as (
    select s.member_id, sum(s.stableford_points) as best10_total
    from (
      select rs.member_id, rs.stableford_points,
             row_number() over (partition by rs.member_id order by rs.stableford_points desc) as rn
      from rp_scores rs
    ) s
    where s.rn <= 10
    group by s.member_id
  ),
  roster as (
    select la.member_id, m.full_name, la.tier::integer as tier,
           coalesce(t.best10_total, 0)::numeric as best10_total
    from public.league_assignments la
    join public.members m on m.id = la.member_id
    left join top10 t on t.member_id = la.member_id
    where la.campaign_id = p_old_campaign
  ),
  ranked as (
    select
      roster.member_id,
      roster.full_name,
      roster.tier,
      roster.best10_total,
      row_number() over (partition by roster.tier order by roster.best10_total desc, roster.full_name) as rnk,
      count(*) over (partition by roster.tier) as n_in_tier
    from roster
  ),
  promo as (
    select r.member_id, r.tier, (r.tier - 1)::integer as new_tier
    from ranked r
    where r.tier in (2, 3, 4) and r.rnk <= 3
  ),
  releg as (
    select r.member_id, r.tier, (r.tier + 1)::integer as new_tier
    from ranked r
    where r.tier in (1, 2, 3)
      and r.rnk > r.n_in_tier - 3
      and not exists (
        select 1 from promo p where p.member_id = r.member_id and p.tier = r.tier
      )
  ),
  merged as (
    select
      rk.member_id,
      rk.full_name,
      rk.tier as old_tier,
      rk.best10_total,
      rk.rnk::bigint as rank_in_tier,
      rk.n_in_tier::bigint as n_in_tier,
      case
        when p.member_id is not null then p.new_tier
        when g.member_id is not null then g.new_tier
        else rk.tier
      end::integer as new_tier,
      case
        when p.member_id is not null then 'promoted'::text
        when g.member_id is not null then 'relegated'::text
        else 'same'::text
      end as movement
    from ranked rk
    left join promo p on p.member_id = rk.member_id
    left join releg g on g.member_id = rk.member_id
  )
  select
    merged.member_id,
    merged.full_name,
    merged.old_tier,
    merged.best10_total,
    merged.rank_in_tier,
    merged.n_in_tier,
    merged.new_tier,
    merged.movement
  from merged
  order by merged.old_tier, merged.rank_in_tier;
$fn$;
