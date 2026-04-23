-- Find competitions with no handicap_history for any player
SELECT c.id AS competition_id, c.name, c.competition_date, p.id AS player_id, p.full_name
FROM competitions c
CROSS JOIN profiles p
LEFT JOIN handicap_history h ON h.competition_id = c.id AND h.user_id = p.id
WHERE h.id IS NULL
ORDER BY c.competition_date DESC, p.full_name;

-- Find handicap_history entries with competition_id not matching any competition
SELECT h.*
FROM handicap_history h
LEFT JOIN competitions c ON h.competition_id = c.id
WHERE h.competition_id IS NOT NULL AND c.id IS NULL;
