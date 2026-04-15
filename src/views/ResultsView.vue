<script setup>
import { computed, onMounted, ref, watch } from "vue";
import QuietList from "../components/QuietList.vue";
import { useCompetitions } from "../composables/useCompetitions";
import { useResults } from "../composables/useResults";
import { useResultsSummary } from "../composables/useResultsSummary";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const {
  competitions,
  loading: competitionsLoading,
  error: competitionsError,
  fetchCompetitions,
} = useCompetitions();
const {
  results,
  loading: resultsLoading,
  error: resultsError,
  fetchResults,
} = useResults();
const {
  summaries,
  loading: summariesLoading,
  error: summariesError,
  fetchSummaries,
} = useResultsSummary();

const selectedCompetitionId = ref(null);
const summary = ref({
  amount: 0,
  num_players: 0,
  snakes: 0,
  camels: 0,
  week_number: null,
  week_date: null,
  winner_names: [],
  second_names: [],
});
const error = ref("");
const loading = computed(
  () =>
    competitionsLoading.value || resultsLoading.value || summariesLoading.value,
);
const detailsLoading = resultsLoading;
const rows = results;

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
    competitions.value.find(
      (competition) => competition.id === selectedCompetitionId.value,
    ) || null,
);

const competitionsForSeason = computed(() => {
  if (!props.season) return [];
  return competitions.value.filter((competition) => {
    if (!competition.competition_date) return false;
    return (
      competition.competition_date >= props.season.start_date &&
      competition.competition_date <= props.season.end_date
    );
  });
});

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
  formatDate(selectedCompetition.value?.competition_date),
);

const selectedCompetitionWeekLabel = computed(() => {
  const name = selectedCompetition.value?.name;
  if (!name) return "";

  const match = String(name).match(/\b(week\s*\d+)\b/i);
  if (!match) return "";

  return match[1].replace(/^week/i, "Week").replace(/\s+/g, " ");
});

const selectedCompetitionTitle = computed(() => {
  const name = selectedCompetition.value?.name;
  if (!name) return "Results";

  const cleaned = String(name)
    .replace(/^\s*\d{4}\s*/, "")
    .replace(/\bweek\s*\d+\b/i, "")
    .replace(/^[\s-,:|]+|[\s-,:|]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || "Results";
});

const weekNumberMap = computed(() => {
  const map = new Map();
  const chronological = [...competitionsForSeason.value].sort(
    (a, b) => new Date(a.competition_date) - new Date(b.competition_date),
  );
  chronological.forEach((comp, index) => {
    map.set(comp.id, index + 1);
  });
  return map;
});

const formatWeekLabel = (competition) => {
  if (!competition) return "Week";
  const num = weekNumberMap.value.get(competition.id);
  return num ? `WK${num}` : formatDate(competition.competition_date);
};

const leadingRows = computed(() => {
  const topScore = rows.value[0]?.score;
  if (topScore === undefined || topScore === null || topScore === "—") {
    return [];
  }

  return rows.value.filter((row) => row.score === topScore);
});

const winnerLabel = computed(() =>
  leadingRows.value.length > 1 ? "Winners" : "Winner",
);

const winnerValue = computed(() => {
  if (!leadingRows.value.length) return "TBC";
  const names = leadingRows.value.map((row) => row.player).join(", ");
  const score = leadingRows.value[0]?.score;
  return score !== undefined && score !== null ? `${names} (${score})` : names;
});

const syncSelectedCompetition = () => {
  const seasonCompetitions = competitionsForSeason.value;
  if (!seasonCompetitions.length) {
    selectedCompetitionId.value = null;
    return;
  }
  if (
    seasonCompetitions.some(
      (competition) => competition.id === selectedCompetitionId.value,
    )
  ) {
    return;
  }
  selectedCompetitionId.value =
    seasonCompetitions.find((competition) => competition.status === "closed")
      ?.id ||
    seasonCompetitions[0]?.id ||
    null;
};

const loadData = async () => {
  error.value = "";
  await fetchCompetitions({ season: props.season });
  syncSelectedCompetition();
  if (selectedCompetitionId.value) {
    await fetchResults({ competitionId: selectedCompetitionId.value });
    await fetchSummaries({ competitionIds: [selectedCompetitionId.value] });
    // Set summary from summaries composable
    const found = summaries.value.find(
      (s) => s.competition_id === selectedCompetitionId.value,
    );
    summary.value = found || {
      amount: 0,
      num_players: 0,
      snakes: 0,
      camels: 0,
      week_number: null,
      week_date: null,
      winner_names: [],
      second_names: [],
    };
  } else {
    summary.value = {
      amount: 0,
      num_players: 0,
      snakes: 0,
      camels: 0,
      week_number: null,
      week_date: null,
      winner_names: [],
      second_names: [],
    };
  }
};

onMounted(async () => {
  try {
    await loadData();
  } catch (loadError) {
    error.value = loadError.message;
  }
});

watch(selectedCompetitionId, async (competitionId, previous) => {
  if (!competitionId || competitionId === previous) return;
  await fetchResults({ competitionId });
  await fetchSummaries({ competitionIds: [competitionId] });
  const found = summaries.value.find((s) => s.competition_id === competitionId);
  summary.value = found || {
    amount: 0,
    num_players: 0,
    snakes: 0,
    camels: 0,
    week_number: null,
    week_date: null,
    winner_names: [],
    second_names: [],
  };
});

watch(
  () => props.season?.id,
  async () => {
    await loadData();
  },
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
            <template v-else>
              <span style="opacity: 0.5">WEEK &mdash; , &mdash;</span>
            </template>
          </span>
          <template v-if="leadingRows.length">
            <template v-if="summary.winner_type === 'rollover'">
              <span>
                {{
                  summary.winner_names && summary.winner_names.length
                    ? summary.winner_names.join(", ")
                    : ""
                }}
                all scored
                <template v-if="leadingRows.length">
                  {{ " " + leadingRows[0].score + " points" }}
                </template>
                , the £{{ Number(summary.amount).toFixed(2) }} pot rolls over to
                next week.
              </span>
            </template>
            <template
              v-else-if="
                summary.winner_type === 'winner' &&
                summary.winner_names &&
                summary.winner_names.length === 1
              "
            >
              <span>
                {{ summary.winner_names[0] }} won
                <template v-if="leadingRows.length">
                  with {{ leadingRows[0].score }} points
                </template>
                <template
                  v-if="summary.second_names && summary.second_names.length"
                >
                  , narrowly beating {{ summary.second_names.join(", ") }}
                </template>
                , adding £{{ Number(summary.amount).toFixed(2) }} to his season
                winnings.
              </span>
            </template>
            <template
              v-else-if="
                summary.winner_type === 'winner' &&
                summary.winner_names &&
                summary.winner_names.length > 1
              "
            >
              <span>
                {{ summary.winner_names.join(", ") }} tied for the win, adding
                £{{ Number(summary.amount).toFixed(2) }} to their season
                winnings.
              </span>
            </template>
            <template v-else-if="!loading && !detailsLoading">
              No results yet.
            </template>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ summary.num_players }} played, {{ summary.snakes }} snakes,
              {{ summary.camels }} camels.
            </p>
          </template>
          <template v-else-if="!loading && !detailsLoading">
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
        <div v-if="loading || detailsLoading" class="page-stack">
          <div
            v-for="i in 5"
            :key="i"
            class="home-lead-stat"
            style="opacity: 0.5; height: 60px; animation: pulse 1.5s infinite"
          ></div>
        </div>
        <p v-else-if="error" class="empty-state">{{ error }}</p>
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
