<script setup>
import { useTheme } from "../composables/useTheme.js";
import { triggerHapticFeedback } from "../utils/haptics";

const emit = defineEmits(["choose"]);
const { theme, toggleTheme } = useTheme();

function choose(season) {
  triggerHapticFeedback();
  emit("choose", season);
}

function onToggleTheme() {
  triggerHapticFeedback();
  toggleTheme();
}
</script>

<template>
  <section class="welcome" :data-theme="theme">
    <button
      type="button"
      class="welcome__theme"
      :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="onToggleTheme"
    >
      {{ theme === "dark" ? "Light" : "Dark" }}
    </button>

    <div class="welcome__copy">
      <h1>Two seasons. Sutton Coldfield Golf Clubs' <em>best</em> society.</h1>
      <div class="welcome__actions">
        <button type="button" class="pill" @click="choose('summer')">Summer</button>
        <button type="button" class="pill pill--gold" @click="choose('winter')">Winter</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 100dvh;
  height: 100%;
  padding:
    calc(env(safe-area-inset-top, 0px) + 4.2rem)
    1.35rem
    calc(env(safe-area-inset-bottom, 0px) + 2rem);
  background: var(--bg);
  color: var(--text);
}

.welcome__theme {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 0.7rem);
  right: 1.1rem;
  margin: 0;
  padding: 0.45rem 0.85rem;
  border: 0.5px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.92rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.welcome__copy {
  width: 100%;
}

.welcome__copy h1 {
  margin: 0;
  max-width: 18rem;
  font-family: var(--font-serif);
  font-size: clamp(2.35rem, 9vw, 3.1rem);
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.welcome__copy h1 em {
  font-family: Georgia, "Iowan Old Style", Palatino, serif;
  font-style: italic;
  font-weight: 500;
  color: #c6a15a;
}

.welcome__actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.7rem;
  margin-top: 1.6rem;
}

.pill {
  margin: 0;
  padding: 0.78rem 1.2rem;
  border: 0;
  border-radius: 999px;
  background: #1a1a1a;
  color: #f9f7f2;
  font: inherit;
  font-size: 1rem;
  font-weight: 650;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.welcome[data-theme="dark"] .pill {
  background: #f4f1ea;
  color: #1a1a1a;
}

.pill--gold,
.welcome[data-theme="dark"] .pill--gold {
  background: #c6a15a;
  color: #ffffff;
}

.pill:active {
  opacity: 0.78;
}
</style>
