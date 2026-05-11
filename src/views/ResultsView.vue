<script setup>
import { computed, ref, watch } from "vue";
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
    width: "3.5rem",
  },
  {
    key: "player",
    label: "PLAYER",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  { key: "score", label: "PTS", className: "numeric", width: "4.75rem" },
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

const formatWeekLabel = (competition) => {
  if (!competition) return "Week";
  if (competition.week_label) return competition.week_label;
  const num = weekNumberMap.value.get(competition.id);
  return num ? `WK${num}` : formatDate(competition.competition_date);
};

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
  <section class="page-stack">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel wags-body">
            <template
              v-if="
                selectedCompetition && weekNumberMap.has(selectedCompetitionId)
              "
            >
              WEEK {{ weekNumberMap.get(selectedCompetitionId) }},
              {{ selectedCompetitionDate }}
            </template>
            <template v-else
              ><span style="opacity: 0.5"
                >WEEK &mdash; , &mdash;</span
              ></template
            >
          </span>
          <template v-if="rows.length">
            <span>{{ heroMessage }}</span>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ heroStats.players }} played, {{ heroStats.snakes }} snakes,
              {{ heroStats.camels }} camels.
            </p>
          </template>
          <template v-else-if="!metadata.loading && !contractError">
            No results yet.
          </template>
        </div>
      </div>
    </section>

    <nav v-if="competitionsForSeason.length > 1" class="f1-round-nav">
      <div class="f1-round-scroll">
        <button
          v-for="comp in competitionsForSeason"
          :key="comp.id"
          type="button"
          class="f1-round-item"
          :class="{ active: selectedCompetitionId === comp.id }"
          @click="selectedCompetitionId = comp.id"
        >
          {{ formatWeekLabel(comp) }}
          <span
            v-if="selectedCompetitionId === comp.id"
            class="f1-round-line"
          ></span>
        </button>
      </div>
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
.f1-round-nav {
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  padding: 0.25rem 0;
}

.f1-round-scroll {
  display: flex;
  overflow-x: auto;
  padding: 0 1rem;
  gap: 0.25rem;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.f1-round-scroll::-webkit-scrollbar {
  display: none;
}

.f1-round-item {
  position: relative;
  background: var(--bg);
  border: none;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 0.75rem;
  min-width: 3.2rem;
  cursor: pointer;
  transition: color 0.2s;
}

.f1-round-item.active {
  color: var(--text);
  background: var(--bg);
}
</style>
