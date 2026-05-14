import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const BUILD_ID = "20260514-greenfield-v30";

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

// Helper to safely parse dates
const toTime = (d: unknown) => {
  if (!d) return null;
  const t = new Date(String(d)).getTime();
  return Number.isFinite(t) ? t : null;
};

const TIER_TO_LEAGUE_NAME: Record<number, string> = {
  1: "PREMIERSHIP",
  2: "CHAMPIONSHIP",
  3: "LEAGUE 1",
  4: "LEAGUE 2",
};

const leagueNameForTier = (tier: unknown): string => {
  const n = Number(tier);
  if (Number.isFinite(n) && TIER_TO_LEAGUE_NAME[n]) {
    return TIER_TO_LEAGUE_NAME[n];
  }
  if (Number.isFinite(n)) return `LEAGUE ${n}`;
  return "LEAGUE";
};

/** Core schema uses `track` (main_summer); scripts/views use `kind` (summer_main). */
const isSummerMainCampaign = (c: any): boolean => {
  const k = String(c?.kind ?? "").trim().toLowerCase();
  if (k === "summer_main") return true;
  if (k !== "") return false;
  return String(c?.track ?? "").trim().toLowerCase() === "main_summer";
};

/** PostgREST jsonb arrays are usually arrays; normalize object-shaped JSON arrays. */
const asJsonObjectArray = (val: unknown): any[] => {
  if (Array.isArray(val)) return val;
  if (val != null && typeof val === "object") {
    const o = val as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => /^\d+$/.test(k));
    if (keys.length) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => o[k]);
    }
  }
  return [];
};

/** Parallel Postgres RPCs per campaign: results contract + summer home snapshot. */
async function loadGreenfieldRpcSnapshots(
  supabase: ReturnType<typeof createClient>,
  camps: any[],
): Promise<{
  resultsContracts: Map<string, Record<string, unknown>>;
  homeSnapshots: Map<string, Record<string, unknown>>;
}> {
  const resultsContracts = new Map<string, Record<string, unknown>>();
  const homeSnapshots = new Map<string, Record<string, unknown>>();
  const rows = await Promise.all(
    camps.map(async (c: any) => {
      const cid = String(c.id);
      const summer = isSummerMainCampaign(c);
      const [homeRpc, resultsRpc] = await Promise.all([
        summer
          ? supabase.rpc("get_member_home_snapshot", { p_campaign_id: cid })
          : Promise.resolve({ data: null, error: null }),
        supabase.rpc("get_member_results_contract", { p_campaign_id: cid }),
      ]);
      let homeEntry: [string, Record<string, unknown>] | null = null;
      if (summer && homeRpc.error) {
        console.warn(
          `[fetch-all-data] get_member_home_snapshot(${cid}):`,
          homeRpc.error.message ?? JSON.stringify(homeRpc.error),
        );
      } else if (
        summer &&
        homeRpc.data &&
        typeof homeRpc.data === "object" &&
        (homeRpc.data as { ok?: boolean }).ok !== false
      ) {
        homeEntry = [cid, homeRpc.data as Record<string, unknown>];
      }
      let resultsEntry: [string, Record<string, unknown>] | null = null;
      if (resultsRpc.error) {
        console.warn(
          `[fetch-all-data] get_member_results_contract(${cid}):`,
          resultsRpc.error.message ?? JSON.stringify(resultsRpc.error),
        );
      } else if (
        resultsRpc.data &&
        typeof resultsRpc.data === "object" &&
        !Array.isArray(resultsRpc.data)
      ) {
        resultsEntry = [cid, resultsRpc.data as Record<string, unknown>];
      }
      return { homeEntry, resultsEntry };
    }),
  );
  for (const row of rows) {
    if (row.homeEntry) homeSnapshots.set(row.homeEntry[0], row.homeEntry[1]);
    if (row.resultsEntry) {
      resultsContracts.set(row.resultsEntry[0], row.resultsEntry[1]);
    }
  }
  return { resultsContracts, homeSnapshots };
}

function flattenResultsAndRoundsFromContracts(
  camps: any[],
  resultsContractByCampaignId: Map<string, Record<string, unknown>>,
  profileNameById: Map<string, string>,
): { results: any[]; rounds: any[] } {
  const results: any[] = [];
  const rounds: any[] = [];
  for (const c of camps) {
    const cid = String(c.id);
    const rv = resultsContractByCampaignId.get(cid);
    const rbc = rv?.rows_by_competition;
    if (!rbc || typeof rbc !== "object") continue;
    for (const [compId, rowsUnknown] of Object.entries(
      rbc as Record<string, unknown>,
    )) {
      const rowList = asJsonObjectArray(rowsUnknown);
      for (const row of rowList) {
        const uid = String((row as any).user_id || "");
        const score = Number((row as any).score);
        if (!Number.isFinite(score)) continue;
        const player =
          String((row as any).player || "") ||
          profileNameById.get(uid) ||
          "";
        results.push({
          competition_id: compId,
          user_id: uid,
          player,
          score,
          stableford_score: score,
          snake: (row as any).snake ? 1 : 0,
          camel: (row as any).camel ? 1 : 0,
          position: Number((row as any).position) || 0,
        });
        rounds.push({
          id: `${compId}-${uid}`,
          competition_id: compId,
          user_id: uid,
          stableford_score: score,
          has_snake: !!(row as any).snake,
          has_camel: !!(row as any).camel,
        });
      }
    }
  }
  return { results, rounds };
}

/** Stats/Champs: season totals from `get_member_results_contract` summaries (paid winners only). */
function buildChampsFromResultsContract(
  contract: Record<string, unknown> | undefined,
  profileNameById: Map<string, string>,
): Array<{ user_id: string | null; player: string; weeks: number; amount: number }> {
  if (!contract) return [];
  const competitions = asJsonObjectArray(contract.competitions);
  const summaries = (contract.summary_by_competition || {}) as Record<
    string,
    unknown
  >;
  const rowsBy = (contract.rows_by_competition || {}) as Record<string, unknown>;

  const lowerNameToId = new Map<string, string>();
  for (const [id, name] of profileNameById.entries()) {
    const k = String(name || "").trim().toLowerCase();
    if (k) lowerNameToId.set(k, id);
  }
  const resolveUserId = (playerName: string): string | null => {
    const k = String(playerName || "").trim().toLowerCase();
    return lowerNameToId.get(k) ?? null;
  };

  type Acc = { player: string; weeks: number; amount: number };
  const agg = new Map<string, Acc>();

  for (const comp of competitions) {
    const compId = String((comp as any).id || "");
    if (!compId) continue;
    const s = summaries[compId] as Record<string, any> | undefined;
    if (!s || typeof s !== "object") continue;
    if (String(s.winner_type || "").toLowerCase() !== "winner") continue;
    const amt = Number(s.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;

    let names: string[] = [];
    const wn = s.winner_names;
    if (Array.isArray(wn)) {
      names = wn.map((x: unknown) => String(x || "").trim()).filter(Boolean);
    } else if (wn != null && typeof wn === "object") {
      names = asJsonObjectArray(wn).map((x: any) => String(x || "").trim()).filter(
        Boolean,
      );
    }
    if (!names.length) {
      const rows = asJsonObjectArray(rowsBy[compId]);
      const top = rows.filter((r: any) => Number(r.position) === 1);
      if (top.length === 1) {
        const p = String(top[0].player || "").trim();
        if (p) names = [p];
      }
    }
    if (!names.length) continue;

    const share = Math.round((amt / names.length) * 100) / 100;
    for (const rawName of names) {
      const player = String(rawName || "").trim();
      if (!player) continue;
      const uid = resolveUserId(player);
      const mapKey = uid || player.toLowerCase();
      const row = agg.get(mapKey) || { player, weeks: 0, amount: 0 };
      if (!row.player) row.player = player;
      row.weeks += 1;
      row.amount = Math.round((row.amount + share) * 100) / 100;
      agg.set(mapKey, row);
    }
  }

  return [...agg.values()]
    .map((r) => ({
      user_id: resolveUserId(r.player),
      player: r.player,
      weeks: r.weeks,
      amount: r.amount,
    }))
    .sort(
      (a, b) =>
        b.amount - a.amount || String(a.player).localeCompare(String(b.player)),
    );
}

/** Map v_summer_standings rows → PWA `best14` + `leagues` contract shapes. */
const buildBest14AndLeaguesFromSummerStandings = (
  rows: any[],
): { best14: any[]; leagues: any[] } => {
  const sorted = [...(rows || [])].sort(
    (a, b) =>
      Number(b?.best_14_total ?? 0) - Number(a?.best_14_total ?? 0),
  );
  const best14 = sorted.map((row, idx) => ({
    user_id: row.member_id,
    full_name: String(row.full_name || ""),
    best_total: Number(row.best_14_total) || 0,
    rank_no: idx + 1,
  }));

  const byTier = new Map<number, any[]>();
  for (const row of rows || []) {
    const t = Number(row?.tier);
    const key = Number.isFinite(t) ? t : 99;
    if (!byTier.has(key)) byTier.set(key, []);
    byTier.get(key)!.push(row);
  }

  const leagues: any[] = [];
  const tierKeys = [...byTier.keys()].sort((a, b) => a - b);
  for (const tier of tierKeys) {
    const bucket = byTier.get(tier)!;
    const leagueName = leagueNameForTier(tier);
    const inLeague = [...bucket].sort(
      (a, b) =>
        Number(b?.best_14_total ?? 0) - Number(a?.best_14_total ?? 0),
    );
    inLeague.forEach((row, i) => {
      leagues.push({
        league_name: leagueName,
        full_name: String(row.full_name || ""),
        rank_no: i + 1,
        total_score: Number(row.best_14_total) || 0,
        user_id: row.member_id,
      });
    });
  }

  return { best14, leagues };
};

/** Summer best14 + leagues from `v_summer_standings` only (greenfield). */
const loadSummerBest14AndLeagues = async (
  supabase: ReturnType<typeof createClient>,
  campaignId: string | null,
  _seasonYear: string,
  _seasonId: string,
): Promise<{ best14: any[]; leagues: any[] }> => {
  if (!campaignId) {
    return { best14: [], leagues: [] };
  }
  const { data, error } = await supabase
    .from("v_summer_standings")
    .select("member_id, full_name, tier, best_14_total")
    .eq("campaign_id", campaignId)
    .order("best_14_total", { ascending: false });
  if (!error && Array.isArray(data)) {
    return buildBest14AndLeaguesFromSummerStandings(data);
  }
  if (error) {
    console.warn(
      `[fetch-all-data] v_summer_standings campaign=${campaignId}:`,
      error.message ?? JSON.stringify(error),
    );
  }
  return { best14: [], leagues: [] };
};

/** Contract-v1 snapshot: maps campaigns / rounds / members into the PWA metadata shape. */
async function greenfieldFetchAll(
  supabase: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
  _url: URL,
  view: string | null,
  _seasonParam: string | null,
): Promise<Response> {
  const shellOnly = view === "shell";

  const [campaignsRes, membersRes, roundsRes] = await Promise.all([
    supabase.from("campaigns").select("*").order("year", { ascending: false }),
    supabase.from("members").select("id, full_name"),
    supabase
      .from("rounds")
      .select(
        "id, campaign_id, name, play_order, round_date, finalized, round_type, course_par",
      )
      .order("round_date", { ascending: true }),
  ]);

  const cErr = campaignsRes.error;
  if (cErr) {
    return new Response(JSON.stringify({ error: `campaigns: ${cErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const camps = campaignsRes.data ?? [];
  const openCamp =
    camps.find((c: any) => String(c.status || "").toLowerCase() === "open") ||
    camps[0] ||
    null;
  const openCampId = openCamp ? String(openCamp.id) : "";

  const members = membersRes.data ?? [];

  const rErr = roundsRes.error;
  if (rErr) {
    return new Response(JSON.stringify({ error: `rounds: ${rErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const roundsData = roundsRes.data;
  const allRounds = (roundsData ?? []).slice().sort((a: any, b: any) => {
    const ca = String(a.campaign_id || "");
    const cb = String(b.campaign_id || "");
    if (ca !== cb) return ca.localeCompare(cb);
    const pa = Number(a.play_order) || 0;
    const pb = Number(b.play_order) || 0;
    return pa - pb;
  });

  const profileNameById = new Map(
    members.map((m: any) => [String(m.id), String(m.full_name || "")]),
  );

  const greenfieldRpc = shellOnly
    ? {
        resultsContracts: new Map<string, Record<string, unknown>>(),
        homeSnapshots: new Map<string, Record<string, unknown>>(),
      }
    : await loadGreenfieldRpcSnapshots(supabase, camps);
  const resultsContractByCampaignId = greenfieldRpc.resultsContracts;
  const homeSnapshotByCampaignId = greenfieldRpc.homeSnapshots;
  const { results, rounds } = shellOnly
    ? { results: [] as any[], rounds: [] as any[] }
    : flattenResultsAndRoundsFromContracts(
        camps,
        resultsContractByCampaignId,
        profileNameById,
      );

  const competitions = allRounds.map((r: any) => {
    const d = r.round_date ? String(r.round_date).slice(0, 10) : "";
    return {
      id: String(r.id),
      name: String(r.name || `Week ${r.play_order ?? ""}`),
      competition_date: d,
      status: r.finalized ? "finalized" : "open",
      winner_id: null,
      season: String(r.campaign_id),
      play_order: Number(r.play_order) || 0,
      round_type: String(r.round_type || ""),
      prize_pot: 0,
      rollover_amount: 0,
    };
  });

  const campaignIdSet = new Set(camps.map((c: any) => String(c.id)));

  const defaultsRpc = await supabase.rpc("admin_get_app_defaults");

  let defaultResultsSeasonId: string | null = openCampId || null;
  if (!defaultsRpc.error && defaultsRpc.data) {
    const shellDefaults = Array.isArray(defaultsRpc.data)
      ? defaultsRpc.data[0]
      : defaultsRpc.data;
    if (
      shellDefaults &&
      typeof shellDefaults === "object" &&
      (shellDefaults as any).default_results_season_id
    ) {
      defaultResultsSeasonId = String(
        (shellDefaults as any).default_results_season_id,
      );
    }
  }

  const homeCampaignId = (() => {
    if (
      defaultResultsSeasonId &&
      campaignIdSet.has(String(defaultResultsSeasonId))
    ) {
      return String(defaultResultsSeasonId);
    }
    let bestCid = "";
    let bestT = -1;
    for (const r of allRounds) {
      const t = toTime(r.round_date) || 0;
      const cid = String(r.campaign_id || "");
      if (!cid) continue;
      if (t > bestT) {
        bestT = t;
        bestCid = cid;
      }
    }
    if (bestCid) return bestCid;
    return openCampId || (camps[0] ? String(camps[0].id) : "");
  })();

  /** Prefer app default / latest-round campaign, not only `open` — summer closed + winter open still needs summer MHS. */
  const mhsCampaignId =
    homeCampaignId && campaignIdSet.has(String(homeCampaignId))
      ? String(homeCampaignId)
      : null;

  const homeRoundIds = [
    ...new Set(
      (mhsCampaignId
        ? allRounds.filter(
            (r: any) => String(r.campaign_id) === String(mhsCampaignId),
          )
        : []
      )
        .map((r: any) => String(r.id || ""))
        .filter((id) => id.length > 0),
    ),
  ];

  const SNAPSHOT_SELECT =
    "id, member_id, round_id, handicap_before, handicap_after, created_at";

  const fetchHomeCampaignSnapshots = async (): Promise<any[]> => {
    if (!homeRoundIds.length) return [];
    const CHUNK = 35;
    const chunks: string[][] = [];
    for (let i = 0; i < homeRoundIds.length; i += CHUNK) {
      chunks.push(homeRoundIds.slice(i, i + CHUNK));
    }
    const parts = await Promise.all(
      chunks.map((chunk) =>
        supabase
          .from("handicap_snapshots")
          .select(SNAPSHOT_SELECT)
          .in("round_id", chunk)
          .is("superseded_at", null),
      ),
    );
    const out: any[] = [];
    for (const p of parts) {
      if (p.error) {
        console.warn(
          `[fetch-all-data] handicap_snapshots home campaign rounds:`,
          p.error.message ?? JSON.stringify(p.error),
        );
      } else {
        out.push(...(p.data ?? []));
      }
    }
    return out;
  };

  const [mhsRes, snapHomeRows, snapRecentRes] = await Promise.all([
    mhsCampaignId
      ? supabase
          .from("member_handicap_state")
          .select("member_id, handicap")
          .eq("campaign_id", mhsCampaignId)
      : Promise.resolve({ data: [] as any[] }),
    fetchHomeCampaignSnapshots(),
    supabase
      .from("handicap_snapshots")
      .select(SNAPSHOT_SELECT)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(8000),
  ]);
  const mhsRows = mhsRes.data ?? [];
  const hciMap = new Map(
    mhsRows.map((h: any) => [String(h.member_id), h.handicap]),
  );

  const profiles = members.map((m: any) => ({
    id: String(m.id),
    full_name: String(m.full_name || ""),
    role: "member",
    league_name: null,
    current_handicap: hciMap.get(String(m.id)) ?? null,
  }));

  if (snapRecentRes.error) {
    console.warn(
      "[fetch-all-data] handicap_snapshots(recent):",
      snapRecentRes.error.message ?? JSON.stringify(snapRecentRes.error),
    );
  }

  const snapById = new Map<string, any>();
  for (const s of snapHomeRows) {
    const k = String((s as any)?.id ?? "");
    if (k) snapById.set(k, s);
  }
  for (const s of snapRecentRes.data ?? []) {
    const k = String((s as any)?.id ?? "");
    if (k && !snapById.has(k)) snapById.set(k, s);
  }
  const snapRows = [...snapById.values()].sort(
    (a: any, b: any) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime(),
  );

  const handicap_history = (snapRows ?? []).map((s: any) => ({
    user_id: String(s.member_id ?? ""),
    competition_id: s.round_id != null ? String(s.round_id) : "",
    old_handicap: s.handicap_before,
    new_handicap: s.handicap_after,
    adjustment: Number(
      (Number(s.handicap_after) - Number(s.handicap_before)).toFixed(1),
    ),
    created_at: s.created_at,
    competition_date: null,
  }));

  const seasons = camps.map((c: any) => {
    const id = String(c.id);
    const isOpen = String(c.status || "").toLowerCase() === "open";
    return {
      id,
      start_year:
        Number(c.year) ||
        new Date(String(c.start_date || "2000-01-01")).getFullYear(),
      name: String(c.label || ""),
      label: String(c.label || ""),
      is_active: isOpen,
      is_current: Boolean(homeCampaignId && id === homeCampaignId),
    };
  });

  const best14: Record<string, any[]> = {};
  const leagues: Record<string, any[]> = {};
  const dashboard: Record<string, any> = {};

  /** Avoid overwriting metadata[year] when multiple campaigns share the same calendar year. */
  const campaignsPerYear = new Map<string, number>();
  for (const c of camps) {
    const y = c?.year;
    const ys = y != null && String(y).trim() !== "" ? String(y) : "";
    if (ys) campaignsPerYear.set(ys, (campaignsPerYear.get(ys) || 0) + 1);
  }

  type StandingsPack = { best14: any[]; leagues: any[] };
  const standingsByCampaignId = new Map<string, StandingsPack>();
  if (!shellOnly) {
    const summerCamps = camps.filter((c: any) => isSummerMainCampaign(c));
    const packs = await Promise.all(
      summerCamps.map(async (c: any) => {
        const cid = String(c.id);
        const yrRaw = c.year;
        const yr =
          yrRaw != null && String(yrRaw).trim() !== ""
            ? String(yrRaw)
            : "";
        const res = await loadSummerBest14AndLeagues(
          supabase,
          cid,
          yr || String(Number(c.year) || ""),
          cid,
        );
        return {
          cid,
          best14: res.best14 || [],
          leagues: res.leagues || [],
        };
      }),
    );
    for (const p of packs) {
      standingsByCampaignId.set(p.cid, {
        best14: p.best14,
        leagues: p.leagues,
      });
    }
  }

  for (const c of camps) {
    const cid = String(c.id);
    const yrRaw = c.year;
    const yr = yrRaw != null && String(yrRaw).trim() !== "" ? String(yrRaw) : "";

    let b14: any[] = [];
    let lg: any[] = [];
    if (!shellOnly && isSummerMainCampaign(c)) {
      const pack = standingsByCampaignId.get(cid);
      b14 = pack?.best14 ?? [];
      lg = pack?.leagues ?? [];
    }
    best14[cid] = b14;
    leagues[cid] = lg;
    if (yr && (campaignsPerYear.get(yr) || 0) === 1) {
      best14[yr] = b14;
      leagues[yr] = lg;
    }

    const campRoundRows = allRounds
      .filter((r: any) => String(r.campaign_id) === cid)
      .sort((a: any, b: any) => {
        const poA = Number(a.play_order) || 0;
        const poB = Number(b.play_order) || 0;
        if (poA !== poB) return poA - poB;
        return (toTime(a.round_date) || 0) - (toTime(b.round_date) || 0);
      });
    const lr =
      campRoundRows.find((r: any) => !r.finalized) ||
      campRoundRows[campRoundRows.length - 1] ||
      null;

    const sqlResults = resultsContractByCampaignId.get(cid);
    const EMPTY_RESULTS_VIEW = {
      default_competition_id: "",
      competitions: [] as any[],
      rows_by_competition: {} as Record<string, any[]>,
      summary_by_competition: {} as Record<string, any>,
    };
    const results_view = shellOnly
      ? EMPTY_RESULTS_VIEW
      : sqlResults &&
          Array.isArray(sqlResults.competitions) &&
          typeof sqlResults.rows_by_competition === "object"
        ? (sqlResults as Record<string, unknown>)
        : (() => {
            console.warn(
              `[fetch-all-data] get_member_results_contract missing or invalid for campaign ${cid}`,
            );
            return { ...EMPTY_RESULTS_VIEW };
          })();

    const rvSum = (results_view.summary_by_competition ||
      {}) as Record<string, any>;
    const rvRows = (results_view.rows_by_competition ||
      {}) as Record<string, any[]>;
    const sid = lr ? String(lr.id) : "";

    /** Same round as `get_member_home_snapshot` handicap_changes for summer_main. */
    const finalizedSummerWeekly = campRoundRows.filter(
      (r: any) =>
        Boolean(r.finalized) &&
        String(r.round_type || "").toLowerCase() === "summer_weekly",
    );
    const sortedFinSummer = finalizedSummerWeekly.slice().sort((a: any, b: any) => {
      const poa = Number.isFinite(Number(a.play_order))
        ? Number(a.play_order)
        : 2147483647;
      const pob = Number.isFinite(Number(b.play_order))
        ? Number(b.play_order)
        : 2147483647;
      if (poa !== pob) return pob - poa;
      const ta = toTime(a.round_date) || 0;
      const tb = toTime(b.round_date) || 0;
      if (ta !== tb) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
    const lastFinSummerWeeklyId = sortedFinSummer[0]
      ? String(sortedFinSummer[0].id)
      : null;
    const anyFinalizedInCamp = campRoundRows
      .filter((r: any) => Boolean(r.finalized))
      .slice()
      .sort((a: any, b: any) => {
        const poa = Number.isFinite(Number(a.play_order))
          ? Number(a.play_order)
          : 0;
        const pob = Number.isFinite(Number(b.play_order))
          ? Number(b.play_order)
          : 0;
        if (poa !== pob) return pob - poa;
        const ta = toTime(a.round_date) || 0;
        const tb = toTime(b.round_date) || 0;
        if (ta !== tb) return tb - ta;
        return String(b.id).localeCompare(String(a.id));
      })[0];
    const lastFinAnyId = anyFinalizedInCamp
      ? String(anyFinalizedInCamp.id)
      : null;
    const focusRoundBuilt = isSummerMainCampaign(c)
      ? lastFinSummerWeeklyId || lastFinAnyId
      : sid || null;

    const findRoundKey = (
      m: Record<string, unknown> | undefined,
    ): string | null => {
      if (!m || !sid) return null;
      if (Object.prototype.hasOwnProperty.call(m, sid)) return sid;
      const low = sid.toLowerCase();
      for (const k of Object.keys(m)) {
        if (k.toLowerCase() === low) return k;
      }
      return null;
    };
    const roundKey =
      lr && !shellOnly
        ? findRoundKey(rvSum as any) || findRoundKey(rvRows as any)
        : null;

    const summaryForLr =
      lr && !shellOnly && roundKey ? rvSum[roundKey] : null;

    const weekDateRaw =
      summaryForLr?.week_date ||
      (lr?.round_date ? String(lr.round_date).slice(0, 10) : null);
    const weekNum = summaryForLr?.week_number;
    let weekLabel = "WEEK — , —";
    if (lr) {
      const weekDate =
        weekDateRaw && String(weekDateRaw).trim()
          ? new Date(String(weekDateRaw)).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })
          : null;
      if (
        weekNum != null &&
        weekNum !== "" &&
        weekDate &&
        Number.isFinite(Number(weekNum))
      ) {
        weekLabel = `WEEK ${Number(weekNum)}, ${weekDate}`;
      } else {
        weekLabel = String(lr.name || `Week ${lr.play_order ?? ""}`);
      }
    }

    const hero =
      summaryForLr &&
      typeof summaryForLr.hero_message === "string" &&
      summaryForLr.hero_message.trim()
        ? String(summaryForLr.hero_message).trim()
        : lr
          ? lr.finalized
            ? `${weekLabel} · completed`
            : `${weekLabel} · in progress`
          : "No rounds yet for this campaign.";

    const contractRows =
      lr && !shellOnly && roundKey && rvRows[roundKey]
        ? (asJsonObjectArray(rvRows[roundKey]) as any[])
        : [];
    const statsFromRows = {
      players: contractRows.length,
      snakes: contractRows.reduce(
        (a: number, x: any) => a + (x.snake ? 1 : 0),
        0,
      ),
      camels: contractRows.reduce(
        (a: number, x: any) => a + (x.camel ? 1 : 0),
        0,
      ),
    };

    const summaryPlayers =
      Number(summaryForLr?.stats?.players) > 0
        ? Number(summaryForLr.stats.players)
        : 0;
    const sm = summaryForLr?.stats;
    const stats = {
      players:
        Number(sm?.players) > 0
          ? Number(sm.players)
          : statsFromRows.players,
      snakes:
        Number(sm?.snakes) > 0
          ? Number(sm.snakes)
          : statsFromRows.snakes,
      camels:
        Number(sm?.camels) > 0
          ? Number(sm.camels)
          : statsFromRows.camels,
    };

    const hmRaw = summaryForLr
      ? String(summaryForLr.hero_message || "").trim()
      : "";
    let heroOut = hero;
    if (
      (contractRows.length > 0 ||
        summaryPlayers > 0) &&
      (!hmRaw || hmRaw === "No results yet.")
    ) {
      heroOut = lr?.finalized
        ? `${weekLabel} · completed`
        : `${weekLabel} · in progress`;
    }

    const heroTrim = String(heroOut || "").trim();
    const heroLooksLikeResult =
      heroTrim.length > 0 &&
      heroTrim !== "No results yet." &&
      heroTrim !== "No rounds yet for this campaign." &&
      (heroTrim.includes("£") ||
        /points|win|rollover|tied|scored/i.test(heroTrim));

    const no_results =
      !lr ||
      (!heroLooksLikeResult &&
        contractRows.length === 0 &&
        summaryPlayers === 0 &&
        !(
          (Array.isArray(b14) && b14.length > 0) ||
          (Array.isArray(lg) && lg.length > 0)
        ));

    const best14_leaders = (b14 || [])
      .filter((row: any) => Number(row?.rank_no ?? 999) <= 3)
      .map((row: any, idx: number) => ({
        id: row.user_id,
        user_id: row.user_id,
        full_name: row.full_name,
        position: Number(row.rank_no) || idx + 1,
        total_score: Number(row.best_total) || 0,
      }));
    const leadersByLeague = new Map<string, any>();
    for (const row of lg || []) {
      const leagueName = String(row?.league_name || "");
      if (!leagueName) continue;
      const rankNo = Number(row?.rank_no ?? 999999);
      const current = leadersByLeague.get(leagueName);
      const currentRank = Number(current?.rank_no ?? 999999);
      if (!current || rankNo < currentRank) {
        leadersByLeague.set(leagueName, row);
      }
    }
    const league_leaders = [...leadersByLeague.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, row], idx: number) => ({
        id: row?.user_id,
        user_id: row.user_id,
        league_name: row.league_name,
        full_name: row.full_name,
        position: Number(row.rank_no) || idx + 1,
        total_score: Number(row.total_score) || 0,
      }));

    const compNorm = (x: unknown) => String(x || "").toLowerCase();
    /** Match `focus_round_id` (last finalized week), not `lr` (next open week). */
    const hcRoundId =
      focusRoundBuilt != null && String(focusRoundBuilt).trim() !== ""
        ? String(focusRoundBuilt)
        : sid;
    const hcComp = compNorm(hcRoundId);
    const handicap_changes = hcRoundId
      ? (handicap_history as any[])
          .filter((h: any) => compNorm(h.competition_id) === hcComp)
          .slice()
          .sort(
            (a: any, b: any) =>
              (toTime(b.created_at) || 0) - (toTime(a.created_at) || 0),
          )
          .map((h: any) => ({
            user_id: String(h.user_id || ""),
            full_name: profileNameById.get(String(h.user_id)) || "",
            oldRounded: Math.round(Number(h.old_handicap ?? 0) * 10) / 10,
            newRounded: Math.round(Number(h.new_handicap ?? 0) * 10) / 10,
          }))
      : [];

    const dashBlock = {
      home: {
        week_label: weekLabel,
        hero_message: heroOut,
        no_results,
        stats,
        handicap_changes,
        focus_round_id: focusRoundBuilt,
      },
      best14_leaders,
      league_leaders,
      results_view,
    };

    const sqlHomeSnap = homeSnapshotByCampaignId.get(cid);
    if (
      !shellOnly &&
      isSummerMainCampaign(c) &&
      sqlHomeSnap &&
      typeof sqlHomeSnap.home === "object" &&
      sqlHomeSnap.home !== null
    ) {
      const h = sqlHomeSnap.home as Record<string, unknown>;
      const b14 = sqlHomeSnap.best14_leaders;
      const llg = sqlHomeSnap.league_leaders;
      const hFocus = (h as Record<string, unknown>).focus_round_id;
      const focusFromRpc =
        hFocus != null && String(hFocus).trim() !== "" ? String(hFocus) : null;
      dashBlock.home = {
        week_label: String(h.week_label ?? dashBlock.home.week_label),
        hero_message: String(h.hero_message ?? dashBlock.home.hero_message),
        no_results:
          typeof h.no_results === "boolean"
            ? h.no_results
            : dashBlock.home.no_results,
        stats:
          h.stats && typeof h.stats === "object"
            ? (h.stats as typeof dashBlock.home.stats)
            : dashBlock.home.stats,
        handicap_changes: Array.isArray(h.handicap_changes)
          ? h.handicap_changes
          : dashBlock.home.handicap_changes,
        focus_round_id: focusFromRpc ?? focusRoundBuilt,
      };
      const b14Rpc = asJsonObjectArray(b14);
      const llgRpc = asJsonObjectArray(llg);
      dashBlock.best14_leaders = b14Rpc.length ? b14Rpc : best14_leaders;
      dashBlock.league_leaders = llgRpc.length ? llgRpc : league_leaders;
    }

    dashboard[cid] = dashBlock;
    if (yr && (campaignsPerYear.get(yr) || 0) === 1) {
      dashboard[yr] = dashBlock;
    }
  }

  const winners: Record<string, any[]> = {};
  if (!shellOnly) {
    for (const c of camps) {
      const cid = String(c.id);
      const yrRaw = c.year;
      const yr =
        yrRaw != null && String(yrRaw).trim() !== "" ? String(yrRaw) : "";
      const list = buildChampsFromResultsContract(
        resultsContractByCampaignId.get(cid),
        profileNameById,
      );
      winners[cid] = list;
      if (yr && (campaignsPerYear.get(yr) || 0) === 1) {
        winners[yr] = list;
      }
    }
  }

  // ── RS Cup: competitions + cup_matches ────────────────────────────────────
  const stageToRoundNumber: Record<string, number> = {
    prelim: 0, r1: 1, r2: 2, qf: 3, sf: 4, final: 5,
  };
  // Well-known labels; anything else is title-cased from the raw stage_code.
  const stageToLabel: Record<string, string> = {
    prelim:  "Preliminary Round",
    r1:      "First Round",
    r2:      "Second Round",
    qf:      "Quarter Finals",
    sf:      "Semi Finals",
    final:   "The Final",
  };
  const stageCodeToRoundNumber = (code: string): number => {
    const lower = code.toLowerCase().trim();
    if (stageToRoundNumber[lower] !== undefined) return stageToRoundNumber[lower];
    const n = parseInt(lower.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 99;
  };
  const stageCodeToLabel = (code: string): string => {
    const lower = code.toLowerCase().trim();
    if (stageToLabel[lower]) return stageToLabel[lower];
    // Title-case the raw entry (e.g. "Prelim Round" → "Prelim Round")
    return code.replace(/\b\w/g, (c) => c.toUpperCase());
  };

  let matchplay_tournaments: any[] = [];
  let matchplay_matches: any[] = [];
  const [compRes, cupRes] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, type, campaign_id")
      .eq("type", "rs_cup")
      .order("name", { ascending: true }),
    supabase
      .from("cup_matches")
      .select(
        "id, competition_id, stage_code, slot_index, home_member_id, away_member_id, winner_member_id, result_text, play_by_date",
      )
      .order("stage_code", { ascending: true })
      .order("slot_index", { ascending: true }),
  ]);

  if (!compRes.error) {
    matchplay_tournaments = (compRes.data ?? []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name || "RS Cup"),
      campaign_id: String(c.campaign_id || ""),
    }));
  }
  if (!cupRes.error) {
    matchplay_matches = (cupRes.data ?? []).map((m: any) => ({
      id: String(m.id),
      tournament_id: String(m.competition_id || ""),
      round_number: stageCodeToRoundNumber(String(m.stage_code || "")),
      stage_code: String(m.stage_code || ""),
      stage_label: stageCodeToLabel(String(m.stage_code || "")),
      slot_index: m.slot_index,
      player1_id: m.home_member_id ? String(m.home_member_id) : null,
      player2_id: m.away_member_id ? String(m.away_member_id) : null,
      winner_id: m.winner_member_id ? String(m.winner_member_id) : null,
      result_text: m.result_text ?? null,
      play_by_date: m.play_by_date ?? null,
    }));
  }

  const payload: Record<string, unknown> = {
    api_version: "contract-v1",
    build_id: BUILD_ID,
    defaults: {
      results_season_id: homeCampaignId || defaultResultsSeasonId,
      home_season_id: homeCampaignId || defaultResultsSeasonId,
    },
    seasons,
    competitions: shellOnly ? competitions.slice(0, 200) : competitions,
    profiles,
    handicap_history: shellOnly
      ? (handicap_history || []).slice(0, 400)
      : handicap_history,
    results: shellOnly ? [] : results,
    summaries: [],
    rounds: shellOnly ? [] : rounds,
    best14: shellOnly ? {} : best14,
    leagues: shellOnly ? {} : leagues,
    dashboard: shellOnly ? {} : dashboard,
    winners: shellOnly ? {} : winners,
    matchplay_tournaments: matchplay_tournaments,
    matchplay_matches: matchplay_matches,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

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

  try {
    return await greenfieldFetchAll(
      supabase,
      corsHeaders,
      url,
      view,
      seasonParam,
    );
  } catch (err: unknown) {
    console.error("[fetch-all-data]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
