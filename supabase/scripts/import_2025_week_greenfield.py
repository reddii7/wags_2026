#!/usr/bin/env python3
"""
Import summer weekly rounds from legacy Supabase into greenfield (rounds + round_players).

- Source: legacy REST (competitions by season, rounds scores, profiles).
- Target: campaigns where year = --target-year (default: same as --season) and kind = summer_main.
- Legacy names may be "Week 01" or "2026 Week 01"; round.name in DB matches legacy exactly.
- Does NOT call finalize_round (scores only). Finalize in play order in admin when ready.

2025 examples:
  python3 supabase/scripts/import_2025_week_greenfield.py --season 2025 --from-week 1 --to-week 29

2026 with short round names (recommended; removes legacy \"2026 Week 01\" prefix):
  python3 supabase/scripts/import_2025_week_greenfield.py --season 2026 --target-year 2026 \\
    --from-week 1 --to-week 6 --normalize-round-names --apply-linked

Apply:
  supabase db query --linked -f scripts/sql/generated/import_week_01.sql
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from typing import Any

OLD_REST_BASE = "https://fpulgnhtngvqdikbdkgv.supabase.co/rest/v1"
OLD_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw"
)


def get_json(url: str, headers: dict[str, str]) -> Any:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def fetch_old_profiles() -> list[dict[str, Any]]:
    select = urllib.parse.quote("id,full_name")
    url = f"{OLD_REST_BASE}/profiles?select={select}&limit=1000"
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    profiles = get_json(url, headers)
    if not isinstance(profiles, list):
        raise RuntimeError(f"Unexpected profiles response: {type(profiles)}")
    return profiles


def fetch_old_competitions(season: int) -> list[dict[str, Any]]:
    select = urllib.parse.quote("id,name,competition_date,season,status")
    url = f"{OLD_REST_BASE}/competitions?select={select}&season=eq.{int(season)}&limit=200"
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    return get_json(url, headers)


def fetch_old_round_scores_for_competitions(competition_ids: list[Any]) -> list[dict[str, Any]]:
    """Score rows only for the given legacy competition IDs (avoids global limit missing recent seasons)."""
    ids = [str(x) for x in competition_ids if x]
    if not ids:
        return []
    select = urllib.parse.quote("competition_id,user_id,stableford_score,has_snake,has_camel")
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    out: list[dict[str, Any]] = []
    # PostgREST in.(uuid,uuid); chunk to keep URLs reasonable on huge seasons.
    chunk_size = 40
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        in_list = ",".join(chunk)
        url = (
            f"{OLD_REST_BASE}/rounds?select={select}"
            f"&competition_id=in.({in_list})&limit=10000"
        )
        batch = get_json(url, headers)
        if not isinstance(batch, list):
            raise RuntimeError(f"Unexpected rounds response: {type(batch)}")
        out.extend(batch)
    return out


def build_old_week_competition_map(old_competitions: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    # "Week 03" (2025) or "2026 Week 03"
    week_re = re.compile(r"^(?:\d{4}\s+)?Week\s+(\d{1,2})$", re.I)
    week_map: dict[int, dict[str, Any]] = {}
    for comp in old_competitions or []:
        m = week_re.match(str(comp.get("name", "")).strip())
        if not m:
            continue
        week_no = int(m.group(1))
        if 1 <= week_no <= 29:
            week_map[week_no] = comp
    return week_map


def dedupe_week_results(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Legacy sometimes has multiple score rows per user per competition; DB requires one row per member per round."""
    by_key: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = str(r["player"]).strip().lower()
        score = int(r["score"])
        snake = max(0, min(1, int(r["snake"])))
        camel = max(0, min(1, int(r["camel"])))
        if key not in by_key:
            by_key[key] = {
                "player": str(r["player"]).strip(),
                "score": score,
                "snake": snake,
                "camel": camel,
            }
        else:
            agg = by_key[key]
            agg["score"] = score  # last row wins (stable legacy order)
            agg["snake"] = max(int(agg["snake"]), snake)
            agg["camel"] = max(int(agg["camel"]), camel)
    return sorted(by_key.values(), key=lambda x: x["player"].lower())


def build_old_week_results_map(
    old_competitions: list[dict[str, Any]],
    old_round_scores: list[dict[str, Any]],
    old_profiles: list[dict[str, Any]],
) -> dict[int, list[dict[str, Any]]]:
    week_comp_map = build_old_week_competition_map(old_competitions)
    profile_name_by_id = {
        p.get("id"): p.get("full_name")
        for p in (old_profiles or [])
        if p.get("id") and p.get("full_name")
    }
    by_comp: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in old_round_scores or []:
        cid = row.get("competition_id")
        if cid:
            by_comp[cid].append(row)

    week_results: dict[int, list[dict[str, Any]]] = {}
    for week_no, comp in week_comp_map.items():
        rows: list[dict[str, Any]] = []
        for src in by_comp.get(comp.get("id"), []):
            score = src.get("stableford_score")
            if score is None:
                continue
            try:
                score_int = int(round(float(score)))
            except (TypeError, ValueError):
                continue
            player_name = profile_name_by_id.get(src.get("user_id"))
            if not player_name:
                continue
            rows.append(
                {
                    "player": str(player_name).strip(),
                    "score": score_int,
                    "snake": 1 if src.get("has_snake") else 0,
                    "camel": 1 if src.get("has_camel") else 0,
                }
            )
        week_results[week_no] = dedupe_week_results(rows)
    return week_results


def sql_lit(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def default_course_par_for_round_type(round_type: str) -> str:
    """Stableford par on the card: 20 for normal programs; away_day uses venue par (set in admin)."""
    if round_type == "away_day":
        return "NULL"
    return "20"


def build_sql(
    week_no: int,
    comp: dict[str, Any],
    results: list[dict[str, Any]],
    *,
    target_year: int,
    round_type: str = "summer_weekly",
    entry_fee_pence: int = 500,
    normalize_round_names: bool = False,
) -> str:
    if not comp:
        raise RuntimeError(f"No legacy competition for week {week_no}")
    if not results:
        raise RuntimeError(f"No score rows for week {week_no}")

    raw_name = str(comp.get("name") or "").strip()
    legacy_label = raw_name if raw_name else f"Week {week_no:02d}"
    round_name = f"Week {week_no:02d}" if normalize_round_names else legacy_label
    # When normalizing, delete either legacy ("2026 Week 01") or prior normalized ("Week 01") row.
    if normalize_round_names and legacy_label != round_name:
        name_match_sql = (
            f"(r.name = {sql_lit(legacy_label)} or r.name = {sql_lit(round_name)})"
        )
    else:
        name_match_sql = f"r.name = {sql_lit(round_name)}"

    comp_date = str(comp.get("competition_date") or f"{int(target_year)}-01-01")[:10]
    # timestamptz midnight UTC on that calendar day
    round_ts = f"{comp_date} 00:00:00+00"
    course_par_sql = default_course_par_for_round_type(round_type)

    value_rows = ",\n    ".join(
        f"({sql_lit(r['player'])}, {int(r['score'])}, {int(r['snake'])}, {int(r['camel'])})"
        for r in sorted(results, key=lambda x: x["player"].lower())
    )

    ty = int(target_year)
    return f"""-- Week {week_no}: import as "{round_name}" (legacy: {legacy_label}) — scores only (not finalized).
-- Legacy competition_date: {comp_date}

begin;

delete from public.round_players rp
using public.rounds r, public.campaigns c
where rp.round_id = r.id
  and r.campaign_id = c.id
  and c.year = {ty}
  and c.kind = 'summer_main'::public.campaign_kind
  and {name_match_sql};

delete from public.rounds r
using public.campaigns c
where r.campaign_id = c.id
  and c.year = {ty}
  and c.kind = 'summer_main'::public.campaign_kind
  and {name_match_sql};

with camp as (
  select id from public.campaigns
  where year = {ty} and kind = 'summer_main'::public.campaign_kind
  limit 1
),
ins as (
  insert into public.rounds (campaign_id, round_type, round_date, name, play_order, finalized, course_par)
  select
    camp.id,
    '{round_type}'::public.round_type,
    '{round_ts}'::timestamptz,
    {sql_lit(round_name)},
    {week_no},
    false,
    {course_par_sql}
  from camp
  returning id
)
insert into public.round_players (
  round_id, member_id, entered, stableford_points, snake_count, camel_count, entry_fee_pence, disqualified
)
select
  ins.id,
  m.id,
  true,
  v.points,
  v.snake,
  v.camel,
  {entry_fee_pence},
  false
from ins
cross join (
  values
    {value_rows}
) as v(full_name, points, snake, camel)
join public.members m on lower(trim(m.full_name)) = lower(trim(v.full_name));

commit;
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--season",
        type=int,
        default=2025,
        help="Legacy competitions.season to read (default 2025)",
    )
    ap.add_argument(
        "--target-year",
        type=int,
        default=None,
        help="Greenfield campaigns.year for summer_main (default: same as --season)",
    )
    ap.add_argument("--week", type=int, default=None, help="Single week number 1–29")
    ap.add_argument("--from-week", type=int, default=None, help="Batch: first week (with --to-week)")
    ap.add_argument("--to-week", type=int, default=None, help="Batch: last week (inclusive)")
    ap.add_argument(
        "--round-type",
        default="summer_weekly",
        help="round_type enum (default summer_weekly). away_day uses NULL course_par.",
    )
    ap.add_argument(
        "-o",
        "--output",
        help="Write SQL to this path (defaults: import_week_NN.sql or import_weeks_AA_BB.sql)",
    )
    ap.add_argument(
        "--normalize-round-names",
        action="store_true",
        help="Store rounds as Week 01 … (matches 2025 style). Deletes prior rows named legacy or Week NN.",
    )
    ap.add_argument(
        "--apply-linked",
        action="store_true",
        help="Run supabase db query --linked -f OUTPUT after writing",
    )
    args = ap.parse_args()

    allowed_rt = (
        "summer_weekly",
        "winter_weekly",
        "rs_cup",
        "finals_champs",
        "finals_chumps",
        "away_day",
    )
    if args.round_type not in allowed_rt:
        sys.exit(f"--round-type must be one of: {', '.join(allowed_rt)}")

    range_mode = args.from_week is not None or args.to_week is not None
    if args.week is not None and range_mode:
        sys.exit("Use either --week or (--from-week and --to-week), not both")
    if range_mode:
        if args.from_week is None or args.to_week is None:
            sys.exit("Batch mode requires both --from-week and --to-week")
        if args.from_week < 1 or args.to_week > 29 or args.from_week > args.to_week:
            sys.exit("--from-week/--to-week must satisfy 1 ≤ from ≤ to ≤ 29")
        week_numbers = list(range(args.from_week, args.to_week + 1))
        out = args.output or (
            f"scripts/sql/generated/import_{args.season}_weeks_{args.from_week:02d}_{args.to_week:02d}.sql"
        )
    else:
        if args.week is None:
            sys.exit("Specify --week N or --from-week A --to-week B")
        if args.week < 1 or args.week > 29:
            sys.exit("--week must be 1–29")
        week_numbers = [args.week]
        out = args.output or f"scripts/sql/generated/import_{args.season}_week_{args.week:02d}.sql"

    target_year = args.target_year if args.target_year is not None else args.season

    old_profiles = fetch_old_profiles()
    old_comp = fetch_old_competitions(args.season)
    comp_ids = [c.get("id") for c in (old_comp or []) if c.get("id")]
    old_rs = fetch_old_round_scores_for_competitions(comp_ids)
    wmap = build_old_week_competition_map(old_comp)
    wres = build_old_week_results_map(old_comp, old_rs, old_profiles)

    sql_blocks: list[str] = []
    total_rows = 0
    skipped: list[str] = []
    for wn in week_numbers:
        comp = wmap.get(wn)
        results = wres.get(wn, [])
        if not comp:
            skipped.append(f"week {wn}: no legacy competition")
            continue
        if not results:
            skipped.append(f"week {wn}: no score rows")
            continue
        try:
            sql_blocks.append(
                build_sql(
                    wn,
                    comp,
                    results,
                    target_year=target_year,
                    round_type=args.round_type,
                    normalize_round_names=args.normalize_round_names,
                )
            )
            total_rows += len(results)
        except RuntimeError as err:
            skipped.append(f"week {wn}: {err}")
            continue

    for msg in skipped:
        print(f"SKIP {msg}", file=sys.stderr)

    if not sql_blocks:
        sys.exit("No weeks produced SQL (nothing to write).")

    header = (
        f"-- Batch summer weeks legacy season {args.season} → greenfield year {target_year}: "
        f"weeks {week_numbers[0]}..{week_numbers[-1]} "
        f"({len(sql_blocks)} week(s), {total_rows} score rows). Scores only — not finalized.\n\n"
    )
    sql = header + "\n".join(sql_blocks)

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(sql)

    print(
        f"Wrote {out} ({len(sql_blocks)} week block(s), {total_rows} score rows total)",
        file=sys.stderr,
    )

    if args.apply_linked:
        subprocess.run(
            ["supabase", "db", "query", "--linked", "-f", out],
            cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
            check=True,
        )
        print("Applied with supabase db query --linked", file=sys.stderr)


if __name__ == "__main__":
    main()
