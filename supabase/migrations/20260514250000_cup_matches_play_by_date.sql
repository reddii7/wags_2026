-- Add play_by_date so each stage can show a deadline in the RS Cup view.
alter table public.cup_matches
  add column if not exists play_by_date date;

comment on column public.cup_matches.play_by_date is
  'Deadline date for this match to be played, shown in the RS Cup bracket view.';
