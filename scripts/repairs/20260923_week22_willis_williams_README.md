# Week 22 2026 — Willis → Williams score correction

## Problem
Week 22 (`03d4a3a1-…`, 2026-09-02) had **James Willis** entered with **23** stableford points. That score belonged to **Jez Williams**. Willis was not a true entrant that week.

## Why reopen + replay
Willis had already taken a handicap cut (6.9 → 6.3) on finalize. Weeks **23** and **24** were finalized afterward. Per BUILD_GUIDE §1A.D.1, correcting an earlier weekly fact requires:

1. Reopen **24 → 23 → 22** (restore handicaps, clear prize rows)
2. Fix `round_players`
3. Re-finalize **22 → 23 → 24**

## Applied (production `iwzqzpzskawxrwhttufq`)
Script: `20260923_week22_willis_to_williams.sql` (already executed).

### Result
| | Before | After |
|---|---|---|
| Week 22 @ 23 pts | James Willis | Jez Williams |
| James Willis HC | 6.3 | **6.9** (cut reversed) |
| Jez Williams HC | 2.6 | **2.3** (cut for 23 pts applied; Week 24 then 2.3→2.3) |
| Week 22–24 winners / pots | Tough / Harrison / Such | **unchanged** |
| Other players’ HC chains | — | **unchanged** (numeric formatting only) |

Artifacts: `*_pre.json`, `*_post.json`.
