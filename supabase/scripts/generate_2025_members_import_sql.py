#!/usr/bin/env python3
"""
Build SQL to load 2025 members + starting league tiers into the greenfield schema.

Source (read-only): legacy Supabase anon REST + fetch-all-data payload (same as import_2025_one_week.py).

Writes:
  1) campaigns row for Main Summer 2025 (summer_main) if none exists for year 2025 + kind summer_main
  2) members — starting_handicap at import for both initial and current index (replay-friendly)
  3) league_assignments — tier from official 2025 club list (15/15/15 + rest tier 4); not legacy payload.

Emails: {old_profile_uuid}@legacy.2025.wags (unique; replace with real emails later in admin if needed).

Usage:
  python3 supabase/scripts/generate_2025_members_import_sql.py \\
    --output scripts/sql/generated/2025_members_and_leagues.sql

Then apply to linked project:
  supabase db query --linked -f scripts/sql/generated/2025_members_and_leagues.sql
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from typing import Any

OLD_FUNCTION_URL = (
    "https://fpulgnhtngvqdikbdkgv.functions.supabase.co/fetch-all-data?season=2025"
)
OLD_REST_BASE = "https://fpulgnhtngvqdikbdkgv.supabase.co/rest/v1"
OLD_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw"
)

# Official 2025 starting divisions (must match scripts/sql/official_2025_league_tiers.sql).
_OFFICIAL_2025: list[tuple[str, int]] = [
    ("Andy Ray", 1),
    ("Dave Harrison", 1),
    ("James Tough", 1),
    ("Jez Williams", 1),
    ("Jon Boden", 1),
    ("Marc Allsopp", 1),
    ("Mark Howell", 1),
    ("Mark Ready", 1),
    ("Nick Stableford", 1),
    ("Richard Bird", 1),
    ("Simon Carter", 1),
    ("Steve Such", 1),
    ("Tim Allsopp", 1),
    ("Tim Lewis", 1),
    ("Tony Mynard", 1),
    ("Adam Teale", 2),
    ("Gary Adcock", 2),
    ("Ian Ind", 2),
    ("John Goodman", 2),
    ("Kevin Horton", 2),
    ("Lee Eastoe", 2),
    ("Mark Jeffries", 2),
    ("Mick Sandoz", 2),
    ("Paul Blades", 2),
    ("Paul Smith", 2),
    ("Richard Shaw", 2),
    ("Ross Jeffries", 2),
    ("Steve Robinson", 2),
    ("Stuart Pickersgill", 2),
    ("Tom Green", 2),
    ("Ade Cooper", 3),
    ("Brian Elliot", 3),
    ("Chris Boards", 3),
    ("James Harrison", 3),
    ("Jon Murchington", 3),
    ("Jon Price", 3),
    ("Les Lawrence", 3),
    ("Martin Stevenson", 3),
    ("Mick Hennessy", 3),
    ("Paul Chapman", 3),
    ("Peter Jeffries", 3),
    ("Richard Craven Jones", 3),
    ("Stephen Wallace", 3),
    ("Steve Rochester", 3),
    ("Stu Clark", 3),
]

_OFFICIAL_TIER_BY_NAME_LOWER: dict[str, int] = {
    n.strip().lower(): t for n, t in _OFFICIAL_2025
}


def official_tier_for_member(full_name: str) -> int:
    return _OFFICIAL_TIER_BY_NAME_LOWER.get(full_name.strip().lower(), 4)


def get_json(url: str, headers: dict[str, str]) -> Any:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def fetch_old_profiles() -> list[dict[str, Any]]:
    select = urllib.parse.quote("id,full_name,starting_handicap,current_handicap,league_name")
    url = f"{OLD_REST_BASE}/profiles?select={select}&limit=1000"
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    profiles = get_json(url, headers)
    if not isinstance(profiles, list):
        raise RuntimeError(f"Unexpected profiles response: {type(profiles)}")
    missing = [p.get("full_name") for p in profiles if p.get("starting_handicap") is None]
    if missing:
        sample = ", ".join(x for x in missing[:10] if x)
        raise RuntimeError(f"Old DB missing starting_handicap for {len(missing)}. Sample: {sample}")
    return profiles


def fetch_old_season_payload() -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {OLD_ANON_KEY}"}
    return get_json(OLD_FUNCTION_URL, headers)


def season_2025_effective_from(old_payload: dict[str, Any]) -> str:
    seasons = old_payload.get("seasons") or []
    season_2025 = next((s for s in seasons if str(s.get("name")) == "2025"), None)
    if not season_2025:
        return "2025-04-01"
    for key in ("start_date", "startDate", "starts_on", "from"):
        v = season_2025.get(key)
        if v:
            return str(v)[:10]
    return "2025-04-01"


def sql_literal(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def sql_num(x: float) -> str:
    return format(float(x), ".1f")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--output",
        "-o",
        default="scripts/sql/generated/2025_members_and_leagues.sql",
        help="Path to write SQL (default: scripts/sql/generated/2025_members_and_leagues.sql)",
    )
    args = ap.parse_args()

    old_payload = fetch_old_season_payload()
    profiles = fetch_old_profiles()
    effective_from = season_2025_effective_from(old_payload)

    rows_out: list[tuple[str, str, float, int]] = []
    for row in sorted(profiles, key=lambda x: (x.get("full_name") or "")):
        full_name = (row.get("full_name") or "").strip()
        if not full_name:
            continue
        pid = row.get("id")
        if not pid:
            continue
        email = f"{pid}@legacy.2025.wags"
        hcp = float(row["starting_handicap"])
        tier = official_tier_for_member(full_name)
        rows_out.append((full_name, email, hcp, tier))

    if not rows_out:
        print("No profile rows to export.", file=sys.stderr)
        sys.exit(1)

    member_values = ",\n  ".join(
        f"({sql_literal(fn)}, {sql_literal(em)}, {sql_num(hcp)}, {sql_num(hcp)}, false)"
        for fn, em, hcp, _tier in rows_out
    )

    league_values = ",\n  ".join(
        f"({sql_literal(em)}, {tier})" for _fn, em, _hcp, tier in rows_out
    )

    sql = f"""-- Auto-generated by supabase/scripts/generate_2025_members_import_sql.py
-- Source: legacy 2025 profiles + season league table (fetch-all-data).
-- effective_from for league assignments: {effective_from}
--
-- Replay model: initial_handicap_index = starting_handicap from legacy; handicap_index same at import.
-- Emails are synthetic until you replace them in admin.
--
BEGIN;

INSERT INTO public.campaigns (label, kind, year, status, start_date, end_date)
SELECT
  'Main Summer 2025',
  'summer_main'::public.campaign_kind,
  2025,
  'open'::public.campaign_status,
  {sql_literal(effective_from)}::date,
  NULL::date
WHERE NOT EXISTS (
  SELECT 1 FROM public.campaigns c
  WHERE c.year = 2025 AND c.kind = 'summer_main'::public.campaign_kind
);

INSERT INTO public.members (full_name, email, initial_handicap_index, handicap_index, is_admin)
VALUES
  {member_values}
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  initial_handicap_index = EXCLUDED.initial_handicap_index,
  handicap_index = EXCLUDED.handicap_index;

INSERT INTO public.league_assignments (campaign_id, member_id, tier, effective_from)
SELECT c.id, m.id, v.tier, {sql_literal(effective_from)}::date
FROM public.campaigns c
CROSS JOIN (
  VALUES
  {league_values}
) AS v(email, tier)
JOIN public.members m ON m.email = v.email
WHERE c.year = 2025 AND c.kind = 'summer_main'::public.campaign_kind
ON CONFLICT (campaign_id, member_id) DO UPDATE SET
  tier = EXCLUDED.tier,
  effective_from = EXCLUDED.effective_from;

COMMIT;
"""

    out_path = args.output
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(sql)
    print(f"Wrote {len(rows_out)} members + league rows → {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
