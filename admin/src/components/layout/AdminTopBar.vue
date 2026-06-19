<script setup>
import { computed, inject, watchEffect } from "vue";
import { useDark, useToggle, usePreferredDark, useStorage } from "@vueuse/core";
import { useLayoutStore } from "@/stores/useLayoutStore.js";

defineProps({
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(["open-drawer"]);

const layout = useLayoutStore();
const admin = inject("adminCtx");

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
  .connection-pill {
    display: none;
  }

  .theme-text {
    display: none;
  }
}
</style>
