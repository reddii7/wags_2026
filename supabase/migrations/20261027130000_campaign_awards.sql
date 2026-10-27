-- Season awards (Championship / Chumps) without requiring full finals scorecards.
-- Member app History tab + admin Season awards UI read/write this table.

begin;

create table if not exists public.campaign_awards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  award_type text not null
    check (award_type in ('championship', 'chumps')),
  member_id uuid not null references public.members (id) on delete restrict,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, award_type)
);

create index if not exists campaign_awards_campaign_id_idx
  on public.campaign_awards (campaign_id);

create index if not exists campaign_awards_member_id_idx
  on public.campaign_awards (member_id);

drop trigger if exists tr_campaign_awards_updated_at on public.campaign_awards;
create trigger tr_campaign_awards_updated_at
before update on public.campaign_awards
for each row execute function public.tg_set_updated_at();

alter table public.campaign_awards enable row level security;

grant select, insert, update, delete on public.campaign_awards to service_role;

-- Seed Summer 2026 honour winners when campaign + members exist (idempotent).
do $seed$
declare
  v_campaign uuid;
  v_broad uuid;
  v_blades uuid;
begin
  select id into v_campaign
  from public.campaigns
  where id = 'f566e807-9e6e-4a20-bd3a-69378d04131e'::uuid
  limit 1;

  if v_campaign is null then
    select id into v_campaign
    from public.campaigns
    where coalesce(year, extract(year from start_date)::int) = 2026
      and (
        coalesce(kind, '') = 'summer_main'
        or lower(coalesce(label, '')) like '%summer%2026%'
      )
    order by
      case when lower(coalesce(label, '')) like '%main%summer%' then 0 else 1 end,
      created_at desc
    limit 1;
  end if;

  if v_campaign is null then
    raise notice 'campaign_awards seed: Summer 2026 campaign not found — skipped';
    return;
  end if;

  -- Live roster spelling is "Chris Boards" (not Broad).
  select id into v_broad
  from public.members
  where lower(full_name) in (lower('Chris Boards'), lower('Chris Broad'))
     or lower(full_name) like 'chris%board%'
     or lower(full_name) like 'chris%broad%'
  order by case
    when lower(full_name) = lower('Chris Boards') then 0
    when lower(full_name) = lower('Chris Broad') then 1
    else 2
  end
  limit 1;

  select id into v_blades
  from public.members
  where lower(full_name) = lower('Paul Blades')
     or lower(full_name) like 'paul%blades%'
  order by case when lower(full_name) = lower('Paul Blades') then 0 else 1 end
  limit 1;

  if v_broad is null then
    raise notice 'campaign_awards seed: Chris Broad not found — championship skipped';
  else
    insert into public.campaign_awards (campaign_id, award_type, member_id, notes)
    values (v_campaign, 'championship', v_broad, 'Summer 2026 Championship winner')
    on conflict (campaign_id, award_type) do update
      set member_id = excluded.member_id,
          notes = excluded.notes,
          updated_at = timezone('utc', now());
  end if;

  if v_blades is null then
    raise notice 'campaign_awards seed: Paul Blades not found — chumps skipped';
  else
    insert into public.campaign_awards (campaign_id, award_type, member_id, notes)
    values (v_campaign, 'chumps', v_blades, 'Summer 2026 Chumps winner')
    on conflict (campaign_id, award_type) do update
      set member_id = excluded.member_id,
          notes = excluded.notes,
          updated_at = timezone('utc', now());
  end if;
end
$seed$;

commit;
