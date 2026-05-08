import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const BUILD_ID = "20240508-v1";

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
  name?: string;
  label?: string;
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

const resolveSeasonIds = (seasons: Season[], seasonParam: string | null) => {
  const raw = String(seasonParam || "").trim();
  if (!raw) return null;

  const target = raw.toLowerCase();
  const ids = seasons
    .filter((season: any) => {
      const seasonId = String(season?.id || "");
      const startYear = String(season?.start_year || "");
      const name = String(season?.name || season?.label || "")
        .trim()
        .toLowerCase();
      return seasonId === raw || startYear === raw || name === target;
    })
    .map((season) => season.id);

  return ids.length ? ids : [];
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
  const seasonParam = url.searchParams.get("season");

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
      defaultsRes,
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
        .select("*")
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
      supabase.rpc("admin_get_app_defaults"),
    ]);

    const shellDefaults = Array.isArray(defaultsRes.data)
      ? defaultsRes.data[0]
      : defaultsRes.data;
    const shellDefaultResultsSeasonId =
      shellDefaults && typeof shellDefaults === "object"
        ? (shellDefaults as any).default_results_season_id || null
        : null;

    const shellHistory = (historyRes.data || [])
      .slice()
      .sort((a: any, b: any) => {
        const tA = toTime(a?.competition_date) ?? toTime(a?.created_at) ?? 0;
        const tB = toTime(b?.competition_date) ?? toTime(b?.created_at) ?? 0;
        return tB - tA;
      });

    return new Response(
      JSON.stringify({
        api_version: "contract-v1",
        build_id: BUILD_ID,
        defaults: {
          results_season_id: shellDefaultResultsSeasonId,
        },
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

  const seasonIds = resolveSeasonIds(seasons, seasonParam);

  const defaultsRes = await supabase.rpc("admin_get_app_defaults");
  const defaultsRow = Array.isArray(defaultsRes.data)
    ? defaultsRes.data[0]
    : defaultsRes.data;
  const configuredDefaultResultsSeasonId =
    defaultsRow && typeof defaultsRow === "object"
      ? String((defaultsRow as any).default_results_season_id || "")
      : "";

  // 2. Fetch competitions (optionally scoped by season)
  let competitionsQuery = supabase
    .from("competitions")
    .select(
      "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, season",
    )
    .order("competition_date", { ascending: false });
  if (Array.isArray(seasonIds) && seasonIds.length > 0) {
    competitionsQuery = competitionsQuery.in("season", seasonIds);
  }
  if (Array.isArray(seasonIds) && seasonIds.length === 0) {
    competitionsQuery = competitionsQuery.eq(
      "id",
      "00000000-0000-0000-0000-000000000000",
    );
  }
  const { data: competitions, error: compsError } = await competitionsQuery;
  if (compsError || !competitions) {
    return new Response(
      JSON.stringify({ error: compsError?.message ?? "No competitions found" }),
      { status: 500 },
    );
  }
  let scopedCompetitions = competitions;

  // Anchor displayed competitions to admin season definitions.
  // This suppresses stale per-round rows after manual season cleanup/moves.
  if (Array.isArray(seasonIds) && seasonIds.length > 0) {
    const allowedNamesBySeason = new Map<string, Set<string>>();
    await Promise.all(
      seasonIds.map(async (seasonId) => {
        const adminCompRes = await supabase.rpc("admin_list_competitions", {
          p_season_id: seasonId,
        });
        if (adminCompRes.error || !Array.isArray(adminCompRes.data)) return;
        const names = new Set<string>(
          adminCompRes.data
            .map((row: any) => String(row?.name || "").trim())
            .filter(Boolean),
        );
        allowedNamesBySeason.set(seasonId, names);
      }),
    );

    if (allowedNamesBySeason.size > 0) {
      scopedCompetitions = scopedCompetitions.filter((competition: any) => {
        const seasonId = String(competition?.season || "");
        const name = String(competition?.name || "").trim();
        const allowed = allowedNamesBySeason.get(seasonId);
        return !!allowed && allowed.has(name);
      });
    }
  }

  const competitionIds = scopedCompetitions.map((c: any) => c.id);

  const fetchAllPublicResults = async () => {
    const pageSize = 1000;
    let from = 0;
    const rows: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from("public_results_view")
        .select("*")
        .in("competition_id", competitionIds)
        .order("competition_id", { ascending: false })
        .order("position", { ascending: true })
        .order("player", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        return { data: rows, error };
      }

      const page = Array.isArray(data) ? data : [];
      if (page.length === 0) {
        break;
      }

      rows.push(...page);
      if (page.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return { data: rows, error: null };
  };

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
      ? fetchAllPublicResults()
      : { data: [], error: null },
    competitionIds.length
      ? supabase
          .from("results_summary")
          .select(
            "competition_id, winner_names, winner_ids, amount, winner_type, num_players, snakes, camels, week_number, week_date, second_names",
          )
          .in("competition_id", competitionIds)
      : { data: [], error: null },
    competitionIds.length
      ? supabase
          .from("handicap_history")
          .select("*")
          .in("competition_id", competitionIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null },
    competitionIds.length
      ? supabase.from("rounds").select("*").in("competition_id", competitionIds)
      : { data: [], error: null },
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

  const results = (resultsRes.data || []).slice();
  const summaries = summariesRes.data || [];
  const rounds = roundsRes.data || [];
  const profiles = profilesRes.data || [];
  const matchplay_tournaments = tournamentsRes.data || [];
  const matchplay_matches = matchesRes.data || [];
  const profileNameById = new Map(
    profiles.map((profile: any) => [
      String(profile.id),
      String(profile.full_name || ""),
    ]),
  );

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
      const tA = toTime(a?.competition_date);
      const tB = toTime(b?.competition_date);

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
  let dedupedHandicapHistory: any[] = [];
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

  // Suppress stale history rows after manual season resets.
  // A handicap change must belong to a competition that currently has result rows.
  const validResultCompetitionIds = new Set(
    Object.entries(resultsByComp)
      .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
      .map(([competitionId]) => competitionId),
  );
  const validResultUsersByCompetition = new Map<string, Set<string>>();
  Object.entries(resultsByComp).forEach(([competitionId, rows]) => {
    const rowList = Array.isArray(rows) ? rows : [];
    const users = new Set<string>(
      rowList.map((row: any) => String(row?.user_id || "")).filter(Boolean),
    );
    validResultUsersByCompetition.set(competitionId, users);
  });
  dedupedHandicapHistory = dedupedHandicapHistory.filter((entry: any) => {
    const competitionId = String(entry?.competition_id || "");
    if (!competitionId || !validResultCompetitionIds.has(competitionId)) {
      return false;
    }
    const userId = String(entry?.user_id || "");
    const allowedUsers = validResultUsersByCompetition.get(competitionId);
    return !!userId && !!allowedUsers && allowedUsers.has(userId);
  });

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
      const [best14Res, leaguesRes, resultsViewRes] = await Promise.all([
        supabase.rpc("get_best_14_scores_by_season", { p_season: seasonYear }),
        supabase.rpc("get_league_standings_best10", { p_season_id: season.id }),
        supabase.rpc("get_results_view_contract", { p_season_id: season.id }),
      ]);

      best14[season.id] = !best14Res.error ? best14Res.data || [] : [];
      leagues[season.id] = !leaguesRes.error
        ? Array.isArray(leaguesRes.data)
          ? leaguesRes.data
          : leaguesRes.data
            ? [leaguesRes.data]
            : []
        : [];
      const resultsViewContract =
        !resultsViewRes.error &&
        resultsViewRes.data &&
        typeof resultsViewRes.data === "object" &&
        !Array.isArray(resultsViewRes.data)
          ? (resultsViewRes.data as Record<string, unknown>)
          : null;
      if (resultsViewRes.error) {
        console.error(
          `[fetch-all-data] get_results_view_contract RPC failed for season ${season.id} — falling back to JS assembly. Error:`,
          resultsViewRes.error.message ?? JSON.stringify(resultsViewRes.error),
        );
      }

      // 5. Dashboard Logic (Optimized for precision)
      const seasonComps = scopedCompetitions.filter(
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
        const normalizedRows = rows
          .map((row: any) => ({
            ...row,
            score: Number(
              row?.score ??
                row?.stableford_score ??
                row?.points ??
                row?.total_score,
            ),
            snake: Boolean(row?.snake ?? row?.has_snake),
            camel: Boolean(row?.camel ?? row?.has_camel),
            position: Number(
              row?.position ?? row?.pos ?? row?.rank_no ?? 999999,
            ),
          }))
          .filter((row: any) => Number.isFinite(row.score));
        dash.results = normalizedRows;

        // HomeView consumes dashboard leader cards from these keys.
        // Build them directly from DB-backed season RPC datasets.
        const seasonBest14 = Array.isArray(best14[season.id])
          ? best14[season.id]
          : [];
        const best14Top3WithTies = seasonBest14.filter(
          (row: any) => Number(row?.rank_no ?? 999999) <= 3,
        );
        dash.best14_leaders = best14Top3WithTies.map((row: any) => ({
          id: row?.user_id,
          user_id: row?.user_id,
          full_name: row?.full_name || "",
          position: row?.rank_no ?? null,
          total_score: row?.best_total ?? row?.total_score ?? 0,
        }));

        const seasonLeagues = Array.isArray(leagues[season.id])
          ? leagues[season.id]
          : [];
        const leadersByLeague = new Map<string, any>();
        for (const row of seasonLeagues) {
          const leagueName = String(row?.league_name || "");
          if (!leagueName) continue;
          const rankNo = Number(row?.rank_no ?? 999999);
          const current = leadersByLeague.get(leagueName);
          const currentRank = Number(current?.rank_no ?? 999999);
          if (!current || rankNo < currentRank) {
            leadersByLeague.set(leagueName, row);
          }
        }
        dash.league_leaders = Array.from(leadersByLeague.values()).map(
          (row: any) => ({
            id: row?.user_id,
            user_id: row?.user_id,
            league_name: row?.league_name || "",
            full_name: row?.full_name || "",
            position: row?.rank_no ?? null,
            total_score: row?.total_score ?? 0,
          }),
        );

        if (resultsViewContract) {
          (dash as Record<string, unknown>).results_view = resultsViewContract;
        } else {
          const seasonCompsChronological = [...seasonComps].sort(
            (a: any, b: any) =>
              new Date(a.competition_date).getTime() -
              new Date(b.competition_date).getTime(),
          );
          const weekNumberByComp = new Map<string, number>();
          seasonCompsChronological.forEach((comp: any, idx: number) => {
            weekNumberByComp.set(String(comp.id), idx + 1);
          });

          const rowsByCompetition: Record<string, any[]> = {};
          const summaryByCompetition: Record<string, any> = {};

          for (const comp of seasonCompsChronological) {
            const compId = String(comp.id);
            const rawRows = resultsByComp[compId] || [];
            const normalizedCompRows = rawRows
              .map((row: any) => ({
                id:
                  row?.id || `${compId}-${row?.user_id || row?.player || "row"}`,
                competition_id: compId,
                user_id: row?.user_id,
                player: row?.player || "Unknown",
                score: Number(
                  row?.score ??
                    row?.stableford_score ??
                    row?.points ??
                    row?.total_score,
                ),
                snake: Boolean(row?.snake ?? row?.has_snake),
                camel: Boolean(row?.camel ?? row?.has_camel),
                position: Number(
                  row?.position ?? row?.pos ?? row?.rank_no ?? 999999,
                ),
              }))
              .filter((row: any) => Number.isFinite(row.score))
              .sort((a: any, b: any) => {
                const pa = Number(a?.position ?? 999999);
                const pb = Number(b?.position ?? 999999);
                if (pa !== pb) return pa - pb;
                const sa = Number(a?.score ?? 0);
                const sb = Number(b?.score ?? 0);
                if (sa !== sb) return sb - sa;
                return String(a?.player || "").localeCompare(
                  String(b?.player || ""),
                );
              });
            rowsByCompetition[compId] = normalizedCompRows;

            const baseSummary: any = summariesMapGlobal.get(compId) || {
              competition_id: compId,
              winner_type: "",
              winner_names: [],
              amount: 0,
              num_players: normalizedCompRows.length,
              snakes: normalizedCompRows.filter((r: any) => r.snake).length,
              camels: normalizedCompRows.filter((r: any) => r.camel).length,
              week_number: weekNumberByComp.get(compId) || null,
              week_date: comp?.competition_date || null,
              second_names: [],
            };

            const winnerType = String(
              baseSummary?.winner_type || "",
            ).toLowerCase();
            const winnerNames = Array.isArray(baseSummary?.winner_names)
              ? baseSummary.winner_names.filter(Boolean)
              : [];
            const topScore = normalizedCompRows.length
              ? Math.max(
                  ...normalizedCompRows.map((row: any) => Number(row.score)),
                )
              : null;
            const topRowsForComp =
              topScore == null
                ? []
                : normalizedCompRows.filter(
                    (row: any) => Number(row.score) === topScore,
                  );
            const heroWinnerNames = winnerNames.length
              ? winnerNames
              : topRowsForComp
                  .map((row: any) => String(row.player || ""))
                  .filter(Boolean);
            let summaryAmount = Number(baseSummary?.amount || 0);

            if (
              winnerType === "tie" &&
              Number.isFinite(summaryAmount) &&
              summaryAmount > 0
            ) {
              const idx = seasonCompsChronological.findIndex(
                (item: any) => String(item.id) === compId,
              );
              if (idx !== -1) {
                let rolloverTotal = 0;
                for (let i = idx; i >= 0; i -= 1) {
                  const prevCompId = String(
                    seasonCompsChronological[i]?.id || "",
                  );
                  const prevSummary: any = summariesMapGlobal.get(prevCompId);
                  if (
                    !prevSummary ||
                    String(prevSummary?.winner_type || "") !== "tie"
                  )
                    break;
                  const prevAmount = Number(prevSummary?.amount || 0);
                  if (Number.isFinite(prevAmount) && prevAmount > 0)
                    rolloverTotal += prevAmount;
                }
                if (rolloverTotal > 0) {
                  summaryAmount = rolloverTotal;
                }
              }
            }

            let heroMessage = "No results yet.";
            const amountText = `£${Number(summaryAmount || 0).toFixed(2)}`;
            if (topRowsForComp.length > 0) {
              if (winnerType === "rollover" || winnerType === "tie") {
                heroMessage = `A rollover with ${heroWinnerNames.join(", ")} all scoring ${topRowsForComp[0].score}, ${amountText} rolled over to next week.`;
              } else if (
                winnerType === "winner" &&
                heroWinnerNames.length === 1
              ) {
                heroMessage = `A win for ${heroWinnerNames[0]} with ${topRowsForComp[0].score} points, adding ${amountText} to his season winnings.`;
              } else if (winnerType === "winner" && heroWinnerNames.length > 1) {
                heroMessage = `${heroWinnerNames.join(", ")} tied for the win, adding ${amountText} to their season winnings.`;
              } else {
                heroMessage = `${heroWinnerNames.join(", ")} scored ${topRowsForComp[0].score} points.`;
              }
            }

            summaryByCompetition[compId] = {
              ...baseSummary,
              amount: summaryAmount,
              week_number:
                baseSummary?.week_number ?? weekNumberByComp.get(compId) ?? null,
              stats: {
                players:
                  Number(baseSummary?.num_players) > 0
                    ? Number(baseSummary.num_players)
                    : normalizedCompRows.length,
                snakes:
                  Number(baseSummary?.snakes) > 0
                    ? Number(baseSummary.snakes)
                    : normalizedCompRows.filter((row: any) => row.snake).length,
                camels:
                  Number(baseSummary?.camels) > 0
                    ? Number(baseSummary.camels)
                    : normalizedCompRows.filter((row: any) => row.camel).length,
              },
              hero_message: heroMessage,
            };
          }

          const latestCompWithRows = [...seasonCompsChronological]
            .reverse()
            .find(
              (comp: any) =>
                (rowsByCompetition[String(comp.id)] || []).length > 0,
            );
          const defaultResultsCompId = String(
            latestCompWithRows?.id ||
              latestComp?.id ||
              seasonCompsChronological.at(-1)?.id ||
              "",
          );

          const resultsViewCompetitions = [...seasonCompsChronological]
            .reverse()
            .map((comp: any) => {
              const compId = String(comp.id);
              const wk = weekNumberByComp.get(compId);
              return {
                id: compId,
                name: comp?.name || "",
                competition_date: comp?.competition_date || null,
                status: comp?.status || "",
                week_number: wk ?? null,
                week_label: wk ? `WK${wk}` : "Week",
              };
            });

          (dash as Record<string, unknown>).results_view = {
            default_competition_id: defaultResultsCompId,
            competitions: resultsViewCompetitions,
            rows_by_competition: rowsByCompetition,
            summary_by_competition: summaryByCompetition,
          };
        }

        const compSummary =
          (dash as any)?.results_view?.summary_by_competition?.[
            String(latestComp.id)
          ] || summariesMapGlobal.get(latestComp.id);
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

        const topScore = normalizedRows.length
          ? Math.max(...normalizedRows.map((row: any) => Number(row.score)))
          : null;
        const topRows =
          topScore == null
            ? []
            : normalizedRows.filter(
                (row: any) => Number(row.score) === topScore,
              );
        const summaryWinnerNames = Array.isArray(
          (dash.summary as any)?.winner_names,
        )
          ? (dash.summary as any).winner_names.filter(Boolean)
          : [];
        const heroWinnerNames = summaryWinnerNames.length
          ? summaryWinnerNames
          : topRows
              .map((row: any) => String(row?.player || ""))
              .filter(Boolean);
        const winnerType = String(
          (dash.summary as any)?.winner_type || "",
        ).toLowerCase();
        const summaryAmount = Number((dash.summary as any)?.amount || 0);
        const amountText = `£${summaryAmount.toFixed(2)}`;

        let heroMessage = "No results yet.";
        if (topRows.length > 0) {
          if (winnerType === "rollover" || winnerType === "tie") {
            heroMessage = `A rollover with ${topRows[0].score} points leading, carrying ${amountText} into the next week.`;
          } else if (winnerType === "winner" && heroWinnerNames.length === 1) {
            heroMessage = `A win for ${heroWinnerNames[0]} with ${topRows[0].score} points, adding ${amountText} to his season winnings.`;
          } else if (winnerType === "winner" && heroWinnerNames.length > 1) {
            heroMessage = `${heroWinnerNames.join(", ")} tied for the win, adding ${amountText} to their season winnings.`;
          } else {
            heroMessage = `${heroWinnerNames.join(", ")} scored ${topRows[0].score} points.`;
          }
        }

        const statsPlayers =
          Number((dash.summary as any)?.num_players) > 0
            ? Number((dash.summary as any).num_players)
            : normalizedRows.length;
        const statsSnakes =
          Number((dash.summary as any)?.snakes) > 0
            ? Number((dash.summary as any).snakes)
            : normalizedRows.filter((row: any) => row.snake).length;
        const statsCamels =
          Number((dash.summary as any)?.camels) > 0
            ? Number((dash.summary as any).camels)
            : normalizedRows.filter((row: any) => row.camel).length;

        const weekNumber = (dash.summary as any)?.week_number;
        const weekDateRaw =
          (dash.summary as any)?.week_date || latestComp.competition_date;
        const weekDate = weekDateRaw
          ? new Date(String(weekDateRaw)).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })
          : null;
        const weekLabel =
          weekNumber && weekDate
            ? `WEEK ${weekNumber}, ${weekDate}`
            : "WEEK — , —";

        const handicapChanges = dedupedHandicapHistory
          .filter(
            (entry: any) =>
              String(entry?.competition_id || "") === String(latestComp.id),
          )
          .map((entry: any) => {
            const oldRounded = Math.round(Number(entry?.old_handicap));
            const newRounded = Math.round(Number(entry?.new_handicap));
            if (!Number.isFinite(oldRounded) || !Number.isFinite(newRounded))
              return null;
            if (oldRounded === newRounded) return null;
            const userId = String(entry?.user_id || "");
            return {
              user_id: userId,
              full_name: profileNameById.get(userId) || "Unknown",
              oldRounded,
              newRounded,
            };
          })
          .filter(Boolean)
          .slice(0, 8);

        (dash as Record<string, unknown>).home = {
          latest_competition_id: latestComp.id,
          week_label: weekLabel,
          hero_message: heroMessage,
          no_results: topRows.length === 0,
          stats: {
            players: statsPlayers,
            snakes: statsSnakes,
            camels: statsCamels,
          },
          handicap_changes: handicapChanges,
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
  const allSummaries = scopedCompetitions.map((comp: any) => {
    if (summariesMapGlobal.has(comp.id)) return summariesMapGlobal.get(comp.id);
    const compResults = resultsByComp[comp.id] || [];
    return {
      competition_id: comp.id,
      winner_type: "",
      winner_names: [],
      winner_ids: [],
      amount: 0,
      num_players: compResults.length,
      snakes: compResults.filter((r: any) => r.has_snake).length,
      camels: compResults.filter((r: any) => r.has_camel).length,
      week_number: null,
      week_date: comp.competition_date,
      second_names: [],
    };
  });

  const preferredResultsSeasonId = (() => {
    if (
      configuredDefaultResultsSeasonId &&
      seasons.some(
        (season: any) =>
          String(season?.id || "") === configuredDefaultResultsSeasonId,
      )
    ) {
      return configuredDefaultResultsSeasonId;
    }

    for (const season of seasons) {
      const dash: any = dashboard[season.id];
      const resultsView = dash?.results_view;
      if (!resultsView || !Array.isArray(resultsView.competitions)) continue;
      if (!resultsView.competitions.length) continue;

      const defaultCompId = String(resultsView.default_competition_id || "");
      const rows = resultsView.rows_by_competition?.[defaultCompId] || [];
      if (Array.isArray(rows) && rows.length > 0) {
        return season.id;
      }
    }

    for (const season of seasons) {
      const dash: any = dashboard[season.id];
      const resultsView = dash?.results_view;
      if (
        resultsView &&
        Array.isArray(resultsView.competitions) &&
        resultsView.competitions.length
      ) {
        return season.id;
      }
    }

    return (
      (seasons.find((season: any) => season?.is_active) || seasons[0] || null)
        ?.id || null
    );
  })();

  // 8. Return all data
  return new Response(
    JSON.stringify({
      api_version: "contract-v1",
      build_id: BUILD_ID,
      defaults: {
        results_season_id: preferredResultsSeasonId,
      },
      seasons,
      competitions: scopedCompetitions,
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
