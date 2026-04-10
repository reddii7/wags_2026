<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import { useTheme } from "./composables/useTheme";
import { useSession } from "./composables/useSession";
import { useTopbarControls } from "./composables/useTopbarControls";
import NavIcon from "./components/NavIcon.vue";
import { triggerHapticFeedback } from "./utils/haptics";

const route = useRoute();
const router = useRouter();
const { theme, toggleTheme } = useTheme();
const { user, signOut } = useSession();
const { seasonControl } = useTopbarControls();
const chromeHidden = ref(false);
const hasScrolled = ref(false);
let lastScrollY = 0;

const navItems = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/results", label: "Results", icon: "results" },
  { to: "/best14", label: "Best 14", icon: "best14" },
  { to: "/handicaps", label: "Handicaps", icon: "handicaps" },
  { to: "/leagues", label: "Leagues", icon: "leagues" },
];

const adminItems = [
  { to: "/admin/competitions", label: "Competitions", icon: "admin" },
  { to: "/admin/scores", label: "Scores", icon: "scores" },
  { to: "/admin/users", label: "Users", icon: "users" },
];

const isAdminRoute = computed(() => route.path.startsWith("/admin"));
const isAdminLoginRoute = computed(() => route.path === "/admin/login");
const showPublicNav = computed(() => !isAdminRoute.value);
const topbarSeasons = computed(() => seasonControl.value?.seasons?.value || []);
const selectedTopbarSeasonId = computed(
  () => seasonControl.value?.model?.value || null,
);
const showTopbarSeasonControl = computed(
  () => !isAdminRoute.value && topbarSeasons.value.length > 0,
);

const footerItems = computed(() => {
  if (isAdminLoginRoute.value) return [];
  return isAdminRoute.value ? adminItems : navItems;
});

const isWideRoute = computed(() =>
  [
    "/results",
    "/best14",
    "/handicaps",
    "/leagues",
    "/admin/competitions",
    "/admin/scores",
    "/admin/users",
  ].includes(route.path),
);

const handleScroll = () => {
  const currentY = window.scrollY || 0;
  hasScrolled.value = currentY > 18;

  if (currentY < 24) {
    chromeHidden.value = false;
    lastScrollY = currentY;
    return;
  }

  const delta = currentY - lastScrollY;
  if (delta > 8) chromeHidden.value = true;
  if (delta < -8) chromeHidden.value = false;
  lastScrollY = currentY;
};

const handleSeasonSelect = (seasonId) => {
  triggerHapticFeedback();
  seasonControl.model.value = seasonId;
};

const handleThemeToggle = () => {
  triggerHapticFeedback();
  toggleTheme();
};

const handleNavTap = () => {
  triggerHapticFeedback();
};

const handleAuthAction = async () => {
  triggerHapticFeedback();
  if (user.value) {
    await signOut();
    await router.push("/");
    return;
  }
  await router.push("/admin/login");
};

onMounted(() => {
  lastScrollY = window.scrollY || 0;
  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", handleScroll);
});
</script>

<template>
  <div
    class="app-shell"
    :data-theme="theme"
    :class="{
      'chrome-hidden': chromeHidden,
      'app-shell--admin': isAdminRoute,
      'app-shell--admin-login': isAdminLoginRoute,
    }"
  >
    <header class="app-topbar" :class="{ scrolled: hasScrolled }">
      <div
        class="topbar-row"
        :class="{
          'topbar-row--admin': isAdminRoute,
          'topbar-row--season': showTopbarSeasonControl,
        }"
      >
        <div v-if="isAdminRoute" class="admin-topbar-meta">
          <span class="admin-topbar-kicker">Admin</span>
          <div v-if="!isAdminLoginRoute" class="admin-topbar-tabs">
            <RouterLink
              v-for="item in adminItems"
              :key="item.to"
              :to="item.to"
              class="admin-tab-link"
            >
              {{ item.label }}
            </RouterLink>
          </div>
        </div>
        <div
          v-else-if="showTopbarSeasonControl"
          class="topbar-season-nav"
          role="tablist"
          aria-label="Season selector"
        >
          <button
            v-for="season in topbarSeasons"
            :key="season.id"
            type="button"
            class="season-pill"
            :class="{ active: selectedTopbarSeasonId === season.id }"
            @click="handleSeasonSelect(season.id)"
          >
            {{ season.name || season.start_year }}
          </button>
        </div>
        <div class="topbar-actions">
          <button class="utility-link" type="button" @click="handleThemeToggle">
            {{ theme === "dark" ? "Light" : "Dark" }}
          </button>
          <RouterLink
            v-if="!isAdminRoute"
            to="/admin/login"
            class="utility-link"
            @click="handleNavTap"
          >
            Admin
          </RouterLink>
          <RouterLink
            v-if="isAdminRoute"
            to="/"
            class="utility-link"
            @click="handleNavTap"
          >
            Public
          </RouterLink>
          <button
            v-if="isAdminRoute"
            class="utility-link"
            type="button"
            @click="handleAuthAction"
          >
            {{ user ? "Sign out" : "Admin login" }}
          </button>
        </div>
      </div>
    </header>

    <main class="app-main" :class="{ 'app-main--admin': isAdminRoute }">
      <div class="view-frame" :class="{ 'view-frame--wide': isWideRoute }">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <transition name="page-fade">
            <component :is="Component" :key="currentRoute.fullPath" />
          </transition>
        </RouterView>
      </div>
    </main>

    <nav v-if="showPublicNav" class="bottom-nav" aria-label="Primary">
      <RouterLink
        v-for="item in footerItems"
        :key="item.to"
        :to="item.to"
        class="bottom-nav-link"
        @click="handleNavTap"
      >
        <NavIcon :name="item.icon" />
        <span class="bottom-nav-label">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>
