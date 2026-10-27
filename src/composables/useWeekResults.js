/**
 * Resolve results_view + focus week for a season from member metadata.
 */

export function resolveSeasonResultsContract(metadata, season) {
  const dashboard = metadata?.dashboard || {};
  const seasonId = String(season?.id || "");
  const seasonYear = String(season?.start_year || "");
  return (
    dashboard?.[seasonId]?.results_view ||
    dashboard?.[seasonYear]?.results_view ||
    null
  );
}

function seasonHasWeekResults(metadata, season) {
  if (!season) return false;
  const rv = resolveSeasonResultsContract(metadata, season);
  return Array.isArray(rv?.competitions) && rv.competitions.length > 0;
}

/**
 * Prefer the campaign the API marks current/home, but if that season has no
 * weekly results yet (e.g. empty winter), fall back to the latest summer with
 * a results_view — otherwise Week Hub looks blank.
 */
export function resolvePreferredSeason(metadata) {
  const seasons = Array.isArray(metadata?.seasons) ? metadata.seasons : [];
  if (!seasons.length) return null;

  const preferredId = String(
    metadata?.defaults?.home_season_id ||
      metadata?.defaults?.results_season_id ||
      "",
  );
  const preferred = preferredId
    ? seasons.find((s) => String(s?.id) === preferredId)
    : null;
  if (preferred && seasonHasWeekResults(metadata, preferred)) return preferred;

  const current =
    seasons.find((s) => s?.is_current) ||
    seasons.find((s) => s?.is_active) ||
    null;
  if (current && seasonHasWeekResults(metadata, current)) return current;

  const withResults = seasons
    .filter((s) => seasonHasWeekResults(metadata, s))
    .sort((a, b) => Number(b.start_year || 0) - Number(a.start_year || 0));
  if (withResults[0]) return withResults[0];

  return preferred || current || seasons[0] || null;
}

export function pickDefaultCompetitionId(resultsContract) {
  if (!resultsContract || typeof resultsContract !== "object") return null;
  const comps = Array.isArray(resultsContract.competitions)
    ? resultsContract.competitions
    : [];
  if (!comps.length) return null;
  const contractDefault = resultsContract.default_competition_id;
  if (
    contractDefault &&
    comps.some((c) => String(c.id) === String(contractDefault))
  ) {
    return String(contractDefault);
  }
  const sorted = [...comps].sort(
    (a, b) =>
      new Date(a.competition_date || 0) - new Date(b.competition_date || 0),
  );
  return sorted[sorted.length - 1]?.id
    ? String(sorted[sorted.length - 1].id)
    : null;
}

export function weekNumberMapFromCompetitions(competitions) {
  const map = new Map();
  (competitions || []).forEach((comp, index) => {
    const wk = Number(comp?.week_number);
    map.set(
      String(comp.id),
      Number.isFinite(wk) && wk > 0 ? wk : index + 1,
    );
  });
  return map;
}

export function formatWeekChip(competition, weekNumberMap) {
  if (!competition) return "Week";
  if (competition.week_label) return competition.week_label;
  const num = weekNumberMap?.get(String(competition.id));
  return num ? `WK${num}` : "Week";
}

export function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}
