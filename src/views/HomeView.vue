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

const winterHeadline = computed(() => {
  if (winterTab.value === "best10") return { title: "Best 10", date: "" };
  const summary = selectedWeekSummary.value;
  const weekNo = Number(summary?.week_number);
  const dateLabel = formatDayMonth(summary?.week_date);
  if (Number.isFinite(weekNo) && weekNo > 0) {
    return { title: `Week ${weekNo}`, date: dateLabel };
  }
  const parts = winterWeekParts.value;
  return { title: parts.week || "Winter", date: parts.date };
});

const winterReady = computed(
  () => !homePayload.value.no_results && !!winterWeekParts.value.week,
);

const homeHeadlineLines = computed(() => {
  if (!winterReady.value) return ["No", "scores", "yet."];
  const name = String(
    homePayload.value.winner_name || winterWeekParts.value.week || "Winter",
  ).trim();
  const words = name.split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return ["Winter."];
  return words.map((word, index) =>
    index === words.length - 1 ? `${word}.` : word,
  );
});

const homeBlurb = computed(() => {
  if (!winterReady.value) {
    return "Week scores and Best 10 show here once the first round is in.";
  }
  const parts = winterWeekParts.value;
  const when = [parts.week, parts.date].filter(Boolean).join(", ");
  const paid = Number(homePayload.value.paid_out_pence) || 0;
  const players = Number(homePayload.value.stats?.players) || 0;
  const money =
    paid > 0
      ? `${formatPounds(paid)} paid on the night`
      : "Winnings paid on the night";
  const field = players > 0 ? ` from a field of ${players}` : "";
  return `${when}. ${money}${field}.`;
});

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

function openWinter(tab) {
  triggerHapticFeedback();
  emit("navigate", {
    section: "home",
    mode: "winter",
    tab: tab === "best10" ? "best10" : "week",
  });
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
  <!-- Home: editorial front. Winter opens the board, summer the full app. -->
  <section v-if="!isWinter" class="page-stack home-page">
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

    <div v-else class="home-hub">
      <p class="home-hub__chip">
        Winter{{ winterSeason?.start_year ? ` ${winterSeason.start_year}` : "" }}
      </p>
      <h1 class="home-hub__display">
        <span
          v-for="(line, index) in homeHeadlineLines"
          :key="`${index}-${line}`"
        >{{ line }}</span>
      </h1>
      <p class="home-hub__blurb">{{ homeBlurb }}</p>
      <div class="home-hub__actions">
        <button
          type="button"
          class="home-hub__primary"
          :disabled="!winterSeason"
          @click="openWinter()"
        >
          Open winter →
        </button>
        <button
          type="button"
          class="home-hub__secondary"
          :disabled="!summerSeason"
          @click="openSummer"
        >
          Summer{{ summerSeason?.start_year ? ` ${summerSeason.start_year}` : "" }}
        </button>
      </div>
      <button
        v-if="winterReady"
        type="button"
        class="home-hub__link"
        @click="openWinter('best10')"
      >
        The rolling pot
      </button>
      <div v-if="winterReady" class="home-hub__panel">
        <span class="home-hub__badge">
          {{ winterWeekParts.date || winterWeekParts.week }}
          <template v-if="homePayload.stats.players">
            · {{ homePayload.stats.players }} played
          </template>
        </span>
        <strong>{{ formatPounds(homePayload.rolling_pot_pence) }}</strong>
        <span class="home-hub__panel-label">Rolling pot</span>
      </div>
    </div>
  </section>

  <!-- Winter, standalone: no summer nav. Home is the way back. -->
  <section v-else class="page-stack home-page winter-screen">
    <header class="winter-mast">
      <p class="winter-mast__kicker">Winter</p>
      <div class="winter-mast__row">
        <h1 class="winter-mast__title">{{ winterHeadline.title }}</h1>
        <p v-if="winterHeadline.date" class="winter-mast__date">
          {{ winterHeadline.date }}
        </p>
      </div>
      <p v-if="winterTab === 'week' && selectedWeekHero" class="winter-mast__note">
        {{ selectedWeekHero }}
      </p>
      <p
        v-else-if="!loading && !metadata.loading && homePayload.no_results"
        class="winter-mast__note"
      >
        No results yet.
      </p>
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
        <svg class="winter-dock__defs" width="0" height="0" aria-hidden="true">
          <filter
            id="wags-winter-lens"
            x="-8%"
            y="-20%"
            width="116%"
            height="140%"
            color-interpolation-filters="sRGB"
          >
            <feImage
              preserveAspectRatio="none"
              result="map"
              href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='74'%3E%3ClinearGradient id='x'%3E%3Cstop stop-color='red'/%3E%3Cstop offset='1'/%3E%3C/linearGradient%3E%3ClinearGradient id='y' x2='0' y2='1'%3E%3Cstop stop-color='lime'/%3E%3Cstop offset='1'/%3E%3C/linearGradient%3E%3Crect width='400' height='74' fill='url(%23x)'/%3E%3Crect width='400' height='74' fill='url(%23y)' style='mix-blend-mode:screen'/%3E%3Crect x='16' y='14' width='368' height='46' rx='23' fill='gray' style='filter:blur(6px)'/%3E%3C/svg%3E"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale="28"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
        <span class="winter-dock__body" aria-hidden="true"></span>
        <span class="winter-dock__lens" aria-hidden="true"></span>
        <span class="winter-dock__pill" aria-hidden="true"></span>
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
.home-hub {
  --hub-ink: #1a241c;
  --hub-chip: #1c2b22;
  --hub-chip-ink: #f4f7f2;
  --hub-line: rgba(28, 43, 34, 0.28);
  --hub-panel: #d5e0d4;
  --hub-badge: rgba(244, 247, 242, 0.88);
  --hub-badge-ink: #1a241c;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: calc(100dvh - 9.6rem);
  padding: 0.2rem 0.15rem 0.3rem;
  color: var(--hub-ink);
  background: #e7eee4;
}

:global([data-theme="dark"]) .home-hub {
  --hub-ink: #f3f5f1;
  --hub-chip: #e7efe4;
  --hub-chip-ink: #1a241c;
  --hub-line: rgba(243, 245, 241, 0.35);
  --hub-panel: #2a312c;
  --hub-badge: rgba(26, 36, 28, 0.72);
  --hub-badge-ink: #f3f5f1;
  background: transparent;
}

.home-hub__chip {
  margin: 0;
  padding: 0.42rem 0.85rem;
  border-radius: 999px;
  background: var(--hub-chip);
  color: var(--hub-chip-ink);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.home-hub__display {
  margin: 0.95rem 0 0;
  color: var(--hub-ink);
  font-family: "Arial Narrow", "SF Pro Display", var(--font-serif), sans-serif;
  width: 100%;
  font-size: min(3.55rem, 11.5cqi);
  font-weight: 700;
  letter-spacing: -0.05em;
  line-height: 0.84;
  text-transform: uppercase;
}

.home-hub__display span {
  display: block;
}

.home-hub__blurb {
  max-width: 34rem;
  margin: 1.15rem 0 0;
  color: var(--hub-ink);
  font-size: 1.05rem;
  font-weight: 450;
  line-height: 1.45;
}

.home-hub__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.15rem;
}

.home-hub__primary,
.home-hub__secondary,
.home-hub__link {
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.home-hub__primary,
.home-hub__secondary {
  border-radius: 999px;
  padding: 0.82rem 1.15rem;
  font-size: 1rem;
  font-weight: 650;
  white-space: nowrap;
}

.home-hub__primary {
  border: 0;
  background: var(--hub-chip);
  color: var(--hub-chip-ink);
}

.home-hub__secondary {
  border: 1.5px solid var(--hub-line);
  background: transparent;
  color: var(--hub-ink);
}

.home-hub__link {
  margin-top: 0.95rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--hub-ink);
  font-size: 1rem;
  text-decoration: underline;
  text-underline-offset: 0.22em;
}

.home-hub__primary:disabled,
.home-hub__secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.home-hub__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  width: 100%;
  min-height: 11.5rem;
  margin-top: auto;
  padding: 1.15rem 1.15rem 1.2rem;
  border-radius: 28px;
  background: var(--hub-panel);
  color: var(--hub-ink);
}

.home-hub__panel strong {
  font-family: "Arial Narrow", "SF Pro Display", var(--font-serif), sans-serif;
  font-size: 4.4rem;
  font-weight: 700;
  letter-spacing: -0.05em;
  line-height: 0.85;
}

.home-hub__panel-label {
  margin-top: 0.35rem;
  font-size: 0.95rem;
}

.home-hub__badge {
  position: absolute;
  top: 0.85rem;
  right: 0.85rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  background: var(--hub-badge);
  color: var(--hub-badge-ink);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (max-width: 640px) {
  .home-hub {
    min-height: calc(
      100dvh - 4.05rem - 5.8rem - env(safe-area-inset-bottom, 0px) + 1.55rem
    );
    margin: -1.55rem -0.74rem 0;
    padding: 0.35rem 1.15rem 0.45rem;
  }
}

.winter-mast {
  padding: 0.15rem 0.1rem 0.35rem;
}

.winter-mast__kicker {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

.winter-mast__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.28rem;
}

.winter-mast__title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.85rem;
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.winter-mast__date,
.winter-mast__note {
  margin: 0;
  color: var(--muted, #8e8e93);
}

.winter-mast__date {
  font-size: 0.95rem;
  font-weight: 600;
}

.winter-mast__note {
  margin-top: 0.45rem;
  font-size: 0.98rem;
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
  height: 4.65rem;
  padding: 5px;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38);
}

.winter-dock__defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.winter-dock__body,
.winter-dock__lens {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.winter-dock__body {
  z-index: 0;
  background: rgba(14, 14, 18, 0.42);
  -webkit-backdrop-filter: blur(4px) saturate(1.85);
  backdrop-filter: blur(4px) saturate(1.85);
}

.winter-dock__lens {
  z-index: 1;
  background: linear-gradient(rgba(255, 255, 255, 0.2), transparent 48%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.75),
    inset 0 -1px 0 rgba(0, 0, 0, 0.38),
    inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  -webkit-backdrop-filter: url("#wags-winter-lens");
  backdrop-filter: url("#wags-winter-lens");
}

.winter-dock__pill {
  position: absolute;
  z-index: 2;
  top: 5px;
  bottom: 5px;
  left: 5px;
  width: calc((100% - 10px) / 3);
  border-radius: 999px;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.2),
    rgba(255, 255, 255, 0.05) 42%,
    rgba(0, 0, 0, 0.18)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 -1px 0 rgba(0, 0, 0, 0.32),
    inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  transform: translateX(calc(var(--dock-i) * 100%));
  transition: transform 0.55s cubic-bezier(0.22, 1.35, 0.36, 1);
}

.winter-dock button {
  position: relative;
  z-index: 3;
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

@media (prefers-reduced-transparency: reduce) {
  .winter-dock__body {
    background: rgba(18, 18, 22, 0.94);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

  .winter-dock__lens {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .winter-dock__pill,
  .winter-dock__hit {
    transition: none;
  }
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
