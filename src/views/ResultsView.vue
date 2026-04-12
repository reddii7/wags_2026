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
  return leadingRows.value.map((row) => row.player).join(", ");
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
    return;
  }

  detailsLoading.value = true;
  error.value = "";

  const [
    { data: rounds, error: roundsError },
    { data: compDetails, error: detailsError },
    { data: handicapHistory, error: handicapError },
  ] = await Promise.all([
    supabase
      .from("rounds")
      .select(
        "user_id, stableford_score, has_snake, has_camel, profiles(full_name)",
      )
      .eq("competition_id", selectedCompetitionId.value)
      .order("stableford_score", { ascending: false }),
    supabase
      .from("competitions")
      .select(
        "status, prize_pot, rollover_amount, winner_id, profiles(full_name)",
      )
      .eq("id", selectedCompetitionId.value)
      .single(),
    supabase
      .from("handicap_history")
      .select("user_id, old_handicap, new_handicap")
      .eq("competition_id", selectedCompetitionId.value),
  ]);

  if (roundsError || detailsError || handicapError) {
    error.value =
      roundsError?.message ||
      detailsError?.message ||
      handicapError?.message ||
      "Unable to load results.";
    rows.value = [];
    competitionMeta.value = null;
    detailsLoading.value = false;
    return;
  }

  competitionMeta.value = compDetails;
  const handicapChanges = new Map();
  (handicapHistory || []).forEach((item) => {
    handicapChanges.set(item.user_id, item);
  });

  let lastScore = null;
  let lastPos = 0;
  rows.value = (rounds || []).map((round, index) => {
    const position = round.stableford_score === lastScore ? lastPos : index + 1;
    lastScore = round.stableford_score;
    lastPos = position;

    const handicap = handicapChanges.get(round.user_id);
    const oldPlaying = handicap ? Math.round(handicap.old_handicap) : null;
    const newPlaying = handicap ? Math.round(handicap.new_handicap) : null;
    const handicapDelta =
      oldPlaying !== null && newPlaying !== null && oldPlaying !== newPlaying
        ? `H'cap ${oldPlaying}→${newPlaying}`
        : "";

    return {
      id: `${selectedCompetitionId.value}-${round.user_id}`,
      position,
      player: round.profiles?.full_name || "Unknown player",
      handicapChange: handicapDelta,
      score: round.stableford_score ?? "—",
      snake: Boolean(round.has_snake),
      camel: Boolean(round.has_camel),
      handicapDelta,
      improved: handicapDelta ? newPlaying < oldPlaying : false,
    };
  });

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
    <!-- Season dropdown and section navigation removed as requested -->

    <section class="results-shell">
      <div class="results-hero__top">
        <div class="results-filter-row">
          <div class="f1-week-select-shell">
            <select
              id="results-competition-select"
              v-model="selectedCompetitionId"
              class="f1-week-select"
            >
              <option
                v-for="competition in competitionsForSeason"
                :key="competition.id"
                :value="competition.id"
              >
                {{ formatWeekLabel(competition) }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <h1 class="results-shell__title">{{ selectedCompetitionTitle }}</h1>

      <p class="results-shell__meta">
        {{ selectedCompetitionDate }}
        <template v-if="selectedCompetitionWeekLabel">
          <span class="home-card__meta-separator"> </span>
          {{ selectedCompetitionWeekLabel }}
        </template>
      </p>

      <div
        class="results-hero__stats"
        v-if="!loading && !detailsLoading && !error"
      >
        <div
          v-for="item in heroStats"
          :key="item.label"
          class="results-hero__stat"
        >
          <span class="notice-strip__label">{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>

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
