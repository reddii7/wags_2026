import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const parseAllowedOrigins = () => {
  const value = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = parseAllowedOrigins();
  const allowOrigin =
    allowedOrigins.length === 0
      ? "*"
      : origin && allowedOrigins.includes(origin)
        ? origin
        : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
    Vary: "Origin",
  };
};

interface Season {
  id: string;
  start_year: number;
}

interface Competition {
  id: string;
  name: string;
  competition_date: string;
  status: string;
  winner_id: string | null;
  season: string;
  prize_pot: number;
}

// Helper to safely parse dates
const toTime = (d: unknown) => {
  if (!d) return null;
  const t = new Date(String(d)).getTime();
  return Number.isFinite(t) ? t : null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const allowedOrigins = parseAllowedOrigins();

  if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requireJwt = Deno.env.get("FETCH_ALL_DATA_REQUIRE_JWT") === "true";
  if (requireJwt) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!token || !anonKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey);
    const { error: authError } = await authClient.auth.getUser(token);
    if (authError) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Supabase client (service role key for Edge Functions)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const view = url.searchParams.get("view");

  // ── SHELL VIEW ────────────────────────────────────────────────────────────────
  // Fast boot payload: seasons, competitions, profiles, handicap_history only.
  // No RPC calls, no per-row processing. Returned in ~100-200 ms.
  if (view === "shell") {
    const [
      seasonsRes,
      compsRes,
      profilesRes,
      historyRes,
      tournamentsRes,
      matchesRes,
    ] = await Promise.all([
      supabase
        .from("seasons")
        .select("*")
        .order("start_year", { ascending: false }),
      supabase
        .from("competitions")
        .select(
          "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, season",
        )
        .order("competition_date", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, role, league_name, current_handicap"),
      supabase
        .from("handicap_history")
        .select("*, competitions(name, competition_date)")
        .order("created_at", { ascending: false }),
      supabase
        .from("matchplay_tournaments")
        .select("*")
        .order("id", { ascending: false }),
      supabase
        .from("matchplay_matches")
        .select("*")
        .order("round_number", { ascending: true })
        .order("id", { ascending: true }),
    ]);

    const shellHistory = (historyRes.data || [])
      .slice()
      .sort((a: any, b: any) => {
        const tA =
          toTime(a?.competitions?.competition_date) ??
          toTime(a?.created_at) ??
          0;
        const tB =
          toTime(b?.competitions?.competition_date) ??
          toTime(b?.created_at) ??
          0;
        return tB - tA;
      });

    return new Response(
      JSON.stringify({
        seasons: seasonsRes.data || [],
        competitions: compsRes.data || [],
        profiles: profilesRes.data || [],
        handicap_history: shellHistory,
        // empty placeholders so consumers don't need null-checks
        results: [],
        summaries: [],
        rounds: [],
        best14: {},
        leagues: {},
        dashboard: {},
        winners: {},
        matchplay_tournaments: tournamentsRes.data || [],
        matchplay_matches: matchesRes.data || [],
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  // ── END SHELL VIEW ─────────────────────────────────────────────────────────────

  // 1. Fetch all seasons (for selector and data grouping)
  const { data: seasons, error: seasonsError } = await supabase
    .from("seasons")
    .select("*")
    .order("start_year", { ascending: false });
  if (seasonsError || !seasons) {
    return new Response(
      JSON.stringify({ error: seasonsError?.message ?? "No seasons found" }),
      { status: 500 },
    );
  }

  // 2. Fetch all competitions (all time)
  const { data: competitions, error: compsError } = await supabase
    .from("competitions")
    .select(
      "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, season",
    )
    .order("competition_date", { ascending: false });
  if (compsError || !competitions) {
    return new Response(
      JSON.stringify({ error: compsError?.message ?? "No competitions found" }),
      { status: 500 },
    );
  }
  const competitionIds = competitions.map((c) => c.id);

  // 3. Fetch all related data (flat arrays)
  const [
    resultsRes,
    summariesRes,
    historyRes,
    roundsRes,
    profilesRes,
    tournamentsRes,
    matchesRes,
  ] = await Promise.all([
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
    // IMPORTANT: do NOT order by joined table columns in PostgREST builder
    // Order locally instead (competition_date desc, then created_at desc)
    supabase
      .from("handicap_history")
      .select("*, competitions(name, competition_date)")
      .order("created_at", { ascending: false }),
    supabase.from("rounds").select("*"),
    supabase
      .from("profiles")
      .select("id, full_name, role, league_name, current_handicap"),
    supabase
      .from("matchplay_tournaments")
      .select("*")
      .order("id", { ascending: false }),
    supabase
      .from("matchplay_matches")
      .select("*")
      .order("round_number", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const results = resultsRes.data || [];
  const summaries = summariesRes.data || [];
  const rounds = roundsRes.data || [];
  const profiles = profilesRes.data || [];
  const matchplay_tournaments = tournamentsRes.data || [];
  const matchplay_matches = matchesRes.data || [];

  // Check for tournament query errors
  if (tournamentsRes.error) {
    console.error("Tournaments query error:", tournamentsRes.error);
  }
  if (matchesRes.error) {
    console.error("Matches query error:", matchesRes.error);
  }

  // Sort + dedupe handicap_history
  const handicap_history_raw = historyRes.data || [];
  const handicap_history = handicap_history_raw
    .slice()
    .sort((a: any, b: any) => {
      const tA = toTime(a?.competitions?.competition_date);
      const tB = toTime(b?.competitions?.competition_date);

      // Prefer competition_date; fallback to created_at
      const cA = tA ?? toTime(a?.created_at);
      const cB = tB ?? toTime(b?.created_at);

      // If both null, keep stable-ish by comparing created_at
      const kA = cA ?? 0;
      const kB = cB ?? 0;
      return kB - kA;
    });

  // Deduplicate handicap_history: keep only the latest entry per (user_id, competition_id)
  // If competition_id is null, treat as manual adjustment and keep all
  const dedupedHandicapHistory: any[] = [];
  const seen = new Map<string, boolean>();
  for (const entry of handicap_history) {
    if (!entry.competition_id) {
      dedupedHandicapHistory.push(entry);
      continue;
    }
    const key = `${entry.user_id}__${entry.competition_id}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      dedupedHandicapHistory.push(entry);
    }
  }

  // Optimization: Group results and summaries by competition_id for O(1) lookup
  const resultsByComp = results.reduce(
    (acc: Record<string, any[]>, r: any) => {
      if (!acc[r.competition_id]) acc[r.competition_id] = [];
      acc[r.competition_id].push(r);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  const summariesMapGlobal = new Map(
    summaries.map((s: any) => [s.competition_id, s]),
  );

  // 4. Parallel fetch of Season-specific data (Professional optimization)
  const best14: Record<string, any[]> = {};
  const leagues: Record<string, any[]> = {};
  const dashboard: Record<string, any> = {};
  const winners: Record<string, any[]> = {};

  await Promise.all(
    seasons.map(async (season: Season) => {
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
        (c: any) =>
          c.season === season.id ||
          (typeof c.season === "string" && c.season.includes(seasonYear)),
      );
      const latestComp =
        seasonComps.find((c: any) => c.status === "closed") ||
        seasonComps[0] ||
        null;

      let dash: Record<string, unknown> | null = null;
      if (latestComp) {
        try {
          const dashRes = await supabase.rpc("get_dashboard_overview", {
            p_season_id: season.id,
            p_competition_id: latestComp.id,
          });
          if (!dashRes.error && dashRes.data != null) {
            dash =
              typeof dashRes.data === "object" && !Array.isArray(dashRes.data)
                ? (dashRes.data as Record<string, unknown>)
                : { value: dashRes.data };
          }
        } catch {
          // RPC may fail after policy changes; still attach results below.
        }

        if (!dash) dash = {};
        const rows = resultsByComp[latestComp.id] || [];
        dash.results = rows;

        const compSummary = summariesMapGlobal.get(latestComp.id);
        dash.summary = compSummary || {
          competition_id: latestComp.id,
          winner_type: "",
          winner_names: [],
          amount: 0,
          num_players: rows.length,
          snakes: rows.filter((r: any) => r.has_snake).length,
          camels: rows.filter((r: any) => r.has_camel).length,
          week_number: null,
          week_date: latestComp.competition_date,
          second_names: [],
        };

        if (!Array.isArray(dash.handicaps)) {
          dash.handicaps = [];
        }
      }
      dashboard[season.id] = dash;

      // 7. Compute Winners Logic
      const seasonCompIds = seasonComps.map((c: any) => c.id);
      const seasonSummaries = seasonCompIds
        .map((id: string) => summariesMapGlobal.get(id))
        .filter(Boolean);

      const winnerMap = new Map<string, any>();
      // Enhanced: Use winner_ids if available, else match names to profiles
      for (const summary of seasonSummaries as any[]) {
        if (
          summary.winner_type !== "winner" ||
          !Array.isArray(summary.winner_names)
        )
          continue;
        const winnerIds = Array.isArray(summary.winner_ids)
          ? summary.winner_ids
          : [];
        summary.winner_names.forEach((name: string, idx: number) => {
          let userId = winnerIds[idx];
          if (!userId) {
            // Fallback: try to match name to profiles.full_name (case-insensitive, trimmed)
            const match = profiles.find(
              (p: any) =>
                String(p.full_name).trim().toLowerCase() ===
                String(name).trim().toLowerCase(),
            );
            userId = match ? match.id : null;
          }
          if (!userId) return; // skip if no match
          if (!winnerMap.has(userId)) {
            winnerMap.set(userId, {
              user_id: userId,
              player: name,
              weeks: 0,
              amount: 0,
            });
          }
          const entry = winnerMap.get(userId);
          entry.weeks += 1;
          entry.amount += Number(summary.amount) || 0;
        });
      }
      const seasonWinners = Array.from(winnerMap.values()).sort(
        (a, b) => b.amount - a.amount,
      );
      winners[season.id] = seasonWinners;
    }),
  );

  // 6. Ensure every competition has a summary in the summaries array
  const allSummaries = competitions.map((comp: any) => {
    if (summariesMapGlobal.has(comp.id)) return summariesMapGlobal.get(comp.id);
    const compResults = resultsByComp[comp.id] || [];
    return {
      competition_id: comp.id,
      winner_type: "",
      winner_names: [],
      amount: 0,
      num_players: compResults.length,
      snakes: compResults.filter((r: any) => r.has_snake).length,
      camels: compResults.filter((r: any) => r.has_camel).length,
      week_number: null,
      week_date: comp.competition_date,
      second_names: [],
    };
  });

  // 8. Return all data
  return new Response(
    JSON.stringify({
      seasons,
      competitions,
      results,
      summaries: allSummaries,
      handicap_history: dedupedHandicapHistory,
      rounds,
      profiles,
      best14,
      leagues,
      dashboard,
      winners,
      matchplay_tournaments,
      matchplay_matches,
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
});
