#!/usr/bin/env node

const FALLBACK_URL = "https://babuygaqjazdolpzivhe.functions.supabase.co/fetch-all-data";

function toObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
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

function parseArgs(argv) {
    const out = {
        statusOnly: false,
        allowEmptyDefault: false,
        expectedActiveYear: "",
        expectedActiveId: "",
        expectedDefaultResultsYear: "",
        expectedDefaultResultsId: "",
    };

    for (const arg of argv) {
        if (arg === "--status-only") out.statusOnly = true;
        if (arg === "--allow-empty-default") out.allowEmptyDefault = true;
        if (arg.startsWith("--active-year=")) out.expectedActiveYear = arg.split("=")[1] || "";
        if (arg.startsWith("--active-id=")) out.expectedActiveId = arg.split("=")[1] || "";
        if (arg.startsWith("--default-results-year=")) {
            out.expectedDefaultResultsYear = arg.split("=")[1] || "";
        }
        if (arg.startsWith("--default-results-id=")) {
            out.expectedDefaultResultsId = arg.split("=")[1] || "";
        }
    }

    return out;
}

function fail(message) {
    console.error(`SEASON GUARD FAILED: ${message}`);
    process.exit(1);
}

function pass(message) {
    console.log(`PASS: ${message}`);
}

function seasonLabel(season) {
    const year = season?.start_year ?? "?";
    const mode = season?.season_mode ? ` (${season.season_mode})` : "";
    return `${year}${mode}`;
}

function dashboardForSeason(dashboard, season) {
    if (!dashboard || !season) return null;
    return dashboard[String(season.id)] || dashboard[String(season.start_year)] || null;
}

function evaluateSeasonRow(dashboard, season) {
    const dash = dashboardForSeason(dashboard, season);
    const home = toObject(dash?.home);
    const resultsView = toObject(dash?.results_view);
    const competitions = Array.isArray(resultsView?.competitions)
        ? resultsView.competitions
        : [];
    const closedCompetitions = competitions.filter(
        (competition) => String(competition?.status || "").toLowerCase() === "closed",
    ).length;
    const defaultCompId = String(resultsView?.default_competition_id || "");
    const rowsByComp = toObject(resultsView?.rows_by_competition) || {};
    const rowsOnDefault = Array.isArray(rowsByComp[defaultCompId])
        ? rowsByComp[defaultCompId].length
        : 0;

    return {
        id: String(season?.id || ""),
        startYear: String(season?.start_year || ""),
        active: Boolean(season?.is_active),
        current: Boolean(season?.is_current),
        label: seasonLabel(season),
        hasHome: Boolean(home),
        hasResultsView: Boolean(resultsView),
        competitions: competitions.length,
        closedCompetitions,
        defaultCompId,
        rowsOnDefault,
    };
}

async function fetchPayload() {
    const endpoint = readEndpoint();
    const token = readAuthToken();
    const headers = { Accept: "application/json" };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers.apikey = token;
    }

    const response = await fetch(endpoint, { headers, cache: "no-store" });
    if (!response.ok) fail(`HTTP ${response.status} from endpoint ${endpoint}`);

    let payload;
    try {
        payload = await response.json();
    } catch {
        fail("Endpoint did not return valid JSON");
    }

    const data = toObject(payload);
    if (!data) fail("Payload root must be an object");

    return { endpoint, data };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const { endpoint, data } = await fetchPayload();

    if (data.api_version !== "contract-v1") {
        fail(`Expected api_version=contract-v1, got ${String(data.api_version)}`);
    }

    const seasons = Array.isArray(data.seasons) ? data.seasons : [];
    if (!seasons.length) fail("No seasons in payload");

    const defaults = toObject(data.defaults);
    if (!defaults) fail("Missing defaults object");

    const defaultResultsSeasonId = String(defaults.results_season_id || "");
    if (!defaultResultsSeasonId) fail("Missing defaults.results_season_id");

    const dashboard = toObject(data.dashboard);
    if (!dashboard) fail("Missing dashboard object");

    const rows = seasons.map((season) => evaluateSeasonRow(dashboard, season));

    console.log(`Season guard endpoint: ${endpoint}`);
    console.log("Season snapshot:");
    for (const row of rows) {
        const flags = [row.active ? "active" : null, row.current ? "current" : null]
            .filter(Boolean)
            .join(",");
        console.log(
            `- ${row.label} | id=${row.id} | flags=${flags || "-"} | home=${row.hasHome} | results_view=${row.hasResultsView} | comps=${row.competitions} | closed=${row.closedCompetitions} | default_rows=${row.rowsOnDefault}`,
        );
    }

    for (const row of rows) {
        if (row.closedCompetitions > 0 && row.hasResultsView && row.rowsOnDefault <= 0) {
            fail(`Season ${row.label} has closed competitions but no rows on default competition`);
        }
    }
    pass("All seasons with closed competitions have default result rows");

    const activeRows = rows.filter((row) => row.active);
    if (activeRows.length !== 1) {
        fail(`Expected exactly one active season, found ${activeRows.length}`);
    }
    pass("Exactly one active season");

    const defaultResultsRow = rows.find((row) => row.id === defaultResultsSeasonId);
    if (!defaultResultsRow) {
        fail("defaults.results_season_id does not match any season id");
    }
    pass(`Default results season is ${defaultResultsRow.label}`);

    if (!defaultResultsRow.hasResultsView) {
        fail("Default results season has no results_view payload");
    }

    if (!options.allowEmptyDefault && defaultResultsRow.rowsOnDefault <= 0) {
        fail("Default results season has no rows in default competition");
    }
    if (options.allowEmptyDefault) {
        pass("Empty default results season is allowed for this run");
    } else {
        pass("Default results season has rows");
    }

    if (options.expectedActiveYear) {
        if (String(activeRows[0].startYear) !== String(options.expectedActiveYear)) {
            fail(
                `Expected active year ${options.expectedActiveYear}, got ${activeRows[0].startYear}`,
            );
        }
        pass(`Active year matches ${options.expectedActiveYear}`);
    }

    if (options.expectedActiveId) {
        if (String(activeRows[0].id) !== String(options.expectedActiveId)) {
            fail(`Expected active id ${options.expectedActiveId}, got ${activeRows[0].id}`);
        }
        pass(`Active id matches ${options.expectedActiveId}`);
    }

    if (options.expectedDefaultResultsYear) {
        if (String(defaultResultsRow.startYear) !== String(options.expectedDefaultResultsYear)) {
            fail(
                `Expected default results year ${options.expectedDefaultResultsYear}, got ${defaultResultsRow.startYear}`,
            );
        }
        pass(`Default results year matches ${options.expectedDefaultResultsYear}`);
    }

    if (options.expectedDefaultResultsId) {
        if (String(defaultResultsRow.id) !== String(options.expectedDefaultResultsId)) {
            fail(
                `Expected default results id ${options.expectedDefaultResultsId}, got ${defaultResultsRow.id}`,
            );
        }
        pass(`Default results id matches ${options.expectedDefaultResultsId}`);
    }

    if (options.statusOnly) {
        console.log("SEASON STATUS OK");
        return;
    }

    console.log("SEASON GUARD OK");
}

main().catch((error) => {
    fail(error?.message || "Unknown error");
});
