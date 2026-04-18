<script setup>
import { computed, onMounted, ref, watch, nextTick } from "vue";
import { supabase } from "../lib/supabase";

const emit = defineEmits(["navigate"]);
const props = defineProps({
  metadata: { type: Object, required: true },
});

// Backend-driven summary for Results card
const summary = ref({
  winner_type: "",
  winner_names: [],
  amount: 0,
  num_players: 0,
  snakes: 0,
  camels: 0,
});

const loading = ref(true);
const error = ref("");
const latestCompetition = ref(null);
const latestMovementCompetition = ref(null);
const latestResults = ref([]);
const best14Leaders = ref([]);
const leagueLeaders = ref([]);
const handicapMovements = ref([]);
const latestCompetitionDetails = ref(null);

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const formatLeagueLabel = (value) => {
  if (!value) return "-";
  const match = String(value).match(/\d+/);
  return match?.[0] || value;
};

const latestCompetitionDate = computed(() =>
  formatDate(latestCompetition.value?.competition_date),
);

const latestCompetitionWeekLabel = computed(() => {
  const name = latestCompetition.value?.name;
  if (!name) return "";

  const match = String(name).match(/\b(week\s*\d+)\b/i);
  return match ? match[1].replace(/\s+/g, " ") : "";
});

const latestMovementLabel = computed(
  () => latestMovementCompetition.value?.name || "Latest update",
);

const latestTopRows = computed(() => {
  const topScore = latestResults.value[0]?.score;
  if (topScore === undefined || topScore === null || topScore === "—")
    return [];
  return latestResults.value.filter((row) => row.score === topScore);
});

const latestWinnerLabel = computed(() =>
  latestTopRows.value.length > 1 ? "Winners" : "Winner",
);

const latestSummary = computed(() => {
  const winners = latestTopRows.value;
  if (!winners.length) return "No results yet.";

  if (winners.length > 1) {
    const names = winners.map((row) => row.player).join(", ");
    return `${names} tied on ${winners[0].score} points, with the pot rolling over.`;
  }

  return `${winners[0].player} won on ${winners[0].score} points.`;
});

const latestWinnerName = computed(() => {
  if (latestTopRows.value.length > 1) {
    return latestTopRows.value.map((row) => row.player).join(", ");
  }

  return (
    latestCompetitionDetails.value?.profiles?.full_name ||
    latestResults.value[0]?.player ||
    "No winner"
  );
});

const latestTopScore = computed(() => latestResults.value[0]?.score ?? "-");

const latestSideGames = computed(() => {
  const snakes = latestResults.value.filter((row) => row.snake).length;
  const camels = latestResults.value.filter((row) => row.camel).length;
  if (!snakes && !camels) return "None";
  return `${snakes} snake${snakes === 1 ? "" : "s"} · ${camels} camel${camels === 1 ? "" : "s"}`;
});

const loadHomeData = async () => {
  // If root metadata isn't ready or dashboard is missing, don't try to map
  if (props.metadata.loading) {
    loading.value = true;
    return;
  }

  const {
    season,
    latestComp,
    summary: metaSummary,
    dashboard: dash,
  } = props.metadata;

  latestCompetition.value = latestComp;
  latestCompetitionDetails.value = latestComp;

  if (!dash || !latestComp) {
    loading.value = false;
    return;
  }

  if (metaSummary) summary.value = metaSummary;

  // loading.value is already true by default
  error.value = "";

  try {
    // Update week number from the fresh season count
    summary.value.week_number = dash.week_count || summary.value.week_number;
    if (dash.summary) summary.value = { ...summary.value, ...dash.summary };

    // Map Results so computed winners are available immediately
    latestResults.value = (dash.results || []).map((row) => ({
      id: `${row.competition_id}-${row.user_id}`,
      player: row.player || row.full_name || "Unknown player",
      score: row.score ?? row.stableford_score ?? row.total_score ?? "—",
      snake: Boolean(row.snake ?? row.has_snake),
      camel: Boolean(row.camel ?? row.has_camel),
      position: row.position ?? row.pos ?? row.rank_no ?? "1",
    }));

    best14Leaders.value = (dash.best14 || []).map((player) => ({
      ...player,
      position: player.position ?? player.pos ?? player.rank_no ?? "1",
      total_score: player.best_total,
      id: `${season?.id}-${player.user_id}`,
    }));

    leagueLeaders.value = (dash.leagues || []).map((row) => ({
      ...row,
      position: "1", // Force 1 as these are division leaders
    }));

    // Data is now pre-filtered for actual changes in the SQL function
    handicapMovements.value = dash.handicaps || [];
  } catch (err) {
    console.error("Dashboard mapping error:", err);
  } finally {
    // Give Vue one tick to calculate latestTopRows before showing the hero
    nextTick(() => {
      loading.value = false;
    });
  }
};

watch(
  () => props.metadata.loading,
  (isLoading) => {
    if (!isLoading) loadHomeData();
  },
  { immediate: true },
);
</script>

<template>
  <section class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">
            LATEST UPDATES -
            <template v-if="summary.week_number && latestCompetitionDate">
              <span
                >WEEK {{ summary.week_number }},
                {{ latestCompetitionDate }}</span
              >
            </template>
            <template v-else>
              <span style="opacity: 0.5">WEEK &mdash; , &mdash;</span>
            </template>
          </span>
          <template v-if="latestTopRows.length">
            <template v-if="summary.winner_type === 'rollover'">
              <span>
                {{
                  summary.winner_names && summary.winner_names.length
                    ? summary.winner_names.join(", ")
                    : ""
                }}
                all scored
                <template v-if="latestTopRows.length">
                  {{ " " + latestTopRows[0].score }}
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
            <template v-else-if="!loading"> No results yet. </template>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ summary.num_players }} played, {{ summary.snakes }} snakes,
              {{ summary.camels }} camels.
            </p>
          </template>
          <template v-else-if="!loading && !metadata.loading">
            No results yet.
          </template>
        </div>
      </div>
    </section>

    <section
      v-if="loading"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">Loading dashboard…</p>
    </section>
    <section
      v-else-if="error"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">{{ error }}</p>
    </section>

    <section
      v-if="!loading && !error"
      class="home-dashboard"
      aria-label="Main sections"
    >
      <!-- Results summary moved to hero above -->

      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', 'handicaps')"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Handicap changes</span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="(item, idx) in handicapMovements.slice(0, 4)"
            :key="item.user_id"
            class="home-compact-row"
          >
            <span class="home-rank">{{ idx + 1 }}</span>
            <span class="home-name">{{ item.full_name }}</span>
            <span class="home-value">
              <span
                v-if="
                  item.old_handicap !== undefined &&
                  item.new_handicap !== undefined
                "
                class="mini-pill mini-pill--delta home-pill-compact"
                :class="
                  item.new_handicap < item.old_handicap
                    ? 'mini-pill--positive'
                    : 'mini-pill--negative'
                "
              >
                {{ Math.round(item.old_handicap) }}→{{
                  Math.round(item.new_handicap)
                }}
              </span>
            </span>
          </div>
        </div>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', 'stats')"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Best 14 LEADERS</span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="player in best14Leaders.slice(0, 3)"
            :key="player.id"
            class="home-compact-row"
          >
            <span class="home-rank">{{ player.position }}</span>
            <span class="home-name">{{ player.full_name }}</span>
            <span class="home-value">{{ player.total_score }}</span>
          </div>
        </div>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', 'stats')"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Division leaders</span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="leader in leagueLeaders.slice(0, 4)"
            :key="leader.league_name"
            class="home-compact-row"
          >
            <span class="home-rank home-rank--league">{{
              formatLeagueLabel(leader.league_name)
            }}</span>
            <span class="home-name">{{ leader.full_name }}</span>
            <span class="home-value">{{ leader.total_score }}</span>
          </div>
        </div>
      </button>
    </section>
  </section>
</template>

<style scoped>
.home-label {
  color: #888;
  font-size: 0.85em;
  margin-right: 0.25em;
}
.home-num {
  font-weight: bold;
  font-size: 1.1em;
}

/* Use the same color for the headline as the player names */
.home-news-headline.home-name {
  color: #e2e2e2;
}
</style>
