import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
// ...existing code...
import Best14View from '../views/Best14View.vue';
import LeaguesView from '../views/LeaguesView.vue';
import ResultsView from '../views/ResultsView.vue';
import HandicapsView from '../views/HandicapsView.vue';
import RSCupView from '../views/RSCupView.vue';
import LoginView from '../views/LoginView.vue';
// ...existing code...
import { useSession } from '../composables/useSession';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: HomeView },
        { path: '/best14', name: 'best14', component: Best14View },
        // ...existing code...
        { path: '/leagues', name: 'leagues', component: LeaguesView },
        { path: '/results', name: 'results', component: ResultsView },
        { path: '/handicaps', name: 'handicaps', component: HandicapsView },
        { path: '/rscup', name: 'rscup', component: RSCupView },
        // ...existing code...
    ],
    scrollBehavior() {
        return { top: 0, behavior: 'smooth' };
    },
});

// ...existing code...

export default router;
