<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { resolveHomeDashboardBlock } from "../composables/resolveHomeDashboard.js";
import {
  formatShortDate,
  pickDefaultCompetitionId,
  resolvePreferredSeason,
  resolveSeasonResultsContract,
  weekNumberMapFromCompetitions,
} from "../composables/useWeekResults.js";
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
  focus_round_id: "",
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

const preferredSeason = computed(() =>
  resolvePreferredSeason(props.metadata),
);

const resultsContract = computed(() =>
  resolveSeasonResultsContract(props.metadata, preferredSeason.value),
);

const focusRoundId = computed(() => {
  const fromHome = homePayload.value.focus_round_id;
  if (fromHome) return fromHome;
  return pickDefaultCompetitionId(resultsContract.value) || "";
});

const weekTopRows = computed(() => {
  const id = focusRoundId.value;
  if (!id) return [];
  const rows = resultsContract.value?.rows_by_competition?.[id];
  return Array.isArray(rows) ? rows.slice(0, 5) : [];
});

const weekSummary = computed(() => {
  const id = focusRoundId.value;
  if (!id) return null;
  return resultsContract.value?.summary_by_competition?.[id] || null;
});

const campaignLabel = computed(() => {
  const s = preferredSeason.value;
  if (!s) return "";
  const kind = String(s.kind || "");
  const status = String(s.status || "").toLowerCase();
  const name = s.label || s.name || `Season ${s.start_year || ""}`;
  if (kind === "winter_reduced") return `${name} · open`;
  if (status) return `${name} · ${status}`;
  return name;
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

function openWeekHub() {
  const round = focusRoundId.value;
  emit("navigate", {
    section: "week",
    roundId: round || undefined,
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

const homeWeekDisplayLine = computed(() => {
  const wl = (homePayload.value.week_label || "").trim();
  const focusId = focusRoundId.value;
  const comps = Array.isArray(props.metadata?.competitions)
    ? props.metadata.competitions
    : [];
  const round =
    focusId && comps.length
      ? comps.find((c) => normRoundId(c.id) === normRoundId(focusId))
      : null;

  const datePretty = round
    ? formatDayMonthYear(round.competition_date)
    : formatShortDate(weekSummary.value?.week_date);
  const wn =
    parseWeekNumFromLabel(wl) ||
    weekNumberMapFromCompetitions(
      resultsContract.value?.competitions || [],
    ).get(String(focusId));

  if (wn != null && datePretty) return `WEEK ${wn}, ${datePretty}`;
  if (wl && inferredSeasonYear.value && !/\b(19|20)\d{2}\b/.test(wl))
    return `${wl} ${inferredSeasonYear.value}`;
  return wl || "WEEK — , —";
});

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
    const focusRaw = dashHome.focus_round_id;

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
      focus_round_id:
        focusRaw != null && String(focusRaw).trim() !== ""
          ? String(focusRaw).trim()
          : "",
    };

    best14Leaders.value = Array.isArray(dash?.best14_leaders)
      ? dash.best14_leaders.slice(0, 3)
      : [];

    leagueLeaders.value = Array.isArray(dash?.league_leaders)
      ? dash.league_leaders.slice(0, 4)
      : [];

    handicapMovements.value = Array.isArray(homePayload.value.handicap_changes)
      ? homePayload.value.handicap_changes.slice(0, 5)
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
  <section v-else class="page-stack home-page home-latest">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">LATEST</span>
          <span class="home-hero-sublabel wags-body">{{
            homeWeekDisplayLine
          }}</span>
          <template v-if="!homePayload.no_results">
            <span>{{ homePayload.hero_message }}</span>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ homePayload.stats.players }} played,
              {{ homePayload.stats.snakes }} snakes,
              {{ homePayload.stats.camels }} camels.
            </p>
          </template>
          <template v-else-if="!loading && !metadata.loading">
            No results yet.
          </template>
        </div>
        <p v-if="campaignLabel" class="home-latest__campaign">
          {{ campaignLabel }}
        </p>
      </div>
    </section>

    <section
      v-if="loading"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">Loading latest…</p>
    </section>
    <section
      v-else-if="error"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">{{ error }}</p>
    </section>

    <section
      v-if="!loading && !error"
      class="home-dashboard"
      aria-label="Latest"
    >
      <button
        class="home-card row-button"
        type="button"
        @click="openWeekHub"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">This week</span>
        </div>
        <div class="home-compact-list">
          <template v-if="weekTopRows.length">
            <div
              v-for="row in weekTopRows"
              :key="`${row.position}-${row.player}`"
              class="home-compact-row"
            >
              <span class="home-rank">{{ row.position }}</span>
              <span class="home-name">{{ row.player }}</span>
              <span class="home-value">{{ row.score }}</span>
            </div>
          </template>
          <template v-else>
            <div class="home-latest__empty">No week results yet</div>
          </template>
        </div>
        <span class="home-latest__cta">Open week hub →</span>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', { section: 'handicaps' })"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Handicap movers</span>
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
            <div class="home-latest__empty">No Playing Handicap changes</div>
          </template>
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
          <template v-if="leagueLeaders.length">
            <div
              v-for="(leader, idx) in leagueLeaders"
              :key="leader.league_name || idx"
              class="home-compact-row"
            >
              <span class="home-rank home-rank--league">{{
                leader.position ?? idx + 1
              }}</span>
              <span class="home-name">{{ leader.full_name }}</span>
              <span class="home-value">{{ leader.total_score }}</span>
            </div>
          </template>
          <template v-else>
            <div class="home-latest__empty">No division leaders yet</div>
          </template>
        </div>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="$emit('navigate', { section: 'stats', tab: 'best14' })"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">Best 14 leaders</span>
        </div>
        <div class="home-compact-list">
          <template v-if="best14Leaders.length">
            <div
              v-for="player in best14Leaders"
              :key="player.id"
              class="home-compact-row"
            >
              <span class="home-rank">{{ player.position }}</span>
              <span class="home-name">{{ player.full_name }}</span>
              <span class="home-value">{{ player.total_score }}</span>
            </div>
          </template>
          <template v-else>
            <div class="home-latest__empty">No Best 14 data yet</div>
          </template>
        </div>
      </button>

      <button
        v-if="closedSummer"
        class="home-card row-button home-latest__season"
        type="button"
        @click="
          $emit('navigate', {
            section: 'stats',
            seasonId: closedSummer.id,
            tab: 'history',
          })
        "
      >
        <span class="home-hero-sublabel">Season story</span>
        <strong>{{ closedSummer.label || "Summer honour roll" }}</strong>
      </button>
    </section>
  </section>
</template>

<style scoped>
.home-latest__campaign {
  margin: 0.85rem 0 0;
  color: var(--muted);
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 650;
}

.home-latest__empty {
  font-size: 0.95em;
  opacity: 0.7;
  padding: 0.35em 0 0.15em;
}

.home-latest__cta {
  display: block;
  margin-top: 0.55rem;
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.home-latest__season {
  text-align: left;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.home-latest__season strong {
  display: block;
  margin-top: 0.2rem;
  font-family: var(--font-serif);
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text);
}
</style>
