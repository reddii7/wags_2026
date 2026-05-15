<script setup>
import { computed } from "vue";
import { RouterView } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from "radix-vue";
import AdminSidebar from "@/components/layout/AdminSidebar.vue";
import AdminTopBar from "@/components/layout/AdminTopBar.vue";
import AdminBreadcrumbs from "@/components/layout/AdminBreadcrumbs.vue";
import AdminConnectPanel from "@/components/AdminConnectPanel.vue";
import { useLayoutStore } from "@/stores/useLayoutStore.js";

const layout = useLayoutStore();
const isMobile = useMediaQuery("(max-width: 1023px)");

const drawerOpen = computed({
  get: () => layout.mobileDrawerOpen,
  set: (v) => (v ? layout.openMobileDrawer() : layout.closeMobileDrawer()),
});
</script>

<template>
  <div class="admin-layout">
    <aside v-if="!isMobile" class="sidebar-shell" aria-label="Sidebar">
      <AdminSidebar />
    </aside>

    <DialogRoot v-if="isMobile" v-model:open="drawerOpen">
      <DialogPortal>
        <DialogOverlay class="drawer-overlay" />
        <DialogContent class="drawer-panel" aria-label="Navigation menu">
          <AdminSidebar in-drawer />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <div class="main-column">
      <AdminTopBar :is-mobile="isMobile" @open-drawer="layout.openMobileDrawer()" />
      <AdminConnectPanel />
      <main class="main-content">
        <AdminBreadcrumbs />
        <RouterView v-slot="{ Component, route }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

.sidebar-shell {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 20;
}

.main-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  padding: 1rem 1.25rem 2rem;
  overflow-x: auto;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgb(0 0 0 / 0.55);
}

.drawer-panel {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 51;
  height: 100%;
  width: min(280px, 88vw);
  outline: none;
  box-shadow: 4px 0 24px rgb(0 0 0 / 0.35);
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
