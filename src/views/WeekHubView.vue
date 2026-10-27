<script setup>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import QuietList from "../components/QuietList.vue";
import {
  formatShortDate,
  formatWeekChip,
  pickDefaultCompetitionId,
  resolvePreferredSeason,
  resolveSeasonResultsContract,
  weekNumberMapFromCompetitions,
} from "../composables/useWeekResults.js";
import { resolveHomeDashboardBlock } from "../composables/resolveHomeDashboard.js";
import { normId } from "../composables/resolveHomeDashboard.js";
import { triggerHapticFeedback } from "../utils/haptics";

const emit = defineEmits(["navigate"]);
const props = defineProps({
  metadata: { type: Object, required: true },
  season: { type: Object, default: null },
});

const route = useRoute();
const router = useRouter();

const selectedCompetitionId = ref(null);

const activeSeason = computed(
  () => props.season || resolvePreferredSeason(props.metadata),
);

const resultsContract = computed(() =>
  resolveSeasonResultsContract(props.metadata, activeSeason.value),
);

const competitions = computed(() =>
  Array.isArray(resultsContract.value?.competitions)
    ? resultsContract.value.competitions
    : [],
);

const weekNumberMap = computed(() =>
  weekNumberMapFromCompetitions(competitions.value),
);

const summaryByCompetition = computed(() => {
  const raw = resultsContract.value?.summary_by_competition;
  return raw && typeof raw === "object" ? raw : {};
});

const rows = computed(() => {
  const id = selectedCompetitionId.value;
  if (!id) return [];
  const list = resultsContract.value?.rows_by_competition?.[id];
  return Array.isArray(list) ? list : [];
});

const selectedSummary = computed(() => {
  const id = selectedCompetitionId.value;
  if (!id) return null;
  return summaryByCompetition.value?.[id] || null;
});

const selectedCompetition = computed(
  () =>
    competitions.value.find(
      (c) => String(c.id) === String(selectedCompetitionId.value),
    ) || null,
);

const heroWeekLine = computed(() => {
  const id = selectedCompetitionId.value;
  if (!id) return "WEEK —";
  const n = weekNumberMap.value.get(String(id));
  const date = formatShortDate(
    selectedSummary.value?.week_date ||
      selectedCompetition.value?.competition_date,
  );
  if (n && date) return `WEEK ${n}, ${date}`;
  if (n) return `WEEK ${n}`;
  return date ? `WEEK, ${date}` : "WEEK —";
});

const heroMessage = computed(
  () => selectedSummary.value?.hero_message || "No results yet.",
);

const heroStats = computed(() => ({
  players:
    Number(selectedSummary.value?.stats?.players) ||
    Number(selectedSummary.value?.num_players) ||
    0,
  snakes:
    Number(selectedSummary.value?.stats?.snakes) ||
    Number(selectedSummary.value?.snakes) ||
    0,
  camels:
    Number(selectedSummary.value?.stats?.camels) ||
    Number(selectedSummary.value?.camels) ||
    0,
}));

const potAmount = computed(() => {
  const n = Number(selectedSummary.value?.amount);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const homeDash = computed(() => resolveHomeDashboardBlock(props.metadata));

const focusRoundId = computed(() => {
  const raw = homeDash.value?.home?.focus_round_id;
  return raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
});

/** HC movers for the selected week when it matches home focus round. */
const weekHandicapMoves = computed(() => {
  const selected = selectedCompetitionId.value;
  if (!selected || !focusRoundId.value) return [];
  if (normId(selected) !== normId(focusRoundId.value)) return [];
  const changes = homeDash.value?.home?.handicap_changes;
  return Array.isArray(changes) ? changes.slice(0, 8) : [];
});

const columns = [
  {
    key: "position",
    label: "POS",
    className: "numeric narrow",
    width: "3.5rem",
  },
  {
    key: "player",
    label: "PLAYER",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  { key: "score", label: "PTS", className: "numeric", width: "4.75rem" },
];

function syncSelection() {
  const comps = competitions.value;
  if (!comps.length) {
    selectedCompetitionId.value = null;
    return;
  }

  const fromQuery =
    typeof route.query.round === "string" ? route.query.round.trim() : "";
  if (fromQuery && comps.some((c) => String(c.id) === fromQuery)) {
    selectedCompetitionId.value = fromQuery;
    return;
  }

  if (
    selectedCompetitionId.value &&
    comps.some((c) => String(c.id) === String(selectedCompetitionId.value))
  ) {
    return;
  }

  selectedCompetitionId.value =
    pickDefaultCompetitionId(resultsContract.value) || null;
}

function selectWeek(id) {
  triggerHapticFeedback();
  selectedCompetitionId.value = id;
  const query = { ...route.query, round: id };
  router.replace({ path: "/week", query });
}

watch(
  () => [
    activeSeason.value?.id,
    resultsContract.value,
    route.query.round,
    props.metadata?.loading,
  ],
  syncSelection,
  { immediate: true },
);
</script>

<template>
  <section class="page-stack week-hub">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">WEEK HUB</span>
          <span class="home-hero-sublabel wags-body">{{ heroWeekLine }}</span>
          <template v-if="rows.length">
            <span>{{ heroMessage }}</span>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ heroStats.players }} played,
              {{ heroStats.snakes }} snakes,
              {{ heroStats.camels }} camels
              <template v-if="potAmount != null">
                · £{{ potAmount.toLocaleString() }}
              </template>
            </p>
          </template>
          <template v-else-if="!metadata.loading"> No results yet. </template>
        </div>
      </div>
    </section>

    <nav v-if="competitions.length > 1" class="f1-round-nav" aria-label="Weeks">
      <div class="f1-round-scroll">
        <button
          v-for="comp in competitions"
          :key="comp.id"
          type="button"
          class="f1-round-item"
          :class="{ active: selectedCompetitionId === comp.id }"
          @click="selectWeek(comp.id)"
        >
          {{ formatWeekChip(comp, weekNumberMap) }}
          <span
            v-if="selectedCompetitionId === comp.id"
            class="f1-round-line"
          ></span>
        </button>
      </div>
    </nav>

    <section class="results-shell">
      <QuietList
        :columns="columns"
        :hide-head="false"
        :rows="rows"
        empty-text="No results found for this week."
      >
        <template #player="{ row }">
          <div class="player-cell player-cell--stacked">
            <span>{{ row.player }}</span>
            <div class="row-meta" v-if="row.snake || row.camel">
              <span v-if="row.snake" class="mini-pill mini-pill--snake"
                >Snake</span
              >
              <span v-if="row.camel" class="mini-pill mini-pill--camel"
                >Camel</span
              >
            </div>
          </div>
        </template>
      </QuietList>
    </section>

    <section
      v-if="weekHandicapMoves.length"
      class="week-hub__movers"
      aria-label="Handicap changes"
    >
      <h2 class="home-hero-sublabel">Handicap changes</h2>
      <div class="home-compact-list">
        <div
          v-for="(item, idx) in weekHandicapMoves"
          :key="`${item.user_id}-${idx}`"
          class="home-compact-row"
        >
          <span class="home-rank">{{ idx + 1 }}</span>
          <span class="home-name">{{ item.full_name }}</span>
          <span class="home-value">
            <span
              class="mini-pill mini-pill--delta home-pill-compact"
              :class="
                item.newRounded < item.oldRounded
                  ? 'mini-pill--positive'
                  : 'mini-pill--negative'
              "
            >
              {{ item.oldRounded }}→{{ item.newRounded }}
            </span>
          </span>
        </div>
      </div>
    </section>

    <section class="week-hub__shortcuts" aria-label="More">
      <button
        type="button"
        class="home-card row-button week-hub__shortcut"
        @click="emit('navigate', { section: 'stats', tab: 'leagues' })"
      >
        <span class="home-hero-sublabel">Standings</span>
        <strong>Leagues</strong>
      </button>
      <button
        type="button"
        class="home-card row-button week-hub__shortcut"
        @click="emit('navigate', { section: 'stats', tab: 'best14' })"
      >
        <span class="home-hero-sublabel">Season</span>
        <strong>Best 14</strong>
      </button>
      <button
        type="button"
        class="home-card row-button week-hub__shortcut"
        @click="emit('navigate', { section: 'handicaps' })"
      >
        <span class="home-hero-sublabel">All players</span>
        <strong>Handicaps</strong>
      </button>
    </section>
  </section>
</template>

<style scoped>
.week-hub {
  display: grid;
  gap: 1rem;
}

.f1-round-nav {
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  padding: 0.25rem 0;
  margin: 0 -0.15rem;
}

.f1-round-scroll {
  display: flex;
  overflow-x: auto;
  padding: 0 0.35rem;
  gap: 0.25rem;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.f1-round-scroll::-webkit-scrollbar {
  display: none;
}

.f1-round-item {
  position: relative;
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 0.75rem;
  min-width: 3.2rem;
  cursor: pointer;
}

.f1-round-item.active {
  color: var(--accent);
}

.f1-round-line {
  display: block;
  position: absolute;
  left: 0.55rem;
  right: 0.55rem;
  bottom: 0.15rem;
  height: 0.16rem;
  border-radius: 0.1rem;
  background: var(--accent);
}

.week-hub__movers {
  display: grid;
  gap: 0.35rem;
  padding: 0.25rem 0.15rem 0;
}

.week-hub__shortcuts {
  display: grid;
  gap: 0.65rem;
}

.week-hub__shortcut {
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.week-hub__shortcut strong {
  display: block;
  margin-top: 0.15rem;
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
}
</style>
