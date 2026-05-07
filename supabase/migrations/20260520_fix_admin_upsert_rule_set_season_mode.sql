-- Fix admin_upsert_rule_set: add season_mode (NOT NULL on wags.rule_sets)
create or replace function public.admin_upsert_rule_set(
  p_id uuid, p_code text, p_name text,
  p_entry_fee numeric, p_bank_share numeric,
  p_weekly_winner_share numeric, p_snake_camel_fine numeric,
  p_stableford_par integer default 20, p_best_scores_take integer default 14,
  p_season_mode text default 'main'
)
returns uuid language plpgsql security definer set search_path = wags, public as $$
declare
  v_mode wags.season_mode;
begin
  if p_id is null then p_id := gen_random_uuid(); end if;
  v_mode := case
    when lower(coalesce(p_season_mode,'')) = 'winter' then 'winter'::wags.season_mode
    else 'main'::wags.season_mode
  end;
  insert into wags.rule_sets (id, code, name, season_mode, entry_fee, bank_share,
    weekly_winner_share, snake_camel_fine, stableford_par, best_scores_take)
  values (p_id, p_code, p_name, v_mode, p_entry_fee, p_bank_share,
    p_weekly_winner_share, p_snake_camel_fine, p_stableford_par, p_best_scores_take)
  on conflict (id) do update set
    code = excluded.code, name = excluded.name, season_mode = excluded.season_mode,
    entry_fee = excluded.entry_fee, bank_share = excluded.bank_share,
    weekly_winner_share = excluded.weekly_winner_share,
    snake_camel_fine = excluded.snake_camel_fine,
    stableford_par = excluded.stableford_par,
    best_scores_take = excluded.best_scores_take, updated_at = now();
  return p_id;
end;
$$;

-- Grant to service_role (matches pattern from existing RPCs)
revoke all on function public.admin_upsert_rule_set(uuid, text, text, numeric, numeric, numeric, numeric, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_upsert_rule_set(uuid, text, text, numeric, numeric, numeric, numeric, integer, integer, text) to service_role;
