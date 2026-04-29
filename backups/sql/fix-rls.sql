-- Fix Row Level Security policies for migration
-- Run this in your new Supabase project's SQL Editor

-- Disable RLS temporarily for migration
ALTER TABLE seasons DISABLE ROW LEVEL SECURITY;
ALTER TABLE competitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE season_league_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE winter_competitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE winter_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE winter_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE matchplay_tournaments DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Competitions are viewable by everyone" ON competitions;
DROP POLICY IF EXISTS "Admins can manage competitions" ON competitions;
DROP POLICY IF EXISTS "Rounds are viewable by everyone" ON rounds;
DROP POLICY IF EXISTS "Admins can manage rounds" ON rounds;

-- Re-enable RLS with permissive policies for migration
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_league_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchplay_tournaments ENABLE ROW LEVEL SECURITY;

-- Allow all operations during migration (will be tightened later)
CREATE POLICY "Enable all for migration" ON seasons FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON competitions FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON rounds FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON handicap_history FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON financial_transactions FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON season_league_memberships FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON winter_competitions FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON winter_players FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON winter_scores FOR ALL USING (true);
CREATE POLICY "Enable all for migration" ON matchplay_tournaments FOR ALL USING (true);
