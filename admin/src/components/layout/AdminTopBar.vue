<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useDark, useToggle, usePreferredDark, useStorage } from "@vueuse/core";
import { getAdminNavFlatItems } from "@/config/adminNav.js";
import { useLayoutStore } from "@/stores/useLayoutStore.js";

defineProps({
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(["open-drawer"]);

const layout = useLayoutStore();
const admin = inject("adminCtx");
const router = useRouter();

const quickNavInput = ref(null);
const quickNavQuery = ref("");
const quickNavOpen = ref(false);
const quickNavIndex = ref(0);
const navItems = getAdminNavFlatItems();

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

const toggleDark = useToggle(isDark);

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

const connectionLabel = computed(() => {
  if (admin?.connecting?.value) return "Connecting";
  return admin?.connected?.value ? "Connected" : "Offline";
});

const themeIcon = computed(() => {
  if (themePref.value === "light") return "☀";
  if (themePref.value === "dark") return "☾";
  return "◐";
});

const quickNavMatches = computed(() => {
  const query = quickNavQuery.value.trim().toLowerCase();
  const matches = query
    ? navItems.filter((item) => {
        const haystack = `${item.label} ${item.group} ${item.to}`.toLowerCase();
        return haystack.includes(query);
      })
    : navItems;
  return matches.slice(0, 7);
});

function openQuickNav() {
  quickNavOpen.value = true;
  quickNavIndex.value = 0;
}

function closeQuickNavSoon() {
  window.setTimeout(() => {
    quickNavOpen.value = false;
  }, 120);
}

function selectQuickNav(item) {
  if (!item) return;
  quickNavQuery.value = "";
  quickNavOpen.value = false;
  quickNavIndex.value = 0;
  void router.push(item.to);
}

function onQuickNavInput() {
  quickNavIndex.value = 0;
  quickNavOpen.value = true;
}

function onQuickNavKeydown(event) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    openQuickNav();
    quickNavIndex.value = Math.min(
      quickNavIndex.value + 1,
      Math.max(quickNavMatches.value.length - 1, 0),
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    quickNavIndex.value = Math.max(quickNavIndex.value - 1, 0);
  } else if (event.key === "Enter") {
    if (!quickNavOpen.value) return;
    event.preventDefault();
    selectQuickNav(quickNavMatches.value[quickNavIndex.value]);
  } else if (event.key === "Escape") {
    event.preventDefault();
    quickNavOpen.value = false;
    quickNavInput.value?.blur();
  }
}

function isTypingTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
}

function onGlobalKeydown(event) {
  const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
  const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
  if (!isShortcut && (!isSlash || isTypingTarget(event.target))) return;
  event.preventDefault();
  quickNavInput.value?.focus();
  openQuickNav();
}

onMounted(() => {
  window.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
});

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

    <div class="topbar-title">
      <span class="title-main">WAGS Admin</span>
      <span class="title-sub">Operations console</span>
    </div>

    <div class="quick-nav" :class="{ open: quickNavOpen }">
      <input
        ref="quickNavInput"
        v-model="quickNavQuery"
        class="quick-nav-input"
        type="search"
        placeholder="Jump to workflow or table"
        autocomplete="off"
        aria-label="Quick navigation"
        :aria-expanded="quickNavOpen"
        aria-controls="quick-nav-results"
        @focus="openQuickNav"
        @blur="closeQuickNavSoon"
        @input="onQuickNavInput"
        @keydown="onQuickNavKeydown"
      />
      <span class="quick-nav-key" aria-hidden="true">⌘K</span>
      <div v-if="quickNavOpen" id="quick-nav-results" class="quick-nav-results" role="listbox">
        <button
          v-for="(item, index) in quickNavMatches"
          :key="item.to"
          type="button"
          :class="['quick-nav-result', index === quickNavIndex ? 'active' : '']"
          role="option"
          :aria-selected="index === quickNavIndex"
          @mousedown.prevent="selectQuickNav(item)"
        >
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.group }}</small>
          </span>
          <span class="quick-nav-path">{{ item.to }}</span>
        </button>
        <div v-if="!quickNavMatches.length" class="quick-nav-empty">
          No matching admin pages.
        </div>
      </div>
    </div>

    <div class="topbar-end">
      <span class="connection-pill" :data-on="admin?.connected?.value">
        <span class="connection-dot" aria-hidden="true" />
        {{ connectionLabel }}
      </span>
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
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: var(--topbar-height);
  padding: 0.6rem clamp(0.85rem, 2vw, 1.25rem);
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.04);
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
  border-radius: var(--radius-md);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}

.icon-btn:hover {
  border-color: var(--line-strong);
  background: var(--panel-strong);
  transform: translateY(-1px);
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

.topbar-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}

.title-main {
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.title-sub {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.quick-nav {
  position: relative;
  flex: 0 1 24rem;
  min-width: 13rem;
}

.quick-nav-input {
  width: 100%;
  height: 2.25rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.45rem 3.1rem 0.45rem 0.85rem;
  background: color-mix(in srgb, var(--panel) 90%, transparent);
  color: var(--text);
  font-size: 0.84rem;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.quick-nav-input::placeholder {
  color: var(--muted);
}

.quick-nav-input:focus {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  background: var(--panel);
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.quick-nav-key {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.15rem;
  min-height: 1.35rem;
  padding: 0 0.35rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel-strong) 84%, transparent);
  color: var(--muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  pointer-events: none;
}

.quick-nav-results {
  position: absolute;
  top: calc(100% + 0.45rem);
  right: 0;
  left: 0;
  z-index: 60;
  overflow: hidden;
  padding: 0.35rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow);
}

.quick-nav-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  border: 0;
  border-radius: var(--radius-md);
  padding: 0.55rem 0.65rem;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.quick-nav-result:hover,
.quick-nav-result.active {
  background: color-mix(in srgb, var(--accent) 12%, var(--panel));
}

.quick-nav-result strong,
.quick-nav-result small {
  display: block;
}

.quick-nav-result strong {
  font-size: 0.84rem;
}

.quick-nav-result small,
.quick-nav-path,
.quick-nav-empty {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 650;
}

.quick-nav-path {
  flex-shrink: 0;
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-nav-empty {
  padding: 0.8rem;
  text-align: center;
}

.topbar-end {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-left: auto;
  flex-shrink: 0;
}

.connection-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--muted-strong);
  font-size: 0.78rem;
  font-weight: 700;
}

.connection-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--danger);
  box-shadow: 0 0 0 4px var(--danger-soft);
}

.connection-pill[data-on="true"] .connection-dot {
  background: var(--ok);
  box-shadow: 0 0 0 4px var(--ok-soft);
}

.theme-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;
}

.theme-btn:hover {
  border-color: var(--line-strong);
  background: var(--panel-strong);
  transform: translateY(-1px);
}

.theme-icon {
  font-size: 0.95rem;
}

@media (max-width: 640px) {
  .title-sub,
  .quick-nav,
  .connection-pill {
    display: none;
  }

  .theme-text {
    display: none;
  }
}
</style>
