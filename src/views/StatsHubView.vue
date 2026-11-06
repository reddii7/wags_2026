<script setup>
import { ref, computed, markRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { triggerHapticFeedback } from "../utils/haptics";
import AppDialog from "../components/AppDialog.vue";
import LeaguesView from "./LeaguesView.vue";
import Best14View from "./Best14View.vue";
import ResultsView from "./ResultsView.vue";
import WinnersTable from "./WinnersTable.vue";

const route = useRoute();
const router = useRouter();

const STATS_TAB_IDS = ["results", "leagues", "best14", "winners"];

const props = defineProps({
  metadata: { type: Object, required: true },
});

function sortSeasonsForPicker(list) {
  return [...list].sort((a, b) => {
    const ya = Number(a?.start_year) || 0;
    const yb = Number(b?.start_year) || 0;
    if (ya !== yb) return yb - ya;
    const ka = String(a?.kind || "");
    const kb = String(b?.kind || "");
    if (ka !== kb) {
      if (ka === "summer_main") return -1;
      if (kb === "summer_main") return 1;
    }
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

function seasonsForPicker(metaSeasons) {
  const all = Array.isArray(metaSeasons) ? metaSeasons : [];
  const usable = all.filter(
    (s) => String(s?.status || "").toLowerCase() !== "draft",
  );
  return sortSeasonsForPicker(usable.length ? usable : all);
}

const seasons = ref(seasonsForPicker(props.metadata?.seasons));
const selectedSeasonId = ref(null);
const seasonPickerOpen = ref(false);

const tabs = [
  { id: "results", label: "RESULTS", component: markRaw(ResultsView) },
  { id: "leagues", label: "LEAGUES", component: markRaw(LeaguesView) },
  { id: "best14", label: "BEST 14", component: markRaw(Best14View) },
  { id: "winners", label: "CHAMPS", component: markRaw(WinnersTable) },
];

const activeTabId = ref(tabs[0].id);
const activeComponent = computed(
  () => tabs.find((t) => t.id === activeTabId.value)?.component,
);

function applyTabFromRoute() {
  const raw = route.query.tab;
  if (typeof raw === "string" && STATS_TAB_IDS.includes(raw)) {
    activeTabId.value = raw;
    return;
  }
  activeTabId.value = "results";
  if (typeof raw === "string" && raw && !STATS_TAB_IDS.includes(raw)) {
    router.replace("/stats");
  }
}

watch(() => route.query.tab, applyTabFromRoute, { immediate: true });

function resolveSeasonFromQuery(metaSeasons) {
  const raw = route.query.season;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const wanted = raw.trim();
  return (
    metaSeasons.find((s) => String(s?.id) === wanted) ||
    metaSeasons.find((s) => String(s?.start_year) === wanted) ||
    null
  );
}

// Hydrate seasons from metadata and set default selected season robustly
watch(
  [() => props.metadata, () => route.query.season],
  ([meta]) => {
    if (meta && Array.isArray(meta.seasons)) {
      seasons.value = seasonsForPicker(meta.seasons);
      const fromQuery = resolveSeasonFromQuery(seasons.value);
      if (fromQuery) {
        selectedSeasonId.value = fromQuery.id;
        return;
      }
      // Stats hub defaults to summer (winter standings live on Home → Winter).
      const openSummer = seasons.value.find(
        (s) =>
          String(s?.kind || "") === "summer_main" &&
          String(s?.status || "").toLowerCase() === "open",
      );
      const anySummer = seasons.value.find(
        (s) => String(s?.kind || "") === "summer_main",
      );
      const preferredResultsSeasonId = String(
        meta?.defaults?.results_season_id || "",
      );
      const preferredDefault = preferredResultsSeasonId
        ? seasons.value.find((s) => String(s?.id) === preferredResultsSeasonId)
        : null;
      const preferredSummer =
        preferredDefault &&
        String(preferredDefault?.kind || "") === "summer_main"
          ? preferredDefault
          : null;
      const current =
        openSummer ||
        preferredSummer ||
        anySummer ||
        seasons.value.find((s) => s.is_current) ||
        seasons.value.find((s) => s.is_active) ||
        preferredDefault ||
        seasons.value[0];
      if (
        !selectedSeasonId.value ||
        !seasons.value.some((s) => s.id === selectedSeasonId.value)
      ) {
        selectedSeasonId.value = current?.id;
      }
    }
  },
  { immediate: true },
);

const seasonReady = computed(() => {
  const season = selectedSeason.value;
  if (!season?.id) return false;
  const dash = props.metadata?.dashboard || {};
  const block = dash[season.id] || dash[String(season.start_year || "")];
  return Boolean(block?.results_view);
});

const selectedSeason = computed(() => {
  // Always find by id, fallback to first season
  return (
    seasons.value.find((s) => s.id === selectedSeasonId.value) ||
    seasons.value[0] ||
    null
  );
});

const seasonLabel = computed(() => {
  const season = selectedSeason.value;
  if (!season) return "Season";
  const name = String(season.name || "").trim();
  if (name) return name;
  const year = season.start_year ?? "";
  return String(season.kind || "") === "winter_reduced"
    ? `Winter ${year}`.trim()
    : `Summer ${year}`.trim();
});

// Watch for season change: reset tab if needed, ensure nav works
watch(selectedSeasonId, (newVal, oldVal) => {
  // Defensive: if new season is not found, fallback to first
  if (!seasons.value.some((s) => s.id === newVal)) {
    selectedSeasonId.value = seasons.value[0]?.id || null;
  }
  // Optionally reset tab to default if needed
  if (activeTabId.value && !tabs.some((t) => t.id === activeTabId.value)) {
    activeTabId.value = tabs[0].id;
  }
});

function statsQuery(extra = {}) {
  const query = { ...extra };
  const season =
    selectedSeasonId.value != null && String(selectedSeasonId.value).trim() !== ""
      ? String(selectedSeasonId.value).trim()
      : "";
  if (season && typeof route.query.season === "string" && route.query.season) {
    query.season = season;
  }
  return query;
}

function setTab(id) {
  triggerHapticFeedback();
  activeTabId.value = id;
  if (id === "results") {
    const query = statsQuery();
    if (Object.keys(query).length) {
      router.replace({ path: "/stats", query });
    } else {
      router.replace("/stats");
    }
  } else {
    router.replace({ path: "/stats", query: statsQuery({ tab: id }) });
  }
}

function openSeasonPicker() {
  triggerHapticFeedback();
  seasonPickerOpen.value = true;
}

function pickSeason(seasonId) {
  triggerHapticFeedback();
  selectedSeasonId.value = seasonId;
  seasonPickerOpen.value = false;
  const query = { ...route.query };
  if (seasonId) query.season = String(seasonId);
  else delete query.season;
  if (activeTabId.value === "results") delete query.tab;
  else query.tab = activeTabId.value;
  router.replace({ path: "/stats", query });
}
</script>

<template>
  <div class="stats-hub">
    <section class="hero-block home-hero hub-pane">
      <button type="button" class="hub-season" @click="openSeasonPicker">
        <span class="home-hero-sublabel">Season</span>
        <span class="hub-season__name">{{ seasonLabel }}</span>
      </button>
      <nav class="hub-tabs" aria-label="Sections">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="hub-tab"
          :class="{ active: activeTabId === tab.id }"
          @click="setTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>
    </section>

    <main class="hub-content">
      <p v-if="metadata.summerError && !seasonReady" class="empty-state">
        {{ metadata.summerError }}
      </p>
      <p v-else-if="selectedSeason && !seasonReady" class="empty-state">
        Loading…
      </p>
      <component
        :is="activeComponent"
        v-else-if="selectedSeason"
        :season="selectedSeason"
        :metadata="metadata"
      />
    </main>

    <AppDialog
      v-model="seasonPickerOpen"
      aria-label="Choose season"
    >
      <template #header>
        <div class="panel-heading">
          <h3>Season</h3>
          <span>{{ selectedSeason?.start_year ?? "" }}</span>
        </div>
      </template>
      <ul class="stats-season-list" role="listbox" aria-label="Seasons">
        <li v-for="s in seasons" :key="s.id" role="none">
          <button
            type="button"
            class="stats-season-list__option"
            :class="{
              'stats-season-list__option--active': s.id === selectedSeasonId,
            }"
            role="option"
            :aria-selected="s.id === selectedSeasonId"
            @click="pickSeason(s.id)"
          >
            <span class="stats-season-list__label">{{
              s.name ||
              (String(s.kind || "") === "winter_reduced"
                ? `Winter ${s.start_year}`
                : `Summer ${s.start_year}`)
            }}</span>
            <span
              v-if="s.id === selectedSeasonId"
              class="stats-season-list__check"
              aria-hidden="true"
              >✓</span
            >
          </button>
        </li>
      </ul>
    </AppDialog>
  </div>
</template>

<style scoped>
.stats-hub {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.hub-pane {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.hub-season {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.hub-season__name {
  font-family: var(--font-serif);
  font-size: clamp(1.45rem, 4vw, 1.8rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--accent);
}

.hub-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.hub-tab {
  border: 0.5px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.hub-tab.active {
  color: var(--accent);
}

.stats-season-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: min(56vh, 22rem);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.stats-season-list__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.92rem 1rem;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.stats-season-list__option:active {
  background: var(--surface-3);
}

.stats-season-list__option--active {
  border-color: var(--accent);
  background: var(--surface-3);
}

.stats-season-list__label {
  min-width: 0;
}

.stats-season-list__check {
  flex-shrink: 0;
  color: var(--accent);
  font-weight: 700;
}
</style>
