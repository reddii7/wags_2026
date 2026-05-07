-- Cleanup temporary test seasons without deleting immutable ledger history.
-- We archive them by renaming + deactivating so real data remains clean.

update wags.seasons
set
  label = '[ARCHIVED TEST] Main Season 2026',
  is_active = false,
  end_date = coalesce(end_date, start_date)
where label = 'Main Season 2026 (Test)';

update wags.seasons
set
  label = '[ARCHIVED TEST] RPC Test Season 2',
  is_active = false,
  end_date = coalesce(end_date, start_date)
where label = 'RPC Test Season 2';
