<script setup>
import { onMounted, ref, watch } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import { supabase } from "../lib/supabase";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  season: { type: Object, required: true },
});

const onlyPaid = ref(true); // Default to true, can be made reactive in UI
const rows = ref([]);
const selectedPlayer = ref(null);
const detailRows = ref([]);
const detailLoading = ref(false);
const isDetailOpen = ref(false);
const loading = ref(true);
const error = ref("");

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

const loadLeaderboard = async () => {
  if (!props.season?.start_year) {
    rows.value = [];
    return;
  }

  loading.value = true;
  error.value = "";

  const { data, error: rpcError } = await supabase.rpc(
    "get_best_14_scores_by_season",
    {
      p_season: String(props.season.start_year),
    },
  );

  if (rpcError) {
    error.value = rpcError.message;
    rows.value = [];
    loading.value = false;
    return;
  }

  rows.value = (data || []).map((player) => ({
    ...player,
    position: player.rank_no,
    total_score: player.best_total,
    id: `${props.season.start_year}-${player.full_name}`,
  }));
  loading.value = false;
};

const openBest14 = async (player) => {
  if (!player?.user_id || !props.season?.id) return;

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
      p_season_id: props.season.id,
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
  await loadLeaderboard();
});

watch(
  () => props.season?.id,
  async (newId) => {
    if (!newId) return;
    await loadLeaderboard();
  },
);
</script>

<template>
  <section class="page-stack best14-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline" style="margin-bottom: 0.5rem">
          Best 14 Leaderboard
        </div>
        <p class="wags-body" style="margin: 0 auto; max-width: 500px">
          Top scores for each player. Tap a player to view their round-by-round
          breakdown.
        </p>
      </div>
    </section>
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
