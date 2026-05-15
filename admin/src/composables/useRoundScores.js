/**
 * Shared helpers for round-scoped score entry (CRUD + dedicated entry view).
 */

const ACTIVE_CAMPAIGN_KEY = "wags_admin_active_campaign_id";

/** Cached: live DB may not have migrated `players` yet (PostgREST 404). */
let playersTableUnavailable = null;

/** Pick best default round: latest non-finalized weekly, else latest weekly, else first. */
export function pickDefaultRoundId(rounds, { preferTypes = ["summer_weekly", "winter_weekly"] } = {}) {
  if (!rounds?.length) return "";
  const weekly = rounds.filter((r) => preferTypes.includes(r.round_type));
  const pool = weekly.length ? weekly : rounds;
  const open = pool.filter((r) => !r.finalized);
  const sorted = [...(open.length ? open : pool)].sort((a, b) => {
    const pa = a.play_order ?? 0;
    const pb = b.play_order ?? 0;
    if (pa !== pb) return pb - pa;
    const da = a.round_date ? new Date(a.round_date).getTime() : 0;
    const db = b.round_date ? new Date(b.round_date).getTime() : 0;
    return db - da;
  });
  return sorted[0]?.id ?? rounds[0]?.id ?? "";
}

export function formatRoundLabel(r) {
  const date = r.round_date ? String(r.round_date).slice(0, 10) : "?";
  const nm = r.name ? `${r.name} · ` : "";
  const fin = r.finalized ? " · done" : "";
  const camp = r.campaigns?.label ?? "—";
  return `${nm}${date} · ${r.round_type}${fin} · ${camp}`;
}

export function mapRoundOptions(list) {
  return (list ?? []).map((r) => ({
    id: r.id,
    label: formatRoundLabel(r),
    finalized: Boolean(r.finalized),
    campaignId: r.campaign_id,
    roundType: r.round_type,
    roundDate: r.round_date,
    name: r.name,
    playOrder: r.play_order,
    raw: r,
  }));
}

/** Member ids that already have a round_players row for this round. */
export function scoredMemberIdsFromRows(rows) {
  const ids = new Set();
  for (const row of rows ?? []) {
    if (row.member_id) ids.add(String(row.member_id));
  }
  return ids;
}

export function isDuplicateKeyError(err) {
  const msg = err?.message || String(err);
  const code = err?.code;
  return code === "23505" || /duplicate key|uq_round_player/i.test(msg);
}

export function isMissingRelationError(err) {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? err).toLowerCase();
  const status = err.status ?? err.statusCode;
  return (
    status === 404 ||
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("could not find the table") ||
    msg.includes("relation") && msg.includes("does not exist") ||
    msg.includes("/players")
  );
}

export function friendlyDuplicateScoreMessage() {
  return "This member already has a score for this round. Use Edit on their existing row, or open Enter scores.";
}

export function getActiveCampaignId() {
  try {
    return localStorage.getItem(ACTIVE_CAMPAIGN_KEY) || "";
  } catch {
    return "";
  }
}

export function setActiveCampaignId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
    else localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
  } catch {
    /* ignore */
  }
}

function mapMemberRows(rows) {
  return (rows ?? [])
    .filter((r) => r.memberId && r.fullName)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Roster from `players` when that table exists on the project. */
async function loadRosterFromPlayers(sb, campaignId) {
  const { data, error } = await sb
    .from("players")
    .select("member_id, is_eligible, members(full_name)")
    .eq("campaign_id", campaignId)
    .eq("is_eligible", true);
  if (error) throw error;
  return mapMemberRows(
    (data ?? [])
      .filter((p) => p.members?.full_name)
      .map((p) => ({
        memberId: p.member_id,
        fullName: p.members.full_name,
      })),
  );
}

/** Roster from league tiers for this campaign (live DB fallback). */
async function loadRosterFromLeagueAssignments(sb, campaignId) {
  const { data, error } = await sb
    .from("league_assignments")
    .select("member_id, members(full_name)")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  const byId = new Map();
  for (const row of data ?? []) {
    if (!row.member_id || !row.members?.full_name) continue;
    byId.set(row.member_id, {
      memberId: row.member_id,
      fullName: row.members.full_name,
    });
  }
  return mapMemberRows([...byId.values()]);
}

/** All members (last resort). */
export async function loadActiveMembers(sb) {
  if (!sb) return [];
  const { data, error } = await sb
    .from("members")
    .select("id, full_name")
    .order("full_name", { ascending: true })
    .limit(500);
  if (error) throw error;
  return mapMemberRows(
    (data ?? []).map((m) => ({ memberId: m.id, fullName: m.full_name })),
  );
}

/**
 * Campaign roster for score entry.
 * Tries: players → league_assignments → all members.
 * @returns {{ roster: Array<{memberId, fullName}>, source: string }}
 */
export async function loadCampaignRoster(sb, campaignId) {
  if (!sb || !campaignId) {
    return { roster: [], source: "none" };
  }

  if (playersTableUnavailable !== true) {
    try {
      const roster = await loadRosterFromPlayers(sb, campaignId);
      if (roster.length) return { roster, source: "players" };
    } catch (err) {
      if (isMissingRelationError(err)) {
        playersTableUnavailable = true;
      } else {
        console.warn("[wags-admin] players roster:", err?.message || err);
      }
    }
  }

  try {
    const roster = await loadRosterFromLeagueAssignments(sb, campaignId);
    if (roster.length) return { roster, source: "league_assignments" };
  } catch (err) {
    if (!isMissingRelationError(err)) {
      console.warn("[wags-admin] league_assignments roster:", err?.message || err);
    }
  }

  const roster = await loadActiveMembers(sb);
  return { roster, source: "members" };
}

export async function loadRoundById(sb, roundId) {
  if (!sb || !roundId) return null;
  const { data, error } = await sb
    .from("rounds")
    .select("id, name, round_date, round_type, finalized, campaign_id, play_order, campaigns(label, year, kind)")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Pre-finalize check: roster coverage and stableford points present.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ id: string, campaign_id?: string | null, name?: string | null }} round
 */
export async function checkRoundFinalizeReady(sb, round) {
  const roundId = round?.id;
  if (!sb || !roundId) {
    return { ok: false, summary: "Invalid round", missing: [], incomplete: [], rosterCount: 0, scoredCount: 0 };
  }

  const { data: scoreRows, error: sErr } = await sb
    .from("round_players")
    .select("member_id, stableford_points, disqualified, members(full_name)")
    .eq("round_id", roundId);
  if (sErr) throw sErr;

  const scores = scoreRows ?? [];
  const scoreByMember = new Map(scores.map((s) => [s.member_id, s]));

  let roster = [];
  if (round.campaign_id) {
    const { roster: list } = await loadCampaignRoster(sb, round.campaign_id);
    roster = list;
  }

  const missing = [];
  const incomplete = [];

  if (roster.length) {
    for (const m of roster) {
      const s = scoreByMember.get(m.memberId);
      if (!s) missing.push(m);
      else if (s.stableford_points == null && !s.disqualified) incomplete.push(m);
    }
  } else {
    for (const s of scores) {
      if (s.stableford_points == null && !s.disqualified) {
        incomplete.push({
          memberId: s.member_id,
          fullName: s.members?.full_name ?? String(s.member_id),
        });
      }
    }
    if (!scores.length) {
      return {
        ok: false,
        summary: "No scores entered for this round",
        missing: [],
        incomplete: [],
        rosterCount: 0,
        scoredCount: 0,
      };
    }
  }

  const parts = [];
  if (missing.length) parts.push(`${missing.length} missing from scores`);
  if (incomplete.length) parts.push(`${incomplete.length} without points`);
  const summary = parts.length ? parts.join("; ") : "";

  return {
    ok: parts.length === 0,
    summary,
    missing,
    incomplete,
    rosterCount: roster.length,
    scoredCount: scores.length,
  };
}

/** Human label for where the roster list came from. */
export function rosterSourceLabel(source) {
  switch (source) {
    case "players":
      return "Campaign roster (players table)";
    case "league_assignments":
      return "League assignments for this campaign";
    case "members":
      return "All members (no campaign roster found)";
    default:
      return "";
  }
}
