<script setup>
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import QuietList from "../components/QuietList.vue";
import QuietSparkline from "../components/QuietSparkline.vue";
import { normId } from "../composables/resolveHomeDashboard.js";
import {
  buildCompetitionDateMap,
  buildScoreMapsByUserNorm,
  timelineForUser,
} from "../composables/handicapHistoryTimeline.js";
import { resolvePreferredSeason } from "../composables/useWeekResults.js";
import { leagueThemeForName } from "../lib/leagueTheme.js";

const props = defineProps({
  metadata: { type: Object, required: true },
});
const emit = defineEmits(["navigate"]);
const route = useRoute();

const playerId = computed(() => String(route.params.id || "").trim());

const profile = computed(() => {
  const profiles = props.metadata?.profiles || props.metadata?.players || [];
  const wanted = normId(playerId.value);
  return (
    profiles.find((p) => normId(p.id) === wanted) ||
    profiles.find(
      (p) =>
        String(p.full_name || "")
          .trim()
          .toLowerCase() === playerId.value.toLowerCase(),
    ) ||
    null
  );
});

const season = computed(() => resolvePreferredSeason(props.metadata));

const best14Row = computed(() => {
  const sid = season.value?.id;
  const yr = String(season.value?.start_year || "");
  const list =
    props.metadata?.best14?.[sid] || props.metadata?.best14?.[yr] || [];
  if (!Array.isArray(list) || !profile.value) return null;
  const name = String(profile.value.full_name || "")
    .trim()
    .toLowerCase();
  return (
    list.find(
      (p) =>
        normId(p.user_id || p.player_id || p.id) === normId(profile.value.id) ||
        String(p.full_name || "")
          .trim()
          .toLowerCase() === name,
    ) || null
  );
});

const leagueRow = computed(() => {
  const sid = season.value?.id;
  const yr = String(season.value?.start_year || "");
  const pack =
    props.metadata?.leagues?.[sid] || props.metadata?.leagues?.[yr] || null;
  if (!pack || !profile.value) return null;
  const name = String(profile.value.full_name || "")
    .trim()
    .toLowerCase();

  const groups = Array.isArray(pack?.groups)
    ? pack.groups
    : Array.isArray(pack)
      ? pack
      : [];

  for (const g of groups) {
    const rows = Array.isArray(g?.rows)
      ? g.rows
      : Array.isArray(g?.players)
        ? g.players
        : [];
    const hit = rows.find(
      (r) =>
        normId(r.user_id || r.player_id || r.id) === normId(profile.value.id) ||
        String(r.full_name || "")
          .trim()
          .toLowerCase() === name,
    );
    if (hit) {
      return {
        ...hit,
        league_name: g.league_name || g.name || hit.league_name,
      };
    }
  }
  return null;
});

const leagueTheme = computed(() =>
  leagueThemeForName(leagueRow.value?.league_name),
);

const historyRows = ref([]);
const trendValues = computed(() =>
  historyRows.value.map((row) => Number(row.new_handicap)).filter(Number.isFinite),
);

watch(
  [() => props.metadata, profile],
  () => {
    const p = profile.value;
    if (!p) {
      historyRows.value = [];
      return;
    }
    const history = props.metadata?.handicap_history || [];
    const competitions = props.metadata?.competitions || [];
    const rounds = props.metadata?.rounds || [];
    const results = props.metadata?.results || [];
    const dateMap = buildCompetitionDateMap(competitions);
    const scoreMaps = buildScoreMapsByUserNorm(rounds, results);
    const scoreMap = scoreMaps.get(normId(p.id)) || new Map();
    const competitionMap = new Map(
      (competitions || []).map((c) => [c.id, c.name]),
    );
    historyRows.value = timelineForUser(p.id, history, dateMap, scoreMap)
      .slice(0, 20)
      .map((item) => ({
        ...item,
        competition:
          competitionMap.get(item.competition_id) ||
          item.competition_name ||
          "Round",
        score: item.score ?? item.stableford_score ?? "—",
      }));
  },
  { immediate: true },
);

const historyColumns = [
  {
    key: "competition",
    label: "Round",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  {
    key: "score",
    label: "Score",
    className: "numeric narrow",
    width: "4.25rem",
  },
  {
    key: "new_handicap",
    label: "H'cap",
    className: "numeric",
    width: "4.75rem",
  },
];
</script>

<template>
  <section class="page-stack player-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">PLAYER</span>
          <span>{{ profile?.full_name || "Player" }}</span>
          <p class="home-hero-sublabel home-hero-subtext">
            <template v-if="leagueRow">
              {{ leagueTheme.label }} · Pos {{ leagueRow.position ?? "—" }}
            </template>
            <template v-else>Member profile</template>
          </p>
        </div>
      </div>
    </section>

    <p v-if="!profile" class="empty-state">Player not found.</p>

    <template v-else>
      <section class="player-stats" aria-label="Season snapshot">
        <div
          class="player-stat"
          :style="{ '--league-accent': leagueTheme.color }"
        >
          <span class="home-hero-sublabel">League</span>
          <strong>{{ leagueTheme.label }}</strong>
        </div>
        <div class="player-stat">
          <span class="home-hero-sublabel">Best 14</span>
          <strong>
            {{
              best14Row
                ? `${best14Row.position ?? "—"} · ${best14Row.best_total ?? best14Row.total_score ?? "—"}`
                : "—"
            }}
          </strong>
        </div>
        <div class="player-stat">
          <span class="home-hero-sublabel">Playing h'cap</span>
          <strong>{{
            profile.current_handicap ?? profile.handicap ?? "—"
          }}</strong>
        </div>
      </section>

      <section v-if="trendValues.length" class="player-trend">
        <span class="home-hero-sublabel">Handicap trend</span>
        <QuietSparkline :values="trendValues" />
      </section>

      <section class="player-history">
        <span class="home-hero-sublabel">Recent rounds</span>
        <QuietList
          :columns="historyColumns"
          :rows="historyRows"
          empty-text="No handicap history yet."
        />
      </section>

      <button
        type="button"
        class="home-card row-button player-back"
        @click="emit('navigate', { section: 'handicaps' })"
      >
        <span class="home-hero-sublabel">Directory</span>
        <strong>All handicaps</strong>
      </button>
    </template>
  </section>
</template>

<style scoped>
.player-page {
  display: grid;
  gap: 1rem;
}

.player-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}

.player-stat {
  padding: 0.85rem 0.75rem;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  border-top: 3px solid var(--league-accent, var(--accent));
}

.player-stat strong {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.95rem;
  font-weight: 700;
}

.player-trend,
.player-history {
  display: grid;
  gap: 0.45rem;
}

.player-back {
  width: 100%;
  text-align: left;
  border: 1px solid var(--line);
  background: var(--surface-2);
  cursor: pointer;
}

.player-back strong {
  display: block;
  margin-top: 0.2rem;
  font-family: var(--font-serif);
  font-size: 1.1rem;
  color: var(--text);
}
</style>
