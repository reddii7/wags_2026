-- Winter member home contract (DB-side): latest week full scores + Best 10
-- standings + per-player Best 10 detail. No snakes/camels, HCP, Best 14, or leagues.

begin;

create or replace function public.get_member_winter_home_snapshot(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_round record;
  v_week_label text;
  v_week_date text;
  v_hero text;
  v_no_results boolean := true;
  v_entrants integer := 0;
  v_winner_id uuid;
  v_winner_name text;
  v_paid_out bigint := 0;
  v_roll_out bigint := 0;
  v_max_pts integer;
  v_tie boolean := false;
  v_score_line text;
  v_amount_gbp numeric;
  v_week_scores jsonb := '[]'::jsonb;
  v_best10 jsonb := '[]'::jsonb;
  v_best10_by_member jsonb := '{}'::jsonb;
begin
  if p_campaign_id is null then
    return jsonb_build_object('ok', false, 'error', 'campaign required');
  end if;

  select c.kind::text into v_kind
  from public.campaigns c
  where c.id = p_campaign_id;

  if v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'campaign not found');
  end if;

  if v_kind is distinct from 'winter_reduced' then
    return jsonb_build_object('ok', false, 'error', 'not a winter campaign');
  end if;

  -- Latest scored winter week: prefer open-with-scores, else latest finalized.
  select
    r.id,
    r.name,
    r.round_date,
    r.finalized,
    r.play_order,
    coalesce(
      nullif(r.play_order, 0),
      (
        select count(*)::int
        from public.rounds r2
        where r2.campaign_id = r.campaign_id
          and r2.round_type = 'winter_weekly'
          and (
            coalesce(r2.play_order, 999999) < coalesce(r.play_order, 999999)
            or (
              coalesce(r2.play_order, 999999) = coalesce(r.play_order, 999999)
              and (r2.round_date, r2.id) <= (r.round_date, r.id)
            )
          )
      )
    ) as week_number
  into v_round
  from public.rounds r
  where r.campaign_id = p_campaign_id
    and r.round_type = 'winter_weekly'
    and exists (
      select 1
      from public.round_players rp
      where rp.round_id = r.id
        and rp.entered = true
        and rp.stableford_points is not null
    )
  order by
    case when r.finalized then 1 else 0 end,
    coalesce(r.play_order, 0) desc,
    r.round_date desc nulls last,
    r.id desc
  limit 1;

  if v_round.id is null then
    return jsonb_build_object(
      'ok', true,
      'mode', 'winter',
      'home', jsonb_build_object(
        'week_label', 'WEEK — , —',
        'hero_message', 'No winter results yet.',
        'no_results', true,
        'stats', jsonb_build_object('players', 0),
        'focus_round_id', null,
        'paid_out_pence', 0,
        'winner_member_id', null,
        'winner_name', null
      ),
      'week_scores', '[]'::jsonb,
      'best10_leaders', '[]'::jsonb,
      'best10_by_member', '{}'::jsonb
    );
  end if;

  v_week_date := to_char(v_round.round_date::date, 'FMDD Mon');
  v_week_label := 'WEEK ' || v_round.week_number::text || ', ' || v_week_date;

  select count(*)::int
  into v_entrants
  from public.round_players rp
  where rp.round_id = v_round.id
    and rp.entered = true;

  select
    wps.winner_member_id,
    coalesce(wps.paid_out_pence, 0),
    coalesce(wps.rollover_carried_out, 0)
  into v_winner_id, v_paid_out, v_roll_out
  from public.weekly_prize_state wps
  where wps.round_id = v_round.id
    and wps.superseded_at is null
  limit 1;

  select max(rp.stableford_points)
  into v_max_pts
  from public.round_players rp
  where rp.round_id = v_round.id
    and rp.entered = true
    and rp.disqualified = false
    and rp.stableford_points is not null;

  select count(*) > 1
  into v_tie
  from public.round_players rp
  where rp.round_id = v_round.id
    and rp.entered = true
    and rp.disqualified = false
    and rp.stableford_points = v_max_pts;

  if v_max_pts is not null then
    v_score_line := v_max_pts::text || ' point' || case when v_max_pts = 1 then '' else 's' end;
  else
    v_score_line := '—';
  end if;

  v_amount_gbp := round(coalesce(v_paid_out, 0)::numeric / 100.0, 2);

  if v_winner_id is not null then
    select m.full_name into v_winner_name from public.members m where m.id = v_winner_id;
    v_hero :=
      coalesce(v_winner_name, 'Winner')
      || ' wins with '
      || v_score_line
      || ', £'
      || trim(to_char(v_amount_gbp, 'FM999999990.00'))
      || ' paid on the night.';
    v_no_results := false;
  elsif v_tie and v_max_pts is not null then
    v_hero :=
      'Tied on '
      || v_score_line
      || ', £'
      || trim(to_char(round(coalesce(v_roll_out, 0)::numeric / 100.0, 2), 'FM999999990.00'))
      || ' carries to next week.';
    v_no_results := false;
  elsif v_entrants > 0 then
    v_hero := v_week_label || case when v_round.finalized then ' · completed' else ' · in progress' end;
    v_no_results := false;
  else
    v_hero := 'No winter results yet.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'position', x.rnk,
        'user_id', x.member_id,
        'full_name', x.full_name,
        'score', x.stableford_points,
        'is_winner', (v_winner_id is not null and x.member_id = v_winner_id)
      )
      order by x.rnk, x.full_name
    ),
    '[]'::jsonb
  )
  into v_week_scores
  from (
    select
      rp.member_id,
      m.full_name,
      rp.stableford_points,
      rank() over (
        order by rp.stableford_points desc nulls last, m.full_name
      ) as rnk
    from public.round_players rp
    join public.members m on m.id = rp.member_id
    where rp.round_id = v_round.id
      and rp.entered = true
      and rp.stableford_points is not null
  ) x;

  -- Best 10 leaders (campaign lifetime finalized winter weeks).
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.member_id,
        'user_id', s.member_id,
        'full_name', s.full_name,
        'position', s.rnk,
        'total_score', s.best_10_total,
        'rounds_counting', s.rounds_counting
      )
      order by s.rnk, s.full_name
    ),
    '[]'::jsonb
  )
  into v_best10
  from (
    select
      w.member_id,
      w.full_name,
      w.best_10_total,
      w.rounds_counting,
      rank() over (
        order by w.best_10_total desc nulls last, w.full_name
      ) as rnk
    from (
      select
        m.id as member_id,
        m.full_name,
        coalesce(sum(t.stableford_points), 0)::int as best_10_total,
        count(*)::int as rounds_counting
      from public.members m
      join lateral (
        select rp.stableford_points
        from public.round_players rp
        join public.rounds r on r.id = rp.round_id
        where rp.member_id = m.id
          and r.campaign_id = p_campaign_id
          and r.round_type = 'winter_weekly'
          and r.finalized = true
          and rp.entered = true
          and rp.stableford_points is not null
        order by rp.stableford_points desc, r.play_order desc nulls last, r.round_date desc
        limit 10
      ) t on true
      where exists (
        select 1
        from public.round_players rp2
        join public.rounds r2 on r2.id = rp2.round_id
        where rp2.member_id = m.id
          and r2.campaign_id = p_campaign_id
          and r2.round_type = 'winter_weekly'
          and r2.finalized = true
          and rp2.entered = true
      )
      group by m.id, m.full_name
    ) w
  ) s;

  -- Per-player scorecards: every finalized winter score, marked if in Best 10.
  select coalesce(jsonb_object_agg(p.member_id::text, p.payload), '{}'::jsonb)
  into v_best10_by_member
  from (
    select
      m.id as member_id,
      jsonb_build_object(
        'user_id', m.id,
        'full_name', m.full_name,
        'best_10_total', coalesce((
          select sum(x.stableford_points)::int
          from (
            select rp.stableford_points
            from public.round_players rp
            join public.rounds r on r.id = rp.round_id
            where rp.member_id = m.id
              and r.campaign_id = p_campaign_id
              and r.round_type = 'winter_weekly'
              and r.finalized = true
              and rp.entered = true
              and rp.stableford_points is not null
            order by rp.stableford_points desc, r.play_order desc nulls last, r.round_date desc
            limit 10
          ) x
        ), 0),
        'scores', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'round_id', z.round_id,
              'week_number', z.week_number,
              'round_date', z.round_date,
              'round_name', z.round_name,
              'score', z.score,
              'counts_in_best10', z.counts_in_best10,
              'best10_rank', z.best10_rank
            )
            order by z.score desc, z.week_number desc
          )
          from (
            select
              r.id as round_id,
              coalesce(nullif(r.play_order, 0), 0) as week_number,
              to_char(r.round_date::date, 'YYYY-MM-DD') as round_date,
              coalesce(r.name, 'Week ' || coalesce(r.play_order::text, '')) as round_name,
              rp.stableford_points as score,
              (row_number() over (
                order by rp.stableford_points desc, r.play_order desc nulls last, r.round_date desc
              ) <= 10) as counts_in_best10,
              case
                when row_number() over (
                  order by rp.stableford_points desc, r.play_order desc nulls last, r.round_date desc
                ) <= 10
                then row_number() over (
                  order by rp.stableford_points desc, r.play_order desc nulls last, r.round_date desc
                )
                else null
              end as best10_rank
            from public.round_players rp
            join public.rounds r on r.id = rp.round_id
            where rp.member_id = m.id
              and r.campaign_id = p_campaign_id
              and r.round_type = 'winter_weekly'
              and r.finalized = true
              and rp.entered = true
              and rp.stableford_points is not null
          ) z
        ), '[]'::jsonb)
      ) as payload
    from public.members m
    where exists (
      select 1
      from public.round_players rp
      join public.rounds r on r.id = rp.round_id
      where rp.member_id = m.id
        and r.campaign_id = p_campaign_id
        and r.round_type = 'winter_weekly'
        and r.finalized = true
        and rp.entered = true
    )
  ) p;

  return jsonb_build_object(
    'ok', true,
    'mode', 'winter',
    'home', jsonb_build_object(
      'week_label', v_week_label,
      'hero_message', v_hero,
      'no_results', v_no_results,
      'stats', jsonb_build_object('players', v_entrants),
      'focus_round_id', v_round.id,
      'paid_out_pence', coalesce(v_paid_out, 0),
      'winner_member_id', v_winner_id,
      'winner_name', v_winner_name
    ),
    'week_scores', coalesce(v_week_scores, '[]'::jsonb),
    'best10_leaders', coalesce(v_best10, '[]'::jsonb),
    'best10_by_member', coalesce(v_best10_by_member, '{}'::jsonb)
  );
end;
$$;

comment on function public.get_member_winter_home_snapshot(uuid) is
  'Winter home contract: latest week full scoreboard + Best 10 leaders + per-player Best 10 cards. No HCP/snakes/leagues.';

revoke all on function public.get_member_winter_home_snapshot(uuid) from public;
grant execute on function public.get_member_winter_home_snapshot(uuid) to anon;
grant execute on function public.get_member_winter_home_snapshot(uuid) to authenticated;
grant execute on function public.get_member_winter_home_snapshot(uuid) to service_role;

commit;
