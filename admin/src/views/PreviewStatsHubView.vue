<script setup>
import { RouterLink } from "vue-router";
</script>

<template>
  <div class="view">
    <h1 class="h1">Member app · Stats hub (preview)</h1>
    <p class="lede">
      The PWA uses one <code>/stats</code> area with tabs. Here each tab is a separate route for easier admin wiring.
    </p>
    <ul class="links">
      <li><RouterLink to="/app/results">Results</RouterLink></li>
      <li><RouterLink to="/app/leagues">Leagues</RouterLink></li>
      <li><RouterLink to="/app/best14">Best 14</RouterLink></li>
    </ul>
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
.links {
  margin: 0;
  padding-left: 1.2rem;
  line-height: 1.8;
}
</style>
