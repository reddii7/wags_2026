<script setup>
import { ref, onMounted, watch, computed } from "vue";
// Removed unused composables
import QuietList from "./src/components/QuietList.vue";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const loading = ref(true);
const error = ref("");
const winners = ref([]);

// Hydrate from metadata.winners if present
function hydrateFromMetadata() {
  const seasonId = props.season?.id;
  const seasonYear = String(props.season?.start_year);
  const winnersArr =
    props.metadata?.winners?.[seasonId] ||
    props.metadata?.winners?.[seasonYear] ||
    [];
  if (Array.isArray(winnersArr)) {
    winners.value = winnersArr.map((w, idx) => ({
      id: w.user_id || `${w.player}-${w.amount}-${idx}`,
      user_id: w.user_id || null,
      player: w.player,
      weeks: w.weeks,
      amount: w.amount,
    }));
    loading.value = false;
    return true;
  }
  return false;
}
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

// Removed unused composables

function loadWinners() {
  loading.value = true;
  error.value = "";
  winners.value = [];
  // Debug output
  // eslint-disable-next-line no-console
  console.log(
    "WinnersTable: season.id",
    props.season?.id,
    "season.start_year",
    props.season?.start_year,
    "metadata.winners keys",
    Object.keys(props.metadata?.winners || {}),
  );
  if (!hydrateFromMetadata()) {
    error.value = "No winners data found in metadata.";
  }
  loading.value = false;
}

onMounted(loadWinners);
watch([() => props.season?.id, () => props.season?.start_year], loadWinners);
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
