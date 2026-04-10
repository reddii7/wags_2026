import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles.css';
import { initializeSession } from './composables/useSession';

const bootstrap = async () => {
    await initializeSession();
    createApp(App).use(router).mount('#app');
};

bootstrap();
