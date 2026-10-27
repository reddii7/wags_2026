-- Winter Scores: committee helpers can enter net Stableford for winter_weekly
-- rounds without the main admin service_role key.
-- Gate: members.is_winter_scorer (set in main admin Members).

alter table public.members
  add column if not exists is_winter_scorer boolean not null default false;

comment on column public.members.is_winter_scorer is
  'When true, member may use the Winter Scores app (net points / snake / camel only).';

create or replace function public.assert_winter_scorer()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  select coalesce(m.is_winter_scorer, false)
  into v_ok
  from public.members m
  where m.id = v_uid;

  if not coalesce(v_ok, false) then
    raise exception 'Winter scorer access required';
  end if;

  return v_uid;
end;
$$;

revoke all on function public.assert_winter_scorer() from public, anon, authenticated;
grant execute on function public.assert_winter_scorer() to service_role;

create or replace function public.winter_scorer_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_member public.members%rowtype;
  v_rounds jsonb;
begin
  v_uid := public.assert_winter_scorer();

  select * into v_member from public.members where id = v_uid;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_key desc, x.round_date desc), '[]'::jsonb)
  into v_rounds
  from (
    select
      r.id,
      r.name,
      r.round_date,
      r.round_type,
      r.finalized,
      r.campaign_id,
      r.play_order,
      c.label as campaign_label,
      c.kind as campaign_kind,
      coalesce(r.play_order, 0) as sort_key
    from public.rounds r
    join public.campaigns c on c.id = r.campaign_id
    where r.round_type = 'winter_weekly'
      and c.kind = 'winter_reduced'
  ) x;

  return jsonb_build_object(
    'scorer', jsonb_build_object(
      'id', v_member.id,
      'full_name', v_member.full_name
    ),
    'rounds', v_rounds
  );
end;
$$;

grant execute on function public.winter_scorer_session() to authenticated;
grant execute on function public.winter_scorer_session() to service_role;

create or replace function public.winter_scorer_get_sheet(p_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_round public.rounds%rowtype;
  v_campaign public.campaigns%rowtype;
  v_roster jsonb;
  v_scores jsonb;
begin
  v_uid := public.assert_winter_scorer();

  if p_round_id is null then
    raise exception 'Round is required';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.round_type is distinct from 'winter_weekly' then
    raise exception 'Only winter_weekly rounds can be scored here';
  end if;

  select * into v_campaign from public.campaigns where id = v_round.campaign_id;
  if not found or v_campaign.kind is distinct from 'winter_reduced' then
    raise exception 'Round is not on a winter campaign';
  end if;

  -- Roster: players → league_assignments → prior winter entrants → active members
  with players_roster as (
    select distinct p.member_id, m.full_name
    from public.players p
    join public.members m on m.id = p.member_id
    where p.campaign_id = v_round.campaign_id
      and p.is_eligible is distinct from false
      and m.full_name is not null
  ),
  league_roster as (
    select distinct la.member_id, m.full_name
    from public.league_assignments la
    join public.members m on m.id = la.member_id
    where la.campaign_id = v_round.campaign_id
      and m.full_name is not null
  ),
  prior_roster as (
    select distinct rp.member_id, m.full_name
    from public.round_players rp
    join public.rounds r on r.id = rp.round_id
    join public.members m on m.id = rp.member_id
    where r.campaign_id = v_round.campaign_id
      and m.full_name is not null
  ),
  all_members as (
    select m.id as member_id, m.full_name
    from public.members m
    where m.full_name is not null
      and coalesce(m.status, 'active') = 'active'
  ),
  source as (
    select 1 as priority, * from players_roster
    union all
    select 2, * from league_roster
    union all
    select 3, * from prior_roster
    union all
    select 4, * from all_members
  ),
  best as (
    select min(priority) as priority from source
  ),
  picked as (
    select distinct s.member_id, s.full_name
    from source s
    join best b on b.priority = s.priority
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('member_id', p.member_id, 'full_name', p.full_name)
      order by p.full_name
    ),
    '[]'::jsonb
  )
  into v_roster
  from picked p;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', rp.id,
        'member_id', rp.member_id,
        'stableford_points', rp.stableford_points,
        'entry_fee_pence', rp.entry_fee_pence,
        'entered', rp.entered
      )
    ),
    '[]'::jsonb
  )
  into v_scores
  from public.round_players rp
  where rp.round_id = p_round_id;

  return jsonb_build_object(
    'round', jsonb_build_object(
      'id', v_round.id,
      'name', v_round.name,
      'round_date', v_round.round_date,
      'round_type', v_round.round_type,
      'finalized', v_round.finalized,
      'campaign_id', v_round.campaign_id,
      'play_order', v_round.play_order,
      'campaign_label', v_campaign.label
    ),
    'roster', v_roster,
    'scores', v_scores
  );
end;
$$;

grant execute on function public.winter_scorer_get_sheet(uuid) to authenticated;
grant execute on function public.winter_scorer_get_sheet(uuid) to service_role;

create or replace function public.winter_scorer_upsert_scores(
  p_round_id uuid,
  p_scores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_round public.rounds%rowtype;
  v_campaign_kind text;
  v_row jsonb;
  v_member_id uuid;
  v_points integer;
  v_fee integer;
  v_count integer := 0;
begin
  v_uid := public.assert_winter_scorer();

  if p_round_id is null then
    raise exception 'Round is required';
  end if;

  if p_scores is null or jsonb_typeof(p_scores) <> 'array' then
    raise exception 'Scores must be a JSON array';
  end if;

  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found';
  end if;

  if v_round.round_type is distinct from 'winter_weekly' then
    raise exception 'Only winter_weekly rounds can be scored here';
  end if;

  select c.kind into v_campaign_kind
  from public.campaigns c
  where c.id = v_round.campaign_id;

  if v_campaign_kind is distinct from 'winter_reduced' then
    raise exception 'Round is not on a winter campaign';
  end if;

  if coalesce(v_round.finalized, false) then
    raise exception 'Round is finalized — reopen in main admin before editing';
  end if;

  -- Winter §9: net Stableford + £5 entry only. No snake/camel fines (collect_fines=false).
  for v_row in select * from jsonb_array_elements(p_scores)
  loop
    v_member_id := nullif(v_row->>'member_id', '')::uuid;
    if v_member_id is null then
      raise exception 'Each score row needs member_id';
    end if;

    if not exists (select 1 from public.members m where m.id = v_member_id) then
      raise exception 'Unknown member %', v_member_id;
    end if;

    if v_row ? 'stableford_points' and nullif(v_row->>'stableford_points', '') is not null then
      v_points := (v_row->>'stableford_points')::integer;
    else
      continue;
    end if;

    if v_points < 0 or v_points > 60 then
      raise exception 'Points must be between 0 and 60';
    end if;

    v_fee := coalesce(nullif(v_row->>'entry_fee_pence', '')::integer, 500);

    insert into public.round_players as rp (
      round_id,
      member_id,
      stableford_points,
      snake_count,
      camel_count,
      entry_fee_pence,
      entered,
      disqualified
    )
    values (
      p_round_id,
      v_member_id,
      v_points,
      0,
      0,
      v_fee,
      true,
      false
    )
    on conflict (round_id, member_id) do update
    set
      stableford_points = excluded.stableford_points,
      snake_count = 0,
      camel_count = 0,
      entry_fee_pence = excluded.entry_fee_pence,
      entered = true,
      disqualified = false,
      updated_at = timezone('utc', now());

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'saved', v_count,
    'round_id', p_round_id,
    'saved_by', v_uid
  );
end;
$$;

grant execute on function public.winter_scorer_upsert_scores(uuid, jsonb) to authenticated;
grant execute on function public.winter_scorer_upsert_scores(uuid, jsonb) to service_role;

comment on function public.winter_scorer_session() is
  'Winter Scores app bootstrap: scorer identity + winter_weekly round list.';
comment on function public.winter_scorer_get_sheet(uuid) is
  'Winter Scores sheet: roster + existing net points for one winter_weekly round.';
comment on function public.winter_scorer_upsert_scores(uuid, jsonb) is
  'Upsert net Stableford for winter_weekly only (§9 — no snake/camel). No service_role required.';
