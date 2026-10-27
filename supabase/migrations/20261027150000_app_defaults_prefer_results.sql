-- Prefer campaigns that actually have results for app defaults.
-- Never fall through to an empty draft summer (e.g. 2027) over a closed summer with data.

begin;

create or replace function public.admin_get_app_defaults()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'default_results_season_id',
    coalesce(
      -- 1) Open winter (active winter season)
      (
        select c.id::text
        from public.campaigns c
        where c.status = 'open'
          and c.kind = 'winter_reduced'
        order by c.year desc nulls last, c.start_date desc nulls last
        limit 1
      ),
      -- 2) Open summer with weekly rounds
      (
        select c.id::text
        from public.campaigns c
        where c.status = 'open'
          and c.kind = 'summer_main'
          and exists (
            select 1 from public.rounds r
            where r.campaign_id = c.id
              and r.round_type = 'summer_weekly'
          )
        order by c.year desc nulls last, c.start_date desc nulls last
        limit 1
      ),
      -- 3) Latest closed summer (honour roll / archive)
      (
        select c.id::text
        from public.campaigns c
        where c.status = 'closed'
          and c.kind = 'summer_main'
        order by c.year desc nulls last, c.end_date desc nulls last, c.start_date desc nulls last
        limit 1
      ),
      -- 4) Any open campaign
      (
        select c.id::text
        from public.campaigns c
        where c.status = 'open'
        order by c.start_date desc nulls last
        limit 1
      ),
      -- 5) Last resort: any non-draft campaign
      (
        select c.id::text
        from public.campaigns c
        where c.status <> 'draft'
        order by c.year desc nulls last, c.start_date desc nulls last
        limit 1
      )
    )
  );
$$;

grant execute on function public.admin_get_app_defaults() to anon;
grant execute on function public.admin_get_app_defaults() to authenticated;
grant execute on function public.admin_get_app_defaults() to service_role;

-- Ensure Winter 2026 exists and is open for the splash CTA.
insert into public.campaigns (label, kind, year, status, start_date)
select 'Winter 2026', 'winter_reduced', 2026, 'open', '2026-10-28'
where not exists (
  select 1 from public.campaigns
  where kind = 'winter_reduced' and year = 2026
);

update public.campaigns
set status = 'open',
    start_date = coalesce(start_date, '2026-10-28')
where kind = 'winter_reduced'
  and year = 2026
  and status <> 'open';

commit;
