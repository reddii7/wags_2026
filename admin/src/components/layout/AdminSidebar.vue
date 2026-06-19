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
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, var(--accent)), var(--surface)),
    var(--surface);
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
  min-height: var(--topbar-height);
  padding: 0.9rem 0.95rem 0.75rem;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.8rem;
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: var(--accent-contrast);
  font-weight: 800;
  font-size: 0.95rem;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--accent) 24%, transparent);
}

.sidebar.collapsed .logo {
  display: inline-flex;
}

.logo-full {
  font-weight: 800;
  letter-spacing: 0.04em;
  margin-left: 0.15rem;
}

.sub {
  color: var(--muted);
  font-size: 0.82rem;
}

.nav-block {
  margin-bottom: 0.5rem;
  padding: 0.45rem 0.55rem 0;
}

.nav-head {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  padding: 0.35rem 0.45rem 0.25rem;
  white-space: nowrap;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.25rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.82rem;
  color: var(--text);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  white-space: nowrap;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}

.nav-link:hover {
  background: color-mix(in srgb, var(--accent) 9%, transparent);
  transform: translateX(1px);
}

.nav-link.is-active {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--line));
  background: color-mix(in srgb, var(--accent) 14%, var(--panel));
  box-shadow: inset 3px 0 0 var(--accent);
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
  background: color-mix(in srgb, var(--accent) 16%, var(--panel));
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
  padding-left: 0.35rem;
  padding-right: 0.35rem;
}
</style>
