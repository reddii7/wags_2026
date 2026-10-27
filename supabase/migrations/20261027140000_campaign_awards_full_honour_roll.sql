-- Expand season awards beyond finals day: Best 14, four league winners, RS Cup.
-- Idempotent seed for Main Summer 2026 from live standings / cup final.

begin;

alter table public.campaign_awards
  drop constraint if exists campaign_awards_award_type_check;

alter table public.campaign_awards
  add constraint campaign_awards_award_type_check
  check (
    award_type in (
      'championship',
      'chumps',
      'best14',
      'league_1',
      'league_2',
      'league_3',
      'league_4',
      'rs_cup'
    )
  );

do $seed$
declare
  v_campaign uuid := 'f566e807-9e6e-4a20-bd3a-69378d04131e'::uuid;
begin
  if not exists (select 1 from public.campaigns where id = v_campaign) then
    raise notice 'full honour roll seed: Summer 2026 campaign missing — skipped';
    return;
  end if;

  -- Best 14 + four league winners from standings view
  with league_winners as (
    select
      tier,
      member_id,
      best_10_total,
      row_number() over (
        partition by tier
        order by best_10_total desc nulls last, full_name
      ) as rn
    from public.v_summer_standings
    where campaign_id = v_campaign
  ),
  best14 as (
    select
      member_id,
      best_14_total,
      row_number() over (
        order by best_14_total desc nulls last, full_name
      ) as rn
    from public.v_summer_standings
    where campaign_id = v_campaign
  ),
  cup as (
    select cm.winner_member_id as member_id
    from public.cup_matches cm
    join public.competitions comp on comp.id = cm.competition_id
    where comp.campaign_id = v_campaign
      and lower(coalesce(cm.stage_code, '')) = 'final'
      and cm.winner_member_id is not null
    order by cm.updated_at desc nulls last
    limit 1
  ),
  rows as (
    select
      v_campaign as campaign_id,
      ('league_' || tier::text) as award_type,
      member_id,
      format('Division %s winner · Best 10 = %s', tier, best_10_total) as notes
    from league_winners
    where rn = 1
    union all
    select
      v_campaign,
      'best14',
      member_id,
      format('Best 14 champion · total = %s', best_14_total)
    from best14
    where rn = 1
    union all
    select
      v_campaign,
      'rs_cup',
      member_id,
      'RS Cup 2026 champion'
    from cup
  )
  insert into public.campaign_awards (campaign_id, award_type, member_id, notes)
  select campaign_id, award_type, member_id, notes from rows
  on conflict (campaign_id, award_type) do update
    set member_id = excluded.member_id,
        notes = excluded.notes,
        updated_at = timezone('utc', now());
end
$seed$;

commit;
