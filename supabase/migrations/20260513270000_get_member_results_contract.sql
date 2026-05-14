-- Stats / Results tab: full contract-v1 results_view from Postgres (no PostgREST row-cap slices).

begin;

create or replace function public.get_member_results_contract(p_campaign_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  rec            record;
  rid_text       text;
  v_rows         jsonb := '{}'::jsonb;
  v_sum          jsonb := '{}'::jsonb;
  v_row_arr      jsonb;
  v_hero         text;
  v_amount_gbp   numeric;
  v_winner_type  text;
  v_winner_names jsonb;
  v_paid_out     bigint;
  v_roll_out     bigint;
  v_winner_id    uuid;
  v_winner_name  text;
  v_max_pts      integer;
  v_tie          boolean;
  v_top_names    text[];
  v_score_line   text;
  v_entrants     integer;
  v_stats        jsonb;
  v_snakes       integer;
  v_camels       integer;
  v_players      integer;
begin
  if not exists (select 1 from public.campaigns c where c.id = p_campaign_id) then
    return jsonb_build_object(
      'default_competition_id', '',
      'competitions', '[]'::jsonb,
      'rows_by_competition', '{}'::jsonb,
      'summary_by_competition', '{}'::jsonb
    );
  end if;

  for rec in
    select
      r.*,
      row_number() over (
        order by coalesce(r.play_order, 999999), r.round_date, r.id
      ) as wk
    from public.rounds r
    where r.campaign_id = p_campaign_id
    order by wk
  loop
    rid_text := rec.id::text;

    select coalesce(jsonb_agg(t.j order by (t.j->>'position')::int, t.j->>'player'), '[]'::jsonb)
    into v_row_arr
    from (
      select jsonb_build_object(
        'id', rid_text || '-' || rk.member_id::text,
        'competition_id', rid_text,
        'user_id', rk.member_id,
        'player', rk.full_name,
        'score', rk.stableford_points,
        'snake', (coalesce(rk.snake_count, 0) > 0),
        'camel', (coalesce(rk.camel_count, 0) > 0),
        'position', rk.rnk
      ) as j
      from (
        select
          rp.*,
          m.full_name,
          rank() over (
            order by rp.stableford_points desc nulls last, m.full_name
          ) as rnk
        from public.round_players rp
        join public.members m on m.id = rp.member_id
        where rp.round_id = rec.id
          and rp.entered = true
          and rp.disqualified = false
          and rp.stableford_points is not null
      ) rk
    ) t;

    v_rows := v_rows || jsonb_build_object(rid_text, coalesce(v_row_arr, '[]'::jsonb));

    select
      wps.paid_out_pence,
      wps.rollover_carried_out,
      wps.winner_member_id
    into v_paid_out, v_roll_out, v_winner_id
    from public.weekly_prize_state wps
    where wps.round_id = rec.id
      and wps.superseded_at is null
    limit 1;

    select count(*)::int into v_entrants
    from public.round_players rp
    where rp.round_id = rec.id
      and rp.entered = true;

    select coalesce(max(rp.stableford_points), -1) into v_max_pts
    from public.round_players rp
    where rp.round_id = rec.id
      and rp.entered = true
      and rp.disqualified = false;

    select exists (
      select 1
      from public.round_players rp
      where rp.round_id = rec.id
        and rp.entered = true
        and rp.disqualified = false
        and rp.stableford_points = v_max_pts
      having count(*) > 1
    ) into v_tie;

    select coalesce(array_agg(m.full_name order by m.full_name), array[]::text[])
    into v_top_names
    from public.round_players rp
    join public.members m on m.id = rp.member_id
    where rp.round_id = rec.id
      and rp.entered = true
      and rp.disqualified = false
      and rp.stableford_points = v_max_pts
      and v_max_pts >= 0;

    v_amount_gbp := round(coalesce(v_paid_out, 0)::numeric / 100.0, 2);
    v_score_line := case
      when v_max_pts >= 0 then v_max_pts::text || ' points'
      else '0 points'
    end;

    if v_entrants = 0 then
      v_hero := coalesce(rec.name, 'Week ' || coalesce(rec.play_order::text, '')) || ' · no entrants';
      v_winner_type := '';
      v_winner_names := '[]'::jsonb;
    elsif v_tie then
      v_hero :=
        'A rollover with '
        || array_to_string(v_top_names, ', ')
        || ' all scoring '
        || v_score_line
        || ', £'
        || trim(to_char(round(coalesce(v_roll_out, 0)::numeric / 100.0, 2), 'FM999999990.00'))
        || ' rolled over to next week.';
      v_winner_type := 'tie';
      v_winner_names := to_jsonb(v_top_names);
    elsif v_winner_id is not null then
      select m.full_name into v_winner_name
      from public.members m
      where m.id = v_winner_id;

      v_hero :=
        'A win for '
        || coalesce(v_winner_name, 'Winner')
        || ' with '
        || v_score_line
        || ', adding £'
        || trim(to_char(v_amount_gbp, 'FM999999990.00'))
        || ' to his season winnings.';
      v_winner_type := 'winner';
      v_winner_names := case
        when v_winner_name is not null then to_jsonb(array[v_winner_name])
        else '[]'::jsonb
      end;
    elsif coalesce(array_length(v_top_names, 1), 0) > 1 then
      v_hero :=
        array_to_string(v_top_names, ', ')
        || ' tied for the win, adding £'
        || trim(to_char(v_amount_gbp, 'FM999999990.00'))
        || ' to their season winnings.';
      v_winner_type := 'winner';
      v_winner_names := to_jsonb(v_top_names);
    elsif coalesce(array_length(v_top_names, 1), 0) = 1 then
      v_hero :=
        v_top_names[1]
        || ' scored '
        || v_score_line
        || '.';
      v_winner_type := '';
      v_winner_names := '[]'::jsonb;
    else
      v_hero :=
        coalesce(rec.name, 'Week ' || coalesce(rec.play_order::text, ''))
        || case when rec.finalized then ' · completed' else ' · in progress' end;
      v_winner_type := '';
      v_winner_names := '[]'::jsonb;
    end if;

    select
      count(*)::int,
      coalesce(sum(rp.snake_count), 0)::int,
      coalesce(sum(rp.camel_count), 0)::int
    into v_players, v_snakes, v_camels
    from public.round_players rp
    where rp.round_id = rec.id
      and rp.entered = true
      and rp.disqualified = false
      and rp.stableford_points is not null;

    v_stats := jsonb_build_object(
      'players', coalesce(v_players, 0),
      'snakes', coalesce(v_snakes, 0),
      'camels', coalesce(v_camels, 0)
    );

    v_sum := v_sum || jsonb_build_object(
      rid_text,
      jsonb_build_object(
        'competition_id', rid_text,
        'winner_type', v_winner_type,
        'winner_names', coalesce(v_winner_names, '[]'::jsonb),
        'amount', v_amount_gbp,
        'num_players', coalesce(v_players, 0),
        'snakes', coalesce(v_snakes, 0),
        'camels', coalesce(v_camels, 0),
        'week_number', rec.wk::int,
        'week_date', to_char(rec.round_date::date, 'YYYY-MM-DD'),
        'second_names', '[]'::jsonb,
        'hero_message', v_hero,
        'stats', v_stats
      )
    );
  end loop;

  return (
    with o as (
      select
        r.id,
        r.name,
        r.play_order,
        r.round_date,
        r.finalized,
        row_number() over (
          order by coalesce(r.play_order, 999999), r.round_date, r.id
        ) as wk
      from public.rounds r
      where r.campaign_id = p_campaign_id
    ),
    def as (
      select o.id::text as cid
      from o
      where coalesce(jsonb_array_length(v_rows -> (o.id::text)), 0) > 0
      order by o.wk desc
      limit 1
    ),
    def2 as (
      select coalesce((select cid from def), (select o.id::text from o order by o.wk desc limit 1), '') as cid
    )
    select jsonb_build_object(
      'default_competition_id', (select cid from def2),
      'competitions', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', o.id::text,
              'name', coalesce(o.name, 'Week ' || coalesce(o.play_order::text, '')),
              'competition_date', to_char(o.round_date::date, 'YYYY-MM-DD'),
              'status', case when o.finalized then 'finalized' else 'open' end,
              'week_number', o.wk,
              'week_label', 'WK' || o.wk::text
            )
            order by o.wk desc
          ),
          '[]'::jsonb
        )
        from o
      ),
      'rows_by_competition', v_rows,
      'summary_by_competition', v_sum
    )
  );
end;
$$;

comment on function public.get_member_results_contract(uuid) is
  'Contract-v1 results_view for a campaign: competitions, rows_by_competition, summary_by_competition, default id.';

revoke all on function public.get_member_results_contract(uuid) from public;
grant execute on function public.get_member_results_contract(uuid) to service_role;
grant execute on function public.get_member_results_contract(uuid) to authenticated;

commit;
