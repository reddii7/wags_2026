<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { resolveHomeDashboardBlock } from "../composables/resolveHomeDashboard.js";

const emit = defineEmits(["navigate"]);
const props = defineProps({
  metadata: { type: Object, required: true },
});

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
});

const homeContract = computed(() =>
  resolveHomeDashboardBlock(props.metadata),
);

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
    };

    // Backend-prepared home card leaders.
    const dashboardBest14 = Array.isArray(dash?.best14_leaders)
      ? dash.best14_leaders
      : [];
    const dashboardLeagues = Array.isArray(dash?.league_leaders)
      ? dash.league_leaders
      : [];

    best14Leaders.value = dashboardBest14;

    leagueLeaders.value = dashboardLeagues;

    handicapMovements.value = Array.isArray(homePayload.value.handicap_changes)
      ? homePayload.value.handicap_changes
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
  <section class="page-stack home-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">
            LATEST UPDATES -
            <span>{{ homePayload.week_label }}</span>
          </span>
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

    <section
      v-if="!loading && !error"
      class="home-dashboard"
      aria-label="Main sections"
    >
      <!-- Results summary moved to hero above -->

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
.home-label {
  color: #888;
  font-size: 0.85em;
  margin-right: 0.25em;
}
.home-num {
  font-weight: bold;
  font-size: 1.1em;
}

/* Use the same color for the headline as the player names */
.home-news-headline.home-name {
  color: #e2e2e2;
}
</style>
