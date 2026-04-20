<script setup>
import { computed, ref, watch, nextTick } from "vue";
// Removed unused composable
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import QuietSparkline from "../components/QuietSparkline.vue";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  metadata: {
    type: Object,
    required: true,
  },
});

const players = ref([]);
const selectedPlayerId = ref(null);
const isHistoryOpen = ref(false);
const selectedPlayer = computed(
  () =>
    players.value.find((player) => player.id === selectedPlayerId.value) ||
    null,
);
const historyRows = ref([]);
const loading = ref(true);
const detailLoading = ref(false);
const error = ref("");

const columns = [
  {
    key: "full_name",
    label: "PLAYER",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "change",
    label: "LAST CHG",
    className: "results-change",
    width: "6.5rem",
  },
  {
    key: "current_handicap",
    label: "H'CAP",
    className: "numeric",
    width: "4.75rem",
  },
];

const historyColumns = [
  {
    key: "competition",
    label: "Round",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "score",
    label: "Score",
    className: "numeric narrow",
    width: "4.25rem",
  },
  { key: "new_handicap", label: "New", className: "numeric", width: "4.75rem" },
];

const trendValues = computed(() =>
  historyRows.value.map((row) => row.new_handicap).reverse(),
);

const getLatestCompetitionChangeMap = (history, competitions) => {
  // Find the latest competition by date to ensure the comparison is correct
  const latestCompetitionId = (competitions || [])
    .slice()
    .sort(
      (a, b) => new Date(b.competition_date) - new Date(a.competition_date),
    )[0]?.id;

  if (!latestCompetitionId) {
    return new Map();
  }

  const latestChangeByUser = new Map();

  (history || []).forEach((item) => {
    if (item.competition_id !== latestCompetitionId) return;
    if (latestChangeByUser.has(item.user_id)) return;

    const oldHandicap = item.old_handicap;
    const newHandicap = item.new_handicap;
    const hasChange =
      oldHandicap !== null &&
      newHandicap !== null &&
      oldHandicap !== newHandicap;

    latestChangeByUser.set(item.user_id, {
      text: hasChange ? `${oldHandicap}→${newHandicap}` : "-",
      improved: hasChange ? newHandicap < oldHandicap : false,
    });
  });

  return latestChangeByUser;
};

// Removed unused composable

const loadPlayers = async () => {
  loading.value = true;
  try {
    const profiles = props.metadata?.profiles || [];
    const history = props.metadata?.handicap_history || [];
    const competitions = props.metadata?.competitions || [];
    const latestChangeByUser = getLatestCompetitionChangeMap(
      history,
      competitions,
    );
    players.value = (profiles || [])
      .map((player) => {
        const latestChange = latestChangeByUser.get(player.id);
        let change, improved;
        if (!latestChange) {
          change = "-";
          improved = false;
        } else {
          change = latestChange.text;
          improved = latestChange.improved;
        }
        return {
          ...player,
          change,
          improved: Boolean(improved),
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  } catch (err) {
    error.value = err.message || "Failed to load players.";
  } finally {
    loading.value = false;
  }
};

const openHistory = async (playerId) => {
  if (!playerId) return;
  triggerHapticFeedback();
  error.value = "";
  selectedPlayerId.value = playerId;
  isHistoryOpen.value = true;
  await loadHistory();
};

const closeHistory = () => {
  triggerHapticFeedback();
  isHistoryOpen.value = false;
  selectedPlayerId.value = null;
  historyRows.value = [];
  detailLoading.value = false;
  error.value = "";
};

const loadHistory = async () => {
  if (!selectedPlayerId.value) {
    historyRows.value = [];
    return;
  }
  detailLoading.value = true;
  try {
    const allHistory = props.metadata?.handicap_history || [];
    const competitions = props.metadata?.competitions || [];
    const rounds = props.metadata?.rounds || [];

    const compDateMap = new Map(
      (competitions || []).map((c) => [c.id, c.competition_date]),
    );

    const playerHistory = [...allHistory]
      .filter((item) => item.user_id === selectedPlayerId.value)
      .sort((a, b) => {
        const dateA = compDateMap.get(a.competition_id) || a.created_at;
        const dateB = compDateMap.get(b.competition_id) || b.created_at;
        return new Date(dateB) - new Date(dateA);
      });

    const competitionMap = new Map(
      (competitions || []).map((competition) => [
        competition.id,
        competition.name,
      ]),
    );
    const scoreMap = new Map(
      (rounds || [])
        .filter((r) => r.user_id === selectedPlayerId.value)
        .map((score) => [score.competition_id, score.stableford_score]),
    );
    historyRows.value = playerHistory.map((item, index) => {
      // Calculate adjustment if missing or zero but handicaps actually changed
      let adj = item.adjustment;
      if (
        (adj === null || adj === undefined || Number(adj) === 0) &&
        item.old_handicap !== null &&
        item.new_handicap !== null
      ) {
        const diff = Number((item.new_handicap - item.old_handicap).toFixed(1));
        if (Math.abs(diff) > 0) {
          adj = diff > 0 ? `+${diff.toFixed(1)}` : `${diff.toFixed(1)}`;
        }
      }

      return {
        id: `${selectedPlayerId.value}-${item.created_at}-${index}`,
        competition:
          competitionMap.get(item.competition_id) || "Manual adjustment",
        score: scoreMap.get(item.competition_id) ?? "—",
        new_handicap: item.new_handicap,
        old_handicap: item.old_handicap,
        adjustment: adj ?? 0,
      };
    });
  } catch (err) {
    error.value = err.message || "Unable to load handicap history.";
    historyRows.value = [];
  } finally {
    detailLoading.value = false;
  }
};

watch(
  () => props.metadata,
  (meta) => {
    if (meta && !meta.loading) {
      loadPlayers();
    }
  },
  { immediate: true },
);

watch(selectedPlayerId, async (playerId, previous) => {
  if (!playerId || playerId === previous) return;
  await loadHistory();
});
</script>

<template>
  <section class="page-stack handicaps-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline" style="margin-bottom: 0.5rem">
          Handicap Changes
        </div>
        <p class="wags-body" style="margin: 0 auto; max-width: 500px">
          Latest handicap for each player. Tap a player to view their handicap
          history.
        </p>
      </div>
    </section>
    <section
      class="content-panel content-panel--minimal content-panel--flush-top"
    >
      <p v-if="loading" class="empty-state">Loading handicaps…</p>
      <p v-else-if="error && !players.length" class="empty-state">
        {{ error }}
      </p>
      <QuietList
        v-else
        :columns="columns"
        :hide-head="false"
        :rows="players"
        empty-text="No handicaps found."
      >
        <template #full_name="{ row }">
          <div class="player-cell">
            <button
              class="row-button"
              type="button"
              :class="{ active: isHistoryOpen && row.id === selectedPlayerId }"
              @click="openHistory(row.id)"
            >
              {{ row.full_name }}
            </button>
          </div>
        </template>
        <template #change="{ row }">
          <span
            v-if="row.change"
            class="mini-pill mini-pill--delta"
            :class="
              row.improved ? 'mini-pill--positive' : 'mini-pill--negative'
            "
          >
            {{ row.change }}
          </span>
        </template>
      </QuietList>
    </section>

    <AppDialog
      v-if="selectedPlayer"
      v-model="isHistoryOpen"
      :aria-label="`${selectedPlayer.full_name} handicap history`"
      @close="closeHistory"
    >
      <template #header>
        <div class="panel-heading">
          <h3>{{ selectedPlayer.full_name }}</h3>
          <span>{{ selectedPlayer.current_handicap }}</span>
        </div>
      </template>

      <QuietSparkline :values="trendValues" />
      <div class="spacer-block"></div>
      <p v-if="detailLoading" class="empty-state">Loading player history…</p>
      <p v-else-if="error && players.length" class="empty-state">
        {{ error }}
      </p>
      <QuietList
        v-else
        :columns="historyColumns"
        :hide-head="true"
        :rows="historyRows"
        empty-text="No handicap history yet."
      >
        <template #competition="{ row }">
          <div class="player-cell player-cell--stacked">
            <span>{{ row.competition }}</span>
            <div class="row-meta">
              <span class="mini-pill">Old {{ row.old_handicap }}</span>
              <span class="mini-pill">Adj {{ row.adjustment }}</span>
            </div>
          </div>
        </template>
      </QuietList>
    </AppDialog>
  </section>
</template>
