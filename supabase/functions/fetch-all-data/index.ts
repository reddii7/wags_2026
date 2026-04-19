// CORS headers for all responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Supabase client (service role key for Edge Functions)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Fetch all seasons (for selector and data grouping)
  const seasonsRes = await supabase
    .from("seasons")
    .select("*")
    .order("start_year", { ascending: false });
  if (seasonsRes.error) {
    return new Response(JSON.stringify({ error: seasonsRes.error.message }), {
      status: 500,
    });
  }
  const seasons = seasonsRes.data;
  const seasonIds = seasons.map((s) => s.id);
  const seasonYearMap = Object.fromEntries(
    seasons.map((s) => [s.id, String(s.start_year)]),
  );

  // 2. Fetch all competitions (all seasons)
  const competitionsRes = await supabase
    .from("competitions")
    .select(
      "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, season",
    )
    .in(
      "season",
      seasons.map((s) => String(s.start_year)),
    )
    .order("competition_date", { ascending: false });
  if (competitionsRes.error) {
    return new Response(
      JSON.stringify({ error: competitionsRes.error.message }),
      {
        status: 500,
      },
    );
  }
  const competitions = competitionsRes.data;
  const competitionIds = competitions.map((c) => c.id);

  // 3. Fetch all related data (flat arrays)
  const [results, summaries, handicap_history, rounds, profiles] =
    await Promise.all([
      competitionIds.length
        ? supabase
            .from("public_results_view")
            .select("*")
            .in("competition_id", competitionIds)
        : { data: [], error: null },
      competitionIds.length
        ? supabase
            .from("results_summary")
            .select(
              "competition_id, winner_names, amount, winner_type, num_players, snakes, camels, week_number, week_date, second_names",
            )
            .in("competition_id", competitionIds)
        : { data: [], error: null },
      competitionIds.length
        ? supabase
            .from("handicap_history")
            .select("*")
            .in("competition_id", competitionIds)
        : { data: [], error: null },
      competitionIds.length
        ? supabase
            .from("rounds")
            .select("*")
            .in("competition_id", competitionIds)
        : { data: [], error: null },
      supabase.from("profiles").select("*"),
    ]);

  // 4. Fetch Best 14 and Leagues for each season (object keyed by season.id)
  const best14 = {};
  const leagues = {};
  for (const season of seasons) {
    try {
      const best14Res = await supabase.rpc("get_best_14_scores_by_season", {
        p_season: String(season.start_year),
      });
      best14[season.id] = !best14Res.error ? best14Res.data || [] : [];
    } catch {
      best14[season.id] = [];
    }
    try {
      const leaguesRes = await supabase.rpc("get_league_standings_best10", {
        p_season_id: season.id,
      });
      leagues[season.id] = !leaguesRes.error
        ? Array.isArray(leaguesRes.data)
          ? leaguesRes.data
          : leaguesRes.data
            ? [leaguesRes.data]
            : []
        : [];
    } catch {
      leagues[season.id] = [];
    }
  }

  // 5. Dashboard object keyed by season.id and start_year
  const dashboard = {};
  for (const season of seasons) {
    // Find latest closed competition for this season
    const comps = competitions.filter(
      (c) => c.season === String(season.start_year),
    );
    const latestComp =
      comps.find((c) => c.status === "closed") || comps[0] || null;
    let dash = null;
    if (latestComp) {
      try {
        const dashRes = await supabase.rpc("get_dashboard_overview", {
          p_season_id: season.id,
          p_competition_id: latestComp.id,
        });
        if (!dashRes.error) dash = dashRes.data;
      } catch {}
    }
    // Attach results and summary for latestComp
    if (dash && latestComp) {
      dash.results = (results.data || []).filter(
        (r) => r.competition_id === latestComp.id,
      );
      const compSummary = (summaries.data || []).find(
        (s) => s.competition_id === latestComp.id,
      );
      dash.summary = compSummary || {
        competition_id: latestComp.id,
        winner_type: "",
        winner_names: [],
        amount: 0,
        num_players: dash.results.length,
        snakes: dash.results.filter((r) => r.has_snake).length,
        camels: dash.results.filter((r) => r.has_camel).length,
        week_number: null,
        week_date: latestComp.competition_date,
        second_names: [],
      };
    }
    dashboard[season.id] = dash;
    dashboard[season.start_year] = dash;
  }

  // 6. Ensure every competition has a summary in the summaries array
  const summariesMap = new Map(
    (summaries.data || []).map((s) => [s.competition_id, s]),
  );
  const allSummaries = competitions.map((comp) => {
    if (summariesMap.has(comp.id)) return summariesMap.get(comp.id);
    const compResults = (results.data || []).filter(
      (r) => r.competition_id === comp.id,
    );
    return {
      competition_id: comp.id,
      winner_type: "",
      winner_names: [],
      amount: 0,
      num_players: compResults.length,
      snakes: compResults.filter((r) => r.has_snake).length,
      camels: compResults.filter((r) => r.has_camel).length,
      week_number: null,
      week_date: comp.competition_date,
      second_names: [],
    };
  });

  // 7. Compute winners object keyed by season id and start_year
  const winners = {};
  for (const season of seasons) {
    const seasonId = season.id;
    const seasonYear = String(season.start_year);
    const seasonCompIds = competitions
      .filter((c) => c.season === seasonId || String(c.season) === seasonYear)
      .map((c) => c.id);
    const seasonSummaries = allSummaries.filter((s) =>
      seasonCompIds.includes(s.competition_id),
    );
    const winnerMap = new Map();
    for (const summary of seasonSummaries) {
      if (summary.winner_type !== "winner") continue;
      if (!summary.winner_names || !Array.isArray(summary.winner_names))
        continue;
      for (const name of summary.winner_names) {
        if (!winnerMap.has(name)) {
          winnerMap.set(name, { player: name, weeks: 0, amount: 0 });
        }
        const entry = winnerMap.get(name);
        entry.weeks += 1;
        entry.amount += Number(summary.amount) || 0;
      }
    }
    const seasonWinners = Array.from(winnerMap.values()).sort(
      (a, b) => b.amount - a.amount,
    );
    winners[seasonId] = seasonWinners;
    winners[seasonYear] = seasonWinners;
  }

  // 8. Return all data as flat arrays, plus dashboard object keyed by season.id and start_year, and winners object
  return new Response(
    JSON.stringify({
      seasons,
      competitions,
      results: results.data,
      summaries: allSummaries,
      handicap_history: handicap_history.data,
      rounds: rounds.data,
      profiles: profiles.data,
      best14,
      leagues,
      dashboard,
      winners,
    }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
