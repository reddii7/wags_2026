<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { triggerHapticFeedback } from "../utils/haptics";

const props = defineProps({
  metadata: { type: Object, required: true },
});

const emit = defineEmits(["continue", "view-history"]);

const visible = ref(false);
const leaving = ref(false);

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

const storageKey = computed(() => {
  const id = closedSummer.value?.id;
  return id ? `wags_season_splash_dismissed_${id}` : "";
});

function shouldShow() {
  if (props.metadata?.loading) return false;
  if (!closedSummer.value) return false;
  if (!awards.value.length) return false;
  try {
    if (storageKey.value && localStorage.getItem(storageKey.value) === "1") {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

function refreshVisibility() {
  visible.value = shouldShow();
}

function dismiss(andEmit) {
  triggerHapticFeedback();
  leaving.value = true;
  try {
    if (storageKey.value) localStorage.setItem(storageKey.value, "1");
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    visible.value = false;
    leaving.value = false;
    andEmit?.();
  }, 280);
}

function onContinue() {
  dismiss(() => emit("continue"));
}

function onViewHistory() {
  dismiss(() => emit("view-history"));
}

onMounted(refreshVisibility);
watch(
  () => [
    props.metadata?.loading,
    props.metadata?.seasons,
    props.metadata?.awards,
  ],
  refreshVisibility,
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="season-splash"
      :class="{ 'season-splash--leaving': leaving }"
      role="dialog"
      aria-modal="true"
      aria-label="Season complete"
    >
      <div class="season-splash__atmosphere" aria-hidden="true"></div>
      <div class="season-splash__inner">
        <p class="season-splash__brand">WAGS</p>
        <h1 class="season-splash__title">{{ seasonTitle }}</h1>
        <p class="season-splash__lede">Season complete. Honour roll locked in.</p>

        <ul class="season-splash__roll">
          <li v-for="(row, idx) in awards" :key="row.type" :style="{ '--i': idx }">
            <span class="season-splash__award">{{ row.label }}</span>
            <strong class="season-splash__name">{{ row.player }}</strong>
          </li>
        </ul>

        <div class="season-splash__actions">
          <button type="button" class="season-splash__primary" @click="onContinue">
            Enter app
          </button>
          <button type="button" class="season-splash__secondary" @click="onViewHistory">
            View history
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.season-splash {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  overflow: auto;
  background: #121512;
  color: #f3f0e8;
  animation: splash-in 0.45s ease both;
}

.season-splash--leaving {
  animation: splash-out 0.28s ease both;
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

@keyframes splash-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes splash-out {
  to {
    opacity: 0;
    transform: scale(1.02);
  }
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
