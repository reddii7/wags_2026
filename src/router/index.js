import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import Best14View from '../views/Best14View.vue';
import LeaguesView from '../views/LeaguesView.vue';
import ResultsView from '../views/ResultsView.vue';
import HandicapsView from '../views/HandicapsView.vue';
import RSCupView from '../views/RSCupView.vue';
import LoginView from '../views/LoginView.vue';
import StatsHubView from '../views/StatsHubView.vue';
import { useSession } from '../composables/useSession';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: HomeView },
        { path: '/best14', name: 'best14', component: Best14View },
        { path: '/leagues', name: 'leagues', component: LeaguesView },
        { path: '/results', name: 'results', component: ResultsView },
        { path: '/handicaps', name: 'handicaps', component: HandicapsView },
        { path: '/rscup', name: 'rscup', component: RSCupView },
        { path: '/stats', name: 'stats', component: StatsHubView },
        { path: '/week', name: 'week', component: StatsHubView },
        { path: '/standings', name: 'standings', component: StatsHubView },
        { path: '/more', name: 'more', component: HandicapsView },
        { path: '/season', name: 'season', component: StatsHubView },
        {
            path: '/login',
            name: 'login',
            component: LoginView,
            meta: { guestOnly: true },
        },
    ],
    scrollBehavior() {
        return { top: 0, behavior: 'smooth' };
    },
});

router.beforeEach((to) => {
    const { user } = useSession();

    if (to.meta.requiresAuth && !user.value) {
        return {
            name: 'login',
            query: { redirect: to.fullPath },
        };
    }

    if (to.meta.guestOnly && user.value) {
        return { name: 'home' };
    }

    // Soft redirects from earlier NEXT IA experiments → production chrome.
    if (to.name === "week" || to.path === "/week") {
      return {
        name: "stats",
        query: {
          tab: "results",
          ...(to.query.season ? { season: to.query.season } : {}),
          ...(to.query.round ? { round: to.query.round } : {}),
        },
      };
    }
    if (to.name === "standings" || to.path === "/standings") {
      return {
        name: "stats",
        query: {
          tab: to.query.tab === "best14" ? "best14" : "leagues",
          ...(to.query.season ? { season: to.query.season } : {}),
        },
      };
    }
    if (to.name === "more" || to.path === "/more") {
      return { name: "handicaps" };
    }
    if (to.name === "season" || to.path === "/season") {
      const tab = to.query.tab === "champs" || to.query.tab === "winners" ? "winners" : "history";
      return {
        name: "stats",
        query: {
          tab,
          ...(to.query.season ? { season: to.query.season } : {}),
        },
      };
    }

    return true;
});

export default router;
