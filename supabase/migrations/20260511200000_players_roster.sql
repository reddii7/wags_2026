-- =============================================================================
-- Upgrade path: migrate campaign_memberships → players when the old table exists.
-- Fresh installs use 20260511100000_greenfield_core_schema.sql only.
-- =============================================================================

begin;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  starting_handicap numeric(5, 1) not null,
  starting_league_tier smallint
    check (starting_league_tier is null or starting_league_tier between 1 and 4),
  starting_league_name text,
  is_eligible boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint uq_players_campaign_member unique (campaign_id, member_id)
);

create index if not exists idx_players_campaign on public.players (campaign_id);
create index if not exists idx_players_member on public.players (member_id);

drop trigger if exists tr_players_updated_at on public.players;
create trigger tr_players_updated_at
before update on public.players
for each row execute function public.tg_set_updated_at();

create or replace function public.tg_players_seed_member_handicap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.member_handicap_state (campaign_id, member_id, handicap)
  values (new.campaign_id, new.member_id, new.starting_handicap)
  on conflict (campaign_id, member_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tr_players_seed_handicap on public.players;
create trigger tr_players_seed_handicap
after insert on public.players
for each row execute function public.tg_players_seed_member_handicap();

do $$
begin
  if to_regclass('public.campaign_memberships') is not null then
    insert into public.players (
      campaign_id,
      member_id,
      starting_handicap,
      starting_league_tier,
      starting_league_name,
      is_eligible
    )
    select
      cm.campaign_id,
      cm.member_id,
      coalesce(mhs.handicap, 18.0),
      cm.league_tier,
      cm.league_name,
      cm.is_eligible
    from public.campaign_memberships cm
    left join public.member_handicap_state mhs
      on mhs.campaign_id = cm.campaign_id
      and mhs.member_id = cm.member_id
    on conflict (campaign_id, member_id) do nothing;

    drop table public.campaign_memberships cascade;
  end if;
end $$;

alter table public.players enable row level security;

commit;
