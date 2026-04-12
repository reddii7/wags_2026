<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import { useTopbarControls } from "../composables/useTopbarControls";
import { supabase } from "../lib/supabase";
import { triggerHapticFeedback } from "../utils/haptics";

const seasons = ref([]);
const selectedSeasonId = ref(null);
const groups = ref([]);
const selectedPlayer = ref(null);
const detailRows = ref([]);
const detailLoading = ref(false);
const isDetailOpen = ref(false);
const loading = ref(true);
const error = ref("");
const { setSeasonControl, clearSeasonControl } = useTopbarControls();
const seasonControl = { seasons, model: selectedSeasonId };

const columns = [
  {
    key: "position",
    label: "Pos",
    className: "numeric narrow",
    width: "3.5rem",
  },
  {
    key: "full_name",
    label: "Player",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "total_score",
    label: "Best 10",
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
  const match = String(value).match(/\d+/);
  return match?.[0] ? `LEAGUE ${match[0]}` : String(value).toUpperCase();
};

const loadSeasons = async () => {
  const { data, error: queryError } = await supabase
    .from("seasons")
    .select("id, name, start_year, is_current")
    .order("start_year", { ascending: false });

  if (queryError) throw queryError;
  seasons.value = data || [];
  selectedSeasonId.value =
    seasons.value.find((season) => season.is_current)?.id ||
    seasons.value[0]?.id ||
    null;
};

const loadLeagues = async () => {
  if (!selectedSeasonId.value) {
    groups.value = [];
    return;
  }

  loading.value = true;
  error.value = "";
  const { data, error: rpcError } = await supabase.rpc(
    "get_league_standings_best10",
    {
      p_season_id: selectedSeasonId.value,
    },
  );

  if (rpcError) {
    error.value = rpcError.message;
    groups.value = [];
    loading.value = false;
    return;
  }

  const mapped = new Map();
  for (const row of data || []) {
    if (!mapped.has(row.league_name)) mapped.set(row.league_name, []);
    mapped.get(row.league_name).push(row);
  }

  groups.value = [...mapped.entries()].map(([leagueName, players]) => ({
    leagueName,
    rows: players, // Already ordered and with position from backend
  }));
  loading.value = false;
};

const openBest10 = async (player) => {
  if (!player?.user_id || !selectedSeasonId.value) return;

  triggerHapticFeedback();

  selectedPlayer.value = player;
  detailRows.value = [];
  detailLoading.value = true;
  error.value = "";
  isDetailOpen.value = true;

  const { data, error: detailError } = await supabase.rpc(
    "get_player_best_10_scores",
    {
      p_profile_id: player.user_id,
      p_season_id: selectedSeasonId.value,
    },
  );

  if (detailError) {
    error.value = detailError.message;
    detailRows.value = [];
    detailLoading.value = false;
    return;
  }

  detailRows.value = (data || []).map((row, index) => ({
    id: `${player.user_id}-${row.competition_date}-${index}`,
    ...row,
    competition_date: formatDate(row.competition_date),
  }));
  detailLoading.value = false;
};

const closeBest10 = () => {
  triggerHapticFeedback();
  isDetailOpen.value = false;
  selectedPlayer.value = null;
  detailRows.value = [];
  detailLoading.value = false;
};

onMounted(async () => {
  try {
    await loadSeasons();
    await loadLeagues();
  } catch (loadError) {
    error.value = loadError.message;
    loading.value = false;
  }
});

watch(selectedSeasonId, async (seasonId, previous) => {
  if (!seasonId || seasonId === previous) return;
  await loadLeagues();
});
</script>

<template>
  <section class="page-stack">
    <p v-if="loading" class="empty-state">Loading league tables…</p>
    <p v-else-if="error" class="empty-state">{{ error }}</p>

    <section
      v-for="group in groups"
      :key="group.leagueName"
      class="content-panel content-panel--minimal content-panel--flush-top"
    >
      <div class="panel-heading">
        <h3 class="league-heading">
          {{ formatLeagueTitle(group.leagueName) }}
        </h3>
      </div>
      <QuietList
        :columns="columns"
        :hide-head="true"
        :rows="group.rows"
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
