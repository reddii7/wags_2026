<script setup>
import { ref, onMounted, watch, computed } from "vue";
import { useCompetitions } from "./src/composables/useCompetitions";
import { useResultsSummary } from "./src/composables/useResultsSummary";
import QuietList from "./src/components/QuietList.vue";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const loading = ref(true);
const error = ref("");
const winners = ref([]);

const columns = [
  {
    key: "player",
    label: "PLAYER",
    className: "player",
    width: "minmax(0, 1fr)",
  },
  { key: "weeks", label: "WINS", className: "numeric narrow", width: "4.5rem" },
  { key: "amount", label: "TOTAL", className: "numeric", width: "6.5rem" },
];

const {
  summaries,
  loading: summariesLoading,
  error: summariesError,
  fetchSummaries,
} = useResultsSummary();

const {
  competitions,
  loading: competitionsLoading,
  error: competitionsError,
  fetchCompetitions,
} = useCompetitions();

async function loadWinners() {
  loading.value = true;
  error.value = "";
  winners.value = [];
  try {
    // Fetch all competitions for the season using composable
    await fetchCompetitions({ season: props.season });
    if (competitionsError.value) throw new Error(competitionsError.value);
    if (!competitions.value || !competitions.value.length) {
      loading.value = false;
      return;
    }

    // Use composable to fetch summaries
    const compIds = competitions.value.map((c) => c.id);
    await fetchSummaries({ competitionIds: compIds });
    if (summariesError.value) throw new Error(summariesError.value);

    // Only count outright winner weeks (exclude rollovers)
    const winnerMap = new Map();
    for (const summary of summaries.value) {
      if (summary.winner_type !== "winner") continue;
      if (!summary.winner_names || !Array.isArray(summary.winner_names))
        continue;
      for (const name of summary.winner_names) {
        if (!winnerMap.has(name)) {
          winnerMap.set(name, { player: name, weeks: 0, amount: 0 });
        }
        const entry = winnerMap.get(name);
        entry.weeks += 1;
        entry.amount += Number(summary.amount) || 0;
      }
    }
    winners.value = Array.from(winnerMap.values()).sort(
      (a, b) => b.amount - a.amount,
    );
  } catch (e) {
    if (e && typeof e === "object") {
      error.value = e.message || JSON.stringify(e);
      if (e.cause) error.value += `\nCause: ${e.cause}`;
    } else {
      error.value = String(e);
    }
  } finally {
    loading.value = false;
  }
}

onMounted(loadWinners);
watch(() => props.season?.id, loadWinners);
</script>

<template>
  <section class="page-stack">
    <h2 class="section-title">Champs league and prize money.</h2>
    <div v-if="loading" class="page-stack">
      <div
        style="height: 60px; opacity: 0.5; animation: pulse 1.5s infinite"
      ></div>
    </div>
    <p v-else-if="error" class="empty-state">{{ error }}</p>
    <QuietList
      v-else
      :columns="columns"
      :rows="winners"
      empty-text="No winners found for this season."
    >
      <template #amount="{ row }">
        £{{
          Number(row.amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        }}
      </template>
    </QuietList>
  </section>
</template>

<style scoped>
.section-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: 1rem;
}
</style>
