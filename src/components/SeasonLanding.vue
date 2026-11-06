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
  <section class="welcome">
    <header class="welcome__bar">
      <p class="welcome__mark">WAGS</p>
      <button
        type="button"
        class="welcome__theme"
        :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="onToggleTheme"
      >
        {{ theme === "dark" ? "Light" : "Dark" }}
      </button>
    </header>

    <div class="welcome__copy">
      <h1>Welcome</h1>
      <p>Two seasons. Open the one you want.</p>
    </div>

    <div class="welcome__choices">
      <button type="button" class="season" @click="choose('summer')">
        <span class="season__text">
          <strong>Summer</strong>
          <small>Results, standings and fixtures</small>
        </span>
        <svg class="season__chev" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">
          <path d="M1 1.2 6.6 7 1 12.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button type="button" class="season" @click="choose('winter')">
        <span class="season__text">
          <strong>Winter</strong>
          <small>This week and Best 10</small>
        </span>
        <svg class="season__chev" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">
          <path d="M1 1.2 6.6 7 1 12.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding:
    calc(env(safe-area-inset-top, 0px) + 0.35rem)
    1.25rem
    calc(env(safe-area-inset-bottom, 0px) + 2rem);
  background: #f2f2f7;
  color: #1d1d1f;
}

.welcome__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 2.75rem;
}

.welcome__mark {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.welcome__theme {
  margin: 0;
  padding: 0.4rem 0.1rem;
  border: 0;
  background: transparent;
  color: #007aff;
  font: inherit;
  font-size: 1.05rem;
  font-weight: 400;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.welcome__copy {
  margin-top: 1.6rem;
}

.welcome__copy h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 2.15rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.welcome__copy p {
  margin: 0.45rem 0 0;
  max-width: 18rem;
  color: rgba(60, 60, 67, 0.6);
  font-size: 1.05rem;
  line-height: 1.35;
}

.welcome__choices {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-top: 1.85rem;
}

.season {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  margin: 0;
  padding: 1rem 1.05rem;
  border: 0;
  border-radius: 16px;
  background: #ffffff;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.season:active {
  opacity: 0.72;
}

.season__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.18rem;
  min-width: 0;
}

.season strong {
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.season small {
  color: rgba(60, 60, 67, 0.6);
  font-size: 0.95rem;
  line-height: 1.3;
}

.season__chev {
  flex: none;
  color: #c7c7cc;
}

:global([data-theme="dark"] .welcome) {
  background: #000000;
  color: #f5f5f7;
}

:global([data-theme="dark"] .welcome__theme) {
  color: #0a84ff;
}

:global([data-theme="dark"] .welcome__copy p),
:global([data-theme="dark"] .season small) {
  color: rgba(235, 235, 245, 0.6);
}

:global([data-theme="dark"] .season) {
  background: #1c1c1e;
}

:global([data-theme="dark"] .season__chev) {
  color: #636366;
}
</style>
