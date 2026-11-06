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
        <rect width="390" height="700" fill="#ef8986" />
        <g fill="none" stroke="#ffffff" stroke-linecap="round">
          <g stroke-width="1.35" stroke-opacity="0.9">
            <ellipse cx="48" cy="52" rx="78" ry="60" transform="rotate(-12 48 52)" />
            <ellipse cx="48" cy="52" rx="52" ry="40" transform="rotate(-12 48 52)" />
            <ellipse cx="48" cy="52" rx="28" ry="21" transform="rotate(-12 48 52)" />
            <ellipse cx="196" cy="24" rx="86" ry="64" transform="rotate(8 196 24)" />
            <ellipse cx="196" cy="24" rx="58" ry="43" transform="rotate(8 196 24)" />
            <ellipse cx="196" cy="24" rx="32" ry="23" transform="rotate(8 196 24)" />
            <ellipse cx="348" cy="78" rx="80" ry="62" transform="rotate(-6 348 78)" />
            <ellipse cx="348" cy="78" rx="54" ry="41" transform="rotate(-6 348 78)" />
            <ellipse cx="348" cy="78" rx="30" ry="22" transform="rotate(-6 348 78)" />
            <ellipse cx="18" cy="210" rx="74" ry="56" transform="rotate(10 18 210)" />
            <ellipse cx="18" cy="210" rx="48" ry="36" transform="rotate(10 18 210)" />
            <ellipse cx="118" cy="188" rx="82" ry="62" transform="rotate(-14 118 188)" />
            <ellipse cx="118" cy="188" rx="56" ry="42" transform="rotate(-14 118 188)" />
            <ellipse cx="118" cy="188" rx="30" ry="22" transform="rotate(-14 118 188)" />
            <ellipse cx="268" cy="168" rx="76" ry="58" transform="rotate(12 268 168)" />
            <ellipse cx="268" cy="168" rx="50" ry="38" transform="rotate(12 268 168)" />
            <ellipse cx="268" cy="168" rx="26" ry="19" transform="rotate(12 268 168)" />
            <ellipse cx="392" cy="214" rx="70" ry="52" transform="rotate(-8 392 214)" />
            <ellipse cx="392" cy="214" rx="44" ry="33" transform="rotate(-8 392 214)" />
            <ellipse cx="62" cy="348" rx="88" ry="66" transform="rotate(-8 62 348)" />
            <ellipse cx="62" cy="348" rx="60" ry="44" transform="rotate(-8 62 348)" />
            <ellipse cx="62" cy="348" rx="32" ry="23" transform="rotate(-8 62 348)" />
            <ellipse cx="210" cy="332" rx="80" ry="60" transform="rotate(14 210 332)" />
            <ellipse cx="210" cy="332" rx="54" ry="40" transform="rotate(14 210 332)" />
            <ellipse cx="210" cy="332" rx="28" ry="20" transform="rotate(14 210 332)" />
            <ellipse cx="352" cy="368" rx="84" ry="62" transform="rotate(-10 352 368)" />
            <ellipse cx="352" cy="368" rx="56" ry="42" transform="rotate(-10 352 368)" />
            <ellipse cx="352" cy="368" rx="30" ry="22" transform="rotate(-10 352 368)" />
            <ellipse cx="24" cy="500" rx="72" ry="54" transform="rotate(8 24 500)" />
            <ellipse cx="24" cy="500" rx="46" ry="34" transform="rotate(8 24 500)" />
            <ellipse cx="156" cy="488" rx="90" ry="66" transform="rotate(-12 156 488)" />
            <ellipse cx="156" cy="488" rx="62" ry="46" transform="rotate(-12 156 488)" />
            <ellipse cx="156" cy="488" rx="34" ry="24" transform="rotate(-12 156 488)" />
            <ellipse cx="304" cy="516" rx="78" ry="58" transform="rotate(10 304 516)" />
            <ellipse cx="304" cy="516" rx="52" ry="38" transform="rotate(10 304 516)" />
            <ellipse cx="304" cy="516" rx="26" ry="19" transform="rotate(10 304 516)" />
            <ellipse cx="80" cy="640" rx="76" ry="56" transform="rotate(-6 80 640)" />
            <ellipse cx="80" cy="640" rx="48" ry="36" transform="rotate(-6 80 640)" />
            <ellipse cx="230" cy="628" rx="84" ry="62" transform="rotate(8 230 628)" />
            <ellipse cx="230" cy="628" rx="56" ry="40" transform="rotate(8 230 628)" />
            <ellipse cx="370" cy="652" rx="70" ry="52" transform="rotate(-14 370 652)" />
            <ellipse cx="370" cy="652" rx="44" ry="32" transform="rotate(-14 370 652)" />
          </g>
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
  background: #ef8986;
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
  background: #ef8986;
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
