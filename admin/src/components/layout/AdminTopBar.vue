<script setup>
import { computed, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useDark, useToggle, usePreferredDark, useStorage } from "@vueuse/core";
import { getAdminNavFlatItems } from "@/config/adminNav.js";
import { useLayoutStore } from "@/stores/useLayoutStore.js";

defineProps({
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(["open-drawer"]);

const router = useRouter();
const layout = useLayoutStore();

/** @type {import('vue').Ref<'light'|'dark'|'auto'>} */
const themePref = useStorage("wags-admin-theme", "dark");
const prefersDark = usePreferredDark();
const isDark = useDark();

watchEffect(() => {
  if (themePref.value === "auto") {
    isDark.value = prefersDark.value;
  } else {
    isDark.value = themePref.value === "dark";
  }
});

const themeCycle = ["light", "dark", "auto"];
const themeLabels = { light: "Light", dark: "Dark", auto: "System" };

const { toggle: toggleDark } = useToggle(isDark);

function onThemeClick() {
  const idx = themeCycle.indexOf(themePref.value);
  themePref.value = themeCycle[(idx + 1) % themeCycle.length];
}

/** Shift-click: quick light/dark flip via useToggle. */
function onThemePointerDown(e) {
  if (e.shiftKey && themePref.value !== "auto") {
    toggleDark();
    themePref.value = isDark.value ? "dark" : "light";
  }
}

const themeLabel = computed(() => themeLabels[themePref.value] ?? "Theme");

const themeIcon = computed(() => {
  if (themePref.value === "light") return "☀";
  if (themePref.value === "dark") return "☾";
  return "◐";
});

const displayName = import.meta.env.VITE_ADMIN_DISPLAY_NAME || "WAGS Operator";
const initials = computed(() =>
  displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase(),
);

const searchQuery = ref("");
const searchOpen = ref(false);

const flatNav = getAdminNavFlatItems();

const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return flatNav
    .filter(
      (item) =>
        item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q),
    )
    .slice(0, 8);
});

function goToResult(item) {
  searchQuery.value = "";
  searchOpen.value = false;
  router.push(item.to);
}

function onSearchBlur() {
  window.setTimeout(() => {
    searchOpen.value = false;
  }, 150);
}
</script>

<template>
  <header class="topbar">
    <div class="topbar-start">
      <button
        v-if="isMobile"
        type="button"
        class="icon-btn"
        aria-label="Open navigation menu"
        @click="emit('open-drawer')"
      >
        <span class="hamburger" aria-hidden="true" />
      </button>
      <button
        v-else
        type="button"
        class="icon-btn"
        :aria-label="layout.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="layout.toggleSidebar()"
      >
        <span class="collapse-icon" aria-hidden="true">☰</span>
      </button>
    </div>

    <div class="search-wrap">
      <label class="sr-only" for="global-search">Search admin pages</label>
      <input
        id="global-search"
        v-model="searchQuery"
        type="search"
        class="search-input"
        placeholder="Search pages…"
        autocomplete="off"
        @focus="searchOpen = true"
        @blur="onSearchBlur"
      />
      <ul v-if="searchOpen && searchResults.length" class="search-results" role="listbox">
        <li v-for="item in searchResults" :key="item.to">
          <button type="button" class="search-hit" role="option" @mousedown.prevent="goToResult(item)">
            <span class="hit-label">{{ item.label }}</span>
            <span class="hit-group">{{ item.group }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div class="topbar-end">
      <button
        type="button"
        class="theme-btn"
        :title="`Theme: ${themeLabel}. Click to cycle; Shift+click to toggle dark.`"
        @click="onThemeClick"
        @pointerdown="onThemePointerDown"
      >
        <span class="theme-icon" aria-hidden="true">{{ themeIcon }}</span>
        <span class="theme-text">{{ themeLabel }}</span>
      </button>

      <div class="user-chip">
        <span class="avatar" aria-hidden="true">{{ initials }}</span>
        <span class="user-name">{{ displayName }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  min-height: 3.25rem;
}

.topbar-start {
  flex-shrink: 0;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}

.icon-btn:hover {
  border-color: var(--muted);
}

.hamburger {
  display: block;
  width: 1rem;
  height: 2px;
  background: currentColor;
  box-shadow: 0 -5px 0 currentColor, 0 5px 0 currentColor;
}

.collapse-icon {
  font-size: 1rem;
  line-height: 1;
}

.search-wrap {
  position: relative;
  flex: 1;
  max-width: 28rem;
}

.search-input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.42rem 0.9rem;
  background: var(--bg);
  color: var(--text);
  font-size: 0.86rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.search-results {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}

.search-hit {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.search-hit:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.hit-label {
  font-size: 0.86rem;
  font-weight: 600;
}

.hit-group {
  font-size: 0.72rem;
  color: var(--muted);
}

.topbar-end {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-left: auto;
  flex-shrink: 0;
}

.theme-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.theme-btn:hover {
  border-color: var(--muted);
}

.theme-icon {
  font-size: 0.95rem;
}

@media (max-width: 640px) {
  .theme-text,
  .user-name {
    display: none;
  }
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
}

.user-name {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
