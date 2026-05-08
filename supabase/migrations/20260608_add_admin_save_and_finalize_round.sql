-- Finalize admin rounds atomically: save scores, exclude unscored players,
-- then finalize within one database transaction.

create or replace function public.admin_save_and_finalize_round(
  p_round_id uuid,
  p_scores jsonb default '[]'::jsonb,
  p_excluded_player_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  v_result jsonb;
  v_entry_fee numeric := 0;
  v_has_scored_entry boolean := false;
  r_score record;
begin
  select coalesce(rs.entry_fee, 0)
    into v_entry_fee
  from wags.rounds r
  join wags.competitions c on c.id = r.competition_id
  join wags.rule_sets rs on rs.id = c.rule_set_id
  where r.id = p_round_id;

  if v_entry_fee is null then
    raise exception 'Round % not found', p_round_id;
  end if;

  if jsonb_typeof(coalesce(p_scores, '[]'::jsonb)) <> 'array' then
    raise exception 'p_scores must be a JSON array';
  end if;

  for r_score in
    select
      (item->>'player_id')::uuid as player_id,
      nullif(item->>'stableford', '')::integer as stableford_points,
      coalesce((item->>'snake')::boolean, false) as has_snake,
      coalesce((item->>'camel')::boolean, false) as has_camel
    from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) as item
  loop
    if r_score.player_id is null then
      raise exception 'Each score row must include player_id';
    end if;

    if r_score.stableford_points is null then
      continue;
    end if;

    v_has_scored_entry := true;

    insert into wags.round_entries (round_id, player_id, entry_fee_paid)
    values (
      p_round_id,
      r_score.player_id,
      case when v_entry_fee > 0 then v_entry_fee else 0 end
    )
    on conflict (round_id, player_id) do update
      set entry_fee_paid = case
        when excluded.entry_fee_paid > 0 then excluded.entry_fee_paid
        else wags.round_entries.entry_fee_paid
      end,
      is_eligible = true,
      updated_at = now();

    insert into wags.round_scores (
      round_entry_id,
      stableford_points,
      gross_score,
      has_snake,
      has_camel
    )
    select
      re.id,
      r_score.stableford_points,
      null,
      r_score.has_snake,
      r_score.has_camel
    from wags.round_entries re
    where re.round_id = p_round_id
      and re.player_id = r_score.player_id
    on conflict (round_entry_id) do update set
      stableford_points = excluded.stableford_points,
      gross_score = excluded.gross_score,
      has_snake = excluded.has_snake,
      has_camel = excluded.has_camel,
      updated_at = now();
  end loop;

  if not v_has_scored_entry then
    raise exception 'Enter at least one score before finalizing';
  end if;

  if coalesce(array_length(p_excluded_player_ids, 1), 0) > 0 then
    delete from wags.round_scores rs
    using wags.round_entries re
    where rs.round_entry_id = re.id
      and re.round_id = p_round_id
      and re.player_id = any(p_excluded_player_ids);

    delete from wags.round_entries re
    where re.round_id = p_round_id
      and re.player_id = any(p_excluded_player_ids);
  end if;

  v_result := public.admin_finalize_round(p_round_id);
  return v_result;
end;
$$;

grant execute on function public.admin_save_and_finalize_round(uuid, jsonb, uuid[]) to service_role;
