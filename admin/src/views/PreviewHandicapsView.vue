<script setup>
import { ref, watch, inject } from "vue";
import DataTable from "@/components/DataTable.vue";

const admin = inject("adminCtx");
const memberRows = ref([]);
const snapRows = ref([]);
const loading = ref(false);
const error = ref("");

const colMembers = [
  { key: "full_name", label: "Member" },
  { key: "initial_handicap_index", label: "Initial HCP" },
  { key: "handicap_index", label: "Current HCP" },
];

const colSnap = [
  { key: "round_date", label: "Round" },
  { key: "member", label: "Member" },
  { key: "handicap_before", label: "Before" },
  { key: "handicap_after", label: "After" },
];

async function load() {
  const sb = admin?.client?.value;
  if (!sb) return;
  loading.value = true;
  error.value = "";
  try {
    const { data: m, error: e1 } = await sb
      .from("members")
      .select("full_name, handicap_index, initial_handicap_index")
      .order("full_name", { ascending: true })
      .limit(300);
    if (e1) throw e1;
    memberRows.value = m ?? [];

    const { data: h, error: e2 } = await sb
      .from("handicap_snapshots")
      .select("handicap_before, handicap_after, members(full_name), rounds(round_date)")
      .order("round_id", { ascending: false })
      .limit(100);
    if (e2) throw e2;
    snapRows.value = (h ?? []).map((r) => ({
      round_date: r.rounds?.round_date ?? "—",
      member: r.members?.full_name ?? "—",
      handicap_before: r.handicap_before,
      handicap_after: r.handicap_after,
    }));
  } catch (e) {
    error.value = e?.message || String(e);
    memberRows.value = [];
    snapRows.value = [];
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
    <h1 class="h1">Member app · Handicaps (preview)</h1>
    <p class="lede">
      Handicap index lives directly on each member (initial + current). Snapshots record the
      before/after for every round finalize.
    </p>
    <p v-if="!admin?.client?.value" class="warn">Connect first.</p>
    <template v-else>
      <h2 class="h2">Members — handicap index</h2>
      <DataTable :columns="colMembers" :rows="memberRows" :loading :error />
      <h2 class="h2">Handicap snapshots</h2>
      <DataTable :columns="colSnap" :rows="snapRows" :loading="false" :error="''" />
    </template>
  </div>
</template>

<style scoped>
.h1 {
  font-size: 1.1rem;
  margin: 0 0 0.35rem;
}
.h2 {
  font-size: 0.95rem;
  margin: 1.25rem 0 0.5rem;
  color: var(--muted);
}
.lede {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.warn {
  color: #fcd34d;
}
</style>
