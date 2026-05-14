-- Bulk insert members into the linked greenfield project.
-- Edit the VALUES block, then: supabase db query --linked -f scripts/sql/import_members_template.sql
--
-- Columns: full_name, email, initial_handicap_index, handicap_index, is_admin
-- Trigger sets handicap_index from initial_handicap_index on insert where applicable.

begin;

insert into public.members (full_name, email, initial_handicap_index, handicap_index, is_admin)
values
  ('Replace This Name', 'replace.unique@email', 18.0, 18.0, false);

commit;
