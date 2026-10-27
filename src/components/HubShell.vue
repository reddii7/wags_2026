<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppDialog from "./AppDialog.vue";
import { triggerHapticFeedback } from "../utils/haptics";
import { resolvePreferredSeason } from "../composables/useWeekResults.js";

const props = defineProps({
  metadata: { type: Object, required: true },
  tabs: { type: Array, required: true },
  defaultTab: { type: String, required: true },
  basePath: { type: String, required: true },
});

const emit = defineEmits(["navigate"]);
const route = useRoute();
const router = useRouter();

const seasons = ref([]);
const selectedSeasonId = ref(null);
const seasonPickerOpen = ref(false);
const activeTabId = ref(props.defaultTab);

const tabIds = computed(() => props.tabs.map((t) => t.id));

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

function applyTabFromRoute() {
  const raw = route.query.tab;
  if (typeof raw === "string" && tabIds.value.includes(raw)) {
    activeTabId.value = raw;
    return;
  }
  activeTabId.value = props.defaultTab;
}

watch(() => route.query.tab, applyTabFromRoute, { immediate: true });
watch(
  () => props.defaultTab,
  () => applyTabFromRoute(),
);

watch(
  [() => props.metadata, () => route.query.season],
  ([meta]) => {
    if (!meta || !Array.isArray(meta.seasons)) return;
    seasons.value = meta.seasons;
    const fromQuery = resolveSeasonFromQuery(meta.seasons);
    if (fromQuery) {
      selectedSeasonId.value = fromQuery.id;
      return;
    }
    const preferred = resolvePreferredSeason(meta);
    if (
      !selectedSeasonId.value ||
      !meta.seasons.some((s) => s.id === selectedSeasonId.value)
    ) {
      selectedSeasonId.value = preferred?.id;
    }
  },
  { immediate: true },
);

const selectedSeason = computed(
  () =>
    seasons.value.find((s) => s.id === selectedSeasonId.value) ||
    seasons.value[0] ||
    null,
);

const activeComponent = computed(
  () => props.tabs.find((t) => t.id === activeTabId.value)?.component,
);

const seasonStatusLine = computed(() => {
  const s = selectedSeason.value;
  if (!s) return "";
  const kind = String(s.kind || "");
  const status = String(s.status || "").toLowerCase();
  if (kind === "winter_reduced") return "Winter";
  if (kind === "summer_main") return status === "closed" ? "Summer · closed" : "Summer";
  return status || "";
});

function hubQuery(extra = {}) {
  const query = { ...extra };
  if (selectedSeasonId.value) query.season = String(selectedSeasonId.value);
  return query;
}

function setTab(id) {
  triggerHapticFeedback();
  activeTabId.value = id;
  if (id === props.defaultTab) {
    const query = hubQuery();
    router.replace({ path: props.basePath, query });
  } else {
    router.replace({ path: props.basePath, query: hubQuery({ tab: id }) });
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
  if (activeTabId.value === props.defaultTab) delete query.tab;
  else query.tab = activeTabId.value;
  router.replace({ path: props.basePath, query });
}
</script>

<template>
  <div class="hub-shell">
    <header class="hub-header">
      <button
        type="button"
        class="f1-season-row f1-season-row-trigger"
        @click="openSeasonPicker"
      >
        <div class="f1-circle-trigger" aria-hidden="true">
          <svg width="10" height="6" viewBox="0 0 12 8" fill="none" class="f1-chevron">
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
        <span v-if="seasonStatusLine" class="hub-season-status">{{
          seasonStatusLine
        }}</span>
      </button>

      <nav class="f1-section-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
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
        @navigate="emit('navigate', $event)"
      />
    </main>

    <AppDialog v-model="seasonPickerOpen" aria-label="Choose season">
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
            <span class="stats-season-list__label">
              {{ s.label || s.name || s.start_year }}
              <span class="hub-option-meta">
                {{ s.kind === "winter_reduced" ? "Winter" : "Summer" }}
                · {{ s.status || "" }}
              </span>
            </span>
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
.hub-shell {
  min-height: 100%;
}

.hub-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-strong);
  padding: 0.35rem 0 0;
}

.f1-season-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.55rem 1rem 0.35rem;
}

.f1-season-row-trigger {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.f1-circle-trigger {
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  color: var(--text);
}

.f1-year-text {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text);
}

.f1-season-label {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.hub-season-status {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.f1-section-nav {
  display: flex;
  justify-content: space-evenly;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem 0.55rem;
  border-bottom: 1px solid var(--line);
}

.f1-section-tab {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 650;
  letter-spacing: 0.02em;
  padding: 0.35rem 0.2rem 0.45rem;
  cursor: pointer;
  position: relative;
}

.f1-section-tab.active {
  color: var(--accent);
}

.f1-section-underline {
  display: block;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 0.18rem;
  background: var(--accent);
  border-radius: 0.12rem 0.12rem 0 0;
}

.hub-content {
  padding-top: 0.35rem;
}

.panel-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.panel-heading h3 {
  margin: 0;
}

.stats-season-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}

.stats-season-list__option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.95rem 0.25rem;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.stats-season-list__option--active {
  color: var(--accent);
}

.stats-season-list__label {
  display: grid;
  gap: 0.2rem;
}

.hub-option-meta {
  color: var(--muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stats-season-list__check {
  color: var(--accent);
  font-weight: 700;
}
</style>
