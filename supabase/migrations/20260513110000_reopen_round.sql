-- reopen_round(p_round_id)
-- Reverses a finalize_round call:
--   1. Restores each member's handicap_index to their handicap_before snapshot value
--   2. Deletes handicap_snapshots for this round
--   3. Deletes weekly_prize_state for this round
--   4. Clears rounds.finalized + finalized_at

create or replace function public.reopen_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_round rounds%rowtype;
  v_restored integer := 0;
begin
  select * into v_round from rounds where id = p_round_id;
  if not found then
    raise exception 'Round % not found', p_round_id;
  end if;
  if not v_round.finalized then
    raise exception 'Round % is not finalized', p_round_id;
  end if;

  -- Restore member handicaps from before-snapshot values
  update members m
  set    handicap_index = hs.handicap_before
  from   handicap_snapshots hs
  where  hs.round_id  = p_round_id
    and  hs.member_id = m.id;

  get diagnostics v_restored = row_count;

  -- Remove derived rows
  delete from handicap_snapshots  where round_id = p_round_id;
  delete from weekly_prize_state  where round_id = p_round_id;

  -- Reopen the round
  update rounds
  set finalized    = false,
      finalized_at = null
  where id = p_round_id;

  return jsonb_build_object(
    'ok',               true,
    'round_id',         p_round_id,
    'handicaps_restored', v_restored
  );
end;
$$;

grant execute on function public.reopen_round(uuid) to authenticated;
