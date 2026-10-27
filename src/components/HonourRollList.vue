<script setup>
import { computed } from "vue";
import { AWARD_ORDER, awardAccent } from "../lib/leagueTheme.js";

const props = defineProps({
  metadata: { type: Object, required: true },
  season: { type: Object, default: null },
  showNotes: { type: Boolean, default: true },
  emptyText: {
    type: String,
    default: "No season winners recorded for this campaign yet.",
  },
});

const rows = computed(() => {
  const season = props.season;
  if (!season) return [];
  const byId = props.metadata?.awards?.[season.id];
  const byYear = props.metadata?.awards?.[String(season.start_year)];
  const list = Array.isArray(byId) ? byId : Array.isArray(byYear) ? byYear : [];
  const map = new Map(list.map((a) => [String(a.award_type || ""), a]));
  return AWARD_ORDER.map((meta) => {
    const row = map.get(meta.type);
    if (!row) return null;
    return {
      ...meta,
      player: row.player,
      notes: row.notes,
      accent: awardAccent(meta.type),
    };
  }).filter(Boolean);
});
</script>

<template>
  <p v-if="!rows.length" class="empty-state">{{ emptyText }}</p>
  <div v-else class="honour-grid">
    <article
      v-for="row in rows"
      :key="row.type"
      class="honour-card"
      :style="{ '--award-accent': row.accent }"
    >
      <p class="honour-eyebrow">{{ row.label }}</p>
      <h3 class="honour-name">{{ row.player }}</h3>
      <p v-if="showNotes && row.notes" class="honour-notes">{{ row.notes }}</p>
    </article>
  </div>
</template>

<style scoped>
.honour-grid {
  display: grid;
  gap: 0.55rem;
}

.honour-card {
  position: relative;
  padding: 1rem 1rem 1rem 1.05rem;
  border-radius: 0;
  border: 0;
  border-left: 4px solid var(--award-accent, var(--f1-red, #e10600));
  background: var(--surface-2, #1f1f2b);
}

.honour-eyebrow {
  margin: 0 0 0.25rem;
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.honour-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #fff;
}

.honour-notes {
  margin: 0.4rem 0 0;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.88rem;
  line-height: 1.4;
}

.empty-state {
  margin: 0;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.92rem;
}
</style>
