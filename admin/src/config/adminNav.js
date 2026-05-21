/** Single source of truth for admin sidebar / search navigation. */
export const ADMIN_NAV_GROUPS = [
  {
    id: "weekly",
    label: "Weekly scoring",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/manage/score-submissions", label: "Held cards" },
      { to: "/manage/score-entry", label: "Live score entry" },
      { to: "/manage/6-rounds", label: "Rounds" },
      { to: "/manage/season-close", label: "Close summer (P/R)" },
    ],
  },
  {
    id: "comms",
    label: "Communications",
    items: [{ to: "/notifications", label: "Send notification" }],
  },
  {
    id: "rscup",
    label: "RS Cup",
    items: [
      { to: "/manage/13-competitions", label: "Competitions" },
      { to: "/manage/14-cup-matches", label: "Cup matches" },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    items: [
      { to: "/manage/4-campaigns", label: "Campaigns" },
      { to: "/manage/1-members", label: "Members" },
      { to: "/manage/5-league-assignments", label: "Leagues" },
      { to: "/manage/3-money-rules", label: "Money rules" },
      { to: "/manage/2-handicap-rules", label: "Handicap rules" },
    ],
  },
];

/** Flat list for global search. */
export function getAdminNavFlatItems() {
  return ADMIN_NAV_GROUPS.flatMap((g) =>
    g.items.map((item) => ({
      ...item,
      group: g.label,
      groupId: g.id,
    })),
  );
}

/** Whether a nav path is active for the current route. */
export function isNavPathActive(currentPath, to) {
  if (to === "/") return currentPath === "/";
  return currentPath === to || currentPath.startsWith(`${to}/`);
}
