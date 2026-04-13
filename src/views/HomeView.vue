<template>
  <section class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="home-hero-headline">
          <span class="home-hero-sublabel">
            <template v-if="summary.week_number && summary.week_date">
              WEEK {{ summary.week_number }}, {{ summary.week_date }}
            </template>
            <template v-else>
              <span style="opacity: 0.5">WEEK &mdash; , &mdash;</span>
            </template>
          </span>
          <template v-if="latestTopRows.length">
            <template v-if="latestTopRows.length > 1">
              resulted in a rollover with
              {{ latestTopRows.map((row) => row.player).join(", ") }} all
              shooting {{ latestTopScore }} with £{{
                Number(summary.amount).toFixed(2)
              }}
              rolling over.
              <p class="home-hero-sublabel home-hero-subtext">
                {{ summary.num_players }} played, {{ summary.snakes }} snakes,
                {{ summary.camels }} camels.
              </p>
            </template>
            <template v-else>
              a win for {{ latestTopRows[0].player }} {{ latestTopScore }} with
              winning £{{ Number(summary.amount).toFixed(2) }}.
              <p class="home-hero-sublabel home-hero-subtext">
                {{ summary.num_players }} played, {{ summary.snakes }} snakes,
                {{ summary.camels }} camels.
              </p>
            </template>
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

      <RouterLink class="home-card" to="/handicaps">
        <div class="home-card__header">
          <span class="feature-label">Handicap changes</span>
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
      </RouterLink>

      <RouterLink class="home-card" to="/best14">
        <div class="home-card__header">
          <span class="feature-label">Best 14</span>
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
      </RouterLink>

      <RouterLink class="home-card" to="/leagues">
        <div class="home-card__header">
          <span class="feature-label">Division leaders</span>
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
      </RouterLink>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
// Backend-driven summary for Results card
const summary = ref({
  winner_type: "",
  winner_names: [],
  amount: 0,
  num_players: 0,
  snakes: 0,
  camels: 0,
});
import { RouterLink } from "vue-router";
import { supabase } from "../lib/supabase";

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
  const { data: seasons, error: seasonsError } = await supabase
    .from("seasons")
    .select("id, name, start_year, is_current")
    .order("start_year", { ascending: false });

  if (seasonsError) throw seasonsError;

  const currentSeason =
    seasons?.find((season) => season.is_current) || seasons?.[0] || null;

  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .select(
      "id, name, competition_date, status, winner_id, prize_pot, rollover_amount, profiles(full_name)",
    )
    .eq("status", "closed")
    .order("competition_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (competitionError) throw competitionError;
  latestCompetition.value = competition || null;
  latestCompetitionDetails.value = competition || null;

  // Fetch competition summary from public.get_competition_summary(uuid)
  if (competition?.id) {
    // Debug: log competition id, type, UUID format, and RPC params before RPC call
    const rpcParams = { p_competition_id: competition.id };
    const { data: summaryData, error: summaryError } = await supabase.rpc(
      "get_competition_summary",
      rpcParams,
    );
    if (summaryError) {
      console.error("Supabase RPC error:", summaryError);
      if (summaryError.message)
        console.error("summaryError.message:", summaryError.message);
      if (summaryError.code)
        console.error("summaryError.code:", summaryError.code);
      if (summaryError.details)
        console.error("summaryError.details:", summaryError.details);
      if (summaryError.hint)
        console.error("summaryError.hint:", summaryError.hint);
      throw summaryError;
    }
    if (summaryData && summaryData.length > 0) {
      summary.value = summaryData[0];
    }
  }

  const requests = [];

  if (currentSeason?.start_year) {
    requests.push(
      supabase.rpc("get_best_14_scores_by_season", {
        p_season: String(currentSeason.start_year),
      }),
    );
    requests.push(
      supabase.rpc("get_league_standings_best10", {
        p_season_id: currentSeason.id,
      }),
    );
  } else {
    requests.push(Promise.resolve({ data: [], error: null }));
    requests.push(Promise.resolve({ data: [], error: null }));
  }

  if (competition?.id) {
    requests.push(
      supabase
        .from("public_results_view")
        .select("*")
        .eq("competition_id", competition.id)
        .order("position"),
    );
  } else {
    requests.push(Promise.resolve({ data: [], error: null }));
  }

  // Only fetch competitions for other logic if needed
  requests.push(
    supabase
      .from("competitions")
      .select("id, name, competition_date")
      .order("competition_date", { ascending: false }),
  );
  // Fetch handicap changes directly from backend view
  requests.push(
    supabase
      .from("public_handicap_changes_view")
      .select("*")
      .order("created_at", { ascending: false }),
  );

  const [
    best14Response,
    leaguesResponse,
    roundsResponse,
    competitionsResponse,
    handicapResponse,
  ] = await Promise.all(requests);

  if (best14Response.error) throw best14Response.error;
  if (leaguesResponse.error) throw leaguesResponse.error;
  if (roundsResponse.error) throw roundsResponse.error;
  if (competitionsResponse.error) throw competitionsResponse.error;
  if (handicapResponse.error) throw handicapResponse.error;

  best14Leaders.value = (best14Response.data || []).map((player) => ({
    ...player,
    position: player.rank_no,
    total_score: player.best_total,
    id: `${currentSeason?.id}-${player.user_id}`,
  }));

  const groupedLeagueLeaders = new Map();
  (leaguesResponse.data || []).forEach((row) => {
    if (!groupedLeagueLeaders.has(row.league_name)) {
      groupedLeagueLeaders.set(row.league_name, {
        ...row,
        position: row.rank_no, // Map backend rank_no to position
      });
    }
  });
  leagueLeaders.value = [...groupedLeagueLeaders.values()];

  latestResults.value = (roundsResponse.data || []).map((row) => ({
    id: `${row.competition_id}-${row.user_id}`,
    player: row.player || row.profiles?.full_name || "Unknown player",
    score: row.score ?? row.stableford_score ?? "—",
    snake: Boolean(row.snake ?? row.has_snake),
    camel: Boolean(row.camel ?? row.has_camel),
    position: row.position ?? row.pos ?? row.rank_no ?? "",
  }));

  // Only show latest handicap changes for the latest competition
  const allChanges = handicapResponse.data || [];
  const compId = latestCompetition.value?.id;
  if (compId) {
    // Filter to only changes for the latest competition
    const compChanges = allChanges.filter(
      (item) => item.competition_id === compId,
    );
    // For each user, keep only their latest change (by created_at desc)
    const userMap = new Map();
    compChanges.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    for (const item of compChanges) {
      if (!userMap.has(item.user_id)) {
        const oldH =
          item.old_handicap !== null ? Math.round(item.old_handicap) : null;
        const newH =
          item.new_handicap !== null ? Math.round(item.new_handicap) : null;
        if (oldH !== null && newH !== null && oldH !== newH) {
          userMap.set(item.user_id, item);
        }
      }
    }
    handicapMovements.value = Array.from(userMap.values());
  } else {
    handicapMovements.value = [];
  }
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
</style>
/* Use the same color for .home-news-headline as .home-name */
.home-news-headline.home-name { color: #E2E2E2; }
