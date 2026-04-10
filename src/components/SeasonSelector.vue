<script setup>
import { triggerHapticFeedback } from "../utils/haptics";

const model = defineModel({ type: [String, Number], required: true });

defineProps({
  seasons: {
    type: Array,
    default: () => [],
  },
});

const handleSelectSeason = (seasonId) => {
  triggerHapticFeedback();
  model.value = seasonId;
};
</script>

<template>
  <div class="season-selector" role="tablist" aria-label="Season selector">
    <button
      v-for="season in seasons"
      :key="season.id"
      type="button"
      class="season-pill"
      :class="{ active: model === season.id }"
      @click="handleSelectSeason(season.id)"
    >
      {{ season.name || season.start_year }}
    </button>
  </div>
</template>
