<script setup>
import { ref, computed } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import { triggerHapticFeedback } from "../utils/haptics";
import { supabase } from "../lib/supabase";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const onlyPaid = ref(true); // Default to true, can be made reactive in UI
// Hydrate from metadata.best14, using both id and start_year as keys
const rows = computed(() => {
  if (!props.season) return [];
  const seasonId = props.season.id;
  const seasonYear = String(props.season.start_year);
  const best14Arr =
    props.metadata?.best14?.[seasonId] ||
    props.metadata?.best14?.[seasonYear] ||
    [];
  return best14Arr.map((player) => ({
    ...player,
    position: player.position ?? player.pos ?? player.rank_no ?? "",
    total_score: player.best_total,
    id: `${seasonId || seasonYear}-${player.full_name}`,
  }));
});
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
    key: "stableford_score",
    label: "Score",
    className: "numeric",
    width: "4.5rem",
  },
];

// No-op: rows is now computed from metadata

// Disable best 14 modal if not available in metadata
const openBest14 = async (player) => {
  triggerHapticFeedback();
  error.value = "";
  selectedPlayer.value = player;
  detailLoading.value = true;
  try {
    const seasonId = props.season?.id;
    const playerId = player.user_id || player.player_id || player.id;
    if (!seasonId || !playerId) {
      detailRows.value = [];
      isDetailOpen.value = true;
      return;
    }

    const { data, error: rpcError } = await supabase.rpc(
      "get_player_top_rounds",
      {
        p_season_id: seasonId,
        p_player_id: playerId,
        p_take: 14,
      },
    );
    if (rpcError) throw rpcError;

    detailRows.value = Array.isArray(data)
      ? data.map((row) => ({
          ...row,
          id: `${row.competition_id}-${playerId}`,
        }))
      : [];
    isDetailOpen.value = true;
  } catch (e) {
    detailRows.value = [];
    error.value = e?.message || "Could not load best 14 details.";
    isDetailOpen.value = true;
  } finally {
    detailLoading.value = false;
  }
};

const closeBest14 = () => {
  triggerHapticFeedback();
  isDetailOpen.value = false;
  selectedPlayer.value = null;
  detailRows.value = [];
  detailLoading.value = false;
};

// No-op: all data is hydrated from metadata
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
        :hide-head="false"
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
