<script setup>
import { ref, computed } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const groups = computed(() => {
  // Filter by selected season (id or start_year)
  const seasonId = props.season?.id;
  const seasonYear = String(props.season?.start_year);
  const leagueRows =
    props.metadata?.leagues?.[seasonId] ||
    props.metadata?.leagues?.[seasonYear] ||
    [];
  const mapped = new Map();
  for (const row of leagueRows) {
    if (!mapped.has(row.league_name)) mapped.set(row.league_name, []);
    mapped.get(row.league_name).push({
      ...row,
      position: row.position ?? row.pos ?? row.rank_no ?? "",
    });
  }
  return [...mapped.entries()].map(([leagueName, players]) => ({
    leagueName,
    rows: players,
  }));
});

const leagueNavIdx = ref(0);
const leagueNavList = computed(() => groups.value.map((g) => g.leagueName));
const selectedGroup = computed(() => groups.value[leagueNavIdx.value] || null);
const selectedPlayer = ref(null);
const detailRows = ref([]);
const detailLoading = ref(false);
const isDetailOpen = ref(false);
const loading = ref(false);
const error = ref("");

const columns = [
  {
    key: "position",
    label: "POS",
    className: "numeric narrow",
    width: "3.5rem",
  },
  {
    key: "full_name",
    label: "PLAYER",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "total_score",
    label: "PTS",
    className: "numeric",
    width: "5.5rem",
  },
];

const detailColumns = [
  {
    key: "competition_name",
    label: "Round",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "competition_date",
    label: "Date",
    className: "numeric narrow",
    width: "6rem",
  },
  {
    key: "stableford_score",
    label: "Score",
    className: "numeric",
    width: "4.5rem",
  },
];

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const formatLeagueTitle = (value) => {
  if (!value) return "LEAGUE";
  // Map league names to new names
  const leagueMap = ["PREMIERSHIP", "CHAMPIONSHIP", "LEAGUE 1", "LEAGUE 2"];
  // Try to match by number or order
  const match = String(value).match(/\d+/);
  if (match && leagueMap[Number(match[0]) - 1]) {
    return leagueMap[Number(match[0]) - 1];
  }
  // Try to match by order if value is 0-based or 1-based index
  const idx = ["premiership", "championship", "league 1", "league 2"].findIndex(
    (n) => String(value).toLowerCase().includes(n.toLowerCase()),
  );
  if (idx !== -1) return leagueMap[idx];
  // Fallback: assign by order if possible
  const fallbackIdx = ["A", "B", "C", "D"].indexOf(String(value).toUpperCase());
  if (fallbackIdx !== -1) return leagueMap[fallbackIdx];
  return String(value).toUpperCase();
};

// No-op: groups is now computed from metadata

// Disable best 10 modal if not available in metadata
const openBest10 = (player) => {
  triggerHapticFeedback();
  selectedPlayer.value = player;
  detailLoading.value = true;

  const allRounds = props.metadata?.rounds || [];
  const allComps = props.metadata?.competitions || [];
  const allResults = props.metadata?.results || [];
  const seasonId = props.season?.id;
  const seasonYear = String(props.season?.start_year);

  // Filter competitions for this season
  const seasonCompIds = new Set(
    allComps
      .filter((c) => c.season === seasonId || String(c.season) === seasonYear)
      .map((c) => c.id),
  );

  const targetPlayerId = player.user_id || player.player_id || player.id;

  // Map player rounds with competition details
  const roundMap = new Map();
  [...allRounds, ...allResults].forEach((r) => {
    const rowUid = r.user_id || r.player_id;
    if (rowUid === targetPlayerId && seasonCompIds.has(r.competition_id)) {
      // Use Map to deduplicate by competition_id
      const existing = roundMap.get(r.competition_id);
      const score = r.stableford_score ?? r.score;
      if (!existing || score !== undefined) {
        roundMap.set(r.competition_id, {
          ...r,
          stableford_score: score,
        });
      }
    }
  });

  detailRows.value = Array.from(roundMap.values())
    .map((r) => {
      const comp = allComps.find((c) => c.id === r.competition_id);
      return {
        ...r,
        competition_name: comp?.name || "Unknown Round",
        competition_date: comp?.competition_date,
      };
    })
    .sort(
      (a, b) => new Date(b.competition_date) - new Date(a.competition_date),
    );

  detailLoading.value = false;
  isDetailOpen.value = true;
};

const closeBest10 = () => {
  triggerHapticFeedback();
  isDetailOpen.value = false;
  selectedPlayer.value = null;
  detailRows.value = [];
  detailLoading.value = false;
};

// No-op: all data is hydrated from metadata
</script>

<template>
  <section class="page-stack leagues-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline" style="margin-bottom: 0.5rem">
          League Standings
        </div>
        <p class="wags-body" style="margin: 0 auto; max-width: 500px">
          Standings for each league. Tap a player to view their best 10 scores.
        </p>
      </div>
    </section>

    <p v-if="loading" class="empty-state">Loading standings…</p>
    <p v-else-if="error" class="empty-state">{{ error }}</p>
    <p v-else-if="!groups.length" class="empty-state">
      No league data found for this season.
    </p>

    <nav v-if="groups.length" class="league-nav-scroll">
      <button
        v-for="(name, idx) in leagueNavList"
        :key="name"
        class="league-nav-btn"
        :class="{ active: idx === leagueNavIdx }"
        @click="leagueNavIdx = idx"
      >
        {{ formatLeagueTitle(name) }}
      </button>
    </nav>

    <section
      v-if="selectedGroup"
      class="content-panel content-panel--minimal content-panel--flush-top"
    >
      <div class="panel-heading">
        <h3 class="league-heading">
          {{ formatLeagueTitle(selectedGroup.leagueName) }}
        </h3>
      </div>
      <QuietList
        :columns="columns"
        :hide-head="false"
        :rows="selectedGroup.rows"
        empty-text="No players in this league."
      >
        <template #full_name="{ row }">
          <div class="player-cell">
            <button class="row-button" type="button" @click="openBest10(row)">
              {{ row.full_name }}
            </button>
          </div>
        </template>
      </QuietList>
    </section>

    <AppDialog
      v-if="selectedPlayer"
      v-model="isDetailOpen"
      :aria-label="`${selectedPlayer.full_name} best 10 scores`"
      @close="closeBest10"
    >
      <template #header>
        <div class="panel-heading">
          <h3>{{ selectedPlayer.full_name }}</h3>
          <span>Best 10</span>
        </div>
      </template>

      <p v-if="detailLoading" class="empty-state">Loading best 10…</p>
      <p v-else-if="error" class="empty-state">{{ error }}</p>
      <QuietList
        v-else
        :columns="detailColumns"
        :hide-head="true"
        :rows="detailRows"
        empty-text="No best 10 scores yet."
      />
    </AppDialog>
  </section>
</template>
