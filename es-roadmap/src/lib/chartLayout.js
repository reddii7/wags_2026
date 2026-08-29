import { formatPrice } from "./parseLetter.js";

export function uniqueByPriceRole(levels) {
  const seen = new Set();
  const out = [];
  for (const level of levels) {
    const key = `${level.price}:${level.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(level);
  }
  return out;
}

export function isAlwaysOn(level) {
  return Boolean(
    level.fbd || level.target || level.shortSpot || level.invalidation || level.role === "setup",
  );
}

export function levelScore(level) {
  let score = 0;
  if (level.fbd) score += 40;
  if (level.target) score += 30;
  if (level.shortSpot) score += 28;
  if (level.invalidation) score += 24;
  if (level.major) score += 25;
  if (level.role === "setup") score += 8;
  return score;
}

export function shortLabel(level) {
  const tag = level.fbd
    ? "FBD"
    : level.shortSpot
      ? "SH"
      : level.target
        ? "TGT"
        : level.invalidation
          ? "INV"
          : "";
  const price = formatPrice(level.price);
  return tag ? `${price} ${tag}` : price;
}

export function collectLevels(parsed) {
  return uniqueByPriceRole([
    ...(parsed.supports || []),
    ...(parsed.resistances || []),
    ...(parsed.extras || []),
  ]).sort((a, b) => b.price - a.price);
}

/** Keep the highest-priority label when two prints sit inside minGap points. */
export function placeLabels(levels, minGap = 16, options = {}) {
  const anchor = Number.parseFloat(options.anchor);
  const range = Number.parseFloat(options.range);
  let eligible = levels.filter((level) => level.major || isAlwaysOn(level));
  if (Number.isFinite(anchor) && Number.isFinite(range) && range > 0) {
    eligible = eligible.filter((level) => Math.abs(level.price - anchor) <= range);
  }
  const ranked = [...eligible].sort(
    (a, b) => levelScore(b) - levelScore(a) || b.price - a.price,
  );
  const chosen = [];
  for (const level of ranked) {
    if (chosen.some((other) => Math.abs(other.price - level.price) < minGap)) continue;
    chosen.push(level);
  }
  chosen.sort((a, b) => b.price - a.price);
  return chosen.map((level, index) => ({
    ...level,
    col: index % 3,
    label: shortLabel(level),
  }));
}

export function roleCode(level) {
  if (level.role === "support") return "S";
  if (level.role === "resistance") return "R";
  return "X";
}

export function lineColor(level) {
  if (level.role === "support") return level.major || isAlwaysOn(level) ? "#26a69a" : "#4db6a8";
  if (level.role === "resistance") return level.major || isAlwaysOn(level) ? "#ef5350" : "#e57373";
  return "#f0c14b";
}
