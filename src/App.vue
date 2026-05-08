<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from "vue";
import { useTheme } from "./composables/useTheme";
import { useSession } from "./composables/useSession";
import { useRoute, useRouter } from "vue-router";
import NavIcon from "./components/NavIcon.vue";
import AppDialog from "./components/AppDialog.vue";
import SignInForm from "./components/SignInForm.vue";
import { triggerHapticFeedback } from "./utils/haptics";
import { supabase } from "./lib/supabase";
import { FETCH_ALL_DATA_URL, SUPABASE_ANON_KEY } from "./lib/supabaseConfig.js";
const { user, loading: sessionLoading, signOut } = useSession();
const showSignIn = ref(false);
const route = useRoute();
const router = useRouter();

const { theme } = useTheme();
const chromeHidden = ref(false);
const globalMetadata = ref({
  api_version: null,
  defaults: {
    results_season_id: null,
  },
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

let reloadDebounceTimer = null;
let cachedSeasonParam = "";
let lastSeasonParamLookupMs = 0;
const SEASON_PARAM_CACHE_MS = 5 * 60 * 1000;

async function getPreferredSeasonParam() {
  const now = Date.now();
  if (
    cachedSeasonParam &&
    now - lastSeasonParamLookupMs < SEASON_PARAM_CACHE_MS
  ) {
    return cachedSeasonParam;
  }

  try {
    const { data, error } = await supabase
      .from("seasons")
      .select("start_year, is_active")
      .order("start_year", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      const active = data.find((s) => s.is_active) || data[0];
      cachedSeasonParam = active?.start_year ? String(active.start_year) : "";
      lastSeasonParamLookupMs = now;
      return cachedSeasonParam;
    }
  } catch {
    // Fallback to unscoped fetch when season lookup fails.
  }

  cachedSeasonParam = "";
  lastSeasonParamLookupMs = now;
  return "";
}

function buildFetchAllDataUrl(baseUrl, seasonParam) {
  if (!seasonParam) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set("season", seasonParam);
  return url.toString();
}

function scheduleGlobalMetadataReload() {
  if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
  reloadDebounceTimer = setTimeout(() => {
    reloadDebounceTimer = null;
    loadGlobalMetadata();
  }, 450);
}

async function loadGlobalMetadata() {
  globalMetadata.value.loading = true;
  globalMetadata.value.loadError = "";
  try {
    const requestUrl = FETCH_ALL_DATA_URL;

    const response = await fetch(requestUrl, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Server returned invalid data.");
    }
    if (data?.error) {
      const msg =
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "Server error";
      throw new Error(msg);
    }
    if (!response.ok) {
      throw new Error(`Could not load data (${response.status}).`);
    }

    if (!data || typeof data !== "object" || !Array.isArray(data.seasons)) {
      throw new Error(
        "Server contract invalid: missing required payload sections.",
      );
    }

    if (data.api_version && data.api_version !== "contract-v1") {
      throw new Error(`Unsupported API contract: ${data.api_version}`);
    }

    Object.assign(globalMetadata.value, data);
  } catch (err) {
    globalMetadata.value.loadError =
      err?.message || "Could not load data. Try again.";
    console.error("Failed to load global metadata:", err);
  } finally {
    globalMetadata.value.loading = false;
  }
}

// ...existing code...

const sections = [
  { name: "home", label: "Home", icon: "home", path: "/" },
  { name: "stats", label: "Stats", icon: "results", path: "/stats" },
  { name: "handicaps", label: "Handicaps", icon: "users", path: "/handicaps" },
  { name: "rscup", label: "RS CUP", icon: "trophy", path: "/rscup" },
];

const statsRouteNames = new Set(["stats", "results", "leagues", "best14"]);
const selectedCompetitionId = ref(null);

const selectedSeason = computed(() => {
  const seasons = Array.isArray(globalMetadata.value?.seasons)
    ? globalMetadata.value.seasons
    : [];
  if (seasons.length === 0) return null;
  return (
    seasons.find((season) => season?.is_current) ||
    seasons.find((season) => season?.is_active) ||
    seasons[0]
  );
});

const seasonHasResultsView = (season) => {
  if (!season) return false;
  const dashboard = globalMetadata.value?.dashboard || {};
  const byId = dashboard?.[String(season.id)];
  const byYear = dashboard?.[String(season.start_year)];
  const dash = byId && typeof byId === "object" ? byId : byYear;
  const resultsView =
    dash && typeof dash === "object" ? dash.results_view : null;
  if (!resultsView || typeof resultsView !== "object") return false;
  const comps = Array.isArray(resultsView.competitions)
    ? resultsView.competitions
    : [];
  return comps.length > 0;
};

const selectedResultsSeason = computed(() => {
  const seasons = Array.isArray(globalMetadata.value?.seasons)
    ? globalMetadata.value.seasons
    : [];
  if (seasons.length === 0) return null;

  // Default to the latest active/current season whenever it has usable results.
  if (seasonHasResultsView(selectedSeason.value)) {
    return selectedSeason.value;
  }

  const preferredId = String(
    globalMetadata.value?.defaults?.results_season_id || "",
  );
  if (preferredId) {
    const preferred = seasons.find(
      (season) => String(season?.id) === preferredId,
    );
    if (preferred) return preferred;
  }

  return selectedSeason.value;
});

const currentNavName = computed(() => {
  const routeName = String(route.name || "home");
  return statsRouteNames.has(routeName) ? "stats" : routeName;
});

const currentViewProps = computed(() => {
  const routeName = String(route.name || "home");
  const props = {
    metadata: globalMetadata.value,
  };

  if (statsRouteNames.has(routeName)) {
    props.season =
      routeName === "results"
        ? selectedResultsSeason.value
        : selectedSeason.value;
  }

  if (routeName === "results" || routeName === "rscup") {
    props.selectedCompetitionId = selectedCompetitionId.value;
  }

  return props;
});

function switchSection(section) {
  triggerHapticFeedback();
  const targetPath = section?.path || "/";
  if (route.path !== targetPath) {
    router.push(targetPath);
  }
}

function handleNavigate(target) {
  if (typeof target === "string") {
    const normalized = target.toLowerCase();
    const targetSection = sections.find(
      (section) => section.name === normalized,
    );
    if (targetSection) {
      switchSection(targetSection);
      return;
    }
  }

  selectedCompetitionId.value = target || null;
  if (route.path !== "/results") {
    router.push("/results");
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

let supabaseChannels = [];

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
let hiddenAt = null;

const handleVisibilityChange = () => {
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
  } else if (document.visibilityState === "visible") {
    if (hiddenAt && Date.now() - hiddenAt > STALE_THRESHOLD_MS) {
      window.location.reload();
      return;
    }
    scheduleGlobalMetadataReload();
  }
};

// iOS PWA doesn't reliably fire visibilitychange — pageshow covers it
const handlePageShow = (e) => {
  // e.persisted means restored from bfcache (common on iOS)
  if (e.persisted) {
    window.location.reload();
    return;
  }
  scheduleGlobalMetadataReload();
};

const handleWindowFocus = () => {
  scheduleGlobalMetadataReload();
};

onMounted(() => {
  lastScrollY = window.scrollY || 0;
  window.addEventListener("scroll", handleScroll, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("focus", handleWindowFocus);
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
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("pageshow", handlePageShow);
  window.removeEventListener("focus", handleWindowFocus);
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
        <RouterView v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component
              :is="Component"
              :key="route.fullPath"
              v-bind="currentViewProps"
              @navigate="handleNavigate"
            ></component>
          </transition>
        </RouterView>
      </div>
    </main>

    <nav class="bottom-nav" aria-label="Primary">
      <button
        v-for="section in sections"
        :key="section.name"
        class="bottom-nav-link"
        :class="{ active: currentNavName === section.name }"
        @click="switchSection(section)"
      >
        <NavIcon :name="section.icon" />
        <span class="bottom-nav-label">{{ section.label }}</span>
      </button>
      <!-- ...existing nav code... -->
    </nav>

    <!-- ...existing code... -->
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
</style>
