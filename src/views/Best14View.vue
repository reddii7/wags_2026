<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import { useTopbarControls } from "../composables/useTopbarControls";
import { supabase } from "../lib/supabase";
import { triggerHapticFeedback } from "../utils/haptics";

const seasons = ref([]);
const selectedSeasonId = ref(null);
const rows = ref([]);
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
    label: "Best 14",
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

const loadSeasons = async () => {
  const { data, error: rpcError } = await supabase
    .from("seasons")
    .select("id, name, start_year, is_current")
    .order("start_year", { ascending: false });

  if (rpcError) {
    throw rpcError;
  }

  seasons.value = data || [];
  selectedSeasonId.value =
    seasons.value.find((season) => season.is_current)?.id ||
    seasons.value[0]?.id ||
    null;
};

const loadLeaderboard = async () => {
  if (!selectedSeasonId.value) {
    rows.value = [];
    return;
  }

  loading.value = true;
  error.value = "";

  const { data, error: rpcError } = await supabase.rpc("get_best_14_scores", {
    p_season_id: selectedSeasonId.value,
  });

  if (rpcError) {
    error.value = rpcError.message;
    rows.value = [];
    loading.value = false;
    return;
  }

  rows.value = (data || []).map((player) => ({
    ...player,
    id: `${selectedSeasonId.value}-${player.full_name}`,
  }));
  loading.value = false;
};

const openBest14 = async (player) => {
  if (!player?.user_id || !selectedSeasonId.value) return;

  triggerHapticFeedback();

  selectedPlayer.value = player;
  detailRows.value = [];
  detailLoading.value = true;
  error.value = "";
  isDetailOpen.value = true;

  const { data, error: detailError } = await supabase.rpc(
    "get_player_best_14_scores",
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

const closeBest14 = () => {
  triggerHapticFeedback();
  isDetailOpen.value = false;
  selectedPlayer.value = null;
  detailRows.value = [];
  detailLoading.value = false;
};

onMounted(async () => {
  try {
    await loadSeasons();
    await loadLeaderboard();
  } catch (loadError) {
    error.value = loadError.message;
    loading.value = false;
  }
});

watch(selectedSeasonId, async (seasonId, previous) => {
  if (!seasonId || seasonId === previous) return;
  await loadLeaderboard();
});
</script>

<template>
  <section class="page-stack">
    <section
      class="content-panel content-panel--minimal content-panel--flush-top"
    >
      <p v-if="loading" class="empty-state">Loading leaderboard…</p>
      <p v-else-if="error" class="empty-state">{{ error }}</p>
      <QuietList
        v-else
        :columns="columns"
        :hide-head="true"
        :rows="rows"
        empty-text="No Best 14 scores yet."
      >
        <template #full_name="{ row }">
          <div class="player-cell">
            <button class="row-button" type="button" @click="openBest14(row)">
              {{ row.full_name }}
            </button>
          </div>
        </template>
      </QuietList>
    </section>

    <AppDialog
      v-if="selectedPlayer"
      v-model="isDetailOpen"
      :aria-label="`${selectedPlayer.full_name} best 14 scores`"
      @close="closeBest14"
    >
      <template #header>
        <div class="panel-heading">
          <h3>{{ selectedPlayer.full_name }}</h3>
          <span>Best 14</span>
        </div>
      </template>

      <p v-if="detailLoading" class="empty-state">Loading best 14…</p>
      <p v-else-if="error" class="empty-state">{{ error }}</p>
      <QuietList
        v-else
        :columns="detailColumns"
        :hide-head="true"
        :rows="detailRows"
        empty-text="No best 14 scores yet."
      />
    </AppDialog>
  </section>
</template>
