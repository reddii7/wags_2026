-- Winter (and other non-summer) campaigns can be opened as home/results without
-- member_handicap_state rows. Handicaps then render blank. Seed any open
-- winter_reduced campaign that still has zero MHS from the latest closed
-- summer_main that does have stored handicaps.

insert into public.member_handicap_state (campaign_id, member_id, handicap, updated_at)
select
  winter.id,
  mhs.member_id,
  mhs.handicap,
  timezone('utc', now())
from public.campaigns winter
cross join lateral (
  select summer.id as summer_id
  from public.campaigns summer
  where summer.kind = 'summer_main'
    and summer.status = 'closed'::public.campaign_status
    and exists (
      select 1
      from public.member_handicap_state s
      where s.campaign_id = summer.id
    )
  order by coalesce(summer.year, 0) desc, summer.start_date desc nulls last
  limit 1
) src
join public.member_handicap_state mhs
  on mhs.campaign_id = src.summer_id
where winter.kind = 'winter_reduced'
  and winter.status = 'open'::public.campaign_status
  and not exists (
    select 1
    from public.member_handicap_state existing
    where existing.campaign_id = winter.id
  )
on conflict (campaign_id, member_id) do update
  set handicap = excluded.handicap,
      updated_at = excluded.updated_at;
