
-- This script sets old_handicap, adjustment, new_handicap to 0 by default. Adjust as needed.
INSERT INTO handicap_history (id, created_at, user_id, competition_id, old_handicap, adjustment, new_handicap, reason)
SELECT
	gen_random_uuid(), NOW(), p.id, c.id, 0, 0, 0, 'Backfill missing'
FROM competitions c
CROSS JOIN profiles p
LEFT JOIN handicap_history h ON h.competition_id = c.id AND h.user_id = p.id
WHERE h.id IS NULL;

