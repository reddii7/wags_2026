<script setup>
import { ref, computed, markRaw, watch } from "vue";
import { triggerHapticFeedback } from "../utils/haptics";
import LeaguesView from "./LeaguesView.vue";
import Best14View from "./Best14View.vue";
import ResultsView from "./ResultsView.vue";
import WinnersTable from "./WinnersTable.vue";

const props = defineProps({
  metadata: { type: Object, required: true },
});

const seasons = ref(
  Array.isArray(props.metadata?.seasons) ? props.metadata.seasons : [],
);
const selectedSeasonId = ref(null);
const loading = ref(false);

const tabs = [
  { id: "results", label: "RESULTS", component: markRaw(ResultsView) },
  { id: "leagues", label: "LEAGUES", component: markRaw(LeaguesView) },
  { id: "best14", label: "BEST 14", component: markRaw(Best14View) },
  { id: "winners", label: "WINNERS", component: markRaw(WinnersTable) },
];

const activeTabId = ref(tabs[0].id);
const activeComponent = computed(
  () => tabs.find((t) => t.id === activeTabId.value)?.component,
);

// Hydrate seasons from metadata and set default selected season robustly
watch(
  () => props.metadata,
  (meta) => {
    if (meta && Array.isArray(meta.seasons)) {
      seasons.value = meta.seasons;
      // Always set default season to current or first if not set or if id is missing
      const current = meta.seasons.find((s) => s.is_current) || meta.seasons[0];
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
}
</script>

<template>
  <div class="stats-hub">
    <header class="hub-header">
      <!-- Row 1: Season Selector -->
      <div class="f1-season-row">
        <div class="f1-circle-trigger">
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
          <select v-model="selectedSeasonId" class="f1-hidden-select">
            <option v-for="s in seasons" :key="s.id" :value="s.id">
              {{ s.name || s.start_year }}
            </option>
          </select>
        </div>
        <span class="f1-year-text">{{ selectedSeason?.start_year }}</span>
        <span class="f1-season-label">Season</span>
      </div>

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

.f1-circle-trigger {
  position: relative;
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

.f1-hidden-select {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
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
</style>
