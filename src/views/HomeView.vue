<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { resolveHomeDashboardBlock } from "../composables/resolveHomeDashboard.js";
import SeasonSplash from "../components/SeasonSplash.vue";

const emit = defineEmits(["navigate"]);
const props = defineProps({
  metadata: { type: Object, required: true },
});
const route = useRoute();

const loading = ref(true);
const error = ref("");
const best14Leaders = ref([]);
const leagueLeaders = ref([]);
const handicapMovements = ref([]);
const weekScores = ref([]);
const best10Leaders = ref([]);
const best10ByMember = ref({});
const winterMode = ref(false);
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
  handicap_changes: [],
  paid_out_pence: 0,
  winner_name: null,
});

const closedSummer = computed(() => {
  const seasons = Array.isArray(props.metadata?.seasons)
    ? props.metadata.seasons
    : [];
  return (
    seasons
      .filter(
        (s) =>
          String(s?.kind || "") === "summer_main" &&
          String(s?.status || "").toLowerCase() === "closed",
      )
      .sort((a, b) => Number(b.start_year || 0) - Number(a.start_year || 0))[0] ||
    null
  );
});

/** Permanent season landing on Home unless user chose Winter via CTA. */
const showSeasonLanding = computed(() => {
  if (props.metadata?.loading) return false;
  if (!closedSummer.value) return false;
  return String(route.query.mode || "").toLowerCase() !== "winter";
});

const homeContract = computed(() =>
  resolveHomeDashboardBlock(props.metadata),
);

const selectedBest10Card = computed(() => {
  if (!selectedPlayerId.value) return null;
  const card = best10ByMember.value?.[String(selectedPlayerId.value)];
  return card && typeof card === "object" ? card : null;
});

function onWinter() {
  emit("navigate", { section: "home", mode: "winter" });
}

function onSeasonStats(season) {
  emit("navigate", {
    section: "stats",
    seasonId: season?.id || closedSummer.value?.id,
  });
}

function normRoundId(id) {
  return String(id ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "");
}

function parseWeekNumFromLabel(wl) {
  const m = String(wl || "").match(/WEEK\s+(\d+)/i);
  const n = Number(m?.[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatDayMonthYear(isoLike) {
  const dStr =
    typeof isoLike === "string" ? isoLike.trim().slice(0, 10) : "";
  if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
  const d = new Date(`${dStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatPounds(pence) {
  const n = Number(pence) || 0;
  return `£${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}`;
}

const inferredSeasonYear = computed(() => {
  const seasons = Array.isArray(props.metadata?.seasons)
    ? props.metadata.seasons
    : [];
  const cur =
    seasons.find((s) => s?.is_current) ||
    seasons.find((s) => s?.is_active) ||
    seasons[0];
  return cur?.start_year != null && String(cur.start_year).trim() !== ""
    ? String(cur.start_year).trim()
    : "";
});

/** Week line with calendar year when we can derive a competition date */
const homeWeekDisplayLine = computed(() => {
  const wl = (homePayload.value.week_label || "").trim();
  const dash = homeContract.value;
  const dashHome =
    dash?.home && typeof dash.home === "object" ? dash.home : {};
  const focusRaw = dashHome.focus_round_id;
  const focusId =
    focusRaw != null && String(focusRaw).trim() !== ""
      ? String(focusRaw).trim()
      : "";
  const comps = Array.isArray(props.metadata?.competitions)
    ? props.metadata.competitions
    : [];
  const round =
    focusId && comps.length
      ? comps.find((c) => normRoundId(c.id) === normRoundId(focusId))
      : null;

  const datePretty = round ? formatDayMonthYear(round.competition_date) : "";
  const wn = parseWeekNumFromLabel(wl);
  if (wn != null && datePretty) return `WEEK ${wn}, ${datePretty}`;

  if (wl && inferredSeasonYear.value && !/\b(19|20)\d{2}\b/.test(wl))
    return `${wl} ${inferredSeasonYear.value}`;

  return wl || "WEEK — , —";
});

function openPlayerBest10(userId) {
  selectedPlayerId.value =
    String(selectedPlayerId.value) === String(userId) ? "" : String(userId);
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

    const dash = homeContract.value;
    if (!dash) {
      throw new Error("Missing dashboard contract data.");
    }

    const dashHome =
      dash &&
      typeof dash === "object" &&
      dash.home &&
      typeof dash.home === "object"
        ? dash.home
        : null;
    if (!dashHome) {
      throw new Error("Missing dashboard.home contract payload.");
    }

    const weekLabel =
      typeof dashHome.week_label === "string" && dashHome.week_label.trim()
        ? dashHome.week_label
        : "WEEK — , —";
    const heroMessage =
      typeof dashHome.hero_message === "string" && dashHome.hero_message.trim()
        ? dashHome.hero_message
        : "No results yet.";

    winterMode.value =
      String(dash.mode || "").toLowerCase() === "winter" ||
      (Array.isArray(dash.week_scores) && dash.week_scores.length > 0) ||
      (Array.isArray(dash.best10_leaders) && dash.best10_leaders.length > 0);

    homePayload.value = {
      week_label: weekLabel,
      hero_message: heroMessage,
      no_results:
        typeof dashHome?.no_results === "boolean" ? dashHome.no_results : false,
      stats: {
        players: Number(dashHome?.stats?.players) || 0,
        snakes: Number(dashHome?.stats?.snakes) || 0,
        camels: Number(dashHome?.stats?.camels) || 0,
      },
      handicap_changes: Array.isArray(dashHome?.handicap_changes)
        ? dashHome.handicap_changes
        : [],
      paid_out_pence: Number(dashHome?.paid_out_pence) || 0,
      winner_name: dashHome?.winner_name ? String(dashHome.winner_name) : null,
    };

    best14Leaders.value = Array.isArray(dash?.best14_leaders)
      ? dash.best14_leaders
      : [];
    leagueLeaders.value = Array.isArray(dash?.league_leaders)
      ? dash.league_leaders
      : [];
    handicapMovements.value = Array.isArray(homePayload.value.handicap_changes)
      ? homePayload.value.handicap_changes
      : [];
    weekScores.value = Array.isArray(dash?.week_scores) ? dash.week_scores : [];
    best10Leaders.value = Array.isArray(dash?.best10_leaders)
      ? dash.best10_leaders
      : [];
    best10ByMember.value =
      dash?.best10_by_member && typeof dash.best10_by_member === "object"
        ? dash.best10_by_member
        : {};

    if (!winterMode.value) {
      winterTab.value = "week";
      selectedPlayerId.value = "";
    }
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
    () => props.metadata.competitions,
    () => props.metadata.api_version,
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
  },
  { immediate: true },
);
</script>

<template>
  <SeasonSplash
    v-if="showSeasonLanding"
    :metadata="metadata"
    @winter="onWinter"
    @season-stats="onSeasonStats"
  />
  <section v-else class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">
            LATEST -
            <span>{{ homeWeekDisplayLine }}</span>
          </span>
          <template v-if="!homePayload.no_results">
            <span>{{ homePayload.hero_message }}</span>
            <p class="home-hero-sublabel home-hero-subtext">
              <template v-if="winterMode">
                {{ homePayload.stats.players }} played
                <template v-if="homePayload.paid_out_pence">
                  · {{ formatPounds(homePayload.paid_out_pence) }} paid on the night
                </template>
              </template>
              <template v-else>
                {{ homePayload.stats.players }} played,
                {{ homePayload.stats.snakes }} snakes,
                {{ homePayload.stats.camels }} camels.
              </template>
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
      <p class="empty-state">Loading dashboard…</p>
    </section>
    <section
      v-else-if="error"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">{{ error }}</p>
    </section>

    <!-- Winter home: week scores / Best 10 (all data from DB contract) -->
    <section
      v-if="!loading && !error && winterMode"
      class="home-dashboard"
      aria-label="Winter standings"
    >
      <div class="winter-toggle" role="tablist" aria-label="Winter view">
        <button
          type="button"
          role="tab"
          class="winter-toggle__btn"
          :aria-selected="winterTab === 'week'"
          :class="{ 'winter-toggle__btn--active': winterTab === 'week' }"
          @click="winterTab = 'week'"
        >
          This week
        </button>
        <button
          type="button"
          role="tab"
          class="winter-toggle__btn"
          :aria-selected="winterTab === 'best10'"
          :class="{ 'winter-toggle__btn--active': winterTab === 'best10' }"
          @click="winterTab = 'best10'"
        >
          Best 10
        </button>
      </div>

      <section v-if="winterTab === 'week'" class="home-card">
        <div class="home-card__header">
          <span class="home-hero-sublabel">Week scores</span>
        </div>
        <div class="home-compact-list">
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
      </section>

      <section v-else class="home-card">
        <div class="home-card__header">
          <span class="home-hero-sublabel">Best 10</span>
        </div>
        <div class="home-compact-list">
          <button
            v-for="row in best10Leaders"
            :key="row.user_id || row.id"
            type="button"
            class="home-compact-row home-compact-row--btn"
            :class="{
              'home-compact-row--open':
                String(selectedPlayerId) === String(row.user_id || row.id),
            }"
            @click="openPlayerBest10(row.user_id || row.id)"
          >
            <span class="home-rank">{{ row.position }}</span>
            <span class="home-name">{{ row.full_name }}</span>
            <span class="home-value">{{ row.total_score }}</span>
          </button>
          <p v-if="!best10Leaders.length" class="empty-state">No Best 10 yet.</p>
        </div>

        <div v-if="selectedBest10Card" class="best10-card">
          <div class="home-card__header">
            <span class="home-hero-sublabel">{{ selectedBest10Card.full_name }}</span>
            <strong class="best10-card__total">
              Best 10 · {{ selectedBest10Card.best_10_total }}
            </strong>
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
        </div>
      </section>
    </section>

    <!-- Summer home unchanged -->
    <section
      v-if="!loading && !error && !winterMode"
      class="home-dashboard"
      aria-label="Main sections"
    >
      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', { section: 'handicaps' })"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Handicap changes</span>
        </div>
        <div class="home-compact-list">
          <template v-if="handicapMovements.length">
            <div
              v-for="(item, idx) in handicapMovements"
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
          </template>
          <template v-else>
            <div
              style="
                font-size: 0.95em;
                opacity: 0.7;
                padding: 0.35em 0 0.15em 0;
              "
            >
              No Playing Handicap changes
            </div>
          </template>
        </div>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', { section: 'stats', tab: 'best14' })"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Best 14 LEADERS</span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="player in best14Leaders"
            :key="player.id"
            class="home-compact-row"
          >
            <span class="home-rank">{{ player.position }}</span>
            <span class="home-name">{{ player.full_name }}</span>
            <span class="home-value">{{ player.total_score }}</span>
          </div>
        </div>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', { section: 'stats', tab: 'leagues' })"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Division leaders</span>
        </div>
        <div class="home-compact-list">
          <div
            v-for="(leader, idx) in leagueLeaders.slice(0, 4)"
            :key="leader.league_name || idx"
            class="home-compact-row"
          >
            <span class="home-rank home-rank--league">{{
              leader.position ?? idx + 1
            }}</span>
            <span class="home-name">{{ leader.full_name }}</span>
            <span class="home-value">{{ leader.total_score }}</span>
          </div>
        </div>
      </button>
    </section>
  </section>
</template>

<style scoped>
.winter-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
  padding: 0.25rem;
  border: 1px solid var(--line, #3a3a3c);
  border-radius: 999px;
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
}

.winter-toggle__btn {
  border: 0;
  border-radius: 999px;
  padding: 0.7rem 0.85rem;
  background: transparent;
  color: var(--muted, #8e8e93);
  font: inherit;
  font-weight: 700;
  font-size: 0.84rem;
  cursor: pointer;
}

.winter-toggle__btn--active {
  background: var(--surface-4, rgba(255, 255, 255, 0.12));
  color: var(--text, #f5f5f7);
}

.home-compact-row--winner .home-name,
.home-compact-row--winner .home-value {
  font-weight: 750;
}

.home-compact-row--btn {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.home-compact-row--open {
  opacity: 1;
}

.home-compact-row--drop {
  opacity: 0.55;
}

.best10-card {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line, #3a3a3c);
}

.best10-card__total {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.95rem;
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
