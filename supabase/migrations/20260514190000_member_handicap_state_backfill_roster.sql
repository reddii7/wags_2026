-- Prior migration backfilled member_handicap_state from public.players only.
-- Production rosters often live in league_assignments (+ round_players) with no players rows,
-- so MHS stayed empty. Seed from everyone on the campaign roster OR seen in round_players.

begin;

with roster as (
  select distinct la.campaign_id, la.member_id
  from public.league_assignments la
  union
  select distinct r.campaign_id, rp.member_id
  from public.round_players rp
  join public.rounds r on r.id = rp.round_id
)
insert into public.member_handicap_state (campaign_id, member_id, handicap, updated_at)
select
  roster.campaign_id,
  roster.member_id,
  m.handicap_index,
  timezone('utc'::text, now())
from roster
join public.members m on m.id = roster.member_id
on conflict (campaign_id, member_id) do update
set
  handicap   = excluded.handicap,
  updated_at = excluded.updated_at;

commit;
