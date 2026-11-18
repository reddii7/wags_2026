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
      <h1>
        <span>The WAGS</span>
        <span>Sutton Coldfield Golf Club</span>
        <span>Two seasons</span>
      </h1>
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
  width: min(100%, 22rem);
  margin-inline: auto;
  text-align: center;
}

.welcome__copy h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(2.05rem, 8vw, 2.7rem);
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 1.08;
}

.welcome__copy h1 span {
  display: block;
}

.welcome__actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: stretch;
  gap: 0.7rem;
  width: 100%;
  margin-top: 1.6rem;
}

.pill {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  padding: 0.78rem 0.6rem;
  border: 0;
  border-radius: 999px;
  background: #1a1a1a;
  color: #f9f7f2;
  font: inherit;
  font-size: 1rem;
  font-weight: 650;
  text-align: center;
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
