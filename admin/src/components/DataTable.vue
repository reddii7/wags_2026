<script setup>
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  loading: Boolean,
  error: { type: String, default: "" },
});
</script>

<template>
  <p v-if="error" class="err">{{ error }}</p>
  <p v-else-if="loading" class="muted">Loading…</p>
  <div v-else-if="!rows.length" class="muted">No rows.</div>
  <div v-else class="wrap">
    <table class="tbl">
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.key">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="i">
          <td v-for="c in columns" :key="c.key" class="cell">
            <template v-if="typeof row[c.key] === 'object' && row[c.key] !== null">
              <code>{{ JSON.stringify(row[c.key]) }}</code>
            </template>
            <template v-else>{{ row[c.key] ?? "—" }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.wrap {
  overflow: auto;
  max-height: min(70vh, 640px);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
th,
td {
  text-align: left;
  padding: 0.4rem 0.55rem;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 1;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
}
.cell code {
  font-size: 0.72rem;
  word-break: break-all;
}
.err {
  margin: 0;
  color: #fecaca;
  font-size: 0.88rem;
}
.muted {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}
</style>
