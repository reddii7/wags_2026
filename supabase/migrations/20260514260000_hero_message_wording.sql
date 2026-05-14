-- Fix hero_message wording:
-- • Rollover: "A and B both scored 22 points, £7.50 carries to next week."
--             (3+): "A, B and C both scored 22 points, £7.50 carries to next week."
-- • Solo win:  "Mark Ready wins with 22 points, £7.50 added to his season winnings."
-- • Paid tie:  "A and B tied on 22 points, £7.50 split between them."
-- Everything else (structure, queries, return shape) is identical to the original.

create or replace function public.get_member_home_snapshot(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind             text;
  v_round_id         uuid;
  v_lr               public.rounds%rowtype;
  v_paid_out_pence   bigint;
  v_roll_out_pence   bigint;
  v_winner_member_id uuid;
  v_winner_name      text;
  v_max_pts          integer;
  v_tie              boolean := false;
  v_week_num         integer;
  v_week_label       text;
  v_hero             text;
  v_no_results       boolean;
  v_stats            jsonb;
  v_hc               jsonb;
  v_b14              jsonb;
  v_ll               jsonb;
  v_amount_gbp       numeric;
  v_entrants         integer := 0;
  v_top_names        text[];
  v_names_joined     text;
  v_score_line       text;
begin
  select c.kind::text
  into v_kind
  from public.campaigns c
  where c.id = p_campaign_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  end if;

  -- Best 14 + league blocks always from canonical standings view (summer_main only).
  if v_kind = 'summer_main' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.position, t.full_name), '[]'::jsonb)
    into v_b14
    from (
      select
        rnk.member_id as id,
        rnk.member_id as user_id,
        rnk.full_name,
        rnk.rank_no::int as position,
        rnk.best_14_total::numeric as total_score
      from (
        select
          v.member_id,
          v.full_name,
          v.best_14_total,
          rank() over (order by v.best_14_total desc nulls last) as rank_no
        from public.v_summer_standings v
        where v.campaign_id = p_campaign_id
      ) rnk
      where rnk.rank_no <= 3
    ) t;

    select coalesce(jsonb_agg(to_jsonb(u) order by u.tier), '[]'::jsonb)
    into v_ll
    from (
      select distinct on (la.tier)
        la.tier,
        m.id as user_id,
        case la.tier
          when 1 then 'PREMIERSHIP'
          when 2 then 'CHAMPIONSHIP'
          when 3 then 'LEAGUE 1'
          when 4 then 'LEAGUE 2'
          else 'LEAGUE'
        end as league_name,
        m.full_name,
        la.tier as position,
        v.best_14_total::numeric as total_score
      from public.league_assignments la
      join public.members m on m.id = la.member_id
      join public.v_summer_standings v
        on v.campaign_id = la.campaign_id
       and v.member_id = la.member_id
      where la.campaign_id = p_campaign_id
      order by la.tier, v.best_14_total desc nulls last, m.id
    ) u;
  else
    v_b14 := '[]'::jsonb;
    v_ll := '[]'::jsonb;
  end if;

  if v_kind is distinct from 'summer_main' then
    return jsonb_build_object(
      'ok', true,
      'home', jsonb_build_object(
        'week_label', 'WEEK — , —',
        'hero_message', 'No results yet.',
        'no_results', true,
        'stats', jsonb_build_object('players', 0, 'snakes', 0, 'camels', 0),
        'handicap_changes', '[]'::jsonb
      ),
      'best14_leaders', coalesce(v_b14, '[]'::jsonb),
      'league_leaders', coalesce(v_ll, '[]'::jsonb)
    );
  end if;

  select r.id into v_round_id
  from public.rounds r
  where r.campaign_id = p_campaign_id
    and r.finalized = true
    and r.round_type = 'summer_weekly'
  order by coalesce(r.play_order, 2147483647) desc, r.round_date desc, r.id desc
  limit 1;

  if v_round_id is null then
    v_week_label := 'WEEK — , —';
    v_hero := 'No results yet.';
    v_no_results := true;
    v_stats := jsonb_build_object('players', 0, 'snakes', 0, 'camels', 0);
    v_hc := '[]'::jsonb;

    if jsonb_array_length(coalesce(v_b14, '[]'::jsonb)) > 0
       or jsonb_array_length(coalesce(v_ll, '[]'::jsonb)) > 0 then
      v_no_results := false;
    end if;

    return jsonb_build_object(
      'ok', true,
      'home', jsonb_build_object(
        'week_label', v_week_label,
        'hero_message', v_hero,
        'no_results', v_no_results,
        'stats', v_stats,
        'handicap_changes', v_hc
      ),
      'best14_leaders', coalesce(v_b14, '[]'::jsonb),
      'league_leaders', coalesce(v_ll, '[]'::jsonb)
    );
  end if;

  select * into v_lr from public.rounds where id = v_round_id;

  select
    wps.paid_out_pence,
    wps.rollover_carried_out,
    wps.winner_member_id
  into v_paid_out_pence, v_roll_out_pence, v_winner_member_id
  from public.weekly_prize_state wps
  where wps.round_id = v_round_id
    and wps.superseded_at is null
  limit 1;

  select count(*)::int into v_entrants
  from public.round_players rp
  where rp.round_id = v_round_id
    and rp.entered = true;

  select coalesce(max(rp.stableford_points), -1) into v_max_pts
  from public.round_players rp
  where rp.round_id = v_round_id
    and rp.entered = true
    and rp.disqualified = false;

  select exists (
    select 1
    from public.round_players rp
    where rp.round_id = v_round_id
      and rp.entered = true
      and rp.disqualified = false
      and rp.stableford_points = v_max_pts
    having count(*) > 1
  ) into v_tie;

  select coalesce(array_agg(m.full_name order by m.full_name), array[]::text[])
  into v_top_names
  from public.round_players rp
  join public.members m on m.id = rp.member_id
  where rp.round_id = v_round_id
    and rp.entered = true
    and rp.disqualified = false
    and rp.stableford_points = v_max_pts
    and v_max_pts >= 0;

  -- Join names: "A", "A and B", "A, B and C", "A, B, C and D" …
  v_names_joined := case
    when coalesce(array_length(v_top_names, 1), 0) = 0 then ''
    when array_length(v_top_names, 1) = 1 then v_top_names[1]
    when array_length(v_top_names, 1) = 2 then
      v_top_names[1] || ' and ' || v_top_names[2]
    else
      array_to_string(v_top_names[1 : array_length(v_top_names, 1) - 1], ', ')
      || ' and '
      || v_top_names[array_length(v_top_names, 1)]
  end;

  if coalesce(v_lr.play_order, 0) > 0 then
    v_week_num := v_lr.play_order;
  else
    select coalesce(count(*)::int, 0) + 1 into v_week_num
    from public.rounds r2
    where r2.campaign_id = p_campaign_id
      and r2.round_type = 'summer_weekly'
      and r2.finalized = true
      and (
        r2.round_date < v_lr.round_date
        or (r2.round_date = v_lr.round_date and r2.id < v_lr.id)
      );
  end if;

  v_week_label :=
    'WEEK '
    || v_week_num::text
    || ', '
    || trim(to_char(v_lr.round_date::date, 'DD FMMon'));

  v_amount_gbp := round(coalesce(v_paid_out_pence, 0)::numeric / 100.0, 2);

  v_score_line := case
    when v_max_pts >= 0 then v_max_pts::text || ' points'
    else '0 points'
  end;

  if v_entrants = 0 then
    v_hero := v_week_label || ' · no entrants';
    v_no_results := true;
  elsif v_tie then
    v_hero :=
      v_names_joined
      || ' both scored '
      || v_score_line
      || ', £'
      || trim(to_char(round(coalesce(v_roll_out_pence, 0)::numeric / 100.0, 2), 'FM999999990.00'))
      || ' carries to next week.';
    v_no_results := false;
  elsif v_winner_member_id is not null then
    select m.full_name into v_winner_name
    from public.members m
    where m.id = v_winner_member_id;

    v_hero :=
      coalesce(v_winner_name, 'Winner')
      || ' wins with '
      || v_score_line
      || ', £'
      || trim(to_char(v_amount_gbp, 'FM999999990.00'))
      || ' added to his season winnings.';
    v_no_results := false;
  elsif coalesce(array_length(v_top_names, 1), 0) > 1 then
    v_hero :=
      v_names_joined
      || ' tied on '
      || v_score_line
      || ', £'
      || trim(to_char(v_amount_gbp, 'FM999999990.00'))
      || ' split between them.';
    v_no_results := false;
  elsif coalesce(array_length(v_top_names, 1), 0) = 1 then
    v_hero :=
      v_top_names[1]
      || ' scored '
      || v_score_line
      || '.';
    v_no_results := false;
  else
    v_hero := v_week_label || ' · completed';
    v_no_results := v_entrants = 0;
  end if;

  select jsonb_build_object(
    'players', coalesce(sum(case when rp.entered then 1 else 0 end), 0),
    'snakes', coalesce(sum(rp.snake_count), 0),
    'camels', coalesce(sum(rp.camel_count), 0)
  )
  into v_stats
  from public.round_players rp
  where rp.round_id = v_round_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', hs.member_id,
        'full_name', m.full_name,
        'oldRounded', round(hs.handicap_before::numeric, 0)::int,
        'newRounded', round(hs.handicap_after::numeric, 0)::int
      )
      order by m.full_name
    ),
    '[]'::jsonb
  )
  into v_hc
  from public.handicap_snapshots hs
  join public.members m on m.id = hs.member_id
  where hs.round_id = v_round_id
    and hs.superseded_at is null
    and round(hs.handicap_before::numeric, 0)
        is distinct from round(hs.handicap_after::numeric, 0);

  if jsonb_array_length(coalesce(v_b14, '[]'::jsonb)) > 0
     or jsonb_array_length(coalesce(v_ll, '[]'::jsonb)) > 0 then
    v_no_results := false;
  end if;

  return jsonb_build_object(
    'ok', true,
    'home', jsonb_build_object(
      'week_label', v_week_label,
      'hero_message', v_hero,
      'no_results', v_no_results,
      'stats', coalesce(v_stats, jsonb_build_object('players', 0, 'snakes', 0, 'camels', 0)),
      'handicap_changes', coalesce(v_hc, '[]'::jsonb)
    ),
    'best14_leaders', coalesce(v_b14, '[]'::jsonb),
    'league_leaders', coalesce(v_ll, '[]'::jsonb)
  );
end;
$$;

comment on function public.get_member_home_snapshot(uuid) is
  'Contract-v1 home slice: latest finalized summer_weekly round, hero copy, stats, '
  'handicap integer steps only, Best14 rank<=3 with ties, division leaders tiers 1–4.';

revoke all on function public.get_member_home_snapshot(uuid) from public;
grant execute on function public.get_member_home_snapshot(uuid) to service_role;
grant execute on function public.get_member_home_snapshot(uuid) to authenticated;
