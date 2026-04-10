import { computed, ref, watchEffect } from 'vue';

const storedTheme = localStorage.getItem('wags-theme');
const preferredDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = ref(storedTheme || (preferredDark ? 'dark' : 'light'));

const applyTheme = (value) => {
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#1C1C1E' : '#F9F7F2');
};

watchEffect(() => {
    applyTheme(theme.value);
    localStorage.setItem('wags-theme', theme.value);
});

export const useTheme = () => {
    const toggleTheme = () => {
        theme.value = theme.value === 'dark' ? 'light' : 'dark';
    };

    return {
        theme: computed(() => theme.value),
        toggleTheme,
    };
};
