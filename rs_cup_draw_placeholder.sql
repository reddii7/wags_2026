-- RS Cup Draw Placeholder
-- Just the first round draw for now

INSERT INTO matchplay_tournaments (id, name, status, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Wags R/S Cup 2026',
  'active',
  CURRENT_DATE
);

INSERT INTO matchplay_matches (id, tournament_id, round_number, player1_id, player2_id, status, created_at) VALUES
-- First Round Draw - Matches to be played by 19th May
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'placeholder1', 'placeholder2', 'pending', CURRENT_DATE), -- A Mosson v James Harrison
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 1, 'placeholder3', 'placeholder4', 'pending', CURRENT_DATE), -- R Kelly v Robbo
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 1, 'placeholder5', 'placeholder6', 'pending', CURRENT_DATE), -- Rochey v Suchy
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 1, 'placeholder7', 'placeholder8', 'pending', CURRENT_DATE), -- C Rowe v R Shaw
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 1, 'placeholder9', 'placeholder10', 'pending', CURRENT_DATE), -- Ashley v James Simmons
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 1, 'placeholder11', 'placeholder12', 'pending', CURRENT_DATE), -- Martin S v Ian Ind
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 1, 'placeholder13', 'placeholder14', 'pending', CURRENT_DATE), -- Mick H v Nick S
('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 1, 'placeholder15', 'placeholder16', 'pending', CURRENT_DATE), -- Boardsey v Pimmsey
('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 1, 'placeholder17', 'placeholder18', 'pending', CURRENT_DATE), -- Tealey v Tom G
('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 1, 'placeholder19', 'placeholder20', 'pending', CURRENT_DATE); -- Howla v John M
