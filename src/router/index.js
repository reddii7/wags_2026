import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import Best14View from "../views/Best14View.vue";
import LeaguesView from "../views/LeaguesView.vue";
import ResultsView from "../views/ResultsView.vue";
import HandicapsView from "../views/HandicapsView.vue";
import RSCupView from "../views/RSCupView.vue";
import LoginView from "../views/LoginView.vue";
import StatsHubView from "../views/StatsHubView.vue";
import WeekHubView from "../views/WeekHubView.vue";
import StandingsHubView from "../views/StandingsHubView.vue";
import SeasonHubView from "../views/SeasonHubView.vue";
import MoreView from "../views/MoreView.vue";
import PlayerProfileView from "../views/PlayerProfileView.vue";
import { useSession } from "../composables/useSession";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/week", name: "week", component: WeekHubView },
    { path: "/standings", name: "standings", component: StandingsHubView },
    { path: "/season", name: "season", component: SeasonHubView },
    { path: "/more", name: "more", component: MoreView },
    { path: "/player/:id", name: "player", component: PlayerProfileView },
    { path: "/best14", name: "best14", component: Best14View },
    { path: "/leagues", name: "leagues", component: LeaguesView },
    { path: "/results", name: "results", component: ResultsView },
    { path: "/handicaps", name: "handicaps", component: HandicapsView },
    { path: "/rscup", name: "rscup", component: RSCupView },
    // Legacy hub — keep for old links, redirect intent via App navigate maps
    { path: "/stats", name: "stats", component: StatsHubView },
    {
      path: "/login",
      name: "login",
      component: LoginView,
      meta: { guestOnly: true },
    },
  ],
  scrollBehavior() {
    return { top: 0, behavior: "smooth" };
  },
});

router.beforeEach((to) => {
  const { user } = useSession();

  if (to.meta.requiresAuth && !user.value) {
    return {
      name: "login",
      query: { redirect: to.fullPath },
    };
  }

  if (to.meta.guestOnly && user.value) {
    return { name: "home" };
  }

  // Map old Stats tabs onto the F1-style hubs.
  if (to.name === "stats") {
    const tab = String(to.query.tab || "results");
    const season = to.query.season;
    if (tab === "results" || tab === "week") {
      return {
        name: "week",
        query: season ? { season, ...(to.query.round ? { round: to.query.round } : {}) } : { ...to.query },
      };
    }
    if (tab === "leagues" || tab === "best14") {
      return {
        name: "standings",
        query: {
          tab,
          ...(season ? { season } : {}),
        },
      };
    }
    if (tab === "history" || tab === "winners" || tab === "champs") {
      return {
        name: "season",
        query: {
          tab: tab === "winners" ? "champs" : tab === "history" ? "history" : tab,
          ...(season ? { season } : {}),
        },
      };
    }
    return { name: "standings", query: season ? { season } : {} };
  }

  return true;
});

export default router;
