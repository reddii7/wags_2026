import { supabase } from './config.js';
import { initializeMainUI, setupMainAppEventListeners } from './ui.js';

const applyThemeMeta = (theme) => {
    const themeColor = theme === 'dark' ? '#1C1C1E' : '#F9F7F2';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
};

document.addEventListener('DOMContentLoaded', () => {
    const initialTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-bs-theme', initialTheme);
    applyThemeMeta(initialTheme);

    const init = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setupMainAppEventListeners();
        await initializeMainUI(session);
    };

    init();
});