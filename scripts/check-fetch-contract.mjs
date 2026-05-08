#!/usr/bin/env node

const FALLBACK_URL = "https://babuygaqjazdolpzivhe.functions.supabase.co/fetch-all-data";

function fail(message) {
    console.error(`CONTRACT CHECK FAILED: ${message}`);
    process.exit(1);
}

function ok(message) {
    console.log(`PASS: ${message}`);
}

function readEndpoint() {
    const fromEnv = process.env.VITE_FETCH_ALL_DATA_URL || process.env.FETCH_ALL_DATA_URL;
    if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
    return FALLBACK_URL;
}

function readAuthToken() {
    const token = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    return typeof token === "string" ? token.trim() : "";
}

function toObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function validateResultsView(resultsView, seasonKey) {
    const rv = toObject(resultsView);
    if (!rv) fail(`dashboard.${seasonKey}.results_view must be an object`);

    if (!Array.isArray(rv.competitions)) {
        fail(`dashboard.${seasonKey}.results_view.competitions must be an array`);
    }

    const rowsByCompetition = toObject(rv.rows_by_competition);
    if (!rowsByCompetition) {
        fail(`dashboard.${seasonKey}.results_view.rows_by_competition must be an object`);
    }

    const summaryByCompetition = toObject(rv.summary_by_competition);
    if (!summaryByCompetition) {
        fail(`dashboard.${seasonKey}.results_view.summary_by_competition must be an object`);
    }

    if (rv.competitions.length > 0) {
        const defaultId = String(rv.default_competition_id || "");
        if (!defaultId) {
            fail(`dashboard.${seasonKey}.results_view.default_competition_id is required when competitions exist`);
        }

        const compIds = new Set(rv.competitions.map((comp) => String(comp?.id || "")).filter(Boolean));
        const closedCompIds = rv.competitions
            .filter((comp) => String(comp?.status || "").toLowerCase() === "closed")
            .map((comp) => String(comp?.id || ""))
            .filter(Boolean);
        if (!compIds.has(defaultId)) {
            fail(`dashboard.${seasonKey}.results_view.default_competition_id must match a competition id`);
        }

        let hasRows = false;

        for (const compId of compIds) {
            const rows = rowsByCompetition[compId];
            if (rows !== undefined && !Array.isArray(rows)) {
                fail(`rows_by_competition[${compId}] must be an array when present`);
            }
            if (Array.isArray(rows) && rows.length > 0) {
                hasRows = true;
            }
            const summary = summaryByCompetition[compId];
            if (summary !== undefined && !toObject(summary)) {
                fail(`summary_by_competition[${compId}] must be an object when present`);
            }
        }

        if (closedCompIds.length > 0 && !hasRows) {
            fail(`dashboard.${seasonKey}.results_view has closed competitions but no result rows`);
        }

        if (closedCompIds.length > 0) {
            const defaultRows = rowsByCompetition[defaultId];
            if (!Array.isArray(defaultRows) || defaultRows.length === 0) {
                fail(`dashboard.${seasonKey}.results_view.default_competition_id must have rows when closed competitions exist`);
            }
        }
    }
}

function validateHome(home, seasonKey) {
    const h = toObject(home);
    if (!h) fail(`dashboard.${seasonKey}.home must be an object`);

    if (typeof h.week_label !== "string") {
        fail(`dashboard.${seasonKey}.home.week_label must be a string`);
    }
    if (typeof h.hero_message !== "string") {
        fail(`dashboard.${seasonKey}.home.hero_message must be a string`);
    }
    if (typeof h.no_results !== "boolean") {
        fail(`dashboard.${seasonKey}.home.no_results must be a boolean`);
    }

    const stats = toObject(h.stats);
    if (!stats) fail(`dashboard.${seasonKey}.home.stats must be an object`);

    for (const key of ["players", "snakes", "camels"]) {
        if (!Number.isFinite(Number(stats[key]))) {
            fail(`dashboard.${seasonKey}.home.stats.${key} must be numeric`);
        }
    }

    if (!Array.isArray(h.handicap_changes)) {
        fail(`dashboard.${seasonKey}.home.handicap_changes must be an array`);
    }
}

async function main() {
    const endpoint = readEndpoint();
    const token = readAuthToken();

    const headers = {
        Accept: "application/json",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers.apikey = token;
    }

    console.log(`Checking contract at: ${endpoint}`);
    const response = await fetch(endpoint, { headers, cache: "no-store" });
    if (!response.ok) {
        fail(`HTTP ${response.status} from endpoint`);
    }

    let payload;
    try {
        payload = await response.json();
    } catch {
        fail("Response is not valid JSON");
    }

    const data = toObject(payload);
    if (!data) fail("Payload root must be an object");

    if (data.api_version !== "contract-v1") {
        fail(`api_version must be contract-v1 (got ${String(data.api_version)})`);
    }
    ok("api_version is contract-v1");

    const defaults = toObject(data.defaults);
    if (!defaults) fail("defaults must be an object");

    const defaultResultsSeasonId = String(defaults.results_season_id || "");
    if (!defaultResultsSeasonId) {
        fail("defaults.results_season_id is required");
    }
    ok("defaults.results_season_id is present");

    const seasons = Array.isArray(data.seasons) ? data.seasons : [];
    if (!seasons.length) fail("seasons must be a non-empty array");

    if (!seasons.some((season) => String(season?.id || "") === defaultResultsSeasonId)) {
        fail("defaults.results_season_id does not match any season id");
    }
    ok("defaults.results_season_id matches a valid season");

    const dashboard = toObject(data.dashboard);
    if (!dashboard) fail("dashboard must be an object");

    const dashboardEntries = Object.entries(dashboard).filter(([, value]) => toObject(value));
    if (!dashboardEntries.length) fail("dashboard must contain at least one season entry");

    let resultsViewCount = 0;
    let homeCount = 0;

    for (const [seasonKey, dashValue] of dashboardEntries) {
        const dash = toObject(dashValue);
        if (!dash) continue;

        if (dash.home !== undefined) {
            validateHome(dash.home, seasonKey);
            homeCount += 1;
        }

        if (dash.results_view !== undefined) {
            validateResultsView(dash.results_view, seasonKey);
            resultsViewCount += 1;
        }
    }

    if (homeCount === 0) {
        fail("No dashboard.*.home payload found");
    }
    if (resultsViewCount === 0) {
        fail("No dashboard.*.results_view payload found");
    }

    ok(`Validated ${homeCount} home payload(s)`);
    ok(`Validated ${resultsViewCount} results_view payload(s)`);

    console.log("CONTRACT CHECK OK");
}

main().catch((error) => {
    fail(error?.message || "Unknown error");
});
