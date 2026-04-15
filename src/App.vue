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
  dashboard: null,
  loading: true,
});
const hasScrolled = ref(false);
let lastScrollY = 0;

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
        .select(
          "id, name, competition_date, status, winner_id, prize_pot, rollover_amount",
        )
        .eq("status", "closed")
        .order("competition_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const season =
      seasonsRes.data?.find((s) => s.is_current) || seasonsRes.data?.[0];
    const latestComp = compRes.data;

    // Defensive check: only call Round 2 if we have actual IDs
    if (season?.id && latestComp?.id) {
      try {
        const [summaryRes, dashRes] = await Promise.all([
          supabase
            .from("results_summary")
            .select("*")
            .eq("competition_id", latestComp.id)
            .maybeSingle(),
          supabase.rpc("get_dashboard_overview", {
            p_season_id: season.id,
            p_competition_id: latestComp.id,
          }),
        ]);

        if (dashRes.error) throw dashRes.error;

        globalMetadata.value.summary = summaryRes.data;
        globalMetadata.value.dashboard = dashRes.data;
      } catch (rpcErr) {
        console.error("Dashboard RPC Error:", rpcErr);
        // Ensure dashboard is at least an empty object to prevent child crashes
        globalMetadata.value.dashboard = {
          results: [],
          best14: [],
          leagues: [],
          handicaps: [],
          week_count: 0,
        };
      }
    } else {
      globalMetadata.value.dashboard = {
        results: [],
        best14: [],
        leagues: [],
        handicaps: [],
        week_count: 0,
      };
    }

    globalMetadata.value.season = season;
    globalMetadata.value.latestComp = latestComp;
  } catch (err) {
    console.error("Failed to load global metadata:", err);
  } finally {
    globalMetadata.value.loading = false;
  }
}

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
      <div v-if="globalMetadata.loading" class="app-boot-loader">
        <div class="loader-content">
          <div class="spinner"></div>
          <p class="loader-text">WAGS</p>
        </div>
      </div>

      <div class="view-frame" v-if="!globalMetadata.loading">
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
