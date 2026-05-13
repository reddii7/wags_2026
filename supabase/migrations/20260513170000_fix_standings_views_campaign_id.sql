-- Ensure standings/bank views expose campaign_id (fixes PostgREST .eq('campaign_id', …)
-- when an older v_summer_standings existed without that column).
-- Safe to re-run after 20260513160000 (idempotent replace).

begin;

drop view if exists public.v_summer_standings cascade;
create view public.v_summer_standings (
  campaign_id,
  campaign_label,
  campaign_year,
  member_id,
  full_name,
  tier,
  best_14_total
) as
select
  la.campaign_id,
  c.label as campaign_label,
  c.year as campaign_year,
  la.member_id,
  m.full_name,
  la.tier,
  coalesce(sum(rp_top.stableford_points), 0)::numeric as best_14_total
from public.league_assignments la
join public.campaigns c on c.id = la.campaign_id
join public.members m on m.id = la.member_id
left join lateral (
  select rp.stableford_points
  from public.round_players rp
  join public.rounds r on r.id = rp.round_id
  where rp.member_id = la.member_id
    and r.campaign_id = la.campaign_id
    and r.round_type = 'summer_weekly'
    and r.finalized = true
    and rp.entered = true
  order by rp.stableford_points desc
  limit 14
) rp_top on true
where c.kind = 'summer_main'
group by la.campaign_id, c.label, c.year, la.member_id, m.full_name, la.tier;

drop view if exists public.v_winter_standings cascade;
create view public.v_winter_standings (
  campaign_id,
  campaign_label,
  campaign_year,
  member_id,
  full_name,
  best_10_total
) as
select
  c.id as campaign_id,
  c.label as campaign_label,
  c.year as campaign_year,
  m.id as member_id,
  m.full_name,
  coalesce(sum(rp_top.stableford_points), 0)::numeric as best_10_total
from public.campaigns c
join lateral (
  select distinct rp.member_id
  from public.round_players rp
  join public.rounds r on r.id = rp.round_id
  where r.campaign_id = c.id
    and r.round_type = 'winter_weekly'
    and r.finalized = true
    and rp.entered = true
) mm on true
join public.members m on m.id = mm.member_id
left join lateral (
  select rp.stableford_points
  from public.round_players rp
  join public.rounds r on r.id = rp.round_id
  where rp.member_id = m.id
    and r.campaign_id = c.id
    and r.round_type = 'winter_weekly'
    and r.finalized = true
    and rp.entered = true
  order by rp.stableford_points desc
  limit 10
) rp_top on true
where c.kind = 'winter_reduced'
group by c.id, c.label, c.year, m.id, m.full_name;

drop view if exists public.v_bank_dashboard cascade;
create view public.v_bank_dashboard (
  campaign_id,
  campaign_label,
  campaign_year,
  total_bank_balance_pence
) as
select
  r.campaign_id,
  c.label as campaign_label,
  c.year as campaign_year,
  sum(wps.to_bank_pence)::bigint as total_bank_balance_pence
from public.weekly_prize_state wps
join public.rounds r on r.id = wps.round_id
join public.campaigns c on c.id = r.campaign_id
group by r.campaign_id, c.label, c.year;

commit;
