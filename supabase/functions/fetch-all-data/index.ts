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

  // 2. Fetch all competitions (all time)
  // This ensures handicap history always finds its competition name
  const competitionsRes = await supabase
    .from("competitions")
    .select(
      "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, season",
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
  const [resultsRes, summariesRes, historyRes, roundsRes, profilesRes] =
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
      supabase
        .from("handicap_history")
        .select("*, competitions!inner(name, competition_date)")
        .order("competitions.competition_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("rounds").select("*"),
      supabase.from("profiles").select("*"),
    ]);

  const results = resultsRes.data || [];
  const summaries = summariesRes.data || [];
  const handicap_history = historyRes.data || [];
  const rounds = roundsRes.data || [];
  const profiles = profilesRes.data || [];

  // Deduplicate handicap_history: keep only the latest entry per competition_id and user_id
  // (If competition_id is null, treat as manual adjustment and keep all)
  const dedupedHandicapHistory = [];
  const seen = new Map();
  for (const entry of handicap_history) {
    if (!entry.competition_id) {
      dedupedHandicapHistory.push(entry);
      continue;
    }
    const key = `${entry.user_id}__${entry.competition_id}`;
    if (!seen.has(key)) {
      seen.set(key, entry);
      dedupedHandicapHistory.push(entry);
    }
    // If already seen, skip (older duplicate)
  }

  // 4. Parallel fetch of Season-specific data (Professional optimization)
  const best14 = {};
  const leagues = {};
  const dashboard = {};
  const winners = {};

  await Promise.all(
    seasons.map(async (season) => {
      const seasonYear = String(season.start_year);

      // Parallelize RPC calls for this season
      const [best14Res, leaguesRes] = await Promise.all([
        supabase.rpc("get_best_14_scores_by_season", { p_season: seasonYear }),
        supabase.rpc("get_league_standings_best10", { p_season_id: season.id }),
      ]);

      best14[season.id] = !best14Res.error ? best14Res.data || [] : [];
      leagues[season.id] = !leaguesRes.error
        ? Array.isArray(leaguesRes.data)
          ? leaguesRes.data
          : leaguesRes.data
            ? [leaguesRes.data]
            : []
        : [];

      // 5. Dashboard Logic (Optimized for precision)
      const seasonComps = competitions.filter(
        (c) =>
          c.season === season.id ||
          (typeof c.season === "string" && c.season.includes(seasonYear)),
      );
      const latestComp =
        seasonComps.find((c) => c.status === "closed") ||
        seasonComps[0] ||
        null;

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
        dash.results = results.filter(
          (r) => r.competition_id === latestComp.id,
        );
        const compSummary = summaries.find(
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

      // 7. Compute Winners Logic
      const seasonCompIds = seasonComps.map((c) => c.id);
      const summariesMap = new Map(summaries.map((s) => [s.competition_id, s]));
      const seasonSummaries = seasonCompIds
        .map((id) => summariesMap.get(id))
        .filter(Boolean);

      const winnerMap = new Map();
      for (const summary of seasonSummaries) {
        if (
          summary.winner_type !== "winner" ||
          !Array.isArray(summary.winner_names)
        )
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
      winners[season.id] = seasonWinners;
      winners[seasonYear] = seasonWinners;
    }),
  );

  // 6. Ensure every competition has a summary in the summaries array
  const summariesMapGlobal = new Map(
    summaries.map((s) => [s.competition_id, s]),
  );
  const allSummaries = competitions.map((comp) => {
    if (summariesMapGlobal.has(comp.id)) return summariesMapGlobal.get(comp.id);
    const compResults = results.filter((r) => r.competition_id === comp.id);
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

  // 8. Return all data as flat arrays, plus dashboard object keyed by season.id and start_year, and winners object
  return new Response(
    JSON.stringify({
      seasons,
      competitions,
      results,
      summaries: allSummaries,
      dedupedHandicapHistory,
      rounds,
      profiles,
      best14,
      leagues,
      dashboard,
      winners,
    }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
