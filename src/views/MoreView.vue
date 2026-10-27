<script setup>
import { computed } from "vue";
import { resolvePreferredSeason } from "../composables/useWeekResults.js";

const props = defineProps({
  metadata: { type: Object, required: true },
});
const emit = defineEmits(["navigate"]);

const preferred = computed(() => resolvePreferredSeason(props.metadata));

const links = computed(() => [
  {
    id: "handicaps",
    eyebrow: "Players",
    title: "Handicaps",
    action: { section: "handicaps" },
  },
  {
    id: "rscup",
    eyebrow: "Knockout",
    title: "RS Cup",
    action: { section: "rscup" },
  },
  {
    id: "season",
    eyebrow: "Archive",
    title: "Season honour & champs",
    action: {
      section: "season",
      tab: "history",
      seasonId: preferred.value?.id,
    },
  },
  {
    id: "standings",
    eyebrow: "Tables",
    title: "Leagues & Best 14",
    action: { section: "standings", tab: "leagues" },
  },
  {
    id: "week",
    eyebrow: "Latest round",
    title: "Week hub",
    action: { section: "week", seasonId: preferred.value?.id },
  },
]);
</script>

<template>
  <section class="page-stack more-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">MORE</span>
          <span>Club sections</span>
        </div>
      </div>
    </section>

    <section class="home-dashboard" aria-label="More">
      <button
        v-for="link in links"
        :key="link.id"
        type="button"
        class="home-card row-button more-link"
        @click="emit('navigate', link.action)"
      >
        <span class="home-hero-sublabel">{{ link.eyebrow }}</span>
        <strong>{{ link.title }}</strong>
      </button>
    </section>
  </section>
</template>

<style scoped>
.more-page {
  display: grid;
  gap: 1rem;
}

.more-link {
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 0;
  border-left: 4px solid var(--f1-red, #e10600);
  background: var(--surface-2);
}

.more-link strong {
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
