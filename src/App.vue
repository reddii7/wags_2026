<script setup>
import { ref, computed, onBeforeUnmount, onMounted, markRaw } from "vue";
import { useTheme } from "./composables/useTheme";
import NavIcon from "./components/NavIcon.vue";
import { triggerHapticFeedback } from "./utils/haptics";
import { supabase } from "./lib/supabase";
import HomeView from "./views/HomeView.vue";
import HandicapsView from "./views/HandicapsView.vue";
import StatsHubView from "./views/StatsHubView.vue";
import RSCupView from "./views/RSCupView.vue";

const { theme } = useTheme();
const chromeHidden = ref(false);
const globalMetadata = ref({
  season: null,
  seasons: [],
  latestComp: null,
  summary: null,
  dashboard: null,
  loading: true,
});
const hasScrolled = ref(false);
let lastScrollY = 0;

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw";
const PROJECT_URL =
  "https://fpulgnhtngvqdikbdkgv.functions.supabase.co/fetch-all-data";

async function loadGlobalMetadata() {
  globalMetadata.value.loading = true;
  try {
    // Fetch all-seasons data in one call
    const response = await fetch(PROJECT_URL, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!response.ok) {
      throw new Error(`fetch-all-data failed: ${response.status}`);
    }
    const data = await response.json();
    Object.assign(globalMetadata.value, data);
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
    icon: "users",
    component: markRaw(HandicapsView),
  },
  {
    name: "rscup",
    label: "RS CUP",
    icon: "trophy",
    component: markRaw(RSCupView),
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

let supabaseChannels = [];
onMounted(() => {
  lastScrollY = window.scrollY || 0;
  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
  loadGlobalMetadata();

  // Subscribe to relevant tables for realtime updates
  const tables = [
    "competitions",
    "public_results_view",
    "results_summary",
    "handicap_history",
    "profiles",
    // add more if needed
  ];
  supabaseChannels = tables.map((table) =>
    supabase
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        // Refetch all data when anything changes
        loadGlobalMetadata();
      })
      .subscribe(),
  );
});
onBeforeUnmount(() => {
  supabaseChannels.forEach((ch) => supabase.removeChannel(ch));
  window.removeEventListener("scroll", handleScroll);
});
</script>

<template>
  <div class="app-shell" :data-theme="theme" style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #181818; color: #fff;">
    <div style="text-align: center;">
      <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">Site Under Maintenance</h1>
      <p style="font-size: 1.25rem;">We're currently performing essential maintenance.<br />Please check back soon.</p>
    </div>
  </div>
</template>

<style>
.bottom-nav {
  background: var(--bg) !important;
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition:
    opacity 320ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 320ms cubic-bezier(0.23, 1, 0.32, 1);
  will-change: opacity, transform;
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
