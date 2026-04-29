-- ============================================================================
-- WAGS Golf League Database Schema
-- Optimized for performance, security, and maintainability
-- Run this in your new Supabase project's SQL Editor
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'committee', 'player');
CREATE TYPE competition_status AS ENUM ('open', 'closed', 'finalized', 'cancelled');
CREATE TYPE transaction_type AS ENUM ('entry_fee', 'prize_winnings', 'snake_penalty', 'camel_penalty', 'manual_adjustment');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Seasons table - defines golf league seasons
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL CHECK (length(name) >= 3),
    start_year INTEGER NOT NULL CHECK (start_year >= 2020 AND start_year <= 2100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL CHECK (end_date > start_date),
    is_current BOOLEAN DEFAULT false,
    entry_fee DECIMAL(10,2) DEFAULT 0 CHECK (entry_fee >= 0),
    snake_penalty DECIMAL(10,2) DEFAULT 5.00 CHECK (snake_penalty >= 0),
    camel_penalty DECIMAL(10,2) DEFAULT 2.00 CHECK (camel_penalty >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_season_year UNIQUE (start_year)
);

-- Profiles table - user accounts and player information
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE, -- Links to Supabase auth.users.id
    full_name TEXT NOT NULL CHECK (length(full_name) >= 2),
    email TEXT UNIQUE NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    phone TEXT CHECK (phone ~* '^\+?[0-9\s\-\(\)]{10,}$'),
    role user_role DEFAULT 'player',
    
    -- Handicap information
    starting_handicap DECIMAL(4,1) CHECK (starting_handicap >= -10 AND starting_handicap <= 54),
    current_handicap DECIMAL(4,1) CHECK (current_handicap >= -10 AND current_handicap <= 54),
    
    -- League information
    league_name TEXT,
    home_club TEXT,
    
    -- Preferences
    is_active BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Competitions table - individual golf competitions/events
CREATE TABLE competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) >= 3),
    competition_date DATE NOT NULL,
    status competition_status DEFAULT 'open',
    
    -- Scoring and prizes
    prize_pot DECIMAL(10,2) DEFAULT 0 CHECK (prize_pot >= 0),
    rollover_amount DECIMAL(10,2) DEFAULT 0 CHECK (rollover_amount >= 0),
    entry_fee DECIMAL(10,2) DEFAULT 0 CHECK (entry_fee >= 0),
    
    -- Competition details
    course_name TEXT,
    tee_time_start TIME,
    max_players INTEGER CHECK (max_players > 0),
    
    -- Results
    winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    second_place_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_competition_date_per_season UNIQUE (season_id, competition_date)
);

-- Rounds table - individual player scores for competitions
CREATE TABLE rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Scoring
    stableford_score INTEGER CHECK (stableford_score >= 0),
    gross_score INTEGER CHECK (gross_score > 0),
    net_score INTEGER CHECK (net_score >= 0),
    strokes_received INTEGER CHECK (strokes_received >= 0),
    
    -- Penalties and prizes
    has_snake BOOLEAN DEFAULT false,
    has_camel BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT false,
    
    -- Round details
    tee_time TIME,
    group_number INTEGER CHECK (group_number > 0),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_competition UNIQUE (competition_id, user_id)
);

-- ============================================================================
-- HANDICAP AND FINANCIAL TABLES
-- ============================================================================

-- Handicap history table - tracks all handicap adjustments
CREATE TABLE handicap_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
    
    -- Handicap values
    old_handicap DECIMAL(4,1) CHECK (old_handicap >= -10 AND old_handicap <= 54),
    adjustment DECIMAL(4,1) CHECK (adjustment >= -54 AND adjustment <= 54),
    new_handicap DECIMAL(4,1) CHECK (new_handicap >= -10 AND new_handicap <= 54),
    
    -- Adjustment details
    reason TEXT NOT NULL,
    adjustment_type TEXT DEFAULT 'automatic' CHECK (adjustment_type IN ('automatic', 'manual', 'appeal')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_handicap_change CHECK (new_handicap = old_handicap + adjustment)
);

-- Financial transactions table - tracks all money movements
CREATE TABLE financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
    
    -- Transaction details
    amount DECIMAL(10,2) NOT NULL CHECK (amount != 0),
    type transaction_type NOT NULL,
    description TEXT,
    
    -- Payment processing
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_transaction_amount CHECK (
        (type = 'prize_winnings' AND amount > 0) OR
        (type IN ('entry_fee', 'snake_penalty', 'camel_penalty') AND amount < 0) OR
        (type = 'manual_adjustment')
    )
);

-- Season league memberships table - tracks player participation per season
CREATE TABLE season_league_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Membership details
    league_name TEXT NOT NULL,
    membership_status TEXT DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive', 'suspended')),
    
    -- Season-specific handicap
    season_start_handicap DECIMAL(4,1) CHECK (season_start_handicap >= -10 AND season_start_handicap <= 54),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_season_user_membership UNIQUE (season_id, user_id)
);

-- ============================================================================
-- WINTER LEAGUE TABLES
-- ============================================================================

-- Winter competitions table
CREATE TABLE winter_competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL CHECK (length(name) >= 3),
    competition_date DATE NOT NULL,
    status competition_status DEFAULT 'open',
    
    -- Winter-specific settings
    season_year INTEGER NOT NULL CHECK (season_year >= 2020 AND season_year <= 2100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Winter players table
CREATE TABLE winter_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Winter league details
    league_name TEXT NOT NULL,
    season_year INTEGER NOT NULL CHECK (season_year >= 2020 AND season_year <= 2100),
    
    -- Winter-specific handicap
    winter_handicap DECIMAL(4,1) CHECK (winter_handicap >= -10 AND winter_handicap <= 54),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_winter_player UNIQUE (user_id, season_year)
);

-- Winter scores table
CREATE TABLE winter_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES winter_players(id) ON DELETE CASCADE,
    competition_id UUID NOT NULL REFERENCES winter_competitions(id) ON DELETE CASCADE,
    
    -- Scoring
    score INTEGER NOT NULL CHECK (score > 0),
    stableford_points INTEGER CHECK (stableford_points >= 0),
    
    -- Performance tracking
    position INTEGER CHECK (position > 0),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_winter_score UNIQUE (competition_id, user_id)
);

-- ============================================================================
-- MATCH PLAY AND ADDITIONAL FEATURES
-- ============================================================================

-- Match play tournaments table
CREATE TABLE matchplay_tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL CHECK (length(name) >= 3),
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
    
    -- Tournament details
    start_date DATE NOT NULL,
    end_date DATE NOT NULL CHECK (end_date >= start_date),
    format TEXT DEFAULT 'matchplay' CHECK (format IN ('matchplay', 'strokeplay', 'stableford')),
    
    -- Tournament status
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Match play matches table
CREATE TABLE matchplay_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES matchplay_tournaments(id) ON DELETE CASCADE,
    
    -- Players
    player1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Match details
    round_number INTEGER NOT NULL CHECK (round_number > 0),
    match_date DATE,
    tee_time TIME,
    
    -- Results
    player1_score INTEGER CHECK (player1_score >= 0),
    player2_score INTEGER CHECK (player2_score >= 0),
    winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Match status
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_tournament_round_match UNIQUE (tournament_id, round_number, player1_id, player2_id),
    CONSTRAINT different_players CHECK (player1_id != player2_id)
);

-- ============================================================================
-- CONTENT AND ADMINISTRATION TABLES
-- ============================================================================

-- Announcements table
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL CHECK (length(title) >= 3),
    message TEXT NOT NULL CHECK (length(message) >= 10),
    
    -- Announcement settings
    type TEXT DEFAULT 'general' CHECK (type IN ('general', 'competition', 'handicap', 'financial')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- Publishing
    is_published BOOLEAN DEFAULT false,
    publish_date TIMESTAMP WITH TIME ZONE,
    expire_date TIMESTAMP WITH TIME ZONE,
    
    -- Author
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Archives table - for historical data and records
CREATE TABLE archives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL CHECK (length(title) >= 3),
    content TEXT NOT NULL,
    
    -- Archive details
    category TEXT DEFAULT 'general' CHECK (category IN ('general', 'competition_results', 'handicap_records', 'financial_records')),
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
    
    -- Document metadata
    document_type TEXT DEFAULT 'text' CHECK (document_type IN ('text', 'pdf', 'image', 'spreadsheet')),
    file_path TEXT,
    
    -- Publishing
    is_public BOOLEAN DEFAULT true,
    
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Core performance indexes
CREATE INDEX idx_seasons_current ON seasons(is_current) WHERE is_current = true;
CREATE INDEX idx_seasons_year_range ON seasons(start_year, start_date, end_date);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role ON profiles(role) WHERE role IN ('admin', 'committee');
CREATE INDEX idx_profiles_active ON profiles(is_active) WHERE is_active = true;
CREATE INDEX idx_profiles_handicap ON profiles(current_handicap);

CREATE INDEX idx_competitions_season_date ON competitions(season_id, competition_date DESC);
CREATE INDEX idx_competitions_status ON competitions(status) WHERE status IN ('open', 'closed');
CREATE INDEX idx_competitions_date_range ON competitions(competition_date) WHERE competition_date >= CURRENT_DATE - INTERVAL '1 year';

CREATE INDEX idx_rounds_competition_user ON rounds(competition_id, user_id);
CREATE INDEX idx_rounds_user_competition ON rounds(user_id, competition_id);
CREATE INDEX idx_rounds_scores ON rounds(stableford_score DESC) WHERE stableford_score IS NOT NULL;
CREATE INDEX idx_rounds_penalties ON rounds(competition_id, has_snake, has_camel) WHERE has_snake = true OR has_camel = true;

CREATE INDEX idx_handicap_history_user_date ON handicap_history(user_id, created_at DESC);
CREATE INDEX idx_handicap_history_competition ON handicap_history(competition_id) WHERE competition_id IS NOT NULL;

CREATE INDEX idx_financial_transactions_user_date ON financial_transactions(user_id, created_at DESC);
CREATE INDEX idx_financial_transactions_competition ON financial_transactions(competition_id) WHERE competition_id IS NOT NULL;
CREATE INDEX idx_financial_transactions_type_amount ON financial_transactions(type, amount);

CREATE INDEX idx_season_memberships_season ON season_league_memberships(season_id, membership_status);
CREATE INDEX idx_season_memberships_user ON season_league_memberships(user_id, season_id);

-- Winter league indexes
CREATE INDEX idx_winter_competitions_year ON winter_competitions(season_year, competition_date DESC);
CREATE INDEX idx_winter_players_year ON winter_players(season_year);
CREATE INDEX idx_winter_scores_competition ON winter_scores(competition_id);

-- Match play indexes
CREATE INDEX idx_matchplay_tournaments_season ON matchplay_tournaments(season_id, status);
CREATE INDEX idx_matchplay_matches_tournament ON matchplay_matches(tournament_id, round_number, status);
CREATE INDEX idx_matchplay_matches_players ON matchplay_matches(player1_id, player2_id);

-- Content indexes
CREATE INDEX idx_announcements_published ON announcements(is_published, publish_date DESC) WHERE is_published = true;
CREATE INDEX idx_announcements_priority ON announcements(priority, publish_date DESC) WHERE is_published = true;
CREATE INDEX idx_archives_category ON archives(category, is_public) WHERE is_public = true;

-- ============================================================================
-- DATABASE TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_competitions_updated_at BEFORE UPDATE ON competitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rounds_updated_at BEFORE UPDATE ON rounds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_season_memberships_updated_at BEFORE UPDATE ON season_league_memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_winter_competitions_updated_at BEFORE UPDATE ON winter_competitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_winter_players_updated_at BEFORE UPDATE ON winter_players FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_matchplay_tournaments_updated_at BEFORE UPDATE ON matchplay_tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_matchplay_matches_updated_at BEFORE UPDATE ON matchplay_matches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_archives_updated_at BEFORE UPDATE ON archives FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically calculate net score
CREATE OR REPLACE FUNCTION calculate_net_score()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.gross_score IS NOT NULL AND NEW.strokes_received IS NOT NULL THEN
        NEW.net_score = NEW.gross_score - NEW.strokes_received;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_round_net_score BEFORE INSERT OR UPDATE ON rounds FOR EACH ROW EXECUTE FUNCTION calculate_net_score();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_league_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE winter_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchplay_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchplay_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE archives ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can manage all profiles" ON profiles FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

-- Competitions policies
CREATE POLICY "Competitions are viewable by everyone" ON competitions FOR SELECT USING (true);
CREATE POLICY "Admins can manage competitions" ON competitions FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

-- Rounds policies
CREATE POLICY "Rounds are viewable by everyone" ON rounds FOR SELECT USING (true);
CREATE POLICY "Admins can manage all rounds" ON rounds FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);
CREATE POLICY "Users can manage their own rounds" ON rounds FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Handicap history policies
CREATE POLICY "Handicap history is viewable by everyone" ON handicap_history FOR SELECT USING (true);
CREATE POLICY "Admins can manage handicap history" ON handicap_history FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

-- Financial transactions policies
CREATE POLICY "Users can view own transactions" ON financial_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all transactions" ON financial_transactions FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);
CREATE POLICY "Admins can manage transactions" ON financial_transactions FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

-- Season memberships policies
CREATE POLICY "Season memberships are viewable by everyone" ON season_league_memberships FOR SELECT USING (true);
CREATE POLICY "Admins can manage season memberships" ON season_league_memberships FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

-- Content policies
CREATE POLICY "Published announcements are viewable by everyone" ON announcements FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can manage announcements" ON announcements FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

CREATE POLICY "Public archives are viewable by everyone" ON archives FOR SELECT USING (is_public = true);
CREATE POLICY "Admins can manage archives" ON archives FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

-- Winter league policies
CREATE POLICY "Winter competitions are viewable by everyone" ON winter_competitions FOR SELECT USING (true);
CREATE POLICY "Winter data is manageable by admins" ON winter_competitions FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

CREATE POLICY "Winter players are viewable by everyone" ON winter_players FOR SELECT USING (true);
CREATE POLICY "Winter scores are viewable by everyone" ON winter_scores FOR SELECT USING (true);

-- Match play policies
CREATE POLICY "Match play tournaments are viewable by everyone" ON matchplay_tournaments FOR SELECT USING (true);
CREATE POLICY "Match play matches are viewable by everyone" ON matchplay_matches FOR SELECT USING (true);
CREATE POLICY "Admins can manage match play" ON matchplay_tournaments FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);
CREATE POLICY "Admins can manage match play matches" ON matchplay_matches FOR ALL USING (
    auth.jwt() ->> 'role' IN ('admin', 'committee')
);

-- ============================================================================
-- VIEWS FOR COMPLEX QUERIES
-- ============================================================================

-- Competition results summary view
CREATE VIEW competition_results_summary AS
SELECT 
    c.id as competition_id,
    c.name as competition_name,
    c.competition_date,
    c.status,
    c.season_id,
    s.name as season_name,
    s.start_year,
    
    -- Participant counts
    COUNT(r.id) as total_players,
    COUNT(CASE WHEN r.stableford_score IS NOT NULL THEN 1 END) as scored_players,
    
    -- Score statistics
    CASE 
        WHEN COUNT(CASE WHEN r.stableford_score IS NOT NULL THEN 1 END) > 0
        THEN ROUND(AVG(r.stableford_score), 2)
        ELSE NULL
    END as avg_stableford_score,
    
    CASE 
        WHEN COUNT(CASE WHEN r.stableford_score IS NOT NULL THEN 1 END) > 0
        THEN MAX(r.stableford_score)
        ELSE NULL
    END as max_stableford_score,
    
    -- Penalties
    COUNT(CASE WHEN r.has_snake = true THEN 1 END) as snake_count,
    COUNT(CASE WHEN r.has_camel = true THEN 1 END) as camel_count,
    
    -- Financial summary
    COALESCE(SUM(CASE WHEN ft.type = 'entry_fee' THEN ft.amount ELSE 0 END), 0) as total_entry_fees,
    COALESCE(SUM(CASE WHEN ft.type = 'prize_winnings' THEN ft.amount ELSE 0 END), 0) as total_prizes,
    
    -- Winners
    p1.full_name as winner_name,
    p2.full_name as second_place_name,
    
    c.created_at
    
FROM competitions c
LEFT JOIN seasons s ON c.season_id = s.id
LEFT JOIN rounds r ON c.id = r.competition_id
LEFT JOIN profiles p1 ON c.winner_id = p1.id
LEFT JOIN profiles p2 ON c.second_place_id = p2.id
LEFT JOIN financial_transactions ft ON c.id = ft.competition_id AND ft.type = 'entry_fee'

GROUP BY c.id, c.name, c.competition_date, c.status, c.season_id, 
         s.name, s.start_year, p1.full_name, p2.full_name, c.created_at;

-- Player season performance view
CREATE VIEW player_season_performance AS
SELECT 
    p.id as player_id,
    p.full_name,
    p.current_handicap,
    slm.season_id,
    s.start_year,
    slm.league_name,
    
    -- Participation stats
    COUNT(DISTINCT c.id) as competitions_played,
    COUNT(DISTINCT CASE WHEN c.status = 'closed' THEN c.id END) as competitions_completed,
    
    -- Scoring stats
    COUNT(r.id) as rounds_played,
    CASE 
        WHEN COUNT(r.id) > 0
        THEN ROUND(AVG(r.stableford_score), 2)
        ELSE NULL
    END as avg_stableford_score,
    
    CASE 
        WHEN COUNT(r.id) > 0
        THEN MAX(r.stableford_score)
        ELSE NULL
    END as best_stableford_score,
    
    -- Penalties
    COUNT(CASE WHEN r.has_snake = true THEN 1 END) as total_snakes,
    COUNT(CASE WHEN r.has_camel = true THEN 1 END) as total_cameles,
    
    -- Handicap changes
    hh.old_handicap as season_start_handicap,
    hh.new_handicap as season_end_handicap,
    CASE 
        WHEN hh.old_handicap IS NOT NULL AND hh.new_handicap IS NOT NULL
        THEN hh.new_handicap - hh.old_handicap
        ELSE 0
    END as handicap_change,
    
    -- Financial summary
    COALESCE(SUM(CASE WHEN ft.amount > 0 THEN ft.amount ELSE 0 END), 0) as total_winnings,
    COALESCE(SUM(CASE WHEN ft.amount < 0 THEN ABS(ft.amount) ELSE 0 END), 0) as total_fees,
    
    slm.created_at as season_joined_at

FROM profiles p
JOIN season_league_memberships slm ON p.id = slm.user_id
JOIN seasons s ON slm.season_id = s.id
LEFT JOIN competitions c ON s.id = c.season_id
LEFT JOIN rounds r ON c.id = r.competition_id AND r.user_id = p.id
LEFT JOIN financial_transactions ft ON p.id = ft.user_id
LEFT JOIN LATERAL (
    SELECT DISTINCT ON (user_id) 
        old_handicap, new_handicap
    FROM handicap_history hh2 
    WHERE hh2.user_id = p.id 
    ORDER BY created_at ASC
) hh ON true

GROUP BY p.id, p.full_name, p.current_handicap, slm.season_id, s.start_year, 
         slm.league_name, hh.old_handicap, hh.new_handicap, slm.created_at;

-- ============================================================================
-- STORED PROCEDURES FOR COMMON OPERATIONS
-- ============================================================================

-- Calculate and update competition results
CREATE OR REPLACE FUNCTION calculate_competition_results(p_competition_id UUID)
RETURNS TABLE (
    winner_id UUID,
    second_place_id UUID,
    winner_name TEXT,
    second_place_name TEXT,
    total_players INTEGER,
    avg_score DECIMAL,
    snake_count INTEGER,
    camel_count INTEGER
) AS $$
DECLARE
    v_season_id UUID;
BEGIN
    -- Get the season for validation
    SELECT season_id INTO v_season_id 
    FROM competitions 
    WHERE id = p_competition_id;
    
    IF v_season_id IS NULL THEN
        RAISE EXCEPTION 'Competition not found';
    END IF;
    
    -- Return calculated results
    RETURN QUERY
    SELECT 
        sub.winner_id,
        sub.second_place_id,
        p1.full_name as winner_name,
        p2.full_name as second_place_name,
        sub.total_players,
        sub.avg_score,
        sub.snake_count,
        sub.camel_count
    FROM (
        SELECT 
            FIRST_VALUE(r.user_id) OVER (ORDER BY r.stableford_score DESC NULLS LAST) as winner_id,
            FIRST_VALUE(r.user_id) OVER (ORDER BY r.stableford_score DESC NULLS LAST 
                                         ROWS BETWEEN 1 FOLLOWING AND 1 FOLLOWING) as second_place_id,
            COUNT(*) as total_players,
            ROUND(AVG(r.stableford_score), 2) as avg_score,
            COUNT(CASE WHEN r.has_snake = true THEN 1 END) as snake_count,
            COUNT(CASE WHEN r.has_camel = true THEN 1 END) as camel_count
        FROM rounds r
        WHERE r.competition_id = p_competition_id
            AND r.stableford_score IS NOT NULL
        GROUP BY r.competition_id
    ) sub
    LEFT JOIN profiles p1 ON sub.winner_id = p1.id
    LEFT JOIN profiles p2 ON sub.second_place_id = p2.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update player handicap based on competition performance
CREATE OR REPLACE FUNCTION update_player_handicap(
    p_user_id UUID, 
    p_competition_id UUID,
    p_new_handicap DECIMAL,
    p_reason TEXT DEFAULT 'Competition adjustment'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_handicap DECIMAL;
    v_adjustment DECIMAL;
BEGIN
    -- Get current handicap
    SELECT current_handicap INTO v_current_handicap
    FROM profiles
    WHERE id = p_user_id;
    
    IF v_current_handicap IS NULL THEN
        RAISE EXCEPTION 'Player not found or no handicap set';
    END IF;
    
    -- Calculate adjustment
    v_adjustment := p_new_handicap - v_current_handicap;
    
    -- Insert handicap history record
    INSERT INTO handicap_history (
        user_id, 
        competition_id, 
        old_handicap, 
        adjustment, 
        new_handicap, 
        reason
    ) VALUES (
        p_user_id,
        p_competition_id,
        v_current_handicap,
        v_adjustment,
        p_new_handicap,
        p_reason
    );
    
    -- Update player's current handicap
    UPDATE profiles 
    SET current_handicap = p_new_handicap
    WHERE id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Insert sample season
INSERT INTO seasons (name, start_year, start_date, end_date, is_current, entry_fee, snake_penalty, camel_penalty)
VALUES (
    '2026 WAGS Season',
    2026,
    '2026-04-01',
    '2026-10-31',
    true,
    20.00,
    5.00,
    2.00
) ON CONFLICT (start_year) DO NOTHING;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'WAGS Database Schema setup completed successfully!';
    RAISE NOTICE 'Tables created: 15';
    RAISE NOTICE 'Indexes created: 25+';
    RAISE NOTICE 'Views created: 2';
    RAISE NOTICE 'Stored procedures: 2';
    RAISE NOTICE 'RLS policies: 20+';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Set up Supabase Auth configuration';
    RAISE NOTICE '2. Create admin user accounts';
    RAISE NOTICE '3. Test RLS policies';
    RAISE NOTICE '4. Set up Edge Functions if needed';
END $$;
