-- Guard finalization with an integrity check on handicap event generation.
-- This prevents silent drift where finalized rounds do not produce the
-- expected adjustment event count.

create or replace function public.admin_finalize_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  v_result wags.round_outcomes%rowtype;
  v_expected_events integer := 0;
  v_actual_events integer := 0;
begin
  v_result := wags.fn_finalize_round(p_round_id);

  -- Expected events are all eligible players with a saved score.
  select count(*)::int
  into v_expected_events
  from wags.rounds r
  join wags.competitions c on c.id = r.competition_id
  join wags.rule_sets rules on rules.id = c.rule_set_id
  join wags.round_entries re on re.round_id = r.id
  join wags.round_scores rs on rs.round_entry_id = re.id
  where r.id = p_round_id
    and re.is_eligible = true
    and rs.stableford_points is not null;

  select count(*)::int
  into v_actual_events
  from wags.handicap_events he
  where he.source_round_id = p_round_id
    and he.source_type = 'round_auto'
    and he.reversal_of is null;

  if v_actual_events <> v_expected_events then
    raise exception 'Handicap integrity check failed for round %: expected % events, got %',
      p_round_id, v_expected_events, v_actual_events;
  end if;

  return to_jsonb(v_result);
end;
$$;

create or replace function public.admin_verify_round_handicap_integrity(p_round_id uuid)
returns table (
  round_id uuid,
  expected_events integer,
  actual_events integer,
  ok boolean
)
language sql
stable
security definer
set search_path = wags, public
as $$
  with expected as (
    select count(*)::int as n
    from wags.rounds r
    join wags.competitions c on c.id = r.competition_id
    join wags.rule_sets rules on rules.id = c.rule_set_id
    join wags.round_entries re on re.round_id = r.id
    join wags.round_scores rs on rs.round_entry_id = re.id
    where r.id = p_round_id
      and re.is_eligible = true
      and rs.stableford_points is not null
  ), actual as (
    select count(*)::int as n
    from wags.handicap_events he
    where he.source_round_id = p_round_id
      and he.source_type = 'round_auto'
      and he.reversal_of is null
  )
  select p_round_id, expected.n, actual.n, (expected.n = actual.n)
  from expected, actual;
$$;

grant execute on function public.admin_verify_round_handicap_integrity(uuid) to service_role;
