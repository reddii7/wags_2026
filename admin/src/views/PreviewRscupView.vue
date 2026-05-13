<script setup>
import { ref, watch, inject } from "vue";
import DataTable from "@/components/DataTable.vue";

const admin = inject("adminCtx");
const rows = ref([]);
const loading = ref(false);
const error = ref("");

const columns = [
  { key: "round_date", label: "Date" },
  { key: "campaign", label: "Campaign" },
  { key: "finalized", label: "Finalized" },
];

async function load() {
  const sb = admin?.client?.value;
  if (!sb) return;
  loading.value = true;
  error.value = "";
  try {
    const { data, error: qerr } = await sb
      .from("rounds")
      .select("round_date, finalized, campaigns(label)")
      .eq("round_type", "rs_cup")
      .order("round_date", { ascending: false })
      .limit(50);
    if (qerr) throw qerr;
    rows.value = (data ?? []).map((r) => ({
      round_date: r.round_date,
      campaign: r.campaigns?.label ?? "—",
      finalized: r.finalized ? "Yes" : "No",
    }));
  } catch (e) {
    error.value = e?.message || String(e);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => admin?.client?.value,
  () => load(),
  { immediate: true },
);
</script>

<template>
  <div class="view">
    <h1 class="h1">Member app · RS Cup (preview)</h1>
    <p class="lede">
      RS Cup rounds (type = <code>rs_cup</code>). A draw/bracket table is not in the current schema
      — add it when the RS Cup feature is built.
    </p>
    <p v-if="!admin?.client?.value" class="warn">Connect first.</p>
    <DataTable v-else :columns :rows :loading :error />
  </div>
</template>

<style scoped>
.h1 {
  font-size: 1.1rem;
  margin: 0 0 0.35rem;
}
.lede {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.lede code {
  font-size: 0.8em;
}
.warn {
  color: #fcd34d;
}
</style>
