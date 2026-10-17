-- When closing summer and applying P/R into the next campaign, also seed
-- member_handicap_state for that campaign from members.handicap_index.
-- League assignments alone left 2027 profiles with null handicaps until the
-- first weekly finalize; handicaps must carry forward at close time.

begin;

create or replace function public.apply_summer_close_with_pr(
  p_old_campaign uuid,
  p_next_campaign uuid,
  p_effective_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_league_rows integer := 0;
  v_mhs_rows    integer := 0;
begin
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_old_campaign and c.kind = 'summer_main'
  ) then
    raise exception 'Old campaign % must exist and be kind summer_main', p_old_campaign;
  end if;

  if not exists (
    select 1 from public.campaigns c
    where c.id = p_next_campaign and c.kind = 'summer_main'
  ) then
    raise exception 'Next campaign % must exist and be kind summer_main', p_next_campaign;
  end if;

  if p_old_campaign = p_next_campaign then
    raise exception 'Old and next campaign must differ';
  end if;

  update public.campaigns
  set status = 'closed'::campaign_status
  where id = p_old_campaign;

  insert into public.league_assignments (campaign_id, member_id, tier, effective_from)
  select p_next_campaign, o.member_id, o.new_tier, p_effective_from
  from public.summer_pr_outcome(p_old_campaign) o
  on conflict (campaign_id, member_id) do update
    set tier = excluded.tier,
        effective_from = excluded.effective_from;

  get diagnostics v_league_rows = row_count;

  -- Carry closing handicaps into the next campaign's MHS (source of truth for app profiles).
  insert into public.member_handicap_state (campaign_id, member_id, handicap, updated_at)
  select
    p_next_campaign,
    o.member_id,
    m.handicap_index,
    timezone('utc'::text, now())
  from public.summer_pr_outcome(p_old_campaign) o
  join public.members m on m.id = o.member_id
  on conflict (campaign_id, member_id) do update
    set handicap   = excluded.handicap,
        updated_at = excluded.updated_at;

  get diagnostics v_mhs_rows = row_count;

  update public.campaigns
  set status = 'open'::campaign_status
  where id = p_next_campaign and status = 'draft'::campaign_status;

  return jsonb_build_object(
    'ok', true,
    'league_assignments_upserted', v_league_rows,
    'member_handicap_state_upserted', v_mhs_rows,
    'handicap_note',
      'Member handicaps unchanged on members.handicap_index; next-campaign member_handicap_state seeded from those values for 2027 app display.'
  );
end;
$fn$;

comment on function public.apply_summer_close_with_pr(uuid, uuid, date) is
  'Close old summer_main, upsert next season league_assignments from §4.2 P/R, '
  'seed next campaign member_handicap_state from members.handicap_index, open next if draft.';

grant execute on function public.apply_summer_close_with_pr(uuid, uuid, date) to authenticated;
grant execute on function public.apply_summer_close_with_pr(uuid, uuid, date) to service_role;

commit;
