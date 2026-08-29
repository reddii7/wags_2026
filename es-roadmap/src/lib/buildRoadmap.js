import { findNearest, formatPrice } from "./parseLetter.js";

const MANAGEMENT = [
  "Lock 75% at the first level. Never let the whole trade go back red.",
  "Scale again at the second level. Leave ~10% as a runner.",
  "Trail the runner under the failed-breakdown low, then under the last defended major.",
  "1–2 trades. Prefer 7:30–11:00am ET or after 3:00pm. Avoid 11:00–2:00 chop unless an A+ FBD is obvious.",
  "First trade greens → profit-protection mode: sit on the runner. Second trade only if the runner is stopped and a new pre-planned A+ appears, sized off prior profit.",
  "Two losses and you are done for the day.",
];

function priceList(prices) {
  return prices.map(formatPrice).join(", ");
}

function setupLines(items, fallback) {
  if (!items.length) return [fallback];
  return items.slice(0, 8).map((item) => {
    const lvls = priceList(item.prices);
    return `${lvls} — ${trimSentence(item.text, 220)}`;
  });
}

function trimSentence(text, max = 240) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function pocket(parsed, session) {
  const last = Number.parseFloat(session?.last);
  if (!Number.isFinite(last)) return null;
  const majorSup = parsed.supports.filter((l) => l.major);
  const majorRes = parsed.resistances.filter((l) => l.major);
  const support =
    findNearest(majorSup, last, "below") || findNearest(parsed.supports, last, "below");
  const resistance =
    findNearest(majorRes, last, "above") || findNearest(parsed.resistances, last, "above");
  return {
    last,
    support,
    resistance,
    high: Number.parseFloat(session?.high),
    low: Number.parseFloat(session?.low),
    summary:
      resistance && support
        ? `Last ${formatPrice(last)} sits between ${formatPrice(support.price)} support and ${formatPrice(resistance.price)} resistance.`
        : `Last ${formatPrice(last)}.`,
  };
}

export function buildRoadmap(parsed, session = {}) {
  const day = parsed.planDay || "Session";
  const headline = [day, parsed.dateLabel, parsed.title].filter(Boolean).join(" · ");
  const pos = pocket(parsed, session);
  const bearBelow = parsed.bear?.below;
  const bearTrigger = parsed.bear?.trigger;

  const longs = setupLines(
    parsed.setups.fbd.concat(parsed.setups.reclaim),
    "No failed-breakdown sentences parsed. Use major supports: wait for a flush of the level, then recover it with acceptance or a +5 hold.",
  );
  const shorts = setupLines(
    parsed.setups.shorts,
    parsed.resistances.length
      ? `No explicit short sentences parsed. If you short, only fade failed breakouts of ${priceList(
          parsed.resistances.filter((l) => l.major).slice(-4).map((l) => l.price),
        )} — sweep the high, lose it, hold −5.`
      : "No short map parsed.",
  );

  const doNot = [
    "Do not knife-catch an elevator-down. Longs start on the failed breakdown or reclaim, not the first red candle.",
    bearBelow
      ? `Do not treat a trap under the first support as the bear case. The letter’s bear case begins below ${formatPrice(bearBelow)}.`
      : "Do not call a regime change off one lost support that immediately reclaims.",
    "Do not short a support loss that reclaims. That print is the long.",
    "Do not predict the path. Plan zones, wait for the trigger, scale level to level.",
  ];

  const markdown = [
    `# ${headline}`,
    "",
    pos ? `**Position:** ${pos.summary}` : null,
    parsed.summary ? `**Letter lean:** ${parsed.summary}` : null,
    "",
    "## Core rule",
    "Trade failed breakdowns and reclaims on the long side. Scale level to level. Leave a runner. Shorts are optional failed-breakout fades only — not breakdown chases.",
    "",
    "## Long setups",
    ...longs.map((line) => `- ${line}`),
    parsed.targets.length ? `- Scale-out ladder / letter targets: ${priceList(parsed.targets)}` : null,
    "",
    "## Short setups",
    ...shorts.map((line) => `- ${line}`),
    bearBelow
      ? `- Advanced breakdown short only if ${formatPrice(bearBelow)} is accepted down, then under the bounce lows${
          bearTrigger ? ` (~${formatPrice(bearTrigger)})` : ""
        }.`
      : null,
    "",
    "## Do not",
    ...doNot.map((line) => `- ${line}`),
    "",
    "## Trade management",
    ...MANAGEMENT.map((line) => `- ${line}`),
    "",
    parsed.bullCase ? `## Bull case\n${parsed.bullCase}` : null,
    "",
    parsed.bearCase ? `## Bear case\n${parsed.bearCase}` : null,
    "",
    "## Major supports",
    parsed.supports.filter((l) => l.major).length
      ? parsed.supports
          .filter((l) => l.major)
          .map((l) => `- ${formatPrice(l.price)}${l.fbd ? " · FBD" : ""}`)
          .join("\n")
      : "_None tagged major._",
    "",
    "## Major resistances",
    parsed.resistances.filter((l) => l.major).length
      ? parsed.resistances
          .filter((l) => l.major)
          .map((l) => `- ${formatPrice(l.price)}${l.target ? " · target" : ""}${l.shortSpot ? " · short" : ""}`)
          .join("\n")
      : "_None tagged major._",
  ]
    .filter((line) => line != null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return {
    headline,
    position: pos,
    longs,
    shorts,
    doNot,
    management: MANAGEMENT,
    bullCase: parsed.bullCase,
    bearCase: parsed.bearCase,
    summary: parsed.summary,
    markdown,
    targets: parsed.targets,
    bear: parsed.bear,
  };
}
