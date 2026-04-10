import { supabase } from './config.js';
import { showSpinner, triggerHaptic } from './utils.js';
import { loadDashboardView } from './views/dashboard.js';
import { loadResultsView } from './views/results.js';
import { loadBest14View } from './views/best14.js';
import { loadHandicapsView } from './views/handicaps.js';
import { loadLeaguesView } from './views/leagues.js';
import { loadAdminCompsView } from './views/admin/comps.js';
import { loadAdminUsersView } from './views/admin/users.js';
import { loadAdminEnterScoresView } from './views/admin/enterscores.js';
import { loadAdminFinanceView } from './views/admin/finance.js';
import { loadAdminSeasonAuditView } from './views/admin/seasonaudit.js';
import { loadAdminSeasonAdminView } from './views/admin/seasonadmin.js';
import { loadAdminWinterFinanceView } from './views/admin/winterfinance.js';
import { loadAdminWinterScoresView } from './views/admin/winterscores.js';
import { loadAdminWinterUsersView } from './views/admin/winterusers.js';
import { loadAdminWinterCompsView } from './views/admin/wintercomps.js';
import { loadAdminWinterDashboardView } from './views/admin/winterdashboard.js';

let currentUser, currentUserRole;

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeViewId = (viewId) => viewId === 'home' ? 'dashboard' : viewId;

const toPublicViewId = (viewId) => viewId === 'dashboard' ? 'home' : viewId;

const getInitialView = () => {
    const hashView = window.location.hash.replace('#', '');
    if (!hashView) return 'home';
    const normalizedViewId = normalizeViewId(hashView);
    return viewLoaders[normalizedViewId] ? toPublicViewId(normalizedViewId) : 'home';
};

const openMobileSidebar = () => {
    document.getElementById('app-sidebar')?.classList.add('active');
};

const closeMobileSidebar = () => {
    document.getElementById('app-sidebar')?.classList.remove('active');
};

const viewLoaders = {
    'dashboard': { loader: loadDashboardView, title: 'Home' },
    'results': { loader: loadResultsView, title: 'Results' },
    'best14': { loader: loadBest14View, title: 'Best 14' },
    'handicaps': { loader: loadHandicapsView, title: 'Handicaps' },
    'leagues': { loader: loadLeaguesView, title: 'Leagues' },
    'winterwags': { loader: () => window.WinterWags.loadView(), title: 'WinterWAGS' },
    'admin-comps': { loader: loadAdminCompsView, title: 'Manage Competitions', admin: true },
    'admin-users': { loader: loadAdminUsersView, title: 'Manage Users', admin: true },
    'admin-enter-scores': { loader: loadAdminEnterScoresView, title: 'Enter Scores', admin: true },
    'admin-finance': { loader: loadAdminFinanceView, title: 'Finance', admin: true },
    'admin-season-audit': { loader: loadAdminSeasonAuditView, title: 'Season Audit', admin: true },
    'admin-season-admin': { loader: loadAdminSeasonAdminView, title: 'Season Admin', admin: true, roles: ['admin'] },
    'admin-winter': { loader: loadAdminWinterDashboardView, title: 'Winter Admin', admin: true },
    'admin-winter-comps': { loader: loadAdminWinterCompsView, title: 'Winter Competitions', admin: true },
    'admin-winter-users': { loader: loadAdminWinterUsersView, title: 'Winter Players', admin: true },
    'admin-winter-scores': { loader: loadAdminWinterScoresView, title: 'Winter Scores', admin: true },
    'admin-winter-finance': { loader: loadAdminWinterFinanceView, title: 'Winter Finance', admin: true },
};

const resetToHomeView = async () => {
    const initialView = 'home';
    window.history.replaceState({ view: initialView }, '', `#${initialView}`);
    await showView(initialView, { pushHistory: false });
};

export const showView = async (viewId, options = {}) => {
    const { pushHistory = true } = options;
    const normalizedViewId = normalizeViewId(viewId);
    const publicViewId = toPublicViewId(normalizedViewId);
    const viewConfig = viewLoaders[normalizedViewId];
    if (!viewConfig) { console.error(`Unknown view: ${viewId}`); return; }

    const currentlyActiveView = document.querySelector('.view-container.active');
    const nextViewContainer = document.getElementById(viewConfig.admin ? 'admin-view' : `${normalizedViewId}-view`);
    if (currentlyActiveView && currentlyActiveView !== nextViewContainer) {
        currentlyActiveView.classList.add('view-transitioning');
        await wait(150);
    }

    document.getElementById('mobile-view-title').textContent = viewConfig.title;
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('view-transitioning'));
    document.querySelectorAll('.sidebar-nav .nav-link').forEach(l => l.classList.remove('active'));

    const navLink = document.querySelector(`.nav-link[data-view="${publicViewId}"]`) || document.querySelector(`.nav-link[data-view="${normalizedViewId}"]`);
    if (navLink) navLink.classList.add('active');

    const containerId = viewConfig.admin ? 'admin-view' : `${viewId}-view`;
    const viewContainer = document.getElementById(viewConfig.admin ? 'admin-view' : `${normalizedViewId}-view`);
    if (!viewContainer) return;

    viewContainer.classList.add('active');
    showSpinner(viewContainer);

    const allowedRoles = viewConfig.roles || ['admin', 'committee'];

    if (viewConfig.admin && !allowedRoles.includes(currentUserRole)) {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('adminLoginModal')).show();
        viewContainer.innerHTML = '<div class="alert alert-info">Please log in with the required admin access to reach this section.</div>';
        return;
    }

    if (viewConfig.admin) {
        viewContainer.innerHTML = `<h1 class="mb-4">${viewConfig.title}</h1><div id="admin-section-content"></div>`;
        await viewConfig.loader(viewContainer.querySelector('#admin-section-content'), currentUserRole);
    } else {
        await viewConfig.loader(viewContainer, currentUser);
    }

    if (pushHistory && window.location.hash !== `#${publicViewId}`) {
        window.history.pushState({ view: publicViewId }, '', `#${publicViewId}`);
    }
};

export const initializeMainUI = async (session) => {
    const profile = session
        ? (await supabase.from('profiles').select('role').eq('id', session.user.id).single()).data
        : null;
    currentUserRole = profile?.role || 'public';
    currentUser = session?.user ? { ...session.user, role: currentUserRole } : null;

    const adminLoginBtn = document.getElementById('admin-login-btn');
    const logoutBtn = document.getElementById('nav-logout-btn');
    if (adminLoginBtn && logoutBtn) {
        const isSignedIn = Boolean(session?.user);
        adminLoginBtn.classList.toggle('initially-hidden', isSignedIn);
        logoutBtn.classList.toggle('initially-hidden', !isSignedIn);
    }

    if (['admin', 'committee'].includes(currentUserRole)) {
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (!sidebarNav.querySelector('.sidebar-admin-separator')) {
            sidebarNav.insertAdjacentHTML('beforeend', `
                <li class="sidebar-admin-separator"><hr><div>ADMIN</div></li>
                <li class="nav-item"><a class="nav-link" href="#" data-view="admin-comps"><i class="fas fa-list-check nav-icon"></i>Competitions</a></li>
                <li class="nav-item"><a class="nav-link" href="#" data-view="admin-users"><i class="fas fa-user-cog nav-icon"></i>Users</a></li>
                <li class="nav-item"><a class="nav-link" href="#" data-view="admin-enter-scores"><i class="fas fa-clipboard-list nav-icon"></i>Enter Scores</a></li>
                <li class="nav-item"><a class="nav-link" href="#" data-view="admin-finance"><i class="fas fa-sterling-sign nav-icon"></i>Finance</a></li>
                <li class="nav-item"><a class="nav-link" href="#" data-view="admin-season-audit"><i class="fas fa-list-check nav-icon"></i>Season Audit</a></li>
                <li class="nav-item"><a class="nav-link" href="#" data-view="admin-winter"><i class="fas fa-snowflake nav-icon"></i>Winter Admin</a></li>`);

            if (currentUserRole === 'admin') {
                sidebarNav.insertAdjacentHTML('beforeend', `
                <li class="nav-item"><a class="nav-link" href="#" data-view="admin-season-admin"><i class="fas fa-calendar-days nav-icon"></i>Season Admin</a></li>`);
            }
        }
    }

    document.getElementById('app-loader').style.display = 'none';
    document.getElementById('app-layout').style.display = 'flex';
    document.body.style.visibility = 'visible';
    await resetToHomeView();
};

export const setupMainAppEventListeners = () => {
    const body = document.body;
    if (body.dataset.listenersAttached) return;
    body.dataset.listenersAttached = 'true';

    document.getElementById('admin-login-btn').addEventListener('click', (e) => {
        e.preventDefault();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('adminLoginModal')).show();
    });

    document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        const messageEl = document.getElementById('admin-login-message');
        messageEl.textContent = 'Logging in...';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            messageEl.textContent = `Error: ${error.message}`;
        } else {
            window.location.reload();
        }
    });

    document.getElementById('nav-logout-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        await supabase.auth.signOut();
        window.location.reload();
    });

    document.getElementById('theme-toggle-btn').addEventListener('click', (e) => {
        e.preventDefault();
        triggerHaptic(10);
        const currentTheme = document.documentElement.getAttribute('data-bs-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-bs-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', newTheme === 'dark' ? '#1C1C1E' : '#F9F7F2');
        const icon = e.currentTarget.querySelector('.nav-icon');
        if (icon) icon.className = newTheme === 'dark' ? 'fas fa-sun nav-icon' : 'fas fa-moon nav-icon';
    });

    document.getElementById('mobile-nav-toggle').addEventListener('click', () => {
        const sidebar = document.getElementById('app-sidebar');
        sidebar.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('.sidebar-nav .nav-link[data-view]');
        if (!link) return;
        e.preventDefault();
        triggerHaptic(10);
        showView(link.dataset.view);
        closeMobileSidebar();
    });

    document.addEventListener('wags-navigate', (e) => {
        triggerHaptic(10);
        showView(e.detail.view);
    });

    window.addEventListener('popstate', (e) => {
        const fallbackView = getInitialView();
        const viewId = e.state?.view && viewLoaders[e.state.view] ? e.state.view : fallbackView;
        showView(viewId, { pushHistory: false });
        closeMobileSidebar();
    });

    window.addEventListener('pageshow', () => {
        resetToHomeView();
        closeMobileSidebar();
    });

    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('app-sidebar');
        const toggle = document.getElementById('mobile-nav-toggle');
        if (!sidebar?.classList.contains('active')) return;
        if (sidebar.contains(e.target) || toggle?.contains(e.target)) return;
        closeMobileSidebar();
    });
};
