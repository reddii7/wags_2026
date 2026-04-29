-- Simple fix for remaining migration issues
-- Run this in your new Supabase project's SQL Editor

-- First, clear existing data that might have conflicts
TRUNCATE TABLE profiles RESTART IDENTITY CASCADE;
TRUNCATE TABLE rounds RESTART IDENTITY CASCADE;
TRUNCATE TABLE financial_transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE winter_competitions RESTART IDENTITY CASCADE;
TRUNCATE TABLE winter_players RESTART IDENTITY CASCADE;
TRUNCATE TABLE winter_scores RESTART IDENTITY CASCADE;

-- Add missing columns
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS has_snake BOOLEAN DEFAULT false;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS has_camel BOOLEAN DEFAULT false;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE winter_competitions ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE winter_players ADD COLUMN IF NOT EXISTS season TEXT;

-- Fix winter_scores competition_id type (handle conversion safely)
ALTER TABLE winter_scores DROP COLUMN IF EXISTS competition_id;
ALTER TABLE winter_scores ADD COLUMN competition_id UUID;

ALTER TABLE matchplay_tournaments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
