-- Find handicap_history records with orphaned competition_id or user_id
SELECT h.*
FROM handicap_history h
LEFT JOIN competitions c ON h.competition_id = c.id
LEFT JOIN profiles p ON h.user_id = p.id
WHERE c.id IS NULL OR p.id IS NULL;

-- Count of orphaned records
SELECT 
  COUNT(*) FILTER (WHERE c.id IS NULL) AS missing_competition,
  COUNT(*) FILTER (WHERE p.id IS NULL) AS missing_profile
FROM handicap_history h
LEFT JOIN competitions c ON h.competition_id = c.id
LEFT JOIN profiles p ON h.user_id = p.id;