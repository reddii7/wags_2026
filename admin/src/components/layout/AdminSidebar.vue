<script setup>
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ADMIN_NAV_GROUPS, isNavPathActive } from "@/config/adminNav.js";
import { useLayoutStore } from "@/stores/useLayoutStore.js";

const props = defineProps({
  inDrawer: { type: Boolean, default: false },
});

const emit = defineEmits(["navigate"]);

const route = useRoute();
const layout = useLayoutStore();

const collapsed = computed(() => !props.inDrawer && layout.sidebarCollapsed);

function shortLabel(label) {
  const words = label.trim().split(/\s+/);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

function linkClass(to) {
  return ["nav-link", isNavPathActive(route.path, to) ? "is-active" : ""];
}

function onNavClick() {
  emit("navigate");
  layout.closeMobileDrawer();
}
</script>

<template>
  <nav
    class="sidebar"
    :class="{ collapsed: collapsed, drawer: inDrawer }"
    aria-label="Admin navigation"
  >
    <div class="sidebar-brand">
      <span class="logo">W</span>
      <span v-if="!collapsed || inDrawer" class="logo-full">WAGS</span>
      <span v-if="!collapsed || inDrawer" class="sub">Admin</span>
    </div>

    <div v-for="g in ADMIN_NAV_GROUPS" :key="g.id" class="nav-block">
      <div v-if="!collapsed || inDrawer" class="nav-head">{{ g.label }}</div>
      <RouterLink
        v-for="item in g.items"
        :key="item.to"
        :to="item.to"
        :class="linkClass(item.to)"
        :title="collapsed && !inDrawer ? item.label : undefined"
        @click="onNavClick"
      >
        <span class="nav-short" aria-hidden="true">{{ shortLabel(item.label) }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 240px;
  border-right: 1px solid var(--line);
  background: var(--surface);
  overflow-x: hidden;
  overflow-y: auto;
  transition: width 0.2s ease;
}

.sidebar.collapsed {
  width: 4rem;
}

.sidebar.drawer {
  width: 100%;
  border-right: none;
}

.sidebar-brand {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 1rem 0.85rem 0.65rem;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.logo {
  display: none;
  font-weight: 800;
  font-size: 1rem;
  color: var(--accent);
}

.sidebar.collapsed .logo {
  display: inline;
}

.logo-full {
  font-weight: 800;
  letter-spacing: 0.04em;
}

.sub {
  color: var(--muted);
  font-size: 0.82rem;
}

.nav-block {
  margin-bottom: 0.5rem;
  padding-top: 0.35rem;
}

.nav-head {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  padding: 0.35rem 0.85rem 0.2rem;
  white-space: nowrap;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.4rem 0.85rem;
  font-size: 0.82rem;
  color: var(--text);
  text-decoration: none;
  border-left: 3px solid transparent;
  white-space: nowrap;
}

.nav-link:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.nav-link.is-active {
  border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  font-weight: 600;
}

.nav-short {
  display: none;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 0.62rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--accent);
  flex-shrink: 0;
}

.sidebar.collapsed .nav-short {
  display: inline-flex;
}

.sidebar.collapsed .nav-label {
  display: none;
}

.sidebar.collapsed .nav-link {
  justify-content: center;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
</style>
