-- Full data reset for wags schema while preserving schema objects.
-- This clears players, seasons, competitions, rounds, scores, ledgers, etc.

DO $$
DECLARE
  table_list text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
    INTO table_list
  FROM pg_tables
  WHERE schemaname = 'wags';

  IF table_list IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
  END IF;
END;
$$;
