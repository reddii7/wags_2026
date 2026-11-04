import { computed, ref, watchEffect } from 'vue';

const storedTheme = localStorage.getItem('wags-theme');
const theme = ref(storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark');

const applyTheme = (value) => {
    const background = value === 'dark' ? '#12151c' : '#f9f7f2';
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    document.documentElement.style.backgroundColor = background;
    document.body.style.backgroundColor = background;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        background,
    );
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
