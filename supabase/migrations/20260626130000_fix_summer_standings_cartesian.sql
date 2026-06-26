-- Fix v_summer_standings: dual lateral joins multiplied totals (14×10 cross product).
-- Compute best 14 and best 10 from one ranked score set per member.

begin;

drop view if exists public.v_summer_standings cascade;
create view public.v_summer_standings (
  campaign_id,
  campaign_label,
  campaign_year,
  member_id,
  full_name,
  tier,
  best_14_total,
  best_10_total
) as
select
  la.campaign_id,
  c.label as campaign_label,
  c.year as campaign_year,
  la.member_id,
  m.full_name,
  la.tier,
  coalesce(totals.best_14_total, 0)::numeric as best_14_total,
  coalesce(totals.best_10_total, 0)::numeric as best_10_total
from public.league_assignments la
join public.campaigns c on c.id = la.campaign_id
join public.members m on m.id = la.member_id
left join lateral (
  select
    coalesce(sum(case when ranked.rn <= 14 then ranked.stableford_points end), 0) as best_14_total,
    coalesce(sum(case when ranked.rn <= 10 then ranked.stableford_points end), 0) as best_10_total
  from (
    select
      rp.stableford_points,
      row_number() over (order by rp.stableford_points desc) as rn
    from public.round_players rp
    join public.rounds r on r.id = rp.round_id
    where rp.member_id = la.member_id
      and r.campaign_id = la.campaign_id
      and r.round_type = 'summer_weekly'
      and r.finalized = true
      and rp.entered = true
  ) ranked
) totals on true
where c.kind = 'summer_main';

commit;
