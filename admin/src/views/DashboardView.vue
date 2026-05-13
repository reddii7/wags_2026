<script setup>
import { ref, watch, inject } from "vue";
import DataTable from "@/components/DataTable.vue";

const admin = inject("adminCtx");
const counts = ref([]);
const loading = ref(false);
const error = ref("");

const tables = [
  "members",
  "handicap_rules",
  "money_rules",
  "campaigns",
  "league_assignments",
  "rounds",
  "round_players",
  "weekly_prize_state",
  "handicap_snapshots",
];

async function load() {
  const sb = admin?.client?.value;
  if (!sb) {
    counts.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const out = [];
    for (const t of tables) {
      const { count, error: cErr } = await sb
        .from(t)
        .select("*", { count: "exact", head: true });
      if (cErr) throw cErr;
      out.push({ table: t, count: count ?? 0 });
    }
    counts.value = out;
  } catch (e) {
    error.value = e?.message || String(e);
    counts.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => admin?.client?.value,
  () => load(),
  { immediate: true },
);

const countColumns = [
  { key: "table", label: "Table" },
  { key: "count", label: "Rows" },
];
</script>

<template>
  <div class="view">
    <h1 class="h1">Overview</h1>
    <p class="lede">
      Row counts on the greenfield schema. Connect with the <strong>service role</strong> key in the header.
    </p>
    <p v-if="!admin?.client?.value" class="warn">Not connected.</p>
    <DataTable v-else :columns="countColumns" :rows="counts" :loading="loading" :error="error" />
  </div>
</template>

<style scoped>
.h1 {
  margin: 0 0 0.35rem;
  font-size: 1.15rem;
}
.lede {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}
.warn {
  color: #fcd34d;
  font-size: 0.88rem;
}
</style>
