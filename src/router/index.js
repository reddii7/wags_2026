import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import Best14View from '../views/Best14View.vue';
import LeaguesView from '../views/LeaguesView.vue';
import ResultsView from '../views/ResultsView.vue';
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
        { path: '/handicaps', redirect: { path: '/stats', query: { tab: 'handicaps' } } },
        { path: '/rscup', redirect: { path: '/stats', query: { tab: 'cup' } } },
        { path: '/stats', name: 'stats', component: StatsHubView },
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

    return true;
});

export default router;
