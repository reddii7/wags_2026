<script setup>
import { computed } from "vue";
import HonourRollList from "../components/HonourRollList.vue";

const props = defineProps({
  season: { type: Object, required: true },
  metadata: { type: Object, required: true },
});

const label = computed(
  () =>
    props.season?.label ||
    props.season?.name ||
    (props.season?.start_year
      ? `Season ${props.season.start_year}`
      : "Season"),
);
</script>

<template>
  <section class="page-stack history-page">
    <section class="hero-block home-hero">
      <div class="home-hero__intro">
        <div class="wags-headline">
          <span class="home-hero-sublabel2 wags-body">SEASON</span>
          <span>{{ label }}</span>
          <p class="home-hero-sublabel home-hero-subtext">Honour roll</p>
        </div>
      </div>
    </section>
    <HonourRollList :metadata="metadata" :season="season" />
  </section>
</template>

<style scoped>
.history-page {
  display: grid;
  gap: 1rem;
  padding: 0 0.15rem 1rem;
}
</style>
