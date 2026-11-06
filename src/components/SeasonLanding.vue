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
  <section class="welcome">
    <button
      type="button"
      class="theme-switch welcome__theme"
      :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="onToggleTheme"
    >
      {{ theme === "dark" ? "Light" : "Dark" }}
    </button>

    <div class="welcome__art" aria-hidden="true">
      <svg class="welcome__ball" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="ball-shade" cx="48%" cy="28%" r="78%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="62%" stop-color="#f4f1ea" />
            <stop offset="100%" stop-color="#e7efe4" />
          </radialGradient>
          <pattern id="ball-dimples" width="52" height="46" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="9" fill="#2f5d3a" fill-opacity="0.07" stroke="#2f5d3a" stroke-opacity="0.42" stroke-width="1.15" />
            <circle cx="40" cy="36" r="9" fill="#2f5d3a" fill-opacity="0.07" stroke="#2f5d3a" stroke-opacity="0.42" stroke-width="1.15" />
          </pattern>
        </defs>
        <rect width="400" height="400" fill="url(#ball-shade)" />
        <rect width="400" height="400" fill="url(#ball-dimples)" />
      </svg>
      <svg class="welcome__curve" viewBox="0 0 400 90" preserveAspectRatio="none">
        <path class="welcome__wave" d="M0 34c72 48 128-30 206-4 54 18 112-18 194 8v52H0Z" />
      </svg>
    </div>

    <div class="welcome__sheet">
      <h1>Welcome</h1>
      <p>Summer is the main season, with results and standings. Winter is this week and Best 10.</p>
      <div class="welcome__actions">
        <button type="button" class="go" @click="choose('summer')">
          <span>Continue to <strong>Summer</strong></span>
          <span class="go__mark" aria-hidden="true">→</span>
        </button>
        <button type="button" class="go" @click="choose('winter')">
          <span>Continue to <strong>Winter</strong></span>
          <span class="go__mark" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  min-height: calc(
    100dvh - env(safe-area-inset-top, 0px) - 5.6rem - env(safe-area-inset-bottom, 0px)
  );
  background: #ffffff;
  color: #1a1a1a;
}

.welcome__theme {
  position: fixed;
  z-index: 35;
  top: calc(env(safe-area-inset-top, 0px) + 0.7rem);
  right: 0.85rem;
  background: #ffffff;
}

.welcome__art {
  position: relative;
  flex: 1.05 1 0;
  min-height: 16rem;
  overflow: hidden;
  line-height: 0;
}

.welcome__ball {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.welcome__curve {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  width: 100%;
  height: 4.6rem;
  display: block;
}

.welcome__wave {
  fill: #ffffff;
}

.welcome__sheet {
  flex: 0.95 1 auto;
  display: flex;
  flex-direction: column;
  padding: 0.15rem 1.35rem 1.15rem;
  background: #ffffff;
}

.welcome__sheet h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(2rem, 7vw, 2.4rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.welcome__sheet p {
  margin: 0.7rem 0 0;
  max-width: 22rem;
  color: #1a1a1a8f;
  font-size: 0.98rem;
  line-height: 1.45;
}

.welcome__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.85rem;
  margin-top: auto;
  padding-top: 1.4rem;
}

.go {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #1a1a1a;
  font: inherit;
  font-size: 1rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.go strong {
  font-weight: 700;
  color: #2f5d3a;
}

.go__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.7rem;
  height: 2.7rem;
  border-radius: 50%;
  background: #2f5d3a;
  color: #ffffff;
  font-size: 1.15rem;
}

:global([data-theme="dark"] .welcome),
:global([data-theme="dark"] .welcome__sheet),
:global([data-theme="dark"] .welcome__wave) {
  background: #12151c;
  fill: #12151c;
}

:global([data-theme="dark"] .welcome__sheet) {
  color: #e8edf5;
}

:global([data-theme="dark"] .welcome__sheet p) {
  color: #e8edf58c;
}

:global([data-theme="dark"] .go) {
  color: #e8edf5;
}

:global([data-theme="dark"] .go strong),
:global([data-theme="dark"] .go__mark) {
  color: #12151c;
  background: #3dd68c;
}

:global([data-theme="dark"] .go strong) {
  background: transparent;
  color: #3dd68c;
}

:global([data-theme="dark"] .welcome__theme) {
  background: #12151c;
  color: #e8edf5;
}
</style>
