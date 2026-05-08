-- Build the public results contract in SQL so the app consumes a DB-native
-- payload instead of assembling week-by-week results in the edge function.

create or replace function public.get_results_view_contract(p_season_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, wags
as $$
  with season_competitions as (
    select
      c.id,
      c.id::text as comp_key,
      c.name,
      c.competition_date,
      c.status,
      to_date(c.competition_date, 'YYYY-MM-DD') as sort_date,
      row_number() over (
        order by to_date(c.competition_date, 'YYYY-MM-DD'), c.name, c.id
      )::int as week_number
    from public.competitions c
    where c.season = p_season_id
  ),
  comp_rows as (
    select
      sc.id,
      sc.comp_key,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', prv.id,
            'competition_id', prv.competition_id,
            'user_id', prv.user_id,
            'player', prv.player,
            'score', prv.score,
            'snake', prv.snake,
            'camel', prv.camel,
            'position', prv.position
          )
          order by prv.position, prv.player
        ) filter (where prv.id is not null),
        '[]'::jsonb
      ) as rows,
      max(prv.score) as top_score
    from season_competitions sc
    left join public.public_results_view prv on prv.competition_id = sc.id
    group by sc.id, sc.comp_key
  ),
  top_names as (
    select
      sc.id,
      array_agg(prv.player order by prv.player) as names
    from season_competitions sc
    join comp_rows cr on cr.id = sc.id and cr.top_score is not null
    join public.public_results_view prv
      on prv.competition_id = sc.id
     and prv.score = cr.top_score
    group by sc.id
  ),
  summary_seed as (
    select
      sc.id,
      sc.comp_key,
      sc.name,
      sc.competition_date,
      sc.status,
      sc.sort_date,
      sc.week_number,
      coalesce(rs.winner_type, '') as winner_type,
      coalesce(rs.winner_names, '{}'::text[]) as winner_names,
      coalesce(rs.amount, 0::numeric)::numeric(10,2) as amount,
      coalesce(rs.num_players, jsonb_array_length(cr.rows))::int as num_players,
      coalesce(rs.snakes, 0)::int as snakes,
      coalesce(rs.camels, 0)::int as camels,
      coalesce(rs.week_date, sc.competition_date) as week_date,
      coalesce(rs.second_names, '{}'::text[]) as second_names,
      cr.top_score,
      tn.names as top_names,
      sum(
        case
          when coalesce(rs.winner_type, '') <> 'tie' then 1
          else 0
        end
      ) over (
        order by sc.sort_date, sc.name, sc.id
      ) as tie_group
    from season_competitions sc
    left join public.results_summary rs on rs.competition_id = sc.id
    left join comp_rows cr on cr.id = sc.id
    left join top_names tn on tn.id = sc.id
  ),
  summary_enriched as (
    select
      ss.*,
      case
        when coalesce(array_length(ss.winner_names, 1), 0) > 0 then ss.winner_names
        else coalesce(ss.top_names, '{}'::text[])
      end as display_names,
      case
        when ss.winner_type = 'tie' and ss.amount > 0 then
          coalesce(
            sum(ss.amount) filter (
              where ss.winner_type = 'tie' and ss.amount > 0
            ) over (
              partition by ss.tie_group
              order by ss.sort_date, ss.name, ss.id
              rows between unbounded preceding and current row
            ),
            ss.amount
          )
        else ss.amount
      end as display_amount
    from summary_seed ss
  ),
  summary_json as (
    select
      se.comp_key,
      jsonb_build_object(
        'competition_id', se.id,
        'winner_type', se.winner_type,
        'winner_names', to_jsonb(se.winner_names),
        'amount', se.display_amount,
        'num_players', se.num_players,
        'snakes', se.snakes,
        'camels', se.camels,
        'week_number', se.week_number,
        'week_date', se.week_date,
        'second_names', to_jsonb(se.second_names),
        'stats', jsonb_build_object(
          'players', se.num_players,
          'snakes', se.snakes,
          'camels', se.camels
        ),
        'hero_message',
          case
            when se.top_score is null then 'No results yet.'
            when se.winner_type in ('rollover', 'tie') then
              'A rollover with ' ||
              coalesce(nullif(array_to_string(se.display_names, ', '), ''), 'Unknown') ||
              ' all scoring ' || se.top_score::text || ', ' ||
              '£' || to_char(se.display_amount, 'FM999999990.00') ||
              ' rolled over to next week.'
            when se.winner_type = 'winner'
              and coalesce(array_length(se.display_names, 1), 0) = 1 then
              'A win for ' || se.display_names[1] ||
              ' with ' || se.top_score::text ||
              ' points, adding £' || to_char(se.display_amount, 'FM999999990.00') ||
              ' to his season winnings.'
            when se.winner_type = 'winner'
              and coalesce(array_length(se.display_names, 1), 0) > 1 then
              array_to_string(se.display_names, ', ') ||
              ' tied for the win, adding £' || to_char(se.display_amount, 'FM999999990.00') ||
              ' to their season winnings.'
            else
              coalesce(nullif(array_to_string(se.display_names, ', '), ''), 'Unknown') ||
              ' scored ' || se.top_score::text || ' points.'
          end
      ) as summary
    from summary_enriched se
  )
  select jsonb_build_object(
    'default_competition_id', coalesce(
      (
        select sc.id
        from season_competitions sc
        join comp_rows cr on cr.id = sc.id
        where jsonb_array_length(cr.rows) > 0
        order by sc.sort_date desc, sc.name desc, sc.id desc
        limit 1
      ),
      (
        select sc.id
        from season_competitions sc
        order by sc.sort_date desc, sc.name desc, sc.id desc
        limit 1
      )
    ),
    'competitions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', sc.id,
            'name', sc.name,
            'competition_date', sc.competition_date,
            'status', sc.status,
            'week_number', sc.week_number,
            'week_label', 'WK' || sc.week_number::text
          )
          order by sc.sort_date desc, sc.name desc, sc.id desc
        )
        from season_competitions sc
      ),
      '[]'::jsonb
    ),
    'rows_by_competition', coalesce(
      (select jsonb_object_agg(cr.comp_key, cr.rows) from comp_rows cr),
      '{}'::jsonb
    ),
    'summary_by_competition', coalesce(
      (select jsonb_object_agg(sj.comp_key, sj.summary) from summary_json sj),
      '{}'::jsonb
    )
  );
$$;

grant execute on function public.get_results_view_contract(uuid) to anon, authenticated, service_role;
