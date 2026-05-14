-- Replace the JSONB result field with a plain text result_text column.
-- Match-play results are simple strings like "3&2", "2 up", "19th hole" etc.
-- The original result jsonb column is kept (nullable) for any future structured data.

alter table public.cup_matches
  add column if not exists result_text text;

comment on column public.cup_matches.result_text is
  'Match-play result margin, e.g. "3&2", "2 up", "19th hole". '
  'Set after the match is played alongside winner_member_id.';
