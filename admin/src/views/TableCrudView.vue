<script setup>
import { ref, watch, inject } from "vue";
import { useRoute } from "vue-router";
import DataTable from "@/components/DataTable.vue";

const admin = inject("adminCtx");
const route = useRoute();
const rows = ref([]);
const loading = ref(false);
const error = ref("");

async function load() {
  rows.value = [];
  error.value = "";
  const sb = admin?.client?.value;
  if (!sb) return;
  const meta = route.meta?.crud;
  if (!meta?.table) {
    error.value = "Missing route meta.crud";
    return;
  }
  loading.value = true;
  try {
    let q = sb.from(meta.table).select(meta.select ?? "*").limit(meta.limit ?? 400);
    if (meta.order) {
      q = q.order(meta.order.column, {
        ascending: meta.order.ascending !== false,
      });
    }
    const { data, error: qerr } = await q;
    if (qerr) throw qerr;
    rows.value = data ?? [];
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [admin?.client?.value, route.fullPath],
  () => load(),
  { immediate: true },
);
</script>

<template>
  <div class="view">
    <h1 class="h1">{{ route.meta.title || "Table" }}</h1>
    <p v-if="!admin?.client?.value" class="warn">Connect with service role in the header first.</p>
    <DataTable
      v-else
      :columns="route.meta.crud.columns"
      :rows="rows"
      :loading="loading"
      :error="error"
    />
  </div>
</template>

<style scoped>
.view {
  max-width: 1200px;
}
.h1 {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
}
.warn {
  color: #fcd34d;
  font-size: 0.88rem;
}
</style>
