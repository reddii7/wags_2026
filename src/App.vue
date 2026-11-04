<script setup>
import {
  ref,
  computed,
  watch,
  onBeforeUnmount,
  onMounted,
  onBeforeMount,
} from "vue";
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
const CLIENT_BUILD_ID = "20261029-home-hub-v69";

const { theme, toggleTheme } = useTheme();
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

const loadedSummerIds = new Set();
const summerInflight = new Map();

function buildFetchAllDataUrl(baseUrl, { view, campaign, bustCache } = {}) {
  const url = new URL(baseUrl);
  if (view) url.searchParams.set("view", view);
  if (campaign) url.searchParams.set("season", String(campaign));
  if (bustCache) url.searchParams.set("_", String(Date.now()));
  return url.toString();
}

function mergeMetadata(data) {
  const meta = globalMetadata.value;
  if (Array.isArray(data.seasons) && data.seasons.length) {
    meta.seasons = data.seasons;
  }
  if (data.defaults && typeof data.defaults === "object" && data.scope !== "summer") {
    meta.defaults = { ...(meta.defaults || {}), ...data.defaults };
  }
  for (const key of [
    "dashboard",
    "best14",
    "leagues",
    "winners",
    "awards",
    "handicap_board",
  ]) {
    if (data[key] && typeof data[key] === "object") {
      meta[key] = { ...(meta[key] || {}), ...data[key] };
    }
  }
  if (Array.isArray(data.profiles) && data.profiles.length) {
    const byId = new Map(
      (meta.profiles || []).map((profile) => [String(profile.id), profile]),
    );
    for (const profile of data.profiles) {
      const id = String(profile.id);
      byId.set(id, { ...(byId.get(id) || {}), ...profile });
    }
    meta.profiles = [...byId.values()];
  }
  if (Array.isArray(data.matchplay_tournaments)) {
    const campaignId = String(data.campaign_id || "");
    const keep = (meta.matchplay_tournaments || []).filter(
      (row) => String(row.campaign_id || "") !== campaignId,
    );
    meta.matchplay_tournaments = [...keep, ...data.matchplay_tournaments];
  }
  if (Array.isArray(data.matchplay_matches)) {
    const cupIds = new Set(
      (data.matchplay_tournaments || []).map((row) => String(row.id)),
    );
    const keep = (meta.matchplay_matches || []).filter(
      (row) => !cupIds.has(String(row.tournament_id || "")),
    );
    meta.matchplay_matches = [...keep, ...data.matchplay_matches];
  }
  if (data.api_version) meta.api_version = data.api_version;
  if (data.campaign_id) loadedSummerIds.add(String(data.campaign_id));
}

async function fetchScope(view, campaign, silent, bustCache) {
  const requestUrl = buildFetchAllDataUrl(FETCH_ALL_DATA_URL, {
    view,
    campaign,
    bustCache,
  });
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
  if (
    !data ||
    typeof data !== "object" ||
    (view === "winter" && !Array.isArray(data.seasons))
  ) {
    throw new Error("Server contract invalid.");
  }
  if (!silent && data.api_version && data.api_version !== "contract-v1") {
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
      sessionStorage.setItem("pwa-refresh-count", (refreshCount + 1).toString());
      hardRefresh();
      return;
    }
  } else if (!silent) {
    sessionStorage.removeItem("pwa-refresh-count");
  }
  const payload =
    data.api_version != null && String(data.api_version).trim() !== ""
      ? data
      : { ...data, api_version: "contract-v1" };
  mergeMetadata(payload);
}

async function ensureSummerCampaign(campaignId, { force = false } = {}) {
  const id = String(campaignId || "");
  if (!id) return;
  if (!force && loadedSummerIds.has(id)) return;
  if (!force && summerInflight.has(id)) return summerInflight.get(id);
  const run = (async () => {
    globalMetadata.value.summerLoading = true;
    globalMetadata.value.summerError = "";
    try {
      await fetchScope("summer", id, true, force);
      globalMetadata.value.summerError = "";
    } catch (err) {
      globalMetadata.value.summerError =
        err?.message || "Could not load summer.";
      console.error("Failed to load summer:", err);
    } finally {
      globalMetadata.value.summerLoading = false;
      summerInflight.delete(id);
    }
  })();
  summerInflight.set(id, run);
  return run;
}

function summerCampaignForRoute() {
  const seasons = globalMetadata.value.seasons || [];
  const raw = String(route.query.season || "").trim();
  if (raw) {
    const match = seasons.find(
      (season) =>
        String(season?.id) === raw || String(season?.start_year) === raw,
    );
    if (match && String(match.kind || "") === "winter_reduced") return null;
    if (match) return String(match.id);
  }
  const open = seasons.find(
    (season) =>
      String(season?.kind || "") === "summer_main" &&
      String(season?.status || "").toLowerCase() === "open",
  );
  const any = seasons.find(
    (season) => String(season?.kind || "") === "summer_main",
  );
  return String((open || any)?.id || "");
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
let suspendRecordedMs = 0;
let lastResumeMetadataRefreshMs = 0;
let lastFetchCompletedAt = 0;
let appMountTime = 0;
const RESUME_METADATA_DEBOUNCE_MS = 700;
const RESUME_LONG_AWAY_MS = 800;
const RESUME_STALE_FETCH_MS = 45_000;

/** Dedupe bursts from visibility + focus + pointer firing together */
const FOREGROUND_BURST_COOLDOWN_MS = 4000;

let wakeBurstTimers = [];
let lastForegroundBurstMs = 0;

function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function clearWakeBurstTimers() {
  wakeBurstTimers.forEach((id) => clearTimeout(id));
  wakeBurstTimers = [];
}

/**
 * iOS WKWeb often drops or serves a dead first fetch after thaw; stagger several
 * bust-cache loads so at least one hits a live radio stack without full reload().
 */
function scheduleForegroundBurst() {
  if (!globalMetadata.value.api_version) return;
  const now = Date.now();
  if (now - lastForegroundBurstMs < FOREGROUND_BURST_COOLDOWN_MS) return;
  lastForegroundBurstMs = now;
  suspendRecordedMs = 0;

  clearWakeBurstTimers();
  const run = () => {
    void loadGlobalMetadata(true, true);
  };
  wakeBurstTimers.push(setTimeout(run, 80));
  wakeBurstTimers.push(setTimeout(run, 900));
  wakeBurstTimers.push(setTimeout(run, 2400));
}

function markDocumentSuspended() {
  const t = Date.now();
  resumeBaselineMs = t;
  suspendRecordedMs = t;
}

/**
 * Refetch after sleep / multitask. `explicitAwayMs` consumes `resumeBaselineMs` when
 * passed from visibility. `bypassDebounce` forces a bust-cache fetch for definitive
 * foreground signals (WKWeb focus without visibility, visibility online, resume).
 */
function runResumeMetadataRefresh(
  explicitAwayMs = null,
  { bypassDebounce = false } = {},
) {
  if (globalMetadata.value.loading && !globalMetadata.value.api_version)
    return;

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
    !bypassDebounce &&
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
  if (bypassDebounce) {
    scheduleForegroundBurst();
    return;
  }
  void loadGlobalMetadata(true, true);
}

function scheduleResumeMetadataRefresh(
  explicitAwayMs = null,
  options = {},
) {
  requestAnimationFrame(() => {
    setTimeout(() => runResumeMetadataRefresh(explicitAwayMs, options), 45);
  });
}

let silentMetadataRefreshPromise = null;

async function loadGlobalMetadata(silent = false, bustCache = false) {
  if (silent && silentMetadataRefreshPromise && !bustCache) {
    return silentMetadataRefreshPromise;
  }

  const run = async () => {
    if (!silent) {
      globalMetadata.value.loading = true;
      globalMetadata.value.loadError = "";
    }
    try {
      await fetchScope("winter", null, silent, bustCache);
      globalMetadata.value.loadError = "";
      if (silent && loadedSummerIds.size) {
        for (const id of [...loadedSummerIds]) {
          await ensureSummerCampaign(id, { force: true });
        }
      }
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
    const p = run().finally(() => {
      if (silentMetadataRefreshPromise === p) {
        silentMetadataRefreshPromise = null;
      }
    });
    silentMetadataRefreshPromise = p;
    return p;
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



/** Live payload from Supabase (fetch-all-data edge function → `globalMetadata`). */
function loadDataFromSupabase(...args) {
  return loadGlobalMetadata(...args);
}

const winterSections = [
  { name: "week", label: "This week", icon: "scores", path: "/" },
  { name: "best10", label: "Best 10", icon: "best14", path: "/" },
  { name: "summer", label: "Summer", icon: "trophy", path: "/stats" },
];

const summerSections = [
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

const summerRouteNames = new Set([
  "stats",
  "results",
  "leagues",
  "best14",
  "handicaps",
  "rscup",
]);

const onSummerRoute = computed(() =>
  summerRouteNames.has(String(route.name || "")),
);

const sections = computed(() =>
  onSummerRoute.value ? summerSections : winterSections,
);

const currentNavName = computed(() => {
  const routeName = String(route.name || "home");
  if (onSummerRoute.value) {
    return statsRouteNames.has(routeName) ? "stats" : routeName;
  }
  if (String(route.query.tab || "").toLowerCase() === "best10") return "best10";
  return "week";
});

const openSummerSeason = computed(() => {
  const seasons = Array.isArray(globalMetadata.value?.seasons)
    ? globalMetadata.value.seasons
    : [];
  const raw = String(route.query.season || "").trim();
  if (raw) {
    const match = seasons.find(
      (season) =>
        String(season?.id) === raw || String(season?.start_year) === raw,
    );
    if (match && String(match.kind || "") !== "winter_reduced") return match;
  }
  return (
    seasons.find(
      (season) =>
        String(season?.kind || "") === "summer_main" &&
        String(season?.status || "").toLowerCase() === "open",
    ) ||
    seasons.find((season) => String(season?.kind || "") === "summer_main") ||
    null
  );
});

watch(
  () => [route.path, route.query.mode],
  () => {
    if (
      route.path === "/" &&
      String(route.query.mode || "").toLowerCase() === "summer"
    ) {
      router.replace("/stats");
    }
  },
  { immediate: true },
);

watch(
  () => [
    route.name,
    route.query.season,
    (globalMetadata.value.seasons || []).length,
  ],
  () => {
    if (!summerRouteNames.has(String(route.name || ""))) return;
    const id = summerCampaignForRoute();
    if (id) void ensureSummerCampaign(id);
  },
  { immediate: true },
);

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

  if (routeName === "handicaps" || routeName === "rscup") {
    props.season = openSummerSeason.value;
  }

  if (routeName === "results" || routeName === "rscup") {
    props.selectedCompetitionId = selectedCompetitionId.value;
  }

  return props;
});

function onToggleTheme() {
  triggerHapticFeedback();
  toggleTheme();
}

function findSection(name) {
  return (
    winterSections.find((section) => section.name === name) ||
    summerSections.find((section) => section.name === name)
  );
}

function switchSection(section) {
  triggerHapticFeedback();
  if (section?.name === "week" || section?.name === "home") {
    if (route.path !== "/" || route.query.tab || route.query.mode) {
      router.push({ path: "/" });
    }
    return;
  }
  if (section?.name === "best10") {
    if (
      route.path !== "/" ||
      String(route.query.tab || "").toLowerCase() !== "best10"
    ) {
      router.push({ path: "/", query: { tab: "best10" } });
    }
    return;
  }
  if (section?.name === "summer") {
    if (route.path !== "/stats") router.push("/stats");
    return;
  }
  if (section?.name === "stats" && route.path === "/stats") {
    if (route.query.tab || route.query.season) router.replace("/stats");
    return;
  }
  const targetPath = section?.path || "/";
  if (route.path !== targetPath) router.push(targetPath);
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
    const seasonId =
      target.seasonId != null && String(target.seasonId).trim() !== ""
        ? String(target.seasonId).trim()
        : "";
    const mode =
      target.mode != null && String(target.mode).trim() !== ""
        ? String(target.mode).trim().toLowerCase()
        : "";

    if (section === "stats") {
      const query = {};
      if (tab && STATS_HUB_TAB_IDS.has(tab) && tab !== "results") {
        query.tab = tab;
      }
      if (seasonId) query.season = seasonId;
      if (Object.keys(query).length) {
        router.push({ path: "/stats", query });
      } else {
        router.push("/stats");
      }
      return;
    }

    if (section === "home") {
      if (mode === "winter" || mode === "summer") {
        const query = { mode };
        if (mode === "winter" && (tab === "week" || tab === "best10")) {
          query.tab = tab;
        }
        router.push({ path: "/", query });
      } else if (route.path !== "/" || route.query.mode) {
        router.push({ path: "/" });
      }
      return;
    }

    const targetSection = findSection(section);
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
    const targetSection = findSection(normalized);
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

/** Home-screen Web Clip only: force full navigation after real sleep — matches swipe-kill freshness. */
const STANDALONE_VISIBLE_RELOAD_AFTER_MS = 4500;

const handleVisibilityChange = () => {
  if (document.visibilityState === "hidden") {
    markDocumentSuspended();
    return;
  }
  if (globalMetadata.value.loading && !globalMetadata.value.api_version) return;

  const now = Date.now();
  const awayFromBaseline =
    resumeBaselineMs > 0 ? now - resumeBaselineMs : 0;
  const awayFromSuspend = suspendRecordedMs
    ? now - suspendRecordedMs
    : 0;
  const effectiveAway = Math.max(awayFromBaseline, awayFromSuspend);

  if (
    isStandalonePwa() &&
    effectiveAway >= STANDALONE_VISIBLE_RELOAD_AFTER_MS &&
    globalMetadata.value.api_version
  ) {
    const dedupeKey = "wags-standalone-visible-reload";
    const prev = Number(sessionStorage.getItem(dedupeKey) || 0);
    if (now - prev > 12_000) {
      sessionStorage.setItem(dedupeKey, String(now));
      clearWakeBurstTimers();
      resumeBaselineMs = 0;
      suspendRecordedMs = 0;
      window.location.reload();
      return;
    }
  }

  resumeBaselineMs = 0;
  scheduleResumeMetadataRefresh(effectiveAway, {
    bypassDebounce: true,
  });
};

// iOS home screen / Web Clip: bfcache restores and some wake paths only hit pageshow.
const handlePageShow = (e) => {
  if (e.persisted) {
    if (sessionStorage.getItem("forced-refreshing")) {
      sessionStorage.removeItem("forced-refreshing");
      return;
    }
    scheduleResumeMetadataRefresh(null, { bypassDebounce: true });
    return;
  }
  if (globalMetadata.value.loading && !globalMetadata.value.api_version) return;
  scheduleResumeMetadataRefresh(null, { bypassDebounce: true });
};

const handleWindowFocus = () => {
  if (globalMetadata.value.loading && !globalMetadata.value.api_version) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible")
    return;
  scheduleResumeMetadataRefresh(null, { bypassDebounce: true });
};

/** Rare: no visibility/focus after lock; next touch retries once from standalone clip. */
const wakePointerOpts = { capture: true, passive: true };
function handleWakePointer() {
  if (!isStandalonePwa()) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible")
    return;
  const now = Date.now();
  if (!suspendRecordedMs) return;
  if (now - suspendRecordedMs < 1500) return;
  if (now - suspendRecordedMs > 30 * 60_000) {
    suspendRecordedMs = 0;
    return;
  }
  suspendRecordedMs = 0;
  scheduleForegroundBurst();
}

const handlePageHide = () => {
  markDocumentSuspended();
};

const handleWindowBlur = () => {
  markDocumentSuspended();
};

const handleDocumentFreeze = () => {
  markDocumentSuspended();
};

const handleDocumentResume = () => {
  if (globalMetadata.value.loading && !globalMetadata.value.api_version) return;
  scheduleResumeMetadataRefresh(null, { bypassDebounce: true });
};

const handleWindowOnline = () => {
  if (globalMetadata.value.loading && !globalMetadata.value.api_version) return;
  scheduleResumeMetadataRefresh(null, { bypassDebounce: true });
};

onBeforeMount(() => {
  appMountTime = Date.now();
  lastFetchCompletedAt = Date.now();
  void loadDataFromSupabase(false, false);
});

onMounted(() => {
  lastScrollY = window.scrollY || 0;
  window.addEventListener("scroll", handleScroll, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange, true);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("focus", handleWindowFocus, true);
  window.addEventListener("online", handleWindowOnline);
  document.addEventListener("freeze", handleDocumentFreeze);
  document.addEventListener("resume", handleDocumentResume);
  document.addEventListener("pointerdown", handleWakePointer, wakePointerOpts);
  handleScroll();

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
  clearWakeBurstTimers();
  supabaseChannels.forEach((ch) => supabase.removeChannel(ch));
  window.removeEventListener("scroll", handleScroll);
  document.removeEventListener("visibilitychange", handleVisibilityChange, true);
  document.removeEventListener("pointerdown", handleWakePointer, wakePointerOpts);
  window.removeEventListener("pagehide", handlePageHide);
  window.removeEventListener("blur", handleWindowBlur);
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
    :class="{
      'chrome-hidden': chromeHidden,
    }"
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

    <button
      v-if="onSummerRoute"
      type="button"
      class="theme-switch theme-switch--fixed"
      :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="onToggleTheme"
    >
      {{ theme === "dark" ? "Light" : "Dark" }}
    </button>

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
    </nav>
  </div>
</template>

<style>
.bottom-nav {
  background: var(--nav-glass-bg) !important;
}

.theme-switch {
  flex: 0 0 auto;
  border: 0.5px solid var(--line, rgba(255, 255, 255, 0.14));
  background: var(--surface-2);
  color: var(--text);
  border-radius: 999px;
  padding: 0.32rem 0.72rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.04em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.theme-switch--fixed {
  position: fixed;
  z-index: 40;
  top: calc(env(safe-area-inset-top, 0px) + 0.55rem);
  right: 0.85rem;
  background: var(--bg);
  padding: 0.38rem 0.85rem;
  font-size: 0.82rem;
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
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

.app-load-error__retry:hover {
  opacity: 0.9;
}

</style>
