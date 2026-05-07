#!/usr/bin/env python3
import argparse
import json
import math
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

OLD_FUNCTION_URL = "https://fpulgnhtngvqdikbdkgv.functions.supabase.co/fetch-all-data?season=2025"
OLD_REST_BASE = "https://fpulgnhtngvqdikbdkgv.supabase.co/rest/v1"
OLD_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw"

NEW_RPC_BASE = "https://babuygaqjazdolpzivhe.supabase.co/rest/v1/rpc"
NEW_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYnV5Z2FxamF6ZG9scHppdmhlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE0NjEzNSwiZXhwIjoyMDkzNzIyMTM1fQ.mnCA0bNYtGK73aaEzhszs-k1_3MUsm3jIBpQ41_Oud8"

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


class RpcError(Exception):
    pass


def post_json(url, headers, payload):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads((resp.read().decode() or "null"))
    except urllib.error.HTTPError as err:
        body = err.read().decode(errors="ignore")
        raise RpcError(f"HTTP {err.code} at {url}: {body}") from err


def get_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def rpc(name, payload=None):
    if payload is None:
        payload = {}
    headers = {
        "apikey": NEW_SERVICE_KEY,
        "Authorization": f"Bearer {NEW_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    return post_json(f"{NEW_RPC_BASE}/{name}", headers, payload)


def fetch_old_profiles():
    select = urllib.parse.quote("id,full_name,starting_handicap,current_handicap,league_name")
    url = f"{OLD_REST_BASE}/profiles?select={select}&limit=1000"
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    profiles = get_json(url, headers)
    missing = [p.get("full_name") for p in profiles if p.get("starting_handicap") is None]
    if missing:
        sample = ", ".join(x for x in missing[:10] if x)
        raise RuntimeError(f"Old DB missing starting_handicap for {len(missing)} players. Sample: {sample}")
    return profiles


def fetch_old_competitions_2025():
    select = urllib.parse.quote("id,name,competition_date,season,status")
    url = f"{OLD_REST_BASE}/competitions?select={select}&season=eq.2025&limit=200"
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    return get_json(url, headers)


def fetch_old_round_scores():
    select = urllib.parse.quote("competition_id,user_id,stableford_score,has_snake,has_camel")
    url = f"{OLD_REST_BASE}/rounds?select={select}&limit=5000"
    headers = {
        "apikey": OLD_ANON_KEY,
        "Authorization": f"Bearer {OLD_ANON_KEY}",
    }
    return get_json(url, headers)


def fetch_old_season_payload():
    headers = {"Authorization": f"Bearer {OLD_ANON_KEY}"}
    return get_json(OLD_FUNCTION_URL, headers)


def build_old_season_league_map(old_payload):
    seasons = old_payload.get("seasons", [])
    season_2025 = next((s for s in seasons if str(s.get("name")) == "2025"), None)
    if not season_2025:
        return {}

    leagues_blob = old_payload.get("leagues", {})
    rows = leagues_blob.get(season_2025.get("id"), [])
    league_map = {}
    for row in rows:
        full_name = row.get("full_name")
        league_name = row.get("league_name")
        if not full_name or not league_name:
            continue
        league_map[full_name] = LEAGUE_MAP.get(str(league_name).strip(), str(league_name).strip())
    return league_map


def build_old_week_competition_map(old_competitions):
    week_re = re.compile(r"^Week\s+(\d{1,2})$", re.I)
    week_map = {}
    for comp in old_competitions or []:
        m = week_re.match(str(comp.get("name", "")).strip())
        if not m:
            continue
        week_no = int(m.group(1))
        if 1 <= week_no <= 29:
            week_map[week_no] = comp
    return week_map


def build_old_week_results_map(old_competitions, old_round_scores, old_profiles):
    week_comp_map = build_old_week_competition_map(old_competitions)
    profile_name_by_id = {
        p.get("id"): p.get("full_name")
        for p in (old_profiles or [])
        if p.get("id") and p.get("full_name")
    }
    by_comp = defaultdict(list)
    for row in old_round_scores or []:
        cid = row.get("competition_id")
        if cid:
            by_comp[cid].append(row)

    week_results = {}
    for week_no, comp in week_comp_map.items():
        rows = []
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
                    "player": player_name,
                    "score": score_int,
                    "has_snake": bool(src.get("has_snake")),
                    "has_camel": bool(src.get("has_camel")),
                }
            )

        week_results[week_no] = rows

    return week_results


def upsert_base_data(reset_first):
    if reset_first:
        rpc("admin_reset_all_data", {})

    if reset_first:
        season_id = rpc(
            "admin_upsert_season",
            {
                "p_id": None,
                "p_label": "2025",
                "p_start_year": 2025,
                "p_start_date": "2025-01-01",
                "p_end_date": "2025-12-31",
                "p_is_active": True,
            },
        )

        rule_set_id = rpc(
            "admin_upsert_rule_set",
            {
                "p_id": None,
                "p_code": "MAIN_DEFAULT",
                "p_name": "Main Season Rules",
                "p_entry_fee": 5,
                "p_bank_share": 3.5,
                "p_weekly_winner_share": 1.5,
                "p_snake_camel_fine": 1,
                "p_stableford_par": 20,
                "p_best_scores_take": 14,
                "p_season_mode": "main",
            },
        )
        return season_id, rule_set_id

    seasons = rpc("admin_list_seasons", {})
    season = next((s for s in seasons if s.get("label") == "2025"), None)
    if not season:
        raise RuntimeError("Season 2025 not found. Run with --reset --week 1 first.")

    rule_sets = rpc("admin_list_rule_sets", {})
    rule = next((r for r in rule_sets if r.get("code") == "MAIN_DEFAULT"), None)
    if not rule:
        raise RuntimeError("Rule set MAIN_DEFAULT not found. Run with --reset --week 1 first.")

    season_id = season["id"]
    rule_set_id = rule["id"]
    return season_id, rule_set_id


def import_players_and_memberships(season_id, old_profiles, season_league_map):
    player_ids = {}
    for row in sorted(old_profiles, key=lambda x: (x.get("full_name") or "")):
        full_name = row.get("full_name")
        if not full_name:
            continue
        starting_hcp = float(row["starting_handicap"])
        pid = rpc(
            "admin_upsert_player",
            {
                "p_id": None,
                "p_full_name": full_name,
                "p_starting_handicap": starting_hcp,
            },
        )
        player_ids[full_name] = pid

        profile_league = LEAGUE_MAP.get((row.get("league_name") or "").strip(), row.get("league_name") or "UNASSIGNED")
        league_name = season_league_map.get(full_name, profile_league)
        league_name = (league_name or "UNASSIGNED").strip() or "UNASSIGNED"
        rpc(
            "admin_set_membership",
            {
                "p_season_id": season_id,
                "p_player_id": pid,
                "p_league_name": league_name,
            },
        )

    return player_ids


def load_existing_player_ids(season_id):
    players = rpc("admin_list_players", {"p_season_id": season_id})
    player_ids = {}
    for row in players:
        name = row.get("full_name")
        pid = row.get("id")
        if name and pid:
            player_ids[name] = pid
    return player_ids


def import_one_week(
    season_id,
    rule_set_id,
    player_ids,
    old_week_comp_map,
    old_week_results_map,
    week_no,
    reopen_finalized=False,
):
    target_old = old_week_comp_map.get(week_no)
    if not target_old:
        raise RuntimeError(f"Could not find old competition for Week {week_no:02d}")

    old_results = old_week_results_map.get(week_no, [])
    week_name = f"2025 Week {week_no:02d}"

    existing_comps = rpc("admin_list_competitions", {"p_season_id": season_id}) or []
    same_name = [c for c in existing_comps if c.get("name") == week_name]
    target_comp_id = None
    if same_name:
        # Prefer a competition that already has entries on round 1; fallback to first match.
        ranked = []
        for comp in same_name:
            rounds = rpc("admin_list_rounds", {"p_competition_id": comp.get("id")}) or []
            round_one = next((r for r in rounds if int(r.get("round_no") or 0) == 1), None)
            entry_count = int((round_one or {}).get("entry_count") or 0)
            ranked.append((entry_count, comp.get("id")))
        ranked.sort(reverse=True)
        target_comp_id = ranked[0][1]

    competition_id = rpc(
        "admin_upsert_competition",
        {
            "p_id": target_comp_id,
            "p_season_id": season_id,
            "p_rule_set_id": rule_set_id,
            "p_competition_type": "main_weekly",
            "p_name": week_name,
            "p_starts_on": target_old.get("competition_date"),
        },
    )

    rounds = rpc("admin_list_rounds", {"p_competition_id": competition_id})
    round_one = next((r for r in rounds if int(r.get("round_no") or 0) == 1), None)
    if round_one:
        round_id = round_one["id"]
        status = round_one.get("status")
        if status == "finalized":
            if reopen_finalized:
                rpc("admin_reopen_round", {"p_round_id": round_id})
            else:
                return {
                    "week_name": week_name,
                    "rows": len(old_results),
                    "written": 0,
                    "status": "already_finalized",
                    "missing": [],
                }
        elif status == "open":
            pass
        elif status == "reopened":
            pass
        else:
            return {
                "week_name": week_name,
                "rows": len(old_results),
                "written": 0,
                "status": "already_finalized",
                "missing": [],
            }
    else:
        round_id = rpc(
            "admin_create_round",
            {
                "p_competition_id": competition_id,
                "p_season_id": season_id,
                "p_round_no": 1,
                "p_round_date": target_old.get("competition_date"),
            },
        )

    target_rows = []
    missing = []
    for row in old_results:
        name = row.get("player")
        pid = player_ids.get(name)
        if not pid:
            missing.append(name)
            continue

        score = row.get("score")
        if score is None:
            continue
        try:
            score_value = int(round(float(score)))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(score_value):
            continue

        target_rows.append(
            {
                "player_id": pid,
                "stableford": score_value,
                "has_snake": bool(row.get("has_snake")),
                "has_camel": bool(row.get("has_camel")),
            }
        )

    # Keep round entries exactly aligned to the source week.
    existing_detail = rpc("admin_get_round_detail", {"p_round_id": round_id}) or []
    existing_ids = {r.get("player_id") for r in existing_detail if r.get("player_id")}
    target_ids = {r["player_id"] for r in target_rows}
    extra_ids = existing_ids - target_ids
    for player_id in sorted(extra_ids):
        rpc(
            "admin_remove_round_entry",
            {
                "p_round_id": round_id,
                "p_player_id": player_id,
            },
        )

    written = 0
    for row in target_rows:
        pid = row["player_id"]

        rpc(
            "admin_set_round_entry",
            {
                "p_round_id": round_id,
                "p_player_id": pid,
                "p_entry_fee_paid": 1,
            },
        )
        rpc(
            "admin_upsert_score",
            {
                "p_round_id": round_id,
                "p_player_id": pid,
                "p_stableford": row["stableford"],
                "p_gross": None,
                "p_snake": row["has_snake"],
                "p_camel": row["has_camel"],
            },
        )
        written += 1

    rpc("admin_finalize_round", {"p_round_id": round_id})

    return {
        "week_name": week_name,
        "rows": len(old_results),
        "written": written,
        "status": "finalized",
        "missing": sorted({m for m in missing if m}),
    }


def main():
    parser = argparse.ArgumentParser(description="Import 2025 WAGS data one week at a time.")
    parser.add_argument("--week", type=int, required=True, help="Week number to import (1-29)")
    parser.add_argument("--reset", action="store_true", help="Reset all target data before import")
    parser.add_argument(
        "--reopen-finalized",
        action="store_true",
        help="Reopen finalized target round before reimporting and finalizing",
    )
    args = parser.parse_args()

    if args.week < 1 or args.week > 29:
        raise SystemExit("--week must be between 1 and 29")

    old_payload = fetch_old_season_payload()
    old_profiles = fetch_old_profiles()
    old_competitions_2025 = fetch_old_competitions_2025()
    old_round_scores = fetch_old_round_scores()

    season_league_map = build_old_season_league_map(old_payload)
    old_week_comp_map = build_old_week_competition_map(old_competitions_2025)
    old_week_results_map = build_old_week_results_map(
        old_competitions_2025,
        old_round_scores,
        old_profiles,
    )

    season_id, rule_set_id = upsert_base_data(reset_first=args.reset)

    if args.reset:
        player_ids = import_players_and_memberships(season_id, old_profiles, season_league_map)
        player_mode = "bootstrapped_from_old_profiles"
    else:
        player_ids = load_existing_player_ids(season_id)
        if not player_ids:
            raise SystemExit("No players found in target DB. Run with --reset --week 1 first.")
        player_mode = "reused_existing_players"

    week_summary = import_one_week(
        season_id,
        rule_set_id,
        player_ids,
        old_week_comp_map,
        old_week_results_map,
        args.week,
        reopen_finalized=args.reopen_finalized,
    )

    print("--- IMPORT COMPLETE ---")
    print("season_id", season_id)
    print("players_mode", player_mode)
    print("players_available", len(player_ids))
    print("week", args.week)
    print("week_name", week_summary["week_name"])
    print("old_rows", week_summary["rows"])
    print("scores_written", week_summary["written"])
    print("status", week_summary["status"])
    print("missing_players", len(week_summary["missing"]))
    if week_summary["missing"]:
        print("missing_sample", week_summary["missing"][:20])


if __name__ == "__main__":
    main()
