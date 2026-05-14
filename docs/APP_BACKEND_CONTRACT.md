# App ↔ backend contract (greenfield)

The member PWA loads **`GET fetch-all-data`** (Edge, service role) and treats the JSON as **`api_version: "contract-v1"`**. `App.vue` stores the payload in `globalMetadata` / `metadata`; routed views read `metadata` + `season`.

Realtime: `src/lib/supabaseConfig.js` → `REALTIME_METADATA_TABLES` (`campaigns`, `rounds`, `round_players`, `members`, `member_handicap_state`, `handicap_snapshots`). Changes trigger a debounced full metadata reload.

---

## 1. Bootstrap

| Piece | Source |
|--------|--------|
| Snapshot | `GET {VITE_FETCH_ALL_DATA_URL}` — no `?season=` (full dashboard for all campaigns). |
| Auth headers | `Authorization: Bearer {anon}`, `apikey: {anon}` |
| Build gate | Edge `build_id` vs `CLIENT_BUILD_ID` in `src/App.vue` |

Optional: `?view=shell` returns a smaller payload from the same Edge function.

---

## 2. Metadata keys (full fetch, non-shell)

Produced by `supabase/functions/fetch-all-data/index.ts` → `greenfieldFetchAll`:

| Key | Source (greenfield) |
|-----|------------------------|
| `seasons` | Synthetic from `campaigns` (id, start_year, label, flags) |
| `competitions` | Derived from `rounds` rows (stable PWA-facing ids) |
| `profiles` | From `members` + `member_handicap_state` for default campaign |
| `results` / `rounds` | Flattened from `get_member_results_contract` JSON |
| `handicap_history` | From `handicap_snapshots` |
| `best14` / `leagues` | From `v_summer_standings` per summer main campaign |
| `dashboard` | Built per campaign; `results_view` from **`get_member_results_contract`**; home overlay from **`get_member_home_snapshot`** (summer main) |
| `defaults` | `admin_get_app_defaults()` → `{ default_results_season_id }` (open campaign, else latest) |
| `winners` | Per campaign: aggregated from `get_member_results_contract` (`winner_type = winner`, `amount` & `winner_names` per week); keyed by campaign id and by `year` when unique |
| `matchplay_tournaments` / `matchplay_matches` | Empty placeholders unless populated later |

---

## 3. `dashboard[campaignId]`

Same keys the Home / Results views already expect (`home`, `best14_leaders`, `league_leaders`, `results_view`, …). **`results_view`** is the contract-v1 bundle from Postgres (`get_member_results_contract`); there is **no** Edge JS duplicate of that contract.

---

## 4. Stats hub drill-downs

**Leagues** and **Best 14** player modals use **metadata only** (`buildLocalTopRounds` from `metadata.results` / competitions) — no direct client RPC.

---

## 5. Session profile

`useSession` reads **`members`** (`id`, `full_name`) for the signed-in user id. Shape is normalized to include `role: 'member'` and null `league_name` / `current_handicap` for UI compatibility.

---

## 6. Admin

Vue admin: `admin/` (Vite), service-role Supabase client. RPC surface is defined in admin code / config, not in this file.

---

## 7. Deploy hygiene

Bump Edge **`BUILD_ID`** and **`CLIENT_BUILD_ID`** together when you need a forced client refresh after contract-affecting changes.
