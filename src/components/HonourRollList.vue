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
  gap: 0.85rem;
}

.honour-card {
  padding: 1.15rem 1.2rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--award-accent) 45%, var(--line));
  background: var(--surface-2);
}

.honour-eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted, #8e8e93);
}

.honour-name {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
}

.honour-notes {
  margin: 0.45rem 0 0;
  color: var(--muted, #8e8e93);
  font-size: 0.88rem;
  line-height: 1.4;
}

.empty-state {
  margin: 0;
  color: var(--muted, #8e8e93);
  font-size: 0.92rem;
}
</style>
