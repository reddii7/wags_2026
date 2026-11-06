<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import QuietList from "../components/QuietList.vue";
import SeasonLanding from "../components/SeasonLanding.vue";
import { resolveHomeDashboardBlock } from "../composables/resolveHomeDashboard.js";
import { useTheme } from "../composables/useTheme.js";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  metadata: { type: Object, required: true },
});
const route = useRoute();
const router = useRouter();
const { theme, toggleTheme } = useTheme();

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

const selectedWeekHero = computed(() => {
  const raw = String(selectedWeekSummary.value?.hero_message || "").trim();
  if (!raw) return homePayload.value.hero_message;
  return raw.replace(
    "added to his season winnings.",
    "paid on the night.",
  );
});

function best10CardFor(row) {
  const id = String(row?.user_id || row?.id || "");
  if (!id) return null;
  const card = best10ByMember.value?.[id];
  return card && typeof card === "object" ? card : null;
}

function best10Scores(row, counting) {
  const scores = best10CardFor(row)?.scores;
  if (!Array.isArray(scores)) return [];
  return scores.filter((score) => Boolean(score?.counts_in_best10) === counting);
}

function countingLabel(row) {
  const n = Number(row?.rounds_counting) || 0;
  if (n <= 1) return "";
  return `${n} rounds`;
}

function onToggleTheme() {
  triggerHapticFeedback();
  toggleTheme();
}

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

function splitWeekLabel(label) {
  const text = String(label || "").trim();
  const match = text.match(/^WEEK\s+(\d+)\s*,\s*(.+)$/i);
  if (match) return { week: `Week ${match[1]}`, date: match[2].trim() };
  if (!text || text.startsWith("WEEK —")) return { week: "", date: "" };
  return { week: text.replace(/^WEEK\s+/i, "Week "), date: "" };
}

const winterWeekParts = computed(() =>
  splitWeekLabel(homePayload.value.week_label),
);

const winterYear = computed(() => {
  const year = winterSeason.value?.start_year;
  return year != null && String(year).trim() !== "" ? String(year) : "";
});

const weekKicker = computed(() => {
  const summary = selectedWeekSummary.value;
  const weekNo = Number(summary?.week_number);
  const dateLabel = formatDayMonth(summary?.week_date);
  if (Number.isFinite(weekNo) && weekNo > 0) {
    return dateLabel ? `Week ${weekNo}, ${dateLabel}` : `Week ${weekNo}`;
  }
  const parts = winterWeekParts.value;
  if (parts.week && parts.date) return `${parts.week}, ${parts.date}`;
  return parts.week || "";
});

const weekPlayed = computed(() => {
  const summary = selectedWeekSummary.value;
  return (
    Number(summary?.stats?.players) ||
    Number(summary?.num_players) ||
    selectedWeekRows.value.length ||
    0
  );
});

const weekListRows = computed(() =>
  selectedWeekRows.value.map((row) => ({
    id: `${row.user_id || row.full_name}-${row.position}`,
    position: row.position,
    player: row.full_name,
    score: row.score,
  })),
);

const weekColumns = [
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

const best10Columns =
  "3.5rem minmax(0, 1fr) 4.75rem";

const showLanding = computed(() => {
  const tab = String(route.query.tab || "").toLowerCase();
  return tab !== "week" && tab !== "best10";
});

function chooseSeason(season) {
  triggerHapticFeedback();
  if (season === "summer") {
    router.push("/stats");
    return;
  }
  router.push({ path: "/", query: { tab: "week" } });
}

function backToSeasons() {
  triggerHapticFeedback();
  router.push({ path: "/" });
}

watch(
  () => route.query.tab,
  (tab) => {
    const value = String(tab || "").toLowerCase();
    if (value === "best10" || value === "week") winterTab.value = value;
  },
  { immediate: true },
);

function openPlayerBest10(userId) {
  selectedPlayerId.value =
    String(selectedPlayerId.value) === String(userId) ? "" : String(userId);
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
    loadHomeData();
    syncSelectedWeek();
  },
  { immediate: true },
);
</script>

<template>
  <SeasonLanding v-if="showLanding" @choose="chooseSeason" />
  <section v-else class="winter-screen">
    <header class="season-mast">
      <button type="button" class="season-back" @click="backToSeasons">
        Seasons
      </button>
      <div class="season-mast__top">
        <h1 class="season-mast__title">Winter</h1>
        <button
          type="button"
          class="theme-switch"
          :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="onToggleTheme"
        >
          {{ theme === "dark" ? "Light" : "Dark" }}
        </button>
      </div>
      <p v-if="winterYear" class="season-mast__year">{{ winterYear }}</p>
    </header>

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

    <section v-else-if="winterTab === 'week'" class="page-stack">
      <section class="hero-block home-hero">
        <div class="home-hero__intro">
          <div class="wags-headline">
            <span v-if="weekKicker" class="home-hero-sublabel wags-body">
              {{ weekKicker }}
            </span>
            <template v-if="weekListRows.length">
              <span>{{ selectedWeekHero }}</span>
              <p class="home-hero-sublabel home-hero-subtext">
                {{ weekPlayed }} played.
              </p>
            </template>
            <template v-else-if="!loading && !metadata.loading">
              No results yet.
            </template>
          </div>
        </div>
      </section>

      <nav
        v-if="winterWeeks.length > 1"
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

      <section class="results-shell">
        <div class="results-shell__body">
          <QuietList
            :columns="weekColumns"
            :hide-head="false"
            :rows="weekListRows"
            empty-text="No scores this week."
          />
        </div>
      </section>
    </section>

    <section v-else class="page-stack">
      <section class="hero-block home-hero">
        <div class="home-hero__intro">
          <div class="wags-headline">
            <span class="home-hero-sublabel wags-body">Rolling pot</span>
            <span>{{ formatPounds(homePayload.rolling_pot_pence) }}</span>
          </div>
        </div>
      </section>

      <section class="results-shell">
        <div class="results-shell__body">
          <div class="quiet-list" role="table">
            <div class="quiet-list-head" role="rowgroup">
              <div
                class="quiet-list-row quiet-list-row--head"
                role="row"
                :style="{ gridTemplateColumns: best10Columns }"
              >
                <div class="quiet-list-cell numeric narrow" role="columnheader">
                  POS
                </div>
                <div class="quiet-list-cell" role="columnheader">PLAYER</div>
                <div class="quiet-list-cell numeric" role="columnheader">PTS</div>
              </div>
            </div>
            <div v-if="best10Leaders.length" class="quiet-list-body" role="rowgroup">
              <div
                v-for="row in best10Leaders"
                :key="row.user_id || row.id"
                class="best10-player"
              >
                <div
                  class="quiet-list-row"
                  role="row"
                  tabindex="0"
                  :aria-expanded="
                    String(selectedPlayerId) === String(row.user_id || row.id)
                  "
                  :style="{ gridTemplateColumns: best10Columns }"
                  @click="openPlayerBest10(row.user_id || row.id)"
                  @keydown.enter.prevent="openPlayerBest10(row.user_id || row.id)"
                  @keydown.space.prevent="openPlayerBest10(row.user_id || row.id)"
                >
                  <div class="quiet-list-cell numeric narrow" role="cell">
                    {{ row.position }}
                  </div>
                  <div class="quiet-list-cell" role="cell">
                    <div class="player-cell player-cell--stacked">
                      <span>{{ row.full_name }}</span>
                      <div v-if="countingLabel(row)" class="row-meta">
                        {{ countingLabel(row) }}
                      </div>
                    </div>
                  </div>
                  <div class="quiet-list-cell numeric" role="cell">
                    {{ row.total_score }}
                  </div>
                </div>
                <div
                  v-if="String(selectedPlayerId) === String(row.user_id || row.id)"
                  class="best10-sheet"
                >
                  <p class="best10-sheet__label">Counting</p>
                  <div
                    v-for="score in best10Scores(row, true)"
                    :key="score.round_id"
                    class="best10-line"
                  >
                    <span>WK{{ score.week_number || "?" }}</span>
                    <span>{{ formatDayMonth(score.round_date) }}</span>
                    <span>{{ score.score }}</span>
                  </div>
                  <template v-if="best10Scores(row, false).length">
                    <p class="best10-sheet__label">Throw away</p>
                    <div
                      v-for="score in best10Scores(row, false)"
                      :key="`drop-${score.round_id}`"
                      class="best10-line best10-line--drop"
                    >
                      <span>WK{{ score.week_number || "?" }}</span>
                      <span>{{ formatDayMonth(score.round_date) }}</span>
                      <span>{{ score.score }}</span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
            <p v-else class="empty-state">No Best 10 yet.</p>
          </div>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.winter-screen {
  display: flex;
  flex-direction: column;
}

.season-back {
  margin: 0 0 0.35rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  cursor: pointer;
  text-align: left;
}

.quiet-list-row[role="row"][tabindex] {
  cursor: pointer;
}

.best10-sheet {
  padding: 0.15rem 0.05rem 0.35rem;
}

.best10-sheet__label {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.best10-line {
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr) 4.75rem;
  gap: 0.65rem;
  align-items: center;
  padding: 0.55rem 0.05rem;
  border-top: 0.5px solid var(--line);
  font-variant-numeric: tabular-nums;
}

.best10-line span:last-child {
  text-align: right;
}

.best10-line--drop {
  opacity: 0.45;
}
</style>
