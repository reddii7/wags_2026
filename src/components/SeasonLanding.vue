<script setup>
import { useTheme } from "../composables/useTheme.js";
import { triggerHapticFeedback } from "../utils/haptics";

const emit = defineEmits(["choose"]);
const { theme, toggleTheme } = useTheme();

function choose(season) {
  emit("choose", season);
}

function onToggleTheme() {
  triggerHapticFeedback();
  toggleTheme();
}
</script>

<template>
  <section class="season-landing">
    <button
      type="button"
      class="theme-switch season-landing__theme"
      :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="onToggleTheme"
    >
      {{ theme === "dark" ? "Light" : "Dark" }}
    </button>

    <button type="button" class="season-landing__choice" @click="choose('summer')">
      Summer
    </button>
    <button type="button" class="season-landing__choice" @click="choose('winter')">
      Winter
    </button>
  </section>
</template>

<style scoped>
.season-landing {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: calc(
    100dvh - env(safe-area-inset-top, 0px) - 5.6rem - env(safe-area-inset-bottom, 0px)
  );
  width: 100%;
}

.season-landing__theme {
  position: fixed;
  z-index: 35;
  top: calc(env(safe-area-inset-top, 0px) + 0.7rem);
  right: 0.85rem;
}

.season-landing__choice {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-serif);
  font-size: clamp(1.7rem, 6vw, 2.2rem);
  font-weight: 650;
  letter-spacing: -0.03em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.season-landing__choice + .season-landing__choice {
  border-left: 0.5px solid var(--line);
}

.season-landing__choice:active {
  background: var(--surface-1);
}
</style>
