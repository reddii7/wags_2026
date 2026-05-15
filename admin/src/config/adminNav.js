import { ENTITY_ADMIN_PAGES } from "./entityAdminConfig.js";

const manageItems = ENTITY_ADMIN_PAGES.map((p) => ({
  to: p.path,
  label: p.title,
}));

/** Single source of truth for admin sidebar / search navigation. */
export const ADMIN_NAV_GROUPS = [
  {
    id: "weekly",
    label: "Weekly workflow",
    items: [
      { to: "/", label: "Overview" },
      { to: "/manage/score-entry", label: "Enter scores" },
      { to: "/manage/6-rounds", label: "Rounds & finalize" },
      { to: "/manage/season-close", label: "Close summer (P/R)" },
    ],
  },
  {
    id: "preview",
    label: "Member PWA (preview)",
    items: [
      { to: "/app/stats", label: "Stats hub" },
      { to: "/app/home", label: "Home" },
      { to: "/app/results", label: "Results" },
      { to: "/app/leagues", label: "Leagues" },
      { to: "/app/best14", label: "Best 14" },
      { to: "/app/handicaps", label: "Handicaps" },
      { to: "/app/rscup", label: "RS Cup" },
    ],
  },
  {
    id: "manage",
    label: "All tables (advanced)",
    items: manageItems,
  },
  {
    id: "dev",
    label: "Dev",
    items: [{ to: "/dev/rpc", label: "RPC console" }],
  },
  {
    id: "notifications",
    label: "Notifications",
    items: [{ to: "/notifications", label: "Send notification" }],
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
