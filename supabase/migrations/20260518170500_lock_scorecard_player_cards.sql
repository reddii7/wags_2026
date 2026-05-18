begin;

drop policy if exists "public can upsert staging scorecards"
  on public.scorecard_player_cards;

drop policy if exists "public can delete staging scorecards"
  on public.scorecard_player_cards;

revoke select, insert, update, delete on public.scorecard_player_cards
  from anon, authenticated;

comment on table public.scorecard_player_cards is
  'Live staging mirror for committee score-entry cards. Access is via password-protected server functions or admin service role only.';

commit;
