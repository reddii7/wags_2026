-- Remove the '- Week N' suffix from public.competitions view.
-- Competition names are now the canonical wags.competitions.name value (e.g. "2025 Week 14").
-- round_no normalization (20260526) ensures wags.rounds.round_no is the true season-sequential week number,
-- so there is no longer any reason to repeat it in the display name.

CREATE OR REPLACE VIEW public.competitions AS
WITH outcome AS (
  SELECT ro.id, ro.round_id, ro.winner_type, ro.winner_player_ids,
         ro.winning_score, ro.entry_count, ro.snakes_count, ro.camels_count,
         ro.bank_allocation, ro.weekly_allocation, ro.payout_amount,
         ro.calculated_at, ro.calculated_by, ro.is_current
  FROM wags.round_outcomes ro
  WHERE ro.is_current = true
)
SELECT
  r.id,
  c.name                                                            AS name,
  r.round_date::text                                               AS competition_date,
  CASE WHEN r.status = 'finalized'::wags.round_status
       THEN 'closed'::text ELSE 'open'::text END                   AS status,
  CASE WHEN o.winner_type = 'outright'::wags.winner_type
       THEN o.winner_player_ids[1] ELSE NULL::uuid END             AS winner_id,
  COALESCE(o.payout_amount, 0::numeric)::numeric(10,2)            AS prize_pot,
  (SELECT COALESCE(sum(fe.amount), 0::numeric)::numeric(10,2)
   FROM wags.finance_events fe
   WHERE fe.season_id = r.season_id
     AND fe.wallet = 'rollover_pool'::wags.finance_wallet)         AS rollover_amount,
  r.season_id                                                       AS season
FROM wags.rounds r
JOIN wags.competitions c ON c.id = r.competition_id
LEFT JOIN outcome o ON o.round_id = r.id;
