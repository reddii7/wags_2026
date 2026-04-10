import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import Best14View from '../views/Best14View.vue';
import LeaguesView from '../views/LeaguesView.vue';
import ResultsView from '../views/ResultsView.vue';
import HandicapsView from '../views/HandicapsView.vue';
import LoginView from '../views/LoginView.vue';
import AdminCompetitionsView from '../views/admin/AdminCompetitionsView.vue';
import AdminScoresView from '../views/admin/AdminScoresView.vue';
import AdminUsersView from '../views/admin/AdminUsersView.vue';
import { useSession } from '../composables/useSession';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: HomeView },
        { path: '/best14', name: 'best14', component: Best14View },
        { path: '/leagues', name: 'leagues', component: LeaguesView },
        { path: '/results', name: 'results', component: ResultsView },
        { path: '/handicaps', name: 'handicaps', component: HandicapsView },
        { path: '/login', redirect: '/admin/login' },
        {
            path: '/admin',
            redirect: { name: 'admin-competitions' },
        },
        {
            path: '/admin/login',
            name: 'admin-login',
            component: LoginView,
            meta: { adminShell: true, guestOnly: true },
        },
        {
            path: '/admin/competitions',
            name: 'admin-competitions',
            component: AdminCompetitionsView,
            meta: { requiresAdmin: true, adminShell: true },
        },
        {
            path: '/admin/scores',
            name: 'admin-scores',
            component: AdminScoresView,
            meta: { requiresAdmin: true, adminShell: true },
        },
        {
            path: '/admin/users',
            name: 'admin-users',
            component: AdminUsersView,
            meta: { requiresAdmin: true, adminShell: true },
        },
    ],
    scrollBehavior() {
        return { top: 0, behavior: 'smooth' };
    },
});

router.beforeEach((to) => {
    const { user, isAdmin } = useSession();

    if (to.meta.requiresAdmin) {
        if (!user.value) {
            return {
                name: 'admin-login',
                query: { redirect: to.fullPath },
            };
        }

        if (!isAdmin.value) {
            return { name: 'home' };
        }
    }

    if (to.meta.guestOnly && user.value && isAdmin.value) {
        return { name: 'admin-competitions' };
    }

    return true;
});

export default router;
