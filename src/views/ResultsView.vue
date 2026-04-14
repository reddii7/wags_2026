<script setup>
import { computed, onMounted, ref, watch } from "vue";
import QuietList from "../components/QuietList.vue";
import { supabase } from "../lib/supabase";

const seasons = ref([]);
const selectedSeasonId = ref(null);
const competitions = ref([]);
const selectedCompetitionId = ref(null);
const rows = ref([]);
const competitionMeta = ref(null);
const loading = ref(true);
const detailsLoading = ref(false);
const error = ref("");
const summary = ref({
  amount: 0,
  num_players: 0,
  snakes: 0,
  camels: 0,
  week_number: null,
  week_date: null,
});

const columns = [
  {
    key: "position",
    label: "Pos",
    className: "numeric narrow",
    width: "3.5rem",
  },
  {
    key: "player",
    label: "Player",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "handicapChange",
    label: "H'cap",
    className: "results-change",
    width: "7.25rem",
  },
  { key: "score", label: "Pts", className: "numeric", width: "4.75rem" },
];

const selectedCompetition = computed(
  () =>
    competitions.value.find(
      (competition) => competition.id === selectedCompetitionId.value,
    ) || null,
);

const selectedSeason = computed(
  () =>
    seasons.value.find((season) => season.id === selectedSeasonId.value) ||
    null,
);

const competitionsForSeason = computed(() => {
  if (!selectedSeason.value) return [];

  return competitions.value.filter((competition) => {
    if (!competition.competition_date) return false;

    return (
      competition.competition_date >= selectedSeason.value.start_date &&
      competition.competition_date <= selectedSeason.value.end_date
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

const formatSeasonLabel = (season) => {
  if (!season) return "Season";
  return season.name || String(season.start_year || "Season");
};

const formatWeekLabel = (competition) => {
  if (!competition) return "Week";

  const match = String(competition.name || "").match(/\bweek\s*\d+\b/i);
  if (match) {
    return match[0].replace(/^week/i, "Week").replace(/\s+/g, " ");
  }

  return formatDate(competition.competition_date);
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

const moneyValue = computed(() => {
  const details = competitionMeta.value;
  if (!details) return "-";

  const prizePot = Number(details.prize_pot || 0);
  const rollover = Number(details.rollover_amount || 0);

  if (details.winner_id && prizePot > 0) {
    return `£${prizePot.toFixed(2)}`;
  }

  if (!details.winner_id) {
    const rolloverValue = rollover > 0 ? rollover : prizePot;
    return rolloverValue > 0 ? `Rollover £${rolloverValue.toFixed(2)}` : "-";
  }

  return rollover > 0 ? `£${rollover.toFixed(2)}` : "-";
});

const heroStats = computed(() => [
  { label: winnerLabel.value, value: winnerValue.value },
  {
    label: moneyValue.value.startsWith("Rollover") ? "Rollover" : "Amount",
    value: moneyValue.value.replace(/^Rollover\s+/, ""),
  },
]);

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

const loadFilters = async () => {
  const [
    { data: competitionData, error: competitionsError },
    { data: seasonData, error: seasonsError },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, competition_date, status")
      .order("competition_date", { ascending: false }),
    supabase
      .from("seasons")
      .select("id, name, start_year, start_date, end_date, is_current")
      .order("start_year", { ascending: false }),
  ]);

  if (competitionsError || seasonsError) {
    throw competitionsError || seasonsError;
  }

  competitions.value = competitionData || [];
  seasons.value = seasonData || [];
  selectedSeasonId.value =
    seasons.value.find((season) => season.is_current)?.id ||
    seasons.value[0]?.id ||
    null;
  syncSelectedCompetition();
};

const loadResults = async () => {
  if (!selectedCompetitionId.value) {
    rows.value = [];
    competitionMeta.value = null;
    summary.value = {
      amount: 0,
      num_players: 0,
      snakes: 0,
      camels: 0,
      week_number: null,
      week_date: null,
    };
    return;
  }

  detailsLoading.value = true;
  error.value = "";

  // Fetch results from backend view/function with all fields precomputed
  const [
    { data: results, error: resultsError },
    { data: summaryData, error: summaryError },
  ] = await Promise.all([
    supabase
      .from("public_results_view") // Replace with your actual view/function name
      .select("*")
      .eq("competition_id", selectedCompetitionId.value)
      .order("position"),
    supabase
      .from("results_summary") // This should be a view or table with the summary fields
      .select(
        "amount, num_players, snakes, camels, week_number, week_date, winner_type, winner_names, second_names",
      )
      .eq("competition_id", selectedCompetitionId.value)
      .single(),
  ]);

  if (resultsError || summaryError) {
    error.value =
      (resultsError && resultsError.message) ||
      (summaryError && summaryError.message) ||
      "Unable to load results.";
    rows.value = [];
    competitionMeta.value = null;
    summary.value = {
      amount: 0,
      num_players: 0,
      snakes: 0,
      camels: 0,
      week_number: null,
      week_date: null,
    };
    detailsLoading.value = false;
    return;
  }

  rows.value = results || [];
  summary.value = summaryData || {
    amount: 0,
    num_players: 0,
    snakes: 0,
    camels: 0,
    week_number: null,
    week_date: null,
  };
  detailsLoading.value = false;
};

onMounted(async () => {
  try {
    await loadFilters();
    await loadResults();
  } catch (loadError) {
    error.value = loadError.message;
  } finally {
    loading.value = false;
    detailsLoading.value = false;
  }
});

watch(selectedCompetitionId, async (competitionId, previous) => {
  if (!competitionId || competitionId === previous) return;
  await loadResults();
});

watch(selectedSeasonId, (seasonId, previous) => {
  if (!seasonId || seasonId === previous) return;
  syncSelectedCompetition();

  if (!selectedCompetitionId.value) {
    rows.value = [];
    competitionMeta.value = null;
  }
});
</script>

<template>
  <section class="page-stack">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel wags-body">
            <template v-if="summary.week_number && summary.week_date">
              WEEK {{ summary.week_number }}, {{ summary.week_date }}
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
                <template v-if="summary.winner_score">
                  {{ " " + summary.winner_score + " points" }}
                </template>
                <template v-else-if="leadingRows.length">
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
                <template v-if="summary.winner_score">
                  with {{ summary.winner_score }} points
                </template>
                <template v-else-if="leadingRows.length">
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
            <template v-else> No results yet. </template>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ summary.num_players }} played, {{ summary.snakes }} snakes,
              {{ summary.camels }} camels.
            </p>
          </template>
          <template v-else> No results yet. </template>
        </div>
      </div>
    </section>

    <section class="results-shell">
      <div class="results-shell__body">
        <p v-if="loading || detailsLoading" class="empty-state">
          Loading results…
        </p>
        <p v-else-if="error" class="empty-state">{{ error }}</p>
        <QuietList
          v-else
          :columns="columns"
          :hide-head="true"
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
          <template #handicapChange="{ row }">
            <span
              v-if="row.handicapChange"
              class="mini-pill mini-pill--delta"
              :class="
                row.improved ? 'mini-pill--positive' : 'mini-pill--negative'
              "
            >
              {{ row.handicapChange }}
            </span>
          </template>
        </QuietList>
      </div>
    </section>
  </section>
</template>
