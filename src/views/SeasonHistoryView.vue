<script setup>
import { computed, watch } from "vue";

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

const championship = computed(() =>
  seasonAwards.value.find((a) => a.award_type === "championship") || null,
);

const chumps = computed(() =>
  seasonAwards.value.find((a) => a.award_type === "chumps") || null,
);

const seasonLabel = computed(() => {
  return (
    props.season?.label ||
    props.season?.name ||
    (props.season?.start_year ? `Season ${props.season.start_year}` : "Season")
  );
});

const hasAny = computed(() => Boolean(championship.value || chumps.value));

watch(
  () => [props.season?.id, props.metadata?.awards],
  () => {},
);
</script>

<template>
  <section class="page-stack history-page">
    <h2 class="section-title">Season history</h2>
    <p class="lede">{{ seasonLabel }} finals honour roll.</p>

    <p v-if="!hasAny" class="empty-state">
      No Championship or Chumps winners recorded for this season yet.
    </p>

    <div v-else class="honour-grid">
      <article v-if="championship" class="honour-card honour-card--championship">
        <p class="honour-eyebrow">Championship</p>
        <h3 class="honour-name">{{ championship.player }}</h3>
        <p v-if="championship.notes" class="honour-notes">{{ championship.notes }}</p>
      </article>

      <article v-if="chumps" class="honour-card honour-card--chumps">
        <p class="honour-eyebrow">Chumps</p>
        <h3 class="honour-name">{{ chumps.player }}</h3>
        <p v-if="chumps.notes" class="honour-notes">{{ chumps.notes }}</p>
      </article>
    </div>

    <p class="footnote">
      Weekly prize money leaders remain on the CHAMPS tab. This page is for finals day winners.
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
