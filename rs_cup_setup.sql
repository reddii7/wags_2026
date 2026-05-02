-- RS Cup Tournament Setup Script
-- Creates tournament and first round matches for the Wags R/S Cup
-- Deadline: Matches to be played by 19th May

-- ================================================================
-- STEP 1: Create Tournament
-- ================================================================
INSERT INTO matchplay_tournaments (name, status, created_at)
VALUES (
  'Wags R/S Cup 2026',
  'active',
  CURRENT_DATE
)
RETURNING id;

-- Get the tournament ID (replace with actual ID from above)
-- For this script, we'll use a placeholder - replace with actual ID
-- Let's assume the tournament ID is: [TO_BE_REPLACED]

-- ================================================================
-- STEP 2: Create First Round Matches
-- ================================================================
-- Note: You'll need to match player names to actual profile IDs in your database
-- Replace the player_id placeholders with actual UUIDs from the profiles table

-- First, let's find the profile IDs for each player:
-- SELECT id, full_name FROM profiles WHERE full_name IN (
--   'A Mosson', 'James Harrison', 'R Kelly', 'Robbo', 'Rochey', 'Suchy',
--   'C Rowe', 'R Shaw', 'Ashley', 'James Simmons', 'Martin S', 'Ian Ind',
--   'Mick H', 'Nick S', 'Boardsey', 'Pimmsey', 'Tealey', 'Tom G',
--   'Howla', 'John M'
-- );

-- Then insert the matches (replace [TOURNAMENT_ID] and player_id placeholders):
INSERT INTO matchplay_matches (
  tournament_id,
  round_number,
  player1_id,
  player2_id,
  status,
  created_at
) VALUES 
  -- Match 1: A Mosson v James Harrison
  ([TOURNAMENT_ID], 1, '[A_MOSSON_ID]', '[JAMES_HARRISON_ID]', 'pending', CURRENT_DATE),
  
  -- Match 2: R Kelly v Robbo
  ([TOURNAMENT_ID], 1, '[R_KELLY_ID]', '[ROBBO_ID]', 'pending', CURRENT_DATE),
  
  -- Match 3: Rochey v Suchy
  ([TOURNAMENT_ID], 1, '[ROCHEY_ID]', '[SUCHY_ID]', 'pending', CURRENT_DATE),
  
  -- Match 4: C Rowe v R Shaw
  ([TOURNAMENT_ID], 1, '[C_ROWE_ID]', '[R_SHAW_ID]', 'pending', CURRENT_DATE),
  
  -- Match 5: Ashley v James Simmons
  ([TOURNAMENT_ID], 1, '[ASHLEY_ID]', '[JAMES_SIMMONS_ID]', 'pending', CURRENT_DATE),
  
  -- Match 6: Martin S v Ian Ind
  ([TOURNAMENT_ID], 1, '[MARTIN_S_ID]', '[IAN_IND_ID]', 'pending', CURRENT_DATE),
  
  -- Match 7: Mick H v Nick S
  ([TOURNAMENT_ID], 1, '[MICK_H_ID]', '[NICK_S_ID]', 'pending', CURRENT_DATE),
  
  -- Match 8: Boardsey v Pimmsey
  ([TOURNAMENT_ID], 1, '[BOARDSEY_ID]', '[PIMMSEY_ID]', 'pending', CURRENT_DATE),
  
  -- Match 9: Tealey v Tom G
  ([TOURNAMENT_ID], 1, '[TEALEY_ID]', '[TOM_G_ID]', 'pending', CURRENT_DATE),
  
  -- Match 10: Howla v John M
  ([TOURNAMENT_ID], 1, '[HOWLA_ID]', '[JOHN_M_ID]', 'pending', CURRENT_DATE);

-- ================================================================
-- STEP 3: Verification Queries
-- ================================================================

-- Check tournament was created
SELECT * FROM matchplay_tournaments WHERE name = 'Wags R/S Cup 2026';

-- Check all matches were created
SELECT 
  mm.id,
  mm.round_number,
  p1.full_name as player1_name,
  p2.full_name as player2_name,
  mm.status
FROM matchplay_matches mm
LEFT JOIN profiles p1 ON mm.player1_id = p1.id
LEFT JOIN profiles p2 ON mm.player2_id = p2.id
WHERE mm.tournament_id = [TOURNAMENT_ID]
ORDER BY mm.round_number, mm.created_at;

-- ================================================================
-- STEP 4: Tournament Structure Setup (for future rounds)
-- ================================================================

-- This creates the structure for subsequent rounds
-- Quarter Finals (Round 2) - 5 matches (winners + 3 byes)
INSERT INTO matchplay_matches (
  tournament_id,
  round_number,
  status,
  created_at
) 
SELECT 
  [TOURNAMENT_ID],
  2,
  'pending',
  CURRENT_DATE
FROM generate_series(1, 5);

-- Semi Finals (Round 3) - 2 matches
INSERT INTO matchplay_matches (
  tournament_id,
  round_number,
  status,
  created_at
) 
SELECT 
  [TOURNAMENT_ID],
  3,
  'pending',
  CURRENT_DATE
FROM generate_series(1, 2);

-- Final (Round 4) - 1 match
INSERT INTO matchplay_matches (
  tournament_id,
  round_number,
  status,
  created_at
) 
VALUES (
  [TOURNAMENT_ID],
  4,
  'pending',
  CURRENT_DATE
);

-- ================================================================
-- USAGE INSTRUCTIONS:
-- ================================================================
-- 1. Run the tournament INSERT first to get the tournament ID
-- 2. Find the profile IDs for all players using the SELECT query
-- 3. Replace all placeholders ([TOURNAMENT_ID], [PLAYER_ID] etc.)
-- 4. Run the match INSERT statements
-- 5. Run verification queries to confirm setup
-- 6. The tournament structure is ready for the RS Cup!
