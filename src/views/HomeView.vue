<script setup>
// Computed: latestCompetitionDate for hero section
const latestCompetitionDate = computed(() => {
  if (!latestCompetition.value || !latestCompetition.value.competition_date)
    return null;
  const date = new Date(latestCompetition.value.competition_date);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
});
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
// --- Periodic and Visibility-triggered Data Refresh ---
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
let refreshTimer = null;

function setupPeriodicAndVisibilityRefresh() {
  // Periodic refresh
  refreshTimer = setInterval(() => {
    loadHomeData();
  }, REFRESH_INTERVAL_MS);

  // Visibility API refresh
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      loadHomeData();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);

  // Cleanup
  onUnmounted(() => {
    if (refreshTimer) clearInterval(refreshTimer);
    document.removeEventListener("visibilitychange", handleVisibility);
  });
}

onMounted(() => {
  setupPeriodicAndVisibilityRefresh();
});

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

// Format league label for display (fallback: capitalize, replace underscores)
function formatLeagueLabel(name) {
  if (!name) return "Division";
  return String(name)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const latestTopRows = computed(() => {
  if (!Array.isArray(latestResults.value)) return [];
  const numericScores = latestResults.value
    .map((row) => Number(row.score))
    .filter((score) => Number.isFinite(score));
  if (!numericScores.length) return [];
  const topScore = Math.max(...numericScores);
  return latestResults.value.filter((row) => Number(row.score) === topScore);
});

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

const latestStats = computed(() => {
  const players =
    Number(summary.value?.num_players) > 0
      ? Number(summary.value.num_players)
      : latestResults.value.length;
  const snakes =
    Number(summary.value?.snakes) > 0
      ? Number(summary.value.snakes)
      : latestResults.value.filter((row) => row.snake).length;
  const camels =
    Number(summary.value?.camels) > 0
      ? Number(summary.value.camels)
      : latestResults.value.filter((row) => row.camel).length;
  return { players, snakes, camels };
});

const loadHomeData = async () => {
  if (props.metadata.loading) {
    loading.value = true;
    return;
  }
  if (props.metadata.loadError) {
    error.value = props.metadata.loadError;
    loading.value = false;
    return;
  }
  error.value = "";
  try {
    // Prefer the latest completed competition that has result/summary data.
    const competitions = props.metadata.competitions || [];
    const allResults = props.metadata.results || [];
    const allSummaries = props.metadata.summaries || [];
    const sortedComps = [...competitions].sort(
      (a, b) => new Date(b.competition_date) - new Date(a.competition_date),
    );
    const latestCompWithData = sortedComps.find((comp) => {
      if (!comp?.id || comp.status === "open") return false;
      const hasResults = allResults.some(
        (row) =>
          row.competition_id === comp.id &&
          row.score !== null &&
          row.score !== undefined,
      );
      const hasSummary = allSummaries.some(
        (row) => row.competition_id === comp.id,
      );
      return hasResults || hasSummary;
    });
    const latestClosedComp = sortedComps.find(
      (comp) => comp?.status === "closed" && comp.competition_date,
    );
    const latestComp =
      latestCompWithData || latestClosedComp || sortedComps[0] || null;
    latestCompetition.value = latestComp;
    latestCompetitionDetails.value = latestComp;
    if (!latestComp) {
      loading.value = false;
      return;
    }
    // Robust dashboard lookup for this competition's season
    let dash = null;
    const dashboardObj = props.metadata.dashboard || {};
    let seasonKey = latestComp.season;
    // If seasonKey is a year, map to season UUID
    const seasonsArr = props.metadata.seasons || [];
    let foundSeason = seasonsArr.find(
      (s) =>
        String(s.start_year) === String(seasonKey) ||
        s.id === seasonKey ||
        String(s.id) === String(seasonKey),
    );
    if (foundSeason) {
      seasonKey = foundSeason.id;
    }
    if (dashboardObj[seasonKey]) {
      dash = dashboardObj[seasonKey];
    }

    const summaryForComp = allSummaries.find(
      (row) => row.competition_id === latestComp.id,
    );
    const dashSummary = dash?.summary || null;
    summary.value = dashSummary ||
      summaryForComp || {
        winner_type: "",
        winner_names: [],
        amount: 0,
        num_players: 0,
        snakes: 0,
        camels: 0,
      };
    summary.value.week_number =
      dash?.week_count || summary.value.week_number || null;
    if (
      (summary.value.week_number === null ||
        summary.value.week_number === undefined) &&
      latestComp?.name
    ) {
      const weekMatch = String(latestComp.name).match(/\bweek\s*0*(\d+)\b/i);
      if (weekMatch) summary.value.week_number = Number(weekMatch[1]);
    }

    // Prefer dashboard results when available, else raw metadata results.
    const fallbackResults = allResults.filter(
      (row) => row.competition_id === latestComp.id,
    );
    const sourceResults =
      dash?.results && Array.isArray(dash.results) && dash.results.length
        ? dash.results
        : fallbackResults;
    latestResults.value = sourceResults
      .map((row) => ({
        id: `${row.competition_id}-${row.user_id}`,
        competition_id: row.competition_id,
        user_id: row.user_id,
        player: row.player || row.full_name || "Unknown player",
        score: row.score ?? row.stableford_score ?? row.total_score ?? "—",
        snake: Boolean(row.snake ?? row.has_snake),
        camel: Boolean(row.camel ?? row.has_camel),
        position: row.position ?? row.pos ?? row.rank_no ?? "999",
      }))
      .sort((a, b) => {
        const posA = Number(a.position);
        const posB = Number(b.position);
        if (Number.isFinite(posA) && Number.isFinite(posB) && posA !== posB) {
          return posA - posB;
        }
        const scoreA = Number(a.score);
        const scoreB = Number(b.score);
        if (Number.isFinite(scoreA) && Number.isFinite(scoreB)) {
          return scoreB - scoreA;
        }
        return String(a.player).localeCompare(String(b.player));
      });

    // Best 14 and Leagues for this season (try both id and start_year as keys)
    // Use the same seasonKey as above
    const altSeasonKey =
      props.metadata.seasons?.find(
        (s) => String(s.start_year) === String(seasonKey),
      )?.id ||
      props.metadata.seasons?.find((s) => s.id === seasonKey)?.start_year;

    const best14 =
      props.metadata.best14?.[seasonKey] ||
      (altSeasonKey ? props.metadata.best14?.[altSeasonKey] : []) ||
      [];

    // Sort and compute top 3 ranks (including ties for 3rd)
    const sortedBest14 = best14
      .map((player) => ({
        ...player,
        position: player.position ?? player.pos ?? player.rank_no ?? "1",
        total_score: player.best_total,
        id: `${seasonKey}-${player.user_id}`,
      }))
      .sort((a, b) => Number(b.total_score) - Number(a.total_score));

    // Find the top 3 unique scores
    const uniqueScores = [
      ...new Set(sortedBest14.map((p) => Number(p.total_score))),
    ];
    const top3Scores = uniqueScores.slice(0, 3);

    // Filter all players whose score is in the top 3 scores
    best14Leaders.value = sortedBest14.filter((p) =>
      top3Scores.includes(Number(p.total_score)),
    );

    const leagues =
      props.metadata.leagues?.[seasonKey] ||
      (altSeasonKey ? props.metadata.leagues?.[altSeasonKey] : []) ||
      [];
    // Group by division (league_name), pick top position in each
    const divisionMap = new Map();
    for (const row of leagues) {
      const key = row.league_name || row.division || "Division";
      const current = divisionMap.get(key);
      // Use numeric position if available, else default to 1
      const rowPos = Number(row.position ?? row.pos ?? row.rank_no ?? 1);
      const currentPos = current
        ? Number(current.position ?? current.pos ?? current.rank_no ?? 1)
        : Infinity;
      if (!current || rowPos < currentPos) {
        divisionMap.set(key, row);
      }
    }
    leagueLeaders.value = Array.from(divisionMap.values())
      .sort((a, b) =>
        String(a.league_name || a.division).localeCompare(
          String(b.league_name || b.division),
        ),
      )
      .slice(0, 4)
      .map((row) => ({
        ...row,
        position: "1",
      }));

    // Use the same logic as HandicapsView to get the latest change for each player
    const history = props.metadata?.handicap_history || [];
    const allCompetitions = props.metadata?.competitions || [];
    // Find the latest competition by date to ensure the comparison is correct
    const nonOpen = (allCompetitions || []).filter((c) => c.status !== "open");
    const latestCompetitionId =
      nonOpen
        .slice()
        .sort(
          (a, b) => new Date(b.competition_date) - new Date(a.competition_date),
        )[0]?.id ||
      (allCompetitions || [])
        .slice()
        .sort(
          (a, b) => new Date(b.competition_date) - new Date(a.competition_date),
        )[0]?.id;

    // Find all players whose rounded handicap changed in the latest competition
    const latestChanges = (history || [])
      .filter((item) => item.competition_id === latestCompetitionId)
      .map((item) => {
        if (item.old_handicap == null || item.new_handicap == null) return null;
        const oldRounded = Math.round(item.old_handicap);
        const newRounded = Math.round(item.new_handicap);
        if (oldRounded === newRounded) return null;
        return {
          user_id: item.user_id,
          old_handicap: item.old_handicap,
          new_handicap: item.new_handicap,
          oldRounded,
          newRounded,
        };
      })
      .filter(Boolean);
    // Join with player profiles for display
    const profiles = props.metadata?.profiles || [];
    handicapMovements.value = latestChanges.map((change) => {
      const player = profiles.find((p) => p.id === change.user_id);
      return {
        ...change,
        full_name: player ? player.full_name : "Unknown",
      };
    });
  } catch (err) {
    console.error("Dashboard mapping error:", err);
  } finally {
    nextTick(() => {
      loading.value = false;
    });
  }
};

watch(
  () => props.metadata,
  () => {
    if (props.metadata.loading) {
      loading.value = true;
      return;
    }
    if (props.metadata.loadError) {
      error.value = props.metadata.loadError;
      loading.value = false;
      return;
    }
    error.value = "";
    loadHomeData();
  },
  { immediate: true, deep: true },
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
            <span v-if="summary.winner_type === 'rollover'">
              A rollover with
            </span>
            <template
              v-if="
                summary.winner_type === 'winner' &&
                summary.winner_names &&
                summary.winner_names.length === 1
              "
            >
              <span>
                A win for {{ summary.winner_names[0] }}
                <template v-if="latestTopRows.length">
                  with {{ latestTopRows[0].score }} points
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
            <template v-else-if="!loading">
              <span>{{ latestSummary }}</span>
            </template>
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
          <template v-if="handicapMovements.length">
            <div
              v-for="(item, idx) in handicapMovements"
              :key="`${item.user_id}-${idx}`"
              class="home-compact-row"
            >
              <span class="home-rank">{{ idx + 1 }}</span>
              <span class="home-name">{{ item.full_name }}</span>
              <span class="home-value">
                <span
                  class="mini-pill mini-pill--delta home-pill-compact"
                  :class="
                    item.newRounded < item.oldRounded
                      ? 'mini-pill--positive'
                      : 'mini-pill--negative'
                  "
                >
                  {{ item.old_handicap }}→{{ item.new_handicap }}
                  <span style="font-size: 0.9em; opacity: 0.7">
                    ({{ item.oldRounded }}→{{ item.newRounded }})</span
                  >
                </span>
              </span>
            </div>
          </template>
          <template v-else>
            <div
              style="
                font-size: 0.95em;
                opacity: 0.7;
                padding: 0.35em 0 0.15em 0;
              "
            >
              No Playing Handicap changes
            </div>
          </template>
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
            v-for="player in best14Leaders"
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
            v-for="(leader, idx) in leagueLeaders.slice(0, 4)"
            :key="leader.league_name || idx"
            class="home-compact-row"
          >
            <span class="home-rank home-rank--league">{{ idx + 1 }}</span>
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
