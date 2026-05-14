<script setup>
import { computed, ref, watch } from "vue";
import AppDialog from "../components/AppDialog.vue";
import QuietList from "../components/QuietList.vue";
import QuietSparkline from "../components/QuietSparkline.vue";
import { normId } from "../composables/resolveHomeDashboard.js";
import {
  buildCompetitionDateMap,
  buildScoreMapsByUserNorm,
  timelineForUser,
} from "../composables/handicapHistoryTimeline.js";
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

const normalizeCompetitionLabel = (label) =>
  String(label || "")
    .replace(/\s*-\s*week\s*1\s*$/i, "")
    .trim();

const loadPlayers = async () => {
  loading.value = true;
  try {
    const profiles = props.metadata?.profiles || props.metadata?.players || [];
    const history = props.metadata?.handicap_history || [];

    // Find the round_id whose rows have the latest created_at, restricted to
    // UUID-length competition_ids (real round rows, not manual adjustments) that
    // have at least one real handicap delta. This means RS Cup / cup rounds with
    // no handicap snapshots never displace the last weekly round.
    let latestTs = -1;
    let latestRoundId = null;
    for (const h of history) {
      const cid = String(h.competition_id || "");
      if (cid.length < 30) continue; // skip manual / non-round entries
      const oldN = h.old_handicap == null ? null : Number(h.old_handicap);
      const newN = h.new_handicap == null ? null : Number(h.new_handicap);
      const hasDelta =
        oldN != null && newN != null &&
        Number.isFinite(oldN) && Number.isFinite(newN) &&
        Math.abs(newN - oldN) > 0.01;
      if (!hasDelta) continue; // skip no-change snapshot rows
      const t = new Date(h.created_at || 0).getTime();
      if (Number.isFinite(t) && t > latestTs) {
        latestTs = t;
        latestRoundId = cid;
      }
    }

    // Build one pill per member whose snapshot is in that round and has a real delta.
    const latestRoundNorm = latestRoundId ? normId(latestRoundId) : null;
    const changeByUser = new Map();
    if (latestRoundNorm) {
      const sorted = [...history].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      for (const h of sorted) {
        if (normId(h.competition_id) !== latestRoundNorm) continue;
        const nk = normId(h.user_id);
        if (!nk || changeByUser.has(nk)) continue;
        const oldN = h.old_handicap == null ? null : Number(h.old_handicap);
        const newN = h.new_handicap == null ? null : Number(h.new_handicap);
        if (oldN == null || newN == null || !Number.isFinite(oldN) || !Number.isFinite(newN)) continue;
        if (Math.abs(newN - oldN) > 0.01) {
          changeByUser.set(nk, {
            text: `${oldN.toFixed(1)}→${newN.toFixed(1)}`,
            improved: newN < oldN,
            hasDelta: true,
          });
        }
      }
    }

    players.value = (profiles || [])
      .map((player) => {
        const nk = normId(player.id ?? "");
        const pill = changeByUser.get(nk);
        return {
          ...player,
          change: pill ? pill.text : "-",
          improved: pill ? pill.improved : false,
          hasDelta: Boolean(pill),
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

/** Per-player dialog: `metadata.handicap_history` + `competitions` + `rounds` + `results` → `timelineForUser` (no `focus_round_id` filter). */
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
    const results = props.metadata?.results || [];

    const compDateMap = buildCompetitionDateMap(competitions);
    const scoreMapsByUser = buildScoreMapsByUserNorm(rounds, results);
    const scoreMap =
      scoreMapsByUser.get(normId(selectedPlayerId.value)) || new Map();

    const playerHistory = timelineForUser(
      selectedPlayerId.value,
      allHistory,
      compDateMap,
      scoreMap,
    );

    const competitionMap = new Map(
      (competitions || []).map((competition) => [
        competition.id,
        competition.name,
      ]),
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

      // True manual adjustment: no competition_id or not found in competitions
      const compName = competitionMap.get(item.competition_id);
      let competitionLabel;
      if (!item.competition_id || !compName) {
        // If there's no competition_id or it's not found, only then call it manual
        competitionLabel = "Manual adjustment";
      } else {
        competitionLabel = normalizeCompetitionLabel(compName);
      }
      return {
        id: `${selectedPlayerId.value}-${item.created_at}-${index}`,
        competition: competitionLabel,
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
            v-if="row.hasDelta"
            class="mini-pill mini-pill--delta"
            :class="
              row.improved ? 'mini-pill--positive' : 'mini-pill--negative'
            "
          >
            {{ row.change }}
          </span>
          <span v-else class="hc-last-chg-none">-</span>
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

<style scoped>
.hc-last-chg-none {
  color: var(--muted, #888);
  font-size: 0.95rem;
}
</style>
