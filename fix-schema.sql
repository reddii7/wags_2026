-- Fix schema mismatches for migration
-- Run this in your new Supabase project's SQL Editor

-- Fix winter_scores competition_id type (should be UUID, not integer)
ALTER TABLE winter_scores ALTER COLUMN competition_id TYPE UUID USING competition_id::uuid;

-- Add missing columns based on backup data
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE winter_competitions ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE winter_players ADD COLUMN IF NOT EXISTS season TEXT;
ALTER TABLE matchplay_tournaments ADD COLUMN IF NOT EXISTS status TEXT;

-- Fix rounds table - remove snake/camel columns if they don't exist in backup
ALTER TABLE rounds DROP COLUMN IF EXISTS has_snake;
ALTER TABLE rounds DROP COLUMN IF EXISTS has_camel;
ALTER TABLE rounds DROP COLUMN IF EXISTS is_paid;
