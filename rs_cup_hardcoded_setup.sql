-- RS Cup Hardcoded Setup - Ready to Run
-- Creates tournament and all matches with hardcoded values

-- ================================================================
-- STEP 1: Create Tournament
-- ================================================================
INSERT INTO matchplay_tournaments (id, name, status, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Wags R/S Cup 2026',
  'active',
  '2026-05-02'
);

-- ================================================================
-- STEP 2: Create First Round Matches
-- ================================================================
INSERT INTO matchplay_matches (id, tournament_id, round_number, player1_id, player2_id, status, created_at) VALUES
-- Match 1: A Mosson v James Harrison
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'p1-mosson', 'p1-harrison', 'pending', '2026-05-02'),

-- Match 2: R Kelly v Robbo
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 1, 'p1-kelly', 'p1-robbo', 'pending', '2026-05-02'),

-- Match 3: Rochey v Suchy
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 1, 'p1-rochey', 'p1-suchy', 'pending', '2026-05-02'),

-- Match 4: C Rowe v R Shaw
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 1, 'p1-rowe', 'p1-shaw', 'pending', '2026-05-02'),

-- Match 5: Ashley v James Simmons
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 1, 'p1-ashley', 'p1-simmons', 'pending', '2026-05-02'),

-- Match 6: Martin S v Ian Ind
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 1, 'p1-martin', 'p1-ian', 'pending', '2026-05-02'),

-- Match 7: Mick H v Nick S
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 1, 'p1-mick', 'p1-nick', 'pending', '2026-05-02'),

-- Match 8: Boardsey v Pimmsey
('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 1, 'p1-boardsey', 'p1-pimmsey', 'pending', '2026-05-02'),

-- Match 9: Tealey v Tom G
('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 1, 'p1-tealey', 'p1-tomg', 'pending', '2026-05-02'),

-- Match 10: Howla v John M
('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 1, 'p1-howla', 'p1-johnm', 'pending', '2026-05-02');

-- ================================================================
-- STEP 3: Create Quarter Finals (Round 2) - 5 matches
-- ================================================================
INSERT INTO matchplay_matches (id, tournament_id, round_number, status, created_at) VALUES
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'pending', '2026-05-02'),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 2, 'pending', '2026-05-02'),
('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 2, 'pending', '2026-05-02'),
('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 2, 'pending', '2026-05-02'),
('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 2, 'pending', '2026-05-02');

-- ================================================================
-- STEP 4: Create Semi Finals (Round 3) - 2 matches
-- ================================================================
INSERT INTO matchplay_matches (id, tournament_id, round_number, status, created_at) VALUES
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 3, 'pending', '2026-05-02'),
('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 3, 'pending', '2026-05-02');

-- ================================================================
-- STEP 5: Create Final (Round 4) - 1 match
-- ================================================================
INSERT INTO matchplay_matches (id, tournament_id, round_number, status, created_at) VALUES
('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 4, 'pending', '2026-05-02');

-- ================================================================
-- STEP 6: Create Dummy Profiles for Testing
-- ================================================================
INSERT INTO profiles (id, full_name, role, starting_handicap, current_handicap) VALUES
('p1-mosson', 'A Mosson', 'player', 12, 12),
('p1-harrison', 'James Harrison', 'player', 15, 15),
('p1-kelly', 'R Kelly', 'player', 8, 8),
('p1-robbo', 'Robbo', 'player', 18, 18),
('p1-rochey', 'Rochey', 'player', 10, 10),
('p1-suchy', 'Suchy', 'player', 14, 14),
('p1-rowe', 'C Rowe', 'player', 20, 20),
('p1-shaw', 'R Shaw', 'player', 9, 9),
('p1-ashley', 'Ashley', 'player', 11, 11),
('p1-simmons', 'James Simmons', 'player', 16, 16),
('p1-martin', 'Martin S', 'player', 13, 13),
('p1-ian', 'Ian Ind', 'player', 17, 17),
('p1-mick', 'Mick H', 'player', 7, 7),
('p1-nick', 'Nick S', 'player', 19, 19),
('p1-boardsey', 'Boardsey', 'player', 22, 22),
('p1-pimmsey', 'Pimmsey', 'player', 6, 6),
('p1-tealey', 'Tealey', 'player', 21, 21),
('p1-tomg', 'Tom G', 'player', 5, 5),
('p1-howla', 'Howla', 'player', 24, 24),
('p1-johnm', 'John M', 'player', 25, 25);

-- ================================================================
-- STEP 7: Verification Query
-- ================================================================
-- Check tournament setup
SELECT 
  t.name as tournament_name,
  t.status,
  COUNT(m.id) as total_matches,
  COUNT(CASE WHEN m.round_number = 1 THEN 1 END) as first_round_matches,
  COUNT(CASE WHEN m.winner_id IS NOT NULL THEN 1 END) as completed_matches
FROM matchplay_tournaments t
LEFT JOIN matchplay_matches m ON t.id = m.tournament_id
WHERE t.id = '00000000-0000-0000-0000-000000000001'
GROUP BY t.id, t.name, t.status;

-- View first round matches with player names
SELECT 
  m.round_number,
  p1.full_name as player1_name,
  p2.full_name as player2_name,
  m.status
FROM matchplay_matches m
LEFT JOIN profiles p1 ON m.player1_id = p1.id
LEFT JOIN profiles p2 ON m.player2_id = p2.id
WHERE m.tournament_id = '00000000-0000-0000-0000-000000000001' AND m.round_number = 1
ORDER BY m.created_at;
