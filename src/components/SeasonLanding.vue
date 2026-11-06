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
      <svg class="welcome__ball" viewBox="0 0 390 700" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="dimple" cx="34%" cy="30%" r="68%">
            <stop offset="0%" stop-color="#f8c6be" />
            <stop offset="46%" stop-color="#ee8b82" />
            <stop offset="100%" stop-color="#cf5c54" />
          </radialGradient>
          <pattern id="dimples" width="26" height="22.5" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="8.4" fill="url(#dimple)" />
            <circle cx="21" cy="19.2" r="8.4" fill="url(#dimple)" />
          </pattern>
        </defs>
        <rect width="390" height="700" fill="#e56f66" />
        <rect width="390" height="700" fill="url(#dimples)" />
        <g fill="none" stroke="#fff8f6" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.88">
          <path d="M248 28c62-10 112 28 104 82-8 52-58 78-112 64-58-15-78-72-48-112 16-22 36-30 56-34z" />
          <path d="M250 52c46-6 82 24 76 64-6 38-42 58-82 48-42-11-58-54-36-84 12-16 26-24 42-28z" />
          <path d="M252 78c28-4 50 16 46 42-4 24-26 36-50 30-26-7-36-34-22-52 8-10 16-16 26-20z" />
          <path d="M-16 168c48-36 96 18 154-8 52-24 96 22 150-6 28-14 62 8 96-8" />
          <path d="M-16 196c50-34 98 22 156-4 54-24 94 26 148-2 30-16 64 10 98-6" />
          <path d="M-16 226c52-30 100 26 158 0 56-26 92 30 146 2 32-16 66 12 100-4" />
          <path d="M8 292c52-28 108 8 150 36 36 24 28 62-8 78-40 18-78-8-104-36-22-24-58-46-38-78z" />
          <path d="M36 318c36-18 74 6 104 26 24 16 18 40-6 50-28 12-54-6-72-24-16-16-40-32-26-52z" />
          <path d="M-20 390c70-18 120 36 190 8 62-24 110 8 180-6 22-4 48 10 70-2" />
          <path d="M-20 416c74-8 124 48 196 14 64-30 108 18 176 2 24-6 46 16 72 4" />
          <path d="M-20 446c78 6 128 58 202 22 66-34 104 28 172 12 26-6 44 20 74 10" />
          <path d="M-20 478c80 18 130 64 206 30 68-32 100 36 168 22" />
          <path d="M210 404c46-8 78 18 86 52 6 28-16 36-40 28" />
          <path d="M228 422c28-4 48 14 52 34 4 16-10 22-24 16" />
          <path d="M-16 548c64-34 120 28 188-4 62-30 108 22 168-8 36-18 62 6 90-10" />
          <path d="M-16 578c66-30 122 32 190 0 64-30 106 26 166-4 38-18 64 8 92-8" />
          <path d="M-16 610c68-26 124 36 192 4 66-30 104 30 164 0 40-20 66 10 94-6" />
          <path d="M286 624c36-16 70 6 64 36-6 28-40 36-58 16-14-16-20-36-6-52z" />
          <path d="M300 644c22-8 42 6 38 22-4 16-24 20-34 8-8-8-12-22-4-30z" />
        </g>
      </svg>
      <svg class="welcome__curve" viewBox="0 0 400 100" preserveAspectRatio="none">
        <path
          class="welcome__wave"
          d="M0 18C36 6 78 0 118 8c48 10 86 28 132 52 36 18 78 28 150 16V100H0Z"
        />
      </svg>
    </div>

    <div class="welcome__sheet">
      <h1>Welcome</h1>
      <p>Summer is the main season. Winter is this week and Best 10.</p>
      <div class="welcome__actions">
        <button type="button" class="go" @click="choose('summer')">
          <span>Summer</span>
          <span class="go__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>
        <button type="button" class="go" @click="choose('winter')">
          <span>Winter</span>
          <span class="go__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: calc(100dvh - 5.6rem - env(safe-area-inset-bottom, 0px));
  background: #ffffff;
  color: #3c3c3c;
}

.welcome__theme {
  position: fixed;
  z-index: 35;
  top: calc(env(safe-area-inset-top, 0px) + 0.55rem);
  right: 0.85rem;
  background: #ffffff;
  color: #3c3c3c;
}

.welcome__art {
  position: relative;
  flex: 0 0 auto;
  height: calc((100dvh - 5.6rem - env(safe-area-inset-bottom, 0px)) * 0.64);
  overflow: hidden;
  line-height: 0;
  background: #e56f66;
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
  height: 23%;
  display: block;
}

.welcome__wave {
  fill: #ffffff;
}

.welcome__sheet {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 1.15rem 1.15rem 1.05rem 1.35rem;
  background: #ffffff;
}

.welcome__sheet h1 {
  margin: 0;
  color: #3c3c3c;
  font-family: var(--font-serif);
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.welcome__sheet p {
  margin: 0.7rem 0 0;
  max-width: 17.5rem;
  color: #a3a3a3;
  font-size: 0.92rem;
  line-height: 1.45;
}

.welcome__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.7rem;
  margin-top: auto;
  padding-top: 1rem;
}

.go {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #727272;
  font: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.go__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: #e56f66;
  color: #ffffff;
}

:global([data-theme="dark"] .welcome),
:global([data-theme="dark"] .welcome__sheet),
:global([data-theme="dark"] .welcome__wave) {
  background: #12151c;
  fill: #12151c;
}

:global([data-theme="dark"] .welcome__sheet h1) {
  color: #e8edf5;
}

:global([data-theme="dark"] .welcome__sheet p) {
  color: #e8edf58c;
}

:global([data-theme="dark"] .go) {
  color: #c8c8c8;
}
</style>
