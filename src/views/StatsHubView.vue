<script setup>
import { ref, onMounted, computed, markRaw } from "vue";
import { supabase } from "../lib/supabase";
import { triggerHapticFeedback } from "../utils/haptics";
import LeaguesView from "./LeaguesView.vue";
import Best14View from "./Best14View.vue";
import ResultsView from "./ResultsView.vue";

const seasons = ref([]);
const selectedSeasonId = ref(null);
const loading = ref(true);

const tabs = [
  { id: "results", label: "RESULTS", component: markRaw(ResultsView) },
  { id: "leagues", label: "LEAGUES", component: markRaw(LeaguesView) },
  { id: "best14", label: "BEST 14", component: markRaw(Best14View) },
];

const activeTabId = ref(tabs[0].id);
const activeComponent = computed(
  () => tabs.find((t) => t.id === activeTabId.value)?.component,
);

async function loadSeasons() {
  const { data } = await supabase
    .from("seasons")
    .select("id, name, start_year, start_date, end_date, is_current")
    .order("start_year", { ascending: false });

  seasons.value = data || [];
  const current = seasons.value.find((s) => s.is_current) || seasons.value[0];
  selectedSeasonId.value = current?.id;
  loading.value = false;
}

const selectedSeason = computed(() =>
  seasons.value.find((s) => s.id === selectedSeasonId.value),
);

function setTab(id) {
  triggerHapticFeedback();
  activeTabId.value = id;
}

onMounted(loadSeasons);
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
}

.f1-season-label {
  font-size: 1.4rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text);
  letter-spacing: -0.02em;
}

.f1-section-nav {
  padding: 0 0.5rem;
  margin-top: 0.5rem;
}
</style>
