-- Align live DB with RPCs + Edge after manual / partial applies.

begin;

-- get_member_* and finalize paths filter active rows by superseded_at
alter table public.weekly_prize_state
  add column if not exists superseded_at timestamptz;

create index if not exists idx_weekly_prize_state_round_active
  on public.weekly_prize_state (round_id)
  where superseded_at is null;

-- fetch-all-data calls this; safe no-op defaulting to latest open campaign
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
      (
        select c.id::text
        from public.campaigns c
        where c.status = 'open'
        order by c.start_date desc nulls last
        limit 1
      ),
      (
        select c.id::text
        from public.campaigns c
        order by c.start_date desc nulls last
        limit 1
      )
    )
  );
$$;

grant execute on function public.admin_get_app_defaults() to anon;
grant execute on function public.admin_get_app_defaults() to authenticated;
grant execute on function public.admin_get_app_defaults() to service_role;

-- Edge reads current handicap per default campaign (table missing on some installs)
create table if not exists public.member_handicap_state (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  handicap numeric(5, 1) not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, member_id)
);

create index if not exists idx_member_handicap_state_campaign
  on public.member_handicap_state (campaign_id);

commit;
