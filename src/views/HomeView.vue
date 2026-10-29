<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { resolveHomeDashboardBlock } from "../composables/resolveHomeDashboard.js";
import { triggerHapticFeedback } from "../utils/haptics";

const emit = defineEmits(["navigate"]);
const props = defineProps({
  metadata: { type: Object, required: true },
});
const route = useRoute();

const loading = ref(true);
const error = ref("");
const weekScores = ref([]);
const best10Leaders = ref([]);
const best10ByMember = ref({});
const best14Leaders = ref([]);
const leagueLeaders = ref([]);
const handicapMovements = ref([]);
const winterTab = ref("week"); // week | best10
const selectedPlayerId = ref("");
const homePayload = ref({
  week_label: "WEEK — , —",
  hero_message: "No results yet.",
  no_results: true,
  stats: {
    players: 0,
    snakes: 0,
    camels: 0,
  },
  paid_out_pence: 0,
  rolling_pot_pence: 0,
  winner_name: null,
});
const summerPayload = ref({
  week_label: "WEEK — , —",
  hero_message: "No results yet.",
  no_results: true,
  stats: { players: 0, snakes: 0, camels: 0 },
});

const seasons = computed(() => {
  const list = Array.isArray(props.metadata?.seasons)
    ? props.metadata.seasons
    : [];
  return list.filter(
    (s) => String(s?.status || "").toLowerCase() !== "draft",
  );
});

const winterSeason = computed(
  () =>
    seasons.value.find(
      (s) =>
        String(s?.kind || "") === "winter_reduced" &&
        (s?.is_current ||
          s?.is_active ||
          String(s?.status || "").toLowerCase() === "open"),
    ) ||
    seasons.value.find((s) => String(s?.kind || "") === "winter_reduced") ||
    null,
);

/** Current summer only — older years live in Stats season picker. */
const summerSeason = computed(() => {
  const summers = seasons.value
    .filter((s) => String(s?.kind || "") === "summer_main")
    .sort((a, b) => Number(b.start_year || 0) - Number(a.start_year || 0));
  return (
    summers.find((s) => String(s?.status || "").toLowerCase() === "open") ||
    summers[0] ||
    null
  );
});

/** Winter is its own screen. Home stays the door back. */
const isWinter = computed(
  () => String(route.query.mode || "").toLowerCase() === "winter",
);

function dashForSeason(season) {
  if (!season?.id) return null;
  const dash = props.metadata?.dashboard || {};
  const byId = dash[String(season.id)];
  if (byId && typeof byId === "object") return byId;
  const yr =
    season.start_year != null && String(season.start_year).trim() !== ""
      ? String(season.start_year)
      : "";
  if (yr && dash[yr] && typeof dash[yr] === "object") return dash[yr];
  return null;
}

const winterContract = computed(() => {
  const fromSeason = dashForSeason(winterSeason.value);
  if (fromSeason) return fromSeason;
  const resolved = resolveHomeDashboardBlock(props.metadata);
  if (resolved && String(resolved.mode || "").toLowerCase() === "winter") {
    return resolved;
  }
  return null;
});

const summerContract = computed(() => dashForSeason(summerSeason.value));

const selectedBest10Card = computed(() => {
  if (!selectedPlayerId.value) return null;
  const card = best10ByMember.value?.[String(selectedPlayerId.value)];
  return card && typeof card === "object" ? card : null;
});

const activeHero = computed(() =>
  isWinter.value ? homePayload.value : summerPayload.value,
);

function formatPounds(pence) {
  const n = Number(pence) || 0;
  return `£${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}`;
}

function openPlayerBest10(userId) {
  selectedPlayerId.value =
    String(selectedPlayerId.value) === String(userId) ? "" : String(userId);
}

function openWinter() {
  triggerHapticFeedback();
  emit("navigate", { section: "home", mode: "winter" });
}

function openSummer() {
  triggerHapticFeedback();
  emit("navigate", {
    section: "stats",
    seasonId: summerSeason.value?.id,
  });
}

function backHome() {
  triggerHapticFeedback();
  emit("navigate", { section: "home" });
}

function setWinterTab(tab) {
  triggerHapticFeedback();
  winterTab.value = tab;
  if (tab !== "best10") selectedPlayerId.value = "";
}

function mapHomeBlock(dash) {
  const dashHome =
    dash &&
    typeof dash === "object" &&
    dash.home &&
    typeof dash.home === "object"
      ? dash.home
      : null;
  if (!dashHome) return null;
  return {
    week_label:
      typeof dashHome.week_label === "string" && dashHome.week_label.trim()
        ? dashHome.week_label
        : "WEEK — , —",
    hero_message:
      typeof dashHome.hero_message === "string" && dashHome.hero_message.trim()
        ? dashHome.hero_message
        : "No results yet.",
    no_results:
      typeof dashHome?.no_results === "boolean" ? dashHome.no_results : false,
    stats: {
      players: Number(dashHome?.stats?.players) || 0,
      snakes: Number(dashHome?.stats?.snakes) || 0,
      camels: Number(dashHome?.stats?.camels) || 0,
    },
    paid_out_pence: Number(dashHome?.paid_out_pence) || 0,
    rolling_pot_pence: Number(dashHome?.rolling_pot_pence) || 0,
    winner_name: dashHome?.winner_name ? String(dashHome.winner_name) : null,
  };
}

const loadHomeData = async () => {
  if (props.metadata.loading) {
    loading.value = true;
    return;
  }
  if (props.metadata.loadError) {
    error.value = props.metadata.loadError;
    loading.value = false;
    return;
  }
  error.value = "";
  try {
    if (props.metadata?.api_version !== "contract-v1") {
      throw new Error("Unsupported API contract version.");
    }

    const empty = {
      week_label: "WEEK — , —",
      hero_message: "No results yet.",
      no_results: true,
      stats: { players: 0, snakes: 0, camels: 0 },
      paid_out_pence: 0,
      rolling_pot_pence: 0,
      winner_name: null,
    };

    const winterDash = winterContract.value;
    const winterMapped = mapHomeBlock(winterDash);
    homePayload.value = winterMapped || empty;
    weekScores.value = Array.isArray(winterDash?.week_scores)
      ? winterDash.week_scores
      : [];
    best10Leaders.value = Array.isArray(winterDash?.best10_leaders)
      ? winterDash.best10_leaders
      : [];
    best10ByMember.value =
      winterDash?.best10_by_member &&
      typeof winterDash.best10_by_member === "object"
        ? winterDash.best10_by_member
        : {};

    const summerDash = summerContract.value;
    const summerMapped = mapHomeBlock(summerDash);
    summerPayload.value = summerMapped || empty;
    best14Leaders.value = Array.isArray(summerDash?.best14_leaders)
      ? summerDash.best14_leaders
      : [];
    leagueLeaders.value = Array.isArray(summerDash?.league_leaders)
      ? summerDash.league_leaders
      : [];
    handicapMovements.value = Array.isArray(
      summerDash?.home?.handicap_changes,
    )
      ? summerDash.home.handicap_changes
      : [];
  } catch (err) {
    console.error("Dashboard mapping error:", err);
  } finally {
    nextTick(() => {
      loading.value = false;
    });
  }
};

watch(
  [
    () => props.metadata.loading,
    () => props.metadata.loadError,
    () => props.metadata.dashboard,
    () => props.metadata.defaults,
    () => props.metadata.seasons,
    () => props.metadata.api_version,
    () => route.query.mode,
  ],
  () => {
    if (props.metadata.loading) {
      loading.value = true;
      return;
    }
    if (props.metadata.loadError) {
      error.value = props.metadata.loadError;
      loading.value = false;
      return;
    }
    error.value = "";
    if (!isWinter.value) {
      selectedPlayerId.value = "";
      winterTab.value = "week";
    }
    loadHomeData();
  },
  { immediate: true },
);
</script>

<template>
  <!-- Home: two doors. Summer is the full app. Winter is its own screen. -->
  <section v-if="!isWinter" class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">SUTTON WAGS</span>
          <span>Home</span>
        </div>
      </div>
    </section>

    <section
      v-if="loading || metadata.loading"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">Loading…</p>
    </section>
    <section
      v-else-if="error || metadata.loadError"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">{{ error || metadata.loadError }}</p>
    </section>

    <section v-else class="home-doors" aria-label="Seasons">
      <button
        type="button"
        class="home-card row-button home-door"
        :disabled="!winterSeason"
        @click="openWinter"
      >
        <span class="home-hero-sublabel">Winter</span>
        <strong>Week scores &amp; Best 10</strong>
        <p class="home-door__line">
          {{
            homePayload.no_results
              ? "No winter results yet."
              : homePayload.hero_message
          }}
        </p>
      </button>

      <button
        type="button"
        class="home-card row-button home-door"
        :disabled="!summerSeason"
        @click="openSummer"
      >
        <span class="home-hero-sublabel">
          Summer{{ summerSeason?.start_year ? ` ${summerSeason.start_year}` : "" }}
        </span>
        <strong>Results, leagues &amp; the cup</strong>
        <p class="home-door__line">
          Older seasons are in the year list.
        </p>
      </button>
    </section>
  </section>

  <!-- Winter, standalone: no summer nav. Home is the way back. -->
  <section v-else class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <button type="button" class="home-back" @click="backHome">
            ← Home
          </button>
          <span class="home-hero-sublabel2 wags-body">Winter</span>
          <span>{{ homePayload.week_label }}</span>
          <template v-if="!homePayload.no_results">
            <p class="home-hero-sublabel home-hero-subtext">
              {{ homePayload.hero_message }}
            </p>
          </template>
          <template v-else-if="!loading && !metadata.loading">
            No results yet.
          </template>
        </div>
      </div>
    </section>

    <section
      v-if="loading"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">Loading…</p>
    </section>
    <section
      v-else-if="error"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">{{ error }}</p>
    </section>

    <section
      v-else
      class="home-dashboard home-dashboard--single"
      aria-label="Winter standings"
    >
      <section class="home-card">
        <div class="home-card__header home-card__header--tabs">
          <nav class="board-tabs" aria-label="Winter board">
            <button
              type="button"
              class="board-tabs__tab"
              :class="{ 'board-tabs__tab--active': winterTab === 'week' }"
              @click="setWinterTab('week')"
            >
              This week
              <span
                v-if="winterTab === 'week'"
                class="board-tabs__line"
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              class="board-tabs__tab"
              :class="{ 'board-tabs__tab--active': winterTab === 'best10' }"
              @click="setWinterTab('best10')"
            >
              Best 10
              <span
                v-if="winterTab === 'best10'"
                class="board-tabs__line"
                aria-hidden="true"
              />
            </button>
          </nav>
        </div>

        <div v-if="winterTab === 'week'" class="home-compact-list">
          <div
            v-for="row in weekScores"
            :key="`${row.user_id}-${row.position}`"
            class="home-compact-row"
            :class="{ 'home-compact-row--winner': row.is_winner }"
          >
            <span class="home-rank">{{ row.position }}</span>
            <span class="home-name">{{ row.full_name }}</span>
            <span class="home-value">{{ row.score }}</span>
          </div>
          <p v-if="!weekScores.length" class="empty-state">No scores this week.</p>
        </div>

        <div v-else class="rolling-pot" aria-label="Rolling pot">
          <span class="home-hero-sublabel">Rolling pot</span>
          <strong>{{ formatPounds(homePayload.rolling_pot_pence) }}</strong>
          <p class="rolling-pot__note">Best 10 · builds each week</p>
        </div>
        <div v-if="winterTab === 'best10'" class="home-compact-list">
          <div
            v-for="row in best10Leaders"
            :key="row.user_id || row.id"
            class="home-compact-row"
            :class="{
              'home-compact-row--winner':
                String(selectedPlayerId) === String(row.user_id || row.id),
            }"
            role="button"
            tabindex="0"
            @click="openPlayerBest10(row.user_id || row.id)"
            @keydown.enter.prevent="openPlayerBest10(row.user_id || row.id)"
            @keydown.space.prevent="openPlayerBest10(row.user_id || row.id)"
          >
            <span class="home-rank">{{ row.position }}</span>
            <span class="home-name">{{ row.full_name }}</span>
            <span class="home-value">{{ row.total_score }}</span>
          </div>
          <p v-if="!best10Leaders.length" class="empty-state">No Best 10 yet.</p>
        </div>
      </section>

      <section v-if="selectedBest10Card" class="home-card">
        <div class="home-card__header">
          <span class="home-hero-sublabel">
            {{ selectedBest10Card.full_name }}
          </span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="score in selectedBest10Card.scores || []"
            :key="score.round_id"
            class="home-compact-row"
            :class="{
              'home-compact-row--drop': !score.counts_in_best10,
            }"
          >
            <span class="home-rank">
              {{ score.counts_in_best10 ? score.best10_rank : "—" }}
            </span>
            <span class="home-name">
              WK{{ score.week_number || "?" }}
              <span class="best10-card__meta">
                {{ score.counts_in_best10 ? "counts" : "spare" }}
              </span>
            </span>
            <span class="home-value">{{ score.score }}</span>
          </div>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.home-doors {
  display: grid;
  gap: 0.75rem;
}

.home-door {
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.home-door:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.home-door strong {
  display: block;
  margin-top: 0.15rem;
}

.home-door__line {
  margin: 0.45rem 0 0;
  color: var(--muted, #8e8e93);
  font-size: 0.92rem;
  line-height: 1.35;
}

.home-back {
  display: inline-flex;
  margin: 0 0 0.7rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted, #8e8e93);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.home-dashboard--single {
  grid-template-columns: 1fr;
}

.rolling-pot {
  padding: 0.35rem 0 0.85rem;
  border-bottom: 1px solid var(--line);
  margin-bottom: 0.35rem;
}

.rolling-pot strong {
  display: block;
  margin-top: 0.1rem;
  font-size: 2.6rem;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--text);
}

.rolling-pot__note {
  margin: 0.45rem 0 0;
  color: var(--muted, #8e8e93);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.home-card__header--tabs {
  margin-bottom: 0.15rem;
}

.board-tabs {
  display: flex;
  gap: 1.1rem;
  width: 100%;
}

.board-tabs__tab {
  position: relative;
  border: 0;
  background: none;
  padding: 0 0.05rem 0.45rem;
  color: var(--muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
}

.board-tabs__tab--active {
  color: var(--text);
}

.board-tabs__line {
  display: block;
  height: 0.14rem;
  width: 100%;
  background: var(--accent);
  border-radius: 0.1rem;
  position: absolute;
  left: 0;
  bottom: 0;
}

.home-empty-inline {
  font-size: 0.95em;
  opacity: 0.7;
  padding: 0.35em 0 0.15em;
}

.home-compact-row--winner .home-name,
.home-compact-row--winner .home-value {
  font-weight: 750;
}

.home-compact-row[role="button"] {
  cursor: pointer;
}

.home-compact-row--drop {
  opacity: 0.55;
}

.best10-card__meta {
  margin-left: 0.4rem;
  color: var(--muted, #8e8e93);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
