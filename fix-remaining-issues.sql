-- Fix remaining migration issues
-- Run this in your new Supabase project's SQL Editor

-- Fix profiles table - remove unique constraint temporarily
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey;

-- Add missing columns to rounds table
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS has_snake BOOLEAN DEFAULT false;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS has_camel BOOLEAN DEFAULT false;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

-- Add missing columns to financial_transactions
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Fix winter_scores competition_id type
ALTER TABLE winter_scores ALTER COLUMN competition_id TYPE UUID USING competition_id::uuid;

-- Add missing columns to winter_competitions
ALTER TABLE winter_competitions ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Add missing columns to winter_players
ALTER TABLE winter_players ADD COLUMN IF NOT EXISTS season TEXT;

-- Add missing columns to matchplay_tournaments
ALTER TABLE matchplay_tournaments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';

-- Recreate profiles primary key after data is loaded
ALTER TABLE profiles ADD PRIMARY KEY (id);
