<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { resolveHomeDashboardBlock } from "../composables/resolveHomeDashboard.js";
import { triggerHapticFeedback } from "../utils/haptics";
import NavIcon from "../components/NavIcon.vue";

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
const selectedWeekId = ref("");
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

const winterDockIndex = computed(() =>
  winterTab.value === "best10" ? 2 : 1,
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

const winterResults = computed(() => {
  const rv = winterContract.value?.results_view;
  return rv && typeof rv === "object" ? rv : null;
});

const winterWeeks = computed(() => {
  const comps = winterResults.value?.competitions;
  if (!Array.isArray(comps)) return [];
  const rows = winterResults.value?.rows_by_competition || {};
  return comps
    .filter((comp) => Array.isArray(rows?.[comp.id]) && rows[comp.id].length)
    .slice()
    .sort((a, b) => Number(a.week_number) - Number(b.week_number));
});

const selectedWeekSummary = computed(() => {
  const id = selectedWeekId.value;
  const summary = winterResults.value?.summary_by_competition?.[id];
  return summary && typeof summary === "object" ? summary : null;
});

const selectedWeekRows = computed(() => {
  const id = selectedWeekId.value;
  const rows = winterResults.value?.rows_by_competition?.[id];
  if (!Array.isArray(rows) || !rows.length) return weekScores.value;
  const winners = new Set(
    (Array.isArray(selectedWeekSummary.value?.winner_names)
      ? selectedWeekSummary.value.winner_names
      : []
    ).map((name) => String(name)),
  );
  return rows.map((row) => ({
    position: row.position,
    user_id: row.user_id,
    full_name: row.player || row.full_name,
    score: row.score,
    is_winner:
      winners.size > 0
        ? winners.has(String(row.player || row.full_name || ""))
        : false,
  }));
});

const selectedWeekTitle = computed(() => {
  const summary = selectedWeekSummary.value;
  const weekNo = Number(summary?.week_number);
  const dateLabel = formatDayMonth(summary?.week_date);
  if (Number.isFinite(weekNo) && weekNo > 0 && dateLabel) {
    return `WEEK ${weekNo}, ${dateLabel}`;
  }
  return homePayload.value.week_label;
});

const selectedWeekHero = computed(() => {
  const raw = String(selectedWeekSummary.value?.hero_message || "").trim();
  if (!raw) return homePayload.value.hero_message;
  return raw.replace(
    "added to his season winnings.",
    "paid on the night.",
  );
});

const selectedBest10Card = computed(() => {
  if (!selectedPlayerId.value) return null;
  const card = best10ByMember.value?.[String(selectedPlayerId.value)];
  return card && typeof card === "object" ? card : null;
});

const activeHero = computed(() =>
  isWinter.value ? homePayload.value : summerPayload.value,
);

function formatDayMonth(isoLike) {
  const dStr = typeof isoLike === "string" ? isoLike.trim().slice(0, 10) : "";
  if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
  const d = new Date(`${dStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(d);
}

function syncSelectedWeek() {
  const weeks = winterWeeks.value;
  if (!weeks.length) {
    selectedWeekId.value = "";
    return;
  }
  if (weeks.some((week) => week.id === selectedWeekId.value)) return;
  const fallback = String(winterResults.value?.default_competition_id || "");
  selectedWeekId.value = weeks.some((week) => week.id === fallback)
    ? fallback
    : weeks[weeks.length - 1].id;
}

function selectWeek(weekId) {
  triggerHapticFeedback();
  selectedWeekId.value = String(weekId);
  winterTab.value = "week";
}

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
    syncSelectedWeek();
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
  <section v-else class="page-stack home-page winter-screen">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">Winter</span>
          <span>{{ winterTab === "week" ? selectedWeekTitle : "Best 10" }}</span>
          <template v-if="winterTab === 'week' && selectedWeekHero">
            <p class="home-hero-sublabel home-hero-subtext">
              {{ selectedWeekHero }}
            </p>
          </template>
          <template v-else-if="winterTab === 'best10' && !homePayload.no_results">
            <p class="home-hero-sublabel home-hero-subtext">
              {{ formatPounds(homePayload.rolling_pot_pence) }} rolling pot
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

    <nav
      v-else-if="winterWeeks.length"
      class="f1-round-nav"
      aria-label="Weeks"
    >
      <div class="f1-round-scroll">
        <button
          v-for="week in winterWeeks"
          :key="week.id"
          type="button"
          class="f1-round-item"
          :class="{ active: selectedWeekId === week.id }"
          @click="selectWeek(week.id)"
        >
          {{ week.week_label || `WK${week.week_number}` }}
          <span v-if="selectedWeekId === week.id" class="f1-round-line"></span>
        </button>
      </div>
    </nav>

    <section
      v-if="!loading && !error"
      class="home-dashboard home-dashboard--single"
      aria-label="Winter standings"
    >
      <section class="home-card">
        <div v-if="winterTab === 'week'" class="home-compact-list">
          <div
            v-for="row in selectedWeekRows"
            :key="`${row.user_id}-${row.position}`"
            class="home-compact-row"
            :class="{ 'home-compact-row--winner': row.is_winner }"
          >
            <span class="home-rank">{{ row.position }}</span>
            <span class="home-name">{{ row.full_name }}</span>
            <span class="home-value">{{ row.score }}</span>
          </div>
          <p v-if="!selectedWeekRows.length" class="empty-state">No scores this week.</p>
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

    <Teleport to="body">
      <nav
        class="winter-dock"
        aria-label="Winter"
        :style="{ '--dock-i': winterDockIndex }"
      >
        <span class="winter-dock__glass" aria-hidden="true"></span>
        <span class="winter-dock__rim" aria-hidden="true"></span>
        <span class="winter-dock__capsule" aria-hidden="true"></span>
        <button type="button" @click="backHome">
          <span class="winter-dock__hit">
            <NavIcon name="home" />
            <span>Home</span>
          </span>
        </button>
        <button
          type="button"
          :class="{ active: winterTab === 'week' }"
          :aria-current="winterTab === 'week' ? 'page' : undefined"
          @click="setWinterTab('week')"
        >
          <span class="winter-dock__hit">
            <NavIcon name="scores" />
            <span>This wk</span>
          </span>
        </button>
        <button
          type="button"
          :class="{ active: winterTab === 'best10' }"
          :aria-current="winterTab === 'best10' ? 'page' : undefined"
          @click="setWinterTab('best10')"
        >
          <span class="winter-dock__hit">
            <NavIcon name="best14" />
            <span>Best 10</span>
          </span>
        </button>
      </nav>
    </Teleport>
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

.winter-screen {
  padding-bottom: calc(6.75rem + env(safe-area-inset-bottom, 0px));
}

.winter-dock {
  position: fixed;
  z-index: 80;
  left: 50%;
  bottom: calc(0.55rem + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: stretch;
  width: min(92vw, 26.5rem);
  height: 4.85rem;
  padding: 6px;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
}

.winter-dock__glass {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  background: rgba(36, 36, 40, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.42),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(28px) saturate(1.7);
  backdrop-filter: blur(28px) saturate(1.7);
}

.winter-dock__rim {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.72) 0%,
    rgba(255, 255, 255, 0.28) 12%,
    rgba(255, 255, 255, 0.08) 42%,
    rgba(255, 255, 255, 0.18) 100%
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.winter-dock__capsule {
  position: absolute;
  z-index: 1;
  top: 6px;
  bottom: 6px;
  left: 6px;
  width: calc((100% - 12px) / 3);
  border-radius: 999px;
  background: rgba(6, 6, 10, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06),
    0 8px 16px rgba(0, 0, 0, 0.28);
  transform: translateX(calc(var(--dock-i) * 100%));
  transition: transform 0.55s cubic-bezier(0.22, 1.35, 0.36, 1);
  pointer-events: none;
}

.winter-dock button {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #fff;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.winter-dock__hit {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.22rem;
  transition: transform 0.18s ease;
}

.winter-dock button:active .winter-dock__hit {
  transform: scale(0.92);
}

.winter-dock button span span {
  font-family: "Avenir Next Condensed", "Arial Narrow", "SF Compact Text",
    "SF Pro Text", -apple-system, sans-serif;
  font-size: 0.62rem;
  font-weight: 700;
  font-stretch: condensed;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.winter-dock button.active {
  color: #e10600;
}

.winter-dock :deep(.nav-icon) {
  width: 1.35rem;
  height: 1.35rem;
}

.winter-dock :deep(.nav-icon path) {
  stroke-width: 1.65;
}

.home-dashboard--single {
  grid-template-columns: 1fr;
}

.f1-round-nav {
  background: transparent;
  border-bottom: 1px solid var(--line);
  padding: 0.15rem 0 0;
}

.f1-round-scroll {
  display: flex;
  overflow-x: auto;
  gap: 0.15rem;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.f1-round-scroll::-webkit-scrollbar {
  display: none;
}

.f1-round-item {
  position: relative;
  background: transparent;
  border: 0;
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.65rem 0.8rem 0.75rem;
  min-width: 3.2rem;
  cursor: pointer;
}

.f1-round-item.active {
  color: var(--text);
}

.f1-round-line {
  display: block;
  height: 0.16rem;
  width: calc(100% - 1.2rem);
  margin: 0.35rem auto 0;
  background: var(--accent);
  border-radius: 0.1rem;
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
