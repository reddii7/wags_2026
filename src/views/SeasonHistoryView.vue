<script setup>
import { computed } from "vue";

const AWARD_ORDER = [
  { type: "championship", label: "Championship" },
  { type: "chumps", label: "Chumps" },
  { type: "best14", label: "Best 14" },
  { type: "league_1", label: "Premiership" },
  { type: "league_2", label: "Championship league" },
  { type: "league_3", label: "League One" },
  { type: "league_4", label: "League Two" },
  { type: "rs_cup", label: "RS Cup" },
];

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const seasonAwards = computed(() => {
  const seasonId = props.season?.id;
  const seasonYear = String(props.season?.start_year ?? "");
  const byId = props.metadata?.awards?.[seasonId];
  const byYear = props.metadata?.awards?.[seasonYear];
  const list = Array.isArray(byId) ? byId : Array.isArray(byYear) ? byYear : [];
  return list;
});

const honourRows = computed(() => {
  const byType = new Map(
    seasonAwards.value.map((a) => [String(a.award_type || ""), a]),
  );
  return AWARD_ORDER.map((meta) => {
    const row = byType.get(meta.type);
    if (!row) return null;
    return {
      type: meta.type,
      label: meta.label,
      player: row.player,
      notes: row.notes,
    };
  }).filter(Boolean);
});

const seasonLabel = computed(() => {
  return (
    props.season?.label ||
    props.season?.name ||
    (props.season?.start_year ? `Season ${props.season.start_year}` : "Season")
  );
});

const hasAny = computed(() => honourRows.value.length > 0);
</script>

<template>
  <section class="page-stack history-page">
    <h2 class="section-title">Season history</h2>
    <p class="lede">{{ seasonLabel }} honour roll.</p>

    <p v-if="!hasAny" class="empty-state">
      No season winners recorded for this campaign yet.
    </p>

    <div v-else class="honour-grid">
      <article
        v-for="row in honourRows"
        :key="row.type"
        class="honour-card"
        :class="`honour-card--${row.type}`"
      >
        <p class="honour-eyebrow">{{ row.label }}</p>
        <h3 class="honour-name">{{ row.player }}</h3>
        <p v-if="row.notes" class="honour-notes">{{ row.notes }}</p>
      </article>
    </div>

    <p class="footnote">
      Weekly prize-money leaders remain on the CHAMPS tab. This page is the permanent season record.
    </p>
  </section>
</template>

<style scoped>
.history-page {
  display: grid;
  gap: 1rem;
}

.section-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0;
}

.lede,
.footnote,
.empty-state {
  margin: 0;
  color: var(--muted, #8e8e93);
  font-size: 0.92rem;
  line-height: 1.45;
}

.honour-grid {
  display: grid;
  gap: 0.85rem;
}

.honour-card {
  padding: 1.15rem 1.2rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--line, #3a3a3c) 100%, transparent);
  background: color-mix(in srgb, var(--surface, #2c2c2e) 92%, transparent);
}

.honour-card--championship {
  border-color: color-mix(in srgb, #d4af37 45%, var(--line, #3a3a3c));
}

.honour-card--chumps {
  border-color: color-mix(in srgb, #8ecae6 40%, var(--line, #3a3a3c));
}

.honour-card--best14,
.honour-card--rs_cup {
  border-color: color-mix(in srgb, #90be6d 40%, var(--line, #3a3a3c));
}

.honour-card--league_1,
.honour-card--league_2,
.honour-card--league_3,
.honour-card--league_4 {
  border-color: color-mix(in srgb, #adb5bd 35%, var(--line, #3a3a3c));
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
}

.honour-notes {
  margin: 0.45rem 0 0;
  color: var(--muted, #8e8e93);
  font-size: 0.88rem;
  line-height: 1.4;
}
</style>
