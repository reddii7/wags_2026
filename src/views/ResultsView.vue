<script setup>
import { computed, ref, watch } from "vue";
import QuietList from "../components/QuietList.vue";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const selectedCompetitionId = ref(null);
const summary = ref({
  amount: 0,
  num_players: 0,
  snakes: 0,
  camels: 0,
  week_number: null,
  week_date: null,
  winner_names: [],
  second_names: [],
});
const error = ref("");
const loading = ref(false);
const detailsLoading = ref(false);
const competitions = computed(() => props.metadata?.competitions || []);
const results = computed(() => props.metadata?.results || []);
const rounds = computed(() => props.metadata?.rounds || []);
const profiles = computed(() => props.metadata?.profiles || []);
const summaries = computed(() => props.metadata?.summaries || []);
const rows = computed(() => {
  const selectedId = selectedCompetitionId.value;
  if (!selectedId) return [];

  const directRows = results.value
    .filter((r) => r.competition_id === selectedId)
    .map((row) => ({
      ...row,
      position: row.position ?? row.pos ?? row.rank_no ?? row.rank ?? "",
    }));

  if (directRows.length > 0) return directRows;

  const nameById = new Map(
    profiles.value.map((profile) => [profile.id, profile.full_name]),
  );

  return rounds.value
    .filter((r) => r.competition_id === selectedId)
    .map((row) => ({
      id: row.id,
      competition_id: row.competition_id,
      user_id: row.user_id,
      player: nameById.get(row.user_id) || row.player || "Unknown",
      score: row.stableford_score ?? row.score ?? 0,
      snake: Boolean(row.snake ?? row.has_snake),
      camel: Boolean(row.camel ?? row.has_camel),
      position: row.position ?? row.pos ?? row.rank_no ?? row.rank ?? "",
    }))
    .sort((a, b) => {
      const pa = Number(a.position);
      const pb = Number(b.position);
      if (Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) {
        return pa - pb;
      }
      const sa = Number(a.score);
      const sb = Number(b.score);
      if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) {
        return sb - sa;
      }
      return String(a.player).localeCompare(String(b.player));
    })
    .map((row, index) => ({
      ...row,
      position: row.position || index + 1,
    }));
});

const columns = [
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

const selectedCompetition = computed(
  () =>
    competitions.value.find(
      (competition) => competition.id === selectedCompetitionId.value,
    ) || null,
);

// Robustly filter competitions for the selected season (by id or start_year)
const competitionsForSeason = computed(() => {
  if (!props.season) return [];
  const seasonId = props.season.id;
  const seasonYear = String(props.season.start_year);
  return competitions.value.filter((competition) => {
    return (
      competition.season === seasonId ||
      String(competition.season) === seasonYear
    );
  });
});

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
};

const selectedCompetitionDate = computed(() =>
  formatDate(selectedCompetition.value?.competition_date),
);

const selectedCompetitionWeekLabel = computed(() => {
  const name = selectedCompetition.value?.name;
  if (!name) return "";

  const match = String(name).match(/\b(week\s*\d+)\b/i);
  if (!match) return "";

  return match[1].replace(/^week/i, "Week").replace(/\s+/g, " ");
});

const selectedCompetitionTitle = computed(() => {
  const name = selectedCompetition.value?.name;
  if (!name) return "Results";

  const cleaned = String(name)
    .replace(/^\s*\d{4}\s*/, "")
    .replace(/\bweek\s*\d+\b/i, "")
    .replace(/^[\s-,:|]+|[\s-,:|]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || "Results";
});

const weekNumberMap = computed(() => {
  const map = new Map();
  const chronological = [...competitionsForSeason.value].sort(
    (a, b) => new Date(a.competition_date) - new Date(b.competition_date),
  );
  chronological.forEach((comp, index) => {
    map.set(comp.id, index + 1);
  });
  return map;
});

const formatWeekLabel = (competition) => {
  if (!competition) return "Week";
  const num = weekNumberMap.value.get(competition.id);
  return num ? `WK${num}` : formatDate(competition.competition_date);
};

const leadingRows = computed(() => {
  const topScore = rows.value[0]?.score;
  if (topScore === undefined || topScore === null || topScore === "—") {
    return [];
  }

  return rows.value.filter((row) => row.score === topScore);
});

const winnerLabel = computed(() =>
  leadingRows.value.length > 1 ? "Winners" : "Winner",
);

const winnerValue = computed(() => {
  if (!leadingRows.value.length) return "TBC";
  const names = leadingRows.value.map((row) => row.player).join(", ");
  const score = leadingRows.value[0]?.score;
  return score !== undefined && score !== null ? `${names} (${score})` : names;
});

const heroWinnerNames = computed(() => {
  if (summary.value?.winner_names && summary.value.winner_names.length) {
    return summary.value.winner_names;
  }
  return leadingRows.value.map((row) => row.player);
});

const formattedHeroWinnerNames = computed(() => {
  const names = heroWinnerNames.value || [];
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.slice(-1)}`;
});

const heroRolloverAmount = computed(() => {
  // For tie/rollover weeks, show cumulative carry across the current tie streak.
  if (selectedCompetitionId.value) {
    const sorted = [...competitionsForSeason.value].sort(
      (a, b) => new Date(a.competition_date) - new Date(b.competition_date),
    );
    const idx = sorted.findIndex((c) => c.id === selectedCompetitionId.value);
    if (idx !== -1) {
      const selectedSummary = summaries.value.find(
        (s) => s.competition_id === selectedCompetitionId.value,
      );
      if (selectedSummary?.winner_type === "tie") {
        let total = 0;
        for (let i = idx; i >= 0; i -= 1) {
          const compId = sorted[i]?.id;
          const s = summaries.value.find(
            (row) => row.competition_id === compId,
          );
          if (!s || s.winner_type !== "tie") break;
          const amt = Number(s.amount);
          if (Number.isFinite(amt) && amt > 0) total += amt;
        }
        if (total > 0) return total;
      }
    }
  }

  const summaryAmount = Number(summary.value?.amount);
  if (Number.isFinite(summaryAmount) && summaryAmount > 0) return summaryAmount;

  const rollover = Number(selectedCompetition.value?.rollover_amount);
  if (Number.isFinite(rollover) && rollover > 0) return rollover;

  return 0;
});

const heroWinnerAmount = computed(() => {
  const summaryAmount = Number(summary.value?.amount);
  if (Number.isFinite(summaryAmount) && summaryAmount > 0) return summaryAmount;

  const prizePot = Number(selectedCompetition.value?.prize_pot);
  if (Number.isFinite(prizePot) && prizePot > 0) return prizePot;

  return 0;
});

const syncSelectedCompetition = () => {
  const seasonCompetitions = competitionsForSeason.value;
  if (!seasonCompetitions.length) {
    selectedCompetitionId.value = null;
    return;
  }
  if (
    seasonCompetitions.some(
      (competition) => competition.id === selectedCompetitionId.value,
    )
  ) {
    return;
  }
  // Sort competitions by date ascending and select the last (most recent)
  const sorted = [...seasonCompetitions].sort(
    (a, b) => new Date(a.competition_date) - new Date(b.competition_date),
  );
  selectedCompetitionId.value = sorted[sorted.length - 1]?.id || null;
};

// Watch for changes in season, metadata, or selectedCompetitionId
watch(
  () => [props.season?.id, props.metadata, selectedCompetitionId.value],
  () => {
    syncSelectedCompetition();
    if (selectedCompetitionId.value) {
      const found = summaries.value.find(
        (s) => s.competition_id === selectedCompetitionId.value,
      );
      summary.value = found || {
        amount: 0,
        num_players: 0,
        snakes: 0,
        camels: 0,
        week_number: null,
        week_date: null,
        winner_names: [],
        second_names: [],
      };
      // Removed debug logging
    } else {
      summary.value = {
        amount: 0,
        num_players: 0,
        snakes: 0,
        camels: 0,
        week_number: null,
        week_date: null,
        winner_names: [],
        second_names: [],
      };
      // Removed debug logging
    }
  },
  { immediate: true },
);
</script>

<template>
  <section class="page-stack">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel wags-body">
            <template
              v-if="
                selectedCompetition && weekNumberMap.has(selectedCompetitionId)
              "
            >
              WEEK {{ weekNumberMap.get(selectedCompetitionId) }},
              {{ selectedCompetitionDate }}
            </template>
            <template v-else>
              <span style="opacity: 0.5">WEEK &mdash; , &mdash;</span>
            </template>
          </span>
          <template v-if="leadingRows.length">
            <template
              v-if="
                summary.winner_type === 'rollover' ||
                summary.winner_type === 'tie'
              "
            >
              <span>
                A rollover with
                {{ ` ${formattedHeroWinnerNames}` }}
                all scoring
                <template v-if="leadingRows.length">
                  {{ " " + leadingRows[0].score }}
                </template>
                , £{{ heroRolloverAmount.toFixed(2) }} rolled over to next week.
              </span>
            </template>
            <template
              v-else-if="
                summary.winner_type === 'winner' &&
                summary.winner_names &&
                summary.winner_names.length === 1
              "
            >
              <span>
                A win for {{ summary.winner_names[0] }}
                <template v-if="leadingRows.length">
                  with {{ leadingRows[0].score }} points
                </template>
                , adding £{{ heroWinnerAmount.toFixed(2) }} to his season
                winnings.
              </span>
            </template>
            <template
              v-else-if="
                summary.winner_type === 'winner' &&
                summary.winner_names &&
                summary.winner_names.length > 1
              "
            >
              <span>
                {{ summary.winner_names.join(", ") }} tied for the win, adding
                £{{ heroWinnerAmount.toFixed(2) }} to their season winnings.
              </span>
            </template>
            <template v-else-if="!loading && !detailsLoading">
              <span>
                {{ formattedHeroWinnerNames }}
                <template v-if="leadingRows.length">
                  scored {{ leadingRows[0].score }} points.
                </template>
              </span>
            </template>
            <p class="home-hero-sublabel home-hero-subtext">
              {{ summary.num_players }} played, {{ summary.snakes }} snakes,
              {{ summary.camels }} camels.
            </p>
          </template>
          <template v-else-if="!loading && !detailsLoading">
            No results yet.
          </template>
        </div>
      </div>
    </section>

    <nav v-if="competitionsForSeason.length > 1" class="f1-round-nav">
      <div class="f1-round-scroll">
        <button
          v-for="comp in competitionsForSeason
            .slice()
            .sort(
              (a, b) =>
                new Date(b.competition_date) - new Date(a.competition_date),
            )"
          :key="comp.id"
          type="button"
          class="f1-round-item"
          :class="{ active: selectedCompetitionId === comp.id }"
          @click="selectedCompetitionId = comp.id"
        >
          {{ formatWeekLabel(comp) }}
          <span
            v-if="selectedCompetitionId === comp.id"
            class="f1-round-line"
          ></span>
        </button>
      </div>
    </nav>

    <section class="results-shell">
      <div class="results-shell__body" style="min-height: 400px">
        <div v-if="loading || detailsLoading" class="page-stack">
          <div
            v-for="i in 5"
            :key="i"
            class="home-lead-stat"
            style="opacity: 0.5; height: 60px; animation: pulse 1.5s infinite"
          ></div>
        </div>
        <p v-else-if="error" class="empty-state">{{ error }}</p>
        <QuietList
          v-else
          :columns="columns"
          :hide-head="false"
          :rows="rows"
          empty-text="No results found for this competition."
        >
          <template #player="{ row }">
            <div class="player-cell player-cell--stacked">
              <span>{{ row.player }}</span>
              <div class="row-meta" v-if="row.snake || row.camel">
                <span v-if="row.snake" class="mini-pill mini-pill--snake"
                  >Snake</span
                >
                <span v-if="row.camel" class="mini-pill mini-pill--camel"
                  >Camel</span
                >
              </div>
            </div>
          </template>
        </QuietList>
      </div>
    </section>
  </section>
</template>
<style scoped>
.f1-round-nav {
  background: var(--bg);
  border-bottom: 1px solid var(--line);
  padding: 0.25rem 0;
}

.f1-round-scroll {
  display: flex;
  overflow-x: auto;
  padding: 0 1rem;
  gap: 0.25rem;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.f1-round-scroll::-webkit-scrollbar {
  display: none;
}

.f1-round-item {
  position: relative;
  background: var(--bg);
  border: none;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.6rem 0.75rem;
  min-width: 3.2rem;
  cursor: pointer;
  transition: color 0.2s;
}

.f1-round-item.active {
  color: var(--text);
  background: var(--bg);
}
</style>
