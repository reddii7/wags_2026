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
import {
  FETCH_ALL_DATA_URL,
  SUPABASE_ANON_KEY,
  REALTIME_METADATA_TABLES,
  VAPID_PUBLIC_KEY,
  SEND_PUSH_URL,
} from "./lib/supabaseConfig.js";
const { user, loading: sessionLoading, signOut } = useSession();
const showSignIn = ref(false);
const route = useRoute();
const router = useRouter();

// Stats hub uses ?tab= for sub-views; keying RouterView on fullPath remounted the
// whole hub on every tab change and reset the season selector to defaults.
const routerViewComponentKey = computed(() =>
  String(route.name) === "stats" ? route.path : route.fullPath,
);

// Bumped together with supabase/functions/fetch-all-data BUILD_ID when you need a forced hard refresh on boot.
const CLIENT_BUILD_ID = "20260514-greenfield-v30";

const { theme } = useTheme();
const chromeHidden = ref(false);

// ── Push notifications ────────────────────────────────────────────────────────
const pushBannerVisible = ref(false);
let swRegistration = null;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function savePushSubscription(sub) {
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: "endpoint" },
  );
  if (error) console.error("[push] failed to save subscription:", error);
}

async function subscribeToPush() {
  if (!swRegistration) return;
  try {
    const sub = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await savePushSubscription(sub);
    pushBannerVisible.value = false;
    localStorage.setItem("wags-push-accepted", "1");
  } catch (err) {
    console.error("[push] subscribe failed:", err);
    // Re-show banner so user can try again
    pushBannerVisible.value = true;
    localStorage.removeItem("wags-push-accepted");
  }
}

async function dismissPushBanner() {
  pushBannerVisible.value = false;
  localStorage.setItem("wags-push-dismissed", "1");
}

async function initPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js");
    const existing = await swRegistration.pushManager.getSubscription();
    if (existing) {
      await savePushSubscription(existing);
      return;
    }
    // Only prompt if not previously dismissed and not already denied
    if (
      Notification.permission === "denied" ||
      localStorage.getItem("wags-push-dismissed") ||
      localStorage.getItem("wags-push-accepted")
    ) return;
    pushBannerVisible.value = true;
  } catch (err) {
    console.warn("[push] init failed:", err);
  }
}
// ─────────────────────────────────────────────────────────────────────────────
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

function buildFetchAllDataUrl(baseUrl, seasonParam, bustCache = false) {
  if (!seasonParam && !bustCache) return baseUrl;
  const url = new URL(baseUrl);
  if (seasonParam) url.searchParams.set("season", seasonParam);
  if (bustCache) url.searchParams.set("_", String(Date.now()));
  return url.toString();
}

function scheduleGlobalMetadataReload() {
  if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
  reloadDebounceTimer = setTimeout(() => {
    reloadDebounceTimer = null;
    loadGlobalMetadata(true);
  }, 450);
}

/** When the document was last hidden (lock / background); iOS often skips visibility, so pagehide backs this up. */
let resumeBaselineMs = 0;
let lastResumeMetadataRefreshMs = 0;
let lastFetchCompletedAt = 0;
let appMountTime = 0;
const RESUME_METADATA_DEBOUNCE_MS = 1200;
const RESUME_LONG_AWAY_MS = 2000;
const RESUME_STALE_FETCH_MS = 120_000;

function markDocumentSuspended() {
  resumeBaselineMs = Date.now();
}

/**
 * Refetch after sleep / multitask. `explicitAwayMs` is used when visibility just
 * cleared resumeBaselineMs (ms since hide). Pass null to consume resumeBaselineMs here.
 */
function runResumeMetadataRefresh(explicitAwayMs = null) {
  if (globalMetadata.value.loading) return;

  let awayMs = explicitAwayMs;
  if (awayMs == null) {
    if (resumeBaselineMs) {
      awayMs = Date.now() - resumeBaselineMs;
      resumeBaselineMs = 0;
    } else {
      awayMs = 0;
    }
  }

  const now = Date.now();
  const lastFetch = lastFetchCompletedAt || now;
  const stale = now - lastFetch > RESUME_STALE_FETCH_MS;
  const longAway = awayMs >= RESUME_LONG_AWAY_MS;
  const sinceBoot = now - (appMountTime || now);

  // Ignore spurious "visible" right after cold start (no prior hide).
  if (awayMs === 0 && sinceBoot < 3500) return;

  if (
    !longAway &&
    !stale &&
    now - lastResumeMetadataRefreshMs < RESUME_METADATA_DEBOUNCE_MS
  ) {
    return;
  }

  lastResumeMetadataRefreshMs = now;
  if (reloadDebounceTimer) {
    clearTimeout(reloadDebounceTimer);
    reloadDebounceTimer = null;
  }
  void loadGlobalMetadata(true, true);
}

function scheduleResumeMetadataRefresh(explicitAwayMs = null) {
  requestAnimationFrame(() => {
    setTimeout(() => runResumeMetadataRefresh(explicitAwayMs), 45);
  });
}

let silentMetadataRefreshPromise = null;

async function loadGlobalMetadata(silent = false, bustCache = false) {
  if (silent && silentMetadataRefreshPromise) {
    return silentMetadataRefreshPromise;
  }

  const run = async () => {
    if (!silent) {
      globalMetadata.value.loading = true;
      globalMetadata.value.loadError = "";
    }
    try {
      // Do not pass ?season= here: that scopes fetch-all-data competitions to one
      // season only, which drops prior seasons from `dashboard` (e.g. no 2025 results).
      const requestUrl = buildFetchAllDataUrl(
        FETCH_ALL_DATA_URL,
        "",
        bustCache,
      );

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
        throw new Error("Server contract invalid.");
      }

      // Never hard-reload the page on background refresh — causes white flashes and
      // retry UI loops when the network stack is not ready yet.
      if (
        !silent &&
        data.api_version &&
        data.api_version !== "contract-v1"
      ) {
        console.warn("Client out of date. Forcing update...");
        hardRefresh();
        return;
      }

      if (!silent && data.build_id && data.build_id !== CLIENT_BUILD_ID) {
        const refreshCount = parseInt(
          sessionStorage.getItem("pwa-refresh-count") || "0",
        );
        if (refreshCount >= 2) {
          console.warn(
            "Build ID mismatch persists; loading data without another hard reload.",
          );
          sessionStorage.removeItem("pwa-refresh-count");
        } else {
          console.warn(
            `Build mismatch: server=${data.build_id}, client=${CLIENT_BUILD_ID}. Forcing update...`,
          );
          sessionStorage.setItem(
            "pwa-refresh-count",
            (refreshCount + 1).toString(),
          );
          hardRefresh();
          return;
        }
      } else {
        sessionStorage.removeItem("pwa-refresh-count");
      }

      if (silent && data.build_id && data.build_id !== CLIENT_BUILD_ID) {
        console.info(
          "[metadata] build_id differs on silent refresh; applying payload without reload.",
          { server: data.build_id, client: CLIENT_BUILD_ID },
        );
      }

      const payload =
        data.api_version != null && String(data.api_version).trim() !== ""
          ? data
          : { ...data, api_version: "contract-v1" };

      Object.assign(globalMetadata.value, payload);
      globalMetadata.value.loadError = "";
    } catch (err) {
      if (!silent) {
        globalMetadata.value.loadError =
          err?.message || "Could not load data. Try again.";
      } else {
        console.warn("Silent metadata refresh failed:", err?.message || err);
      }
      console.error("Failed to load global metadata:", err);
    } finally {
      globalMetadata.value.loading = false;
      lastFetchCompletedAt = Date.now();
    }
  };

  if (silent) {
    silentMetadataRefreshPromise = run().finally(() => {
      silentMetadataRefreshPromise = null;
    });
    return silentMetadataRefreshPromise;
  }

  await run();
}

async function hardRefresh() {
  globalMetadata.value.loading = true;
  globalMetadata.value.loadError = "Updating to latest version...";

  // Store a flag to prevent reload loops
  sessionStorage.setItem("forced-refreshing", "1");

  // Unregister all service workers to clear cache
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    } catch (err) {
      console.error("Failed to unregister SW:", err);
    }
  }
  // Clear all caches
  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch (err) {
      console.error("Failed to clear caches:", err);
    }
  }
  // Hard reload by appending a cache-busting timestamp to the URL.
  // This is the only way to force iOS Safari to fetch a fresh index.html for a Home Screen icon.
  const url = new URL(window.location.origin);
  url.searchParams.set("t", Date.now().toString());
  // Using href instead of replace is often more effective at breaking the standalone cache
  window.location.href = url.toString();
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
  if (section?.name === "stats" && route.path === "/stats") {
    if (route.query.tab) {
      router.replace("/stats");
    }
    return;
  }
  if (route.path !== targetPath) {
    router.push(targetPath);
  }
}

const STATS_HUB_TAB_IDS = new Set([
  "results",
  "leagues",
  "best14",
  "winners",
]);

function handleNavigate(target) {
  if (target && typeof target === "object" && !Array.isArray(target)) {
    const section = String(target.section || "").toLowerCase();
    const tab = String(target.tab || "").toLowerCase();
    if (section === "stats") {
      if (tab && STATS_HUB_TAB_IDS.has(tab)) {
        if (tab === "results") {
          router.push("/stats");
        } else {
          router.push({ path: "/stats", query: { tab } });
        }
      } else {
        router.push("/stats");
      }
      return;
    }
    const targetSection = sections.find((s) => s.name === section);
    if (targetSection) {
      switchSection(targetSection);
      return;
    }
  }

  if (typeof target === "string") {
    const normalized = target.toLowerCase();
    const colon = normalized.indexOf(":");
    if (colon > 0) {
      const base = normalized.slice(0, colon);
      const rest = normalized.slice(colon + 1);
      if (base === "stats" && STATS_HUB_TAB_IDS.has(rest)) {
        if (rest === "results") {
          router.push("/stats");
        } else {
          router.push({ path: "/stats", query: { tab: rest } });
        }
        return;
      }
    }
    const targetSection = sections.find(
      (section) => section.name === normalized,
    );
    if (targetSection) {
      switchSection(targetSection);
      return;
    }
  }

  const compId = typeof target === "string" ? target : null;
  selectedCompetitionId.value = compId || null;
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

const handleVisibilityChange = () => {
  if (document.visibilityState === "hidden") {
    markDocumentSuspended();
    return;
  }
  if (globalMetadata.value.loading) return;
  const awayMs =
    resumeBaselineMs > 0 ? Date.now() - resumeBaselineMs : 0;
  resumeBaselineMs = 0;
  scheduleResumeMetadataRefresh(awayMs);
};

// iOS home screen / Web Clip: bfcache restores and some wake paths only hit pageshow.
const handlePageShow = (e) => {
  if (e.persisted) {
    if (sessionStorage.getItem("forced-refreshing")) {
      sessionStorage.removeItem("forced-refreshing");
      return;
    }
    scheduleResumeMetadataRefresh(null);
    return;
  }
  if (globalMetadata.value.loading) return;
  scheduleResumeMetadataRefresh(null);
};

const handleWindowFocus = () => {
  if (globalMetadata.value.loading) return;
  scheduleResumeMetadataRefresh(null);
};

const handlePageHide = () => {
  markDocumentSuspended();
};

const handleDocumentFreeze = () => {
  markDocumentSuspended();
};

const handleDocumentResume = () => {
  if (globalMetadata.value.loading) return;
  scheduleResumeMetadataRefresh(null);
};

const handleWindowOnline = () => {
  if (globalMetadata.value.loading) return;
  scheduleResumeMetadataRefresh(null);
};

onMounted(() => {
  appMountTime = Date.now();
  lastFetchCompletedAt = Date.now();
  lastScrollY = window.scrollY || 0;
  window.addEventListener("scroll", handleScroll, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange, false);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("focus", handleWindowFocus, true);
  window.addEventListener("online", handleWindowOnline);
  document.addEventListener("freeze", handleDocumentFreeze);
  document.addEventListener("resume", handleDocumentResume);
  handleScroll();
  loadGlobalMetadata().then(() => {
    // Init push after first load so the permission prompt doesn't compete with app boot.
    setTimeout(initPush, 1500);
  });

  // Realtime: Postgres tables that should trigger a metadata refresh.
  supabaseChannels = REALTIME_METADATA_TABLES.map((table) =>
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
  window.removeEventListener("pagehide", handlePageHide);
  window.removeEventListener("pageshow", handlePageShow);
  window.removeEventListener("focus", handleWindowFocus, true);
  window.removeEventListener("online", handleWindowOnline);
  document.removeEventListener("freeze", handleDocumentFreeze);
  document.removeEventListener("resume", handleDocumentResume);
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
      <div style="display: flex; gap: 8px; margin-top: 8px">
        <button
          type="button"
          class="app-load-error__retry"
          @click="loadGlobalMetadata"
        >
          Retry
        </button>
        <button
          type="button"
          class="app-load-error__retry"
          @click="hardRefresh"
          style="opacity: 0.7"
        >
          Clear Cache & Reload
        </button>
      </div>
    </div>
    <main class="app-main">
      <!-- Spinner overlays the view — RouterView stays mounted always -->
      <div v-if="globalMetadata.loading" class="app-boot-loader">
        <div class="loader-content">
          <div class="spinner"></div>
          <p class="loader-text">WAGS</p>
        </div>
      </div>

      <div v-if="globalMetadata.api_version" class="view-frame">
        <RouterView v-slot="{ Component }">
          <!-- Avoid mode="out-in": iOS standalone/WebKit can leave the first enter stuck at opacity 0 until the next navigation. -->
          <transition name="page-fade">
            <component
              :is="Component"
              :key="routerViewComponentKey"
              v-bind="currentViewProps"
              @navigate="handleNavigate"
            ></component>
          </transition>
        </RouterView>
      </div>
    </main>

    <!-- Push notification opt-in banner -->
    <transition name="push-banner-slide">
      <div v-if="pushBannerVisible" class="push-banner" role="dialog" aria-label="Enable notifications">
        <div class="push-banner__content">
          <span class="push-banner__text">Get notified when results are in</span>
          <div class="push-banner__actions">
            <button class="push-banner__allow" @click="subscribeToPush">Allow</button>
            <button class="push-banner__dismiss" @click="dismissPushBanner">Not now</button>
          </div>
        </div>
      </div>
    </transition>

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

/* Push notification opt-in banner */
.push-banner {
  position: fixed;
  bottom: 68px; /* sits just above the bottom nav */
  left: 0;
  right: 0;
  z-index: 200;
  padding: 0 12px 8px;
}

.push-banner__content {
  background: var(--surface, #2c2c2e);
  border: 1px solid var(--line, #3a3a3c);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
}

.push-banner__text {
  font-size: 0.88rem;
  color: var(--text, #f0f0f0);
  flex: 1;
  line-height: 1.35;
}

.push-banner__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.push-banner__allow {
  background: var(--accent, #30d158);
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.push-banner__dismiss {
  background: transparent;
  color: var(--muted, #888);
  border: 1px solid var(--line, #3a3a3c);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.85rem;
  cursor: pointer;
}

.push-banner-slide-enter-active,
.push-banner-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.push-banner-slide-enter-from,
.push-banner-slide-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
