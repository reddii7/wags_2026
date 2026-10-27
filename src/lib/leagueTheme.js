/** Stable league identity colours (F1 team-rail analogue). */

const LEAGUE_THEMES = {
  premiership: { key: "premiership", label: "Premiership", color: "#d4af37" },
  championship: {
    key: "championship",
    label: "Championship",
    color: "#8ecae6",
  },
  "league one": { key: "league_one", label: "League One", color: "#90be6d" },
  "league 1": { key: "league_one", label: "League One", color: "#90be6d" },
  "league two": { key: "league_two", label: "League Two", color: "#adb5bd" },
  "league 2": { key: "league_two", label: "League Two", color: "#adb5bd" },
  league_1: { key: "premiership", label: "Premiership", color: "#d4af37" },
  league_2: { key: "championship", label: "Championship", color: "#8ecae6" },
  league_3: { key: "league_one", label: "League One", color: "#90be6d" },
  league_4: { key: "league_two", label: "League Two", color: "#adb5bd" },
};

const AWARD_THEMES = {
  championship: "#d4af37",
  chumps: "#8ecae6",
  best14: "#90be6d",
  rs_cup: "#90be6d",
  league_1: "#d4af37",
  league_2: "#8ecae6",
  league_3: "#90be6d",
  league_4: "#adb5bd",
};

export function leagueThemeForName(name) {
  const key = String(name || "")
    .trim()
    .toLowerCase();
  return (
    LEAGUE_THEMES[key] || {
      key: "default",
      label: name || "League",
      color: "#588157",
    }
  );
}

export function awardAccent(type) {
  return AWARD_THEMES[String(type || "")] || "var(--line)";
}

export const AWARD_ORDER = [
  { type: "championship", label: "Championship" },
  { type: "chumps", label: "Chumps" },
  { type: "best14", label: "Best 14" },
  { type: "rs_cup", label: "RS Cup" },
  { type: "league_1", label: "Premiership" },
  { type: "league_2", label: "Championship league" },
  { type: "league_3", label: "League One" },
  { type: "league_4", label: "League Two" },
];
