<script setup>
import { computed } from "vue";
import { triggerHapticFeedback } from "../utils/haptics";
import HonourRollList from "./HonourRollList.vue";

const props = defineProps({
  metadata: { type: Object, required: true },
});

const emit = defineEmits(["winter", "season-stats", "week-hub"]);

const closedSummer = computed(() => {
  const seasons = Array.isArray(props.metadata?.seasons)
    ? props.metadata.seasons
    : [];
  const closed = seasons
    .filter(
      (s) =>
        String(s?.kind || "") === "summer_main" &&
        String(s?.status || "").toLowerCase() === "closed",
    )
    .sort((a, b) => Number(b.start_year || 0) - Number(a.start_year || 0));
  return closed[0] || null;
});

const winterSeason = computed(() => {
  const seasons = Array.isArray(props.metadata?.seasons)
    ? props.metadata.seasons
    : [];
  return (
    seasons.find(
      (s) =>
        String(s?.kind || "") === "winter_reduced" &&
        String(s?.status || "").toLowerCase() === "open",
    ) ||
    seasons.find((s) => String(s?.kind || "") === "winter_reduced") ||
    null
  );
});

const seasonTitle = computed(() => {
  const s = closedSummer.value;
  if (!s) return "Season complete";
  return s.label || `Summer ${s.start_year}`;
});

const seasonYear = computed(() => closedSummer.value?.start_year || 2026);

function onWinter() {
  triggerHapticFeedback();
  emit("winter", winterSeason.value);
}

function onSeasonStats() {
  triggerHapticFeedback();
  emit("season-stats", closedSummer.value);
}

function onWeekHub() {
  triggerHapticFeedback();
  emit("week-hub", closedSummer.value);
}
</script>

<template>
  <section class="page-stack season-landing" aria-label="Season complete">
    <section class="season-hero" aria-label="Season headline">
      <p class="season-hero__eyebrow">Season complete</p>
      <h1 class="season-hero__title">{{ seasonTitle }}</h1>
      <p class="season-hero__sub">Honour roll locked in.</p>
      <div class="season-hero__stripe" aria-hidden="true"></div>
    </section>

    <HonourRollList
      :metadata="metadata"
      :season="closedSummer"
      :show-notes="false"
      empty-text="Loading honour roll…"
    />

    <section class="season-landing__actions" aria-label="Next steps">
      <button type="button" class="season-cta" @click="onWeekHub">
        <span class="season-cta__eyebrow">Race hub</span>
        <strong>Browse {{ seasonYear }} weeks</strong>
      </button>
      <button type="button" class="season-cta" @click="onWinter">
        <span class="season-cta__eyebrow">Winter WAGS</span>
        <strong>Open winter season</strong>
      </button>
      <button type="button" class="season-cta" @click="onSeasonStats">
        <span class="season-cta__eyebrow">{{ seasonYear }} season</span>
        <strong>Honour roll &amp; champs</strong>
      </button>
    </section>
  </section>
</template>

<style scoped>
.season-landing {
  display: grid;
  gap: 1.1rem;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
}

.season-hero {
  position: relative;
  margin: -0.2rem -0.15rem 0;
  padding: 1.35rem 1.05rem 1.2rem;
  background:
    linear-gradient(180deg, rgba(225, 6, 0, 0.22), transparent 62%),
    #12121a;
  overflow: hidden;
}

.season-hero__eyebrow {
  margin: 0 0 0.45rem;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--f1-red, #e10600);
}

.season-hero__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 1.6rem + 3vw, 2.9rem);
  font-weight: 800;
  line-height: 0.92;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #fff;
}

.season-hero__sub {
  margin: 0.65rem 0 0;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.58);
}

.season-hero__stripe {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  background: var(--f1-red, #e10600);
}

.season-landing__actions {
  display: grid;
  gap: 0.55rem;
}

.season-cta {
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 0;
  border-left: 4px solid var(--f1-red, #e10600);
  background: var(--surface-2);
  padding: 1rem 1rem 1rem 0.95rem;
  color: inherit;
}

.season-cta__eyebrow {
  display: block;
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.season-cta strong {
  display: block;
  margin-top: 0.2rem;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #fff;
}
</style>
