import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';
import { initializeSession } from './composables/useSession';

// Unregister any previously installed service workers so existing users
// are not stuck on stale cached assets.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
    });
}
if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
}

const bootstrap = async () => {
    await initializeSession();
    createApp(App).use(router).mount('#app');
};

bootstrap();
