import { normId } from "./resolveHomeDashboard.js";

/** `competition_id` → `competition_date` (same keys as Handicaps modal). */
export function buildCompetitionDateMap(competitions) {
  return new Map(
    (competitions || []).map((c) => [String(c.id), c.competition_date]),
  );
}

/**
 * Per-member score lookup for `competition_id`, from contract `rounds` + `results`
 * (same fields the modal uses).
 */
export function buildScoreMapsByUserNorm(rounds, results) {
  const out = new Map();
  const add = (uidRaw, compIdRaw, scoreRaw) => {
    if (compIdRaw == null || compIdRaw === "") return;
    const uid = normId(uidRaw);
    if (!uid) return;
    if (scoreRaw === undefined || scoreRaw === null) return;
    const compId = String(compIdRaw);
    if (!out.has(uid)) out.set(uid, new Map());
    out.get(uid).set(compId, scoreRaw);
  };
  for (const r of rounds || []) {
    add(r.user_id || r.player_id, r.competition_id, r.stableford_score ?? r.score);
  }
  for (const r of results || []) {
    add(r.user_id || r.player_id, r.competition_id, r.stableford_score ?? r.score);
  }
  return out;
}

/**
 * Same include rule as the Handicaps modal list (played that week OR numeric HC move;
 * manual rows only when old→new delta).
 */
export function handicapHistoryItemPassesModalFilter(item, userId, scoreMap) {
  if (normId(item.user_id) !== normId(userId)) return false;

  const hOld =
    item.old_handicap != null ? Number(item.old_handicap) : null;
  const hNew =
    item.new_handicap != null ? Number(item.new_handicap) : null;

  const compId = item.competition_id;
  const isRoundId = compId && String(compId).length > 30;

  const hasHandicapChange =
    hOld !== null && hNew !== null && Math.abs(hNew - hOld) > 0.01;

  const hasScore = isRoundId && scoreMap.has(compId);

  if (isRoundId) return hasHandicapChange || hasScore;
  return hasHandicapChange;
}

/** Same date ordering as the modal (round date, then created_at string). */
export function sortHandicapHistoryLikeModal(items, compDateMap) {
  return [...(items || [])].sort((a, b) => {
    const dateA = compDateMap.get(String(a.competition_id)) || a.created_at;
    const dateB = compDateMap.get(String(b.competition_id)) || b.created_at;
    return new Date(dateB) - new Date(dateA);
  });
}

export function timelineForUser(userId, history, compDateMap, scoreMap) {
  const sm = scoreMap || new Map();
  const filtered = (history || []).filter((item) =>
    handicapHistoryItemPassesModalFilter(item, userId, sm),
  );
  return sortHandicapHistoryLikeModal(filtered, compDateMap);
}

/**
 * One snapshot row per member for `focusRoundId` (newest `created_at` first).
 * Same `handicap_history` rows as the modal; same round as `dashboard.home.focus_round_id`.
 */
export function buildLastHandicapChangeMapForFocusRound(history, focusRoundId) {
  const map = new Map();
  if (!focusRoundId) return map;

  const targetNorm = normId(focusRoundId);
  const sorted = [...(history || [])].sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() -
      new Date(a.created_at || 0).getTime(),
  );

  for (const item of sorted) {
    if (normId(item.competition_id) !== targetNorm) continue;
    const nk = normId(item.user_id);
    if (!nk || map.has(nk)) continue;

    const oldN =
      item.old_handicap === null || item.old_handicap === undefined
        ? null
        : Number(item.old_handicap);
    const newN =
      item.new_handicap === null || item.new_handicap === undefined
        ? null
        : Number(item.new_handicap);
    if (
      oldN === null ||
      newN === null ||
      Number.isNaN(oldN) ||
      Number.isNaN(newN)
    ) {
      continue;
    }

    const hasChange = Math.abs(newN - oldN) > 0.01;
    map.set(nk, {
      text: hasChange
        ? `${Number(oldN).toFixed(1)}→${Number(newN).toFixed(1)}`
        : "-",
      improved: hasChange ? newN < oldN : false,
      hasDelta: hasChange,
    });
  }

  return map;
}
