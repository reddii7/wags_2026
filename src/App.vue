<script setup>
import { ref, computed, onBeforeUnmount, onMounted, markRaw } from "vue";
import { useTheme } from "./composables/useTheme";
import NavIcon from "./components/NavIcon.vue";
import { triggerHapticFeedback } from "./utils/haptics";
import HomeView from "./views/HomeView.vue";
import HandicapsView from "./views/HandicapsView.vue";
import StatsHubView from "./views/StatsHubView.vue";

const { theme } = useTheme();
const chromeHidden = ref(false);
const hasScrolled = ref(false);
let lastScrollY = 0;

const sections = [
  { name: "home", label: "Home", icon: "home", component: markRaw(HomeView) },
  {
    name: "stats",
    label: "Stats",
    icon: "results",
    component: markRaw(StatsHubView),
  },
  {
    name: "handicaps",
    label: "Handicaps",
    icon: "results",
    component: markRaw(HandicapsView),
  },
];

const currentSection = ref(sections[0]);

// Ensure currentSection is always a valid section object
function switchSection(section) {
  triggerHapticFeedback();
  currentSection.value = section || sections[0];
}

const currentSectionComponent = computed(
  () => currentSection.value?.component || sections[0].component,
);
const currentSectionName = computed(
  () => currentSection.value?.name || sections[0].name,
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
    <main class="app-main">
      <div class="view-frame">
        <transition name="page-fade" mode="out-in">
          <component
            :is="currentSectionComponent"
            :key="currentSectionName"
            @navigate="
              (target) => switchSection(sections.find((s) => s.name === target))
            "
          />
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
.bottom-nav {
  background: var(--bg) !important;
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 120ms cubic-bezier(0.4, 1.6, 0.6, 1);
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
