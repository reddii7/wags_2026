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
  <section class="season-splash" aria-label="Season complete">
    <div class="season-splash__atmosphere" aria-hidden="true"></div>
    <div class="season-splash__inner">
      <p class="season-splash__brand">WAGS</p>
      <h1 class="season-splash__title">{{ seasonTitle }}</h1>
      <p class="season-splash__lede">Season complete. Honour roll locked in.</p>

      <ul v-if="awards.length" class="season-splash__roll">
        <li v-for="(row, idx) in awards" :key="row.type" :style="{ '--i': idx }">
          <span class="season-splash__award">{{ row.label }}</span>
          <strong class="season-splash__name">{{ row.player }}</strong>
        </li>
      </ul>
      <p v-else class="season-splash__lede">Loading honour roll…</p>

      <div class="season-splash__actions">
        <button type="button" class="season-splash__primary" @click="onWinter">
          Winter WAGS
        </button>
        <button type="button" class="season-splash__secondary" @click="onSeasonStats">
          {{ seasonYear }} season stats
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.season-splash {
  position: relative;
  min-height: calc(100dvh - 5.5rem);
  display: grid;
  place-items: center;
  padding: 1.25rem;
  padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  overflow: auto;
  color: #f3f0e8;
  border-radius: 0;
  background: #121512;
}

.season-splash__atmosphere {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 55% at 50% -10%, rgba(88, 129, 87, 0.35), transparent 60%),
    radial-gradient(ellipse 70% 40% at 80% 100%, rgba(212, 175, 55, 0.12), transparent 55%),
    linear-gradient(180deg, #1a221c 0%, #121512 55%, #0d100e 100%);
  pointer-events: none;
}

.season-splash__inner {
  position: relative;
  width: min(100%, 26rem);
  display: grid;
  gap: 0.85rem;
  text-align: center;
}

.season-splash__brand {
  margin: 0;
  font-size: clamp(2.4rem, 10vw, 3.4rem);
  font-weight: 800;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  line-height: 1;
  animation: rise 0.55s ease both;
}

.season-splash__title {
  margin: 0;
  font-size: clamp(1.15rem, 4.2vw, 1.45rem);
  font-weight: 650;
  letter-spacing: -0.02em;
  animation: rise 0.55s ease 0.05s both;
}

.season-splash__lede {
  margin: 0;
  color: rgba(243, 240, 232, 0.68);
  font-size: 0.95rem;
  animation: rise 0.55s ease 0.1s both;
}

.season-splash__roll {
  list-style: none;
  margin: 0.65rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
  text-align: left;
}

.season-splash__roll li {
  display: grid;
  gap: 0.1rem;
  padding: 0.7rem 0.85rem;
  border-bottom: 1px solid rgba(243, 240, 232, 0.12);
  animation: rise 0.5s ease calc(0.12s + var(--i) * 0.04s) both;
}

.season-splash__award {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(243, 240, 232, 0.55);
}

.season-splash__name {
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.season-splash__actions {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.85rem;
  animation: rise 0.55s ease 0.35s both;
}

.season-splash__primary,
.season-splash__secondary {
  min-height: 2.85rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.season-splash__primary {
  background: #588157;
  color: #f7f4ec;
}

.season-splash__secondary {
  background: transparent;
  border-color: rgba(243, 240, 232, 0.22);
  color: #f3f0e8;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
