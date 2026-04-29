-- Fix foreign key constraints before dropping profiles primary key
-- Run this in your new Supabase project's SQL Editor

-- Drop foreign key constraints first
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS competitions_winner_id_fkey;
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_user_id_fkey;
ALTER TABLE handicap_history DROP CONSTRAINT IF EXISTS handicap_history_user_id_fkey;
ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_user_id_fkey;
ALTER TABLE season_league_memberships DROP CONSTRAINT IF EXISTS season_league_memberships_user_id_fkey;
ALTER TABLE winter_players DROP CONSTRAINT IF EXISTS winter_players_user_id_fkey;

-- Now drop the profiles primary key
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

-- Recreate primary key
ALTER TABLE profiles ADD PRIMARY KEY (id);

-- Recreate foreign key constraints
ALTER TABLE competitions ADD CONSTRAINT competitions_winner_id_fkey 
  FOREIGN KEY (winner_id) REFERENCES profiles(id);

ALTER TABLE rounds ADD CONSTRAINT rounds_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id);

ALTER TABLE handicap_history ADD CONSTRAINT handicap_history_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id);

ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id);

ALTER TABLE season_league_memberships ADD CONSTRAINT season_league_memberships_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id);

ALTER TABLE winter_players ADD CONSTRAINT winter_players_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES profiles(id);
