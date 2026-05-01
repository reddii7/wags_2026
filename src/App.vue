<script setup>
import { ref, computed, onBeforeUnmount, onMounted, markRaw } from "vue";
import { useTheme } from "./composables/useTheme";
import NavIcon from "./components/NavIcon.vue";
import { triggerHapticFeedback } from "./utils/haptics";
import { supabase } from "./lib/supabase";
import { FETCH_ALL_DATA_URL } from "./lib/supabaseConfig.js";
import HomeView from "./views/HomeView.vue";
import HandicapsView from "./views/HandicapsView.vue";
import StatsHubView from "./views/StatsHubView.vue";
import RSCupView from "./views/RSCupView.vue";
import MoreView from "./views/MoreView.vue";
const selectedCompetitionId = ref(null);

// Handle navigation events from child components
const handleNavigate = (data) => {
  if (data?.competitionId) {
    selectedCompetitionId.value = data.competitionId;
  }
  if (data?.section) {
    const section = visibleSections.value.find((s) => s.name === data.section);
    if (section) {
      switchSection(section);
    }
  }
};

const { theme } = useTheme();
const chromeHidden = ref(false);
const globalMetadata = ref({
  season: null,
  seasons: [],
  latestComp: null,
  summary: null,
  dashboard: null,
  loading: true,
  loadError: "",
});
const hasScrolled = ref(false);
let lastScrollY = 0;
let hasInitialFullData = false;

let reloadDebounceTimer = null;
function scheduleGlobalMetadataReload() {
  if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
  reloadDebounceTimer = setTimeout(() => {
    reloadDebounceTimer = null;
    loadGlobalMetadata();
  }, 450);
}

async function loadGlobalMetadata() {
  const isInitialLoad = !hasInitialFullData;
  if (isInitialLoad) {
    globalMetadata.value.loading = true;
  }
  globalMetadata.value.loadError = "";

  // ── Phase 1: shell (seasons, competitions, profiles, handicap_history) ──────
  // This is fast (~100-200 ms) and enough to show the nav + HandicapsView.
  try {
    const shellRes = await fetch(`${FETCH_ALL_DATA_URL}?view=shell`, {
      cache: "no-store",
    });
    const shellText = await shellRes.text();
    let shellData;
    try {
      shellData = shellText ? JSON.parse(shellText) : {};
    } catch {
      throw new Error("Server returned invalid data.");
    }
    if (shellData?.error) {
      throw new Error(
        typeof shellData.error === "string"
          ? shellData.error
          : shellData.error?.message || "Server error",
      );
    }
    if (!shellRes.ok)
      throw new Error(`Could not load data (${shellRes.status}).`);

    // Merge shell data, but keep boot loader on first load until full stats arrive.
    Object.assign(globalMetadata.value, shellData);
  } catch (err) {
    if (isInitialLoad) {
      globalMetadata.value.loadError =
        err?.message || "Could not load data. Try again.";
      globalMetadata.value.loading = false;
      return;
    }
    console.error("Failed to load shell metadata:", err);
  }

  // ── Phase 2: full stats (results, summaries, best14, leagues, etc.) ─────────
  // Heavier RPC-driven payload; completes in background after UI is visible.
  try {
    const response = await fetch(FETCH_ALL_DATA_URL, {
      cache: "no-store",
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Server returned invalid data.");
    }
    if (!response.ok) {
      throw new Error(`Could not load data (${response.status}).`);
    }
    if (data?.error) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "Server error",
      );
    }
    Object.assign(globalMetadata.value, data);
    hasInitialFullData = true;
  } catch (err) {
    globalMetadata.value.loadError =
      err?.message || "Could not load data. Try again.";
    console.error("Failed to load full stats:", err);
  } finally {
    if (isInitialLoad) {
      globalMetadata.value.loading = false;
    }
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
  {
    name: "more",
    label: "MORE",
    icon: "more",
    component: markRaw(MoreView),
  },
];

const currentSection = ref(sections[0]);

function switchSection(section) {
  triggerHapticFeedback();
  currentSection.value = section || sections[0];
}

const visibleSections = computed(() => sections);

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
        scheduleGlobalMetadataReload();
      })
      .subscribe(),
  );
});
onBeforeUnmount(() => {
  if (reloadDebounceTimer) {
    clearTimeout(reloadDebounceTimer);
    reloadDebounceTimer = null;
  }
  supabaseChannels.forEach((ch) => supabase.removeChannel(ch));
  window.removeEventListener("scroll", handleScroll);
});
</script>

<template>
  <div
    class="app-shell"
    :data-theme="theme"
    :class="{ 'chrome-hidden': chromeHidden }"
  >
    <div
      v-if="globalMetadata.loadError && !globalMetadata.loading"
      class="app-load-error"
      role="alert"
    >
      <span>{{ globalMetadata.loadError }}</span>
      <button
        type="button"
        class="app-load-error__retry"
        @click="loadGlobalMetadata"
      >
        Retry
      </button>
    </div>
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
            :selected-competition-id="selectedCompetitionId"
            @navigate="handleNavigate"
          ></component>
        </transition>
      </div>
    </main>

    <nav class="bottom-nav" aria-label="Primary">
      <button
        v-for="section in visibleSections"
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
    opacity 320ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 320ms cubic-bezier(0.23, 1, 0.32, 1);
  will-change: opacity, transform;
}
.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.app-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.5rem 1rem;
  background: color-mix(in srgb, var(--danger, #c44) 18%, transparent);
  color: var(--text, #eee);
  font-size: 0.85rem;
  border-bottom: 1px solid var(--line, #333);
}

.app-load-error__retry {
  flex-shrink: 0;
  border: 1px solid var(--line, #444);
  background: var(--bg, #111);
  color: var(--text, #eee);
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.app-load-error__retry:hover {
  opacity: 0.9;
}

.menu-dots {
  display: none;
  width: 20px;
  height: 20px;
  justify-content: center;
  align-items: center;
}

.bottom-nav {
  justify-content: center;
}

.bottom-nav-link {
  max-width: none;
}
</style>
