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
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">SEASON COMPLETE</span>
          <span>{{ seasonTitle }}</span>
          <p class="home-hero-sublabel home-hero-subtext">
            Honour roll locked in.
          </p>
        </div>
      </div>
    </section>

    <HonourRollList
      :metadata="metadata"
      :season="closedSummer"
      :show-notes="false"
      empty-text="Loading honour roll…"
    />

    <section class="season-landing__actions" aria-label="Next steps">
      <button type="button" class="home-card row-button season-cta" @click="onWeekHub">
        <span class="home-hero-sublabel">Week hub</span>
        <strong>Browse {{ seasonYear }} weeks</strong>
      </button>
      <button type="button" class="home-card row-button season-cta" @click="onWinter">
        <span class="home-hero-sublabel">Winter WAGS</span>
        <strong>Open winter season</strong>
      </button>
      <button
        type="button"
        class="home-card row-button season-cta"
        @click="onSeasonStats"
      >
        <span class="home-hero-sublabel">{{ seasonYear }} season</span>
        <strong>Honour roll &amp; champs</strong>
      </button>
    </section>
  </section>
</template>

<style scoped>
.season-landing {
  display: grid;
  gap: 1rem;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
}

.season-landing__actions {
  display: grid;
  gap: 0.65rem;
}

.season-cta {
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--surface-2);
}

.season-cta strong {
  display: block;
  margin-top: 0.15rem;
  font-family: var(--font-serif);
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text);
}
</style>
