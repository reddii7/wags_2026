<script setup>
import { ref, computed, onBeforeUnmount, onMounted, markRaw } from "vue";
import { useTheme } from "./composables/useTheme";
import { useSession } from "./composables/useSession";
import { useTopbarControls } from "./composables/useTopbarControls";
import NavIcon from "./components/NavIcon.vue";
import TopbarMenu from "./components/TopbarMenu.vue";
import { triggerHapticFeedback } from "./utils/haptics";
import Best14View from "./views/Best14View.vue";
import LeaguesView from "./views/LeaguesView.vue";
import ResultsView from "./views/ResultsView.vue";
import HandicapsView from "./views/HandicapsView.vue";
import HomeView from "./views/HomeView.vue";

const { theme, toggleTheme } = useTheme();
const { user, signOut } = useSession();
const { seasonControl } = useTopbarControls();
const chromeHidden = ref(false);
const hasScrolled = ref(false);
let lastScrollY = 0;

const sections = [
  { name: "home", label: "Home", icon: "home", component: markRaw(HomeView) },
  {
    name: "results",
    label: "Results",
    icon: "results",
    component: markRaw(ResultsView),
  },
  {
    name: "best14",
    label: "Best 14",
    icon: "best14",
    component: markRaw(Best14View),
  },
  {
    name: "handicaps",
    label: "Handicaps",
    icon: "handicaps",
    component: markRaw(HandicapsView),
  },
  {
    name: "leagues",
    label: "Leagues",
    icon: "leagues",
    component: markRaw(LeaguesView),
  },
];

const currentSection = ref(sections[0]);

// Ensure currentSection is always a valid section object
function switchSection(section) {
  triggerHapticFeedback();
  currentSection.value = section || sections[0];
}

// Defensive computed for template
const currentSectionComponent = computed(
  () => currentSection.value?.component || sections[0].component,
);
const currentSectionName = computed(
  () => currentSection.value?.name || sections[0].name,
);

const topbarSeasons = computed(() => seasonControl.value?.seasons?.value || []);
const selectedTopbarSeasonId = computed(
  () => seasonControl.value?.model?.value || null,
);
const showTopbarSeasonControl = computed(() => topbarSeasons.value.length > 0);

const handleSeasonSelect = (seasonId) => {
  triggerHapticFeedback();
  seasonControl.model.value = seasonId;
};

const handleThemeToggle = () => {
  triggerHapticFeedback();
  toggleTheme();
};

const handleAuthAction = async () => {
  triggerHapticFeedback();
  if (user.value) {
    await signOut();
    return;
  }
};

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
    :class="{ 'chrome-hidden': chromeHidden }"
  >
    <header class="app-topbar" :class="{ scrolled: hasScrolled }">
      <div
        class="topbar-row"
        :class="{ 'topbar-row--season': showTopbarSeasonControl }"
      >
        <div
          v-if="showTopbarSeasonControl"
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
          <TopbarMenu />
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="view-frame">
        <transition name="page-fade" mode="out-in">
          <component :is="currentSectionComponent" :key="currentSectionName" />
        </transition>
      </div>
    </main>

    <nav class="bottom-nav" aria-label="Primary">
      <button
        v-for="section in sections"
        :key="section.name"
        class="bottom-nav-link"
        :class="{ active: currentSectionName === section.name }"
        @click="switchSection(section)"
      >
        <NavIcon :name="section.icon" />
        <span class="bottom-nav-label">{{ section.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style>
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 120ms cubic-bezier(0.4, 1.6, 0.6, 1);
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
