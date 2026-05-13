-- §4.2 summer end: promotion / relegation from Best-10 league scores within each tier.
-- Top 3 in tiers 2–4 promoted; bottom 3 in tiers 1–3 relegated (promotion wins on overlap).
-- Handicaps are NOT touched — members.handicap_index carries into the next season.

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
language plpgsql
stable
as $fn$
begin
  return query
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
      select member_id, stableford_points,
             row_number() over (partition by member_id order by stableford_points desc) as rn
      from rp_scores
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
end;
$fn$;


create or replace function public.preview_summer_pr(p_old_campaign uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'member_id', o.member_id,
        'full_name', o.full_name,
        'old_tier', o.old_tier,
        'best10_total', o.best10_total,
        'rank_in_tier', o.rank_in_tier,
        'n_in_tier', o.n_in_tier,
        'new_tier', o.new_tier,
        'movement', o.movement
      )
      order by o.old_tier, o.rank_in_tier
    ),
    '[]'::jsonb
  )
  from public.summer_pr_outcome(p_old_campaign) o;
$$;


create or replace function public.apply_summer_close_with_pr(
  p_old_campaign uuid,
  p_next_campaign uuid,
  p_effective_from date default current_date
)
returns jsonb
language plpgsql
security definer
as $fn$
declare
  v_rows integer;
begin
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_old_campaign and c.kind = 'summer_main'
  ) then
    raise exception 'Old campaign % must exist and be kind summer_main', p_old_campaign;
  end if;

  if not exists (select 1 from public.campaigns c where c.id = p_next_campaign) then
    raise exception 'Next campaign % not found', p_next_campaign;
  end if;

  if p_old_campaign = p_next_campaign then
    raise exception 'Old and next campaign must differ';
  end if;

  update public.campaigns
  set status = 'closed'::campaign_status
  where id = p_old_campaign;

  insert into public.league_assignments (campaign_id, member_id, tier, effective_from)
  select p_next_campaign, o.member_id, o.new_tier, p_effective_from
  from public.summer_pr_outcome(p_old_campaign) o
  on conflict (campaign_id, member_id) do update
    set tier = excluded.tier,
        effective_from = excluded.effective_from;

  get diagnostics v_rows = row_count;

  update public.campaigns
  set status = 'open'::campaign_status
  where id = p_next_campaign and status = 'draft'::campaign_status;

  return jsonb_build_object(
    'ok', true,
    'league_assignments_upserted', v_rows,
    'handicap_note', 'Member handicaps unchanged — they carry forward from the last round.'
  );
end;
$fn$;

grant execute on function public.summer_pr_outcome(uuid) to authenticated;
grant execute on function public.summer_pr_outcome(uuid) to service_role;
grant execute on function public.preview_summer_pr(uuid) to authenticated;
grant execute on function public.preview_summer_pr(uuid) to service_role;
grant execute on function public.apply_summer_close_with_pr(uuid, uuid, date) to authenticated;
grant execute on function public.apply_summer_close_with_pr(uuid, uuid, date) to service_role;
