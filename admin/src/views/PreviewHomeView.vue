<script setup>
import { inject } from "vue";
const admin = inject("adminCtx");
</script>

<template>
  <div class="view">
    <h1 class="h1">Member app · Home (preview)</h1>
    <p class="lede">
      Mirrors the PWA home layout shape. Real data will come from <code>fetch-all-data</code> contract later; here you only check visuals.
    </p>
    <div class="card">
      <p class="week">WEEK — , —</p>
      <p class="hero">No results yet.</p>
      <div class="stats">
        <div class="stat"><span class="n">0</span><span class="l">Players</span></div>
        <div class="stat"><span class="n">0</span><span class="l">Snakes</span></div>
        <div class="stat"><span class="n">0</span><span class="l">Camels</span></div>
      </div>
    </div>
    <p v-if="admin?.client?.value" class="ok">Connected — add rounds in <strong>Data → Rounds / Scores</strong> to drive real previews later.</p>
  </div>
</template>

<style scoped>
.view {
  max-width: 560px;
}
.h1 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
.lede {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.lede code {
  font-size: 0.8em;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1.25rem;
}
.week {
  font-size: 0.75rem;
  color: var(--muted);
  letter-spacing: 0.06em;
  margin: 0 0 0.5rem;
}
.hero {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 0 1rem;
}
.stats {
  display: flex;
  gap: 1rem;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.n {
  font-size: 1.25rem;
  font-weight: 700;
}
.l {
  font-size: 0.75rem;
  color: var(--muted);
}
.ok {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #86efac;
}
</style>
