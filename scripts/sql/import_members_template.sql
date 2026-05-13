-- Bulk load members (linked project: supabase db query --linked -f scripts/sql/import_members_template.sql).
--
-- For full 2025 roster + summer campaign + league tiers from the legacy project, run:
--   python3 supabase/scripts/generate_2025_members_import_sql.py -o scripts/sql/generated/2025_members_and_leagues.sql
--   supabase db query --linked -f scripts/sql/generated/2025_members_and_leagues.sql
--
-- Live columns: full_name, email, initial_handicap_index, handicap_index, is_admin
-- Trigger trg_on_member_created (BEFORE INSERT): sets handicap_index = initial_handicap_index.
-- Constraints: UNIQUE(email). Use a real unique email per member (club list / placeholders ok if unique).
--
-- Edit the VALUES block only. Then run the file against your project.

begin;

-- First-time import: plain INSERT (duplicate email → error, safe).
-- Duplicate the tuple lines; last line must not end with a comma.
insert into public.members (full_name, email, initial_handicap_index, handicap_index, is_admin)
values
  ('Replace This Name', 'replace.unique@email', 18.0, 18.0, false);

-- Re-runs / spreadsheets: append instead:
--   on conflict (email) do nothing;
-- Or fix typos without touching handicaps — use DO UPDATE on full_name only (advanced).

commit;
