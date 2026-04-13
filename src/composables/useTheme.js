import { computed, ref, watchEffect } from 'vue';

const theme = ref('dark');

const applyTheme = (value) => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#1C1C1E');
};

watchEffect(() => {
    applyTheme('dark');
});

export const useTheme = () => {
    return {
        theme: computed(() => 'dark'),
        toggleTheme: () => { },
    };
};
