<script setup>
import { useTheme } from "../composables/useTheme.js";
import { triggerHapticFeedback } from "../utils/haptics";

defineProps({
  seasonLabel: { type: String, default: "" },
  seasonPress: { type: Boolean, default: false },
});

const emit = defineEmits(["season"]);

const { theme, toggleTheme } = useTheme();

function onTheme() {
  triggerHapticFeedback();
  toggleTheme();
}

function onSeason() {
  emit("season");
}
</script>

<template>
  <section class="hero-block home-hero journal-toolbar">
    <div class="journal-pills" role="toolbar" aria-label="Season and navigation">
      <button
        v-if="seasonLabel && seasonPress"
        type="button"
        class="journal-pill"
        @click="onSeason"
      >
        {{ seasonLabel }}
      </button>
      <span v-else-if="seasonLabel" class="journal-pill journal-pill--label">
        {{ seasonLabel }}
      </span>
      <button
        type="button"
        class="journal-pill"
        :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="onTheme"
      >
        {{ theme === "dark" ? "Light" : "Dark" }}
      </button>
      <slot />
    </div>
  </section>
</template>
