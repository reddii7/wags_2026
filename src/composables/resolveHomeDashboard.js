/**
 * Resolves the same dashboard block as HomeView (`metadata.dashboard[…]`).
 * Also returns `campaignId` when we can infer it from the matched season.
 */

export function resolveHomeContext(metadata) {
  const dashboard = metadata?.dashboard || {};
  const defaults = metadata?.defaults || {};
  const seasons = Array.isArray(metadata?.seasons) ? metadata.seasons : [];

  const trySeasonWithId = (season) => {
    if (!season || typeof season !== "object") return null;
    const id = String(season.id ?? "");
    const yr =
      season.start_year != null && String(season.start_year).trim() !== ""
        ? String(season.start_year)
        : "";
    if (id && dashboard[id] && typeof dashboard[id] === "object") {
      return { dash: dashboard[id], campaignId: id };
    }
    if (yr && dashboard[yr] && typeof dashboard[yr] === "object") {
      return { dash: dashboard[yr], campaignId: id || null };
    }
    return null;
  };

  const currentSeason =
    seasons.find((season) => season?.is_current) ||
    seasons.find((season) => season?.is_active) ||
    null;
  const fromCurrent = trySeasonWithId(currentSeason);
  if (fromCurrent) return fromCurrent;

  const preferredIds = [
    defaults.home_season_id,
    defaults.results_season_id,
  ].filter(Boolean);

  for (const seasonId of preferredIds) {
    const key = String(seasonId);
    if (dashboard[key] && typeof dashboard[key] === "object") {
      const seasonObj = seasons.find((s) => String(s.id) === key);
      return {
        dash: dashboard[key],
        campaignId: seasonObj ? String(seasonObj.id) : key,
      };
    }
  }

  const activeSeason = seasons.find((season) => season?.is_active);
  const fromActive = trySeasonWithId(activeSeason);
  if (fromActive) return fromActive;

  const dashboardEntries = Object.values(dashboard).filter(
    (value) => value && typeof value === "object",
  );
  if (dashboardEntries[0]) {
    return { dash: dashboardEntries[0], campaignId: null };
  }
  return { dash: null, campaignId: null };
}

export function resolveHomeDashboardBlock(metadata) {
  return resolveHomeContext(metadata).dash;
}

/**
 * Dashboard slice used for handicaps / LAST CHG: prefer `defaults.home_season_id`
 * (same campaign the API puts in `defaults`) before `resolveHomeContext`'s
 * `seasons.is_current` pick. Otherwise winter can be "current" while summer has
 * the latest `focus_round_id` + snapshots — LAST CHG stayed empty.
 */
export function resolveHandicapDashboardBlock(metadata) {
  const dashboard = metadata?.dashboard || {};
  if (!dashboard || typeof dashboard !== "object") return null;
  const preferred = [
    metadata?.defaults?.home_season_id,
    metadata?.defaults?.results_season_id,
  ].filter(Boolean);
  for (const id of preferred) {
    const key = String(id);
    if (dashboard[key] && typeof dashboard[key] === "object") {
      return dashboard[key];
    }
  }
  return resolveHomeDashboardBlock(metadata);
}

/** Compare UUIDs / ids case-insensitively (Postgres vs JS string casing). */
export function normId(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "");
}

export function roundIdBelongsToCampaign(roundId, competitions, campaignId) {
  if (!roundId || !campaignId) return false;
  const r = normId(roundId);
  return (competitions || []).some(
    (c) =>
      String(c.season) === String(campaignId) && normId(c.id) === r,
  );
}

/** True if this round appears in the metadata competitions list (any campaign). */
export function roundIdKnownInMetadataCompetitions(roundId, competitions) {
  if (!roundId) return false;
  const r = normId(roundId);
  return (competitions || []).some((c) => normId(c.id) === r);
}

/**
 * When Home shows handicap moves, infer the round_id those rows share in
 * `handicap_history` **for the same campaign only**. Counting all seasons can
 * pick e.g. week 6 of 2025 when the home season is 2026.
 */
export function inferFocusRoundIdFromHomeChanges(
  homeHc,
  history,
  competitions,
  campaignId,
) {
  if (!Array.isArray(homeHc) || !homeHc.length) return null;
  if (!Array.isArray(history) || !history.length) return null;
  if (!campaignId) return null;

  const roundIdsInCampaign = new Set(
    (competitions || [])
      .filter((c) => String(c.season) === String(campaignId))
      .map((c) => normId(c.id)),
  );
  if (!roundIdsInCampaign.size) return null;

  const uids = new Set(
    homeHc.map((x) => normId(x.user_id)).filter(Boolean),
  );
  if (!uids.size) return null;

  const counts = new Map();
  for (const row of history) {
    const uid = normId(row.user_id);
    if (!uids.has(uid)) continue;
    const cid = normId(row.competition_id);
    if (!cid || !roundIdsInCampaign.has(cid)) continue;
    counts.set(cid, (counts.get(cid) || 0) + 1);
  }

  let bestNorm = null;
  let best = 0;
  for (const [c, n] of counts) {
    if (n > best) {
      best = n;
      bestNorm = c;
    }
  }
  if (!bestNorm) return null;

  for (const row of history) {
    if (normId(row.competition_id) === bestNorm) {
      return String(row.competition_id);
    }
  }
  return null;
}

export function resolveCampaignIdForHandicaps(metadata) {
  const d = metadata?.defaults || {};
  const fromDefaults = d.home_season_id || d.results_season_id;
  if (fromDefaults != null && String(fromDefaults).trim() !== "") {
    return String(fromDefaults);
  }
  const { campaignId } = resolveHomeContext(metadata);
  return campaignId || null;
}

function pickLastFinalizedSummerWeeklyId(competitions, campaignId) {
  if (!campaignId) return null;
  const rows = (competitions || []).filter(
    (c) =>
      String(c.season) === String(campaignId) &&
      String(c.status || "").toLowerCase() === "finalized" &&
      String(c.round_type || "").toLowerCase() === "summer_weekly",
  );
  if (!rows.length) return null;
  rows.sort((a, b) => {
    const pa = Number.isFinite(Number(a.play_order))
      ? Number(a.play_order)
      : 2147483647;
    const pb = Number.isFinite(Number(b.play_order))
      ? Number(b.play_order)
      : 2147483647;
    if (pa !== pb) return pb - pa;
    const da = new Date(a.competition_date || 0).getTime();
    const db = new Date(b.competition_date || 0).getTime();
    if (da !== db) return db - da;
    return String(b.id).localeCompare(String(a.id));
  });
  return rows[0]?.id != null ? String(rows[0].id) : null;
}

function pickLastFinalizedAnyRoundId(competitions, campaignId) {
  if (!campaignId) return null;
  const rows = (competitions || []).filter(
    (c) =>
      String(c.season) === String(campaignId) &&
      String(c.status || "").toLowerCase() === "finalized",
  );
  if (!rows.length) return null;
  rows.sort((a, b) => {
    const pa = Number.isFinite(Number(a.play_order))
      ? Number(a.play_order)
      : 0;
    const pb = Number.isFinite(Number(b.play_order))
      ? Number(b.play_order)
      : 0;
    if (pa !== pb) return pb - pa;
    const da = new Date(a.competition_date || 0).getTime();
    const db = new Date(b.competition_date || 0).getTime();
    if (da !== db) return db - da;
    return String(b.id).localeCompare(String(a.id));
  });
  return rows[0]?.id != null ? String(rows[0].id) : null;
}

function pickLrRoundId(competitions, campaignId) {
  if (!campaignId) return null;
  const camp = (competitions || [])
    .filter((c) => String(c.season) === String(campaignId))
    .sort((a, b) => Number(a.play_order || 0) - Number(b.play_order || 0));
  const lr =
    camp.find((c) => String(c.status || "").toLowerCase() === "open") ||
    camp[camp.length - 1];
  return lr?.id != null ? String(lr.id) : null;
}

function campaignLooksSummer(competitions, campaignId) {
  return (competitions || []).some(
    (c) =>
      String(c.season) === String(campaignId) &&
      String(c.round_type || "").toLowerCase() === "summer_weekly",
  );
}

/**
 * Round id for Handicaps / LAST CHG. Prefer `dashboard.home.focus_round_id` only
 * when that round exists in `competitions` for `resolveCampaignIdForHandicaps`;
 * otherwise a winter (or other) UUID yields no `handicap_history` rows and every
 * LAST CHG is blank while the modal still looks fine.
 */
export function resolveHandicapFocusRoundId(metadata, competitions, history) {
  const campaignId = resolveCampaignIdForHandicaps(metadata);
  const dash = resolveHandicapDashboardBlock(metadata);

  const fromPayload = dash?.home?.focus_round_id;
  if (fromPayload != null && String(fromPayload).trim() !== "") {
    const rid = String(fromPayload);
    const known = roundIdKnownInMetadataCompetitions(rid, competitions);
    const inHandicapCampaign =
      !campaignId ||
      roundIdBelongsToCampaign(rid, competitions, campaignId);
    if (known && inHandicapCampaign) {
      return rid;
    }
  }

  const inferred = inferFocusRoundIdFromHomeChanges(
    dash?.home?.handicap_changes,
    history,
    competitions,
    campaignId,
  );
  if (inferred) return inferred;

  if (!campaignId) return null;

  if (campaignLooksSummer(competitions, campaignId)) {
    const lastFin = pickLastFinalizedSummerWeeklyId(competitions, campaignId);
    if (lastFin) return lastFin;
    const anyFin = pickLastFinalizedAnyRoundId(competitions, campaignId);
    if (anyFin) return anyFin;
  }
  return pickLrRoundId(competitions, campaignId);
}

function playOrderForRound(competitions, campaignId, roundId) {
  if (!roundId) return -1;
  const c = (competitions || []).find(
    (x) =>
      String(x.season) === String(campaignId) &&
      normId(x.id) === normId(roundId),
  );
  return c ? Number(c.play_order) || 0 : -1;
}

/** Later calendar week wins (same campaign). */
function newerRoundByPlayOrder(competitions, campaignId, idA, idB) {
  if (!idA) return idB || null;
  if (!idB) return idA;
  const pa = playOrderForRound(competitions, campaignId, idA);
  const pb = playOrderForRound(competitions, campaignId, idB);
  if (pa !== pb) return pa > pb ? idA : idB;
  return idA;
}

/** Max `created_at` among `handicap_history` for summer_weekly rounds (any status). */
function latestSnapshotRoundIdSummerWeekly(
  history,
  competitions,
  campaignId,
) {
  if (!campaignId) return null;
  let comps = (competitions || []).filter(
    (c) =>
      String(c.season) === String(campaignId) &&
      String(c.round_type || "").toLowerCase() === "summer_weekly",
  );
  if (!comps.length) {
    comps = (competitions || []).filter(
      (c) => String(c.season) === String(campaignId),
    );
  }
  const norms = new Set(
    comps.map((c) => normId(c.id)).filter(Boolean),
  );
  if (!norms.size) return null;
  let bestTs = -1;
  const ties = [];
  for (const h of history || []) {
    const rn = normId(h.competition_id);
    if (!norms.has(rn)) continue;
    const t = new Date(h.created_at || 0).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > bestTs) {
      bestTs = t;
      ties.length = 0;
      ties.push(String(h.competition_id));
    } else if (t === bestTs) {
      ties.push(String(h.competition_id));
    }
  }
  if (!ties.length) return null;
  if (ties.length === 1) return ties[0];
  let best = ties[0];
  for (let i = 1; i < ties.length; i++) {
    if (
      playOrderForRound(competitions, campaignId, ties[i]) >
      playOrderForRound(competitions, campaignId, best)
    ) {
      best = ties[i];
    }
  }
  return best;
}

/**
 * Round id for the Handicaps **list** LAST CHG column: `resolveHandicapFocusRoundId`
 * merged with the newest snapshot batch among **summer_weekly** rounds in
 * `handicap_history` (any `competitions[].status` — week 7 stays `open` until the
 * client refetches). Later `play_order` wins on ties. The modal ignores this and
 * only uses `metadata.handicap_history` + `timelineForUser`.
 */
export function resolveHandicapListFocusRoundId(
  metadata,
  competitions,
  history,
) {
  const campaignId = resolveCampaignIdForHandicaps(metadata);
  const fromDash = resolveHandicapFocusRoundId(metadata, competitions, history);
  if (!campaignId) {
    return fromDash;
  }
  const fromSnaps = latestSnapshotRoundIdSummerWeekly(
    history,
    competitions,
    campaignId,
  );
  if (!fromSnaps) return fromDash;
  if (!fromDash) return fromSnaps;
  return newerRoundByPlayOrder(competitions, campaignId, fromSnaps, fromDash);
}

/**
 * Round id for LAST CHG column: same week as Home (`preferredRoundId` from
 * `resolveHandicapFocusRoundId`). Always return that id when set — never substitute
 * another round because `handicap_history` omitted the focus week (capped payload)
 * or still loads; wrong week produced pills like 5.9→5.7 while H'CAP stayed 5.9.
 */
export function resolveLastChgFocusRoundId(
  metadata,
  competitions,
  history,
  preferredRoundId,
) {
  const pref =
    preferredRoundId != null && String(preferredRoundId).trim() !== ""
      ? String(preferredRoundId)
      : null;
  if (pref) {
    return pref;
  }

  const camp =
    metadata?.defaults?.home_season_id ||
    metadata?.defaults?.results_season_id ||
    resolveCampaignIdForHandicaps(metadata) ||
    null;

  let comps = (competitions || []).filter(
    (c) => !camp || String(c.season) === String(camp),
  );
  if (!comps.length) comps = competitions || [];

  const roundNorms = new Set(comps.map((c) => normId(c.id)));

  let bestId = null;
  let bestTs = -1;
  for (const h of history || []) {
    const rn = normId(h.competition_id);
    if (!rn) continue;
    if (roundNorms.size > 0 && !roundNorms.has(rn)) continue;
    const t = new Date(h.created_at || 0).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= bestTs) {
      bestTs = t;
      bestId = String(h.competition_id);
    }
  }
  return bestId || pref;
}
