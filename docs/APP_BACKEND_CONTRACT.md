# App ↔ backend integration contract (current codebase)

This document maps **each user-facing surface** to **what it reads/writes**, **where that data is produced**, and **which admin actions must land correctly** so staging/prod stay aligned. Use it when pointing the app at a **greenfield Supabase project** or tightening `fetch-all-data`.

**Convention:** `metadata` is the object `App.vue` fills from `GET fetch-all-data` (plus `loading` / `loadError`). Views receive `metadata` and `season` (stats hub children).

---

## 1. Bootstrap load (all routes)

| Piece | Source | Notes |
|--------|--------|--------|
| Full snapshot | `GET {FETCH_ALL_DATA_URL}` | `App.vue` → `loadGlobalMetadata`. **No `?season=`** — full `dashboard` for all seasons. |
| Headers | `Authorization: Bearer {anon}`, `apikey: {anon}` | Edge function uses **service role** server-side. |
| Contract | `api_version: "contract-v1"` | Views assume this string. |
| Build gate | `build_id` vs `CLIENT_BUILD_ID` in `App.vue` | Bump together with edge `BUILD_ID` when forcing refresh. |

**Optional shell:** `?view=shell` returns a smaller payload (see edge function). The main app path today uses the **full** response.

**Realtime (today):** `App.vue` subscribes to Postgres changes on `competitions`, `public_results_view`, `results_summary`, `handicap_history`, `profiles` and schedules a **full metadata reload**. For greenfield you may remove this if everything updates only on finalize.

---

## 2. Top-level metadata keys (full fetch)

Produced by `supabase/functions/fetch-all-data/index.ts` (non-shell):

| Key | Produced by | Consumed by |
|-----|-------------|-------------|
| `seasons` | `from("seasons").select("*")` | Season selectors, Home contract resolution, all season-scoped views |
| `competitions` | `from("competitions").select(...)` (+ optional `?season=` scope + `admin_list_competitions` filter) | Handicaps, Leagues, Best14 fallbacks, RS Cup labels |
| `profiles` | `from("profiles").select(...)` | Handicaps, Leagues, Best14 name lookup, RS Cup, Home handicap labels |
| `results` | Flat rows from `public_results_view` (paged) | Leagues/Best14 local fallbacks, Handicaps |
| `summaries` | `from("results_summary").select(...)` (+ synthetic rows for comps without summary) | Edge function internals; winners aggregation |
| `handicap_history` | `from("handicap_history")` (+ dedupe / filter vs valid result comps) | Handicaps, Home `home.handicap_changes` slice |
| `rounds` | `from("rounds").in("competition_id", ...)` | Handicaps, Leagues/Best14 local helpers |
| `best14` | Per season: `rpc("get_best_14_scores_by_season", { p_season: seasonYear })` | Best14View, Home leader cards (`dash.best14_leaders`) |
| `leagues` | Per season: `rpc("get_league_standings_best10", { p_season_id })` | LeaguesView, Home leader cards (`dash.league_leaders`) |
| `dashboard` | Per season object built in edge function | HomeView, ResultsView (see §3) |
| `winners` | Derived in edge from `results_summary` + profiles | WinnersTable |
| `defaults` | `rpc("admin_get_app_defaults")` + inferred `results_season_id` | App season selection heuristics |
| `matchplay_tournaments` / `matchplay_matches` | Direct table reads | RSCupView |

---

## 3. `dashboard[seasonId]` shape (per season)

Keyed by **`season.id`** (UUID string). Views also try **`season.start_year`** as a secondary key for some arrays — edge function today primarily sets **`dashboard[season.id]`** only; keep parity in greenfield or align clients.

### 3.1 Home (`HomeView`)

Uses `homeContract`: first resolved entry from `metadata.dashboard` (by current/active season, defaults, or first object).

**Requires:**

| Field | Meaning |
|-------|---------|
| `home.week_label` | string |
| `home.hero_message` | string |
| `home.no_results` | boolean |
| `home.stats.players` / `.snakes` / `.camels` | numbers |
| `home.handicap_changes` | array (trimmed handicap deltas for latest comp) |
| `best14_leaders` | array `{ user_id, full_name, position, total_score }` — **edge fills from `best14` RPC** |
| `league_leaders` | array `{ user_id, league_name, full_name, position, total_score }` — **edge fills from `leagues` RPC** |

**Backend path:** `get_dashboard_overview(p_season_id, p_competition_id)` for core dash, then edge overlays `results`, `best14_leaders`, `league_leaders`, `home`, and optionally `results_view`.

### 3.2 Results (`ResultsView`)

**Requires:** `dashboard[seasonKey].results_view` — **contract-v1 results bundle**

| Field | Type |
|-------|------|
| `default_competition_id` | string (UUID) |
| `competitions` | `[{ id, name, competition_date, status, week_number, week_label }]` |
| `rows_by_competition[id]` | `[{ id, competition_id, user_id, player, score, snake, camel, position }]` |
| `summary_by_competition[id]` | object incl. `hero_message`, `stats`, winner fields, `week_number`, `week_date`, etc. |

**Primary SQL:** `get_results_view_contract(p_season_id)` (`20260608_add_results_view_contract_rpc.sql`).  
**Fallback:** edge function JS assembler if RPC fails (duplicate rules — avoid drift in greenfield).

### 3.3 Stats hub — Leagues / Best 14 / Champs

| Tab | Metadata path | Extra client RPC |
|-----|----------------|------------------|
| Leagues | `metadata.leagues[seasonId]` or `[seasonYear]` | On row drill-down: `get_player_top_rounds(p_season_id, p_player_id, p_take: 10)` via **anon** `supabase` client |
| Best 14 | `metadata.best14[seasonId]` or `[seasonYear]` | Same RPC with `p_take: 14` |
| Champs | `metadata.winners[seasonId]` or `[seasonYear]` | Rows: `player`, `weeks`, `amount`, optional `user_id` |

---

## 4. Other routes

### Handicaps (`HandicapsView`)

| Input | Keys |
|-------|------|
| Profiles | `metadata.profiles` |
| History | `metadata.handicap_history` |
| Context | `metadata.competitions`, `metadata.rounds`, `metadata.results` |

### RS Cup (`RSCupView`)

| Input | Keys |
|-------|------|
| Tournaments / matches | `metadata.matchplay_tournaments`, `metadata.matchplay_matches` |
| Names | `metadata.profiles` |

### More (`MoreView`)

Static placeholder — no backend contract.

---

## 5. Edge function: DB touchpoints (full mode)

**Tables (read):** `seasons`, `competitions`, `profiles`, `public_results_view`, `results_summary`, `handicap_history`, `rounds`, `matchplay_tournaments`, `matchplay_matches`

**RPCs (read):**

- `admin_get_app_defaults`
- `admin_list_competitions` — only when `?season=` scopes seasons (filters comps by admin-approved names)
- `get_best_14_scores_by_season`
- `get_league_standings_best10`
- `get_results_view_contract`
- `get_dashboard_overview`

**Writes:** none (read-only aggregator).

---

## 6. Admin dashboard (writes + reads)

The **Vue admin** (`admin/src/App.vue`) uses the **service-role** Supabase client and arbitrary RPC names typed by the operator.

The **legacy HTML admin** (`admin/index.html` / `admin/index 2.html`) exercises a fuller surface. RPCs observed there include:

| Area | RPC examples |
|------|----------------|
| Lists | `admin_list_seasons`, `admin_list_competitions`, `admin_list_rounds`, `admin_list_players`, `admin_list_rule_sets`, `admin_list_finance_events` |
| Reads | `admin_get_app_defaults`, `admin_get_round_detail`, `admin_get_round_outcome` |
| Season / rules | `admin_upsert_season`, `admin_upsert_rule_set`, `admin_apply_season_cutover` |
| Players / membership | `admin_upsert_player`, `admin_set_membership`, `admin_init_season_handicaps_from_prior` |
| Competitions / rounds | `admin_upsert_competition`, `admin_create_round`, `admin_set_round_entry`, `admin_remove_round_entry`, `admin_upsert_score` |
| Publish | **`admin_save_and_finalize_round`**, `admin_finalize_round`, `admin_reopen_round` |
| League economy | `admin_apply_league_movements` |
| Danger zone | `admin_reset_all_data` |

**Integration rule:** Whatever **`admin_save_and_finalize_round` / `admin_finalize_round`** writes must eventually appear in **`public_results_view`**, **`results_summary`**, and any RPCs **`fetch-all-data`** calls — otherwise the **app** will disagree with **admin**.

---

## 7. Direct client → Postgres (bypasses edge function)

These use **`src/lib/supabase.js`** (anon key), not `fetch-all-data`:

| Call site | RPC | When |
|-----------|-----|------|
| `LeaguesView.vue` | `get_player_top_rounds` | User opens “best 10” drill-down |
| `Best14View.vue` | `get_player_top_rounds` | User opens “best 14” drill-down |

Greenfield must **grant `anon` execute** on these (or move them behind the edge function and drop client RPC).

---

## 8. Staging verification checklist (spot-on app + admin)

Run entirely against the **new Supabase project** (env points to staging URL/keys).

1. **Load app** — no console contract errors; Home shows week label + hero + stats + handicap strip + leader cards.
2. **Stats → Results** — pick season; table loads; switching week/competition works.
3. **Stats → Leagues / Best 14** — table loads; open one player detail — RPC drill-down returns rows or graceful local fallback.
4. **Stats → Champs** — winners list and currency formatting.
5. **Handicaps** — lists and deltas sane vs expectations.
6. **RS Cup** — brackets/matches render if data exists.
7. **Admin** — full cycle you rely on: create/edit competition → round → scores → **finalize** → repeat step 1–3 without manual cache tricks.

Optional: save **`fetch-all-data`** JSON once after finalize and **diff** after backend changes (`jq` / golden file in repo).

---

## 9. Greenfield migration notes

- **Preserve** either the **same JSON shape** above or bump **`api_version`** and update Vue in lockstep.
- Prefer **one canonical builder** for `results_view` (SQL-only) to avoid edge JS fallback duplication.
- Mirror **`dashboard[season.id]`** consistently; add **`dashboard[String(start_year)]`** only if you keep legacy clients.
- Align **`CLIENT_BUILD_ID`** / edge **`BUILD_ID`** on each staged deploy.

---

*Generated from repo scan: `src/views/*`, `src/App.vue`, `supabase/functions/fetch-all-data/index.ts`, `admin/src/App.vue`, `admin/index 2.html`, `20260608_add_results_view_contract_rpc.sql`. Update this file when contracts change.*
