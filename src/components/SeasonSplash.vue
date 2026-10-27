<script setup>
import { computed } from "vue";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  metadata: { type: Object, required: true },
});

const emit = defineEmits(["winter", "season-stats"]);

const AWARD_ORDER = [
  { type: "championship", label: "Championship" },
  { type: "chumps", label: "Chumps" },
  { type: "best14", label: "Best 14" },
  { type: "rs_cup", label: "RS Cup" },
  { type: "league_1", label: "Premiership" },
  { type: "league_2", label: "Championship league" },
  { type: "league_3", label: "League One" },
  { type: "league_4", label: "League Two" },
];

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

const awards = computed(() => {
  const season = closedSummer.value;
  if (!season) return [];
  const byId = props.metadata?.awards?.[season.id];
  const byYear = props.metadata?.awards?.[String(season.start_year)];
  const list = Array.isArray(byId) ? byId : Array.isArray(byYear) ? byYear : [];
  const map = new Map(list.map((a) => [String(a.award_type || ""), a]));
  return AWARD_ORDER.map((meta) => {
    const row = map.get(meta.type);
    if (!row) return null;
    return { ...meta, player: row.player, notes: row.notes };
  }).filter(Boolean);
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

    <section class="home-dashboard" aria-label="Honour roll">
      <p v-if="!awards.length" class="empty-state">Loading honour roll…</p>

      <article
        v-for="row in awards"
        :key="row.type"
        class="honour-card"
        :class="`honour-card--${row.type}`"
      >
        <p class="honour-eyebrow">{{ row.label }}</p>
        <h3 class="honour-name">{{ row.player }}</h3>
      </article>
    </section>

    <section class="season-landing__actions" aria-label="Next steps">
      <button type="button" class="home-card row-button season-cta" @click="onWinter">
        <span class="home-hero-sublabel">Winter WAGS</span>
        <strong>Open winter season</strong>
      </button>
      <button
        type="button"
        class="home-card row-button season-cta"
        @click="onSeasonStats"
      >
        <span class="home-hero-sublabel">{{ seasonYear }} season stats</span>
        <strong>View results &amp; standings</strong>
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

.home-dashboard {
  display: grid;
  gap: 0.85rem;
}

.honour-card {
  padding: 1.15rem 1.2rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--line, #3a3a3c) 100%, transparent);
  background: var(--surface-2);
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
  color: var(--text);
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

.empty-state {
  margin: 0;
  color: var(--muted, #8e8e93);
  font-size: 0.92rem;
}
</style>
