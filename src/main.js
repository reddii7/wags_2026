import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';
import { initializeSession } from './composables/useSession';
import { registerSW } from 'virtual:pwa-register';

const APP_VERSION = __APP_VERSION__;
const VERSION_KEY = 'wags-app-version';
const VERSION_RELOAD_KEY = 'wags-app-version-reload';

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

if ('serviceWorker' in navigator) {
    if (import.meta.env.DEV) {
        // Prevent stale app shell during local network/mobile testing.
        clearServiceWorkerAndCaches();
    } else {
        // When a new SW takes over (skipWaiting + clientsClaim), reload once
        // so users get the new JS bundle instead of running stale code.
        // sessionStorage guards against a reload loop.
        let swReloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (swReloading) return;
            if (sessionStorage.getItem('sw-reload-done') === APP_VERSION) return;
            swReloading = true;
            sessionStorage.setItem('sw-reload-done', APP_VERSION);
            window.location.reload();
        });

        const updateSW = registerSW({
            immediate: true,
            onNeedRefresh() {
                updateSW(true);
            },
        });

        // Check for updates when app returns to foreground.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
        });
    }
}

const bootstrap = async () => {
    if (!import.meta.env.DEV) {
        const canContinue = await ensureLatestBuild();
        if (!canContinue) return;
    }

    await initializeSession();
    createApp(App).use(router).mount('#app');
};

bootstrap();
