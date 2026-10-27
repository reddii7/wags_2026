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

const seasons = ref(
  Array.isArray(props.metadata?.seasons) ? props.metadata.seasons : [],
);
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

// Hydrate seasons from metadata and set default selected season robustly
watch(
  () => props.metadata,
  (meta) => {
    if (meta && Array.isArray(meta.seasons)) {
      seasons.value = meta.seasons;
      // Prefer latest active/current season on initial load.
      const preferredResultsSeasonId = String(
        meta?.defaults?.results_season_id || "",
      );
      const preferred = preferredResultsSeasonId
        ? meta.seasons.find((s) => String(s?.id) === preferredResultsSeasonId)
        : null;
      const current =
        meta.seasons.find((s) => s.is_current) ||
        meta.seasons.find((s) => s.is_active) ||
        preferred ||
        meta.seasons[0];
      if (
        !selectedSeasonId.value ||
        !meta.seasons.some((s) => s.id === selectedSeasonId.value)
      ) {
        selectedSeasonId.value = current?.id;
      }
    }
  },
  { immediate: true },
);

const selectedSeason = computed(() => {
  // Always find by id, fallback to first season
  return (
    seasons.value.find((s) => s.id === selectedSeasonId.value) ||
    seasons.value[0] ||
    null
  );
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

function setTab(id) {
  triggerHapticFeedback();
  activeTabId.value = id;
  if (id === "results") {
    router.replace("/stats");
  } else {
    router.replace({ path: "/stats", query: { tab: id } });
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
}
</script>

<template>
  <div class="stats-hub">
    <header class="hub-header">
      <!-- Row 1: Season (in-app sheet — matches Handicaps / Best 14 dialogs) -->
      <button
        type="button"
        class="f1-season-row f1-season-row-trigger"
        @click="openSeasonPicker"
      >
        <div class="f1-circle-trigger" aria-hidden="true">
          <svg
            width="10"
            height="6"
            viewBox="0 0 12 8"
            fill="none"
            class="f1-chevron"
          >
            <path
              d="M1 1.5L6 6.5L11 1.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <span class="f1-year-text">{{ selectedSeason?.start_year }}</span>
        <span class="f1-season-label">Season</span>
      </button>

      <!-- Row 2: Tabs -->
      <nav class="f1-section-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['f1-section-tab', { active: activeTabId === tab.id }]"
          @click="setTab(tab.id)"
        >
          {{ tab.label }}
          <span
            v-if="activeTabId === tab.id"
            class="f1-section-underline"
          ></span>
        </button>
      </nav>
    </header>

    <main class="hub-content">
      <component
        :is="activeComponent"
        v-if="selectedSeason"
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
              s.name || s.start_year
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
.hub-header {
  background: var(--bg-strong);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--surface-100);
  position: sticky;
  top: 0;
  z-index: 10;
}

.f1-season-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1rem 0.75rem;
}

.f1-season-row-trigger {
  width: 100%;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font: inherit;
  text-align: left;
  border-radius: 12px;
  -webkit-tap-highlight-color: transparent;
}

.f1-season-row-trigger:active .f1-circle-trigger {
  background: var(--surface-4);
}

.f1-circle-trigger {
  position: relative;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  background: var(--surface-3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  transition: background 0.2s;
}

.f1-year-text {
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1;
  display: block;
}

.f1-season-label {
  font-size: 1.4rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text);
  letter-spacing: -0.02em;
  line-height: 1;
}

.f1-section-nav {
  display: flex;
  gap: 1.1rem;
  padding: 0 0.5rem;
  margin-top: 0.5rem;
  border-bottom: 1px solid var(--line);
  justify-content: space-evenly;
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
