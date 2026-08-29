/** Clean email/markdown junk so level lists can be parsed reliably. */
export function stripMarkup(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\|/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

const PRICE_RE = /(\d{4,5}(?:\.\d{1,2})?)/g;
const LEVEL_TOKEN_RE = /(\d{4,5}(?:\.\d{1,2})?)\s*(?:\(\s*major\s*\))?/gi;

function toPrice(raw) {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function sliceSection(text, startRe, endRes) {
  const startMatch = startRe.exec(text);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  let end = text.length;
  for (const endRe of endRes) {
    const clone = new RegExp(endRe.source, endRe.flags.includes("g") ? endRe.flags : `${endRe.flags}g`);
    clone.lastIndex = start;
    const m = clone.exec(text);
    if (m && m.index >= start) end = Math.min(end, m.index);
  }
  return text.slice(start, end).trim();
}

function parseLevelList(blob, role) {
  const levels = [];
  if (!blob) return levels;
  const re = new RegExp(LEVEL_TOKEN_RE.source, "gi");
  let m;
  while ((m = re.exec(blob))) {
    const price = toPrice(m[1]);
    if (price == null || price < 500 || price > 20000) continue;
    const major = /\(\s*major\s*\)/i.test(m[0]);
    levels.push({
      price,
      major,
      role,
      note: major ? `${formatPrice(price)} major` : formatPrice(price),
    });
  }
  return dedupeLevels(levels);
}

export function formatPrice(price) {
  if (!Number.isFinite(price)) return "";
  return Number.isInteger(price) ? String(price) : price.toFixed(2).replace(/\.?0+$/, "");
}

export function dedupeLevels(levels) {
  const map = new Map();
  for (const level of levels) {
    const key = `${level.price}:${level.role || ""}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...level });
      continue;
    }
    prev.major = Boolean(prev.major || level.major);
    if (level.note && !prev.note?.includes(level.note)) {
      prev.note = [prev.note, level.note].filter(Boolean).join(" · ");
    }
  }
  return [...map.values()].sort((a, b) => a.price - b.price);
}

function extractTitle(text) {
  const heading = text.match(/^#{1,3}\s+(.+)$/m);
  if (heading) return heading[1].replace(/\*+/g, "").trim();
  const plan = text.match(/([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+Plan)/i);
  if (plan) return plan[1];
  return "Daily ES Plan";
}

function extractPlanDay(text) {
  const tradePlan = text.match(/Trade Plan\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
  if (tradePlan) return capitalize(tradePlan[1]);
  const tomorrow = /bull case tomorrow/i.test(text) ? "Tomorrow" : "";
  return tomorrow || "Session";
}

function extractDateLabel(text) {
  const m =
    text.match(/([A-Za-z]+ \d{1,2}(?:st|nd|rd|th)?)\s+Plan/i) ||
    text.match(/\b(AUG(?:UST)?\s+\d{1,2})\b/i);
  return m ? m[1].replace(/\s+/g, " ") : "";
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "";
}

function pricesIn(text) {
  return [...String(text || "").matchAll(PRICE_RE)]
    .map((m) => toPrice(m[1]))
    .filter((n) => n != null && n >= 500 && n <= 20000);
}

function nearestContext(text, price, radius = 90) {
  const token = String(Math.trunc(price));
  const idx = text.indexOf(token);
  if (idx < 0) return "";
  return text.slice(Math.max(0, idx - radius), Math.min(text.length, idx + token.length + radius));
}

function sentenceSplit(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9*])|\n+/)
    .map((s) => s.replace(/^[\s>*-]+/, "").trim())
    .filter((s) => s.length > 20);
}

function classifySentence(sentence) {
  const s = sentence.toLowerCase();
  const prices = pricesIn(sentence);
  if (!prices.length) return null;

  const isFbd = /failed breakdown|fbd|flush(?:es|ed)? and recover|recover(?:s|ed|y of)?/.test(s);
  const isShort =
    /is one spot/.test(s) ||
    /for those who want to try/.test(s) ||
    (/\bshort\b/.test(s) && /trigger down|beneath the lows|breakdown trade/.test(s));
  const isTarget = /targets?\b/.test(s) && /continue up|head to|are targets/.test(s);
  const isInvalidation = /begins below|trigger down/.test(s);

  if (isShort) {
    return { kind: "short", prices, text: sentence };
  }
  if (isInvalidation && /below/.test(s)) {
    return { kind: "invalidation", prices, text: sentence };
  }
  if (isFbd) {
    return { kind: "fbd", prices, text: sentence };
  }
  if (isTarget) {
    return { kind: "target", prices, text: sentence };
  }
  return null;
}

function collectSetups(text) {
  const setups = { fbd: [], shorts: [], targets: [], invalidations: [], reclaim: [] };
  for (const sentence of sentenceSplit(text)) {
    const classified = classifySentence(sentence);
    if (!classified) {
      if (/recover \d{4}.+and \d{4}/i.test(sentence) || /if we can recover/i.test(sentence)) {
        setups.reclaim.push({
          kind: "reclaim",
          prices: pricesIn(sentence),
          text: sentence,
        });
      }
      continue;
    }
    if (classified.kind === "fbd") setups.fbd.push(classified);
    if (classified.kind === "short") setups.shorts.push(classified);
    if (classified.kind === "target") setups.targets.push(classified);
    if (classified.kind === "invalidation") setups.invalidations.push(classified);
  }
  return setups;
}

function uniquePrices(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    for (const price of item.prices || []) {
      if (!seen.has(price)) {
        seen.add(price);
        out.push(price);
      }
    }
  }
  return out.sort((a, b) => a - b);
}

function attachPlanFlags(levels, setups, extras = {}) {
  const fbd = new Set(uniquePrices(setups.fbd.concat(setups.reclaim)));
  const shorts = new Set(uniquePrices(setups.shorts));
  const targets = new Set(uniquePrices(setups.targets).concat(extras.targets || []));
  const invalidations = new Set(uniquePrices(setups.invalidations).concat(extras.invalidations || []));

  return levels.map((level) => ({
    ...level,
    fbd: fbd.has(level.price),
    shortSpot: shorts.has(level.price),
    target: targets.has(level.price) && level.role === "resistance",
    invalidation: invalidations.has(level.price),
  }));
}

function extractTargetList(text) {
  const m = text.match(/(\d{4,5}(?:\.\d{1,2})?(?:\s*,\s*\d{4,5}(?:\.\d{1,2})?){1,6})\s+are targets/i);
  if (!m) return [];
  return pricesIn(m[1]);
}

function extractBearTrigger(text) {
  const below = text.match(/begins below\s+(\d{4,5}(?:\.\d{1,2})?)/i);
  const trigger = text.match(/(?:likely\s+)?(\d{4,5}(?:\.\d{1,2})?)\s+trigger down/i);
  return {
    below: below ? toPrice(below[1]) : null,
    trigger: trigger ? toPrice(trigger[1]) : null,
  };
}

export function parseLetter(rawText) {
  const text = stripMarkup(rawText);
  const warnings = [];

  const supportsBlob = sliceSection(
    text,
    /supports?\s+are\s*:/i,
    [/resistances?\s+are\s*:/i, /bull case/i, /in terms of lvls/i, /trade recap/i],
  );
  const resistancesBlob = sliceSection(
    text,
    /resistances?\s+are\s*:/i,
    [/bull case/i, /bear case/i, /in summary/i, /as readers know I don't short/i],
  );
  const bidDirect = sliceSection(
    text,
    /in terms of lvls I'?d bid direct\s*:/i,
    [/resistances?\s+are\s*:/i, /bull case/i],
  );
  const bullCase = sliceSection(text, /bull case(?:\s+tomorrow)?\s*:/i, [
    /bear case/i,
    /in summary/i,
    /as always no crystal/i,
  ]);
  const bearCase = sliceSection(text, /bear case(?:\s+tomorrow)?\s*:/i, [
    /in summary/i,
    /as always no crystal/i,
    /^\*\*In summary/im,
  ]);
  const summary = sliceSection(text, /in summary(?:\s+for tomorrow)?\s*:/i, [
    /as always no crystal/i,
    /!\[/i,
  ]);

  let supports = parseLevelList(supportsBlob, "support");
  let resistances = parseLevelList(resistancesBlob, "resistance");

  if (!supports.length) warnings.push("No support list found. Paste the full Trade Plan section.");
  if (!resistances.length) warnings.push("No resistance list found. Paste the full Trade Plan section.");

  const setupSource = [bidDirect, bullCase, bearCase, summary].filter(Boolean).join("\n");
  const setups = collectSetups(setupSource || text);
  const targets = extractTargetList(`${bullCase}\n${summary}`);
  const bear = extractBearTrigger(bearCase || text);

  supports = attachPlanFlags(supports, setups, {
    targets,
    invalidations: [bear.below, bear.trigger].filter(Boolean),
  });
  resistances = attachPlanFlags(resistances, setups, { targets });

  const extras = [];
  for (const price of uniquePrices(setups.fbd.concat(setups.reclaim))) {
    if (![...supports, ...resistances].some((l) => l.price === price)) {
      extras.push({
        price,
        major: false,
        role: "setup",
        note: `${formatPrice(price)} setup`,
        fbd: true,
        shortSpot: false,
        target: false,
        invalidation: false,
      });
    }
  }
  if (bear.trigger && ![...supports, ...resistances, ...extras].some((l) => l.price === bear.trigger)) {
    extras.push({
      price: bear.trigger,
      major: true,
      role: "setup",
      note: `${formatPrice(bear.trigger)} breakdown trigger`,
      fbd: false,
      shortSpot: true,
      target: false,
      invalidation: true,
    });
  }

  const all = dedupeLevels([...supports, ...resistances, ...extras]).sort((a, b) => b.price - a.price);

  return {
    title: extractTitle(text),
    planDay: extractPlanDay(text),
    dateLabel: extractDateLabel(text),
    supports,
    resistances,
    extras,
    all,
    majors: all.filter((l) => l.major),
    setups,
    targets,
    bear,
    bullCase: compactParagraph(bullCase),
    bearCase: compactParagraph(bearCase),
    summary: compactParagraph(summary),
    bidDirect: compactParagraph(bidDirect),
    warnings,
    rawLength: text.length,
  };
}

function compactParagraph(text) {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function findNearest(levels, price, side) {
  if (!Number.isFinite(price) || !levels?.length) return null;
  const pool = levels.filter((l) => (side === "below" ? l.price <= price : l.price >= price));
  if (!pool.length) return null;
  pool.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  return pool[0];
}
