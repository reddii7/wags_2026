<script setup>
import { computed, ref, watch, nextTick } from "vue";
import QuietList from "../components/QuietList.vue";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const selectedCompetitionId = ref(null);

const resultsContract = computed(() => {
  const dashboard = props.metadata?.dashboard || {};
  const seasonId = String(props.season?.id || "");
  const seasonYear = String(props.season?.start_year || "");
  return (
    dashboard?.[seasonId]?.results_view ||
    dashboard?.[seasonYear]?.results_view ||
    null
  );
});

const hasAnyResultsContract = computed(() => {
  const dashboard = props.metadata?.dashboard || {};
  return Object.values(dashboard).some((entry) => {
    return Boolean(entry && typeof entry === "object" && entry.results_view);
  });
});

const contractError = computed(() => {
  if (props.metadata?.loading) return "";
  if (props.metadata?.loadError) return props.metadata.loadError;
  if (props.metadata?.api_version !== "contract-v1") {
    return "Unsupported API contract version.";
  }
  if (!hasAnyResultsContract.value) {
    return "Missing dashboard.results_view contract payload.";
  }
  // If this specific season has no results_view yet, render an empty state.
  if (!resultsContract.value || typeof resultsContract.value !== "object") {
    return "";
  }
  if (!Array.isArray(resultsContract.value.competitions)) {
    return "Invalid results contract: competitions list is missing.";
  }
  if (
    !resultsContract.value.summary_by_competition ||
    typeof resultsContract.value.summary_by_competition !== "object"
  ) {
    return "Invalid results contract: summary_by_competition is missing.";
  }
  if (
    !resultsContract.value.rows_by_competition ||
    typeof resultsContract.value.rows_by_competition !== "object"
  ) {
    return "Invalid results contract: rows_by_competition is missing.";
  }
  return "";
});

const competitionsForSeason = computed(() => {
  const contractComps = resultsContract.value?.competitions;
  if (Array.isArray(contractComps)) return contractComps;
  return [];
});

const summaryByCompetition = computed(() => {
  const contractSummary = resultsContract.value?.summary_by_competition;
  if (contractSummary && typeof contractSummary === "object")
    return contractSummary;
  return {};
});

const rows = computed(() => {
  const selectedId = selectedCompetitionId.value;
  if (!selectedId) return [];

  const contractRows = resultsContract.value?.rows_by_competition?.[selectedId];
  if (Array.isArray(contractRows)) return contractRows;
  return [];
});

const selectedSummary = computed(() => {
  const selectedId = selectedCompetitionId.value;
  if (!selectedId) {
    return {
      amount: 0,
      num_players: 0,
      snakes: 0,
      camels: 0,
      week_number: null,
      week_date: null,
      winner_names: [],
      second_names: [],
      hero_message: "No results yet.",
      stats: { players: 0, snakes: 0, camels: 0 },
    };
  }

  const found = summaryByCompetition.value?.[selectedId];
  return (
    found || {
      amount: 0,
      num_players: 0,
      snakes: 0,
      camels: 0,
      week_number: null,
      week_date: null,
      winner_names: [],
      second_names: [],
      hero_message: "No results yet.",
      stats: { players: 0, snakes: 0, camels: 0 },
    }
  );
});

const columns = [
  {
    key: "position",
    label: "POS",
    className: "numeric narrow",
    width: "2.35rem",
  },
  {
    key: "player",
    label: "PLAYER",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  { key: "score", label: "PTS", className: "numeric", width: "3.1rem" },
];

const selectedCompetition = computed(
  () =>
    competitionsForSeason.value.find(
      (competition) => competition.id === selectedCompetitionId.value,
    ) || null,
);

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const selectedCompetitionDate = computed(() =>
  formatDate(
    selectedSummary.value?.week_date ||
      selectedCompetition.value?.competition_date,
  ),
);

const weekNumberMap = computed(() => {
  const map = new Map();
  competitionsForSeason.value.forEach((comp, index) => {
    const wk = Number(comp?.week_number);
    map.set(comp.id, Number.isFinite(wk) && wk > 0 ? wk : index + 1);
  });
  return map;
});

const weekStripRef = ref(null);

/** Chronological order for prev/next and the strip (contract list is often newest-first). */
const orderedCompetitions = computed(() => {
  const list = [...competitionsForSeason.value];
  return list.sort((a, b) => {
    const ta = new Date(a?.competition_date).getTime() || 0;
    const tb = new Date(b?.competition_date).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
});

const selectedRoundIndex = computed(() =>
  orderedCompetitions.value.findIndex(
    (c) => c.id === selectedCompetitionId.value,
  ),
);

const canGoPrev = computed(() => selectedRoundIndex.value > 0);
const canGoNext = computed(() => {
  const i = selectedRoundIndex.value;
  return i >= 0 && i < orderedCompetitions.value.length - 1;
});

function goPrevRound() {
  const i = selectedRoundIndex.value;
  if (i <= 0) return;
  selectedCompetitionId.value = orderedCompetitions.value[i - 1].id;
}

function goNextRound() {
  const i = selectedRoundIndex.value;
  const list = orderedCompetitions.value;
  if (i < 0 || i >= list.length - 1) return;
  selectedCompetitionId.value = list[i + 1].id;
}

function chipWeekNumber(competition) {
  const wk = Number(competition?.week_number);
  if (Number.isFinite(wk) && wk > 0) return wk;
  const fromMap = weekNumberMap.value.get(competition?.id);
  if (Number.isFinite(fromMap) && fromMap > 0) return fromMap;
  return null;
}

function scrollActiveChipIntoView() {
  nextTick(() => {
    const root = weekStripRef.value;
    if (!root) return;
    const el = root.querySelector(".wk-nav__chip.is-active");
    el?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  });
}

watch(selectedCompetitionId, scrollActiveChipIntoView);

const heroMessage = computed(
  () => selectedSummary.value?.hero_message || "No results yet.",
);

const heroStats = computed(() => ({
  players:
    Number(selectedSummary.value?.stats?.players) ||
    Number(selectedSummary.value?.num_players) ||
    0,
  snakes:
    Number(selectedSummary.value?.stats?.snakes) ||
    Number(selectedSummary.value?.snakes) ||
    0,
  camels:
    Number(selectedSummary.value?.stats?.camels) ||
    Number(selectedSummary.value?.camels) ||
    0,
}));

const syncSelectedCompetition = () => {
  if (contractError.value) {
    selectedCompetitionId.value = null;
    return;
  }

  const seasonCompetitions = competitionsForSeason.value;
  if (!seasonCompetitions.length) {
    selectedCompetitionId.value = null;
    return;
  }

  // If the current selection is valid for this season, preserve it.
  if (
    selectedCompetitionId.value &&
    seasonCompetitions.some(
      (competition) => competition.id === selectedCompetitionId.value,
    )
  ) {
    return;
  }

  // No valid selection — fall back to the contract default, then most recent.
  const contractDefault = resultsContract.value?.default_competition_id;
  if (
    contractDefault &&
    seasonCompetitions.some((competition) => competition.id === contractDefault)
  ) {
    selectedCompetitionId.value = contractDefault;
    return;
  }
  // Sort competitions by date ascending and select the last (most recent)
  const sorted = [...seasonCompetitions].sort(
    (a, b) => new Date(a.competition_date) - new Date(b.competition_date),
  );
  selectedCompetitionId.value = sorted[sorted.length - 1]?.id || null;
};

watch(
  () => [props.season?.id, props.metadata, resultsContract.value],
  () => {
    syncSelectedCompetition();
  },
  { immediate: true },
);
</script>

<template>
  <section class="page-stack results-page">
    <header class="results-hero">
      <p class="results-hero__weekline">
        <template
          v-if="
            selectedCompetition && weekNumberMap.has(selectedCompetitionId)
          "
        >
          <span class="results-hero__week-label">Round</span>
          <span class="results-hero__week"
            >{{ weekNumberMap.get(selectedCompetitionId) }} ·
            {{ selectedCompetitionDate }}</span
          >
        </template>
        <template v-else>
          <span class="results-hero__week results-hero__week--muted"
            >Round —</span
          >
        </template>
      </p>
      <div
        v-if="rows.length"
        class="results-hero__body"
      >
        <p class="results-hero__message">{{ heroMessage }}</p>
        <p class="results-hero__counts">
          {{ heroStats.players }} played · {{ heroStats.snakes }} snakes ·
          {{ heroStats.camels }} camels
        </p>
      </div>
      <p
        v-else-if="!metadata.loading && !contractError"
        class="results-hero__empty"
      >
        No results yet.
      </p>
    </header>

    <nav
      v-if="competitionsForSeason.length > 1"
      class="wk-nav"
      aria-label="Round"
    >
      <button
        type="button"
        class="wk-nav__arrow"
        :disabled="!canGoPrev"
        aria-label="Previous round"
        @click="goPrevRound"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M14 6l-6 6 6 6"
          />
        </svg>
      </button>
      <div ref="weekStripRef" class="wk-nav__strip">
        <button
          v-for="comp in orderedCompetitions"
          :key="comp.id"
          type="button"
          class="wk-nav__chip"
          :class="{ 'is-active': comp.id === selectedCompetitionId }"
          :aria-current="comp.id === selectedCompetitionId ? 'true' : undefined"
          :aria-label="`Round ${chipWeekNumber(comp) ?? ''} ${formatDate(comp.competition_date)}`"
          @click="selectedCompetitionId = comp.id"
        >
          <span class="wk-nav__chip-num">{{
            chipWeekNumber(comp) ?? "—"
          }}</span>
          <span class="wk-nav__chip-date">{{
            formatDate(comp.competition_date)
          }}</span>
        </button>
      </div>
      <button
        type="button"
        class="wk-nav__arrow"
        :disabled="!canGoNext"
        aria-label="Next round"
        @click="goNextRound"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10 6l6 6-6 6"
          />
        </svg>
      </button>
    </nav>

    <section class="results-shell">
      <div class="results-shell__body" style="min-height: 400px">
        <div v-if="metadata.loading" class="page-stack">
          <div
            v-for="i in 5"
            :key="i"
            class="home-lead-stat"
            style="opacity: 0.5; height: 60px; animation: pulse 1.5s infinite"
          ></div>
        </div>
        <p v-else-if="contractError" class="empty-state">{{ contractError }}</p>
        <QuietList
          v-else
          :columns="columns"
          :hide-head="false"
          :rows="rows"
          empty-text="No results found for this competition."
        >
          <template #player="{ row }">
            <div class="player-cell player-cell--stacked">
              <span>{{ row.player }}</span>
              <div class="row-meta" v-if="row.snake || row.camel">
                <span v-if="row.snake" class="mini-pill mini-pill--snake"
                  >Snake</span
                >
                <span v-if="row.camel" class="mini-pill mini-pill--camel"
                  >Camel</span
                >
              </div>
            </div>
          </template>
        </QuietList>
      </div>
    </section>
  </section>
</template>
<style scoped>
.results-page {
  gap: 0.2rem;
}

.results-hero {
  margin: 0;
  padding: 0.35rem 0.15rem 0.45rem;
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
}

.results-hero__weekline {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.55rem;
}

.results-hero__week-label {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

.results-hero__week {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.02em;
}

.results-hero__week--muted {
  color: var(--muted);
  font-weight: 600;
}

.results-hero__body {
  margin-top: 0.4rem;
  padding-top: 0.45rem;
  border-top: 0.5px solid var(--line);
}

.results-hero__message {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.42;
  color: color-mix(in srgb, var(--text) 92%, var(--muted));
  font-weight: 500;
  max-width: 36rem;
}

.results-hero__counts {
  margin: 0.28rem 0 0;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.results-hero__empty {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.wk-nav {
  display: flex;
  align-items: stretch;
  gap: 0.1rem;
  margin: 0 -0.15rem 0.15rem;
  padding: 0.28rem 0.25rem;
  background: color-mix(in srgb, var(--surface-2, var(--line)) 55%, transparent);
  border-bottom: 1px solid var(--line);
  border-radius: 12px;
}

.wk-nav__arrow {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  min-width: 2.25rem;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition:
    opacity 0.15s,
    background 0.15s;
}

.wk-nav__arrow:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text) 8%, transparent);
}

.wk-nav__arrow:disabled {
  opacity: 0.28;
  cursor: default;
}

.wk-nav__strip {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: 0.28rem;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x proximity;
  padding: 0.06rem 0.1rem;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  mask-image: linear-gradient(
    90deg,
    transparent 0,
    #000 5px,
    #000 calc(100% - 5px),
    transparent 100%
  );
}

.wk-nav__strip::-webkit-scrollbar {
  display: none;
}

.wk-nav__chip {
  flex: 0 0 auto;
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.06rem;
  min-width: 2.65rem;
  max-width: 3.1rem;
  padding: 0.22rem 0.28rem 0.24rem;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  line-height: 1.05;
  transition:
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}

.wk-nav__chip:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--text) 28%, var(--line));
}

.wk-nav__chip.is-active {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 24%, transparent);
  border-color: color-mix(in srgb, var(--accent) 65%, var(--line));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  font-weight: 700;
}

.wk-nav__chip-num {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.wk-nav__chip-date {
  font-size: 0.54rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.88;
}

.wk-nav__chip:not(.is-active) .wk-nav__chip-date {
  opacity: 0.72;
}

.results-page :deep(.quiet-list-row) {
  gap: 0.42rem;
  align-items: center;
}

.results-page :deep(.quiet-list-row--head) {
  padding: 0 0 0.38rem;
  margin-bottom: 0.05rem;
  border-bottom: 0.5px solid var(--line);
}

.results-page :deep(.quiet-list-body .quiet-list-row) {
  padding: 0.58rem 0;
}

.results-page :deep(.quiet-list-cell.player) {
  min-width: 0;
}

.results-page .results-shell {
  gap: 0.3rem;
  padding-top: 0;
}
</style>
