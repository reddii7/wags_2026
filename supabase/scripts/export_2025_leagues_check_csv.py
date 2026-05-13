#!/usr/bin/env python3
"""
Export 2025 league resolution to CSV for manual checks (e.g. 15 / 15 / 15 in tiers 1–3).

Uses the same legacy sources as generate_2025_members_import_sql.py.

Usage:
  python3 supabase/scripts/export_2025_leagues_check_csv.py -o backups/csv/2025_league_check.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from typing import Any

OLD_FUNCTION_URL = (
    "https://fpulgnhtngvqdikbdkgv.functions.supabase.co/fetch-all-data?season=2025"
)
OLD_REST_BASE = "https://fpulgnhtngvqdikbdkgv.supabase.co/rest/v1"
OLD_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw"
)

LEAGUE_MAP = {
    "League 1": "PREMIERSHIP",
    "League 2": "CHAMPIONSHIP",
    "League 3": "LEAGUE ONE",
    "League 4": "LEAGUE TWO",
    "PREMIERSHIP": "PREMIERSHIP",
    "CHAMPIONSHIP": "CHAMPIONSHIP",
    "LEAGUE ONE": "LEAGUE ONE",
    "LEAGUE TWO": "LEAGUE TWO",
}

TIER_BY_LEAGUE = {
    "PREMIERSHIP": 1,
    "CHAMPIONSHIP": 2,
    "LEAGUE ONE": 3,
    "LEAGUE TWO": 4,
    "UNASSIGNED": 4,
}


def get_json(url: str, headers: dict[str, str]) -> Any:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def fetch_old_profiles() -> list[dict[str, Any]]:
    select = urllib.parse.quote("id,full_name,starting_handicap,league_name")
    url = f"{OLD_REST_BASE}/profiles?select={select}&limit=1000"
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    profiles = get_json(url, headers)
    if not isinstance(profiles, list):
        raise RuntimeError(f"Unexpected profiles response: {type(profiles)}")
    return profiles


def fetch_old_season_payload() -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {OLD_ANON_KEY}"}
    return get_json(OLD_FUNCTION_URL, headers)


def season_league_by_name(
    old_payload: dict[str, Any],
) -> dict[str, tuple[str, str]]:
    """full_name -> (raw league string from season table, canonical after LEAGUE_MAP)."""
    seasons = old_payload.get("seasons") or []
    season_2025 = next((s for s in seasons if str(s.get("name")) == "2025"), None)
    if not season_2025:
        return {}

    leagues_blob = old_payload.get("leagues") or {}
    rows = leagues_blob.get(season_2025.get("id")) or []
    out: dict[str, tuple[str, str]] = {}
    for row in rows:
        full_name = row.get("full_name")
        league_name = row.get("league_name")
        if not full_name or not league_name:
            continue
        key = str(full_name).strip()
        raw = str(league_name).strip()
        canonical = LEAGUE_MAP.get(raw, raw)
        out[key] = (raw, canonical)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "-o",
        "--output",
        default="backups/csv/2025_league_check.csv",
        help="Output CSV path (default: backups/csv/2025_league_check.csv)",
    )
    args = ap.parse_args()

    old_payload = fetch_old_season_payload()
    profiles = fetch_old_profiles()
    season_by_name = season_league_by_name(old_payload)

    rows: list[dict[str, Any]] = []
    for row in sorted(profiles, key=lambda x: (x.get("full_name") or "")):
        full_name = (row.get("full_name") or "").strip()
        if not full_name:
            continue
        pid = row.get("id") or ""
        email = f"{pid}@legacy.2025.wags" if pid else ""

        prof_raw = (row.get("league_name") or "").strip() or ""
        prof_canon = LEAGUE_MAP.get(prof_raw, prof_raw or "UNASSIGNED")
        if not prof_canon:
            prof_canon = "UNASSIGNED"

        if full_name in season_by_name:
            sea_raw, sea_canon = season_by_name[full_name]
            source = "season_table"
            resolved = sea_canon
        else:
            sea_raw, sea_canon = "", ""
            source = "profile_only"
            resolved = prof_canon

        resolved = (resolved or "UNASSIGNED").strip() or "UNASSIGNED"
        tier = TIER_BY_LEAGUE.get(resolved)
        if tier is None:
            tier = 4

        rows.append(
            {
                "full_name": full_name,
                "profile_id": str(pid),
                "synthetic_email": email,
                "starting_handicap": row.get("starting_handicap"),
                "season_league_raw": sea_raw,
                "season_league_canonical": sea_canon,
                "profile_league_raw": prof_raw,
                "profile_league_canonical": prof_canon,
                "resolved_league": resolved,
                "tier": tier,
                "league_source": source,
            }
        )

    if not rows:
        print("No rows to export.", file=sys.stderr)
        sys.exit(1)

    import os

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    fieldnames = list(rows[0].keys())
    with open(args.output, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    by_tier = Counter(r["tier"] for r in rows)
    print(f"Wrote {len(rows)} rows → {args.output}", file=sys.stderr)
    print("Tier counts (resolved): " + ", ".join(f"t{k}={by_tier[k]}" for k in sorted(by_tier)), file=sys.stderr)
    print(
        "If you expect 15 / 15 / 15 in Prem / Champ / L1, compare `resolved_league` "
        "and `season_league_raw` to the official list.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
