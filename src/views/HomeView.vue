<template>
  <section class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <span class="feature-label">WAGS Golf</span>
        <h1 class="hero-title home-hero__title">
          Latest results, handicap changes and ranking updates.
        </h1>
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
      <RouterLink class="home-card home-card--lead" to="/results">
        <div class="home-card__header">
          <span class="home-card__meta">
            Results
            {{ latestCompetitionDate }}
            <template v-if="latestCompetitionWeekLabel">
              <span class="home-card__meta-separator"> </span>
              {{ latestCompetitionWeekLabel }}
            </template>
          </span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="row in latestResults.slice(0, 3)"
            :key="row.id"
            class="home-compact-row"
          >
            <span class="home-rank">{{ row.position }}</span>
            <span class="home-name">{{ row.player }}</span>
            <span class="home-value">{{ row.score }}</span>
          </div>
        </div>
      </RouterLink>

      <RouterLink class="home-card" to="/handicaps">
        <div class="home-card__header">
          <span class="feature-label">Handicap changes</span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="item in handicapMovements.slice(0, 4)"
            :key="item.id"
            class="home-compact-row"
          >
            <span class="home-rank">{{ item.old_handicap }}</span>
            <span class="home-name">{{ item.full_name }}</span>
            <span class="home-value">{{ item.new_handicap }}</span>
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

const assignPositions = (rows, scoreKey) => {
  let lastScore = null;
  let lastPos = 0;

  return rows.map((row, index) => {
    const score = row[scoreKey] ?? 0;
    const position = score === lastScore ? lastPos : index + 1;
    lastScore = score;
    lastPos = position;
    return { ...row, position };
  });
};

const getLatestCompetitionChangeMap = (history, competitions) => {
  const latestCompetitionId = (competitions || []).find((competition) =>
    (history || []).some((item) => item.competition_id === competition.id),
  )?.id;

  if (!latestCompetitionId) {
    return {
      latestCompetitionId: null,
      latestChangeByUser: new Map(),
    };
  }

  const latestChangeByUser = new Map();

  (history || []).forEach((item) => {
    if (item.competition_id !== latestCompetitionId) return;
    if (latestChangeByUser.has(item.user_id)) return;

    const oldHandicap =
      item.old_handicap !== null ? Math.round(item.old_handicap) : null;
    const newHandicap =
      item.new_handicap !== null ? Math.round(item.new_handicap) : null;
    const hasChange =
      oldHandicap !== null &&
      newHandicap !== null &&
      oldHandicap !== newHandicap;

    latestChangeByUser.set(item.user_id, {
      oldHandicap,
      newHandicap,
      hasChange,
    });
  });

  return {
    latestCompetitionId,
    latestChangeByUser,
  };
};

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

  const requests = [];

  if (currentSeason?.id) {
    requests.push(
      supabase.rpc("get_best_14_scores", {
        p_season_id: currentSeason.id,
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
        .from("rounds")
        .select(
          "user_id, stableford_score, has_snake, has_camel, profiles(full_name)",
        )
        .eq("competition_id", competition.id)
        .order("stableford_score", { ascending: false }),
    );
  } else {
    requests.push(Promise.resolve({ data: [], error: null }));
  }

  requests.push(
    supabase
      .from("competitions")
      .select("id, name, competition_date")
      .order("competition_date", { ascending: false }),
  );
  requests.push(
    supabase
      .from("handicap_history")
      .select("user_id, old_handicap, new_handicap, competition_id, created_at")
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

  best14Leaders.value = assignPositions(
    (best14Response.data || [])
      .slice()
      .sort((left, right) => (right.total_score ?? 0) - (left.total_score ?? 0))
      .map((player) => ({
        ...player,
        id: `${currentSeason?.id}-${player.user_id}`,
      })),
    "total_score",
  );

  const groupedLeagueLeaders = new Map();
  (leaguesResponse.data || []).forEach((row) => {
    if (!groupedLeagueLeaders.has(row.league_name)) {
      groupedLeagueLeaders.set(row.league_name, row);
    }
  });
  leagueLeaders.value = [...groupedLeagueLeaders.values()];

  latestResults.value = assignPositions(
    (roundsResponse.data || []).map((row) => ({
      id: `${competition?.id}-${row.user_id}`,
      player: row.profiles?.full_name || "Unknown player",
      score: row.stableford_score ?? "—",
      snake: Boolean(row.has_snake),
      camel: Boolean(row.has_camel),
    })),
    "score",
  );

  const allCompetitions = competitionsResponse.data || [];
  const allHandicapHistory = handicapResponse.data || [];
  const {
    latestCompetitionId: latestMovementCompetitionId,
    latestChangeByUser,
  } = getLatestCompetitionChangeMap(allHandicapHistory, allCompetitions);

  latestMovementCompetition.value =
    allCompetitions.find((entry) => entry.id === latestMovementCompetitionId) ||
    null;

  if (latestChangeByUser.size) {
    const userIds = [...latestChangeByUser.keys()];
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, current_handicap")
      .in("id", userIds);

    if (profilesError) throw profilesError;

    handicapMovements.value = (profiles || [])
      .map((profile) => {
        const latestChange = latestChangeByUser.get(profile.id);
        return {
          id: profile.id,
          full_name: profile.full_name || "Unknown player",
          old_handicap: latestChange?.oldHandicap ?? null,
          new_handicap: latestChange?.newHandicap ?? null,
          hasChange: Boolean(latestChange?.hasChange),
        };
      })
      .filter((item) => item.hasChange)
      .sort((left, right) => left.full_name.localeCompare(right.full_name));
  } else {
    handicapMovements.value = [];
    latestMovementCompetition.value = null;
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
