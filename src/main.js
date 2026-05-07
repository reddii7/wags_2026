import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';
import { initializeSession } from './composables/useSession';

const APP_VERSION = __APP_VERSION__;
const VERSION_KEY = 'wags-app-version';
const VERSION_RELOAD_KEY = 'wags-app-version-reload';
const SW_KILL_SWITCH_KEY = 'wags-sw-kill-switch-version';
const SW_KILL_SWITCH_VERSION = '2026-05-08-1';

const clearServiceWorkerAndCaches = async () => {
    const tasks = [];

    if ('serviceWorker' in navigator) {
        tasks.push(
            navigator.serviceWorker.getRegistrations().then((regs) =>
                Promise.all(regs.map((reg) => reg.unregister())),
            ),
        );
    }

    if ('caches' in window) {
        tasks.push(
            caches.keys().then((keys) =>
                Promise.all(keys.map((key) => caches.delete(key))),
            ),
        );
    }

    await Promise.all(tasks);
};

const ensureLatestBuild = async () => {
    const previousVersion = localStorage.getItem(VERSION_KEY);
    const reloadedForVersion = sessionStorage.getItem(VERSION_RELOAD_KEY);

    if (!previousVersion) {
        localStorage.setItem(VERSION_KEY, APP_VERSION);
        return true;
    }

    if (previousVersion === APP_VERSION) {
        sessionStorage.removeItem(VERSION_RELOAD_KEY);
        return true;
    }

    // Avoid reload loops if anything unexpected happens.
    if (reloadedForVersion === APP_VERSION) {
        localStorage.setItem(VERSION_KEY, APP_VERSION);
        return true;
    }

    sessionStorage.setItem(VERSION_RELOAD_KEY, APP_VERSION);
    await clearServiceWorkerAndCaches();
    localStorage.setItem(VERSION_KEY, APP_VERSION);
    window.location.reload();
    return false;
};

const runServiceWorkerKillSwitch = async () => {
    if (import.meta.env.DEV) return true;
    const appliedVersion = localStorage.getItem(SW_KILL_SWITCH_KEY);
    if (appliedVersion === SW_KILL_SWITCH_VERSION) return true;

    await clearServiceWorkerAndCaches();
    localStorage.setItem(SW_KILL_SWITCH_KEY, SW_KILL_SWITCH_VERSION);
    window.location.reload();
    return false;
};

const bootstrap = async () => {
    const canContinueAfterKillSwitch = await runServiceWorkerKillSwitch();
    if (!canContinueAfterKillSwitch) return;

    if (!import.meta.env.DEV) {
        const canContinue = await ensureLatestBuild();
        if (!canContinue) return;
    }

    await initializeSession();
    createApp(App).use(router).mount('#app');
};

bootstrap();
