-- SQL Schema for WAGS Golf League Database
-- Run this in your new Supabase project's SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Seasons table
CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    start_year INTEGER,
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profiles table (users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    role TEXT DEFAULT 'player' CHECK (role IN ('admin', 'committee', 'player')),
    starting_handicap DECIMAL(4,1),
    current_handicap DECIMAL(4,1),
    league_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitions table
CREATE TABLE IF NOT EXISTS competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    competition_date DATE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'finalized')),
    winner_id UUID REFERENCES profiles(id),
    prize_pot DECIMAL(10,2) DEFAULT 0,
    rollover_amount DECIMAL(10,2) DEFAULT 0,
    season TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rounds table (individual scores)
CREATE TABLE IF NOT EXISTS rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    competition_id UUID REFERENCES competitions(id),
    stableford_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    has_snake BOOLEAN DEFAULT false,
    has_camel BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false
);

-- Handicap history table
CREATE TABLE IF NOT EXISTS handicap_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES profiles(id),
    competition_id UUID REFERENCES competitions(id),
    old_handicap DECIMAL(4,1),
    adjustment DECIMAL(4,1),
    new_handicap DECIMAL(4,1),
    reason TEXT
);

-- Financial transactions table
CREATE TABLE IF NOT EXISTS financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES profiles(id),
    competition_id UUID REFERENCES competitions(id),
    amount DECIMAL(10,2),
    type TEXT,
    description TEXT
);

-- Season league memberships table
CREATE TABLE IF NOT EXISTS season_league_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID REFERENCES seasons(id),
    user_id UUID REFERENCES profiles(id),
    league_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Winter competitions table
CREATE TABLE IF NOT EXISTS winter_competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    competition_date DATE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Winter players table
CREATE TABLE IF NOT EXISTS winter_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id),
    league_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Winter scores table
CREATE TABLE IF NOT EXISTS winter_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES winter_players(id),
    competition_id UUID REFERENCES winter_competitions(id),
    score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Match play tournaments table
CREATE TABLE IF NOT EXISTS matchplay_tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Archives table
CREATE TABLE IF NOT EXISTS archives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_competitions_date ON competitions(competition_date);
CREATE INDEX IF NOT EXISTS idx_rounds_user_competition ON rounds(user_id, competition_id);
CREATE INDEX IF NOT EXISTS idx_handicap_history_user_date ON handicap_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (adjust as needed)
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Competitions are viewable by everyone" ON competitions FOR SELECT USING (true);
CREATE POLICY "Admins can manage competitions" ON competitions FOR ALL USING (auth.jwt() ->> 'role' IN ('admin', 'committee'));

CREATE POLICY "Rounds are viewable by everyone" ON rounds FOR SELECT USING (true);
CREATE POLICY "Admins can manage rounds" ON rounds FOR ALL USING (auth.jwt() ->> 'role' IN ('admin', 'committee'));

-- You may need to adjust RLS policies based on your auth setup
