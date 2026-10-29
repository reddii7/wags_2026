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

const showWinterDetail = computed(
  () => String(route.query.mode || "").toLowerCase() === "winter",
);

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

const summerSeasons = computed(() =>
  seasons.value
    .filter((s) => String(s?.kind || "") === "summer_main")
    .sort((a, b) => Number(b.start_year || 0) - Number(a.start_year || 0)),
);

const homeContract = computed(() =>
  resolveHomeDashboardBlock(props.metadata),
);

const winterContract = computed(() => {
  const dash = props.metadata?.dashboard || {};
  const wid = winterSeason.value?.id;
  if (wid && dash[String(wid)] && typeof dash[String(wid)] === "object") {
    return dash[String(wid)];
  }
  const resolved = homeContract.value;
  if (resolved && String(resolved.mode || "").toLowerCase() === "winter") {
    return resolved;
  }
  return null;
});

const selectedBest10Card = computed(() => {
  if (!selectedPlayerId.value) return null;
  const card = best10ByMember.value?.[String(selectedPlayerId.value)];
  return card && typeof card === "object" ? card : null;
});

function seasonLabel(season) {
  if (!season) return "Season";
  if (season.name || season.label) return String(season.name || season.label);
  if (String(season.kind || "") === "winter_reduced") {
    return `Winter ${season.start_year || ""}`.trim();
  }
  return `Summer ${season.start_year || ""}`.trim();
}

function seasonStatus(season) {
  const st = String(season?.status || "").toLowerCase();
  if (st === "open") return "Live";
  if (st === "closed") return "Complete";
  return st || "";
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

function openSummer(season) {
  triggerHapticFeedback();
  emit("navigate", {
    section: "stats",
    seasonId: season?.id,
  });
}

function backToHub() {
  triggerHapticFeedback();
  emit("navigate", { section: "home" });
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

    const dash = winterContract.value || homeContract.value;
    if (!dash) {
      homePayload.value = {
        week_label: "WEEK — , —",
        hero_message: "No results yet.",
        no_results: true,
        stats: { players: 0, snakes: 0, camels: 0 },
        paid_out_pence: 0,
        winner_name: null,
      };
      weekScores.value = [];
      best10Leaders.value = [];
      best10ByMember.value = {};
      return;
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

    homePayload.value = {
      week_label:
        typeof dashHome.week_label === "string" && dashHome.week_label.trim()
          ? dashHome.week_label
          : "WEEK — , —",
      hero_message:
        typeof dashHome.hero_message === "string" &&
        dashHome.hero_message.trim()
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

    weekScores.value = Array.isArray(dash?.week_scores) ? dash.week_scores : [];
    best10Leaders.value = Array.isArray(dash?.best10_leaders)
      ? dash.best10_leaders
      : [];
    best10ByMember.value =
      dash?.best10_by_member && typeof dash.best10_by_member === "object"
        ? dash.best10_by_member
        : {};
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
    if (!showWinterDetail.value) {
      selectedPlayerId.value = "";
      winterTab.value = "week";
    }
    loadHomeData();
  },
  { immediate: true },
);
</script>

<template>
  <!-- Season hub -->
  <section v-if="!showWinterDetail" class="page-stack home-page home-hub">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">SUTTON WAGS</span>
          <span>Home</span>
          <p class="home-hero-sublabel home-hero-subtext">
            Pick Winter or Summer.
          </p>
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

    <section
      v-else
      class="home-dashboard home-hub__links"
      aria-label="Seasons"
    >
      <button
        v-if="winterSeason"
        type="button"
        class="home-card row-button home-hub__link"
        @click="openWinter"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">
            {{ seasonLabel(winterSeason) }}
            <span v-if="seasonStatus(winterSeason)" class="home-hub__badge">
              {{ seasonStatus(winterSeason) }}
            </span>
          </span>
        </div>
        <strong class="home-hub__title">Week scores &amp; Best 10</strong>
        <p v-if="!homePayload.no_results" class="home-hub__teaser">
          {{ homePayload.hero_message }}
        </p>
        <p v-else class="home-hub__teaser">No winter results yet.</p>
      </button>

      <button
        v-for="season in summerSeasons"
        :key="season.id"
        type="button"
        class="home-card row-button home-hub__link"
        @click="openSummer(season)"
      >
        <div class="home-card__header">
          <span class="home-hero-sublabel">
            {{ seasonLabel(season) }}
            <span v-if="seasonStatus(season)" class="home-hub__badge">
              {{ seasonStatus(season) }}
            </span>
          </span>
        </div>
        <strong class="home-hub__title">
          {{
            String(season.status || "").toLowerCase() === "closed"
              ? "Results & honour roll"
              : "Results, leagues & Best 14"
          }}
        </strong>
        <p class="home-hub__teaser">
          {{
            String(season.status || "").toLowerCase() === "closed"
              ? "Browse the finished summer season."
              : "Summer still open — browse scores and standings."
          }}
        </p>
      </button>
    </section>
  </section>

  <!-- Winter detail -->
  <section v-else class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <button
            type="button"
            class="home-back"
            @click="backToHub"
          >
            ← Home
          </button>
          <span class="home-hero-sublabel2 wags-body">
            {{ homePayload.week_label }}
          </span>
          <template v-if="!homePayload.no_results">
            <span>{{ homePayload.hero_message }}</span>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ homePayload.stats.players }} played
              <template v-if="homePayload.paid_out_pence">
                · {{ formatPounds(homePayload.paid_out_pence) }} paid on the night
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
      <p class="empty-state">Loading winter…</p>
    </section>
    <section
      v-else-if="error"
      class="content-panel content-panel--minimal home-status"
    >
      <p class="empty-state">{{ error }}</p>
    </section>

    <section
      v-else
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
  </section>
</template>

<style scoped>
.home-hub__links {
  display: grid;
  gap: 0.75rem;
}

.home-hub__link {
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.home-hub__title {
  display: block;
  margin-top: 0.2rem;
  font-family: var(--font-serif);
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text);
}

.home-hub__teaser {
  margin: 0.45rem 0 0;
  color: var(--muted, #8e8e93);
  font-size: 0.9rem;
  line-height: 1.35;
}

.home-hub__badge {
  margin-left: 0.45rem;
  color: var(--accent, #3a5a40);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.home-back {
  display: inline-flex;
  align-items: center;
  margin: 0 0 0.55rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted, #8e8e93);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
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
