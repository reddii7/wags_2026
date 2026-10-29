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

const seasonMode = computed(() => {
  const raw = String(route.query.mode || "").toLowerCase();
  if (raw === "summer" && summerSeason.value) return "summer";
  if (raw === "winter" && winterSeason.value) return "winter";
  if (winterSeason.value) return "winter";
  if (summerSeason.value) return "summer";
  return "winter";
});

const isWinter = computed(() => seasonMode.value === "winter");

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

function setSeasonMode(mode) {
  triggerHapticFeedback();
  const next = String(mode || "").toLowerCase() === "summer" ? "summer" : "winter";
  emit("navigate", { section: "home", mode: next });
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
  <section class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">SUTTON WAGS</span>

          <div
            class="season-switch"
            role="tablist"
            aria-label="Winter or Summer"
          >
            <button
              type="button"
              role="tab"
              class="season-switch__btn"
              :aria-selected="isWinter"
              :class="{ 'season-switch__btn--active': isWinter }"
              :disabled="!winterSeason"
              @click="setSeasonMode('winter')"
            >
              Winter
            </button>
            <button
              type="button"
              role="tab"
              class="season-switch__btn"
              :aria-selected="!isWinter"
              :class="{ 'season-switch__btn--active': !isWinter }"
              :disabled="!summerSeason"
              @click="setSeasonMode('summer')"
            >
              Summer
            </button>
          </div>

          <span class="home-hero-sublabel2 wags-body home-week-line">
            LATEST —
            <span>{{ activeHero.week_label }}</span>
          </span>

          <template v-if="!activeHero.no_results">
            <span>{{ activeHero.hero_message }}</span>
            <p class="home-hero-sublabel home-hero-subtext">
              <template v-if="isWinter">
                {{ activeHero.stats.players }} played
                <template v-if="activeHero.paid_out_pence">
                  · {{ formatPounds(activeHero.paid_out_pence) }} paid on the night
                </template>
              </template>
              <template v-else>
                {{ activeHero.stats.players }} played,
                {{ activeHero.stats.snakes }} snakes,
                {{ activeHero.stats.camels }} camels.
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

    <!-- Winter: week / Best 10 -->
    <section
      v-else-if="isWinter"
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

    <!-- Summer: current summer only -->
    <section
      v-else
      class="home-dashboard"
      aria-label="Summer standings"
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
            <div class="home-empty-inline">No Playing Handicap changes</div>
          </template>
        </div>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="
          $emit('navigate', {
            section: 'stats',
            tab: 'best14',
            seasonId: summerSeason?.id,
          })
        "
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
          <p v-if="!best14Leaders.length" class="empty-state">No Best 14 yet.</p>
        </div>
      </button>

      <button
        class="home-card row-button"
        type="button"
        @click="
          $emit('navigate', {
            section: 'stats',
            tab: 'leagues',
            seasonId: summerSeason?.id,
          })
        "
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
          <p v-if="!leagueLeaders.length" class="empty-state">No leagues yet.</p>
        </div>
      </button>
    </section>
  </section>
</template>

<style scoped>
.season-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
  margin: 0.15rem 0 1.1rem;
  padding: 0.3rem;
  border: 1px solid var(--line, #3a3a3c);
  border-radius: 16px;
  background: var(--surface-2, rgba(255, 255, 255, 0.04));
}

.season-switch__btn {
  border: 0;
  border-radius: 12px;
  padding: 0.95rem 0.75rem;
  background: transparent;
  color: var(--muted, #8e8e93);
  font: inherit;
  font-family: var(--font-serif);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  cursor: pointer;
}

.season-switch__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.season-switch__btn--active {
  background: var(--surface-4, rgba(255, 255, 255, 0.14));
  color: var(--text, #f5f5f7);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #3a5a40) 45%, transparent);
}

.home-week-line {
  margin-top: 0.15rem;
}

.home-empty-inline {
  font-size: 0.95em;
  opacity: 0.7;
  padding: 0.35em 0 0.15em;
}

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
