<script setup>
import { ref, computed } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import { triggerHapticFeedback } from "../utils/haptics";

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

// No-op: rows is now computed from metadata

// Disable best 14 modal if not available in metadata
const openBest14 = (player) => {
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
      // Professional Deduplication: Prefer records that have a valid numeric score
      // Deduplicate by competition_id, preferring records with valid score data
      const existing = roundMap.get(r.competition_id);
      const currentScore = r.stableford_score ?? r.score;

      // If we don't have this comp yet, or if this new record has a score and the old one didn't
      if (
        !existing ||
        (currentScore != null && existing.stableford_score == null)
      ) {
        roundMap.set(r.competition_id, {
          ...r,
          stableford_score: currentScore,
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
