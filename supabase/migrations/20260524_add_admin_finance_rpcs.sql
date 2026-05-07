-- Finance admin RPCs (service_role only)
create or replace function public.admin_list_finance_events(
  p_season_id uuid,
  p_wallet text default null
)
returns table (
  id uuid,
  created_at timestamptz,
  wallet text,
  reason text,
  amount numeric,
  round_id uuid
)
language sql
security definer
set search_path = wags, public
as $$
  select
    fe.id,
    fe.created_at,
    fe.wallet::text as wallet,
    fe.reason::text as reason,
    fe.amount,
    fe.round_id
  from wags.finance_events fe
  where fe.season_id = p_season_id
    and (p_wallet is null or p_wallet = '' or fe.wallet::text = lower(p_wallet))
  order by fe.created_at desc
  limit 500;
$$;

grant execute on function public.admin_list_finance_events(uuid, text) to service_role;
