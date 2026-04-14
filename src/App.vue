<script setup>
import { ref, computed, onBeforeUnmount, onMounted, markRaw } from "vue";
import { useTheme } from "./composables/useTheme";
import NavIcon from "./components/NavIcon.vue";
import { triggerHapticFeedback } from "./utils/haptics";
import { supabase } from "./lib/supabase";
import HomeView from "./views/HomeView.vue";
import HandicapsView from "./views/HandicapsView.vue";
import StatsHubView from "./views/StatsHubView.vue";

const { theme } = useTheme();
const chromeHidden = ref(false);
const globalMetadata = ref({
  season: null,
  latestComp: null,
  summary: null,
  loading: true,
});
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

async function loadGlobalMetadata() {
  try {
    // Round 1: Fetch Seasons and the Latest Closed Competition metadata
    const [seasonsRes, compRes] = await Promise.all([
      supabase
        .from("seasons")
        .select("id, name, start_year, start_date, end_date, is_current")
        .order("start_year", { ascending: false }),
      supabase
        .from("competitions")
        .select("id, name, competition_date, status")
        .eq("status", "closed")
        .order("competition_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const season =
      seasonsRes.data?.find((s) => s.is_current) || seasonsRes.data?.[0];
    const latestComp = compRes.data;

    // Round 2: If we have a competition, get the summary immediately
    // This removes the one-second wait inside HomeView
    let summaryData = null;
    if (latestComp?.id) {
      const { data } = await supabase
        .from("results_summary")
        .select("*")
        .eq("competition_id", latestComp.id)
        .maybeSingle();
      summaryData = data;
    }

    globalMetadata.value = {
      season,
      latestComp,
      summary: summaryData,
      loading: false,
    };
  } catch (err) {
    console.error("Failed to load global metadata:", err);
    globalMetadata.value.loading = false;
  }
}

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
  loadGlobalMetadata();
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
            :metadata="globalMetadata"
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
  transition:
    opacity 400ms cubic-bezier(0.32, 0.72, 0, 1),
    transform 400ms cubic-bezier(0.32, 0.72, 0, 1);
  will-change: opacity, transform;
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
