<script setup>
import { computed, onMounted, ref } from "vue";
import { supabase } from "../lib/supabase";

const emit = defineEmits(["navigate"]);

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
  // Step 1: Fetch metadata in parallel
  const [seasonsRes, competitionRes] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, name, start_year, start_date, end_date, is_current")
      .order("start_year", { ascending: false }),
    supabase
      .from("competitions")
      .select(
        "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, profiles(full_name)",
      )
      .eq("status", "closed")
      .order("competition_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (seasonsRes.error) throw seasonsRes.error;
  if (competitionRes.error) throw competitionRes.error;

  const currentSeason =
    seasonsRes.data?.find((s) => s.is_current) || seasonsRes.data?.[0] || null;
  const competition = competitionRes.data || null;

  latestCompetition.value = competition;
  latestCompetitionDetails.value = competition;

  // Step 2: Fetch all specific data and summary in parallel
  const requests = [
    competition?.id
      ? supabase.rpc("get_competition_summary", {
          p_competition_id: competition.id,
        })
      : Promise.resolve({ data: [], error: null }),

    currentSeason?.start_year
      ? supabase.rpc("get_best_14_scores_by_season", {
          p_season: String(currentSeason.start_year),
        })
      : Promise.resolve({ data: [], error: null }),
    currentSeason?.id
      ? supabase.rpc("get_league_standings_best10", {
          p_season_id: currentSeason.id,
        })
      : Promise.resolve({ data: [], error: null }),
    competition?.id
      ? supabase
          .from("public_results_view")
          .select("*")
          .eq("competition_id", competition.id)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    competition?.id
      ? supabase
          .from("public_handicap_changes_view")
          .select("*")
          .eq("competition_id", competition.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    competition?.id
      ? supabase
          .from("competitions")
          .select("id", { count: "exact", head: true })
          .eq("status", "closed")
          .gte("competition_date", currentSeason.start_date)
          .lte("competition_date", competition.competition_date)
      : Promise.resolve({ count: 0 }),
  ];

  const [summaryRes, best14Res, leaguesRes, roundsRes, handicapRes, countRes] =
    await Promise.all(requests);

  if (summaryRes.error) throw summaryRes.error;
  if (best14Res.error) throw best14Res.error;
  if (leaguesRes.error) throw leaguesRes.error;
  if (roundsRes.error) throw roundsRes.error;
  if (handicapRes.error) throw handicapRes.error;

  if (summaryRes.data && summaryRes.data.length > 0) {
    summary.value = {
      ...summaryRes.data[0],
      week_number: countRes.count || summaryRes.data[0].week_number,
    };
  }

  best14Leaders.value = (best14Res.data || []).map((player) => ({
    ...player,
    position: player.rank_no,
    total_score: player.best_total,
    id: `${currentSeason?.id}-${player.user_id}`,
  }));

  const groupedLeagueLeaders = new Map();
  (leaguesRes.data || []).forEach((row) => {
    if (!groupedLeagueLeaders.has(row.league_name)) {
      groupedLeagueLeaders.set(row.league_name, {
        ...row,
        position: row.rank_no,
      });
    }
  });
  leagueLeaders.value = [...groupedLeagueLeaders.values()];

  latestResults.value = (roundsRes.data || []).map((row) => ({
    id: `${row.competition_id}-${row.user_id}`,
    player: row.player || row.profiles?.full_name || "Unknown player",
    score: row.score ?? row.stableford_score ?? "—",
    snake: Boolean(row.snake ?? row.has_snake),
    camel: Boolean(row.camel ?? row.has_camel),
    position: row.position ?? row.pos ?? row.rank_no ?? "",
  }));

  // Data is now pre-filtered by competition_id at the database level
  const userMap = new Map();
  (handicapRes.data || [])
    .filter((item) => {
      const oldH =
        item.old_handicap !== null ? Math.round(item.old_handicap) : null;
      const newH =
        item.new_handicap !== null ? Math.round(item.new_handicap) : null;
      return oldH !== null && newH !== null && oldH !== newH;
    })
    .forEach((item) => {
      if (!userMap.has(item.user_id)) {
        userMap.set(item.user_id, item);
      }
    });
  handicapMovements.value = Array.from(userMap.values());
};

onMounted(async () => {
  try {
    await loadHomeData();
  } catch (loadError) {
    error.value = loadError.message || "Unable to load dashboard.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel wags-body">
            <template v-if="summary.week_number && latestCompetitionDate">
              WEEK {{ summary.week_number }}, {{ latestCompetitionDate }}
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
            :key="item.id"
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
